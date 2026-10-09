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

    // Create the identity independently of Supabase's limited email sender.
    // Email remains unverified; activation is a separate step.
    const normalizedEmail=String(email).trim().toLowerCase();
    const {data,error}=await admin.auth.admin.createUser({
      email:normalizedEmail,
      email_confirm:false,
      user_metadata:{full_name:fullName}
    });
    if(error){
      const duplicate=/already (been )?registered|already exists|duplicate/i.test(error.message||'');
      return res.status(duplicate?409:500).json({error:duplicate?'La cuenta ya existe en Auth. Revisa su perfil y usa recuperación de acceso.':error.message});
    }
    if(!data?.user) return res.status(500).json({error:'Supabase no devolvió una cuenta.'});
    const {error:saveError}=await admin.from('profiles').upsert({
      id:data.user.id,full_name:fullName,email:normalizedEmail,role,
      is_active:false,updated_at:new Date().toISOString()
    },{onConflict:'id'});
    if(saveError) {
      await admin.auth.admin.deleteUser(data.user.id);
      return res.status(500).json({error:'No se pudieron asignar permisos. No se conservó la cuenta incompleta.'});
    }
    return res.status(200).json({
      ok:true,activation_pending:true,
      message:'Cuenta creada sin enviar correo. La activación requiere configurar el servicio de email; hasta entonces el usuario no puede ingresar.'
    });
  }catch(e){
    return res.status(500).json({error:e?.message||'No se pudo crear la invitación.'});
  }
}
