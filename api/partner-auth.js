import {
  destroyPartnerSession,getPartnerSession,issuePartnerSession,noStore,
  publicAccount,setupAdmin,verifyPassword
} from './_lib/partner-portal.js';

export default async function handler(req,res){
  noStore(res);
  try{
    const admin=setupAdmin();

    if(req.method==='GET'){
      const current=await getPartnerSession(req,admin);
      if(!current)return res.status(401).json({authenticated:false});
      return res.status(200).json({authenticated:true,account:publicAccount(current.account)});
    }

    if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
    const action=String(req.body?.action||'login');

    if(action==='logout'){
      await destroyPartnerSession(req,res,admin);
      return res.status(200).json({ok:true});
    }

    if(action!=='login')return res.status(400).json({error:'Acción inválida.'});

    const accessCode=String(req.body?.accessCode||'').trim().toUpperCase().slice(0,100);
    const password=String(req.body?.password||'').slice(0,200);
    const generic='Credenciales incorrectas o acceso desactivado.';
    if(!accessCode||!password)return res.status(401).json({error:generic});

    const {data:account,error}=await admin.from('partner_portal_accounts')
      .select('*').eq('access_code',accessCode).maybeSingle();
    if(error)throw error;

    if(!account?.active||!verifyPassword(password,account.password_hash)){
      await new Promise(resolve=>setTimeout(resolve,300));
      return res.status(401).json({error:generic});
    }

    await admin.from('partner_portal_sessions').delete().lt('expires_at',new Date().toISOString());
    await admin.from('partner_portal_accounts')
      .update({last_login_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq('id',account.id);

    await issuePartnerSession(res,admin,account.id);
    return res.status(200).json({authenticated:true,account:publicAccount(account)});
  }catch(e){
    console.error('partner-auth',e);
    return res.status(e.status||500).json({error:e.message||'No se pudo validar el acceso.'});
  }
}
