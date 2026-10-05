import {createClient} from '@supabase/supabase-js';
import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';
import {archiveReservationDocument,ensureReservationDriveFolder,syncPendingReservationDocuments} from './_lib/reservation-drive.js';

export const config={maxDuration:60};
const BUCKET='operation-documents';
const DEFAULT_SALES_ORIGIN='https://ventas-hotelexperience.vercel.app';

function setCors(req,res){
  const origin=String(req.headers.origin||'').replace(/\/$/,'');
  const configured=String(process.env.SALES_APP_ORIGIN||DEFAULT_SALES_ORIGIN).replace(/\/$/,'');
  const allowed=new Set([DEFAULT_SALES_ORIGIN,configured,'http://localhost:5173','http://localhost:4173']);
  if(origin&&allowed.has(origin))res.setHeader('Access-Control-Allow-Origin',origin);
  res.setHeader('Vary','Origin');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
}

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración Supabase incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function userFrom(req,admin){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).single();
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return{user:data.user,profile};
}
function safe(value=''){return String(value||'').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,140)||'archivo'}
function dataBuffer(value=''){
  const raw=String(value||'').replace(/^data:[^;]+;base64,/,'');
  if(!raw)return null;
  return Buffer.from(raw,'base64');
}
function categoryDir(category='other'){
  return({
    quote:'01_COTIZACION',itinerary:'02_ITINERARIO',payment:'03_PAGO',reservation:'04_RESERVA',
    receipt:'05_COMPROBANTE_PAGO',risk:'06_HOJAS_RIESGO',passenger:'07_ANTECEDENTES_PAX',
    operations:'08_OPERACION',other:'09_OTROS'
  })[category]||'09_OTROS';
}
async function leadCode(admin,leadId){
  const {data,error}=await admin.from('leads').select('codigo,reserva,reservation_reference').eq('id',leadId).single();
  if(error)throw error;
  return{...data,code:data.codigo||data.reserva||leadId};
}
async function insertDocument(admin,row){
  const {data,error}=await admin.from('reservation_documents').insert(row).select('*').single();
  if(error)throw error;
  return data;
}
async function storeBuffer(admin,user,{leadId,documentType,title,category,fileName,mimeType,buffer,passengerId=null,sourceApp='hotel_experience'}){
  const lead=await leadCode(admin,leadId);
  const cleanFile=safe(fileName||title||documentType);
  const storagePath=`generated/reservations/${safe(lead.code)}/${categoryDir(category)}/${cleanFile}`;
  const {error:uploadError}=await admin.storage.from(BUCKET).upload(storagePath,buffer,{contentType:mimeType||'application/pdf',upsert:true,cacheControl:'0'});
  if(uploadError)throw uploadError;
  const document=await insertDocument(admin,{
    lead_id:leadId,passenger_id:passengerId,departure_id:null,document_type:documentType,title:title||cleanFile,
    url:null,status:'Generada',source_app:sourceApp,storage_bucket:BUCKET,storage_path:storagePath,
    archive_category:category||'other',drive_sync_status:'pending',created_by:user.id
  });
  const drive=await archiveReservationDocument(admin,document.id);
  return{document,drive,storagePath};
}
function wrap(text,width=88){
  const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let line='';
  for(const word of words){const next=line?`${line} ${word}`:word;if(next.length>width){if(line)lines.push(line);line=word}else line=next}
  if(line)lines.push(line);return lines;
}
async function reservationPdf(admin,leadId){
  const [{data:lead,error:leadError},{data:passengers,error:paxError},{data:services,error:serviceError}]=await Promise.all([
    admin.from('leads').select('*').eq('id',leadId).single(),
    admin.from('passengers').select('*').eq('lead_id',leadId).order('passenger_code'),
    admin.from('lead_services').select('*').eq('lead_id',leadId).order('fecha_servicio').order('hora_inicio')
  ]);
  if(leadError)throw leadError;if(paxError)throw paxError;if(serviceError)throw serviceError;
  const pdf=await PDFDocument.create(),page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);
  let y=800;
  const draw=(value,{size=10,font=regular,indent=0,gap=4}={})=>{
    for(const line of wrap(value,92-Math.round(indent/6))){
      if(y<55){y=800;const p=pdf.addPage([595.28,841.89]);pageRef=p}
      (pageRef||page).drawText(line,{x:42+indent,y,size,font,color:rgb(.10,.10,.09)});y-=size+gap;
    }
  };
  let pageRef=null;
  const section=(title)=>{y-=8;draw(title,{size:9,font:bold,gap:6})};
  draw('LINK · HOTEL EXPERIENCE',{size:14,font:bold,gap:4});
  draw('FICHA DE RESERVA',{size:8,font:bold,gap:10});
  draw(`Código: ${lead.codigo||lead.reserva||lead.id}`,{size:12,font:bold});
  draw(`Referencia: ${lead.reservation_reference||lead.reserva||'—'}`);
  draw(`Estado comercial: ${lead.sales_stage||lead.estado||'—'}`);
  draw(`Arribo: ${lead.checkin||'—'}   Salida: ${lead.checkout||'—'}   Pax: ${lead.numero_pax||passengers?.length||0}`);
  draw(`Contacto: ${lead.contacto||'—'}`);
  section('PASAJEROS');
  for(const pax of passengers||[])draw(`${pax.passenger_code||''} · ${pax.full_name||'Sin nombre'} · ${pax.document_type||''} ${pax.document_number||''} · ${pax.nationality||''} · ${pax.phone||''} · ${pax.email||''}`,{size:8,indent:8});
  section('ITINERARIO CONFIRMADO');
  for(const service of services||[])draw(`${service.fecha_servicio||'Fecha pendiente'} ${String(service.hora_inicio||'').slice(0,5)} · ${service.service_code||''} · ${service.producto||'Servicio'} · ${service.modality||''} · ${service.numero_pax||0} pax · ${service.booking_status||''}`,{size:8,indent:8});
  section('TRAZABILIDAD');
  draw(`Cotización enviada: ${lead.quote_sent_at||'—'} · aceptada: ${lead.quote_accepted_at||'—'}`,{size:8});
  draw(`Pago coordinado: ${lead.payment_link_sent_at||lead.payment_coordination_at||'—'} · itinerario enviado: ${lead.itinerary_sent_at||'—'}`,{size:8});
  draw(`Reserva completada: ${lead.reservation_completed_at||'—'}`,{size:8});
  return{bytes:Buffer.from(await pdf.save()),fileName:`${safe(lead.codigo||lead.reserva||lead.id)}_FICHA_RESERVA.pdf`,lead};
}
async function passengerPdf(admin,leadId){
  const [{data:lead,error:leadError},{data:passengers,error:paxError}]=await Promise.all([
    admin.from('leads').select('codigo,reserva,reservation_reference').eq('id',leadId).single(),
    admin.from('passengers').select('*').eq('lead_id',leadId).order('passenger_code')
  ]);
  if(leadError)throw leadError;if(paxError)throw paxError;
  const pdf=await PDFDocument.create();let page=pdf.addPage([595.28,841.89]);
  const regular=await pdf.embedFont(StandardFonts.Helvetica),bold=await pdf.embedFont(StandardFonts.HelveticaBold);let y=800;
  const draw=(text,size=9,font=regular)=>{for(const line of wrap(text,92)){if(y<55){page=pdf.addPage([595.28,841.89]);y=800}page.drawText(line,{x:42,y,size,font,color:rgb(.1,.1,.09)});y-=size+5}};
  draw('LINK · HOTEL EXPERIENCE',14,bold);draw('ANTECEDENTES DE PASAJEROS',8,bold);draw(`Reserva: ${lead.codigo||lead.reserva||leadId} · ${lead.reservation_reference||''}`,11,bold);y-=8;
  for(const pax of passengers||[]){
    draw(`${pax.passenger_code||''} · ${pax.full_name||'Sin nombre'}`,10,bold);
    draw(`Documento: ${pax.document_type||'—'} ${pax.document_number||'—'} · Nacionalidad: ${pax.nationality||'—'} · Nacimiento: ${pax.birth_date||'—'}`,8);
    draw(`Contacto: ${pax.phone||'—'} · ${pax.email||'—'}`,8);
    draw(`Alimentación: ${pax.dietary_restrictions||'—'} · Movilidad/discapacidad: ${pax.disability_type||'—'} · Observaciones médicas: ${pax.medical_notes||'—'}`,8);y-=8;
  }
  return{bytes:Buffer.from(await pdf.save()),fileName:`${safe(lead.codigo||lead.reserva||leadId)}_ANTECEDENTES_PAX.pdf`};
}

export default async function handler(req,res){
  setCors(req,res);
  if(req.method==='OPTIONS')return res.status(204).end();
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const admin=setup(),{user}=await userFrom(req,admin);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=String(body.action||'');
    if(!body.leadId&&action!=='sync_pending')return res.status(400).json({error:'Falta leadId.'});

    if(action==='ensure_folder'){
      const folder=await ensureReservationDriveFolder(admin,body.leadId,{createAllCategories:true});
      return res.status(folder.status==='ready'?200:202).json({ok:folder.status==='ready',folder});
    }
    if(action==='store_file'){
      const buffer=dataBuffer(body.base64);
      if(!buffer?.length)return res.status(400).json({error:'Falta contenido base64.'});
      if(buffer.length>9*1024*1024)return res.status(413).json({error:'Archivo demasiado grande.'});
      const result=await storeBuffer(admin,user,{
        leadId:body.leadId,documentType:body.documentType||'generated_document',title:body.title,
        category:body.category||'other',fileName:body.fileName,mimeType:body.mimeType||'application/pdf',
        buffer,passengerId:body.passengerId||null,sourceApp:body.sourceApp||'link_ventas'
      });
      return res.status(200).json({ok:true,...result});
    }
    if(action==='register_link'){
      const lead=await leadCode(admin,body.leadId);
      const document=await insertDocument(admin,{
        lead_id:body.leadId,passenger_id:body.passengerId||null,departure_id:null,
        document_type:body.documentType||'external_link',title:body.title||body.fileName||'Enlace',
        url:String(body.url||'').trim()||null,status:'Registrado',source_app:body.sourceApp||'link_ventas',
        archive_category:body.category||'other',drive_sync_status:'pending',created_by:user.id,
        risk_data:{lead_code:lead.code,registered_at:new Date().toISOString()}
      });
      const drive=await archiveReservationDocument(admin,document.id);
      return res.status(200).json({ok:true,document,drive});
    }
    if(action==='reservation_snapshot'){
      const generated=await reservationPdf(admin,body.leadId);
      const result=await storeBuffer(admin,user,{leadId:body.leadId,documentType:'reservation_record',title:`Ficha de reserva · ${generated.lead.codigo||generated.lead.reserva}`,category:'reservation',fileName:generated.fileName,mimeType:'application/pdf',buffer:generated.bytes,sourceApp:'hotel_experience'});
      return res.status(200).json({ok:true,...result});
    }
    if(action==='passenger_snapshot'){
      const generated=await passengerPdf(admin,body.leadId);
      const result=await storeBuffer(admin,user,{leadId:body.leadId,documentType:'passenger_background',title:'Antecedentes de pasajeros',category:'passenger',fileName:generated.fileName,mimeType:'application/pdf',buffer:generated.bytes,sourceApp:'hotel_experience'});
      return res.status(200).json({ok:true,...result});
    }
    if(action==='sync_pending'){
      const results=await syncPendingReservationDocuments(admin,{leadId:body.leadId||null,limit:Math.min(200,Number(body.limit||100))});
      return res.status(200).json({ok:true,count:results.length,results});
    }
    return res.status(400).json({error:'Acción no reconocida.'});
  }catch(error){
    console.error('reservation-archive',error);
    return res.status(error?.status||500).json({error:error?.message||'No se pudo actualizar el respaldo de la reserva.'});
  }
}
