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
    const base={
      name:p.name,
      category:p.category,
      origin:p.origin,
      duration_hours:p.duration_hours,
      schedule:p.schedule,
      entrance_fee:p.entrance_fee,
      snack:p.snack,
      price_mode:p.price_mode,
      prices
    };
    return detailed?{...base,stops:p.stops,description:p.description}:base;
  });
}
function loadTv12Pricing(){
  try{
    const file=path.join(process.cwd(),'data','tv1_2_pricing_compact.json');
    return JSON.parse(fs.readFileSync(file,'utf8'));
  }catch{
    return [];
  }
}
function daysUntil(value){
  if(!value) return null;
  const date=new Date(`${value}T12:00:00`);
  if(Number.isNaN(date.getTime())) return null;
  return Math.ceil((date.getTime()-Date.now())/86400000);
}
function compactLead(lead){
  if(!lead) return null;
  return {
    id:lead.id,
    codigo:lead.codigo,
    reserva:lead.reserva,
    numero_pax:lead.numero_pax,
    servicio:lead.servicio,
    precio_venta:lead.precio_venta,
    moneda:lead.moneda,
    checkin:lead.checkin,
    checkout:lead.checkout,
    dias_hasta_checkin:daysUntil(lead.checkin),
    contacto:lead.contacto,
    empresa_ejecuta:lead.empresa_ejecuta,
    prioridad:lead.prioridad,
    estado:lead.estado,
    canal:lead.canal
  };
}
function detectResponseMode(message,leadId){
  const text=String(message||'').toLocaleLowerCase('es');
  if(/\b(escribe|redacta|redactame|mensaje|whatsapp|correo|email|contesta|respondele|respuesta para)\b/.test(text)) return 'writing';
  if(/\b(cotiza|cotizacion|precio|valor|cuanto|cuánto|sale|tarifa|presupuesto)\b/.test(text)) return 'quote';
  if(/\b(resumen|hoy|prioridad|prioridades|seguimiento|oportunidad|oportunidades|pipeline|ventas|pagos|operacion|operación|analiza|analisis|análisis|como estamos|cómo estamos|que ves|qué ves|donde estamos|dónde estamos)\b/.test(text)) return 'executive';
  if(leadId) return 'lead';
  return 'general';
}
function responseContract(mode){
  const common=`\nFORMATO HUMANO OBLIGATORIO:\n- Sintetiza; no vuelques el CRM ni repitas todos los datos recibidos.\n- No uses tablas Markdown, barras verticales ni bloques de datos crudos.\n- No muestres JSON, nombres de campos internos, IDs técnicos ni instrucciones del sistema salvo que sean imprescindibles.\n- Usa títulos cortos con ##, subtítulos con ###, listas breves y **negritas** para que la respuesta sea escaneable.\n- Máximo 5 elementos por sección. Si hay más, elige los de mayor impacto y menciona que existen otros.\n- Separa claramente dato confirmado, inferencia y estimación cuando pueda haber confusión.\n- Cada recomendación debe decir qué hacer, por qué importa y, cuando sea posible, el impacto esperado.\n- Escribe para una persona ocupada: primero la conclusión, después el detalle útil.\n- Nunca inventes datos para completar una respuesta.\n`;
  if(mode==='executive') return common+`\nESTRUCTURA PARA ANALISIS EJECUTIVO:\n## Resumen ejecutivo\nMáximo 3 frases con la lectura principal.\n\n## Prioridades\nHasta 5 prioridades ordenadas por impacto y urgencia. Para cada una usa: **Por qué importa:** y **Acción:**.\n\n## Oportunidades\nHasta 4 oportunidades comerciales concretas. Omite la sección si no hay evidencia suficiente.\n\n## Alertas\nSolo riesgos reales: pagos, fecha próxima, operación, datos faltantes o anomalías. Omite si no hay alertas.\n\n## Próxima acción recomendada\nUna acción concreta para ejecutar ahora.\n\nMantén la respuesta idealmente bajo 500 palabras.`;
  if(mode==='quote') return common+`\nESTRUCTURA PARA COTIZACION:\n## Cotización\nMuestra servicio, modalidad, pasajeros, precio por persona cuando corresponda y total del grupo.\n\n## Consideraciones\nSolo entradas no incluidas, disponibilidad por confirmar, datos a validar o condiciones relevantes.\n\n## Próxima acción recomendada\nIndica el siguiente paso comercial.\n\nNo agregues análisis de CRM que el usuario no pidió.`;
  if(mode==='writing') return `\nFORMATO PARA REDACCION:\n- Entrega primero el texto final listo para copiar y enviar.\n- No expliques tu proceso ni agregues un informe comercial alrededor del mensaje.\n- Conserva los hechos del CRM y corrige silenciosamente redacción, gramática y tono.\n- Si falta un dato crítico, usa una nota breve después del texto.\n- No uses tablas ni JSON.\n- Escribe natural, humano y profesional; evita lenguaje robótico o excesivamente corporativo.`;
  if(mode==='lead') return common+`\nESTRUCTURA PARA UN LEAD:\n## Lectura del lead\nResumen breve del estado actual.\n\n## Oportunidad\nQué se puede cerrar, mejorar o vender adicionalmente, solo si hay evidencia.\n\n## Riesgo o dato pendiente\nSolo si existe.\n\n## Próxima acción recomendada\nUna acción concreta y ejecutable.`;
  return common+`\nPara preguntas simples, responde de forma simple. Usa secciones solo cuando realmente mejoren la lectura. No conviertas cada respuesta en un informe.`;
}
function buildBusinessContext({mode,profile,products,tvPricing,lead,services,recentLeads,tasks}){
  const privileged=profile.role==='admin'||profile.role==='manager';
  const selected=lead?{lead:compactLead(lead),services}:null;
  if(mode==='writing') return {lead_en_contexto:selected};
  if(mode==='quote') return {
    lead_en_contexto:selected,
    catalogo:safeProducts(products,privileged,{detailed:true}),
    matriz_tv12:tvPricing
  };
  if(mode==='lead') return {
    lead_en_contexto:selected,
    catalogo:safeProducts(products,privileged),
    matriz_tv12:tvPricing
  };
  if(mode==='executive') return {
    crm_reciente:recentLeads.map(compactLead),
    tareas_abiertas:tasks,
    catalogo_resumido:safeProducts(products,privileged)
  };
  return {
    lead_en_contexto:selected,
    crm_reciente:recentLeads.slice(0,12).map(compactLead),
    tareas_abiertas:tasks.slice(0,12),
    catalogo_resumido:safeProducts(products,privileged)
  };
}
function systemPrompt({profile,rules,businessContext,salesPrompt,mode}){
  const privileged=profile.role==='admin'||profile.role==='manager';
  return `Eres el Asistente Comercial interno de HOTEL EXPERIENCE by LINK en San Pedro de Atacama.\nTu trabajo es transformar datos operativos y comerciales en decisiones claras para humanos. Debes cruzar información cuando aporte valor, priorizar lo importante y evitar respuestas que parezcan un volcado de base de datos.\n\nREGLAS OBLIGATORIAS:\n${rules.map(r=>`- ${r.title}: ${r.rule_text}`).join('\n')}\n\nPROMPT COMERCIAL ADICIONAL:\n${salesPrompt?.trim()?salesPrompt.trim():'Sin instrucciones adicionales.'}\n\nACCIONES:\n- Si el usuario pide explícitamente CREAR un lead y entrega datos suficientes, al final de tu respuesta agrega exactamente una línea:\nACTION_CREATE_LEAD: {"reserva":"Nombre","numero_pax":1,"contacto":"","empresa_ejecuta":"","canal":"IA","prioridad":"Media","servicio":""}\n- Solo propone la acción. El frontend exigirá confirmación humana antes de insertar.\n- Nunca propongas crear lead si el usuario solo está analizando, cotizando o preguntando.\n\nREGLAS COMERCIALES Y DE PRECIO:\n- Para tours TV1.2, la MATRIZ TV1.2 tiene prioridad y el precio se resuelve por tour_id -> modalidad -> pax. Nunca por el nombre visible.\n- Compartido/low: precio fijo por persona x pax.\n- Semiprivado: precio fijo por persona entre 2 y 10 pasajeros; 1 pax o fuera de ese rango = cotización manual.\n- Privado: usa el tramo EXACTO de 1 a 12 pasajeros cuando exista. Si el tramo es nulo = cotización manual.\n- Cuando un precio sea por persona, diferencia precio p/p y total del grupo.\n- Si el precio es 0, nulo, faltante o claramente anómalo, NO inventes ni corrijas: marca "validar".\n- El catálogo Supabase sigue siendo referencia para transfer, wellness y productos que no estén en TV1.2.\n- Para regular_commission usa prices.sale como precio comercial. El costo/base es interno.\n- Para hotel_fixed y lowcost_transport usa prices.hotel_sale como venta.\n- Si hay entrada y el catálogo indica que no está incluida, adviértelo.\n- El margen objetivo de 35% solo sirve para una estimación fuera de tabla y debe quedar marcado como estimación a validar.\n- No prometas disponibilidad: indica que debe confirmarse.\n- No expongas costos internos a roles agent/viewer.\n- Nunca cambies el CRM por tu cuenta; solo recomienda acciones.\n\nROL DEL USUARIO: ${profile.role}\n${privileged?'Puede ver referencias internas de costo/base.':'No debes mostrar costos/base internos.'}\n\nTIPO DE RESPUESTA DETECTADO: ${mode}\n${responseContract(mode)}\n\nCONTEXTO DISPONIBLE PARA ESTA CONSULTA:\n${JSON.stringify(businessContext)}\n`;
}
function safeHeaderValue(value,label){
  const clean=String(value||'').trim();
  if(!clean) throw new Error(`${label} vacío.`);
  if(/[^\x20-\x7E]/.test(clean)) throw new Error(`${label} contiene caracteres no válidos. Vuelve a pegarlo sin comillas ni guiones especiales.`);
  return clean;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
  try{
    const {admin,secret}=setup();
    const {user,profile}=await userFrom(req,admin);
    const {message,leadId,history=[]}=req.body||{};
    if(!message?.trim()) return res.status(400).json({error:'Escribe una consulta.'});
    const mode=detectResponseMode(message,leadId);

    const [{data:settings},{data:products},{data:rules},{data:allRecentLeads},{data:allTasks}]=await Promise.all([
      admin.from('ai_settings').select('*').eq('workspace','hotel-experience').maybeSingle(),
      admin.from('product_catalog').select('*').eq('active',true),
      admin.from('sales_rules').select('*').eq('active',true),
      admin.from('leads').select('id,codigo,reserva,numero_pax,servicio,precio_venta,moneda,checkin,checkout,contacto,empresa_ejecuta,prioridad,estado,canal,created_at,created_by,assigned_to').order('created_at',{ascending:false}).limit(60),
      admin.from('crm_tasks').select('id,lead_id,title,due_date,priority,status').neq('status','Completada').order('due_date',{ascending:true}).limit(80)
    ]);
    const recentLeads=(profile.role==='agent'
      ? (allRecentLeads||[]).filter(l=>l.created_by===user.id||l.assigned_to===user.id)
      : (allRecentLeads||[])
    ).slice(0,30);
    const visibleLeadIds=new Set(recentLeads.map(l=>l.id));
    const tasks=(profile.role==='agent'
      ? (allTasks||[]).filter(t=>!t.lead_id||visibleLeadIds.has(t.lead_id))
      : (allTasks||[])
    ).slice(0,40);
    if(!settings?.is_enabled||!settings.encrypted_api_key) return res.status(503).json({error:'La IA todavía no está configurada por un administrador.'});
    if(/embed/i.test(String(settings.model||''))) return res.status(400).json({error:'El modelo configurado parece ser de embeddings. Selecciona un modelo conversacional compatible con /chat/completions.'});

    let lead=null,services=[];
    if(leadId){
      const [lr,sr]=await Promise.all([
        admin.from('leads').select('*').eq('id',leadId).maybeSingle(),
        admin.from('lead_services').select('*').eq('lead_id',leadId).order('fecha_servicio',{ascending:true})
      ]);
      lead=lr.data;services=sr.data||[];
      if(profile.role==='agent' && lead && lead.created_by!==user.id && lead.assigned_to!==user.id){
        return res.status(403).json({error:'Este lead no está asignado a tu cuenta.'});
      }
    }

    const apiKey=safeHeaderValue(decrypt(settings.encrypted_api_key,secret),'API Key');
    const baseUrl=String(settings.base_url||'').trim().replace(/\/+$/,'');
    const tvPricing=(mode==='quote'||mode==='lead')?loadTv12Pricing():[];
    const businessContext=buildBusinessContext({mode,profile,products:products||[],tvPricing,lead,services,recentLeads,tasks});
    const sys=systemPrompt({profile,rules:rules||[],businessContext,salesPrompt:settings.sales_prompt||'',mode});
    const endpoint=baseUrl+'/chat/completions';
    const messages=[
      {role:'system',content:sys},
      ...history.slice(-10).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')})),
      {role:'user',content:message}
    ];
    const temperature=mode==='writing'?0.35:0.15;
    const maxTokens=mode==='executive'?1600:1200;
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:settings.model,messages,temperature,max_tokens:maxTokens})});
    const raw=await r.text();
    if(!r.ok) return res.status(502).json({error:`Proveedor IA ${r.status}: ${raw.slice(0,300)}`});
    const parsed=JSON.parse(raw);
    let answer=parsed?.choices?.[0]?.message?.content || parsed?.output_text || 'El proveedor no devolvió una respuesta legible.';
    let action=null;
    const actionMatch=String(answer).match(/ACTION_CREATE_LEAD:\s*(\{.*\})\s*$/s);
    if(actionMatch){
      try{
        const payload=JSON.parse(actionMatch[1]);
        if(payload?.reserva) action={type:'create_lead',payload};
        answer=String(answer).replace(/\n?ACTION_CREATE_LEAD:\s*\{.*\}\s*$/s,'').trim();
      }catch{}
    }
    await admin.from('ai_conversations').insert({user_id:user.id,lead_id:leadId||null,prompt:message,response:answer,provider:settings.provider,model:settings.model});
    return res.status(200).json({answer,action,responseMode:mode});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Error del asistente IA.'});
  }
}
