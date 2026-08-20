import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

function getAdmin(){
  const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error('Faltan variables privadas de Supabase.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
function secretKey(){
  const s=process.env.AI_CONFIG_SECRET;
  if(!s) throw new Error('Falta AI_CONFIG_SECRET en Vercel.');
  return crypto.createHash('sha256').update(s).digest();
}
function encrypt(value){
  const iv=crypto.randomBytes(12);
  const cipher=crypto.createCipheriv('aes-256-gcm',secretKey(),iv);
  const enc=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([iv,tag,enc]).toString('base64');
}
function decrypt(payload){
  const raw=Buffer.from(payload,'base64');
  const iv=raw.subarray(0,12),tag=raw.subarray(12,28),data=raw.subarray(28);
  const decipher=crypto.createDecipheriv('aes-256-gcm',secretKey(),iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
async function auth(req,admin){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user) throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('role,is_active').eq('id',data.user.id).single();
  if(!profile?.is_active) throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return {user:data.user,profile};
}
async function callModel(baseUrl,model,apiKey,message='Responde solamente: OK'){
  const endpoint=baseUrl.replace(/\/+$/,'')+'/chat/completions';
  const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},body:JSON.stringify({model,messages:[{role:'user',content:message}],temperature:0,max_tokens:40})});
  const body=await r.text();
  if(!r.ok) throw new Error(`Proveedor IA respondió ${r.status}: ${body.slice(0,240)}`);
  return true;
}

export default async function handler(req,res){
  try{
    const admin=getAdmin();
    const {user,profile}=await auth(req,admin);

    if(req.method==='GET'){
      const {data}=await admin.from('ai_settings').select('*').eq('workspace','hotel-experience').maybeSingle();
      return res.status(200).json({
        provider:data?.provider||'custom',
        baseUrl:data?.base_url||'',
        model:data?.model||'',
        isEnabled:Boolean(data?.is_enabled),
        hasKey:Boolean(data?.encrypted_api_key),
        salesPrompt:data?.sales_prompt||''
      });
    }

    if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
    if(profile.role!=='admin') return res.status(403).json({error:'Solo un administrador puede configurar la IA.'});

    const {baseUrl,model,apiKey,enabled=true,salesPrompt='',test=false}=req.body||{};
    if(!baseUrl||!model) return res.status(400).json({error:'Base URL y modelo son obligatorios.'});

    const {data:existing}=await admin.from('ai_settings').select('*').eq('workspace','hotel-experience').maybeSingle();
    let finalEncrypted=existing?.encrypted_api_key||null;
    let liveKey='';
    if(apiKey){
      finalEncrypted=encrypt(apiKey);
      liveKey=apiKey;
    }else if(finalEncrypted){
      liveKey=decrypt(finalEncrypted);
    }
    if(!liveKey) return res.status(400).json({error:'Falta una API key.'});

    if(test){
      await callModel(baseUrl,model,liveKey);
      return res.status(200).json({ok:true,tested:true});
    }

    const row={
      workspace:'hotel-experience',
      provider:'custom',
      base_url:baseUrl,
      model,
      encrypted_api_key:finalEncrypted,
      is_enabled:Boolean(enabled),
      sales_prompt:String(salesPrompt||'').slice(0,12000),
      updated_by:user.id,
      updated_at:new Date().toISOString()
    };
    const {error}=await admin.from('ai_settings').upsert(row,{onConflict:'workspace'});
    if(error) throw error;
    return res.status(200).json({ok:true});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Error de configuración IA.'});
  }
}
