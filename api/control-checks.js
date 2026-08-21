import {createClient} from '@supabase/supabase-js';
import {runControlChecks} from './_lib/control-engine.js';

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}
async function userFrom(req,admin){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).single();
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return {user:data.user,profile};
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});
  try{
    const admin=setup();
    const {user,profile}=await userFrom(req,admin);
    const result=await runControlChecks(admin,profile,user);
    return res.status(200).json(result);
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'No se pudo ejecutar el control preventivo.'});
  }
}
