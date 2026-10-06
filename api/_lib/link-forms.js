
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import {PDFDocument} from 'pdf-lib';

export const LINK_FORMS_BUCKET='operation-documents';
export const LINK_FORMS_VERSION=1;
const MAX_FILE_BYTES=8*1024*1024;

export const CANONICAL_FIELDS=[
  {key:'passenger.full_name',label:'Nombre completo del pasajero',collection:'passengers'},
  {key:'passenger.first_name',label:'Nombre del pasajero',collection:'passengers'},
  {key:'passenger.last_name',label:'Apellido del pasajero',collection:'passengers'},
  {key:'passenger.document_type',label:'Tipo de documento',collection:'passengers'},
  {key:'passenger.document_number',label:'Número de documento / pasaporte',collection:'passengers'},
  {key:'passenger.nationality',label:'Nacionalidad',collection:'passengers'},
  {key:'passenger.birth_date',label:'Fecha de nacimiento',collection:'passengers'},
  {key:'passenger.age',label:'Edad',collection:'passengers'},
  {key:'passenger.phone',label:'Teléfono / WhatsApp',collection:'passengers'},
  {key:'passenger.email',label:'Email',collection:'passengers'},
  {key:'passenger.dietary',label:'Restricciones alimentarias',collection:'passengers'},
  {key:'passenger.medical_notes',label:'Observaciones médicas',collection:'passengers'},
  {key:'passenger.disability',label:'Discapacidad / movilidad',collection:'passengers'},
  {key:'passenger.gender',label:'Género / sexo',collection:'passengers'},
  {key:'reservation.code',label:'Código de reserva',collection:'root'},
  {key:'reservation.reference',label:'Referencia de reserva',collection:'root'},
  {key:'reservation.contact',label:'Contacto de la reserva',collection:'root'},
  {key:'reservation.hotel',label:'Hotel / alojamiento',collection:'root'},
  {key:'reservation.arrival_flight',label:'Vuelo de llegada',collection:'root'},
  {key:'reservation.departure_flight',label:'Vuelo de salida',collection:'root'},
  {key:'service.name',label:'Servicio / tour',collection:'root'},
  {key:'service.code',label:'Código de servicio',collection:'root'},
  {key:'service.date',label:'Fecha de servicio',collection:'root'},
  {key:'service.start_time',label:'Hora de inicio',collection:'root'},
  {key:'service.end_time',label:'Hora de término',collection:'root'},
  {key:'operation.pickup_time',label:'Hora de pickup',collection:'operation'},
  {key:'operation.meeting_point',label:'Punto de encuentro',collection:'operation'},
  {key:'operation.guide_name',label:'Guía',collection:'operation'},
  {key:'operation.guide_rut',label:'RUT guía',collection:'operation'},
  {key:'operation.guide_sernatur',label:'Registro SERNATUR guía',collection:'operation'},
  {key:'operation.guide_phone',label:'Teléfono guía',collection:'operation'},
  {key:'operation.driver_name',label:'Conductor',collection:'operation'},
  {key:'operation.driver_rut',label:'RUT conductor',collection:'operation'},
  {key:'operation.driver_phone',label:'Teléfono conductor',collection:'operation'},
  {key:'operation.vehicle_plate',label:'Patente',collection:'operation'},
  {key:'operation.vehicle_type',label:'Vehículo',collection:'operation'},
  {key:'operation.supplier_name',label:'Operador / proveedor',collection:'operation'},
  {key:'operation.supplier_phone',label:'Teléfono operador',collection:'operation'},
  {key:'departure.code',label:'Código de salida',collection:'root'},
  {key:'departure.date',label:'Fecha de salida',collection:'root'},
  {key:'departure.modality',label:'Modalidad',collection:'root'}
];

const FALLBACK_ALIASES={
  'passenger.full_name':['nombre pasajero','nombre completo','pasajero','pax','passenger name','full name','nome do passageiro'],
  'passenger.first_name':['primer nombre','first name','nome'],
  'passenger.last_name':['apellido','apellidos','last name','surname','sobrenome'],
  'passenger.document_type':['tipo documento','document type'],
  'passenger.document_number':['pasaporte','passport','documento','document number','numero documento','número documento'],
  'passenger.nationality':['nacionalidad','nationality','nacionalidade'],
  'passenger.birth_date':['fecha nacimiento','fecha de nacimiento','date of birth','birth date','data de nascimento'],
  'passenger.age':['edad','age'],
  'passenger.phone':['telefono','teléfono','phone','whatsapp','contact phone'],
  'passenger.email':['email','e-mail'],
  'passenger.dietary':['restricciones alimentarias','restricciones','dietary restrictions','food restrictions'],
  'passenger.medical_notes':['antecedentes medicos','antecedentes médicos','observaciones medicas','observaciones médicas','medical notes'],
  'passenger.disability':['discapacidad','disability','movilidad reducida'],
  'passenger.gender':['sexo','genero','género','gender'],
  'reservation.code':['codigo reserva','código reserva','booking code','reservation code'],
  'reservation.reference':['reserva','reservation','booking reference'],
  'reservation.contact':['contacto','contact'],
  'reservation.hotel':['hotel','alojamiento','accommodation'],
  'reservation.arrival_flight':['vuelo llegada','arrival flight'],
  'reservation.departure_flight':['vuelo salida','departure flight'],
  'service.name':['servicio','tour','experiencia','service'],
  'service.code':['codigo servicio','código servicio','service code'],
  'service.date':['fecha servicio','service date','fecha tour'],
  'service.start_time':['hora inicio','start time'],
  'service.end_time':['hora termino','hora término','end time'],
  'operation.pickup_time':['hora pickup','hora salida','pickup time'],
  'operation.meeting_point':['punto de encuentro','pickup','meeting point'],
  'operation.guide_name':['guia','guía','guide'],
  'operation.guide_rut':['rut guia','rut guía'],
  'operation.guide_sernatur':['registro sernatur','sernatur guia','sernatur guía'],
  'operation.guide_phone':['telefono guia','teléfono guía','guide phone'],
  'operation.driver_name':['conductor','driver'],
  'operation.driver_rut':['rut conductor','driver rut'],
  'operation.driver_phone':['telefono conductor','teléfono conductor','driver phone'],
  'operation.vehicle_plate':['patente','vehicle plate','license plate'],
  'operation.vehicle_type':['vehiculo','vehículo','vehicle','tipo vehiculo','tipo vehículo'],
  'operation.supplier_name':['operador','agencia','supplier','proveedor'],
  'operation.supplier_phone':['telefono operador','teléfono operador','supplier phone'],
  'departure.code':['codigo salida','código salida','departure code'],
  'departure.date':['fecha salida','departure date'],
  'departure.modality':['modalidad','modality']
};

function normalize(value=''){
  return String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
}
function safe(value='file'){
  return String(value||'file').replace(/[^A-Za-z0-9._-]+/g,'_').replace(/^_+|_+$/g,'').slice(0,140)||'file';
}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean)))}
function tokens(value){return new Set(normalize(value).split(' ').filter(Boolean))}
function jaccard(a,b){
  const aa=tokens(a),bb=tokens(b);if(!aa.size||!bb.size)return 0;
  let common=0;for(const x of aa)if(bb.has(x))common++;
  return common/(aa.size+bb.size-common);
}
function scoreLabel(label,alias){
  const a=normalize(label),b=normalize(alias);
  if(!a||!b)return 0;
  if(a===b)return 1;
  if(b.length>=4&&a.includes(b))return Math.max(.86,Math.min(.97,b.length/a.length));
  if(a.length>=4&&b.includes(a))return Math.max(.78,Math.min(.92,a.length/b.length));
  const jac=jaccard(a,b);
  if(jac>=.75)return .88;
  if(jac>=.5)return .76;
  return jac*.65;
}
function collectionFor(key){return CANONICAL_FIELDS.find(x=>x.key===key)?.collection||'root'}
function extForKind(kind){return kind==='xlsx'?'xlsx':kind==='pdf'?'pdf':kind==='html'?'html':'json'}
function mimeForKind(kind){
  if(kind==='xlsx')return'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if(kind==='pdf')return'application/pdf';
  if(kind==='html')return'text/html';
  return'application/json';
}
function kindFrom(fileName,mimeType=''){
  const lower=String(fileName||'').toLowerCase(),mime=String(mimeType||'').toLowerCase();
  if(lower.endsWith('.xlsx')||mime.includes('spreadsheetml'))return'xlsx';
  if(lower.endsWith('.pdf')||mime.includes('pdf'))return'pdf';
  if(lower.endsWith('.html')||lower.endsWith('.htm')||mime.includes('text/html'))return'html';
  if(lower.endsWith('.json')||mime.includes('json'))return'json';
  throw Object.assign(new Error('Formato no soportado. Usa XLSX, PDF con campos, HTML o JSON.'),{status:415});
}
function decodeBase64(base64){
  const clean=String(base64||'').replace(/^data:[^;]+;base64,/,'');
  const buffer=Buffer.from(clean,'base64');
  if(!buffer.length)throw Object.assign(new Error('El archivo está vacío.'),{status:400});
  if(buffer.length>MAX_FILE_BYTES)throw Object.assign(new Error('El archivo supera 8 MB.'),{status:413});
  return buffer;
}
function fingerprint(buffer){return crypto.createHash('sha256').update(buffer).digest('hex')}
function ageOn(birthDate,serviceDate){
  if(!birthDate||!serviceDate)return'';
  const birth=new Date(String(birthDate).slice(0,10)+'T00:00:00Z'),at=new Date(String(serviceDate).slice(0,10)+'T00:00:00Z');
  if(Number.isNaN(birth.getTime())||Number.isNaN(at.getTime())||birth>at)return'';
  let age=at.getUTCFullYear()-birth.getUTCFullYear();
  if(at.getUTCMonth()<birth.getUTCMonth()||(at.getUTCMonth()===birth.getUTCMonth()&&at.getUTCDate()<birth.getUTCDate()))age--;
  return age;
}
function splitName(pax){
  if(pax?.first_name||pax?.last_name)return{first_name:pax.first_name||'',last_name:pax.last_name||''};
  const parts=String(pax?.full_name||'').trim().split(/\s+/).filter(Boolean);
  return{first_name:parts.shift()||'',last_name:parts.join(' ')};
}
function hotelFor(lead){return lead?.hotel_partners?.name||lead?.hotel_room||lead?.pickup_location||lead?.empresa_ejecuta||''}
function personName(row){return row?.full_name||row?.name||''}

export async function loadAliases(admin){
  const aliases=[];
  for(const [canonicalKey,values] of Object.entries(FALLBACK_ALIASES))for(const alias of values)aliases.push({canonicalKey,alias,priority:100,scope:'fallback'});
  try{
    const {data,error}=await admin.from('link_form_aliases').select('canonical_key,alias,priority,scope').eq('active',true).order('priority');
    if(!error)for(const row of data||[])aliases.push({canonicalKey:row.canonical_key,alias:row.alias,priority:row.priority||100,scope:row.scope||'global'});
  }catch{}
  const seen=new Set();
  return aliases.filter(item=>{const key=item.canonicalKey+'|'+normalize(item.alias);if(seen.has(key))return false;seen.add(key);return true});
}

export function inferCanonical(label,aliases){
  let best=null;
  for(const alias of aliases||[]){
    let score=scoreLabel(label,alias.alias);
    if(alias.priority)score=Math.max(0,score-Math.min(.08,Math.max(0,(Number(alias.priority)-10)/1500)));
    if(!best||score>best.confidence)best={canonicalKey:alias.canonicalKey,confidence:score,alias:alias.alias};
  }
  if(!best||best.confidence<.58)return null;
  return best;
}

async function enrichOperation(admin,assignment={}){
  const supplierId=assignment?.supplier_id||null,vehicleId=assignment?.vehicle_id||null,peopleIds=unique([assignment?.guide_person_id,assignment?.driver_person_id]);
  const [supplierRes,vehicleRes,peopleRes]=await Promise.all([
    supplierId?admin.from('suppliers').select('*').eq('id',supplierId).maybeSingle():Promise.resolve({data:null,error:null}),
    vehicleId?admin.from('vehicles').select('*').eq('id',vehicleId).maybeSingle():Promise.resolve({data:null,error:null}),
    peopleIds.length?admin.from('service_people').select('*').in('id',peopleIds):Promise.resolve({data:[],error:null})
  ]);
  const people=new Map((peopleRes.data||[]).map(x=>[x.id,x]));
  const guide=people.get(assignment?.guide_person_id)||null,driver=people.get(assignment?.driver_person_id)||null,supplier=supplierRes.data||null,vehicle=vehicleRes.data||null;
  return{
    pickup_time:assignment?.pickup_time||'',meeting_point:assignment?.meeting_point||'',
    guide_name:personName(guide)||assignment?.guide_name||'',guide_rut:guide?.rut||'',guide_sernatur:guide?.sernatur_registration||'',guide_phone:guide?.phone||guide?.whatsapp||'',
    driver_name:personName(driver)||assignment?.driver_name||vehicle?.driver_name||'',driver_rut:driver?.rut||'',driver_phone:driver?.phone||driver?.whatsapp||vehicle?.driver_phone||'',
    vehicle_plate:vehicle?.plate||'',vehicle_type:vehicle?.label||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||assignment?.vehicle_name_manual||'',
    supplier_name:supplier?.name||'',supplier_phone:supplier?.phone||supplier?.whatsapp||'',supplier_rut:supplier?.rut||'',notes:assignment?.notes||''
  };
}

function passengerCanonical(pax,serviceDate,lead){
  const name=splitName(pax);
  return{
    id:pax?.id||'',code:pax?.passenger_code||'',full_name:pax?.full_name||[name.first_name,name.last_name].filter(Boolean).join(' '),
    first_name:name.first_name,last_name:name.last_name,document_type:pax?.document_type||'',document_number:pax?.document_number||'',
    nationality:pax?.nationality||'',birth_date:pax?.birth_date||'',age:ageOn(pax?.birth_date,serviceDate),phone:pax?.phone||'',email:pax?.email||'',
    dietary:pax?.dietary_restrictions||'',medical_notes:pax?.medical_notes||'',disability:pax?.disability_type||'',gender:pax?.gender||'',hotel:hotelFor(lead)
  };
}

export async function buildReservationContext(admin,leadId,leadServiceId=null){
  if(!leadId)throw Object.assign(new Error('Falta leadId para construir el contexto.'),{status:400});
  const {data,error}=await admin.rpc('get_reservation_autofill_context',{p_lead_id:leadId});
  if(error)throw error;if(!data?.lead)throw Object.assign(new Error('Reserva no encontrada.'),{status:404});
  const services=data.services||[],selected=leadServiceId?services.find(x=>x?.service?.id===leadServiceId):services[0];
  const service=selected?.service||{},product=selected?.product||{},departure=selected?.departure||{},assignment=selected?.assignment||{};
  const operation=await enrichOperation(admin,assignment);
  operation.pickup_time=operation.pickup_time||selected?.resolved_operation?.pickup_time||service?.hora_inicio||departure?.start_time||'';
  operation.meeting_point=operation.meeting_point||selected?.resolved_operation?.meeting_point||data.lead?.pickup_location||'';
  operation.notes=operation.notes||service?.observacion||service?.other_notes||'';
  const participantIds=new Set(selected?.participant_ids||[]),allPassengers=data.passengers||[];
  const selectedPassengers=participantIds.size?allPassengers.filter(p=>participantIds.has(p.id)):allPassengers;
  const date=service?.fecha_servicio||departure?.service_date||data.lead?.checkin||'';
  return{
    scope:'reservation',
    reservation:{id:data.lead.id,code:data.lead.codigo||'',reference:data.lead.reservation_reference||data.lead.reserva||'',contact:data.lead.contacto||'',hotel:data.hotel?.name||hotelFor(data.lead),arrival_flight:data.lead.arrival_flight_number||'',departure_flight:data.lead.departure_flight_number||''},
    service:{id:service?.id||'',code:service?.service_code||'',name:service?.producto||product?.name||departure?.product_name||'',date,start_time:service?.hora_inicio||'',end_time:service?.hora_fin||''},
    departure:{id:departure?.id||'',code:departure?.departure_code||'',date:departure?.service_date||date,modality:departure?.modality||service?.modality||'',status:departure?.status||''},
    operation,
    passengers:selectedPassengers.map(p=>passengerCanonical(p,date,data.lead)),
    services:services.map(item=>({id:item?.service?.id||'',code:item?.service?.service_code||'',name:item?.service?.producto||item?.product?.name||'',date:item?.service?.fecha_servicio||item?.departure?.service_date||'',start_time:item?.service?.hora_inicio||'',end_time:item?.service?.hora_fin||''}))
  };
}

export async function buildDepartureContext(admin,departureId){
  if(!departureId)throw Object.assign(new Error('Falta departureId para construir el contexto.'),{status:400});
  const {data:departure,error:departureError}=await admin.from('tour_departures').select('*').eq('id',departureId).single();if(departureError)throw departureError;
  const {data:services,error:serviceError}=await admin.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at');
  if(serviceError)throw serviceError;if(!services?.length)throw Object.assign(new Error('La salida no tiene reservas confirmadas.'),{status:409});
  const leadIds=unique(services.map(x=>x.lead_id)),serviceIds=services.map(x=>x.id);
  const [leadRes,paxRes,linkRes,assignRes]=await Promise.all([
    admin.from('leads').select('*,hotel_partners(name,partner_type)').in('id',leadIds),
    admin.from('passengers').select('*').in('lead_id',leadIds).order('passenger_code'),
    admin.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds).eq('confirmed',true),
    admin.from('service_assignments').select('*').in('lead_service_id',serviceIds).order('created_at')
  ]);
  for(const result of [leadRes,paxRes,linkRes,assignRes])if(result.error)throw result.error;
  const leads=new Map((leadRes.data||[]).map(x=>[x.id,x])),paxById=new Map((paxRes.data||[]).map(x=>[x.id,x])),paxByLead=new Map(),linksByService=new Map();
  for(const p of paxRes.data||[])paxByLead.set(p.lead_id,[...(paxByLead.get(p.lead_id)||[]),p]);
  for(const link of linkRes.data||[])linksByService.set(link.lead_service_id,[...(linksByService.get(link.lead_service_id)||[]),link]);
  const assignment=(assignRes.data||[])[0]||{},operation=await enrichOperation(admin,assignment),passengers=[],seen=new Set();
  for(const service of services){
    const lead=leads.get(service.lead_id),links=linksByService.get(service.id)||[],selected=links.length?links.map(l=>paxById.get(l.passenger_id)).filter(Boolean):(paxByLead.get(service.lead_id)||[]);
    for(const pax of selected){if(seen.has(pax.id))continue;seen.add(pax.id);passengers.push(passengerCanonical(pax,service.fecha_servicio||departure.service_date,lead))}
  }
  const firstService=services[0]||{},firstLead=leads.get(firstService.lead_id)||{};
  operation.pickup_time=operation.pickup_time||firstService.hora_inicio||departure.start_time||'';operation.meeting_point=operation.meeting_point||firstLead.pickup_location||'';
  return{
    scope:'departure',
    reservation:{id:firstLead?.id||'',code:firstLead?.codigo||'',reference:firstLead?.reservation_reference||firstLead?.reserva||'',contact:firstLead?.contacto||'',hotel:hotelFor(firstLead),arrival_flight:firstLead?.arrival_flight_number||'',departure_flight:firstLead?.departure_flight_number||''},
    service:{id:firstService.id||'',code:firstService.service_code||'',name:firstService.producto||departure.product_name||'',date:firstService.fecha_servicio||departure.service_date||'',start_time:firstService.hora_inicio||'',end_time:firstService.hora_fin||''},
    departure:{id:departure.id,code:departure.departure_code||'',date:departure.service_date||'',modality:departure.modality||'',status:departure.status||''},
    operation,passengers,
    services:services.map(s=>({id:s.id,code:s.service_code||'',name:s.producto||'',date:s.fecha_servicio||departure.service_date||'',start_time:s.hora_inicio||'',end_time:s.hora_fin||''}))
  };
}

export async function buildContext(admin,args){
  if(args.contextScope==='departure'||args.departureId)return buildDepartureContext(admin,args.departureId);
  return buildReservationContext(admin,args.leadId,args.leadServiceId||null);
}

export function valueFor(context,canonicalKey,index=0){
  if(canonicalKey.startsWith('passenger.'))return context?.passengers?.[index]?.[canonicalKey.slice('passenger.'.length)]??'';
  const parts=canonicalKey.split('.');let current=context?.[parts.shift()];
  for(const part of parts)current=current?.[part];
  return current??'';
}
function previewFor(context,mapping){return context?valueFor(context,mapping.canonicalKey,0):''}
function chooseXlsxTarget(sheet,row,col){
  const right=sheet.getCell(row,col+1),below=sheet.getCell(row+1,col);
  if(!String(right.value??right.text??'').trim())return{row,column:col+1,address:right.address};
  if(!String(below.value??below.text??'').trim())return{row:row+1,column:col,address:below.address};
  return{row,column:col+1,address:right.address};
}

async function analyzeXlsx(buffer,aliases){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);const fields=[],warnings=[];
  for(const sheet of workbook.worksheets){
    const maxRows=Math.min(Math.max(sheet.rowCount,1),250),maxCols=Math.min(Math.max(sheet.columnCount,1),60),tableRows=new Set();
    for(let row=1;row<=maxRows;row++){
      const recognized=[];let nonEmpty=0;
      for(let col=1;col<=maxCols;col++){
        const cell=sheet.getCell(row,col),label=String(cell.text||cell.value||'').trim();if(!label)continue;nonEmpty++;
        const match=inferCanonical(label,aliases);if(match&&match.confidence>=.72)recognized.push({col,label,...match});
      }
      const passengerMatches=recognized.filter(x=>x.canonicalKey.startsWith('passenger.'));
      if(passengerMatches.length>=2&&passengerMatches.length>=Math.min(3,Math.max(2,Math.ceil(nonEmpty*.35)))){
        tableRows.add(row);
        for(const item of passengerMatches)fields.push({
          targetKey:'xlsxcol:'+sheet.name+':'+row+':'+item.col,fieldLabel:item.label,canonicalKey:item.canonicalKey,confidence:item.confidence,sourceCollection:'passengers',
          target:{kind:'xlsx_column',sheet:sheet.name,headerRow:row,rowStart:row+1,column:item.col,headerAddress:sheet.getCell(row,item.col).address}
        });
      }
    }
    for(let row=1;row<=maxRows;row++)for(let col=1;col<=maxCols;col++){
      if(tableRows.has(row))continue;
      const source=sheet.getCell(row,col),label=String(source.text||source.value||'').trim();if(!label||label.length>120)continue;
      const match=inferCanonical(label,aliases);if(!match||match.confidence<.76)continue;
      const target=chooseXlsxTarget(sheet,row,col);
      fields.push({targetKey:'xlsx:'+sheet.name+':'+target.address,fieldLabel:label,canonicalKey:match.canonicalKey,confidence:match.confidence,sourceCollection:collectionFor(match.canonicalKey),target:{kind:'xlsx_cell',sheet:sheet.name,address:target.address,labelAddress:source.address}});
    }
  }
  const dedup=new Map();for(const field of fields){const prior=dedup.get(field.targetKey);if(!prior||field.confidence>prior.confidence)dedup.set(field.targetKey,field)}
  if(!dedup.size)warnings.push('No se reconocieron campos automáticamente. Puedes enseñar el formulario agregando mapeos manuales.');
  return{fields:[...dedup.values()],warnings,meta:{sheets:workbook.worksheets.map(s=>s.name)}};
}

async function analyzePdf(buffer,aliases){
  const pdf=await PDFDocument.load(buffer,{ignoreEncryption:true}),fields=[],warnings=[];let formFields=[];
  try{formFields=pdf.getForm().getFields()}catch{}
  for(const field of formFields){
    const name=field.getName(),match=inferCanonical(name,aliases);if(!match||match.confidence<.58)continue;
    fields.push({targetKey:'pdf:'+name,fieldLabel:name,canonicalKey:match.canonicalKey,confidence:match.confidence,sourceCollection:collectionFor(match.canonicalKey),target:{kind:'pdf_field',name}});
  }
  if(!formFields.length)warnings.push('El PDF no contiene campos AcroForm editables. Esta versión no escribe sobre PDFs escaneados.');
  else if(!fields.length)warnings.push('El PDF tiene campos, pero sus nombres todavía no coinciden con el diccionario.');
  return{fields,warnings,meta:{pdfFields:formFields.map(f=>f.getName())}};
}
function attribute(tag,name){
  const pattern='\\b'+name+'\\s*=\\s*(["\\\'])(.*?)\\1';
  const match=String(tag).match(new RegExp(pattern,'i'));return match?.[2]||'';
}
function analyzeHtml(buffer,aliases){
  const html=buffer.toString('utf8'),fields=[],warnings=[],tagRegex=/<(input|textarea|select)\b[^>]*>/gi;let match;
  while((match=tagRegex.exec(html))){
    const tag=match[0],name=attribute(tag,'name'),id=attribute(tag,'id'),placeholder=attribute(tag,'placeholder'),aria=attribute(tag,'aria-label'),label=[aria,placeholder,name,id].find(Boolean)||'';
    if(!label)continue;const inferred=inferCanonical(label,aliases);if(!inferred||inferred.confidence<.58)continue;const locator=name||id;
    fields.push({targetKey:'html:'+locator,fieldLabel:label,canonicalKey:inferred.canonicalKey,confidence:inferred.confidence,sourceCollection:collectionFor(inferred.canonicalKey),target:{kind:'html_input',name:name||null,id:id||null,tag:match[1].toLowerCase()}});
  }
  if(!fields.length)warnings.push('No se reconocieron inputs HTML automáticamente.');
  return{fields,warnings,meta:{inputs:fields.length}};
}
function walkJson(value,path=[],out=[]){
  if(value&&typeof value==='object'&&!Array.isArray(value))for(const [key,next] of Object.entries(value)){const nextPath=[...path,key];if(next&&typeof next==='object')walkJson(next,nextPath,out);else out.push({path:nextPath,label:key})}
  return out;
}
function analyzeJson(buffer,aliases){
  let json;try{json=JSON.parse(buffer.toString('utf8'))}catch{throw Object.assign(new Error('JSON inválido.'),{status:400})}
  const fields=[];for(const item of walkJson(json)){const inferred=inferCanonical(item.label,aliases);if(!inferred||inferred.confidence<.58)continue;fields.push({targetKey:'json:'+item.path.join('.'),fieldLabel:item.label,canonicalKey:inferred.canonicalKey,confidence:inferred.confidence,sourceCollection:collectionFor(inferred.canonicalKey),target:{kind:'json_path',path:item.path}})}
  return{fields,warnings:fields.length?[]:['No se reconocieron claves JSON automáticamente.'],meta:{}};
}

export async function analyzeForm(admin,args){
  const buffer=decodeBase64(args.base64),kind=kindFrom(args.fileName,args.mimeType),aliases=await loadAliases(admin);let result;
  if(kind==='xlsx')result=await analyzeXlsx(buffer,aliases);else if(kind==='pdf')result=await analyzePdf(buffer,aliases);else if(kind==='html')result=analyzeHtml(buffer,aliases);else result=analyzeJson(buffer,aliases);
  return{documentKind:kind,fileName:args.fileName,mimeType:args.mimeType||mimeForKind(kind),fingerprint:fingerprint(buffer),fields:result.fields.map(field=>({...field,previewValue:previewFor(args.context,field)})),warnings:result.warnings||[],meta:result.meta||{},dictionary:CANONICAL_FIELDS};
}

function setCell(sheet,address,value){
  if(!sheet||!address)return;const cell=sheet.getCell(address);cell.value=value===''?null:value;cell.alignment={...(cell.alignment||{}),wrapText:true};
}
async function fillXlsx(buffer,mappings,context){
  const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(buffer);const report=[],warnings=[];
  for(const mapping of mappings){
    const target=mapping.target||{},sheet=workbook.getWorksheet(target.sheet);if(!sheet){warnings.push('Hoja no encontrada: '+target.sheet);continue}
    const key=mapping.canonical_key||mapping.canonicalKey;
    if(target.kind==='xlsx_cell'){
      const value=valueFor(context,key,0);setCell(sheet,target.address,value);report.push({target:mapping.target_key||mapping.targetKey,canonicalKey:key,filled:value!==''?1:0,missing:value===''?1:0});
    }else if(target.kind==='xlsx_column'){
      const rows=context.passengers||[];let filled=0,missing=0;
      rows.forEach((_,index)=>{const value=valueFor(context,key,index),address=sheet.getColumn(target.column).letter+(Number(target.rowStart)+index);setCell(sheet,address,value);if(value==='')missing++;else filled++});
      report.push({target:mapping.target_key||mapping.targetKey,canonicalKey:key,filled,missing});
    }
  }
  return{buffer:Buffer.from(await workbook.xlsx.writeBuffer()),report,warnings};
}
async function fillPdf(buffer,mappings,context){
  const pdf=await PDFDocument.load(buffer,{ignoreEncryption:true}),form=pdf.getForm(),report=[],warnings=[];
  for(const mapping of mappings){
    const key=mapping.canonical_key||mapping.canonicalKey,target=mapping.target||{};if(target.kind!=='pdf_field')continue;
    const value=valueFor(context,key,0);let field;try{field=form.getField(target.name)}catch{warnings.push('Campo PDF no encontrado: '+target.name);continue}
    try{
      if(typeof field.setText==='function')field.setText(String(value||''));
      else if(typeof field.select==='function'&&value!=='')field.select(String(value));
      else if(typeof field.check==='function'){if(Boolean(value)&&String(value).toLowerCase()!=='false')field.check();else if(typeof field.uncheck==='function')field.uncheck()}
      else warnings.push('Tipo de campo PDF no soportado: '+target.name);
      report.push({target:mapping.target_key||mapping.targetKey,canonicalKey:key,filled:value!==''?1:0,missing:value===''?1:0});
    }catch(error){warnings.push(target.name+': '+(error?.message||'no se pudo rellenar'))}
  }
  return{buffer:Buffer.from(await pdf.save()),report,warnings};
}
function escapeHtml(value){return String(value??'').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function fillHtml(buffer,mappings,context){
  let html=buffer.toString('utf8');const report=[],warnings=[];
  for(const mapping of mappings){
    const target=mapping.target||{};if(target.kind!=='html_input')continue;
    const key=mapping.canonical_key||mapping.canonicalKey,value=String(valueFor(context,key,0)??''),locator=target.name?{attr:'name',value:target.name}:target.id?{attr:'id',value:target.id}:null;if(!locator)continue;
    const escapedLocator=String(locator.value).replace(/[.*+?^$()|[\]\\]/g,'\\$&');
    if(target.tag==='textarea'){
      const re=new RegExp('(<textarea\\b[^>]*\\b'+locator.attr+'=["\\\']'+escapedLocator+'["\\\'][^>]*>)[\\s\\S]*?(</textarea>)','i');
      html=html.replace(re,'$1'+escapeHtml(value)+'$2');
    }else{
      const re=new RegExp('<'+target.tag+'\\b[^>]*\\b'+locator.attr+'=["\\\']'+escapedLocator+'["\\\'][^>]*>','i');
      html=html.replace(re,tag=>/\bvalue\s*=/.test(tag)?tag.replace(/\bvalue\s*=\s*(["']).*?\1/i,'value="'+escapeHtml(value)+'"'):tag.replace(/>$/,' value="'+escapeHtml(value)+'">'));
    }
    report.push({target:mapping.target_key||mapping.targetKey,canonicalKey:key,filled:value!==''?1:0,missing:value===''?1:0});
  }
  return{buffer:Buffer.from(html,'utf8'),report,warnings};
}
function setJsonPath(root,path,value){let current=root;for(let i=0;i<path.length-1;i++){const key=path[i];if(!current[key]||typeof current[key]!=='object')current[key]={};current=current[key]}current[path[path.length-1]]=value}
function fillJson(buffer,mappings,context){
  const json=JSON.parse(buffer.toString('utf8')),report=[],warnings=[];
  for(const mapping of mappings){const target=mapping.target||{};if(target.kind!=='json_path')continue;const key=mapping.canonical_key||mapping.canonicalKey,value=valueFor(context,key,0);setJsonPath(json,target.path,value);report.push({target:mapping.target_key||mapping.targetKey,canonicalKey:key,filled:value!==''?1:0,missing:value===''?1:0})}
  return{buffer:Buffer.from(JSON.stringify(json,null,2),'utf8'),report,warnings};
}

export async function saveTemplate(admin,user,args){
  const buffer=decodeBase64(args.base64),kind=kindFrom(args.fileName,args.mimeType),id=crypto.randomUUID(),keyBase=safe(args.title||args.fileName).replace(/\.[^.]+$/,'').toLowerCase(),templateKey=(keyBase||'form')+'-'+fingerprint(buffer).slice(0,8),storagePath='link-forms/templates/'+id+'/'+safe(args.fileName);
  const {error:uploadError}=await admin.storage.from(LINK_FORMS_BUCKET).upload(storagePath,buffer,{contentType:args.mimeType||mimeForKind(kind),upsert:false,cacheControl:'0'});if(uploadError)throw uploadError;
  const {data:template,error:templateError}=await admin.from('link_form_templates').insert({id,template_key:templateKey,title:args.title||args.fileName,business_scope:args.businessScope||'link',context_scope:args.contextScope||'reservation',document_kind:kind,file_name:args.fileName,mime_type:args.mimeType||mimeForKind(kind),storage_bucket:LINK_FORMS_BUCKET,storage_path:storagePath,fingerprint:fingerprint(buffer),parser_version:LINK_FORMS_VERSION,created_by:user.id}).select('*').single();
  if(templateError)throw templateError;
  const rows=(args.fields||[]).filter(x=>x?.canonicalKey||x?.canonical_key).map(field=>({template_id:id,target_key:field.targetKey||field.target_key,field_label:field.fieldLabel||field.field_label||field.targetKey,canonical_key:field.canonicalKey||field.canonical_key,target:field.target||{},source_collection:field.sourceCollection||field.source_collection||collectionFor(field.canonicalKey||field.canonical_key),confidence:Number(field.confidence||0),required:Boolean(field.required),mapping_source:field.mappingSource||field.mapping_source||'manual',notes:field.notes||null}));
  if(rows.length){const {error}=await admin.from('link_form_fields').insert(rows);if(error)throw error}
  return{...template,fieldCount:rows.length};
}
export async function listTemplates(admin){
  const {data,error}=await admin.from('link_form_templates').select('*').eq('active',true).order('updated_at',{ascending:false});if(error)throw error;
  const ids=(data||[]).map(x=>x.id),fieldsRes=ids.length?await admin.from('link_form_fields').select('template_id,id').in('template_id',ids):{data:[],error:null};if(fieldsRes.error)throw fieldsRes.error;
  const counts=new Map();for(const row of fieldsRes.data||[])counts.set(row.template_id,(counts.get(row.template_id)||0)+1);
  return(data||[]).map(x=>({...x,field_count:counts.get(x.id)||0}));
}
export async function loadTemplate(admin,templateId){
  const [templateRes,fieldsRes]=await Promise.all([admin.from('link_form_templates').select('*').eq('id',templateId).single(),admin.from('link_form_fields').select('*').eq('template_id',templateId).order('created_at')]);
  if(templateRes.error)throw templateRes.error;if(fieldsRes.error)throw fieldsRes.error;return{template:templateRes.data,fields:fieldsRes.data||[]};
}
export async function generateForm(admin,user,args){
  const loaded=await loadTemplate(admin,args.templateId),template=loaded.template,fields=loaded.fields,context=await buildContext(admin,{leadId:args.leadId,departureId:args.departureId,leadServiceId:args.leadServiceId,contextScope:template.context_scope});
  const {data:blob,error:downloadError}=await admin.storage.from(template.storage_bucket).download(template.storage_path);if(downloadError||!blob)throw downloadError||new Error('No se pudo leer la plantilla.');
  const input=Buffer.from(await blob.arrayBuffer());let result;
  if(template.document_kind==='xlsx')result=await fillXlsx(input,fields,context);else if(template.document_kind==='pdf')result=await fillPdf(input,fields,context);else if(template.document_kind==='html')result=fillHtml(input,fields,context);else result=fillJson(input,fields,context);
  const runId=crypto.randomUUID(),entityCode=context.departure?.code||context.reservation?.code||runId.slice(0,8),extension=extForKind(template.document_kind),outputFileName=safe(template.template_key)+'_'+safe(entityCode)+'_AUTORELLENADO.'+extension,outputPath='link-forms/generated/'+runId+'/'+outputFileName;
  const {error:uploadError}=await admin.storage.from(LINK_FORMS_BUCKET).upload(outputPath,result.buffer,{contentType:template.mime_type||mimeForKind(template.document_kind),upsert:false,cacheControl:'0'});if(uploadError)throw uploadError;
  const missing=result.report.reduce((sum,row)=>sum+Number(row.missing||0),0),filled=result.report.reduce((sum,row)=>sum+Number(row.filled||0),0),warnings=[...(result.warnings||[])];if(missing)warnings.push(missing+' valor(es) quedaron vacíos porque no existen en la fuente de verdad.');
  const {error:runError}=await admin.from('link_form_runs').insert({id:runId,template_id:args.templateId,lead_id:args.leadId||null,departure_id:args.departureId||null,lead_service_id:args.leadServiceId||null,status:'generated',input_context:{scope:context.scope,reservation_code:context.reservation?.code||null,departure_code:context.departure?.code||null},mapping_report:{filled,missing,fields:result.report},warnings,output_bucket:LINK_FORMS_BUCKET,output_path:outputPath,output_file_name:outputFileName,created_by:user.id});if(runError)throw runError;
  const {data:signed,error:signedError}=await admin.storage.from(LINK_FORMS_BUCKET).createSignedUrl(outputPath,3600,{download:outputFileName});if(signedError)throw signedError;
  return{runId,url:signed.signedUrl,fileName:outputFileName,filled,missing,warnings,report:result.report};
}
