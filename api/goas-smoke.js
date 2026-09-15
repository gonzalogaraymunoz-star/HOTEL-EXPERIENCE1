import {createClient} from '@supabase/supabase-js';
import {generateGoasOperationLists} from './_lib/goas-online-lists.js';

export const config={maxDuration:60};

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método no permitido.'});
  try{
    const admin=setup();
    const {data,error}=await admin.from('server_integration_settings').select('config').eq('integration_key','goas_smoke_test').maybeSingle();
    if(error)throw error;
    if(!data?.config?.token||String(req.query.token||'')!==String(data.config.token))return res.status(403).json({error:'Token inválido.'});
    const departureId=String(req.query.departureId||'');
    if(!departureId)return res.status(400).json({error:'Falta departureId.'});
    const result=await generateGoasOperationLists(admin,departureId);
    return res.status(200).json(result);
  }catch(error){
    console.error('goas-smoke',error);
    return res.status(error?.status||500).json({error:error?.message||String(error)});
  }
}
