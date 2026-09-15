import ExcelJS from 'exceljs';

export const OPERATION_LIST_BUCKET='operation-documents';
export const OPERATION_LIST_DOC_TYPE='prefilled_lists';

const TEMPLATE_SHEETS={
  luna:'Template_Luna',
  chaxa:'Template_Chaxa',
  marte:'Template_Marte',
  socaire:'Template_Socaire',
  arcoiris:'Template_Arcoiris',
  catarpe:'Template_Catarpe',
  quitor:'Template_Quitor',
  talabre:'Template_Talabre',
  coyo:'Template_Coyo',
  frontera:'Template_Frontera',
  transfer:'Template_Transfer',
  tatio:'Template_Tatio',
  otros:'Template_Otros'
};

const DISPLAY={
  luna:'LUNA',chaxa:'CHAXA',marte:'MARTE',socaire:'SOCAIRE',arcoiris:'ARCOIRIS',catarpe:'CATARPE',
  quitor:'QUITOR',talabre:'TALABRE',coyo:'COYO',frontera:'FRONTERA',transfer:'TRANSFER',tatio:'TATIO',otros:'OTROS'
};

function normalize(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function unique(values){return Array.from(new Set(values.filter(v=>v!==null&&v!==undefined&&String(v).trim()!=='')));}
function safe(value){return String(value||'').replace(/[^A-Za-z0-9_-]/g,'_');}
function excelDate(value){if(!value)return null;const [y,m,d]=String(value).slice(0,10).split('-').map(Number);return y&&m&&d?new Date(y,m-1,d,12,0,0):null;}
function ageAt(birth,at){if(!birth)return null;const b=excelDate(birth);const d=excelDate(at);if(!b||!d)return null;let age=d.getFullYear()-b.getFullYear();if(d.getMonth()<b.getMonth()||(d.getMonth()===b.getMonth()&&d.getDate()<b.getDate()))age--;return age>=0?age:null;}
function splitName(p){if(p.first_name||p.last_name)return{first:p.first_name||'',last:p.last_name||''};return{first:p.full_name||'',last:''};}
function gender(p){return String(p.gender||'').trim().toUpperCase();}
function mark(value){return value?'X':'';}
function hotelFor(lead){return lead?.hotel_partners?.partner_type==='hotel'?(lead.hotel_partners.name||''):(lead?.hotel_room||lead?.pickup_location||'');}
function fullName(p){return p.full_name||[p.first_name,p.last_name].filter(Boolean).join(' ');}
function contact(p){return [p.phone,p.email].filter(Boolean).join(' / ');}
function cell(sheet,address,value,date=false){if(!sheet||value===null||value===undefined||value==='')return;const c=sheet.getCell(address);c.value=value;if(date)c.numFmt='dd-mm-yyyy';}
function setText(sheet,address,value){if(!sheet)return;sheet.getCell(address).value=value??'';}
function disabilityFlags(p){const d=normalize(p.disability_type);return{physical:d.includes('fis')||d.includes('movilidad')||d.includes('silla'),sensory:d.includes('sens')||d.includes('visual')||d.includes('audit')};}
function ageBand(age,bands){for(const [label,min,max] of bands){if(age!==null&&age!==undefined&&age>=min&&(max===null||age<=max))return label;}return'';}

function duplicateSheet(workbook,source,name){
  try{
    const model=structuredClone(source.model);
    const target=workbook.addWorksheet(name);
    model.id=target.id;model.name=name;target.model=model;
    return target;
  }catch{return null;}
}

function googleExportUrl(source){
  const match=String(source||'').match(/spreadsheets\/d\/([A-Za-z0-9_-]+)/);
  return match?`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=xlsx`:null;
}
function byteaBuffer(value){
  if(!value)return null;
  if(Buffer.isBuffer(value))return value;
  if(value instanceof Uint8Array)return Buffer.from(value);
  const text=String(value);
  if(text.startsWith('\\x')&&/^[0-9a-f]+$/i.test(text.slice(2)))return Buffer.from(text.slice(2),'hex');
  try{return Buffer.from(text,'base64')}catch{return null}
}
async function loadMasterWorkbook(admin){
  const {data}=await admin.from('operation_templates').select('file_bytes,source_url').eq('template_key','site_lists_master').eq('active',true).maybeSingle();
  const embedded=byteaBuffer(data?.file_bytes);
  if(embedded?.length){
    try{const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(embedded);return{workbook,source:'database'}}catch{}
  }
  const exportUrl=googleExportUrl(data?.source_url);
  if(exportUrl){
    try{
      const response=await fetch(exportUrl,{redirect:'follow'});
      if(response.ok){
        const bytes=Buffer.from(await response.arrayBuffer());
        if(bytes[0]===0x50&&bytes[1]===0x4b){const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(bytes);return{workbook,source:'google_sheet'}}
      }
    }catch{}
  }
  return{workbook:new ExcelJS.Workbook(),source:'generated_fallback'};
}

function inferTemplateKeys(departure,product,services){
  const keys=[];
  if(product?.operation_list_template_key)keys.push(product.operation_list_template_key);
  const text=normalize([
    departure?.product_name,departure?.tour_id,
    product?.name,product?.code,product?.product_slug,product?.stops,
    ...(services||[]).flatMap(s=>[s.producto,s.tour_id,s.service_type,s.observacion])
  ].filter(Boolean).join(' '));
  const add=(key,condition)=>{if(condition&&!keys.includes(key))keys.push(key)};
  add('luna',/valle de la luna|valle luna/.test(text));
  add('chaxa',/chaxa|salar de atacama/.test(text));
  add('socaire',/socaire|altiplan|piedras rojas|aguas calientes|miscanti|miniques/.test(text));
  add('tatio',/tatio|geiser|geyser/.test(text));
  add('arcoiris',/arcoiris|arco iris|yerbas buenas/.test(text));
  add('catarpe',/catarpe|cuchabrache/.test(text));
  add('quitor',/quitor|pukara/.test(text));
  add('talabre',/talabre|kezala/.test(text));
  add('coyo',/coyo|baltinache|tebinquinche|tebenquinche|tulor|vallecito|laguna cejar/.test(text));
  add('marte',/valle de marte|valle marte|valle de la muerte/.test(text));
  add('frontera',/hito cajon|frontera/.test(text));
  add('transfer',/\btrf\b|transfer|traslado|aeropuerto/.test(text));
  return keys.length?keys:['otros'];
}

function chooseOperationalContext(assignments,suppliers,vehicles,people,warnings){
  const supplierById=new Map(suppliers.map(x=>[x.id,x]));
  const vehicleById=new Map(vehicles.map(x=>[x.id,x]));
  const peopleById=new Map(people.map(x=>[x.id,x]));
  const values=(fn)=>unique(assignments.map(fn));
  const warnConflict=(label,list)=>{if(list.length>1)warnings.push(`${label}: hay valores distintos entre reservas de la misma salida (${list.join(' / ')}). Se usa el primero y el detalle queda visible en CONTROL.`)};
  const supplierIds=values(a=>a.supplier_id);const vehicleIds=values(a=>a.vehicle_id);const guideIds=values(a=>a.guide_person_id);const driverIds=values(a=>a.driver_person_id);
  const guideNames=values(a=>a.guide_name);const driverNames=values(a=>a.driver_name);const meetingPoints=values(a=>a.meeting_point);const pickupTimes=values(a=>a.pickup_time);
  warnConflict('Proveedor',supplierIds.map(id=>supplierById.get(id)?.name||id));
  warnConflict('Vehículo',vehicleIds.map(id=>vehicleById.get(id)?.plate||vehicleById.get(id)?.label||id));
  warnConflict('Guía',guideIds.map(id=>peopleById.get(id)?.full_name||id).concat(guideIds.length?[]:guideNames));
  warnConflict('Conductor',driverIds.map(id=>peopleById.get(id)?.full_name||id).concat(driverIds.length?[]:driverNames));
  warnConflict('Punto de encuentro',meetingPoints);warnConflict('Pickup',pickupTimes.map(v=>String(v).slice(0,5)));
  const first=assignments[0]||{};
  const supplier=supplierById.get(supplierIds[0])||null;
  const vehicle=vehicleById.get(vehicleIds[0])||null;
  const guide=peopleById.get(guideIds[0])||null;
  const driver=peopleById.get(driverIds[0])||null;
  return{
    supplier,vehicle,
    guideName:guide?.full_name||guideNames[0]||'',guideRut:guide?.rut||'',guideSernatur:guide?.sernatur_registration||'',guidePhone:guide?.phone||guide?.whatsapp||'',
    driverName:driver?.full_name||driverNames[0]||'',driverRut:driver?.rut||'',driverPhone:driver?.phone||driver?.whatsapp||'',
    meetingPoint:meetingPoints.length===1?meetingPoints[0]:'VER CONTROL',pickupTime:pickupTimes.length===1?String(pickupTimes[0]).slice(0,5):'',
    assignment:first
  };
}

async function loadDepartureData(admin,departureId){
  const {data:departure,error:departureError}=await admin.from('tour_departures').select('*').eq('id',departureId).single();
  if(departureError)throw departureError;
  const {data:services,error:serviceError}=await admin.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at');
  if(serviceError)throw serviceError;
  if(!services?.length)throw Object.assign(new Error('La salida no tiene reservas confirmadas o completadas.'),{status:409});
  const leadIds=unique(services.map(s=>s.lead_id));const serviceIds=services.map(s=>s.id);
  const [{data:leads,error:leadError},{data:passengers,error:paxError},{data:links,error:linkError},{data:assignments,error:assignmentError}]=await Promise.all([
    admin.from('leads').select('*,hotel_partners(name,partner_type)').in('id',leadIds),
    admin.from('passengers').select('*').in('lead_id',leadIds).order('passenger_code'),
    admin.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds).eq('confirmed',true),
    admin.from('service_assignments').select('*').in('lead_service_id',serviceIds)
  ]);
  if(leadError)throw leadError;if(paxError)throw paxError;if(linkError)throw linkError;if(assignmentError)throw assignmentError;
  const productId=departure.product_catalog_id||services.find(s=>s.product_catalog_id)?.product_catalog_id||null;
  const {data:product}=productId?await admin.from('product_catalog').select('id,name,code,category,product_slug,stops,operation_list_template_key').eq('id',productId).maybeSingle():{data:null};
  const supplierIds=unique((assignments||[]).map(a=>a.supplier_id));const vehicleIds=unique((assignments||[]).map(a=>a.vehicle_id));const peopleIds=unique((assignments||[]).flatMap(a=>[a.guide_person_id,a.driver_person_id]));
  const [supplierRes,vehicleRes,peopleRes]=await Promise.all([
    supplierIds.length?admin.from('suppliers').select('*').in('id',supplierIds):Promise.resolve({data:[]}),
    vehicleIds.length?admin.from('vehicles').select('*').in('id',vehicleIds):Promise.resolve({data:[]}),
    peopleIds.length?admin.from('service_people').select('*').in('id',peopleIds):Promise.resolve({data:[]})
  ]);
  const leadById=new Map((leads||[]).map(x=>[x.id,x]));const paxById=new Map((passengers||[]).map(x=>[x.id,x]));const paxByLead=new Map();
  (passengers||[]).forEach(p=>paxByLead.set(p.lead_id,[...(paxByLead.get(p.lead_id)||[]),p]));
  const linksByService=new Map();(links||[]).forEach(link=>linksByService.set(link.lead_service_id,[...(linksByService.get(link.lead_service_id)||[]),link]));
  const assignmentByService=new Map((assignments||[]).map(x=>[x.lead_service_id,x]));
  const warnings=[];const rows=[];
  for(const service of services){
    const lead=leadById.get(service.lead_id);if(!lead)continue;
    const serviceLinks=(linksByService.get(service.id)||[]).slice().sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    let selected=serviceLinks.map(link=>paxById.get(link.passenger_id)).filter(Boolean);
    if(!serviceLinks.length){selected=(paxByLead.get(service.lead_id)||[]).slice(0,Math.max(0,Number(service.numero_pax||0)));warnings.push(`${service.service_code}: no tenía relación explícita servicio↔pasajero; se usaron los primeros ${selected.length} pasajeros del ingreso.`)}
    for(const p of selected){rows.push({lead,service,passenger:p,assignment:assignmentByService.get(service.id)||null,hotel:hotelFor(lead)});}
  }
  const expected=services.reduce((sum,s)=>sum+Number(s.numero_pax||0),0);
  if(rows.length!==expected)warnings.push(`La salida suma ${expected} pax en reservas y ${rows.length} pasajeros vinculados a las listas.`);
  const context=chooseOperationalContext(assignments||[],supplierRes.data||[],vehicleRes.data||[],peopleRes.data||[],warnings);
  const templateKeys=inferTemplateKeys(departure,product,services);
  return{departure,services,leads:leads||[],rows,product,context,warnings,templateKeys};
}

function styleControl(sheet){
  sheet.views=[{state:'frozen',ySplit:5}];
  sheet.getRow(1).height=30;sheet.getCell('A1').font={bold:true,size:16,color:{argb:'FFFFFFFF'}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF111111'}};
  sheet.mergeCells('A1:L1');sheet.getCell('A1').alignment={vertical:'middle'};
  ['A5:L5'].forEach(range=>{const r=sheet.getRange(range);r.font={bold:true,color:{argb:'FFFFFFFF'}};r.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3D3A36'}};r.alignment={vertical:'middle'};});
  const widths=[15,13,16,19,20,19,24,26,18,18,28,28];widths.forEach((w,i)=>sheet.getColumn(i+1).width=w);
}
function fillControl(workbook,data,source){
  const old=workbook.getWorksheet('CONTROL');if(old)workbook.removeWorksheet(old.id);
  const sheet=workbook.addWorksheet('CONTROL');styleControl(sheet);
  sheet.getCell('A1').value=`HOTEL EXPERIENCE · LISTAS PRELLENADAS · ${data.departure.departure_code}`;
  sheet.getCell('A2').value='Tour / salida';sheet.getCell('B2').value=data.departure.departure_code;sheet.getCell('C2').value='Producto';sheet.getCell('D2').value=data.departure.product_name;
  sheet.getCell('E2').value='Fecha';sheet.getCell('F2').value=excelDate(data.departure.service_date);sheet.getCell('F2').numFmt='dd-mm-yyyy';sheet.getCell('G2').value='Modalidad';sheet.getCell('H2').value=data.departure.modality;
  sheet.getCell('A3').value='Reservas';sheet.getCell('B3').value=unique(data.services.map(s=>s.lead_id)).length;sheet.getCell('C3').value='Pasajeros';sheet.getCell('D3').value=data.rows.length;sheet.getCell('E3').value='Plantilla';sheet.getCell('F3').value=source;sheet.getCell('G3').value='Listas';sheet.getCell('H3').value=data.templateKeys.map(k=>DISPLAY[k]||k).join(' + ');
  sheet.getRow(5).values=['#','Código ingreso','Código servicio','Código pax','Reserva','Pasajero','Documento','Nacionalidad','Hotel / pickup','Teléfono','Restricciones / salud','Asignación / observación'];
  data.rows.forEach((row,index)=>{
    const p=row.passenger;const a=row.assignment||{};
    sheet.getRow(6+index).values=[index+1,row.lead.codigo,row.service.service_code,p.passenger_code,row.lead.reserva,fullName(p),[p.document_type,p.document_number].filter(Boolean).join(' '),p.nationality||'',row.hotel||'',p.phone||'',[p.dietary_restrictions,p.disability_type,p.medical_notes].filter(Boolean).join(' · '),[a.guide_name,a.driver_name,a.meeting_point,row.service.observacion].filter(Boolean).join(' · ')];
    sheet.getRow(6+index).alignment={vertical:'top',wrapText:true};
  });
  const warningRow=7+data.rows.length;
  if(data.warnings.length){sheet.getCell(`A${warningRow}`).value='VALIDACIONES';sheet.getCell(`A${warningRow}`).font={bold:true};sheet.mergeCells(`A${warningRow}:L${warningRow}`);data.warnings.forEach((w,i)=>{sheet.getCell(`A${warningRow+1+i}`).value=`• ${w}`;sheet.mergeCells(`A${warningRow+1+i}:L${warningRow+1+i}`);sheet.getCell(`A${warningRow+1+i}`).alignment={wrapText:true};});}
  return sheet;
}

function findLabel(sheet,pattern,occurrence=0,maxRows=22,maxCols=28){
  const target=normalize(pattern);let found=0;
  for(let r=1;r<=Math.min(maxRows,sheet.rowCount||maxRows);r++)for(let c=1;c<=maxCols;c++){
    const value=normalize(sheet.getCell(r,c).text||sheet.getCell(r,c).value);
    if(value&&value.includes(target)){if(found++===occurrence)return{row:r,col:c};}
  }
  return null;
}
function rightOf(sheet,label,value,occurrence=0){if(value===null||value===undefined||value==='')return;const pos=findLabel(sheet,label,occurrence);if(pos)cell(sheet,`${sheet.getColumn(pos.col+1).letter}${pos.row}`,value,value instanceof Date);}
function setMetaByLabels(sheet,data){
  const c=data.context;const d=data.departure;
  rightOf(sheet,'fecha',excelDate(d.service_date));rightOf(sheet,'servicio',d.product_name);rightOf(sheet,'conductor',c.driverName);rightOf(sheet,'patente',c.vehicle?.plate||'');rightOf(sheet,'guía',c.guideName);rightOf(sheet,'guia',c.guideName);
  rightOf(sheet,'registro sernatur',c.guideSernatur||c.guideRut,0);rightOf(sheet,'rut empresa',c.supplier?.rut||'');rightOf(sheet,'agencia',c.supplier?.name||'');rightOf(sheet,'operador',c.supplier?.name||'');
}
function fillStandard(sheet,data,startRow){
  setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=startRow+index;const p=row.passenger;const name=splitName(p);cell(sheet,`B${r}`,index+1);cell(sheet,`C${r}`,name.first);cell(sheet,`D${r}`,name.last);cell(sheet,`E${r}`,p.document_number||'');cell(sheet,`F${r}`,p.nationality||'');cell(sheet,`G${r}`,row.hotel||'');cell(sheet,`H${r}`,p.dietary_restrictions||'');cell(sheet,`I${r}`,gender(p));cell(sheet,`J${r}`,excelDate(p.birth_date),true);cell(sheet,`K${r}`,ageAt(p.birth_date,row.service.fecha_servicio));});
}
function fillLuna(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=10+index,p=row.passenger,n=splitName(p),age=ageAt(p.birth_date,row.service.fecha_servicio),d=disabilityFlags(p);cell(sheet,`B${r}`,n.first);cell(sheet,`C${r}`,n.last);cell(sheet,`E${r}`,p.nationality||'');cell(sheet,`G${r}`,p.document_number||'');cell(sheet,`I${r}`,mark(gender(p)==='F'));cell(sheet,`J${r}`,mark(gender(p)==='M'));cell(sheet,`K${r}`,mark(gender(p)&&!['F','M'].includes(gender(p))));cell(sheet,`L${r}`,mark(age!==null&&age<18));cell(sheet,`M${r}`,mark(age!==null&&age>=18&&age<=35));cell(sheet,`N${r}`,mark(age!==null&&age>=36&&age<=59));cell(sheet,`O${r}`,mark(age!==null&&age>=60));cell(sheet,`Q${r}`,mark(d.physical));cell(sheet,`R${r}`,mark(d.sensory));});}
function fillChaxa(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=13+index,p=row.passenger,age=ageAt(p.birth_date,row.service.fecha_servicio),nat=normalize(p.nationality);cell(sheet,`B${r}`,index+1);cell(sheet,`C${r}`,excelDate(row.service.fecha_servicio),true);cell(sheet,`D${r}`,fullName(p));cell(sheet,`F${r}`,p.nationality||'');cell(sheet,`G${r}`,p.phone||'');cell(sheet,`H${r}`,age);cell(sheet,`I${r}`,mark(gender(p)==='M'));cell(sheet,`J${r}`,mark(gender(p)==='F'));cell(sheet,`P${r}`,mark(age!==null&&age>=18&&age<60));cell(sheet,`Q${r}`,mark(age!==null&&age<18));cell(sheet,`S${r}`,mark(age!==null&&age>=60));cell(sheet,`T${r}`,mark(Boolean(p.disability_type)));cell(sheet,`V${r}`,mark(nat.includes('chile')));cell(sheet,`W${r}`,mark(Boolean(nat)&&!nat.includes('chile')));cell(sheet,`X${r}`,p.medical_notes||'');});}
function fillSocaire(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=16+index,p=row.passenger,age=ageAt(p.birth_date,row.service.fecha_servicio);cell(sheet,`B${r}`,index+1);cell(sheet,`C${r}`,fullName(p));cell(sheet,`E${r}`,row.lead.codigo);cell(sheet,`F${r}`,p.nationality||'');cell(sheet,`H${r}`,p.document_number||'');cell(sheet,`I${r}`,gender(p));cell(sheet,`J${r}`,ageBand(age,[['<18',0,17],['18-35',18,35],['36-59',36,59],['60+',60,null]]));cell(sheet,`K${r}`,p.disability_type||'');cell(sheet,`L${r}`,row.hotel||'');cell(sheet,`N${r}`,p.phone||'');});}
function fillTalabre(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=20+index,p=row.passenger,age=ageAt(p.birth_date,row.service.fecha_servicio);cell(sheet,`A${r}`,fullName(p));cell(sheet,`B${r}`,p.document_number||'');cell(sheet,`C${r}`,mark(gender(p)==='M'));cell(sheet,`D${r}`,mark(gender(p)==='F'));cell(sheet,`E${r}`,mark(gender(p)&&!['M','F'].includes(gender(p))));cell(sheet,`F${r}`,p.nationality||'');cell(sheet,`G${r}`,mark(age!==null&&age<=11));cell(sheet,`H${r}`,mark(age!==null&&age>=12&&age<=29));cell(sheet,`I${r}`,mark(age!==null&&age>=30&&age<=64));cell(sheet,`J${r}`,mark(age!==null&&age>=65));cell(sheet,`L${r}`,row.hotel||'');cell(sheet,`M${r}`,p.phone||'');cell(sheet,`N${r}`,p.medical_notes||'');});}
function fillCoyo(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=21+index,p=row.passenger,age=ageAt(p.birth_date,row.service.fecha_servicio),d=disabilityFlags(p);cell(sheet,`A${r}`,index+1);cell(sheet,`B${r}`,fullName(p));cell(sheet,`C${r}`,p.document_number||'');cell(sheet,`D${r}`,p.nationality||'');cell(sheet,`E${r}`,contact(p));cell(sheet,`F${r}`,mark(gender(p)==='F'));cell(sheet,`G${r}`,mark(gender(p)==='M'));cell(sheet,`H${r}`,mark(d.physical));cell(sheet,`I${r}`,mark(d.sensory));cell(sheet,`J${r}`,mark(age!==null&&age<=17));cell(sheet,`K${r}`,mark(age!==null&&age>=18&&age<=59));cell(sheet,`L${r}`,mark(age!==null&&age>=60));});}
function fillMarte(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=14+index,p=row.passenger;cell(sheet,`A${r}`,index+1);cell(sheet,`B${r}`,fullName(p));cell(sheet,`D${r}`,p.nationality||'');cell(sheet,`G${r}`,p.document_number||'');cell(sheet,`I${r}`,row.hotel||'');cell(sheet,`J${r}`,ageAt(p.birth_date,row.service.fecha_servicio));cell(sheet,`K${r}`,p.phone||'');});}
function fillArcoiris(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=17+index,p=row.passenger,age=ageAt(p.birth_date,row.service.fecha_servicio),d=disabilityFlags(p);cell(sheet,`A${r}`,index+1);cell(sheet,`B${r}`,fullName(p));cell(sheet,`H${r}`,row.hotel||'');cell(sheet,`J${r}`,p.document_number||'');cell(sheet,`K${r}`,p.phone||'');cell(sheet,`M${r}`,mark(d.physical));cell(sheet,`N${r}`,mark(d.sensory));cell(sheet,`O${r}`,mark(gender(p)==='F'));cell(sheet,`P${r}`,mark(gender(p)==='M'));cell(sheet,`Q${r}`,mark(age!==null&&age<=19));cell(sheet,`R${r}`,mark(age!==null&&age>=20&&age<=35));cell(sheet,`S${r}`,mark(age!==null&&age>=36&&age<=59));cell(sheet,`T${r}`,mark(age!==null&&age>=60));});}
function fillCatarpe(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=17+index,p=row.passenger,n=splitName(p),age=ageAt(p.birth_date,row.service.fecha_servicio),d=disabilityFlags(p);cell(sheet,`B${r}`,index+1);cell(sheet,`C${r}`,n.first);cell(sheet,`I${r}`,n.last);cell(sheet,`K${r}`,row.hotel||'');cell(sheet,`M${r}`,p.document_number||'');cell(sheet,`N${r}`,p.phone||'');cell(sheet,`Q${r}`,mark(d.physical));cell(sheet,`R${r}`,mark(d.sensory));cell(sheet,`S${r}`,mark(gender(p)==='F'));cell(sheet,`T${r}`,mark(gender(p)==='M'));cell(sheet,`U${r}`,mark(age!==null&&age<=19));cell(sheet,`V${r}`,mark(age!==null&&age>=20&&age<=35));cell(sheet,`W${r}`,mark(age!==null&&age>=36&&age<=59));cell(sheet,`X${r}`,mark(age!==null&&age>=60));});}
function fillQuitor(sheet,data){setMetaByLabels(sheet,data);data.rows.forEach((row,index)=>{const r=14+index,p=row.passenger,d=disabilityFlags(p);cell(sheet,`A${r}`,index+1);cell(sheet,`B${r}`,fullName(p));cell(sheet,`F${r}`,p.nationality||'');cell(sheet,`H${r}`,p.document_number||'');cell(sheet,`I${r}`,row.hotel||'');cell(sheet,`K${r}`,mark(d.physical));cell(sheet,`L${r}`,mark(d.sensory));cell(sheet,`M${r}`,mark(gender(p)==='F'));cell(sheet,`N${r}`,mark(gender(p)==='M'));});}
function fillTemplate(key,sheet,data){
  if(key==='luna')return fillLuna(sheet,data);if(key==='chaxa')return fillChaxa(sheet,data);if(key==='socaire')return fillSocaire(sheet,data);if(key==='talabre')return fillTalabre(sheet,data);if(key==='coyo')return fillCoyo(sheet,data);if(key==='marte')return fillMarte(sheet,data);if(key==='arcoiris')return fillArcoiris(sheet,data);if(key==='catarpe')return fillCatarpe(sheet,data);if(key==='quitor')return fillQuitor(sheet,data);
  if(key==='transfer')return fillStandard(sheet,data,12);return fillStandard(sheet,data,11);
}

function addSimpleList(workbook,name,data){
  const sheet=workbook.addWorksheet(name);sheet.getCell('A1').value=`${name} · ${data.departure.departure_code}`;sheet.mergeCells('A1:L1');sheet.getCell('A1').font={bold:true,size:15,color:{argb:'FFFFFFFF'}};sheet.getCell('A1').fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF111111'}};
  sheet.getRow(3).values=['#','Código ingreso','Reserva','Pasajero','Documento','Nacionalidad','Nacimiento','Edad','Hotel / pickup','Teléfono','Restricciones','Observaciones'];sheet.getRow(3).font={bold:true,color:{argb:'FFFFFFFF'}};sheet.getRow(3).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3D3A36'}};
  data.rows.forEach((row,index)=>{const p=row.passenger;sheet.getRow(4+index).values=[index+1,row.lead.codigo,row.lead.reserva,fullName(p),p.document_number||'',p.nationality||'',excelDate(p.birth_date),ageAt(p.birth_date,row.service.fecha_servicio),row.hotel||'',p.phone||'',p.dietary_restrictions||'',[p.disability_type,p.medical_notes].filter(Boolean).join(' · ')];sheet.getCell(`G${4+index}`).numFmt='dd-mm-yyyy';});
  [7,15,24,25,18,16,14,8,24,16,26,28].forEach((w,i)=>sheet.getColumn(i+1).width=w);sheet.views=[{state:'frozen',ySplit:3}];
}

async function prepareWorkbook(admin,data){
  const {workbook,source}=await loadMasterWorkbook(admin);const keep=[];
  if(workbook.worksheets.length){
    const d80Source=workbook.getWorksheet('Template_D80');
    if(d80Source){const out=duplicateSheet(workbook,d80Source,'LISTA D80');if(out){fillStandard(out,data,11);keep.push(out.name);}}
    for(const key of data.templateKeys){const sourceSheet=workbook.getWorksheet(TEMPLATE_SHEETS[key]);if(sourceSheet){const name=`LISTA ${DISPLAY[key]||key.toUpperCase()}`;const out=duplicateSheet(workbook,sourceSheet,name);if(out){fillTemplate(key,out,data);keep.push(out.name);}}else addSimpleList(workbook,`LISTA ${DISPLAY[key]||key.toUpperCase()}`,data);}
    const control=fillControl(workbook,data,source);keep.push(control.name);
    const keepSet=new Set(keep);for(const sheet of [...workbook.worksheets])if(!keepSet.has(sheet.name))workbook.removeWorksheet(sheet.id);
  }else{
    fillControl(workbook,data,source);addSimpleList(workbook,'LISTA D80',data);for(const key of data.templateKeys)addSimpleList(workbook,`LISTA ${DISPLAY[key]||key.toUpperCase()}`,data);
  }
  return{workbook,source};
}

export async function listDepartureDocumentsForLead(admin,leadId){
  const {data:services,error}=await admin.from('lead_services').select('id,service_code,producto,fecha_servicio,numero_pax,booking_status,estado_operacion,departure_id').eq('lead_id',leadId).in('booking_status',['confirmed','completed']).order('fecha_servicio');
  if(error)throw error;
  const departureIds=unique((services||[]).map(s=>s.departure_id));
  const [{data:departures},{data:documents}]=await Promise.all([
    departureIds.length?admin.from('tour_departures').select('*').in('id',departureIds):Promise.resolve({data:[]}),
    departureIds.length?admin.from('tour_departure_documents').select('*').in('departure_id',departureIds).eq('document_type',OPERATION_LIST_DOC_TYPE):Promise.resolve({data:[]})
  ]);
  const departureById=new Map((departures||[]).map(d=>[d.id,d]));const docByDeparture=new Map((documents||[]).map(d=>[d.departure_id,d]));const grouped=new Map();
  for(const service of services||[]){if(!service.departure_id)continue;const current=grouped.get(service.departure_id)||{...departureById.get(service.departure_id),serviceCodes:[],serviceIds:[],leadServiceCount:0};current.serviceCodes.push(service.service_code);current.serviceIds.push(service.id);current.leadServiceCount++;grouped.set(service.departure_id,current);}
  return{
    departures:Array.from(grouped.values()).filter(Boolean).map(d=>({...d,document:docByDeparture.get(d.id)||null})),
    unassigned:(services||[]).filter(s=>!s.departure_id)
  };
}

export async function generateDepartureOperationLists(admin,user,departureId){
  const data=await loadDepartureData(admin,departureId);const {workbook,source}=await prepareWorkbook(admin,data);const output=Buffer.from(await workbook.xlsx.writeBuffer());
  const code=safe(data.departure.departure_code||data.departure.id);const fileName=`${code}_LISTAS_PRELLENADAS.xlsx`;const storagePath=`generated/departures/${code}/${fileName}`;
  const {error:uploadError}=await admin.storage.from(OPERATION_LIST_BUCKET).upload(storagePath,output,{contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:true,cacheControl:'0'});if(uploadError)throw uploadError;
  const generatedFrom={departure_code:data.departure.departure_code,reservation_codes:unique(data.leads.map(l=>l.codigo)),lead_ids:unique(data.leads.map(l=>l.id)),service_codes:unique(data.services.map(s=>s.service_code)),passenger_codes:unique(data.rows.map(r=>r.passenger.passenger_code)),template_keys:data.templateKeys,warnings:data.warnings,template_source:source};
  const {error:docError}=await admin.from('tour_departure_documents').upsert({departure_id:departureId,document_type:OPERATION_LIST_DOC_TYPE,title:`Listas prellenadas ${data.departure.departure_code}`,storage_bucket:OPERATION_LIST_BUCKET,storage_path:storagePath,file_name:fileName,generated_from:generatedFrom,generated_at:new Date().toISOString(),generated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'departure_id,document_type'});if(docError)throw docError;
  const {data:signed,error:signedError}=await admin.storage.from(OPERATION_LIST_BUCKET).createSignedUrl(storagePath,3600);if(signedError)throw signedError;
  return{departureCode:data.departure.departure_code,fileName,url:signed.signedUrl,paxCount:data.rows.length,reservationCount:unique(data.services.map(s=>s.lead_id)).length,templateKeys:data.templateKeys,warnings:data.warnings,source};
}
