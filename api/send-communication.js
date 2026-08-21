import {createClient} from '@supabase/supabase-js';

const PROJECT_URL='https://lpirjwifzosdzgdncsbt.supabase.co';
const PROJECT_PUBLISHABLE_KEY='sb_publishable_ORe3lY3LRSZo0LMpz4EM9Q_Bf9aUejD';

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido'});
  try{
    const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
    if(!token)return res.status(401).json({error:'Sesión requerida.'});

    const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||PROJECT_URL;
    const publishable=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||PROJECT_PUBLISHABLE_KEY;

    const sb=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false}});
    const {data:userData,error:userError}=await sb.auth.getUser(token);
    if(userError||!userData.user)return res.status(401).json({error:'Sesión inválida.'});

    const authed=createClient(url,publishable,{
      auth:{autoRefreshToken:false,persistSession:false},
      global:{headers:{Authorization:`Bearer ${token}`}}
    });
    const {data:profile}=await authed.from('profiles').select('role,is_active').eq('id',userData.user.id).maybeSingle();
    if(!profile?.is_active||!['admin','manager','agent'].includes(profile.role)){
      return res.status(403).json({error:'Tu rol no puede enviar correos.'});
    }

    const {to,subject,body,leadName='',leadCode='',communicationType='Comunicación'}=req.body||{};
    if(!to||!String(to).includes('@'))return res.status(400).json({error:'Correo destinatario inválido.'});
    if(!subject||!String(subject).trim())return res.status(400).json({error:'Falta el asunto.'});
    if(!body||!String(body).trim())return res.status(400).json({error:'Falta el mensaje.'});
    if(String(subject).length>180)return res.status(400).json({error:'El asunto es demasiado largo.'});
    if(String(body).length>12000)return res.status(400).json({error:'El mensaje es demasiado largo.'});

    const resendKey=process.env.RESEND_API_KEY;
    if(!resendKey)return res.status(500).json({error:'Falta RESEND_API_KEY en Vercel.'});
    const from=process.env.EMAIL_FROM||'Hotel Experience <onboarding@resend.dev>';

    const safe=(v='')=>String(v).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]));
    const safeBody=safe(body).replace(/\n/g,'<br/>');

    const html=`
      <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#171717">
        <div style="font-size:11px;letter-spacing:.16em;margin-bottom:18px">HOTEL EXPERIENCE · BY LINK</div>
        <div style="border:1px solid #d8d0c4;border-radius:16px;padding:24px;background:#fbf8f2">
          <div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#6b655d;margin-bottom:8px">${safe(communicationType)}</div>
          <h1 style="font-size:24px;margin:0 0 18px">${safe(subject)}</h1>
          <div style="font-size:14px;line-height:1.65">${safeBody}</div>
        </div>
        ${(leadName||leadCode)?`<p style="font-size:11px;color:#6b655d;margin-top:16px">Reserva: ${safe(leadName)}${leadCode?` · ${safe(leadCode)}`:''}</p>`:''}
        <p style="font-size:11px;color:#6b655d">Enviado desde Hotel Experience CRM.</p>
      </div>`;

    const r=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{Authorization:`Bearer ${resendKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({from,to:[String(to).trim()],subject:String(subject).trim(),html})
    });
    const result=await r.json().catch(()=>({}));
    if(!r.ok)return res.status(r.status).json({error:result?.message||'No se pudo enviar el correo.'});
    return res.status(200).json({ok:true,id:result.id||null});
  }catch(e){
    return res.status(500).json({error:e?.message||'No se pudo enviar el correo.'});
  }
}
