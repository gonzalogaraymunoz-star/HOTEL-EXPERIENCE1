
import {assertSupabase} from './supabase';

export type LinkFormCanonicalField={key:string;label:string;collection:'root'|'passengers'|'operation'|string};
export type LinkFormDetectedField={
  targetKey:string;
  fieldLabel:string;
  canonicalKey:string;
  confidence:number;
  sourceCollection:string;
  target:Record<string,any>;
  previewValue?:unknown;
  required?:boolean;
  mappingSource?:'auto'|'manual'|'imported';
};
export type LinkFormTemplate={
  id:string;
  template_key:string;
  title:string;
  business_scope:string;
  context_scope:'reservation'|'departure';
  document_kind:'xlsx'|'pdf'|'html'|'json';
  file_name:string;
  mime_type:string;
  field_count?:number;
  updated_at?:string;
};

async function post(body:any){
  const sb=assertSupabase();
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.access_token)throw new Error('Sesión requerida.');
  const response=await fetch('/api/link-forms',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
    body:JSON.stringify(body)
  });
  const json=await response.json();
  if(!response.ok)throw new Error(json.error||'LINK Forms no pudo completar la solicitud.');
  return json;
}

export async function fileToBase64(file:File){
  if(file.size>3*1024*1024)throw new Error('El formulario supera 3 MB. Reduce el archivo antes de subirlo.');
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(reader.error||new Error('No se pudo leer el archivo.'));
    reader.onload=()=>{
      const result=String(reader.result||'');
      resolve(result.includes(',')?result.slice(result.indexOf(',')+1):result);
    };
    reader.readAsDataURL(file);
  });
}

export async function loadLinkFormTemplates(){
  return post({action:'list'}) as Promise<{ok:true;templates:LinkFormTemplate[];dictionary:LinkFormCanonicalField[]}>;
}

export async function loadLinkFormContext(args:{contextScope:'reservation'|'departure';leadId?:string|null;departureId?:string|null;leadServiceId?:string|null}){
  return post({action:'context',...args});
}

export async function analyzeLinkForm(args:{
  file:File;
  contextScope:'reservation'|'departure';
  leadId?:string|null;
  departureId?:string|null;
  leadServiceId?:string|null;
}){
  const base64=await fileToBase64(args.file);
  return post({
    action:'analyze',
    fileName:args.file.name,
    mimeType:args.file.type||'application/octet-stream',
    base64,
    contextScope:args.contextScope,
    leadId:args.leadId||null,
    departureId:args.departureId||null,
    leadServiceId:args.leadServiceId||null
  }) as Promise<{
    ok:true;
    documentKind:'xlsx'|'pdf'|'html'|'json';
    fileName:string;
    mimeType:string;
    fingerprint:string;
    fields:LinkFormDetectedField[];
    warnings:string[];
    meta:Record<string,any>;
    dictionary:LinkFormCanonicalField[];
    contextSummary?:{scope:string;reservationCode?:string|null;departureCode?:string|null;passengerCount:number;serviceCount:number}|null;
  }>;
}

export async function saveLinkFormTemplate(args:{
  title:string;
  businessScope?:string;
  contextScope:'reservation'|'departure';
  file:File;
  fields:LinkFormDetectedField[];
}){
  const base64=await fileToBase64(args.file);
  return post({
    action:'save_template',
    title:args.title,
    businessScope:args.businessScope||'link',
    contextScope:args.contextScope,
    fileName:args.file.name,
    mimeType:args.file.type||'application/octet-stream',
    base64,
    fields:args.fields.map(field=>({...field,mappingSource:field.mappingSource||'manual'}))
  });
}

export async function generateLinkForm(args:{
  templateId:string;
  leadId?:string|null;
  departureId?:string|null;
  leadServiceId?:string|null;
}){
  return post({action:'generate',templateId:args.templateId,leadId:args.leadId||null,departureId:args.departureId||null,leadServiceId:args.leadServiceId||null}) as Promise<{
    ok:true;
    runId:string;
    url:string;
    fileName:string;
    filled:number;
    missing:number;
    warnings:string[];
    report:any[];
  }>;
}
