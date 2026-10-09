import { createClient } from '@supabase/supabase-js';

export default async function handler(req,res){
  if(req.method!=='POST') return res.status(405).json({error:'Método no permitido'});
  try{
    const url=process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://lpirjwifzosdzgdncsbt.supabase.co';
    const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!serviceKey) return res.status(500).json({error:'Faltan variables privadas de Supabase en Vercel.'});

    const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
    if(!token) return res.status(401).json({error:'Sesión requerida.'});

    const admin=createClient(url,serviceKey,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await admin.auth.getUser(token);
    if(userError||!userData.user) return res.status(401).json({error:'Sesión inválida.'});

    const {data:profile,error:profileError}=await admin.from('profiles').select('role,is_active').eq('id',userData.user.id).single();
    if(profileError||!profile?.is_active||profile.role!=='admin') return res.status(403).json({error:'Solo un administrador puede crear usuarios.'});

    const {fullName,email,role='agent'}=req.body||{};
    if(!fullName||!email) return res.status(400).json({error:'Nombre y correo son obligatorios.'});
    if(!['admin','manager','agent','viewer'].includes(role)) return res.status(400).json({error:'Rol inválido.'});

    const redirectTo=`${req.headers.origin || 'https://hotel-experience.vercel.app'}/`;
    const {data,error}=await admin.auth.admin.inviteUserByEmail(email,{redirectTo,data:{full_name:fullName}});
    if(error) throw error;

    if(data?.user){
      const {error:saveError}=await admin.from('profiles').upsert({id:data.user.id,full_name:fullName,email,role,is_active:true,updated_at:new Date().toISOString()},{onConflict:'id'});
      if(saveError) return res.status(500).json({error:'La invitación fue creada pero no se pudieron asignar los permisos. Revisa la configuración de perfiles antes de reenviar.'});
    }
    if(!data?.user) return res.status(500).json({error:'Supabase no devolvió una cuenta para la invitación.'});
    return res.status(200).json({ok:true});
  }catch(e){
    return res.status(500).json({error:e?.message||'No se pudo crear la invitación.'});
  }
}
