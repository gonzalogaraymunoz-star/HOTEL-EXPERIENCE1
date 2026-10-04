import {PDFDocument,StandardFonts,rgb} from 'pdf-lib';

export const RISK_TEMPLATE_KEY='risk_sheet_standard';
export const RISK_DOCUMENT_TYPE='risk_sheet';
export const RISK_BUCKET='operation-documents';

function unique(values){return Array.from(new Set((values||[]).filter(Boolean)))}
function safe(value){return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_')}
function normalize(value=''){return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim()}
function noLike(value=''){const v=normalize(value);return !v||['no','ninguno','ninguna','sin','none','n/a','na','no aplica','no aplica.'].includes(v)}
function meaningful(value=''){return Boolean(String(value||'').trim())&&!noLike(value)}
function displayDate(value){if(!value)return'';const [y,m,d]=String(value).slice(0,10).split('-');return y&&m&&d?`${d}-${m}-${y}`:String(value)}
function displayTime(value){return value?String(value).slice(0,5):''}
function ageOn(birthDate,serviceDate){
  if(!birthDate||!serviceDate)return'';
  const birth=new Date(`${String(birthDate).slice(0,10)}T00:00:00Z`);
  const date=new Date(`${String(serviceDate).slice(0,10)}T00:00:00Z`);
  if(Number.isNaN(birth.getTime())||Number.isNaN(date.getTime())||birth>date)return'';
  let age=date.getUTCFullYear()-birth.getUTCFullYear();
  if(date.getUTCMonth()<birth.getUTCMonth()||(date.getUTCMonth()===birth.getUTCMonth()&&date.getUTCDate()<birth.getUTCDate()))age-=1;
  return age>=0?String(age):'';
}
function byteaBuffer(value){
  if(!value)return null;
  if(Buffer.isBuffer(value))return value;
  if(value instanceof Uint8Array)return Buffer.from(value);
  const text=String(value);
  if(text.startsWith('\\x')&&/^[0-9a-f]+$/i.test(text.slice(2)))return Buffer.from(text.slice(2),'hex');
  try{return Buffer.from(text,'base64')}catch{return null}
}
function driveFileId(source=''){
  const text=String(source||'');
  return text.match(/\/file\/d\/([A-Za-z0-9_-]+)/)?.[1]||text.match(/[?&]id=([A-Za-z0-9_-]+)/)?.[1]||null;
}
async function fetchDrivePdf(url){
  const id=driveFileId(url);if(!id)throw new Error('La plantilla de hoja de riesgo no apunta a un archivo de Google Drive válido.');
  const urls=[
    `https://drive.usercontent.google.com/download?id=${id}&export=download&confirm=t`,
    `https://drive.google.com/uc?export=download&id=${id}`
  ];
  let lastError=null;
  for(const candidate of urls){
    try{
      const response=await fetch(candidate,{redirect:'follow'});
      if(!response.ok)throw new Error(`Google Drive respondió ${response.status}`);
      const bytes=Buffer.from(await response.arrayBuffer());
      if(bytes.length>4&&bytes.subarray(0,4).toString()==='%PDF')return bytes;
      throw new Error('Google Drive no devolvió un PDF.');
    }catch(error){lastError=error}
  }
  throw lastError||new Error('No se pudo descargar la plantilla desde Google Drive.');
}
async function loadTemplate(admin){
  const {data,error}=await admin.from('operation_templates').select('template_key,title,file_name,mime_type,file_bytes,source_url,sha256').eq('template_key',RISK_TEMPLATE_KEY).eq('active',true).maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error('No está configurada la plantilla estándar de hoja de riesgo.'),{status:500});
  if(data.source_url){
    try{return{bytes:await fetchDrivePdf(data.source_url),source:'google_drive',sourceUrl:data.source_url,fileId:driveFileId(data.source_url)}}catch(error){console.warn('risk template drive fallback',error?.message)}
  }
  const embedded=byteaBuffer(data.file_bytes);
  if(embedded?.length&&embedded.subarray(0,4).toString()==='%PDF')return{bytes:embedded,source:'database_fallback',sourceUrl:data.source_url||'',fileId:driveFileId(data.source_url)};
  throw Object.assign(new Error('No se pudo abrir la plantilla estándar desde Google Drive ni desde el respaldo del servidor.'),{status:502});
}

async function loadRiskContext(admin,departureId,passengerId){
  const [{data:departure,error:departureError},{data:passenger,error:passengerError}]=await Promise.all([
    admin.from('tour_departures').select('*').eq('id',departureId).single(),
    admin.from('passengers').select('*').eq('id',passengerId).single()
  ]);
  if(departureError)throw departureError;if(passengerError)throw passengerError;
  const {data:services,error:serviceError}=await admin.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at');
  if(serviceError)throw serviceError;if(!services?.length)throw Object.assign(new Error('La salida no tiene servicios confirmados.'),{status:409});
  const sameLead=services.filter(s=>s.lead_id===passenger.lead_id);
  if(!sameLead.length)throw Object.assign(new Error('Este pasajero no pertenece a una reserva de esta salida.'),{status:409});
  const serviceIds=services.map(s=>s.id);
  const {data:links,error:linkError}=await admin.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds).eq('passenger_id',passengerId).eq('confirmed',true);
  if(linkError)throw linkError;
  const linkedService=links?.length?sameLead.find(s=>links.some(link=>link.lead_service_id===s.id)):null;
  const service=linkedService||sameLead[0];
  const [{data:lead,error:leadError},{data:assignment,error:assignmentError}]=await Promise.all([
    admin.from('leads').select('*').eq('id',passenger.lead_id).single(),
    admin.from('service_assignments').select('*').eq('lead_service_id',service.id).maybeSingle()
  ]);
  if(leadError)throw leadError;if(assignmentError)throw assignmentError;
  let guide=null;
  if(assignment?.guide_person_id){
    const {data,error}=await admin.from('service_people').select('*').eq('id',assignment.guide_person_id).maybeSingle();
    if(error)throw error;guide=data||null;
  }
  return{departure,service,passenger,lead,assignment:assignment||null,guide};
}

function clear(page,x,y,width,height){page.drawRectangle({x,y,width,height,color:rgb(1,1,1),borderWidth:0})}
function fitSize(font,text,maxWidth,start=7.2,min=4.8){let size=start;while(size>min&&font.widthOfTextAtSize(text,size)>maxWidth)size-=0.2;return size}
function draw(page,font,text,x,y,maxWidth,size=7.2){
  const value=String(text??'').trim();if(!value)return;
  const fontSize=fitSize(font,value,maxWidth,size);
  page.drawText(value,{x,y,size:fontSize,font,color:rgb(0,0,0)});
}
function wrap(font,text,maxWidth,size=6.6){
  const words=String(text||'').replace(/\s+/g,' ').trim().split(' ').filter(Boolean),lines=[];let line='';
  for(const word of words){
    const candidate=line?`${line} ${word}`:word;
    if(font.widthOfTextAtSize(candidate,size)<=maxWidth){line=candidate;continue}
    if(line)lines.push(line);line=word;
  }
  if(line)lines.push(line);return lines;
}
function mark(page,bold,yes,rowY,spec=''){
  if(yes===true)draw(page,bold,'X',316,rowY,12,8);
  if(yes===false)draw(page,bold,'X',370,rowY,12,8);
  if(spec)draw(page,bold,spec,445,rowY,145,6.1);
}
function classification(value){
  const raw=String(value||'').trim();
  if(!raw)return{value:null,spec:''};
  if(noLike(raw))return{value:false,spec:''};
  return{value:true,spec:raw};
}
function cleanOther(passenger){
  return unique([passenger.medical_notes,passenger.disability_type].filter(meaningful)).join(' · ');
}
function itineraryText(ctx){
  const parts=[
    [ctx.departure.product_name||ctx.service.producto,displayDate(ctx.service.fecha_servicio||ctx.departure.service_date),displayTime(ctx.assignment?.pickup_time||ctx.service.hora_inicio||ctx.departure.start_time)].filter(Boolean).join(' - '),
    ctx.service.observacion||ctx.service.other_notes||'',
    ctx.departure.notes||''
  ].filter(Boolean);
  return parts.join(' · ');
}

async function fillStandardRiskPdf(templateBytes,ctx){
  const pdf=await PDFDocument.load(templateBytes);
  const page=pdf.getPage(0);
  const font=await pdf.embedFont(StandardFonts.Helvetica);
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold);

  // El original de Drive contiene datos de ejemplo. Se borran solo esos textos, no la grilla.
  for(const box of [[163,638,82,11],[390,638,22,11],[378,626,14,11],[163,578,68,11],[163,566,80,11],[167,554,50,11],[281,554,50,11]])clear(page,...box);

  const serviceDate=ctx.service.fecha_servicio||ctx.departure.service_date||'';
  draw(page,font,ctx.passenger.full_name,166,640,165);
  draw(page,font,ctx.passenger.nationality,393,640,195);
  draw(page,font,ctx.passenger.document_number,166,628,105);
  draw(page,font,ageOn(ctx.passenger.birth_date,serviceDate),376,628,14);
  draw(page,font,ctx.departure.product_name||ctx.service.producto,166,581,160);
  draw(page,font,displayDate(serviceDate),397,581,195);
  draw(page,font,ctx.guide?.full_name||ctx.assignment?.guide_name||'',166,569,160);
  draw(page,font,ctx.guide?.rut||'',397,569,195);
  draw(page,font,displayTime(ctx.assignment?.pickup_time||ctx.service.hora_inicio||ctx.departure.start_time),170,557,45);
  draw(page,font,displayTime(ctx.service.hora_fin||ctx.departure.end_time),284,557,45);
  draw(page,font,ctx.assignment?.meeting_point||ctx.lead.pickup_location||'',397,557,45,6.2);

  const lines=wrap(font,itineraryText(ctx),540,6.6).slice(0,5);
  lines.forEach((line,index)=>draw(page,font,line,52,511-index*12,540,6.6));

  const diet=classification(ctx.passenger.dietary_restrictions);
  mark(page,bold,diet.value,345,diet.spec);
  const notes=normalize(ctx.passenger.medical_notes);
  if(notes.includes('alerg'))mark(page,bold,true,369,ctx.passenger.medical_notes);
  if(notes.includes('medic'))mark(page,bold,true,357,ctx.passenger.medical_notes);
  if(notes.includes('cirug'))mark(page,bold,true,333,ctx.passenger.medical_notes);
  if(notes.includes('embaraz')||notes.includes('pregnan'))mark(page,bold,true,321,ctx.passenger.medical_notes);
  const other=cleanOther(ctx.passenger);
  if(other)mark(page,bold,true,309,other);
  else if([ctx.passenger.medical_notes,ctx.passenger.disability_type].some(v=>String(v||'').trim()))mark(page,bold,false,309,'');

  return Buffer.from(await pdf.save());
}

export async function generatePassengerRiskSheet(admin,user,departureId,passengerId){
  const [template,ctx]=await Promise.all([loadTemplate(admin),loadRiskContext(admin,departureId,passengerId)]);
  const output=await fillStandardRiskPdf(template.bytes,ctx);
  const tourCode=safe(ctx.departure.departure_code||ctx.departure.id);
  const paxCode=safe(ctx.passenger.passenger_code||ctx.passenger.id);
  const fileName=`${tourCode}_${paxCode}_HOJA_RIESGO.pdf`;
  const storagePath=`generated/risk-sheets/${tourCode}/${fileName}`;
  const {error:uploadError}=await admin.storage.from(RISK_BUCKET).upload(storagePath,output,{contentType:'application/pdf',upsert:true,cacheControl:'0'});
  if(uploadError)throw uploadError;

  const generatedAt=new Date().toISOString();
  const riskData={
    source_template_key:RISK_TEMPLATE_KEY,
    source_template_url:template.sourceUrl,
    source_template_file_id:template.fileId,
    template_source:template.source,
    departure_id:ctx.departure.id,
    departure_code:ctx.departure.departure_code,
    service_id:ctx.service.id,
    service_code:ctx.service.service_code,
    passenger_code:ctx.passenger.passenger_code,
    storage_bucket:RISK_BUCKET,
    storage_path:storagePath,
    generated_at:generatedAt
  };
  const {data:existing,error:findError}=await admin.from('reservation_documents').select('id,status').eq('lead_id',ctx.passenger.lead_id).eq('passenger_id',ctx.passenger.id).eq('departure_id',ctx.departure.id).eq('document_type',RISK_DOCUMENT_TYPE).maybeSingle();
  if(findError)throw findError;
  if(existing?.id){
    const {error}=await admin.from('reservation_documents').update({title:`Hoja de riesgo · ${ctx.passenger.passenger_code} · ${ctx.departure.departure_code}`,status:'Generada',url:null,risk_data:riskData,completed_at:null,updated_at:generatedAt}).eq('id',existing.id);
    if(error)throw error;
  }else{
    const {error}=await admin.from('reservation_documents').insert({lead_id:ctx.passenger.lead_id,passenger_id:ctx.passenger.id,departure_id:ctx.departure.id,document_type:RISK_DOCUMENT_TYPE,title:`Hoja de riesgo · ${ctx.passenger.passenger_code} · ${ctx.departure.departure_code}`,status:'Generada',url:null,risk_data:riskData,created_by:user.id});
    if(error)throw error;
  }
  const {data:signed,error:signedError}=await admin.storage.from(RISK_BUCKET).createSignedUrl(storagePath,3600);
  if(signedError)throw signedError;
  return{url:signed.signedUrl,fileName,departureCode:ctx.departure.departure_code,passengerCode:ctx.passenger.passenger_code,passengerName:ctx.passenger.full_name,templateSource:template.source,generatedAt};
}
