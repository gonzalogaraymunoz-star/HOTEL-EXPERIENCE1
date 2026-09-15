const GOAS_SERVICE_NAMES={
  luna:'Luna',chaxa:'Chaxa',marte:'Marte',socaire:'Socaire',arcoiris:'Arcoiris',catarpe:'Catarpe',quitor:'Quitor',talabre:'Talabre',coyo:'Coyo',frontera:'Frontera',transfer:'Transfer',tatio:'Tatio',otros:'Otros',d80:'D80'
};

function normalize(value=''){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
}
function unique(values){return Array.from(new Set((values||[]).filter(Boolean)))}
function hotelFor(lead){
  if(lead?.hotel_partners?.partner_type==='hotel')return lead.hotel_partners.name||'';
  return lead?.hotel_room||lead?.pickup_location||'';
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

async function loadIntegrationConfig(admin){
  const {data,error}=await admin.from('server_integration_settings').select('config').eq('integration_key','goas_operation_lists').maybeSingle();
  if(error)throw error;
  const url=data?.config?.url;
  const apiKey=data?.config?.apiKey;
  if(!url||!apiKey)throw Object.assign(new Error('Integración GOAS no configurada en el servidor.'),{status:500});
  return{url,apiKey};
}

async function loadDeparture(admin,departureId){
  const {data:departure,error:departureError}=await admin.from('tour_departures').select('*').eq('id',departureId).single();
  if(departureError)throw departureError;

  const {data:services,error:serviceError}=await admin.from('lead_services').select('*').eq('departure_id',departureId).in('booking_status',['confirmed','completed']).order('created_at');
  if(serviceError)throw serviceError;
  if(!services?.length)throw Object.assign(new Error('La salida no tiene reservas confirmadas o completadas.'),{status:409});

  const leadIds=unique(services.map(s=>s.lead_id));
  const serviceIds=services.map(s=>s.id);
  const [{data:leads,error:leadError},{data:passengers,error:paxError},{data:links,error:linkError},{data:assignments,error:assignmentError}]=await Promise.all([
    admin.from('leads').select('*,hotel_partners(name,partner_type)').in('id',leadIds),
    admin.from('passengers').select('*').in('lead_id',leadIds).order('passenger_code'),
    admin.from('lead_service_passengers').select('*').in('lead_service_id',serviceIds).eq('confirmed',true),
    admin.from('service_assignments').select('*').in('lead_service_id',serviceIds)
  ]);
  if(leadError)throw leadError;
  if(paxError)throw paxError;
  if(linkError)throw linkError;
  if(assignmentError)throw assignmentError;

  const productId=departure.product_catalog_id||services.find(s=>s.product_catalog_id)?.product_catalog_id||null;
  const {data:product,error:productError}=productId
    ? await admin.from('product_catalog').select('id,name,code,category,product_slug,stops,operation_list_template_key').eq('id',productId).maybeSingle()
    : {data:null,error:null};
  if(productError)throw productError;

  const supplierIds=unique((assignments||[]).map(a=>a.supplier_id));
  const vehicleIds=unique((assignments||[]).map(a=>a.vehicle_id));
  const peopleIds=unique((assignments||[]).flatMap(a=>[a.guide_person_id,a.driver_person_id]));
  const [vehicleRes,peopleRes]=await Promise.all([
    vehicleIds.length?admin.from('vehicles').select('*').in('id',vehicleIds):Promise.resolve({data:[],error:null}),
    peopleIds.length?admin.from('service_people').select('*').in('id',peopleIds):Promise.resolve({data:[],error:null})
  ]);
  if(vehicleRes.error)throw vehicleRes.error;
  if(peopleRes.error)throw peopleRes.error;

  const leadById=new Map((leads||[]).map(x=>[x.id,x]));
  const paxById=new Map((passengers||[]).map(x=>[x.id,x]));
  const paxByLead=new Map();
  (passengers||[]).forEach(p=>paxByLead.set(p.lead_id,[...(paxByLead.get(p.lead_id)||[]),p]));
  const linksByService=new Map();
  (links||[]).forEach(link=>linksByService.set(link.lead_service_id,[...(linksByService.get(link.lead_service_id)||[]),link]));

  const warnings=[];
  const selected=[];
  const seen=new Set();
  for(const service of services){
    const lead=leadById.get(service.lead_id);
    if(!lead)continue;
    const serviceLinks=(linksByService.get(service.id)||[]).slice().sort((a,b)=>Number(a.position||0)-Number(b.position||0));
    let chosen=serviceLinks.map(link=>paxById.get(link.passenger_id)).filter(Boolean);
    if(!serviceLinks.length){
      chosen=(paxByLead.get(service.lead_id)||[]).slice(0,Math.max(0,Number(service.numero_pax||0)));
      warnings.push(`${service.service_code}: sin relación explícita servicio↔pasajero; se usaron ${chosen.length} pasajeros del ingreso.`);
    }
    for(const pax of chosen){
      if(seen.has(pax.id))continue;
      seen.add(pax.id);
      selected.push({pax,lead,service});
    }
  }

  const expected=services.reduce((sum,s)=>sum+Number(s.numero_pax||0),0);
  if(selected.length!==expected)warnings.push(`La salida suma ${expected} pax en reservas y ${selected.length} pasajeros únicos vinculados.`);

  const assignment=(assignments||[])[0]||{};
  const vehicle=(vehicleRes.data||[]).find(v=>v.id===assignment.vehicle_id)||null;
  const guide=(peopleRes.data||[]).find(p=>p.id===assignment.guide_person_id)||null;
  const driver=(peopleRes.data||[]).find(p=>p.id===assignment.driver_person_id)||null;

  const operation={
    date:departure.service_date||services[0]?.fecha_servicio||'',
    driverName:driver?.full_name||assignment.driver_name||vehicle?.driver_name||'',
    driverRut:driver?.rut||'',
    driverPhone:driver?.phone||driver?.whatsapp||vehicle?.driver_phone||'',
    vehiclePlate:vehicle?.plate||'',
    vehicleType:vehicle?.label||[vehicle?.brand,vehicle?.model].filter(Boolean).join(' ')||assignment.vehicle_name_manual||'',
    guideName:guide?.full_name||assignment.guide_name||'',
    guideRut:guide?.rut||'',
    guidePhone:guide?.phone||guide?.whatsapp||'',
    guideSernatur:guide?.sernatur_registration||''
  };

  const passengersPayload=selected.map(({pax,lead})=>({
    firstName:pax.first_name||pax.full_name||'',
    lastName:pax.last_name||'',
    document:pax.document_number||pax.document||'',
    nationality:pax.nationality||'',
    hotel:hotelFor(lead),
    dietary:pax.dietary_restrictions||'',
    gender:pax.gender||'',
    birthDate:pax.birth_date||'',
    age:pax.age??''
  }));

  const templateKeys=inferTemplateKeys(departure,product,services);
  return{departure,services,leads:leads||[],operation,passengers:passengersPayload,templateKeys,warnings};
}

async function postGoas(config,payload){
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),55000);
  try{
    const response=await fetch(config.url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({...payload,apiKey:config.apiKey}),
      redirect:'follow',
      signal:controller.signal
    });
    const text=await response.text();
    let body;
    try{body=JSON.parse(text)}catch{throw new Error(`GOAS respondió en un formato inesperado (${response.status}).`)}
    if(!response.ok||!body?.ok)throw new Error(body?.error||`GOAS respondió ${response.status}.`);
    return body.resultado||body;
  }finally{
    clearTimeout(timeout);
  }
}

export async function generateGoasOperationLists(admin,departureId){
  const [config,data]=await Promise.all([loadIntegrationConfig(admin),loadDeparture(admin,departureId)]);
  const tourCode=data.departure.departure_code||data.departure.id;
  const generated=[];

  for(const key of data.templateKeys){
    const service=GOAS_SERVICE_NAMES[key]||GOAS_SERVICE_NAMES.otros;
    const result=await postGoas(config,{
      tourCode,
      service,
      productName:data.departure.product_name||service,
      serviceDate:data.operation.date,
      operation:data.operation,
      passengers:data.passengers
    });
    generated.push({service,...result});
  }

  const last=generated[generated.length-1];
  const url=last?.spreadsheetUrl||last?.url||generated[0]?.url;
  if(!url)throw new Error('GOAS generó las listas pero no devolvió un enlace de Google Sheets.');

  const {error:updateError}=await admin.from('tour_departures').update({
    operation_lists_url:url,
    operation_lists_updated_at:new Date().toISOString(),
    operation_lists_services:data.templateKeys.map(k=>GOAS_SERVICE_NAMES[k]||k)
  }).eq('id',departureId);
  if(updateError)throw updateError;

  return{
    url,
    spreadsheetUrl:url,
    departureCode:tourCode,
    services:data.templateKeys.map(k=>GOAS_SERVICE_NAMES[k]||k),
    passengers:data.passengers.length,
    warnings:data.warnings,
    generated
  };
}
