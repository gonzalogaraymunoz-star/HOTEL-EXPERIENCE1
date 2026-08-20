import { assertSupabase } from './supabase';
import type { Lead, LeadService, CRMTask, CRMActivity } from '../types';

export async function loadCRMData() {
  const sb = assertSupabase();
  const [leadsRes, servicesRes, tasksRes, activitiesRes] = await Promise.all([
    sb.from('leads').select('*').order('created_at', { ascending: false }),
    sb.from('lead_services').select('*').order('fecha_servicio', { ascending: true }),
    sb.from('crm_tasks').select('*').order('due_date', { ascending: true }),
    sb.from('crm_activities').select('*').order('created_at', { ascending: false }),
  ]);
  for (const r of [leadsRes, servicesRes, tasksRes, activitiesRes]) {
    if (r.error) throw r.error;
  }
  return {
    leads: (leadsRes.data || []) as Lead[],
    services: (servicesRes.data || []) as LeadService[],
    tasks: (tasksRes.data || []) as CRMTask[],
    activities: (activitiesRes.data || []) as CRMActivity[],
  };
}

export async function updateLead(id: string, patch: Partial<Lead>) {
  const { error } = await assertSupabase().from('leads').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function updateService(id: string, patch: Partial<LeadService>) {
  const { error } = await assertSupabase().from('lead_services').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function createTask(payload: Partial<CRMTask>) {
  const { data, error } = await assertSupabase().from('crm_tasks').insert(payload).select().single();
  if (error) throw error;
  return data as CRMTask;
}

export async function updateTask(id: string, patch: Partial<CRMTask>) {
  const { error } = await assertSupabase().from('crm_tasks').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}

export async function createActivity(payload: Partial<CRMActivity>) {
  const { data, error } = await assertSupabase().from('crm_activities').insert(payload).select().single();
  if (error) throw error;
  return data as CRMActivity;
}

export async function createPublicRequest(payload: any) {
  const sb = assertSupabase();
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const suffix = String(Date.now()).slice(-3);
  const codigo = `LAM-${yy}${mm}-${suffix}`;

  const products = payload.productos || [];
  const leadRow = {
    codigo,
    reserva: payload.nombre,
    numero_pax: Math.max(1, ...products.map((p:any) => Number(p.pax) || 1)),
    servicio: products.map((p:any, i:number) => `${i+1}. ${p.producto}`).join(' | '),
    precio_venta: 0,
    moneda: 'CLP',
    checkin: products.find((p:any) => p.fechaServicio)?.fechaServicio || null,
    checkout: null,
    contacto: `${payload.email} | ${payload.telefono}`,
    observaciones_cobros: [
      `Nacionalidad: ${payload.nacionalidad || 'Sin informar'}`,
      `Documento: ${payload.documento || 'Sin informar'}`,
      `Nacimiento: ${payload.nacimiento || 'Sin informar'}`,
      `Restricciones: ${payload.restricciones || 'Ninguna informada'}`,
      `Notas: ${payload.notas || 'Sin notas'}`
    ].join(' | '),
    propuesta_enviada: 'Pendiente',
    empresa_ejecuta: payload.hotel,
    prioridad: 'Media',
    estado: 'nuevo',
    canal: payload.canal || 'Hotel'
  };

  const leadRes = await sb.from('leads').insert(leadRow).select().single();
  if (leadRes.error) throw leadRes.error;

  const lead = leadRes.data as Lead;
  const rows = products.map((p:any) => ({
    lead_id: lead.id,
    producto: p.producto,
    fecha_servicio: p.fechaServicio || null,
    numero_pax: Number(p.pax) || 1,
    observacion: p.observacion || '',
    precio_venta: 0,
    moneda: 'CLP',
    estado_pago: 'Pendiente',
    estado_operacion: 'Pendiente'
  }));

  const servicesRes = await sb.from('lead_services').insert(rows);
  if (servicesRes.error) throw servicesRes.error;

  await sb.from('crm_activities').insert({
    lead_id: lead.id,
    type: 'lead_created',
    title: 'Solicitud recibida desde formulario',
    body: `${products.length} experiencia(s) solicitadas.`,
    created_by: 'Formulario público'
  });

  return { codigo, leadId: lead.id, count: rows.length };
}


export async function deleteLead(id: string) {
  const { error } = await assertSupabase().from('leads').delete().eq('id', id);
  if (error) throw error;
}


export async function loadProductCatalog() {
  const { data, error } = await assertSupabase()
    .from('product_catalog')
    .select('*')
    .eq('active', true)
    .order('category')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function loadSalesRules() {
  const { data, error } = await assertSupabase()
    .from('sales_rules')
    .select('*')
    .eq('active', true)
    .order('code');
  if (error) throw error;
  return data || [];
}


export async function createManualLead(payload: {
  reserva:string;
  numero_pax:number;
  contacto?:string;
  empresa_ejecuta?:string;
  canal?:string;
  prioridad?:string;
  servicio?:string;
}) {
  const sb = assertSupabase();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) throw new Error('Sesión requerida.');

  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth()+1).padStart(2,'0');
  const suffix = String(Date.now()).slice(-3);
  const codigo = `LAM-${yy}${mm}-${suffix}`;

  const row = {
    codigo,
    reserva: payload.reserva,
    numero_pax: Number(payload.numero_pax || 1),
    servicio: payload.servicio || '',
    precio_venta: 0,
    moneda: 'CLP',
    contacto: payload.contacto || '',
    empresa_ejecuta: payload.empresa_ejecuta || '',
    prioridad: payload.prioridad || 'Media',
    estado: 'nuevo',
    canal: payload.canal || 'Directo',
    propuesta_enviada: 'Pendiente',
    created_by: user.id,
    assigned_to: user.id,
    assigned_at: new Date().toISOString()
  };

  const { data, error } = await sb.from('leads').insert(row).select().single();
  if (error) throw error;

  await sb.from('crm_activities').insert({
    lead_id: data.id,
    type: 'lead_created_manual',
    title: 'Lead creado manualmente',
    body: `Creado y asignado inicialmente al usuario conectado.`,
    created_by: 'CRM'
  });

  return data;
}

export async function assignLead(leadId:string, userId:string|null) {
  const patch:any = {
    assigned_to: userId || null,
    assigned_at: userId ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };
  const { error } = await assertSupabase().from('leads').update(patch).eq('id', leadId);
  if (error) throw error;
  await assertSupabase().from('crm_activities').insert({
    lead_id: leadId,
    type: 'assignment',
    title: userId ? 'Responsable actualizado' : 'Lead dejado sin asignar',
    body: userId ? 'El responsable comercial fue actualizado.' : 'El lead quedó disponible para asignación.',
    created_by: 'CRM'
  });
}

export async function loadTeamDirectory() {
  const { data: { session } } = await assertSupabase().auth.getSession();
  const r = await fetch('/api/team-directory', {
    headers: { Authorization: `Bearer ${session?.access_token || ''}` }
  });
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || 'No se pudo cargar el equipo.');
  return body.users || [];
}


export async function createLeadService(leadId:string, payload:{
  producto:string;
  tour_id?:string|null;
  modality?:string|null;
  pricing_status?:string|null;
  price_pp_clp?:number|null;
  pricing_source?:string|null;
  precio_venta?:number;
  fecha_servicio?:string|null;
  numero_pax?:number;
  observacion?:string;
}) {
  const enriched:any = {
    lead_id: leadId,
    producto: payload.producto,
    tour_id: payload.tour_id || null,
    modality: payload.modality || null,
    pricing_status: payload.pricing_status || null,
    price_pp_clp: payload.price_pp_clp ?? null,
    pricing_source: payload.pricing_source || null,
    fecha_servicio: payload.fecha_servicio || null,
    numero_pax: Number(payload.numero_pax || 1),
    observacion: payload.observacion || '',
    precio_venta: Number(payload.precio_venta || 0),
    moneda: 'CLP',
    estado_pago: 'Pendiente',
    estado_operacion: 'Pendiente'
  };

  let result=await assertSupabase().from('lead_services').insert(enriched).select().single();
  if(result.error){
    // Compatibilidad con bases antiguas antes de ejecutar supabase_update_v4.sql.
    const legacy:any = {
      lead_id:leadId,
      producto:payload.producto,
      fecha_servicio:payload.fecha_servicio||null,
      numero_pax:Number(payload.numero_pax||1),
      observacion:[
        payload.modality?`Modalidad: ${payload.modality}`:'',
        payload.pricing_source?`Fuente precio: ${payload.pricing_source}`:'',
        payload.observacion||''
      ].filter(Boolean).join(' · '),
      precio_venta:Number(payload.precio_venta||0),
      moneda:'CLP',
      estado_pago:'Pendiente',
      estado_operacion:'Pendiente'
    };
    result=await assertSupabase().from('lead_services').insert(legacy).select().single();
  }
  if(result.error) throw result.error;
  await assertSupabase().from('crm_activities').insert({
    lead_id: leadId,
    type: 'service_added',
    title: 'Experiencia agregada',
    body: `${payload.producto}${payload.modality?` · ${payload.modality}`:''}`,
    created_by: 'CRM'
  });
  return result.data;
}


export async function loadOperationsData(){
  const sb=assertSupabase();
  const [passengers,suppliers,vehicles,assignments,documents]=await Promise.all([
    sb.from('passengers').select('*').order('created_at'),
    sb.from('suppliers').select('*').eq('active',true).order('name'),
    sb.from('vehicles').select('*').eq('active',true).order('label'),
    sb.from('service_assignments').select('*'),
    sb.from('reservation_documents').select('*')
  ]);
  for(const r of [passengers,suppliers,vehicles,assignments,documents]) if(r.error) throw r.error;
  return {passengers:passengers.data||[],suppliers:suppliers.data||[],vehicles:vehicles.data||[],assignments:assignments.data||[],documents:documents.data||[]};
}

export async function loadOperationsDirectory(){
  const sb=assertSupabase();
  const [people,resources,resourceAssignments]=await Promise.all([
    sb.from('service_people').select('*').eq('active',true).order('full_name'),
    sb.from('operational_resources').select('*').eq('active',true).order('resource_type').order('name'),
    sb.from('service_resource_assignments').select('*')
  ]);
  for(const r of [people,resources,resourceAssignments]) if(r.error) throw r.error;
  return {people:people.data||[],resources:resources.data||[],resourceAssignments:resourceAssignments.data||[]};
}

export async function createPassenger(leadId:string,payload:any){
  const sb=assertSupabase();
  const [{data:lead,error:leadError},{data:existing,error:listError},{data:{user}}]=await Promise.all([
    sb.from('leads').select('codigo').eq('id',leadId).single(),
    sb.from('passengers').select('passenger_code').eq('lead_id',leadId),
    sb.auth.getUser()
  ]);
  if(leadError) throw leadError;if(listError) throw listError;
  const used=new Set((existing||[]).map((x:any)=>x.passenger_code));
  let seq=1,code='';
  do{code=`${lead.codigo}-P${String(seq++).padStart(2,'0')}`}while(used.has(code));
  const row={
    lead_id:leadId,passenger_code:code,full_name:String(payload.full_name||'').trim(),
    email:payload.email||null,phone:payload.phone||null,nationality:payload.nationality||null,
    document_type:payload.document_type||null,document_number:payload.document_number||null,
    birth_date:payload.birth_date||null,dietary_restrictions:payload.dietary_restrictions||null,
    medical_notes:payload.medical_notes||null,app_user_ref:payload.app_user_ref||null,
    is_primary:Boolean(payload.is_primary),created_by:user?.id||null
  };
  let result=await sb.from('passengers').insert(row).select().single();
  if(result.error?.code==='23505'){
    code=`${lead.codigo}-P${String(seq++).padStart(2,'0')}`;
    result=await sb.from('passengers').insert({...row,passenger_code:code}).select().single();
  }
  if(result.error) throw result.error;
  return result.data;
}

export async function deletePassenger(id:string){
  const {error}=await assertSupabase().from('passengers').delete().eq('id',id);
  if(error) throw error;
}

function cleanNullable(payload:any,keys:string[]){
  const out={...payload};
  for(const key of keys){
    if(out[key]===''||out[key]===undefined) out[key]=null;
  }
  return out;
}

export async function createSupplier(payload:any){
  const row=cleanNullable(payload,['contact_name','phone','whatsapp','email','website','rut','services_offered','sernatur_registration','permit_number','insurance_policy','insurance_expiry','bank_name','account_type','account_number','payment_notes','notes']);
  const {data,error}=await assertSupabase().from('suppliers').insert(row).select().single();
  if(error) throw error;return data;
}
export async function updateSupplier(id:string,patch:any){
  const row=cleanNullable(patch,['contact_name','phone','whatsapp','email','website','rut','services_offered','sernatur_registration','permit_number','insurance_policy','insurance_expiry','bank_name','account_type','account_number','payment_notes','notes']);
  const {error}=await assertSupabase().from('suppliers').update(row).eq('id',id);
  if(error) throw error;
}
export async function createVehicle(payload:any){
  const row=cleanNullable(payload,['supplier_id','driver_person_id','brand','model','year','driver_name','driver_phone','technical_review_expiry','circulation_permit_expiry','insurance_expiry','notes']);
  const {data,error}=await assertSupabase().from('vehicles').insert(row).select().single();
  if(error) throw error;return data;
}
export async function updateVehicle(id:string,patch:any){
  const row=cleanNullable(patch,['supplier_id','driver_person_id','brand','model','year','driver_name','driver_phone','technical_review_expiry','circulation_permit_expiry','insurance_expiry','notes']);
  const {error}=await assertSupabase().from('vehicles').update(row).eq('id',id);
  if(error) throw error;
}
export async function createServicePerson(payload:any){
  const row=cleanNullable(payload,['supplier_id','phone','whatsapp','email','rut','nationality','first_aid_expiry','license_type','license_expiry','sernatur_registration','bank_name','account_type','account_number','payment_notes','availability_notes','emergency_contact','notes']);
  const {data,error}=await assertSupabase().from('service_people').insert(row).select().single();
  if(error) throw error;return data;
}
export async function updateServicePerson(id:string,patch:any){
  const row=cleanNullable(patch,['supplier_id','phone','whatsapp','email','rut','nationality','first_aid_expiry','license_type','license_expiry','sernatur_registration','bank_name','account_type','account_number','payment_notes','availability_notes','emergency_contact','notes']);
  const {error}=await assertSupabase().from('service_people').update(row).eq('id',id);
  if(error) throw error;
}
export async function createOperationalResource(payload:any){
  const row=cleanNullable(payload,['code','supplier_id','location','maintenance_due','expiry_date','notes']);
  const {data,error}=await assertSupabase().from('operational_resources').insert(row).select().single();
  if(error) throw error;return data;
}
export async function updateOperationalResource(id:string,patch:any){
  const row=cleanNullable(patch,['code','supplier_id','location','maintenance_due','expiry_date','notes']);
  const {error}=await assertSupabase().from('operational_resources').update(row).eq('id',id);
  if(error) throw error;
}
export async function updateServiceAssignment(leadServiceId:string,patch:any){
  const sb=assertSupabase();
  const {data:{user}}=await sb.auth.getUser();
  const {data:existing,error:findError}=await sb.from('service_assignments').select('id').eq('lead_service_id',leadServiceId).maybeSingle();
  if(findError) throw findError;
  if(existing?.id){
    const {error}=await sb.from('service_assignments').update({...patch,updated_by:user?.id||null}).eq('id',existing.id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('service_assignments').insert({lead_service_id:leadServiceId,...patch,created_by:user?.id||null,updated_by:user?.id||null});
    if(error) throw error;
  }
}
export async function upsertReservationDocument(leadId:string,documentType:string,patch:any){
  const sb=assertSupabase();
  const {data:{user}}=await sb.auth.getUser();
  const {data:existing,error:findError}=await sb.from('reservation_documents').select('id').eq('lead_id',leadId).eq('document_type',documentType).maybeSingle();
  if(findError) throw findError;
  const completed=patch.status==='Completada'?new Date().toISOString():patch.completed_at;
  if(existing?.id){
    const {error}=await sb.from('reservation_documents').update({...patch,completed_at:completed??null}).eq('id',existing.id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('reservation_documents').insert({
      lead_id:leadId,document_type:documentType,title:patch.title||'Documento',status:patch.status||'Pendiente',
      url:patch.url||null,completed_at:completed??null,created_by:user?.id||null
    });
    if(error) throw error;
  }
}
export async function assignResourceToService(leadServiceId:string,resourceId:string,quantity=1,notes=''){
  const sb=assertSupabase();
  const {data:existing,error:findError}=await sb.from('service_resource_assignments').select('id').eq('lead_service_id',leadServiceId).eq('resource_id',resourceId).maybeSingle();
  if(findError) throw findError;
  if(existing?.id){
    const {error}=await sb.from('service_resource_assignments').update({quantity,notes}).eq('id',existing.id);
    if(error) throw error;
  }else{
    const {error}=await sb.from('service_resource_assignments').insert({lead_service_id:leadServiceId,resource_id:resourceId,quantity,notes});
    if(error) throw error;
  }
}
export async function removeResourceFromService(id:string){
  const {error}=await assertSupabase().from('service_resource_assignments').delete().eq('id',id);
  if(error) throw error;
}
