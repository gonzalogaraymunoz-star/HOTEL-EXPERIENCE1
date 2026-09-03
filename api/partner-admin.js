import {
  crmUserFrom,hashPassword,makeAccessCode,noStore,normalizePrefix,
  publicAccount,randomPassword,setupAdmin
} from './_lib/partner-portal.js';
import {
  OPERATION_XLSX_MIME,getOperationTemplateStatus,saveOperationTemplate,generateOperationWorkbook
} from './_lib/operation-documents.js';

function allowed(profile){
  return ['admin','manager'].includes(String(profile?.role||''));
}
function operationsAllowed(profile){
  return ['admin','manager','agent'].includes(String(profile?.role||''));
}

export default async function handler(req,res){
  noStore(res);
  try{
    const admin=setupAdmin();
    const {user,profile}=await crmUserFrom(req,admin);
    const queryAction=String(req.query?.action||'');

    if(queryAction.startsWith('operation_')||queryAction==='generate_operation_sheet'){
      if(!operationsAllowed(profile))return res.status(403).json({error:'Permisos insuficientes para documentación operacional.'});

      if(queryAction==='operation_template_status'){
        if(req.method!=='GET')return res.status(405).json({error:'Método no permitido.'});
        const result=await getOperationTemplateStatus(admin);
        return res.status(200).json(result);
      }

      if(queryAction==='operation_template_upload'){
        if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
        let body=req.body;
        if(typeof body==='string')body=Buffer.from(body,'binary');
        if(!(body instanceof Buffer))body=Buffer.from(body||[]);
        const result=await saveOperationTemplate(admin,body.toString('base64'));
        return res.status(200).json(result);
      }

      if(queryAction==='generate_operation_sheet'){
        if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
        const leadId=String(req.body?.leadId||'');
        if(!leadId)return res.status(400).json({error:'Falta leadId.'});
        const result=await generateOperationWorkbook(admin,user,leadId);
        res.setHeader('Content-Type',OPERATION_XLSX_MIME);
        res.setHeader('Content-Disposition',`attachment; filename="${result.fileName}"`);
        res.setHeader('X-Document-Version',String(result.version));
        return res.status(200).send(result.buffer);
      }

      return res.status(400).json({error:'Acción operacional inválida.'});
    }

    if(!allowed(profile))return res.status(403).json({error:'Permisos insuficientes.'});

    if(req.method==='GET'){
      const {data,error}=await admin.from('partner_portal_accounts')
        .select('*').order('created_at',{ascending:false});
      if(error)throw error;
      return res.status(200).json({accounts:(data||[]).map(publicAccount)});
    }

    if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
    const action=String(req.body?.action||'create');

    if(action==='create'){
      const name=String(req.body?.name||'').trim().slice(0,160);
      const partnerType=String(req.body?.partnerType||'hotel');
      const scopeValue=String(req.body?.scopeValue||name).trim().slice(0,180);
      const leadPrefix=normalizePrefix(req.body?.leadPrefix,name);
      const notes=String(req.body?.notes||'').trim().slice(0,1000);
      if(!name||!scopeValue||!['hotel','agency'].includes(partnerType)){
        return res.status(400).json({error:'Completa nombre, tipo y alcance del partner.'});
      }

      let accessCode=makeAccessCode(partnerType,name);
      for(let i=0;i<4;i++){
        const {data}=await admin.from('partner_portal_accounts').select('id').eq('access_code',accessCode).maybeSingle();
        if(!data)break;
        accessCode=makeAccessCode(partnerType,name);
      }

      const temporaryPassword=randomPassword();
      const {data,error}=await admin.from('partner_portal_accounts').insert({
        name,partner_type:partnerType,scope_value:scopeValue,lead_prefix:leadPrefix,
        access_code:accessCode,password_hash:hashPassword(temporaryPassword),
        active:true,can_create_requests:true,notes,created_by:user.id
      }).select('*').single();
      if(error)throw error;

      return res.status(201).json({
        account:publicAccount(data),
        temporary_password:temporaryPassword
      });
    }

    const id=String(req.body?.id||'');
    if(!id)return res.status(400).json({error:'Partner requerido.'});

    const {data:account,error:accountError}=await admin.from('partner_portal_accounts')
      .select('*').eq('id',id).maybeSingle();
    if(accountError)throw accountError;
    if(!account)return res.status(404).json({error:'Partner no encontrado.'});

    if(action==='reset_password'){
      const temporaryPassword=randomPassword();
      const {error}=await admin.from('partner_portal_accounts')
        .update({password_hash:hashPassword(temporaryPassword),updated_at:new Date().toISOString()})
        .eq('id',id);
      if(error)throw error;
      await admin.from('partner_portal_sessions').delete().eq('account_id',id);
      return res.status(200).json({
        account:publicAccount(account),
        temporary_password:temporaryPassword
      });
    }

    if(action==='toggle'){
      const active=Boolean(req.body?.active);
      const {data,error}=await admin.from('partner_portal_accounts')
        .update({active,updated_at:new Date().toISOString()}).eq('id',id).select('*').single();
      if(error)throw error;
      if(!active)await admin.from('partner_portal_sessions').delete().eq('account_id',id);
      return res.status(200).json({account:publicAccount(data)});
    }

    if(action==='update'){
      const patch={};
      if(req.body?.name!==undefined)patch.name=String(req.body.name||'').trim().slice(0,160);
      if(req.body?.scopeValue!==undefined)patch.scope_value=String(req.body.scopeValue||'').trim().slice(0,180);
      if(req.body?.leadPrefix!==undefined)patch.lead_prefix=normalizePrefix(req.body.leadPrefix,account.name);
      if(req.body?.notes!==undefined)patch.notes=String(req.body.notes||'').trim().slice(0,1000);
      if(req.body?.canCreateRequests!==undefined)patch.can_create_requests=Boolean(req.body.canCreateRequests);
      patch.updated_at=new Date().toISOString();
      const {data,error}=await admin.from('partner_portal_accounts')
        .update(patch).eq('id',id).select('*').single();
      if(error)throw error;
      return res.status(200).json({account:publicAccount(data)});
    }

    return res.status(400).json({error:'Acción inválida.'});
  }catch(e){
    console.error('partner-admin',e);
    return res.status(e.status||500).json({error:e.message||'No se pudo administrar el portal B2B.'});
  }
}
