import {createClient} from '@supabase/supabase-js';
import {generatePassengerRiskSheet} from './_lib/risk-sheet-pdf.js';

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
export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const admin=setup();
    const {user}=await userFrom(req,admin);
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(body.action!=='generate')return res.status(400).json({error:'Acción no reconocida.'});
    if(!body.departureId||!body.passengerId)return res.status(400).json({error:'Falta departureId o passengerId.'});
    return res.status(200).json(await generatePassengerRiskSheet(admin,user,body.departureId,body.passengerId));
  }catch(error){
    console.error('risk-sheet',error);
    return res.status(error?.status||500).json({error:error?.message||'No se pudo generar la hoja de riesgo estándar.'});
  }
}
