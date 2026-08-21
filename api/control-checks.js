import {createClient} from '@supabase/supabase-js';
import crypto from 'crypto';
import {runControlChecks} from './_lib/control-engine.js';

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

async function userFrom(req,admin){
  const token=(req.headers.authorization||'').replace(/^Bearer\s+/,'');
  const {data,error}=await admin.auth.getUser(token);
  if(error||!data.user)throw Object.assign(new Error('Sesión inválida.'),{status:401});
  const {data:profile}=await admin.from('profiles').select('*').eq('id',data.user.id).single();
  if(!profile?.is_active)throw Object.assign(new Error('Cuenta desactivada.'),{status:403});
  return {user:data.user,profile};
}

function isCronRequest(req){
  const secret=String(process.env.CRON_SECRET||'');
  const header=String(req.headers.authorization||'');
  return Boolean(secret&&header===`Bearer ${secret}`);
}

function fingerprint(issue){
  return crypto.createHash('sha256')
    .update([
      issue.category||'general',
      issue.lead_id||'',
      issue.service_id||'',
      issue.title||''
    ].join('|'))
    .digest('hex');
}

async function createAutomationTask(admin,issue){
  if(!issue.lead_id)return null;

  const due=new Date(Date.now()+2*60*60*1000).toISOString();
  const {data,error}=await admin.from('crm_tasks').insert({
    lead_id:issue.lead_id,
    title:`AUTO · ${String(issue.title||'Alerta operacional').slice(0,220)}`,
    due_date:due,
    priority:'Urgente',
    status:'Pendiente',
    notes:[
      'Creada automáticamente por Control Preventivo.',
      issue.detail||'',
      issue.recommended_action?`Acción sugerida: ${issue.recommended_action}`:''
    ].filter(Boolean).join('\n')
  }).select('id').single();

  if(error)throw error;

  await admin.from('crm_activities').insert({
    lead_id:issue.lead_id,
    type:'automation_alert',
    title:'Alerta crítica convertida en tarea',
    body:`${issue.title}${issue.service_name?` · ${issue.service_name}`:''}`,
    created_by:'Automatización CRM'
  });

  return data?.id||null;
}

async function completeAutomationTask(admin,taskId){
  if(!taskId)return;
  await admin.from('crm_tasks')
    .update({status:'Completada',updated_at:new Date().toISOString()})
    .eq('id',taskId)
    .neq('status','Completada');
}

async function syncAlerts(admin,scan){
  const now=new Date().toISOString();

  const {data:existing,error}=await admin.from('automation_alerts')
    .select('id,fingerprint,status,task_id,severity,lead_id')
    .in('status',['open','acknowledged','resolved']);

  if(error)throw error;

  const existingMap=new Map((existing||[]).map(row=>[row.fingerprint,row]));
  const seen=new Set();
  let createdTasks=0;

  for(const issue of scan.issues||[]){
    const fp=fingerprint(issue);
    seen.add(fp);
    const current=existingMap.get(fp);

    if(!current){
      let taskId=null;
      if(issue.severity==='critical'){
        taskId=await createAutomationTask(admin,issue);
        if(taskId)createdTasks++;
      }

      const {error:insertError}=await admin.from('automation_alerts').insert({
        fingerprint:fp,
        source:'control',
        severity:issue.severity,
        category:issue.category||'general',
        title:issue.title,
        detail:issue.detail||'',
        recommended_action:issue.recommended_action||null,
        lead_id:issue.lead_id||null,
        lead_service_id:issue.service_id||null,
        status:'open',
        first_seen_at:now,
        last_seen_at:now,
        task_id:taskId,
        metadata:{
          lead_name:issue.lead_name||null,
          lead_code:issue.lead_code||null,
          service_name:issue.service_name||null,
          service_date:issue.service_date||null
        },
        updated_at:now
      });
      if(insertError)throw insertError;
      continue;
    }

    let taskId=current.task_id||null;
    if(issue.severity==='critical'&&!taskId){
      taskId=await createAutomationTask(admin,issue);
      if(taskId)createdTasks++;
    }

    const patch={
      severity:issue.severity,
      category:issue.category||'general',
      title:issue.title,
      detail:issue.detail||'',
      recommended_action:issue.recommended_action||null,
      lead_id:issue.lead_id||null,
      lead_service_id:issue.service_id||null,
      last_seen_at:now,
      task_id:taskId,
      metadata:{
        lead_name:issue.lead_name||null,
        lead_code:issue.lead_code||null,
        service_name:issue.service_name||null,
        service_date:issue.service_date||null
      },
      updated_at:now
    };

    // Si una alerta ya fue reconocida, no la volvemos a "open" en cada corrida.
    // Si estaba resuelta y reaparece, sí vuelve a abrirse.
    if(current.status==='resolved'){
      patch.status='open';
      patch.resolved_at=null;
      patch.acknowledged_at=null;
      patch.acknowledged_by=null;
    }

    const {error:updateError}=await admin.from('automation_alerts').update(patch).eq('id',current.id);
    if(updateError)throw updateError;
  }

  for(const current of existing||[]){
    if(current.status==='resolved'||seen.has(current.fingerprint))continue;

    const {error:resolveError}=await admin.from('automation_alerts').update({
      status:'resolved',
      resolved_at:now,
      updated_at:now
    }).eq('id',current.id);

    if(resolveError)throw resolveError;
    await completeAutomationTask(admin,current.task_id);
  }

  return {createdTasks};
}

function escapeHtml(value=''){
  return String(value).replace(/[&<>"']/g,m=>({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[m]));
}

async function sendDigest(admin,scan){
  const apiKey=process.env.RESEND_API_KEY;
  if(!apiKey)return {sent:0,reason:'RESEND_API_KEY no configurada'};
  if(Number(scan.summary?.critical||0)+Number(scan.summary?.warning||0)===0){
    return {sent:0,reason:'Sin alertas críticas o advertencias'};
  }

  const {data:profiles,error}=await admin.from('profiles')
    .select('email,full_name,role,is_active')
    .eq('is_active',true)
    .in('role',['admin','manager']);

  if(error)throw error;

  const recipients=(profiles||[])
    .map(p=>String(p.email||'').trim().toLowerCase())
    .filter(email=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email));

  if(!recipients.length)return {sent:0,reason:'Sin destinatarios admin/manager'};

  const important=(scan.issues||[])
    .filter(i=>i.severity==='critical'||i.severity==='warning')
    .slice(0,14);

  const rows=important.map(i=>`
    <div style="border-top:1px solid #e6e0d8;padding:12px 0">
      <div style="font-size:10px;font-weight:800;letter-spacing:.08em;color:${i.severity==='critical'?'#a13b32':'#8a641f'}">
        ${i.severity==='critical'?'CRÍTICO':'REVISAR'}
      </div>
      <div style="font-size:14px;font-weight:700;margin-top:3px">${escapeHtml(i.title)}</div>
      <div style="font-size:12px;color:#625c55;margin-top:3px">${escapeHtml(i.detail||'')}</div>
      <div style="font-size:11px;color:#80786f;margin-top:5px">
        ${escapeHtml([i.lead_code,i.service_date,i.service_name].filter(Boolean).join(' · '))}
      </div>
    </div>
  `).join('');

  const subject=`Hotel Experience · ${scan.summary.critical||0} crítica(s) · ${scan.summary.warning||0} por revisar`;
  const html=`
    <div style="font-family:Arial,sans-serif;max-width:720px;margin:auto;color:#171717">
      <div style="font-size:11px;letter-spacing:.15em;margin-bottom:18px">HOTEL EXPERIENCE · CONTROL AUTOMÁTICO</div>
      <div style="border:1px solid #ddd5cb;border-radius:18px;padding:22px;background:#fbf8f2">
        <h1 style="font-size:24px;margin:0 0 8px">Resumen preventivo diario</h1>
        <p style="font-size:13px;color:#615b54;line-height:1.5">
          Se detectaron <b>${scan.summary.critical||0}</b> alertas críticas,
          <b>${scan.summary.warning||0}</b> advertencias y
          <b>${scan.summary.info||0}</b> observaciones informativas.
        </p>
        ${rows}
      </div>
      <p style="font-size:11px;color:#777067;line-height:1.5">
        Las alertas críticas nuevas se convierten automáticamente en tareas Urgentes dentro del CRM.
        Este correo no ejecuta pagos, cierres, reembolsos ni cambios de proveedor.
      </p>
    </div>`;

  const from=process.env.EMAIL_FROM||'Hotel Experience <onboarding@resend.dev>';
  let sent=0;

  for(const email of recipients){
    try{
      const r=await fetch('https://api.resend.com/emails',{
        method:'POST',
        headers:{
          Authorization:`Bearer ${apiKey}`,
          'Content-Type':'application/json'
        },
        body:JSON.stringify({from,to:[email],subject,html})
      });
      if(r.ok)sent++;
    }catch{}
  }

  return {sent};
}

async function runAutomation(admin){
  const {data:run,error:runError}=await admin.from('automation_runs').insert({
    run_type:'daily_control',
    status:'running'
  }).select('id').single();

  if(runError)throw runError;
  const runId=run.id;

  try{
    const scan=await runControlChecks(admin,{role:'admin',is_active:true},{id:null});
    const synced=await syncAlerts(admin,scan);
    const digest=await sendDigest(admin,scan);

    await admin.from('automation_runs').update({
      status:'completed',
      critical_count:Number(scan.summary?.critical||0),
      warning_count:Number(scan.summary?.warning||0),
      info_count:Number(scan.summary?.info||0),
      created_tasks:synced.createdTasks,
      emailed_recipients:Number(digest.sent||0),
      completed_at:new Date().toISOString()
    }).eq('id',runId);

    return {
      ok:true,
      summary:scan.summary,
      created_tasks:synced.createdTasks,
      emailed_recipients:Number(digest.sent||0)
    };
  }catch(e){
    await admin.from('automation_runs').update({
      status:'failed',
      error_message:String(e?.message||e).slice(0,1500),
      completed_at:new Date().toISOString()
    }).eq('id',runId);
    throw e;
  }
}

export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).json({error:'Método no permitido'});

  try{
    const admin=setup();

    // Vercel Cron usa el mismo endpoint que ya existía.
    // Así no agregamos una Serverless Function extra y seguimos dentro del límite Hobby.
    if(isCronRequest(req)){
      const result=await runAutomation(admin);
      return res.status(200).json(result);
    }

    // Se conserva exactamente el comportamiento interactivo de v6.17:
    // un usuario autenticado abre Control Preventivo y recibe un scan actual.
    const {user,profile}=await userFrom(req,admin);
    const result=await runControlChecks(admin,profile,user);
    return res.status(200).json(result);
  }catch(e){
    return res.status(e.status||500).json({
      error:e.message||'No se pudo ejecutar el control preventivo.'
    });
  }
}
