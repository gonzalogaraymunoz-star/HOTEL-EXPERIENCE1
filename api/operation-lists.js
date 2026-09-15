import {createClient} from '@supabase/supabase-js';
import {listDepartureDocumentsForLead} from './_lib/departure-operation-lists.js';
import {generateGoasOperationLists} from './_lib/goas-online-lists.js';

export const config={maxDuration:60};

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

async function userFrom(req,admin){
  const token=String(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).single();
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return{user:data.user,profile};
}

async function smokeAllowed(req,admin){
  const {data,error}=await admin.from('server_integration_settings').select('config').eq('integration_key','goas_smoke_test').maybeSingle();
  if(error)throw error;
  return Boolean(data?.config?.token)&&String(req.query?.token||'')===String(data.config.token);
}

export default async function handler(req,res){
  try{
    const admin=setup();

    if(req.method==='GET'&&req.query?.smoke==='1'){
      if(!(await smokeAllowed(req,admin)))return res.status(403).json({error:'Token inválido.'});
      const departureId=String(req.query?.departureId||'');
      if(!departureId)return res.status(400).json({error:'Falta departureId.'});
      return res.status(200).json(await generateGoasOperationLists(admin,departureId));
    }

    if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});

    await userFrom(req,admin);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});

    if(body.action==='list_for_lead'){
      if(!body.leadId)return res.status(400).json({error:'Falta leadId.'});
      return res.status(200).json(await listDepartureDocumentsForLead(admin,body.leadId));
    }

    if(body.action==='generate'){
      if(!body.departureId)return res.status(400).json({error:'Falta departureId.'});
      return res.status(200).json(await generateGoasOperationLists(admin,body.departureId));
    }

    return res.status(400).json({error:'Acción no reconocida.'});
  }catch(error){
    console.error('operation-lists',error);
    return res.status(error?.status||500).json({error:error?.message||'No se pudieron generar las listas prellenadas.'});
  }
}
