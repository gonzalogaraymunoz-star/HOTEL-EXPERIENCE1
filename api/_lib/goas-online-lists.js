const GOAS_SERVICE_NAMES={
  luna:'Luna',chaxa:'Chaxa',marte:'Marte',socaire:'Socaire',arcoiris:'Arcoiris',catarpe:'Catarpe',quitor:'Quitor',talabre:'Talabre',coyo:'Coyo',frontera:'Frontera',transfer:'Transfer',tatio:'Tatio',otros:'Otros',d80:'D80'
};

function unique(values){return Array.from(new Set((values||[]).filter(Boolean)))}
function hotelFor(lead){
  if(lead?.hotel_partners?.partner_type==='hotel')return lead.hotel_partners.name||'';
  return lead?.hotel_room||lead?.pickup_location||'';
}
function splitName(pax){
  if(pax?.first_name||pax?.last_name)return{firstName:pax.first_name||'',lastName:pax.last_name||''};
  const parts=String(pax?.full_name||'').trim().split(/\s+/).filter(Boolean);
  return{firstName:parts.shift()||'',lastName:parts.join(' ')};
}
function ageOn(birthDate,serviceDate){
  if(!birthDate||!serviceDate)return'';
  const birth=new Date(`${birthDate}T00:00:00Z`),onDate=new Date(`${serviceDate}T00:00:00Z`);
  if(Number.isNaN(birth.getTime())||Number.isNaN(onDate.getTime())||birth>onDate)return'';
  let age=onDate.getUTCFullYear()-birth.getUTCFullYear();
  if(onDate.getUTCMonth()<birth.getUTCMonth()||(onDate.getUTCMonth()===birth.getUTCMonth()&&onDate.getUTCDate()<birth.getUTCDate()))age-=1;
  return age;
}
function passengerPayload(pax,lead,serviceDate){
  const name=splitName(pax);
  return{
    id:pax.id,code:pax.passenger_code||'',fullName:pax.full_name||[name.firstName,name.lastName].filter(Boolean).join(' '),...name,
    documentType:pax.document_type||'',document:pax.document_number||'',nationality:pax.nationality||'',hotel:hotelFor(lead),
    phone:pax.phone||'',email:pax.email||'',dietary:pax.dietary_restrictions||'',medicalNotes:pax.medical_notes||'',disability:pax.disability_type||'',
    gender:pax.gender||'',birthDate:pax.birth_date||'',age:ageOn(pax.birth_date,serviceDate),reservationId:lead?.id||'',reservationCode:lead?.codigo||'',reservationReference:lead?.reservation_reference||lead?.reserva||''
  };
}

async function loadIntegrationConfig(admin){
  const {data,error}=await admin.from('server_integration_settings').select('config').eq('integration_key','goas_operation_lists').maybeSingle();
  if(error)throw error;
  const url=data?.config?.url,apiKey=data?.config?.apiKey;
  if(!url||!apiKey)throw Object.assign(new Error('Integración GOAS no configurada en el servidor.'),{status:500});
  return{url,apiKey};
}

async function loadDeparture(admin,departureId){
  const {data:departure,error:departureError}=await admin.from('tour_departures').select('*').eq('id',departureId).single();
  if(departureError)throw departureError;
  const {data:services,error:serviceError}=await admin.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at');
  if(serviceError)throw serviceError;
  if(!services?.length)throw Object.assign(new Error('La salida no tiene reservas confirmadas o completadas.'),{status:409});

  const leadIds=unique(services.map(s=>s.lead_id)),serviceIds=services.map(s=>s.id);
  const productIds=unique([departure.product_catalog_id,...services.map(s=>s.product_catalog_id)]);
  const [leadRes,paxRes,linkRes,assignmentRes,resourceRes,noteRes,documentRes,productRes,mappingRes]=await Promise.all([
    admin.from('leads').select('*,hotel_partners(name,partner_type)').in('id',leadIds),
    admin.from('passengers').select('*').in('lead_id',leadIds).order('passenger_code'),
    admin.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds).eq('confirmed',true),
    admin.from('service_assignments').select('*').in('lead_service_id',serviceIds).order('created_at'),
    admin.from('tour_departure_resources').select('*,operational_resources(*)').eq('departure_id',departureId),
    admin.from('tour_departure_notes').select('*').eq('departure_id',departureId).order('created_at'),
    admin.from('reservation_documents').select('*').in('lead_id',leadIds),
    productIds.length?admin.from('product_catalog').select('*').in('id',productIds):Promise.resolve({data:[],error:null}),
    productIds.length?admin.from('product_operation_list_templates').select('*').in('product_id',productIds).order('sort_order'):Promise.resolve({data:[],error:null})
  ]);
  for(const result of [leadRes,paxRes,linkRes,assignmentRes,resourceRes,noteRes,documentRes,productRes,mappingRes])if(result.error)throw result.error;

  const assignments=assignmentRes.data||[],supplierIds=unique(assignments.map(a=>a.supplier_id)),vehicleIds=unique(assignments.map(a=>a.vehicle_id));
  const peopleIds=unique(assignments.flatMap(a=>[a.guide_person_id,a.driver_person_id,a.cook_person_id,a.coordinator_person_id]));
  const [supplierRes,vehicleRes,peopleRes,itineraryRes]=await Promise.all([
    supplierIds.length?admin.from('suppliers').select('*').in('id',supplierIds):Promise.resolve({data:[],error:null}),
    vehicleIds.length?admin.from('vehicles').select('*').in('id',vehicleIds):Promise.resolve({data:[],error:null}),
    peopleIds.length?admin.from('service_people').select('*').in('id',peopleIds):Promise.resolve({data:[],error:null}),
    admin.from('lead_services').select('*').in('lead_id',leadIds).in('booking_status',['confirmed','completed']).order('fecha_servicio').order('hora_inicio')
  ]);
  for(const result of [supplierRes,vehicleRes,peopleRes,itineraryRes])if(result.error)throw result.error;

  const byId=rows=>new Map((rows||[]).map(row=>[row.id,row]));
  const leadById=byId(leadRes.data),paxById=byId(paxRes.data),assignmentByService=new Map(assignments.map(a=>[a.lead_service_id,a]));
  const supplierById=byId(supplierRes.data),vehicleById=byId(vehicleRes.data),peopleById=byId(peopleRes.data);
  const paxByLead=new Map(),linksByService=new Map(),warnings=[];
  for(const pax of paxRes.data||[])paxByLead.set(pax.lead_id,[...(paxByLead.get(pax.lead_id)||[]),pax]);
  for(const link of linkRes.data||[])linksByService.set(link.lead_service_id,[...(linksByService.get(link.lead_service_id)||[]),link]);

  const serviceGroups=services.map(service=>{
    const lead=leadById.get(service.lead_id),serviceDate=service.fecha_servicio||departure.service_date||'';
    const serviceLinks=(linksByService.get(service.id)||[]).slice().sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    let chosen=serviceLinks.map(link=>paxById.get(link.passenger_id)).filter(Boolean);
    if(!serviceLinks.length){
      chosen=(paxByLead.get(service.lead_id)||[]).slice(0,Math.max(0,Number(service.numero_pax||0)));
      warnings.push(`${service.service_code||service.id}: sin relación explícita servicio↔pasajero; se usaron ${chosen.length} pasajeros de la reserva.`);
    }
    if(chosen.length!==Number(service.numero_pax||0))warnings.push(`${service.service_code||service.id}: declara ${Number(service.numero_pax||0)} pax y tiene ${chosen.length} vinculados.`);
    const assignment=assignmentByService.get(service.id)||{},vehicle=vehicleById.get(assignment.vehicle_id)||null;
    const guide=peopleById.get(assignment.guide_person_id)||null,driver=peopleById.get(assignment.driver_person_id)||null,supplier=supplierById.get(assignment.supplier_id)||null;
    return{
      id:service.id,code:service.service_code||'',productId:service.product_catalog_id||departure.product_catalog_id||'',productName:service.producto||departure.product_name||'',date:serviceDate,startTime:service.hora_inicio||'',endTime:service.hora_fin||'',
      passengers:chosen.map(pax=>passengerPayload(pax,lead,serviceDate)),
      reservation:{id:lead?.id||'',code:lead?.codigo||'',reference:lead?.reservation_reference||lead?.reserva||'',contact:lead?.contacto||'',hotel:hotelFor(lead),arrivalFlight:lead?.arrival_flight_number||'',departureFlight:lead?.departure_flight_number||''},
      operation:{
        date:serviceDate,pickupTime:assignment.pickup_time||service.hora_inicio||'',meetingPoint:assignment.meeting_point||lead?.pickup_location||'',notes:assignment.notes||service.observacion||service.other_notes||'',
        supplierName:supplier?.name||'',supplierCode:supplier?.supplier_code||'',supplierPhone:supplier?.phone||supplier?.whatsapp||'',
        driverName:driver?.full_name||assignment.driver_name||vehicle?.driver_name||'',driverRut:driver?.rut||'',driverPhone:driver?.phone||driver?.whatsapp||vehicle?.driver_phone||'',vehiclePlate:vehicle?.plate||'',vehicleType:vehicle?.label||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||assignment.vehicle_name_manual||'',
        guideName:guide?.full_name||assignment.guide_name||'',guideRut:guide?.rut||'',guidePhone:guide?.phone||guide?.whatsapp||'',guideSernatur:guide?.sernatur_registration||''
      }
    };
  });

  const templateKeys=unique((mappingRes.data||[]).map(m=>m.template_key));
  if(!templateKeys.length)throw Object.assign(new Error('El producto no tiene plantillas operacionales configuradas.'),{status:409});
  const primaryOperation=serviceGroups.find(group=>Object.values(group.operation).some(Boolean))?.operation||{date:departure.service_date||''};
  const passengerMap=new Map();
  for(const group of serviceGroups)for(const pax of group.passengers)if(!passengerMap.has(pax.id))passengerMap.set(pax.id,pax);
  for(const pax of passengerMap.values())if(pax.birthDate&&!Number.isInteger(pax.age))warnings.push(`${pax.code||pax.fullName}: fecha de nacimiento inválida o posterior al servicio; la edad quedó vacía.`);
  const products=(productRes.data||[]).map(p=>({id:p.id,code:p.code||'',slug:p.product_slug||'',name:p.name||'',category:p.category||'',stops:p.stops||''}));
  const resources=(resourceRes.data||[]).map(r=>({code:r.operational_resources?.code||'',name:r.operational_resources?.name||'',type:r.operational_resources?.resource_type||'',quantity:r.quantity,status:r.fulfillment_status,notes:r.notes||''}));
  const risk=(documentRes.data||[]).filter(d=>d.document_type==='risk').map(d=>({reservationId:d.lead_id,title:d.title,status:d.status,data:d.risk_data||{},url:d.url||''}));
  return{departure,services:serviceGroups,products,operation:primaryOperation,passengers:[...passengerMap.values()],templateKeys,warnings,resources,notes:(noteRes.data||[]).map(n=>({source:n.source,note:n.note,createdAt:n.created_at})),risk,itinerary:itineraryRes.data||[]};
}

async function postGoas(config,payload){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),55000);
  try{
    const response=await fetch(config.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,apiKey:config.apiKey}),redirect:'follow',signal:controller.signal});
    const text=await response.text();let body;
    try{body=JSON.parse(text)}catch{throw new Error(`GOAS respondió en un formato inesperado (${response.status}).`)}
    if(!response.ok||!body?.ok)throw new Error(body?.error||`GOAS respondió ${response.status}.`);
    return body.resultado||body;
  }finally{clearTimeout(timeout)}
}

export async function generateGoasOperationLists(admin,departureId){
  const [config,data]=await Promise.all([loadIntegrationConfig(admin),loadDeparture(admin,departureId)]),tourCode=data.departure.departure_code||data.departure.id,generated=[];
  for(const key of data.templateKeys){
    const service=GOAS_SERVICE_NAMES[key]||GOAS_SERVICE_NAMES.otros;
    const result=await postGoas(config,{schemaVersion:2,tourCode,service,templateKey:key,productName:data.departure.product_name||data.products[0]?.name||service,serviceDate:data.operation.date,operation:data.operation,passengers:data.passengers,departure:{id:data.departure.id,code:tourCode,date:data.departure.service_date,modality:data.departure.modality,status:data.departure.status},products:data.products,services:data.services,resources:data.resources,notes:data.notes,risk:data.risk,itinerary:data.itinerary});
    generated.push({service,...result});
  }
  const withUrl=generated.find(item=>item.spreadsheetUrl||item.url),url=withUrl?.spreadsheetUrl||withUrl?.url;
  if(!url)throw new Error('GOAS generó las listas pero no devolvió un enlace de Google Sheets.');
  const {error:updateError}=await admin.from('tour_departures').update({operation_lists_url:url,operation_lists_updated_at:new Date().toISOString(),operation_lists_services:data.templateKeys.map(k=>GOAS_SERVICE_NAMES[k]||k)}).eq('id',departureId);
  if(updateError)throw updateError;
  return{url,spreadsheetUrl:url,departureCode:tourCode,services:data.templateKeys.map(k=>GOAS_SERVICE_NAMES[k]||k),passengers:data.passengers.length,warnings:data.warnings,generated};
}
