import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  if(req.method!=='GET') return res.status(405).json({error:'Método no permitido'});
  try{
    const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lpirjwifzosdzgdncsbt.supabase.co';
    const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) return res.status(500).json({error:'Faltan variables privadas de Supabase.'});
    const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
    const {data,error}=await admin.auth.getUser(token);
    if(error||!data.user) return res.status(401).json({error:'Sesión inválida.'});
    const {data:profile}=await admin.from('profiles').select('role,is_active').eq('id',data.user.id).single();
    if(!profile?.is_active) return res.status(403).json({error:'Cuenta desactivada.'});
    const {data:users,error:listError}=await admin.from('profiles').select('id,full_name,email,role,is_active').eq('is_active',true).order('full_name');
    if(listError) throw listError;
    return res.status(200).json({users:users||[]});
  }catch(e){
    return res.status(500).json({error:e?.message||'Error al cargar usuarios.'});
  }
}
