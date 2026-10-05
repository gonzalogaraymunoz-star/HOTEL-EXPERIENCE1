const ROOT_FOLDER_ID=String(process.env.RESERVATION_DRIVE_ROOT_FOLDER_ID||'').trim();
const DRIVE_FOLDER='application/vnd.google-apps.folder';

export const RESERVATION_ARCHIVE_FOLDERS={
  quote:'01_COTIZACION',
  itinerary:'02_ITINERARIO',
  payment:'03_PAGO',
  reservation:'04_RESERVA',
  receipt:'05_COMPROBANTE_PAGO',
  risk:'06_HOJAS_RIESGO',
  passenger:'07_ANTECEDENTES_PAX',
  operations:'08_OPERACION',
  other:'09_OTROS',
};

let cachedDriveToken='';
let cachedDriveTokenExpiresAt=0;
function hasDriveCredentials(){
  if(String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN||'').trim())return true;
  return Boolean(String(process.env.GOOGLE_DRIVE_CLIENT_ID||'').trim()&&String(process.env.GOOGLE_DRIVE_CLIENT_SECRET||'').trim()&&String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN||'').trim());
}
async function driveToken(){
  const staticToken=String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN||'').trim();
  if(staticToken)return staticToken;
  if(cachedDriveToken&&Date.now()<cachedDriveTokenExpiresAt-60000)return cachedDriveToken;
  const clientId=String(process.env.GOOGLE_DRIVE_CLIENT_ID||'').trim();
  const clientSecret=String(process.env.GOOGLE_DRIVE_CLIENT_SECRET||'').trim();
  const refreshToken=String(process.env.GOOGLE_DRIVE_REFRESH_TOKEN||'').trim();
  if(!clientId||!clientSecret||!refreshToken)return '';
  const body=new URLSearchParams({client_id:clientId,client_secret:clientSecret,refresh_token:refreshToken,grant_type:'refresh_token'});
  const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw Object.assign(new Error(`No se pudo renovar la credencial de Google Drive: ${data.error_description||data.error||response.status}`),{code:'credentials_required'});
  cachedDriveToken=String(data.access_token);
  cachedDriveTokenExpiresAt=Date.now()+Math.max(60,Number(data.expires_in||3600))*1000;
  return cachedDriveToken;
}
function safeName(value=''){return String(value||'').replace(/[\\/:*?"<>|]+/g,'_').replace(/\s+/g,' ').trim().slice(0,160)||'ARCHIVO'}
function esc(value=''){return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'")}
function driveUrl(id){return `https://drive.google.com/drive/folders/${id}`}
function fileDriveUrl(id){return `https://drive.google.com/open?id=${id}`}

async function driveRequest(url,options={}){
  const token=await driveToken();
  if(!token)throw Object.assign(new Error('GOOGLE_DRIVE_ACCESS_TOKEN no configurado en Vercel.'),{code:'credentials_required'});
  const response=await fetch(url,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}});
  if(!response.ok){
    const body=(await response.text()).slice(0,900);
    const error=new Error(`Drive API ${response.status}: ${body}`);
    error.code=response.status===401||response.status===403||response.status===404?'permission_required':'drive_error';
    throw error;
  }
  return response;
}

async function findChild(parentId,name,mimeType=DRIVE_FOLDER){
  const q=[
    `'${esc(parentId)}' in parents`,
    `name = '${esc(name)}'`,
    'trashed = false',
    mimeType?`mimeType = '${esc(mimeType)}'`:''
  ].filter(Boolean).join(' and ');
  const params=new URLSearchParams({q,spaces:'drive',pageSize:'20',fields:'files(id,name,mimeType,webViewLink,parents)'});
  const response=await driveRequest(`https://www.googleapis.com/drive/v3/files?${params.toString()}`);
  const body=await response.json();
  return (body.files||[])[0]||null;
}

async function createFolder(parentId,name){
  const response=await driveRequest('https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,parents',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({name:safeName(name),mimeType:DRIVE_FOLDER,parents:[parentId]})
  });
  return response.json();
}

async function ensureChildFolder(parentId,name){
  return (await findChild(parentId,name))||createFolder(parentId,name);
}

async function updateLeadFolderState(admin,leadId,patch){
  await admin.from('leads').update({...patch,updated_at:new Date().toISOString()}).eq('id',leadId);
}

export async function ensureReservationDriveFolder(admin,leadId,{createAllCategories=false}={}){
  const {data:lead,error}=await admin.from('leads')
    .select('id,codigo,reserva,reservation_reference,reservation_drive_folder_id,reservation_drive_folder_url,reservation_drive_folder_status')
    .eq('id',leadId).single();
  if(error)throw error;
  if(lead.reservation_drive_folder_status==='ready'&&lead.reservation_drive_folder_id){
    if(createAllCategories){
      for(const name of Object.values(RESERVATION_ARCHIVE_FOLDERS))await ensureChildFolder(lead.reservation_drive_folder_id,name);
    }
    return{lead,folderId:lead.reservation_drive_folder_id,url:lead.reservation_drive_folder_url||driveUrl(lead.reservation_drive_folder_id),status:'ready'};
  }
  if(!ROOT_FOLDER_ID){
    const message='RESERVATION_DRIVE_ROOT_FOLDER_ID no configurado.';
    await updateLeadFolderState(admin,leadId,{reservation_drive_folder_status:'blocked',reservation_drive_folder_error:message});
    return{lead,folderId:null,url:null,status:'blocked',error:message};
  }
  if(!hasDriveCredentials()){
    const message='Drive pendiente: falta una credencial de servidor con permiso de edición sobre la carpeta madre.';
    await updateLeadFolderState(admin,leadId,{reservation_drive_folder_status:'blocked',reservation_drive_folder_error:message});
    return{lead,folderId:null,url:null,status:'blocked',error:message};
  }
  try{
    const code=safeName(lead.codigo||lead.reserva||lead.id);
    const root=(await findChild(ROOT_FOLDER_ID,code))||await createFolder(ROOT_FOLDER_ID,code);
    if(createAllCategories){
      for(const name of Object.values(RESERVATION_ARCHIVE_FOLDERS))await ensureChildFolder(root.id,name);
    }
    const now=new Date().toISOString(),url=root.webViewLink||driveUrl(root.id);
    await updateLeadFolderState(admin,leadId,{
      reservation_drive_folder_id:root.id,
      reservation_drive_folder_url:url,
      reservation_drive_folder_status:'ready',
      reservation_drive_folder_error:null,
      reservation_drive_folder_synced_at:now
    });
    return{lead:{...lead,reservation_drive_folder_id:root.id,reservation_drive_folder_url:url,reservation_drive_folder_status:'ready'},folderId:root.id,url,status:'ready'};
  }catch(error){
    const message=String(error?.message||error).slice(0,1200);
    await updateLeadFolderState(admin,leadId,{reservation_drive_folder_status:'blocked',reservation_drive_folder_error:message});
    return{lead,folderId:null,url:null,status:'blocked',error:message};
  }
}

function extractDriveId(url=''){
  const value=String(url||'');
  return value.match(/\/d\/([A-Za-z0-9_-]{20,})/)?.[1]||value.match(/[?&]id=([A-Za-z0-9_-]{20,})/)?.[1]||null;
}

async function uploadDriveBuffer(parentId,name,mimeType,buffer){
  const boundary='link_reservation_'+Date.now().toString(36);
  const metadata=Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({name:safeName(name),parents:[parentId]})}\r\n--${boundary}\r\nContent-Type: ${mimeType||'application/octet-stream'}\r\n\r\n`);
  const footer=Buffer.from(`\r\n--${boundary}--`);
  const body=Buffer.concat([metadata,Buffer.from(buffer),footer]);
  const response=await driveRequest('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,webViewLink',{
    method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body
  });
  return response.json();
}

async function copyDriveFile(sourceId,parentId,name){
  const response=await driveRequest(`https://www.googleapis.com/drive/v3/files/${sourceId}/copy?supportsAllDrives=true&fields=id,name,mimeType,webViewLink`,{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:safeName(name),parents:[parentId]})
  });
  return response.json();
}

function categoryFor(doc){
  if(doc.archive_category&&RESERVATION_ARCHIVE_FOLDERS[doc.archive_category])return doc.archive_category;
  const type=String(doc.document_type||'').toLowerCase();
  if(type.includes('quote')||type.includes('cotiz'))return'quote';
  if(type.includes('itiner'))return'itinerary';
  if(type.includes('payment_link')||type==='payment')return'payment';
  if(type.includes('receipt')||type.includes('comprobante'))return'receipt';
  if(type.includes('risk'))return'risk';
  if(type.includes('passenger')||type.includes('pax')||type.includes('document'))return'passenger';
  if(type.includes('reservation')||type.includes('reserva'))return'reservation';
  if(type.includes('operation'))return'operations';
  return'other';
}

async function documentBytes(admin,doc){
  const bucket=doc.storage_bucket||doc.risk_data?.storage_bucket;
  const path=doc.storage_path||doc.risk_data?.storage_path;
  if(bucket&&path){
    const {data,error}=await admin.storage.from(bucket).download(path);
    if(error)throw error;
    return{buffer:Buffer.from(await data.arrayBuffer()),mimeType:data.type||'application/octet-stream',fileName:path.split('/').pop()||doc.title};
  }
  return null;
}

export async function archiveReservationDocument(admin,documentId){
  const {data:doc,error}=await admin.from('reservation_documents').select('*').eq('id',documentId).single();
  if(error)throw error;
  const folder=await ensureReservationDriveFolder(admin,doc.lead_id);
  if(folder.status!=='ready'){
    await admin.from('reservation_documents').update({drive_sync_status:'blocked',drive_sync_error:folder.error||'Carpeta Drive no disponible'}).eq('id',doc.id);
    return{status:'blocked',error:folder.error};
  }
  try{
    const category=categoryFor(doc),categoryName=RESERVATION_ARCHIVE_FOLDERS[category]||RESERVATION_ARCHIVE_FOLDERS.other;
    const categoryFolder=await ensureChildFolder(folder.folderId,categoryName);
    const stored=await documentBytes(admin,doc);
    let driveFile;
    if(stored){
      driveFile=await uploadDriveBuffer(categoryFolder.id,stored.fileName,stored.mimeType,stored.buffer);
    }else{
      const sourceId=extractDriveId(doc.url||'');
      if(sourceId){
        driveFile=await copyDriveFile(sourceId,categoryFolder.id,doc.title||doc.document_type||'Documento');
      }else if(doc.url){
        const text=Buffer.from(`${doc.title||'Enlace'}\n${doc.url}\n`,'utf8');
        driveFile=await uploadDriveBuffer(categoryFolder.id,`${safeName(doc.title||doc.document_type)}.txt`,'text/plain',text);
      }else{
        throw Object.assign(new Error('El documento está registrado pero todavía no tiene archivo ni URL para copiar a Drive.'),{code:'source_missing'});
      }
    }
    const now=new Date().toISOString(),url=driveFile.webViewLink||fileDriveUrl(driveFile.id);
    await admin.from('reservation_documents').update({
      drive_file_id:driveFile.id,drive_url:url,drive_sync_status:'ready',drive_sync_error:null,archive_category:category,updated_at:now
    }).eq('id',doc.id);
    await updateLeadFolderState(admin,doc.lead_id,{reservation_drive_folder_synced_at:now});
    return{status:'ready',driveFileId:driveFile.id,driveUrl:url,folderUrl:folder.url};
  }catch(error){
    const message=String(error?.message||error).slice(0,1200);
    await admin.from('reservation_documents').update({drive_sync_status:'blocked',drive_sync_error:message,updated_at:new Date().toISOString()}).eq('id',doc.id);
    return{status:'blocked',error:message,folderUrl:folder.url};
  }
}

export async function syncPendingReservationDocuments(admin,{leadId=null,limit=100}={}){
  let query=admin.from('reservation_documents').select('id,lead_id').in('drive_sync_status',['pending','blocked','error']).order('created_at',{ascending:true}).limit(limit);
  if(leadId)query=query.eq('lead_id',leadId);
  const {data,error}=await query;
  if(error)throw error;
  const results=[];
  for(const row of data||[])results.push({id:row.id,leadId:row.lead_id,...await archiveReservationDocument(admin,row.id)});
  return results;
}
