import {createClient} from '@supabase/supabase-js';

export const config={maxDuration:60};

const SOURCE_KEY='hotel-experience-service-providers-drive';

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración Supabase incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

function isCronRequest(req){
  const secret=String(process.env.CRON_SECRET||'');
  const header=String(req.headers.authorization||'');
  return Boolean(secret&&header===`Bearer ${secret}`);
}

function normalize(value=''){
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g,' ')
    .trim()
    .toLowerCase();
}

function rutDigits(value=''){
  return String(value).replace(/[^0-9kK]/g,'').toLowerCase();
}

function folderIdFromUrl(url=''){
  return String(url).match(/\/folders\/([-_a-zA-Z0-9]+)/)?.[1]||null;
}

async function listDriveFiles(folderId){
  const token=String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN||'').trim();
  const apiKey=String(process.env.GOOGLE_DRIVE_API_KEY||'').trim();
  if(!token&&!apiKey){
    return {ok:false,status:'credentials_required',error:'Google Drive server credential is not configured in Vercel.',files:[]};
  }

  const files=[];
  let pageToken='';

  do{
    const params=new URLSearchParams({
      q:`'${folderId}' in parents and trashed = false`,
      orderBy:'modifiedTime desc',
      pageSize:'100',
      fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,size)'
    });
    if(apiKey)params.set('key',apiKey);
    if(pageToken)params.set('pageToken',pageToken);

    const response=await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`,{
      headers:token?{Authorization:`Bearer ${token}`}:{}
    });

    if(!response.ok){
      const detail=(await response.text()).slice(0,800);
      const status=response.status===401||response.status===403?'permission_required':'error';
      return {ok:false,status,error:`Drive API ${response.status}: ${detail}`,files:[]};
    }

    const data=await response.json();
    files.push(...(data.files||[]));
    pageToken=data.nextPageToken||'';
  }while(pageToken&&files.length<1000);

  return {ok:true,status:'ready',error:null,files};
}

function findPersonForFile(file,people){
  const name=normalize(file.name||'');
  if(!name)return null;

  const rutMatches=people.filter(person=>{
    const r=rutDigits(person.rut||'');
    return r.length>=8&&name.replace(/\s/g,'').includes(r);
  });
  if(rutMatches.length===1)return rutMatches[0];

  const nameMatches=people.filter(person=>{
    const full=normalize(person.full_name||'');
    if(full.length<5)return false;
    return name.includes(full);
  });
  if(nameMatches.length===1)return nameMatches[0];

  return null;
}

async function persistSources(admin,files,people){
  const now=new Date().toISOString();
  let linked=0;
  const touched=new Set();

  for(const file of files){
    const person=findPersonForFile(file,people);
    if(!person)continue;

    const url=file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`;
    const row={
      entity_type:'person',
      entity_id:person.id,
      source_kind:'drive',
      external_id:file.id,
      title:file.name||person.full_name,
      url,
      query_text:person.full_name,
      observed_at:now,
      metadata:{
        origin:'vercel_provider_drive_sync',
        mime_type:file.mimeType||null,
        modified_time:file.modifiedTime||null,
        thumbnail_link:file.thumbnailLink||null,
        size:file.size||null
      },
      updated_at:now
    };

    const {error}=await admin.from('operational_entity_sources')
      .upsert(row,{onConflict:'entity_type,entity_id,url'});
    if(error)throw error;
    linked++;
    touched.add(person.id);
  }

  if(touched.size){
    const {error}=await admin.from('service_people')
      .update({drive_sync_status:'synced',drive_last_synced_at:now,updated_at:now})
      .in('id',[...touched]);
    if(error)throw error;
  }

  return {linked,people_touched:touched.size};
}

async function run(admin){
  const checkedAt=new Date().toISOString();
  const {data:source,error:sourceError}=await admin.from('operational_source_folders')
    .select('*')
    .eq('source_key',SOURCE_KEY)
    .single();
  if(sourceError||!source)throw sourceError||new Error('No existe la fuente Drive de prestadores.');

  const folderId=source.folder_external_id||folderIdFromUrl(source.folder_url);
  if(!folderId)throw new Error('La carpeta Drive no tiene un ID válido.');

  const drive=await listDriveFiles(folderId);

  if(!drive.ok){
    await admin.from('operational_source_folders').update({
      sync_status:drive.status,
      last_checked_at:checkedAt,
      last_error:drive.error,
      updated_at:checkedAt,
      metadata:{
        ...(source.metadata||{}),
        last_runner:'vercel_cron',
        files_seen:0
      }
    }).eq('id',source.id);

    return {ok:false,status:drive.status,files_seen:0,linked_sources:0};
  }

  const {data:people,error:peopleError}=await admin.from('service_people')
    .select('id,full_name,rut,updated_at')
    .eq('active',true);
  if(peopleError)throw peopleError;

  const synced=await persistSources(admin,drive.files,people||[]);

  await admin.from('operational_source_folders').update({
    sync_status:'ready',
    last_checked_at:checkedAt,
    last_success_at:checkedAt,
    last_error:null,
    updated_at:checkedAt,
    metadata:{
      ...(source.metadata||{}),
      last_runner:'vercel_cron',
      files_seen:drive.files.length,
      linked_sources:synced.linked,
      people_touched:synced.people_touched
    }
  }).eq('id',source.id);

  return {
    ok:true,
    status:'ready',
    files_seen:drive.files.length,
    linked_sources:synced.linked,
    people_touched:synced.people_touched
  };
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});
  if(!isCronRequest(req))return res.status(401).json({error:'No autorizado'});

  try{
    const result=await run(setup());
    return res.status(result.ok?200:202).json(result);
  }catch(error){
    const message=String(error?.message||error).slice(0,1200);
    try{
      const admin=setup();
      await admin.from('operational_source_folders').update({
        sync_status:'error',
        last_checked_at:new Date().toISOString(),
        last_error:message,
        updated_at:new Date().toISOString()
      }).eq('source_key',SOURCE_KEY);
    }catch{}
    return res.status(500).json({ok:false,status:'error',error:message});
  }
}
