import ExcelJS from 'exceljs';
import {createHash} from 'node:crypto';
import {archiveReservationDocument} from './reservation-drive.js';

export const RISK_TEMPLATE_KEY='risk_sheet_standard';
export const RISK_DOCUMENT_TYPE='risk_sheet';
export const RISK_BUCKET='operation-documents';
export const RISK_XLSX_MIME='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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
function weekday(value){
  if(!value)return'';
  const [y,m,d]=String(value).slice(0,10).split('-').map(Number);
  if(!y||!m||!d)return'';
  return new Intl.DateTimeFormat('en-US',{weekday:'long',timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d,12)));
}
function cloneStyle(value){return value?JSON.parse(JSON.stringify(value)):value}

async function loadTemplate(admin){
  const {data,error}=await admin.from('operation_templates')
    .select('template_key,title,file_name,mime_type,file_bytes,source_url,sha256')
    .eq('template_key',RISK_TEMPLATE_KEY).eq('active',true).maybeSingle();
  if(error)throw error;
  if(!data)throw Object.assign(new Error('No está configurada la plantilla estándar de hoja de riesgo.'),{status:500});
  const embedded=byteaBuffer(data.file_bytes);
  if(!embedded?.length)throw Object.assign(new Error('La plantilla XLSX de hoja de riesgo no tiene respaldo binario disponible.'),{status:502});
  const actualSha=createHash('sha256').update(embedded).digest('hex');
  if(data.sha256&&String(data.sha256)!==actualSha)throw Object.assign(new Error('La plantilla XLSX de hoja de riesgo no coincide con el formulario maestro configurado.'),{status:502});
  return{bytes:embedded,sourceUrl:data.source_url||'',fileName:data.file_name||'Formulario_Aceptacion_Riesgo_Turismo_Aventura.xlsx',sha256:actualSha};
}

async function loadPassengerItinerary(admin,passengerId){
  const {data:passenger,error:passengerError}=await admin.from('passengers').select('*').eq('id',passengerId).single();
  if(passengerError)throw passengerError;
  const {data:lead,error:leadError}=await admin.from('leads').select('*').eq('id',passenger.lead_id).single();
  if(leadError)throw leadError;

  const {data:links,error:linksError}=await admin.from('lead_service_passengers')
    .select('lead_service_id,confirmed').eq('passenger_id',passengerId).eq('confirmed',true);
  if(linksError)throw linksError;
  const linkedIds=unique((links||[]).map(item=>item.lead_service_id));

  let serviceQuery=admin.from('lead_services').select('*')
    .eq('lead_id',passenger.lead_id)
    .in('booking_status',['confirmed','completed']);
  if(linkedIds.length)serviceQuery=serviceQuery.in('id',linkedIds);
  const {data:services,error:servicesError}=await serviceQuery.order('fecha_servicio').order('hora_inicio').order('created_at');
  if(servicesError)throw servicesError;
  if(!services?.length)throw Object.assign(new Error('Este pasajero no tiene servicios confirmados para construir su itinerario de riesgo.'),{status:409});

  const serviceIds=services.map(item=>item.id);
  const departureIds=unique(services.map(item=>item.departure_id));
  const productIds=unique(services.map(item=>item.product_catalog_id));

  const [{data:assignments,error:assignmentError},{data:departures,error:departureError},{data:products,error:productError}]=await Promise.all([
    admin.from('service_assignments').select('*').in('lead_service_id',serviceIds),
    departureIds.length?admin.from('tour_departures').select('*').in('id',departureIds):Promise.resolve({data:[],error:null}),
    productIds.length?admin.from('product_catalog').select('id,name,stops,duration_hours,schedule').in('id',productIds):Promise.resolve({data:[],error:null})
  ]);
  if(assignmentError)throw assignmentError;if(departureError)throw departureError;if(productError)throw productError;

  const guideIds=unique((assignments||[]).map(item=>item.guide_person_id));
  const {data:guides,error:guideError}=guideIds.length
    ?await admin.from('service_people').select('*').in('id',guideIds)
    :{data:[],error:null};
  if(guideError)throw guideError;

  const assignmentByService=new Map((assignments||[]).map(item=>[item.lead_service_id,item]));
  const departureById=new Map((departures||[]).map(item=>[item.id,item]));
  const productById=new Map((products||[]).map(item=>[item.id,item]));
  const guideById=new Map((guides||[]).map(item=>[item.id,item]));

  const itinerary=services.map(service=>{
    const assignment=assignmentByService.get(service.id)||null;
    const departure=service.departure_id?departureById.get(service.departure_id)||null:null;
    const product=service.product_catalog_id?productById.get(service.product_catalog_id)||null:null;
    const guide=assignment?.guide_person_id?guideById.get(assignment.guide_person_id)||null:null;
    const start=displayTime(assignment?.pickup_time||service.hora_inicio||departure?.start_time);
    const finish=displayTime(service.hora_fin||departure?.end_time);
    const schedule=start&&finish?`${start}-${finish}`:start||finish||'';
    const parts=[service.producto||departure?.product_name||product?.name||'Servicio'];
    if(product?.stops&&normalize(product.stops)!==normalize(parts[0]))parts.push(String(product.stops).replace(/\s*\+\s*/g,', '));
    if(!product?.stops&&service.observacion)parts.push(String(service.observacion).replace(/\s+/g,' ').trim());
    if(guide?.full_name||assignment?.guide_name)parts.push(`Guide: ${guide?.full_name||assignment?.guide_name}`);
    return{
      service,
      departure,
      assignment,
      guide,
      product,
      date:service.fecha_servicio||departure?.service_date||'',
      day:weekday(service.fecha_servicio||departure?.service_date),
      schedule,
      description:parts.filter(Boolean).join(' · '),
      start,
      finish,
      meetingPoint:assignment?.meeting_point||lead.pickup_location||lead.empresa_ejecuta||''
    };
  }).sort((a,b)=>String(a.date).localeCompare(String(b.date))||String(a.start).localeCompare(String(b.start))||String(a.service.created_at).localeCompare(String(b.service.created_at)));

  return{passenger,lead,itinerary};
}

function shiftMerge(ref,offset){
  return ref.replace(/([A-Z]+)(\d+)/g,(_,col,row)=>`${col}${Number(row)+offset}`);
}
function copyRowStyle(source,target){
  target.height=source.height;
  for(let col=1;col<=8;col++){
    const from=source.getCell(col),to=target.getCell(col);
    to.style=cloneStyle(from.style);
    to.numFmt=from.numFmt;
    to.alignment=cloneStyle(from.alignment);
    to.border=cloneStyle(from.border);
    to.fill=cloneStyle(from.fill);
    to.font=cloneStyle(from.font);
  }
}
function setCell(ws,address,value){
  ws.getCell(address).value=value??'';
}
function setYesNo(ws,row,value,spec=''){
  if(value===true){ws.getCell(`B${row}`).value='X YES';ws.getCell(`C${row}`).value='NO'}
  else if(value===false){ws.getCell(`B${row}`).value='YES';ws.getCell(`C${row}`).value='X NO'}
  else{ws.getCell(`B${row}`).value='YES';ws.getCell(`C${row}`).value='NO'}
  if(spec)ws.getCell(`D${row}`).value=spec;
}
function safeUnmerge(ws,range){try{ws.unMergeCells(range)}catch{}}

async function fillRiskWorkbook(templateBytes,ctx){
  const workbook=new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBytes);
  const ws=workbook.getWorksheet('Risk Acceptance Form')||workbook.worksheets[0];
  if(!ws)throw new Error('La plantilla no contiene la hoja Risk Acceptance Form.');

  const baseRows=4;
  const extra=Math.max(0,ctx.itinerary.length-baseRows);
  const lowerMerges=[
    'A20:H20','A21:B21','C21:D21','E21:H21','A22:B22','C22:D22','E22:H22',
    'A24:H24','D25:H25','D26:H26','D27:H27','D28:H28','D29:H29','D30:H30','D31:H31','D32:H32','D33:H33',
    'A35:H35','A37:H38','C41:F41','C42:F42','C43:F43','A45:H45'
  ];
  if(extra>0){
    lowerMerges.forEach(range=>safeUnmerge(ws,range));
    const source=ws.getRow(18);
    ws.insertRows(19,Array.from({length:extra},()=>[]),'i+');
    for(let i=0;i<extra;i++){
      const row=ws.getRow(19+i);
      copyRowStyle(source,row);
      safeUnmerge(ws,`D${19+i}:H${19+i}`);
      ws.mergeCells(`D${19+i}:H${19+i}`);
    }
    lowerMerges.forEach(range=>ws.mergeCells(shiftMerge(range,extra)));
  }

  // Limpiar los datos de ejemplo del formulario oficial.
  ['B5','D5','B6','E6','G6','B9','D9','B10','E10','B11','D11','F11','H11'].forEach(address=>setCell(ws,address,''));
  const itineraryCapacity=Math.max(baseRows,ctx.itinerary.length);
  for(let i=0;i<itineraryCapacity;i++){
    const row=15+i;
    setCell(ws,`A${row}`,'');setCell(ws,`B${row}`,'');setCell(ws,`C${row}`,'');setCell(ws,`D${row}`,'');
  }

  const first=ctx.itinerary[0],last=ctx.itinerary[ctx.itinerary.length-1];
  const serviceDates=ctx.itinerary.map(item=>item.date).filter(Boolean);
  const uniqueGuides=unique(ctx.itinerary.map(item=>item.guide?.full_name||item.assignment?.guide_name));
  const uniqueGuideIds=unique(ctx.itinerary.map(item=>item.guide?.rut));
  const activityStart=serviceDates.length?displayDate(serviceDates[0]):'';
  const activityName=ctx.itinerary.length===1
    ?String(first?.service?.producto||first?.departure?.product_name||first?.product?.name||'Adventure tourism activity')
    :'Tours en San Pedro de Atacama';
  const firstMeeting=first?.meetingPoint||ctx.lead.pickup_location||ctx.lead.empresa_ejecuta||'';
  const lastMeeting=last?.meetingPoint||ctx.lead.pickup_location||ctx.lead.empresa_ejecuta||firstMeeting;

  setCell(ws,'B5',ctx.passenger.full_name);
  setCell(ws,'D5',ctx.passenger.nationality);
  setCell(ws,'B6',ctx.passenger.document_number);
  setCell(ws,'E6',ageOn(ctx.passenger.birth_date,first?.date));
  setCell(ws,'G6','');
  setCell(ws,'B9',activityName);
  setCell(ws,'D9',activityStart);
  setCell(ws,'B10',uniqueGuides.length===1?uniqueGuides[0]:uniqueGuides.length?'VARIOUS':'');
  setCell(ws,'E10',uniqueGuideIds.length===1?uniqueGuideIds[0]:'');
  setCell(ws,'B11',ctx.itinerary.length===1?(first?.start||''):'VARIOUS');
  setCell(ws,'D11',ctx.itinerary.length===1?(last?.finish||''):'VARIOUS');
  setCell(ws,'F11',firstMeeting);
  setCell(ws,'H11',lastMeeting);

  ctx.itinerary.forEach((item,index)=>{
    const row=15+index;
    setCell(ws,`A${row}`,item.day);
    setCell(ws,`B${row}`,displayDate(item.date));
    setCell(ws,`C${row}`,item.schedule);
    setCell(ws,`D${row}`,item.description);
    ws.getCell(`D${row}`).alignment={...(ws.getCell(`D${row}`).alignment||{}),wrapText:true,vertical:'middle'};
  });

  const offset=extra;
  const dietRow=30+offset;
  const otherRow=33+offset;
  const declarationRow=37+offset;
  const dietRaw=String(ctx.passenger.dietary_restrictions||'').trim();
  if(dietRaw)setYesNo(ws,dietRow,!noLike(dietRaw),meaningful(dietRaw)?dietRaw:'');
  const other=unique([ctx.passenger.medical_notes,ctx.passenger.disability_type].filter(meaningful)).join(' · ');
  if(other)setYesNo(ws,otherRow,true,other);
  else if([ctx.passenger.medical_notes,ctx.passenger.disability_type].some(value=>String(value||'').trim()))setYesNo(ws,otherRow,false,'');

  setCell(ws,`A${declarationRow}`,`I, ${ctx.passenger.full_name||''} declare to know and understand the risks involved in participation in these activities, which NOTE: it is the duty of the provider of adventure tourism report the conditions and requirements for the development of the activity.`);

  ws.pageSetup={...ws.pageSetup,orientation:'portrait',fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:H${45+extra}`};
  ws.properties={...ws.properties,defaultRowHeight:15};

  const bytes=await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}

export async function generatePassengerRiskSheet(admin,user,passengerId){
  const [template,ctx]=await Promise.all([loadTemplate(admin),loadPassengerItinerary(admin,passengerId)]);
  const output=await fillRiskWorkbook(template.bytes,ctx);
  const leadCode=safe(ctx.lead.codigo||ctx.lead.id);
  const paxCode=safe(ctx.passenger.passenger_code||ctx.passenger.id);
  const fileName=`${leadCode}_${paxCode}_HOJA_RIESGO_ITINERARIO_COMPLETO.xlsx`;
  const storagePath=`generated/risk-sheets/${leadCode}/${paxCode}/${fileName}`;
  const {error:uploadError}=await admin.storage.from(RISK_BUCKET).upload(storagePath,output,{contentType:RISK_XLSX_MIME,upsert:true,cacheControl:'0'});
  if(uploadError)throw uploadError;

  const generatedAt=new Date().toISOString();
  const startDate=ctx.itinerary[0]?.date||null;
  const endDate=ctx.itinerary.at(-1)?.date||null;
  const riskData={
    source_template_key:RISK_TEMPLATE_KEY,
    source_template_url:template.sourceUrl,
    source_template_file_name:template.fileName,
    source_template_sha256:template.sha256,
    template_source:'database_binary_from_official_xlsx',
    scope:'passenger_full_itinerary',
    lead_id:ctx.lead.id,
    lead_code:ctx.lead.codigo,
    passenger_id:ctx.passenger.id,
    passenger_code:ctx.passenger.passenger_code,
    itinerary_start:startDate,
    itinerary_end:endDate,
    itinerary_service_ids:ctx.itinerary.map(item=>item.service.id),
    itinerary_service_codes:ctx.itinerary.map(item=>item.service.service_code).filter(Boolean),
    itinerary_departure_ids:unique(ctx.itinerary.map(item=>item.departure?.id)),
    itinerary_departure_codes:unique(ctx.itinerary.map(item=>item.departure?.departure_code)),
    storage_bucket:RISK_BUCKET,
    storage_path:storagePath,
    output_format:'xlsx',
    generated_at:generatedAt
  };

  const {data:existing,error:findError}=await admin.from('reservation_documents')
    .select('id,status').eq('lead_id',ctx.passenger.lead_id).eq('passenger_id',ctx.passenger.id)
    .eq('document_type',RISK_DOCUMENT_TYPE).is('departure_id',null).maybeSingle();
  if(findError)throw findError;
  let documentId=existing?.id||null;
  const documentPatch={
    document_type:RISK_DOCUMENT_TYPE,
    title:`Hoja de riesgo · ${ctx.passenger.passenger_code} · itinerario completo`,
    status:'Generada',url:null,risk_data:riskData,completed_at:generatedAt,departure_id:null,
    source_app:'hotel_experience',storage_bucket:RISK_BUCKET,storage_path:storagePath,
    archive_category:'risk',drive_sync_status:'pending',drive_sync_error:null,updated_at:generatedAt
  };
  if(existing?.id){
    const {error}=await admin.from('reservation_documents').update(documentPatch).eq('id',existing.id);
    if(error)throw error;
  }else{
    const {data:inserted,error}=await admin.from('reservation_documents').insert({
      lead_id:ctx.passenger.lead_id,passenger_id:ctx.passenger.id,created_by:user.id,...documentPatch
    }).select('id').single();
    if(error)throw error;
    documentId=inserted.id;
  }

  const drive=documentId?await archiveReservationDocument(admin,documentId).catch(error=>({status:'blocked',error:String(error?.message||error)})):null;
  const {data:signed,error:signedError}=await admin.storage.from(RISK_BUCKET).createSignedUrl(storagePath,3600,{download:fileName});
  if(signedError)throw signedError;
  return{
    url:signed.signedUrl,fileName,passengerCode:ctx.passenger.passenger_code,
    passengerName:ctx.passenger.full_name,leadCode:ctx.lead.codigo,
    itineraryServices:ctx.itinerary.length,itineraryStart:startDate,itineraryEnd:endDate,
    generatedAt,driveSync:drive?.status||'pending',driveUrl:drive?.driveUrl||null,folderUrl:drive?.folderUrl||null
  };
}
