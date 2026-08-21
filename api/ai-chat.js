import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

function setup(){
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  const sec=process.env.AI_CONFIG_SECRET;
  if(!url||!key||!sec) throw new Error('Configuración del servidor incompleta.');
  return {admin:createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}}),secret:crypto.createHash('sha256').update(sec).digest()};
}
function decrypt(payload,key){
  const raw=Buffer.from(payload,'base64');
  const iv=raw.subarray(0,12),tag=raw.subarray(12,28),data=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
async function userFrom(req,admin){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user) throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).single();
  if(!profile?.is_active) throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return {user:data.user,profile};
}
function safeProducts(products,privileged,{detailed=false}={}){
  return products.map(p=>{
    const prices={...(p.prices||{})};
    if(!privileged) delete prices.base;
    const base={name:p.name,category:p.category,origin:p.origin,duration_hours:p.duration_hours,schedule:p.schedule,entrance_fee:p.entrance_fee,snack:p.snack,price_mode:p.price_mode,prices};
    return detailed?{...base,stops:p.stops,description:p.description}:base;
  });
}
function loadTv12Pricing(){
  try{return JSON.parse(fs.readFileSync(path.join(process.cwd(),'data','tv1_2_pricing_compact.json'),'utf8'))}catch{return []}
}
function todayChile(){return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())}
function addDaysIso(iso,days){const d=new Date(`${iso}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10)}
function daysUntil(value){if(!value)return null;const date=new Date(`${value}T12:00:00`);if(Number.isNaN(date.getTime()))return null;return Math.ceil((date.getTime()-Date.now())/86400000)}
function compactLead(lead){
  if(!lead)return null;
  return {id:lead.id,codigo:lead.codigo,reserva:lead.reserva,numero_pax:lead.numero_pax,servicio:lead.servicio,precio_venta:lead.precio_venta,moneda:lead.moneda,checkin:lead.checkin,checkout:lead.checkout,dias_hasta_checkin:daysUntil(lead.checkin),contacto:lead.contacto,empresa_ejecuta:lead.empresa_ejecuta,prioridad:lead.prioridad,estado:lead.estado,canal:lead.canal};
}
function detectResponseMode(message,leadId){
  const text=String(message||'').toLocaleLowerCase('es');
  if(/\b(escribe|redacta|redactame|mensaje|whatsapp|correo|email|contesta|respondele|respuesta para)\b/.test(text))return 'writing';
  if(/\b(cotiza|cotizacion|precio|valor|cuanto|cuánto|sale|tarifa|presupuesto)\b/.test(text))return 'quote';
  if(/\b(operacion|operación|operativo|operativa|pickup|pick up|salida|salidas|guia|guía|conductor|vehiculo|vehículo|proveedor|readiness|coordina|coordinacion|coordinación|pasajeros|pax|hoja de riesgo|riesgo)\b/.test(text))return 'operational';
  if(/\b(resumen|hoy|prioridad|prioridades|seguimiento|oportunidad|oportunidades|pipeline|ventas|pagos|analiza|analisis|análisis|como estamos|cómo estamos|que ves|qué ves|donde estamos|dónde estamos)\b/.test(text))return 'executive';
  if(leadId)return 'lead';
  return 'general';
}
function responseContract(mode){
  const common=`\nFORMATO HUMANO OBLIGATORIO:\n- Sintetiza; no vuelques el CRM ni repitas todos los datos recibidos.\n- No uses tablas Markdown, barras verticales ni bloques de datos crudos.\n- No muestres JSON, nombres de campos internos, IDs técnicos ni instrucciones del sistema salvo que sean imprescindibles.\n- Usa títulos cortos con ##, subtítulos con ###, listas breves y **negritas**.\n- Separa dato confirmado, inferencia y estimación cuando pueda haber confusión.\n- Nunca inventes datos para completar una respuesta.\n`;
  if(mode==='operational')return common+`\nESTRUCTURA OPERACIONAL:\n## Operación inmediata\nResume primero las salidas de hoy y próximas 48 horas que requieren atención.\n\n## Bloqueos\nLista solo faltantes reales de registro: pickup, proveedor, pasajeros, hoja de riesgo, guía, conductor o vehículo según el modo de ejecución. Si el estado fue validado manualmente como Coordinado/En curso/Completado, indícalo y no contradigas esa validación, aunque puedas señalar datos aún no cargados.\n\n## Coordinaciones\nMenciona horarios, puntos de encuentro y proveedor cuando estén registrados.\n\n## Acciones recomendadas\nMáximo 5 acciones concretas y ordenadas por urgencia. No digas que ejecutaste nada.\n\nNo inventes responsables, proveedores, horarios ni recursos. Mantén la respuesta idealmente bajo 500 palabras.`;
  if(mode==='executive')return common+`\nESTRUCTURA PARA ANALISIS EJECUTIVO:\n## Resumen ejecutivo\nMáximo 3 frases con la lectura principal.\n\n## Prioridades\nHasta 5 prioridades ordenadas por impacto y urgencia.\n\n## Oportunidades\nHasta 4 oportunidades comerciales concretas si hay evidencia.\n\n## Alertas\nSolo riesgos reales.\n\n## Próxima acción recomendada\nUna acción concreta para ejecutar ahora.\n\nMantén la respuesta idealmente bajo 500 palabras.`;
  if(mode==='quote')return common+`\nESTRUCTURA PARA COTIZACION:\n## Cotización\nMuestra servicio, modalidad, pasajeros, precio por persona cuando corresponda y total del grupo.\n\n## Consideraciones\nSolo entradas no incluidas, disponibilidad por confirmar, datos a validar o condiciones relevantes.\n\n## Próxima acción recomendada\nIndica el siguiente paso comercial.`;
  if(mode==='writing')return `\nFORMATO PARA REDACCION:\n- Entrega primero el texto final listo para copiar y enviar.\n- No expliques tu proceso.\n- Conserva los hechos del CRM.\n- Si falta un dato crítico, usa una nota breve después del texto.\n- No uses tablas ni JSON.\n- Escribe natural, humano y profesional.`;
  if(mode==='lead')return common+`\nESTRUCTURA PARA UN LEAD:\n## Lectura del lead\nResumen breve del estado actual.\n\n## Oportunidad\nQué se puede cerrar, mejorar o vender adicionalmente, solo si hay evidencia.\n\n## Riesgo o dato pendiente\nSolo si existe.\n\n## Próxima acción recomendada\nUna acción concreta y ejecutable.`;
  return common+`\nPara preguntas simples, responde de forma simple. Usa secciones solo cuando realmente mejoren la lectura.`;
}
function operationMode(assignment){return assignment?.operation_mode||(assignment?.supplier_id?'delegated_full':'direct')}
function coverageOf(assignment){return Array.isArray(assignment?.supplier_coverage)?assignment.supplier_coverage:[]}
async function enrichOperationalServices(admin,services,leadMap,privileged){
  if(!services.length)return [];
  const ids=services.map(s=>s.id);const leadIds=[...new Set(services.map(s=>s.lead_id))];
  const [aRes,supplierRes,paxRes,docRes,closureRes]=await Promise.all([
    admin.from('service_assignments').select('lead_service_id,supplier_id,vehicle_id,guide_person_id,driver_person_id,guide_name,driver_name,pickup_time,meeting_point,supplier_cost,supplier_payment_status,operation_mode,supplier_coverage').in('lead_service_id',ids),
    admin.from('suppliers').select('id,name').eq('active',true),
    admin.from('passengers').select('id,lead_id').in('lead_id',leadIds),
    admin.from('reservation_documents').select('lead_id,document_type,status,url').in('lead_id',leadIds),
    admin.from('service_closures').select('lead_service_id,closure_status,outcome,refund_amount,refund_status').in('lead_service_id',ids)
  ]);
  const assignmentMap=new Map((aRes.data||[]).map(a=>[a.lead_service_id,a]));
  const supplierMap=new Map((supplierRes.data||[]).map(s=>[s.id,s.name]));
  const paxCount=new Map();for(const p of paxRes.data||[])paxCount.set(p.lead_id,(paxCount.get(p.lead_id)||0)+1);
  const riskMap=new Map();for(const d of docRes.data||[]){if(d.document_type==='risk_sheet')riskMap.set(d.lead_id,d)}
  const closureMap=new Map((closureRes.data||[]).map(c=>[c.lead_service_id,c]));
  return services.map(s=>{
    const lead=leadMap.get(s.lead_id)||{};const a=assignmentMap.get(s.id);const mode=operationMode(a);const cov=coverageOf(a);const delegated=Boolean(a?.supplier_id)&&mode!=='direct';
    const covered=k=>delegated&&cov.includes(k);const pax=(paxCount.get(s.lead_id)||0);const risk=riskMap.get(s.lead_id);
    const checks={fecha:Boolean(s.fecha_servicio),pasajeros:pax>=Math.max(1,Number(s.numero_pax||lead.numero_pax||1)),hoja_riesgo:Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet'),proveedor:Boolean(a?.supplier_id),guia:Boolean(a?.guide_person_id||a?.guide_name),conductor:Boolean(a?.driver_person_id||a?.driver_name),vehiculo:Boolean(a?.vehicle_id),pickup:Boolean(a?.pickup_time)};
    const required=['fecha','pasajeros','hoja_riesgo','pickup'];
    if(mode==='direct')required.push('guia','conductor','vehiculo');
    else{required.push('proveedor');if(!covered('guide'))required.push('guia');if(!covered('driver'))required.push('conductor');if(!covered('vehicle'))required.push('vehiculo')}
    const missing=required.filter(k=>!checks[k]);const humanValidated=['Coordinado','En curso','Completado'].includes(String(s.estado_operacion||''));
    const out={service_id:s.id,lead_id:s.lead_id,codigo:lead.codigo||null,reserva:lead.reserva||null,hotel:lead.empresa_ejecuta||null,producto:s.producto,fecha:s.fecha_servicio,dias_hasta_salida:daysUntil(s.fecha_servicio),pax_esperados:s.numero_pax,pax_registrados:pax,estado_pago:s.estado_pago,estado_operacion:s.estado_operacion,modo_ejecucion:mode,proveedor:a?.supplier_id?supplierMap.get(a.supplier_id)||'Proveedor asignado':null,pickup:a?.pickup_time?String(a.pickup_time).slice(0,5):null,punto_encuentro:a?.meeting_point||null,guia:a?.guide_name||(a?.guide_person_id?'Guía asignado':null),conductor:a?.driver_name||(a?.driver_person_id?'Conductor asignado':null),vehiculo_asignado:Boolean(a?.vehicle_id),hoja_riesgo:Boolean(checks.hoja_riesgo),faltantes_registro:missing,validacion_humana:humanValidated?'estado operacional validado por persona':null,cierre:closureMap.get(s.id)||null};
    if(privileged){out.costo_proveedor=a?.supplier_cost??null;out.estado_pago_proveedor=a?.supplier_payment_status||null}
    return out;
  });
}
async function buildOperationalSnapshot(admin,profile,allowedLeads,selectedLeadId,selectedServices){
  const privileged=profile.role==='admin'||profile.role==='manager';
  const leadMap=new Map(allowedLeads.map(l=>[l.id,l]));
  let upcoming=[];
  if(selectedLeadId&&selectedServices.length){upcoming=selectedServices}
  else{
    const today=todayChile(),end=addDaysIso(today,14);
    const {data}=await admin.from('lead_services').select('*').gte('fecha_servicio',today).lte('fecha_servicio',end).neq('estado_operacion','Cancelado').order('fecha_servicio',{ascending:true}).limit(120);
    upcoming=(data||[]).filter(s=>profile.role!=='agent'||leadMap.has(s.lead_id));
  }
  return enrichOperationalServices(admin,upcoming,leadMap,privileged);
}
function buildBusinessContext({mode,profile,products,tvPricing,lead,services,recentLeads,tasks,operational}){
  const privileged=profile.role==='admin'||profile.role==='manager';
  const selected=lead?{lead:compactLead(lead),services}:null;
  if(mode==='writing')return {lead_en_contexto:selected};
  if(mode==='quote')return {lead_en_contexto:selected,catalogo:safeProducts(products,privileged,{detailed:true}),matriz_tv12:tvPricing};
  if(mode==='operational')return {lead_en_contexto:lead?compactLead(lead):null,operacion_proximos_14_dias:operational,tareas_abiertas:tasks.slice(0,30)};
  if(mode==='lead')return {lead_en_contexto:selected,operacion_del_lead:operational,catalogo:safeProducts(products,privileged),matriz_tv12:tvPricing};
  if(mode==='executive')return {crm_reciente:recentLeads.map(compactLead),tareas_abiertas:tasks,catalogo_resumido:safeProducts(products,privileged)};
  return {lead_en_contexto:selected,crm_reciente:recentLeads.slice(0,12).map(compactLead),tareas_abiertas:tasks.slice(0,12),catalogo_resumido:safeProducts(products,privileged)};
}
function systemPrompt({profile,rules,businessContext,salesPrompt,mode}){
  const privileged=profile.role==='admin'||profile.role==='manager';
  return `Eres el Asistente Comercial y Operacional interno de HOTEL EXPERIENCE by LINK en San Pedro de Atacama.\nTu trabajo es transformar datos reales del CRM en decisiones claras para humanos. Cruza información cuando aporte valor y evita respuestas que parezcan un volcado de base de datos.\n\nREGLAS OBLIGATORIAS:\n${rules.map(r=>`- ${r.title}: ${r.rule_text}`).join('\n')}\n\nPROMPT COMERCIAL ADICIONAL:\n${salesPrompt?.trim()?salesPrompt.trim():'Sin instrucciones adicionales.'}\n\nSEGURIDAD DE ACCIONES:\n- Nunca cambies el CRM por tu cuenta.\n- Cuando el usuario pida ejecutar algo, describe brevemente lo que debería ocurrir. Un planificador separado preparará solo las acciones permitidas y el frontend exigirá confirmación humana.\n- No digas que una acción fue ejecutada hasta que el sistema lo confirme después.\n- Pagos, reembolsos, cierres y asignación de proveedor/personas/vehículos no son acciones automáticas de IA.\n\nREGLAS OPERACIONALES:\n- Una operación directa requiere, como mínimo registrado: fecha, pasajeros, hoja de riesgo, pickup, guía, conductor y vehículo.\n- Una derivación integral requiere: fecha, pasajeros, hoja de riesgo, pickup y proveedor.\n- Una derivación parcial requiere proveedor y además los elementos NO cubiertos por el proveedor.\n- Si el estado está Coordinado, En curso o Completado, respeta que existe una validación humana. Puedes advertir datos aún no cargados, pero no declares el servicio bloqueado solo por ausencia de registro.\n- Nunca inventes pickup, proveedor, guía, conductor, vehículo ni punto de encuentro.\n\nREGLAS COMERCIALES Y DE PRECIO:\n- Para tours TV1.2, la MATRIZ TV1.2 tiene prioridad y el precio se resuelve por tour_id -> modalidad -> pax. Nunca por el nombre visible.\n- Compartido/low: precio fijo por persona x pax.\n- Semiprivado: precio fijo por persona entre 2 y 10 pasajeros; 1 pax o fuera de rango = cotización manual.\n- Privado: usa el tramo EXACTO cuando exista. Si el tramo es nulo = cotización manual.\n- Si el precio es 0, nulo, faltante o anómalo, no inventes: marca validar.\n- No prometas disponibilidad.\n- No expongas costos internos a roles agent/viewer.\n\nROL DEL USUARIO: ${profile.role}\n${privileged?'Puede ver referencias internas de costo/base.':'No debes mostrar costos/base internos.'}\n\nTIPO DE RESPUESTA DETECTADO: ${mode}\n${responseContract(mode)}\n\nCONTEXTO DISPONIBLE:\n${JSON.stringify(businessContext)}\n`;
}
function safeHeaderValue(value,label){const clean=String(value||'').trim();if(!clean)throw new Error(`${label} vacío.`);if(/[^\x20-\x7E]/.test(clean))throw new Error(`${label} contiene caracteres no válidos. Vuelve a pegarlo sin comillas ni guiones especiales.`);return clean}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  try{
    const {admin,secret}=setup();const {user,profile}=await userFrom(req,admin);const {message,leadId,history=[]}=req.body||{};
    if(!message?.trim())return res.status(400).json({error:'Escribe una consulta.'});
    const mode=detectResponseMode(message,leadId);

    const [{data:settings},{data:products},{data:rules},{data:allRecentLeads},{data:allTasks}]=await Promise.all([
      admin.from('ai_settings').select('*').eq('workspace','hotel-experience').maybeSingle(),
      admin.from('product_catalog').select('*').eq('active',true),
      admin.from('sales_rules').select('*').eq('active',true),
      admin.from('leads').select('id,codigo,reserva,numero_pax,servicio,precio_venta,moneda,checkin,checkout,contacto,empresa_ejecuta,prioridad,estado,canal,created_at,created_by,assigned_to').order('created_at',{ascending:false}).limit(200),
      admin.from('crm_tasks').select('id,lead_id,title,due_date,priority,status').neq('status','Completada').order('due_date',{ascending:true}).limit(100)
    ]);
    const allowedLeads=profile.role==='agent'?(allRecentLeads||[]).filter(l=>l.created_by===user.id||l.assigned_to===user.id):(allRecentLeads||[]);
    const recentLeads=allowedLeads.slice(0,40);const visibleLeadIds=new Set(allowedLeads.map(l=>l.id));
    const tasks=(profile.role==='agent'?(allTasks||[]).filter(t=>!t.lead_id||visibleLeadIds.has(t.lead_id)):(allTasks||[])).slice(0,50);
    if(!settings?.is_enabled||!settings.encrypted_api_key)return res.status(503).json({error:'La IA todavía no está configurada por un administrador.'});
    if(/embed/i.test(String(settings.model||'')))return res.status(400).json({error:'El modelo configurado parece ser de embeddings. Selecciona un modelo conversacional compatible con /chat/completions.'});

    let lead=null,services=[];
    if(leadId){
      const [lr,sr]=await Promise.all([admin.from('leads').select('*').eq('id',leadId).maybeSingle(),admin.from('lead_services').select('*').eq('lead_id',leadId).order('fecha_servicio',{ascending:true})]);
      lead=lr.data;services=sr.data||[];
      if(profile.role==='agent'&&lead&&lead.created_by!==user.id&&lead.assigned_to!==user.id)return res.status(403).json({error:'Este lead no está asignado a tu cuenta.'});
      if(lead&&!visibleLeadIds.has(lead.id)){allowedLeads.push(lead);visibleLeadIds.add(lead.id)}
    }

    const operational=(mode==='operational'||mode==='lead')?await buildOperationalSnapshot(admin,profile,allowedLeads,leadId||null,services):[];
    const apiKey=safeHeaderValue(decrypt(settings.encrypted_api_key,secret),'API Key');
    const baseUrl=String(settings.base_url||'').trim().replace(/\/+$/,'');
    const tvPricing=(mode==='quote'||mode==='lead')?loadTv12Pricing():[];
    const businessContext=buildBusinessContext({mode,profile,products:products||[],tvPricing,lead,services,recentLeads,tasks,operational});
    const sys=systemPrompt({profile,rules:rules||[],businessContext,salesPrompt:settings.sales_prompt||'',mode});
    const endpoint=baseUrl+'/chat/completions';
    const messages=[{role:'system',content:sys},...history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')})),{role:'user',content:message}];
    const temperature=mode==='writing'?0.35:0.15;const maxTokens=mode==='executive'||mode==='operational'?1600:1200;
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:settings.model,messages,temperature,max_tokens:maxTokens})});
    const raw=await r.text();
    if(!r.ok)return res.status(502).json({error:`Proveedor IA ${r.status}: ${raw.slice(0,300)}`});
    const parsed=JSON.parse(raw);let answer=parsed?.choices?.[0]?.message?.content||parsed?.output_text||'El proveedor no devolvió una respuesta legible.';let action=null;
    const actionMatch=String(answer).match(/ACTION_CREATE_LEAD:\s*(\{.*\})\s*$/s);
    if(actionMatch){try{const payload=JSON.parse(actionMatch[1]);if(payload?.reserva)action={type:'create_lead',payload};answer=String(answer).replace(/\n?ACTION_CREATE_LEAD:\s*\{.*\}\s*$/s,'').trim()}catch{}}
    await admin.from('ai_conversations').insert({user_id:user.id,lead_id:leadId||null,prompt:message,response:answer,provider:settings.provider,model:settings.model});
    return res.status(200).json({answer,action,responseMode:mode});
  }catch(e){return res.status(e.status||500).json({error:e.message||'Error del asistente IA.'})}
}
