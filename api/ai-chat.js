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
function safeProducts(products,privileged){
  return products.map(p=>{
    const prices={...(p.prices||{})};
    if(!privileged){
      delete prices.base;
    }
    return {name:p.name,category:p.category,origin:p.origin,duration_hours:p.duration_hours,schedule:p.schedule,stops:p.stops,entrance_fee:p.entrance_fee,snack:p.snack,description:p.description,price_mode:p.price_mode,prices};
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

function systemPrompt({profile,rules,products,tvPricing,lead,services,recentLeads,tasks,salesPrompt}){
  const privileged=profile.role==='admin'||profile.role==='manager';
  return `Eres el Asistente Comercial interno de HOTEL EXPERIENCE by LINK en San Pedro de Atacama.
Tu objetivo es ayudar al equipo a vender turismo con claridad, sin inventar información y cuidando margen, operación y experiencia del pasajero.

REGLAS OBLIGATORIAS:
${rules.map(r=>`- ${r.title}: ${r.rule_text}`).join('\n')}

PROMPT COMERCIAL ADICIONAL:
${salesPrompt?.trim()?salesPrompt.trim():'Sin instrucciones adicionales.'}

ACCIONES:
- Si el usuario pide explícitamente CREAR un lead y entrega datos suficientes, al final de tu respuesta agrega exactamente una línea:
ACTION_CREATE_LEAD: {"reserva":"Nombre","numero_pax":1,"contacto":"","empresa_ejecuta":"","canal":"IA","prioridad":"Media","servicio":""}
- Solo propone la acción. El frontend exigirá confirmación humana antes de insertar.
- Nunca propongas crear lead si el usuario solo está analizando, cotizando o preguntando.

COMPORTAMIENTO:
- Responde en español claro y comercial.
- Para tours TV1.2, la MATRIZ TV1.2 tiene prioridad y el precio se resuelve por tour_id → modalidad → pax. Nunca por el nombre visible.
- Compartido/low: precio fijo por persona × pax.
- Semiprivado: precio fijo por persona entre 2 y 10 pasajeros; 1 pax o fuera de ese rango = cotización manual.
- Privado: usa el tramo EXACTO de 1 a 12 pasajeros cuando exista. Si el tramo es nulo = cotización manual.
- Cuando un precio sea por persona, diferencia precio p/p y total del grupo.
- Si el precio es 0, nulo, faltante o claramente anómalo, NO inventes ni corrijas: marca "validar".
- El catálogo Supabase sigue siendo referencia para transfer, wellness y productos que no estén en TV1.2.
- Para regular_commission usa prices.sale como precio comercial. El costo/base es interno.
- Para hotel_fixed y lowcost_transport usa prices.hotel_sale como venta.
- Si hay entrada y el catálogo indica que no está incluida, adviértelo.
- El margen objetivo de 35% solo sirve para una estimación fuera de tabla y debe quedar marcado como estimación a validar.
- No prometas disponibilidad: indica que debe confirmarse.
- No expongas costos internos a roles agent/viewer.
- Nunca cambies el CRM por tu cuenta; solo recomienda acciones.
- Cuando convenga, termina con "Próxima acción recomendada:".

ROL DEL USUARIO: ${profile.role}
${privileged?'Puede ver referencias internas de costo/base.':'No debes mostrar costos/base internos.'}

CATÁLOGO OFICIAL:
${JSON.stringify(safeProducts(products,privileged))}

MATRIZ TV1.2 NORMALIZADA (tours y tramos):
${JSON.stringify(tvPricing)}

LEAD EN CONTEXTO:
${lead?JSON.stringify({lead,services}):'No hay lead seleccionado.'}

CRM RECIENTE (resumen):
${JSON.stringify(recentLeads)}

TAREAS ABIERTAS:
${JSON.stringify(tasks)}
`;
}

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
  try{
    const {admin,secret}=setup();
    const {user,profile}=await userFrom(req,admin);
    const {message,leadId,history=[]}=req.body||{};
    if(!message?.trim()) return res.status(400).json({error:'Escribe una consulta.'});

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

    const apiKey=decrypt(settings.encrypted_api_key,secret);
    const sys=systemPrompt({profile,rules:rules||[],products:products||[],tvPricing:loadTv12Pricing(),lead,services,recentLeads,tasks,salesPrompt:settings.sales_prompt||''});
    const endpoint=settings.base_url.replace(/\/+$/,'')+'/chat/completions';
    const messages=[
      {role:'system',content:sys},
      ...history.slice(-8).map(x=>({role:x.role==='assistant'?'assistant':'user',content:String(x.content||'')})),
      {role:'user',content:message}
    ];
    const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model:settings.model,messages,temperature:0.2,max_tokens:1200})});
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
    return res.status(200).json({answer,action});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Error del asistente IA.'});
  }
}
