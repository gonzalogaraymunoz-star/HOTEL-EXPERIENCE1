
import {createClient} from '@supabase/supabase-js';
import {CANONICAL_FIELDS,analyzeForm,buildContext,generateForm,listTemplates,loadTemplate,saveTemplate} from './_lib/link-forms.js';

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
  const {data:profile,error:profileError}=await admin.from('profiles').select('id,role,is_active').eq('id',data.user.id).single();
  if(profileError)throw profileError;
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return{user:data.user,profile};
}

export default async function handler(req,res){
  if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido.'});
  try{
    const admin=setup();
    const auth=await userFrom(req,admin);

    if(req.method==='GET'){
      const [templates]=await Promise.all([listTemplates(admin)]);
      return res.status(200).json({ok:true,templates,dictionary:CANONICAL_FIELDS});
    }

    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    const action=body.action||'list';

    if(action==='list')return res.status(200).json({ok:true,templates:await listTemplates(admin),dictionary:CANONICAL_FIELDS});
    if(action==='dictionary')return res.status(200).json({ok:true,dictionary:CANONICAL_FIELDS});

    if(action==='context'){
      const context=await buildContext(admin,{
        leadId:body.leadId||null,departureId:body.departureId||null,leadServiceId:body.leadServiceId||null,
        contextScope:body.contextScope||'reservation'
      });
      return res.status(200).json({ok:true,context});
    }

    if(action==='analyze'){
      let context=null;
      if(body.leadId||body.departureId){
        context=await buildContext(admin,{
          leadId:body.leadId||null,departureId:body.departureId||null,leadServiceId:body.leadServiceId||null,
          contextScope:body.contextScope||'reservation'
        });
      }
      const result=await analyzeForm(admin,{
        fileName:body.fileName,mimeType:body.mimeType,base64:body.base64,context
      });
      return res.status(200).json({ok:true,...result,contextSummary:context?{
        scope:context.scope,reservationCode:context.reservation?.code||null,departureCode:context.departure?.code||null,
        passengerCount:context.passengers?.length||0,serviceCount:context.services?.length||0
      }:null});
    }

    if(action==='save_template'){
      if(!['admin','manager'].includes(String(auth.profile.role||''))){
        return res.status(403).json({error:'Solo admin o manager puede enseñar nuevas plantillas a LINK Forms.'});
      }
      const template=await saveTemplate(admin,auth.user,{
        title:body.title,businessScope:body.businessScope||'link',contextScope:body.contextScope||'reservation',
        fileName:body.fileName,mimeType:body.mimeType,base64:body.base64,fields:body.fields||[]
      });
      return res.status(200).json({ok:true,template});
    }

    if(action==='template'){
      if(!body.templateId)return res.status(400).json({error:'Falta templateId.'});
      return res.status(200).json({ok:true,...await loadTemplate(admin,body.templateId)});
    }

    if(action==='generate'){
      if(!body.templateId)return res.status(400).json({error:'Falta templateId.'});
      const result=await generateForm(admin,auth.user,{
        templateId:body.templateId,leadId:body.leadId||null,departureId:body.departureId||null,leadServiceId:body.leadServiceId||null
      });
      return res.status(200).json({ok:true,...result});
    }

    return res.status(400).json({error:'Acción no reconocida.'});
  }catch(error){
    console.error('link-forms',error);
    return res.status(error?.status||500).json({error:error?.message||'LINK Forms no pudo completar la solicitud.'});
  }
}
