import {createClient} from '@supabase/supabase-js';

export const config={maxDuration:60};

const SOURCE_KEY='hotel-experience-service-providers-drive';
const DOC_KEYS=['identity','sernatur','first_aid','driver_license','certification'];

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración Supabase incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

function isCronRequest(req){
  const secret=String(process.env.CRON_SECRET||'');
  return Boolean(secret&&String(req.headers.authorization||'')===`Bearer ${secret}`);
}

function driveAuth(){
  const token=String(process.env.GOOGLE_DRIVE_ACCESS_TOKEN||'').trim();
  if(!token)return null;
  return {Authorization:`Bearer ${token}`};
}

function normalize(value=''){
  return String(value)
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-zA-Z0-9]+/g,' ').trim().toLowerCase();
}

function escapeQ(value=''){
  return String(value).replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function nameTerms(name=''){
  return String(name).trim().split(/\s+/).filter(x=>x.length>=3).slice(0,4);
}

function personQueries(person){
  const terms=nameTerms(person.full_name);
  const nameClause=terms.length?terms.map(t=>`fullText contains '${escapeQ(t)}'`).join(' and '):'';
  const base=[];
  if(nameClause)base.push({kind:'historical',q:nameClause,label:'nombre completo'});
  if(person.rut)base.push({kind:'identity',q:`fullText contains '${escapeQ(person.rut)}'`,label:'RUT'});
  if(person.sernatur_registration)base.push({kind:'sernatur',q:`fullText contains '${escapeQ(person.sernatur_registration)}'`,label:'registro SERNATUR'});
  if(nameClause){
    base.push({kind:'driver_license',q:`${nameClause} and (fullText contains 'licencia' or fullText contains 'conducir')`,label:'licencia de conducir'});
    base.push({kind:'first_aid',q:`${nameClause} and (fullText contains 'primeros' or fullText contains 'auxilios' or fullText contains 'PPAA')`,label:'primeros auxilios'});
    base.push({kind:'certification',q:`${nameClause} and (fullText contains 'certificado' or fullText contains 'credencial' or fullText contains 'diploma')`,label:'certificación'});
    base.push({kind:'identity',q:`${nameClause} and (fullText contains 'cedula' or fullText contains 'pasaporte' or fullText contains 'identidad')`,label:'documento de identidad'});
    base.push({kind:'sernatur',q:`${nameClause} and fullText contains 'SERNATUR'`,label:'SERNATUR'});
  }
  return base;
}

async function driveSearch(q){
  const headers=driveAuth();
  if(!headers)return {ok:false,status:'credentials_required',error:'GOOGLE_DRIVE_ACCESS_TOKEN no configurado en Vercel.',files:[]};

  const files=[];
  let pageToken='';
  do{
    const params=new URLSearchParams({
      q:`trashed = false and (${q})`,
      spaces:'drive',
      orderBy:'modifiedTime desc',
      pageSize:'100',
      fields:'nextPageToken,files(id,name,mimeType,modifiedTime,webViewLink,thumbnailLink,size,parents)'
    });
    if(pageToken)params.set('pageToken',pageToken);
    const response=await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`,{headers});
    if(!response.ok){
      const detail=(await response.text()).slice(0,600);
      return {ok:false,status:response.status===401||response.status===403?'permission_required':'error',error:`Drive API ${response.status}: ${detail}`,files:[]};
    }
    const data=await response.json();
    files.push(...(data.files||[]));
    pageToken=data.nextPageToken||'';
  }while(pageToken&&files.length<250);
  return {ok:true,status:'ready',error:null,files};
}

function urlFor(file){
  return file.webViewLink||`https://drive.google.com/file/d/${file.id}/view`;
}

function docLabel(kind){
  return ({
    identity:'Identidad',
    sernatur:'SERNATUR',
    first_aid:'Primeros auxilios',
    driver_license:'Licencia de conducir',
    certification:'Certificación'
  })[kind]||kind;
}

async function persistSource(admin,person,file,query){
  const url=urlFor(file);
  const row={
    entity_type:'person',
    entity_id:person.id,
    source_kind:'drive',
    external_id:file.id,
    title:file.name||person.full_name,
    url,
    query_text:`${person.full_name} · ${query.label}`,
    observed_at:new Date().toISOString(),
    metadata:{
      origin:'vercel_global_drive_audit',
      search_kind:query.kind,
      search_label:query.label,
      mime_type:file.mimeType||null,
      modified_time:file.modifiedTime||null,
      thumbnail_link:file.thumbnailLink||null,
      parents:file.parents||[],
      size:file.size||null
    },
    updated_at:new Date().toISOString()
  };
  const {error}=await admin.from('operational_entity_sources').upsert(row,{onConflict:'entity_type,entity_id,url'});
  if(error)throw error;
}

async function persistEvidenceDocument(admin,person,file,kind,query){
  if(!DOC_KEYS.includes(kind))return null;
  const url=urlFor(file);
  const storagePath=`drive-ref/${person.id}/${kind}/${file.id}`;
  const row={
    entity_type:'person',
    entity_id:person.id,
    document_type:kind,
    title:`Evidencia ${docLabel(kind)} en Drive · ${file.name||file.id}`,
    storage_bucket:'drive',
    storage_path:storagePath,
    file_name:file.name||file.id,
    mime_type:file.mimeType||null,
    size_bytes:file.size?Number(file.size):null,
    expires_on:null,
    notes:`Hallazgo automático por ${query.label}. Debe ser revisado por Operaciones antes de considerarse documento oficial.`,
    status:'active',
    source_kind:'drive',
    external_url:url,
    external_id:file.id,
    verification_level:'operational',
    source_metadata:{
      origin:'vercel_global_drive_audit',
      query_kind:kind,
      query_label:query.label,
      modified_time:file.modifiedTime||null,
      parents:file.parents||[]
    },
    updated_at:new Date().toISOString()
  };
  const {data,error}=await admin.from('operational_entity_documents')
    .upsert(row,{onConflict:'entity_type,entity_id,document_type,external_url'})
    .select('id')
    .single();
  if(error)throw error;
  return data?.id||null;
}

function requirementsFor(person){
  const role=normalize(person.person_type||'');
  const isGuide=role.includes('guia');
  const isDriver=role.includes('conductor')||role.includes('chofer');
  const isMountain=role.includes('montana');
  return [
    {kind:'identity',required:true},
    {kind:'sernatur',required:isGuide},
    {kind:'first_aid',required:isGuide||isMountain},
    {kind:'driver_license',required:isDriver},
    {kind:'certification',required:isMountain}
  ];
}

async function refreshReviewQueue(admin,person){
  const requirements=requirementsFor(person);
  for(const req of requirements){
    const {data:docs,error}=await admin.from('operational_entity_documents')
      .select('id,verification_level,expires_on,external_url,created_at')
      .eq('entity_type','person')
      .eq('entity_id',person.id)
      .eq('document_type',req.kind)
      .eq('status','active')
      .order('created_at',{ascending:false});
    if(error)throw error;

    const official=(docs||[]).find(d=>(d.verification_level||'official')==='official');
    const evidence=(docs||[]).find(d=>(d.verification_level||'official')!=='official');
    let status='missing';
    let selected=evidence||null;
    let note='No se encontró respaldo documental.';
    if(official){
      selected=official;
      if(official.expires_on&&new Date(`${official.expires_on}T23:59:59`).getTime()<Date.now()){
        status='expired';note='Documento oficial vencido.';
      }else{
        status='official';note='Documento oficial cargado.';
      }
    }else if(evidence){
      status='evidence_found';note='Existe evidencia Drive. Operaciones debe validar o cargar el documento oficial.';
    }

    const {error:upsertError}=await admin.from('provider_document_review_queue').upsert({
      person_id:person.id,
      document_type:req.kind,
      required:req.required,
      status,
      evidence_document_id:selected?.id||null,
      source_url:selected?.external_url||null,
      note,
      priority:req.required?'high':'normal',
      last_checked_at:new Date().toISOString(),
      metadata:{owner:'operations',reviewer:'linksubdot-hotel-experience',cron:'provider-drive-sync'},
      updated_at:new Date().toISOString()
    },{onConflict:'person_id,document_type'});
    if(upsertError)throw upsertError;
  }
}

async function auditPerson(admin,person){
  const queries=personQueries(person);
  const unique=new Map();
  let searches=0;
  let evidence=0;

  for(const query of queries){
    const result=await driveSearch(query.q);
    searches++;
    if(!result.ok)return {ok:false,status:result.status,error:result.error,searches,evidence,files:0};
    for(const file of result.files){
      const key=`${query.kind}:${file.id}`;
      if(unique.has(key))continue;
      unique.set(key,true);
      await persistSource(admin,person,file,query);
      if(query.kind!=='historical'){
        const id=await persistEvidenceDocument(admin,person,file,query.kind,query);
        if(id)evidence++;
      }
    }
  }

  await refreshReviewQueue(admin,person);
  await admin.from('service_people').update({
    drive_sync_status:'reviewed_global_drive',
    drive_last_synced_at:new Date().toISOString(),
    updated_at:new Date().toISOString()
  }).eq('id',person.id);

  return {ok:true,status:'ready',searches,evidence,files:unique.size};
}

async function run(admin){
  const checkedAt=new Date().toISOString();
  const {data:source,error:sourceError}=await admin.from('operational_source_folders')
    .select('*').eq('source_key',SOURCE_KEY).single();
  if(sourceError||!source)throw sourceError||new Error('No existe la fuente Drive de prestadores.');

  if(!driveAuth()){
    await admin.from('operational_source_folders').update({
      sync_status:'credentials_required',
      last_checked_at:checkedAt,
      last_error:'GOOGLE_DRIVE_ACCESS_TOKEN no configurado en Vercel. La auditoría manual de ChatGPT sí puede usar el conector, pero el cron necesita credencial servidor.',
      updated_at:checkedAt,
      metadata:{...(source.metadata||{}),last_runner:'vercel_cron',strategy:'global_drive_search'}
    }).eq('id',source.id);
    return {ok:false,status:'credentials_required',people_reviewed:0,evidence_found:0};
  }

  const {data:people,error:peopleError}=await admin.from('service_people')
    .select('id,full_name,person_type,rut,sernatur_registration,updated_at')
    .eq('active',true)
    .order('full_name');
  if(peopleError)throw peopleError;

  let peopleReviewed=0,filesSeen=0,evidenceFound=0,searches=0;
  for(const person of people||[]){
    const result=await auditPerson(admin,person);
    searches+=result.searches||0;
    if(!result.ok){
      await admin.from('operational_source_folders').update({
        sync_status:result.status,
        last_checked_at:checkedAt,
        last_error:result.error,
        updated_at:checkedAt
      }).eq('id',source.id);
      return {ok:false,status:result.status,people_reviewed:peopleReviewed,evidence_found:evidenceFound,searches};
    }
    peopleReviewed++;
    filesSeen+=result.files||0;
    evidenceFound+=result.evidence||0;
  }

  const {data:queue}=await admin.from('provider_document_review_queue')
    .select('status,required').eq('required',true);
  const summary=(queue||[]).reduce((acc,row)=>{
    acc[row.status]=(acc[row.status]||0)+1;return acc;
  },{});

  await admin.from('operational_source_folders').update({
    sync_status:'ready',
    last_checked_at:checkedAt,
    last_success_at:checkedAt,
    last_error:null,
    updated_at:checkedAt,
    metadata:{
      ...(source.metadata||{}),
      last_runner:'vercel_cron',
      strategy:'global_drive_search',
      people_reviewed:peopleReviewed,
      searches,
      files_seen:filesSeen,
      evidence_found:evidenceFound,
      review_queue:summary
    }
  }).eq('id',source.id);

  return {
    ok:true,status:'ready',people_reviewed:peopleReviewed,searches,
    files_seen:filesSeen,evidence_found:evidenceFound,review_queue:summary
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
