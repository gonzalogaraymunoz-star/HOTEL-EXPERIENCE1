import {createClient} from '@supabase/supabase-js';

const PROJECT_URL='https://lpirjwifzosdzgdncsbt.supabase.co';
const PROJECT_PUBLISHABLE_KEY='sb_publishable_ORe3lY3LRSZo0LMpz4EM9Q_Bf9aUejD';

async function authenticatedUser(req){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  if(!token)throw Object.assign(new Error('Sesión requerida.'),{status:401});

  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||PROJECT_URL;
  const publishable=process.env.VITE_SUPABASE_PUBLISHABLE_KEY||process.env.VITE_SUPABASE_ANON_KEY||PROJECT_PUBLISHABLE_KEY;

  const sb=createClient(url,publishable,{auth:{autoRefreshToken:false,persistSession:false}});
  const {data:userData,error:userError}=await sb.auth.getUser(token);
  if(userError||!userData.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});

  const authed=createClient(url,publishable,{
    auth:{autoRefreshToken:false,persistSession:false},
    global:{headers:{Authorization:`Bearer ${token}`}}
  });
  const {data:profile}=await authed.from('profiles')
    .select('role,is_active,email,full_name')
    .eq('id',userData.user.id)
    .maybeSingle();

  if(!profile?.is_active||!['admin','manager','agent'].includes(profile.role)){
    throw Object.assign(new Error('Tu rol no puede enviar correos.'),{status:403});
  }

  return {user:userData.user,profile};
}

function mailConfiguration(){
  const apiKey=String(process.env.RESEND_API_KEY||'').trim();
  const from=String(process.env.EMAIL_FROM||'').trim();
  const usingTestDomain=!from||/@resend\.dev(?:>|$)/i.test(from);

  if(!apiKey){
    return {
      configured:false,
      sender:from||null,
      reason:'Falta RESEND_API_KEY en Vercel.'
    };
  }

  if(usingTestDomain){
    return {
      configured:false,
      sender:from||null,
      reason:'Configura EMAIL_FROM con un dominio verificado en Resend. resend.dev solo permite enviar correos de prueba a la dirección de tu propia cuenta.'
    };
  }

  return {configured:true,sender:from,reason:null};
}

export default async function handler(req,res){
  try{
    await authenticatedUser(req);

    const config=mailConfiguration();

    if(req.method==='GET'){
      return res.status(200).json(config);
    }

    if(req.method!=='POST'){
      return res.status(405).json({error:'Método no permitido'});
    }

    if(!config.configured){
      return res.status(503).json({
        error:config.reason,
        code:'MAIL_NOT_CONFIGURED'
      });
    }

    const {
      to,subject,body,leadName='',leadCode='',
      communicationType='Comunicación',replyTo=''
    }=req.body||{};

    const recipients=parseRecipients(to);
    if(!recipients.length)return res.status(400).json({error:'Correo destinatario inválido.'});
    if(recipients.length>10)return res.status(400).json({error:'Máximo 10 destinatarios por envío.'});
    if(!subject||!String(subject).trim())return res.status(400).json({error:'Falta el asunto.'});
    if(!body||!String(body).trim())return res.status(400).json({error:'Falta el mensaje.'});
    if(String(subject).length>180)return res.status(400).json({error:'El asunto es demasiado largo.'});
    if(String(body).length>12000)return res.status(400).json({error:'El mensaje es demasiado largo.'});

    const safe=(value='')=>String(value).replace(/[&<>"']/g,char=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[char]));
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

    const payload={
      from:config.sender,
      to:recipients,
      subject:String(subject).trim(),
      html
    };
    if(validEmail(replyTo))payload.reply_to=String(replyTo).trim();

    const response=await fetch('https://api.resend.com/emails',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type':'application/json'
      },
      body:JSON.stringify(payload)
    });

    const result=await response.json().catch(()=>({}));
    if(!response.ok){
      const providerMessage=result?.message||'No se pudo enviar el correo.';
      const testingHint=response.status===403&&/testing emails|verify a domain|resend\.dev/i.test(providerMessage)
        ?' Verifica un dominio en Resend y usa ese dominio en EMAIL_FROM.'
        :'';
      return res.status(response.status).json({
        error:`${providerMessage}${testingHint}`.trim(),
        code:result?.name||result?.code||'RESEND_ERROR'
      });
    }

    return res.status(200).json({
      ok:true,
      id:result.id||null,
      recipients,
      sender:config.sender
    });
  }catch(e){
    return res.status(e?.status||500).json({
      error:e?.message||'No se pudo enviar el correo.'
    });
  }
}

function parseRecipients(value){
  const raw=Array.isArray(value)?value:[value];
  const result=[];
  for(const part of raw){
    for(const candidate of String(part||'').split(/[;,]/)){
      const email=candidate.trim().toLowerCase();
      if(validEmail(email)&&!result.includes(email))result.push(email);
    }
  }
  return result;
}

function validEmail(value){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value||'').trim());
}
