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
function explicitActionSignal(text){return /\b(crea|crear|créame|creame|agrega|agregar|añade|anota|agenda|programa|pon|cambia|cambiar|actualiza|actualizar|marca|marcar|pasa|mueve|registra|registrar|haz|hacer)\b/i.test(String(text||''))}
function extractJson(text){const raw=String(text||'').trim();try{return JSON.parse(raw)}catch{}const start=raw.indexOf('{'),end=raw.lastIndexOf('}');if(start>=0&&end>start){try{return JSON.parse(raw.slice(start,end+1))}catch{}}return {actions:[]}}
function sanitize(actions,visibleIds){
  const out=[];
  for(const item of Array.isArray(actions)?actions.slice(0,6):[]){
    const type=String(item?.type||'');const p=item?.payload||{};
    if(type==='create_lead'&&String(p.reserva||'').trim())out.push({type,payload:{reserva:String(p.reserva).trim(),numero_pax:Math.max(1,Number(p.numero_pax||1)),contacto:String(p.contacto||''),empresa_ejecuta:String(p.empresa_ejecuta||''),canal:String(p.canal||'IA'),prioridad:['Baja','Media','Alta','Urgente'].includes(p.prioridad)?p.prioridad:'Media',servicio:String(p.servicio||'')}});
    if(type==='create_task'&&String(p.title||'').trim()&&(!p.lead_id||visibleIds.has(p.lead_id)))out.push({type,payload:{lead_id:p.lead_id||null,title:String(p.title).trim(),due_date:p.due_date||null,priority:['Baja','Media','Alta','Urgente'].includes(p.priority)?p.priority:'Media',status:'Pendiente'}});
    if(type==='update_lead'&&visibleIds.has(p.lead_id)){
      const changes={};if(['nuevo','contactado','cotizado','confirmado','perdido'].includes(p.changes?.estado))changes.estado=p.changes.estado;if(['Baja','Media','Alta','Urgente'].includes(p.changes?.prioridad))changes.prioridad=p.changes.prioridad;if(Object.keys(changes).length)out.push({type,payload:{lead_id:p.lead_id,changes}})
    }
    if(type==='add_note'&&visibleIds.has(p.lead_id)&&String(p.body||'').trim())out.push({type,payload:{lead_id:p.lead_id,body:String(p.body).trim().slice(0,2000)}});
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
      admin.from('leads').select('id,codigo,reserva,estado,prioridad,empresa_ejecuta,assigned_to,created_by').order('created_at',{ascending:false}).limit(80)
    ]);
    if(!settings?.is_enabled||!settings.encrypted_api_key)return res.status(200).json({actions:[]});
    const visible=(profile.role==='agent'?(allLeads||[]).filter(l=>l.created_by===user.id||l.assigned_to===user.id):(allLeads||[])).slice(0,50);
    const visibleIds=new Set(visible.map(x=>x.id));
    const selected=leadId&&visibleIds.has(leadId)?visible.find(x=>x.id===leadId):null;
    const sys=`Eres un planificador de acciones para un CRM turístico. NO ejecutas nada. Solo propones acciones que luego requieren confirmación humana.\n\nFECHA LOCAL CHILE: ${todayChile()}\n\nREGLA CRÍTICA: devuelve acciones SOLO si el ÚLTIMO mensaje del usuario pide explícitamente ejecutar/cambiar/crear/registrar algo. Preguntas, análisis, recomendaciones, "qué harías", "dime cuáles" o cotizaciones deben devolver {"actions":[]}.\n\nACCIONES PERMITIDAS:\n1. create_lead payload: reserva, numero_pax, contacto, empresa_ejecuta, canal, prioridad, servicio.\n2. create_task payload: lead_id (o null), title, due_date ISO o null, priority.\n3. update_lead payload: lead_id, changes con SOLO estado y/o prioridad.\n4. add_note payload: lead_id, body.\n\nPuedes proponer hasta 6 acciones cuando el usuario diga cosas como "crea esas tareas". Usa el historial para recuperar el contenido de "esas", pero la voluntad de ejecutar debe estar en el último mensaje. Nunca inventes un lead: usa exclusivamente IDs de LEADS VISIBLES. Si falta información esencial, no propongas esa acción.\n\nDevuelve SOLO JSON válido con esta forma exacta: {"actions":[{"type":"create_task","payload":{...}}]}\n\nLEAD SELECCIONADO: ${JSON.stringify(selected)}\nLEADS VISIBLES: ${JSON.stringify(visible.map(l=>({id:l.id,codigo:l.codigo,reserva:l.reserva,estado:l.estado,prioridad:l.prioridad,hotel:l.empresa_ejecuta})))}`;
    const apiKey=safeHeaderValue(decrypt(settings.encrypted_api_key,secret),'API Key');
    const endpoint=String(settings.base_url||'').trim().replace(/\/+$/,'')+'/chat/completions';
    const messages=[{role:'system',content:sys},...history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')})),{role:'user',content:String(message)}];
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:settings.model,messages,temperature:0,max_tokens:650})});
    if(!r.ok)return res.status(200).json({actions:[]});
    const raw=await r.json();const text=raw?.choices?.[0]?.message?.content||raw?.output_text||'';
    const parsed=extractJson(text);return res.status(200).json({actions:sanitize(parsed.actions,visibleIds)});
  }catch(e){return res.status(e.status||500).json({error:e.message||'No se pudo preparar la acción.'})}
}
