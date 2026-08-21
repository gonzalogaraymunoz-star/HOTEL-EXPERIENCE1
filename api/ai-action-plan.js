import {createClient} from '@supabase/supabase-js';
import crypto from 'crypto';

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sec=process.env.AI_CONFIG_SECRET;
  if(!url||!key||!sec)throw new Error('Configuración del servidor incompleta.');
  return {admin:createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),secret:crypto.createHash('sha256').update(sec).digest()};
}
function decrypt(payload,key){const raw=Buffer.from(payload,'base64');const iv=raw.subarray(0,12),tag=raw.subarray(12,28),data=raw.subarray(28);const d=crypto.createDecipheriv('aes-256-gcm',key,iv);d.setAuthTag(tag);return Buffer.concat([d.update(data),d.final()]).toString('utf8')}
function safeHeaderValue(value,label){const clean=String(value||'').trim();if(!clean)throw new Error(`${label} vacío.`);if(/[^\x20-\x7E]/.test(clean))throw new Error(`${label} contiene caracteres no válidos.`);return clean}
async function userFrom(req,admin){const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');const {data,error}=await admin.auth.getUser(token);if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).single();if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});return {user:data.user,profile}}
function todayChile(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function explicitActionSignal(text){return /\b(crea|crear|créame|creame|agrega|agregar|añade|anota|agenda|programa|pon|cambia|cambiar|actualiza|actualizar|marca|marcar|pasa|mueve|registra|registrar|haz|hacer|coordina|coordinar|fija|fijar)\b/i.test(String(text||''))}
function extractJson(text){const raw=String(text||'').trim();try{return JSON.parse(raw)}catch{}const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1))}catch{}}return {actions:[]}}
function cleanTime(value){const v=String(value||'').trim();if(!v)return null;const m=v.match(/^(\d{1,2}):(\d{2})/);if(!m)return null;const h=Number(m[1]),min=Number(m[2]);if(h>23||min>59)return null;return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`}

function sanitize(actions,visibleIds,serviceMap){
  const out=[];
  for(const item of Array.isArray(actions)?actions.slice(0,8):[]){
    const type=String(item?.type||'');const p=item?.payload||{};
    if(type==='create_lead'&&String(p.reserva||'').trim())out.push({type,payload:{reserva:String(p.reserva).trim(),numero_pax:Math.max(1,Number(p.numero_pax||1)),contacto:String(p.contacto||''),empresa_ejecuta:String(p.empresa_ejecuta||''),canal:String(p.canal||'IA'),prioridad:['Baja','Media','Alta','Urgente'].includes(p.prioridad)?p.prioridad:'Media',servicio:String(p.servicio||'')}});
    if(type==='create_task'&&String(p.title||'').trim()&&(!p.lead_id||visibleIds.has(p.lead_id)))out.push({type,payload:{lead_id:p.lead_id||null,title:String(p.title).trim().slice(0,240),due_date:p.due_date||null,priority:['Baja','Media','Alta','Urgente'].includes(p.priority)?p.priority:'Media',status:'Pendiente'}});
    if(type==='update_lead'&&visibleIds.has(p.lead_id)){
      const changes={};if(['nuevo','contactado','cotizado','confirmado','perdido'].includes(p.changes?.estado))changes.estado=p.changes.estado;if(['Baja','Media','Alta','Urgente'].includes(p.changes?.prioridad))changes.prioridad=p.changes.prioridad;if(Object.keys(changes).length)out.push({type,payload:{lead_id:p.lead_id,changes}})
    }
    if(type==='add_note'&&visibleIds.has(p.lead_id)&&String(p.body||'').trim())out.push({type,payload:{lead_id:p.lead_id,body:String(p.body).trim().slice(0,2000)}});
    if(type==='update_service_operation'){
      const service=serviceMap.get(p.lead_service_id);
      const status=String(p.estado_operacion||'');
      if(service&&['Pendiente','Coordinado','En curso','Completado','Cancelado'].includes(status))out.push({type,payload:{lead_id:service.lead_id,lead_service_id:service.id,producto:service.producto,fecha_servicio:service.fecha_servicio,estado_operacion:status}});
    }
    if(type==='update_service_pickup'){
      const service=serviceMap.get(p.lead_service_id);
      const pickup=cleanTime(p.pickup_time);
      const meeting=String(p.meeting_point||'').trim().slice(0,240);
      if(service&&(pickup||meeting))out.push({type,payload:{lead_id:service.lead_id,lead_service_id:service.id,producto:service.producto,fecha_servicio:service.fecha_servicio,pickup_time:pickup||'',meeting_point:meeting}});
    }
  }
  return out;
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  try{
    const {admin,secret}=setup();const {user,profile}=await userFrom(req,admin);
    const {message,leadId,history=[]}=req.body||{};
    if(profile.role==='viewer')return res.status(200).json({actions:[]});
    if(!message?.trim()||!explicitActionSignal(message))return res.status(200).json({actions:[]});

    const [{data:settings},{data:allLeads}]=await Promise.all([
      admin.from('ai_settings').select('*').eq('workspace','hotel-experience').maybeSingle(),
      admin.from('leads').select('id,codigo,reserva,estado,prioridad,empresa_ejecuta,assigned_to,created_by').order('created_at',{ascending:false}).limit(200)
    ]);
    if(!settings?.is_enabled||!settings.encrypted_api_key)return res.status(200).json({actions:[]});

    const visible=(profile.role==='agent'?(allLeads||[]).filter(l=>l.created_by===user.id||l.assigned_to===user.id):(allLeads||[])).slice(0,160);
    const visibleIds=new Set(visible.map(x=>x.id));
    const selected=leadId&&visibleIds.has(leadId)?visible.find(x=>x.id===leadId):null;

    let serviceRows=[];
    if(visible.length){
      const {data}=await admin.from('lead_services')
        .select('id,lead_id,producto,fecha_servicio,numero_pax,estado_pago,estado_operacion')
        .in('lead_id',visible.map(x=>x.id))
        .order('fecha_servicio',{ascending:true})
        .limit(220);
      serviceRows=data||[];
    }
    const serviceMap=new Map(serviceRows.map(s=>[s.id,s]));
    const selectedServiceIds=selected?serviceRows.filter(s=>s.lead_id===selected.id).map(s=>s.id):[];
    const relevantServices=selected
      ?serviceRows.filter(s=>s.lead_id===selected.id)
      :serviceRows.filter(s=>s.fecha_servicio&&s.fecha_servicio>=todayChile()).slice(0,80);

    let assignmentRows=[];
    if(relevantServices.length){
      const {data}=await admin.from('service_assignments')
        .select('lead_service_id,pickup_time,meeting_point,supplier_id,operation_mode,guide_name,driver_name,vehicle_id')
        .in('lead_service_id',relevantServices.map(s=>s.id));
      assignmentRows=data||[];
    }
    const assignmentMap=new Map(assignmentRows.map(a=>[a.lead_service_id,a]));
    const leadMap=new Map(visible.map(l=>[l.id,l]));
    const serviceContext=relevantServices.map(s=>{
      const l=leadMap.get(s.lead_id);const a=assignmentMap.get(s.id);
      return {id:s.id,lead_id:s.lead_id,codigo:l?.codigo,reserva:l?.reserva,producto:s.producto,fecha:s.fecha_servicio,pax:s.numero_pax,pago:s.estado_pago,estado_operacion:s.estado_operacion,pickup:a?.pickup_time?String(a.pickup_time).slice(0,5):null,punto_encuentro:a?.meeting_point||null,modo:a?.operation_mode||null,tiene_proveedor:Boolean(a?.supplier_id),guia:a?.guide_name||null,conductor:a?.driver_name||null,tiene_vehiculo:Boolean(a?.vehicle_id)};
    });

    const sys=`Eres un planificador de acciones para un CRM turístico. NO ejecutas nada. Solo propones acciones que luego requieren confirmación humana.\n\nFECHA LOCAL CHILE: ${todayChile()}\n\nREGLA CRÍTICA: devuelve acciones SOLO si el ÚLTIMO mensaje del usuario pide explícitamente ejecutar, cambiar, crear, coordinar o registrar algo. Preguntas, análisis, recomendaciones, \"qué harías\", \"dime cuáles\" o cotizaciones deben devolver {\"actions\":[]}.\n\nACCIONES PERMITIDAS:\n1. create_lead payload: reserva, numero_pax, contacto, empresa_ejecuta, canal, prioridad, servicio.\n2. create_task payload: lead_id (o null), title, due_date ISO o null, priority.\n3. update_lead payload: lead_id, changes con SOLO estado y/o prioridad.\n4. add_note payload: lead_id, body.\n5. update_service_operation payload: lead_service_id, estado_operacion. Estados permitidos: Pendiente, Coordinado, En curso, Completado, Cancelado.\n6. update_service_pickup payload: lead_service_id, pickup_time HH:MM y/o meeting_point.\n\nPROHIBIDO PROPONER COMO ACCIÓN AUTOMÁTICA: pagos, reembolsos, cierre financiero, cierre operacional, asignación/cambio de proveedor, guía, conductor, vehículo, borrado de datos o documentos. Para esos casos propone create_task si el usuario pide una acción.\n\nPuedes proponer hasta 8 acciones cuando el usuario diga cosas como \"crea esas tareas\" o \"coordina esas salidas\". Usa el historial para recuperar el contenido de \"esas\", pero la voluntad de ejecutar debe estar en el último mensaje. Nunca inventes IDs: usa exclusivamente LEADS y SERVICIOS VISIBLES. Si falta información esencial, no propongas esa acción.\n\nDevuelve SOLO JSON válido con esta forma exacta: {\"actions\":[{\"type\":\"create_task\",\"payload\":{...}}]}\n\nLEAD SELECCIONADO: ${JSON.stringify(selected)}\nLEADS VISIBLES: ${JSON.stringify(visible.map(l=>({id:l.id,codigo:l.codigo,reserva:l.reserva,estado:l.estado,prioridad:l.prioridad,hotel:l.empresa_ejecuta})))}\nSERVICIOS OPERACIONALES VISIBLES: ${JSON.stringify(serviceContext)}`;

    const apiKey=safeHeaderValue(decrypt(settings.encrypted_api_key,secret),'API Key');
    const endpoint=String(settings.base_url||'').trim().replace(/\/+$/,'')+'/chat/completions';
    const messages=[{role:'system',content:sys},...history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')})),{role:'user',content:String(message)}];
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:settings.model,messages,temperature:0,max_tokens:900})});
    if(!r.ok)return res.status(200).json({actions:[]});
    const raw=await r.json();const text=raw?.choices?.[0]?.message?.content||raw?.output_text||'';
    const parsed=extractJson(text);
    return res.status(200).json({actions:sanitize(parsed.actions,visibleIds,serviceMap)});
  }catch(e){return res.status(e.status||500).json({error:e.message||'No se pudo preparar la acción.'})}
}
