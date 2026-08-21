import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertTriangle,Bell,CalendarClock,CheckCircle2,ChevronDown,Circle,
  Clock3,Mail,Plus,RefreshCw,Search,Send,UserRound,UsersRound,X
} from 'lucide-react';
import type {Lead,CRMTask,LeadService,ServiceAssignment,Supplier} from '../types';
import {
  createActivity,createTask,loadOperationsData,loadTeamDirectory,updateTask
} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './TasksWorkspace.css';

type TeamUser={
  id:string;
  full_name?:string|null;
  email?:string|null;
  role?:string|null;
};

type MailStatus={
  configured:boolean;
  sender?:string|null;
  reason?:string|null;
};

type FilterKey='pending'|'overdue'|'today'|'upcoming'|'completed'|'all';
type NotifyTarget='responsible'|'client'|'supplier'|'custom';

type OpsState={
  assignments:ServiceAssignment[];
  suppliers:Supplier[];
};

export default function TasksWorkspace({
  leads,tasks,refresh
}:{
  leads:Lead[];
  tasks:CRMTask[];
  refresh:()=>void|Promise<void>;
}){
  const [team,setTeam]=useState<TeamUser[]>([]);
  const [services,setServices]=useState<LeadService[]>([]);
  const [ops,setOps]=useState<OpsState>({assignments:[],suppliers:[]});
  const [mailStatus,setMailStatus]=useState<MailStatus>({configured:false});
  const [loadingContext,setLoadingContext]=useState(true);

  const [filter,setFilter]=useState<FilterKey>('pending');
  const [search,setSearch]=useState('');
  const [composerOpen,setComposerOpen]=useState(false);

  const [title,setTitle]=useState('');
  const [leadId,setLeadId]=useState('');
  const [serviceId,setServiceId]=useState('');
  const [due,setDue]=useState('');
  const [priority,setPriority]=useState('Media');
  const [responsibleId,setResponsibleId]=useState('');
  const [notes,setNotes]=useState('');
  const [notifyOnCreate,setNotifyOnCreate]=useState(false);
  const [notifyTarget,setNotifyTarget]=useState<NotifyTarget>('responsible');
  const [customEmail,setCustomEmail]=useState('');
  const [saving,setSaving]=useState(false);

  const [notifyTask,setNotifyTask]=useState<CRMTask|null>(null);
  const [notifyTaskTarget,setNotifyTaskTarget]=useState<NotifyTarget>('responsible');
  const [notifyTaskServiceId,setNotifyTaskServiceId]=useState('');
  const [notifyTaskCustomEmail,setNotifyTaskCustomEmail]=useState('');
  const [sending,setSending]=useState(false);

  const loadContext=async()=>{
    setLoadingContext(true);
    try{
      const db=assertSupabase();
      const [teamRows,serviceRows,operationRows,status]=await Promise.all([
        loadTeamDirectory().catch(()=>[]),
        db.from('lead_services')
          .select('id,lead_id,producto,fecha_servicio,numero_pax,observacion,precio_venta,moneda,estado_pago,estado_operacion,created_at,updated_at,tour_id,modality,pricing_status,price_pp_clp,pricing_source')
          .order('fecha_servicio',{ascending:true}),
        loadOperationsData().catch(()=>({assignments:[],suppliers:[]})),
        loadMailStatus().catch((e:any)=>({configured:false,reason:e?.message||'No se pudo verificar el correo.'}))
      ]);

      if(serviceRows.error)throw serviceRows.error;

      setTeam((teamRows||[]) as TeamUser[]);
      setServices((serviceRows.data||[]) as LeadService[]);
      setOps({
        assignments:(operationRows?.assignments||[]) as ServiceAssignment[],
        suppliers:(operationRows?.suppliers||[]) as Supplier[]
      });
      setMailStatus(status as MailStatus);
    }catch(e:any){
      setMailStatus(x=>({...x,reason:e?.message||x.reason||'No se pudo cargar el contexto.'}));
    }finally{
      setLoadingContext(false);
    }
  };

  useEffect(()=>{void loadContext()},[]);

  const now=Date.now();
  const startToday=startOfLocalDay(new Date()).getTime();
  const endToday=endOfLocalDay(new Date()).getTime();

  const pending=tasks.filter(t=>t.status!=='Completada');
  const completed=tasks.filter(t=>t.status==='Completada');
  const overdue=pending.filter(t=>dueMs(t)<startToday);
  const today=pending.filter(t=>{
    const ms=dueMs(t);
    return ms>=startToday&&ms<=endToday;
  });
  const upcoming=pending.filter(t=>Boolean(t.due_date)&&dueMs(t)>endToday);
  const noDate=pending.filter(t=>!t.due_date);

  const filtered=useMemo(()=>{
    const term=normalize(search);
    return [...tasks]
      .filter(task=>{
        const due=dueMs(task);
        if(filter==='pending'&&task.status==='Completada')return false;
        if(filter==='completed'&&task.status!=='Completada')return false;
        if(filter==='overdue'&&!(task.status!=='Completada'&&due<startToday))return false;
        if(filter==='today'&&!(task.status!=='Completada'&&due>=startToday&&due<=endToday))return false;
        if(filter==='upcoming'&&!(task.status!=='Completada'&&Boolean(task.due_date)&&due>endToday))return false;

        if(!term)return true;
        const lead=task.lead_id?leads.find(l=>l.id===task.lead_id):undefined;
        const owner=resolveResponsible(task.assigned_to,team);
        return normalize([
          task.title,task.notes,task.priority,task.status,
          lead?.reserva,lead?.codigo,lead?.empresa_ejecuta,
          owner?.full_name,owner?.email,task.assigned_to
        ].filter(Boolean).join(' ')).includes(term);
      })
      .sort((a,b)=>{
        if(a.status!==b.status)return a.status==='Completada'?1:-1;
        const ad=dueMs(a),bd=dueMs(b);
        const aOver=ad<now?0:1,bOver=bd<now?0:1;
        return aOver-bOver||ad-bd||String(b.created_at).localeCompare(String(a.created_at));
      });
  },[tasks,filter,search,leads,team,startToday,endToday,now]);

  const selectedLead=leads.find(l=>l.id===leadId)||null;
  const leadServices=services.filter(s=>s.lead_id===leadId);
  const selectedService=leadServices.find(s=>s.id===serviceId)||leadServices[0]||null;
  const responsible=team.find(u=>u.id===responsibleId)||null;
  const createRecipient=resolveRecipient(
    notifyTarget,selectedLead,selectedService,responsible,customEmail,ops
  );

  useEffect(()=>{
    if(!leadId){
      setServiceId('');
      if(notifyTarget==='client'||notifyTarget==='supplier')setNotifyTarget('responsible');
      return;
    }
    const next=services.find(s=>s.lead_id===leadId);
    if(!leadServices.some(s=>s.id===serviceId))setServiceId(next?.id||'');
  },[leadId,services.map(s=>s.id).join('|')]);

  const create=async()=>{
    if(!title.trim())return alert('Escribe una tarea.');
    if(notifyOnCreate&&!mailStatus.configured){
      return alert(mailStatus.reason||'El correo todavía no está configurado para envío real.');
    }
    if(notifyOnCreate&&!createRecipient.email){
      return alert(`No hay correo disponible para ${recipientLabel(notifyTarget).toLowerCase()}.`);
    }

    setSaving(true);
    let created:CRMTask|null=null;
    try{
      created=await createTask({
        lead_id:leadId||null,
        title:title.trim(),
        due_date:due?new Date(due).toISOString():null,
        priority,
        status:'Pendiente',
        assigned_to:responsibleId||null,
        notes:notes.trim()||null
      });

      if(created.lead_id){
        await createActivity({
          lead_id:created.lead_id,
          type:'task_created',
          title:'Tarea creada',
          body:`${created.title}${responsible?` · responsable ${responsible.full_name||responsible.email}`:''}${created.due_date?` · vence ${dateTime(created.due_date)}`:''}`,
          created_by:'CRM'
        });
      }

      if(notifyOnCreate&&createRecipient.email){
        try{
          await sendTaskNotification({
            task:created,
            lead:selectedLead,
            service:selectedService,
            recipient:createRecipient,
            communicationLabel:recipientLabel(notifyTarget)
          });

          if(created.lead_id){
            await createActivity({
              lead_id:created.lead_id,
              type:'task_notification_sent',
              title:'Notificación de tarea enviada',
              body:`${created.title} → ${createRecipient.email} · ${recipientLabel(notifyTarget)}`,
              created_by:'CRM'
            });
          }
        }catch(emailError:any){
          await refresh();
          resetComposer();
          setComposerOpen(false);
          return alert(`La tarea quedó creada, pero el correo no salió:\n\n${emailError?.message||'Error de envío.'}`);
        }
      }

      await refresh();
      resetComposer();
      setComposerOpen(false);
    }catch(e:any){
      alert(e?.message||'No se pudo crear la tarea.');
    }finally{
      setSaving(false);
    }
  };

  const toggleTask=async(task:CRMTask)=>{
    const next=task.status==='Completada'?'Pendiente':'Completada';
    try{
      await updateTask(task.id,{status:next});
      if(task.lead_id){
        await createActivity({
          lead_id:task.lead_id,
          type:next==='Completada'?'task_completed':'task_reopened',
          title:next==='Completada'?'Tarea completada':'Tarea reabierta',
          body:task.title,
          created_by:'CRM'
        });
      }
      await refresh();
    }catch(e:any){
      alert(e?.message||'No se pudo actualizar la tarea.');
    }
  };

  const openNotify=(task:CRMTask)=>{
    const lead=task.lead_id?leads.find(l=>l.id===task.lead_id):null;
    const owner=resolveResponsible(task.assigned_to,team);
    const leadService=lead?services.find(s=>s.lead_id===lead.id):null;

    let target:NotifyTarget='custom';
    if(owner?.email)target='responsible';
    else if(extractEmail(lead?.contacto||''))target='client';
    else if(leadService&&supplierForService(leadService,ops)?.email)target='supplier';

    setNotifyTask(task);
    setNotifyTaskTarget(target);
    setNotifyTaskServiceId(leadService?.id||'');
    setNotifyTaskCustomEmail('');
  };

  const sendExistingNotification=async()=>{
    if(!notifyTask)return;
    if(!mailStatus.configured){
      return alert(mailStatus.reason||'El correo todavía no está configurado para envío real.');
    }

    const lead=notifyTask.lead_id?leads.find(l=>l.id===notifyTask.lead_id)||null:null;
    const service=notifyTaskServiceId
      ?services.find(s=>s.id===notifyTaskServiceId)||null
      :(lead?services.find(s=>s.lead_id===lead.id)||null:null);
    const owner=resolveResponsible(notifyTask.assigned_to,team);
    const recipient=resolveRecipient(
      notifyTaskTarget,lead,service,owner,notifyTaskCustomEmail,ops
    );

    if(!recipient.email)return alert(`No hay correo disponible para ${recipientLabel(notifyTaskTarget).toLowerCase()}.`);

    setSending(true);
    try{
      await sendTaskNotification({
        task:notifyTask,
        lead,
        service,
        recipient,
        communicationLabel:recipientLabel(notifyTaskTarget)
      });

      if(notifyTask.lead_id){
        await createActivity({
          lead_id:notifyTask.lead_id,
          type:'task_notification_sent',
          title:'Notificación de tarea enviada',
          body:`${notifyTask.title} → ${recipient.email} · ${recipientLabel(notifyTaskTarget)}`,
          created_by:'CRM'
        });
      }

      setNotifyTask(null);
      await refresh();
      alert(`Notificación enviada a ${recipient.email}.`);
    }catch(e:any){
      alert(e?.message||'No se pudo enviar la notificación.');
    }finally{
      setSending(false);
    }
  };

  const resetComposer=()=>{
    setTitle('');
    setLeadId('');
    setServiceId('');
    setDue('');
    setPriority('Media');
    setResponsibleId('');
    setNotes('');
    setNotifyOnCreate(false);
    setNotifyTarget('responsible');
    setCustomEmail('');
  };

  return <div className="task-center">
    <section className="task-command">
      <div className="task-command-title">
        <div>
          <span className="eyebrow">CENTRO DE ACCIÓN</span>
          <h2>Tareas que terminan en una acción</h2>
          <p>Asigna responsables, controla vencimientos y notifica al equipo, pasajero o proveedor desde el mismo lugar.</p>
        </div>
        <div className="task-command-actions">
          <div className={mailStatus.configured?'mail-health ready':'mail-health pending'}>
            <Mail size={14}/>
            <span>
              <b>{mailStatus.configured?'Correo listo':'Correo pendiente'}</b>
              <small>{mailStatus.configured?(mailStatus.sender||'Remitente configurado'):(mailStatus.reason||'Falta configuración')}</small>
            </span>
          </div>
          <button className="secondary-button" onClick={loadContext}><RefreshCw size={15}/> Actualizar</button>
          <button className="primary-button" onClick={()=>setComposerOpen(x=>!x)}><Plus size={16}/> Nueva tarea</button>
        </div>
      </div>

      <div className="task-kpis">
        <TaskKpi label="Vencidas" value={overdue.length} tone={overdue.length?'danger':'neutral'} icon={<AlertTriangle size={16}/>}/>
        <TaskKpi label="Hoy" value={today.length} tone={today.length?'warn':'neutral'} icon={<CalendarClock size={16}/>}/>
        <TaskKpi label="Próximas" value={upcoming.length} icon={<Clock3 size={16}/>}/>
        <TaskKpi label="Sin fecha" value={noDate.length} icon={<Circle size={15}/>}/>
      </div>
    </section>

    {composerOpen&&<section className="surface-card task-composer">
      <div className="section-head-crm">
        <div><h2>Nueva tarea</h2><p>Primero define quién debe hacerla. Después decide si alguien necesita ser notificado.</p></div>
        <button className="icon-button" onClick={()=>{resetComposer();setComposerOpen(false)}}><X size={17}/></button>
      </div>

      <div className="task-form-grid">
        <label className="task-field wide">
          <span>Tarea *</span>
          <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Confirmar pickup con proveedor"/>
        </label>

        <label className="task-field">
          <span>Cliente / reserva</span>
          <select value={leadId} onChange={e=>setLeadId(e.target.value)}>
            <option value="">Tarea general</option>
            {leads.map(lead=><option key={lead.id} value={lead.id}>{lead.reserva} · {lead.codigo}</option>)}
          </select>
        </label>

        <label className="task-field">
          <span>Experiencia</span>
          <select value={serviceId} onChange={e=>setServiceId(e.target.value)} disabled={!leadId||!leadServices.length}>
            <option value="">Sin experiencia específica</option>
            {leadServices.map(service=><option key={service.id} value={service.id}>{dateShort(service.fecha_servicio)} · {service.producto}</option>)}
          </select>
        </label>

        <label className="task-field">
          <span>Responsable interno</span>
          <select value={responsibleId} onChange={e=>setResponsibleId(e.target.value)}>
            <option value="">Sin responsable</option>
            {team.map(user=><option key={user.id} value={user.id}>{user.full_name||user.email||'Usuario'}{user.role?` · ${user.role}`:''}</option>)}
          </select>
        </label>

        <label className="task-field">
          <span>Prioridad</span>
          <select value={priority} onChange={e=>setPriority(e.target.value)}>
            {['Baja','Media','Alta','Urgente'].map(value=><option key={value}>{value}</option>)}
          </select>
        </label>

        <label className="task-field">
          <span>Fecha y hora</span>
          <input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/>
        </label>

        <label className="task-field wide">
          <span>Notas / contexto</span>
          <textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Qué debe hacerse, qué falta y qué debe confirmarse."/>
        </label>
      </div>

      <div className="task-notification-box">
        <label className="task-notify-toggle">
          <input type="checkbox" checked={notifyOnCreate} onChange={e=>setNotifyOnCreate(e.target.checked)}/>
          <Bell size={15}/>
          <span><b>Notificar al crear</b><small>La tarea se guarda en Supabase aunque decidas no enviar correo.</small></span>
        </label>

        {notifyOnCreate&&<div className="task-notify-grid">
          <label className="task-field">
            <span>Notificar a</span>
            <select value={notifyTarget} onChange={e=>setNotifyTarget(e.target.value as NotifyTarget)}>
              <option value="responsible">Responsable interno</option>
              <option value="client">Pasajero / cliente</option>
              <option value="supplier">Proveedor de la experiencia</option>
              <option value="custom">Otro correo</option>
            </select>
          </label>

          {notifyTarget==='custom'&&<label className="task-field">
            <span>Correo</span>
            <input type="email" value={customEmail} onChange={e=>setCustomEmail(e.target.value)} placeholder="correo@dominio.com"/>
          </label>}

          <div className={createRecipient.email?'recipient-preview ready':'recipient-preview missing'}>
            <span>{recipientLabel(notifyTarget)}</span>
            <strong>{createRecipient.name||'Sin destinatario'}</strong>
            <small>{createRecipient.email||recipientMissingReason(notifyTarget,selectedLead,selectedService,responsible,ops)}</small>
          </div>
        </div>}
      </div>

      <div className="task-composer-footer">
        <span>{loadingContext?'Cargando equipo y proveedores…':mailStatus.configured?'El correo usa un único canal de envío verificado.':'Puedes crear tareas; el envío quedará disponible al configurar el dominio de correo.'}</span>
        <button className="primary-button" disabled={saving} onClick={create}>
          {notifyOnCreate?<Send size={15}/>:<Plus size={15}/>}
          {saving?'Guardando…':notifyOnCreate?'Crear y notificar':'Crear tarea'}
        </button>
      </div>
    </section>}

    <section className="surface-card task-list-card">
      <div className="task-toolbar">
        <div className="task-filter-row">
          <FilterButton active={filter==='pending'} onClick={()=>setFilter('pending')} label="Pendientes" count={pending.length}/>
          <FilterButton active={filter==='overdue'} onClick={()=>setFilter('overdue')} label="Vencidas" count={overdue.length} danger/>
          <FilterButton active={filter==='today'} onClick={()=>setFilter('today')} label="Hoy" count={today.length}/>
          <FilterButton active={filter==='upcoming'} onClick={()=>setFilter('upcoming')} label="Próximas" count={upcoming.length}/>
          <FilterButton active={filter==='completed'} onClick={()=>setFilter('completed')} label="Completadas" count={completed.length}/>
          <FilterButton active={filter==='all'} onClick={()=>setFilter('all')} label="Todas" count={tasks.length}/>
        </div>
        <div className="task-search"><Search size={14}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar tarea, cliente o responsable…"/></div>
      </div>

      <div className="task-action-list">
        {filtered.map(task=>{
          const lead=task.lead_id?leads.find(l=>l.id===task.lead_id):undefined;
          const owner=resolveResponsible(task.assigned_to,team);
          const dueState=taskDueState(task);
          return <article key={task.id} className={`task-action-row ${task.status==='Completada'?'completed':''} ${dueState}`}>
            <button className={task.status==='Completada'?'task-status-button done':'task-status-button'} onClick={()=>toggleTask(task)} title={task.status==='Completada'?'Reabrir tarea':'Marcar completada'}>
              {task.status==='Completada'?<CheckCircle2 size={20}/>:<Circle size={20}/>}
            </button>

            <div className="task-main">
              <div className="task-title-line">
                <strong>{task.title}</strong>
                <span className={`priority-pill ${normalize(task.priority)}`}>{task.priority}</span>
              </div>
              <div className="task-context">
                <span>{lead?<><b>{lead.reserva}</b> · {lead.codigo}</>:'Tarea general'}</span>
                <span><UserRound size={12}/>{owner?.full_name||owner?.email||task.assigned_to||'Sin responsable'}</span>
                {task.notes&&<span className="task-notes">{task.notes}</span>}
              </div>
            </div>

            <div className={`task-due ${dueState}`}>
              <small>{dueState==='overdue'?'VENCIDA':dueState==='today'?'HOY':task.status==='Completada'?'COMPLETADA':'VENCE'}</small>
              <strong>{task.due_date?dateTime(task.due_date):'Sin fecha'}</strong>
            </div>

            <div className="task-row-actions">
              <button className="secondary-button compact-btn" onClick={()=>openNotify(task)}><Bell size={13}/> Notificar</button>
              <button className="secondary-button compact-btn" onClick={()=>toggleTask(task)}>
                {task.status==='Completada'?<><Clock3 size={13}/> Reabrir</>:<><CheckCircle2 size={13}/> Completar</>}
              </button>
            </div>
          </article>;
        })}

        {!filtered.length&&<div className="task-empty">
          <CheckCircle2 size={24}/>
          <strong>No hay tareas en esta vista.</strong>
          <span>Cambia el filtro o crea una nueva acción.</span>
        </div>}
      </div>
    </section>

    {notifyTask&&<NotifyModal
      task={notifyTask}
      lead={notifyTask.lead_id?leads.find(l=>l.id===notifyTask.lead_id)||null:null}
      services={notifyTask.lead_id?services.filter(s=>s.lead_id===notifyTask.lead_id):[]}
      selectedServiceId={notifyTaskServiceId}
      setSelectedServiceId={setNotifyTaskServiceId}
      target={notifyTaskTarget}
      setTarget={setNotifyTaskTarget}
      customEmail={notifyTaskCustomEmail}
      setCustomEmail={setNotifyTaskCustomEmail}
      team={team}
      ops={ops}
      mailStatus={mailStatus}
      sending={sending}
      onClose={()=>setNotifyTask(null)}
      onSend={sendExistingNotification}
    />}
  </div>;
}

function NotifyModal({
  task,lead,services,selectedServiceId,setSelectedServiceId,target,setTarget,
  customEmail,setCustomEmail,team,ops,mailStatus,sending,onClose,onSend
}:{
  task:CRMTask;
  lead:Lead|null;
  services:LeadService[];
  selectedServiceId:string;
  setSelectedServiceId:(value:string)=>void;
  target:NotifyTarget;
  setTarget:(value:NotifyTarget)=>void;
  customEmail:string;
  setCustomEmail:(value:string)=>void;
  team:TeamUser[];
  ops:OpsState;
  mailStatus:MailStatus;
  sending:boolean;
  onClose:()=>void;
  onSend:()=>void;
}){
  const owner=resolveResponsible(task.assigned_to,team);
  const service=services.find(s=>s.id===selectedServiceId)||services[0]||null;
  const recipient=resolveRecipient(target,lead,service,owner,customEmail,ops);

  return <div className="task-modal-backdrop" onMouseDown={onClose}>
    <section className="task-notify-modal" onMouseDown={e=>e.stopPropagation()}>
      <header>
        <div><span className="eyebrow">NOTIFICAR TAREA</span><h3>{task.title}</h3></div>
        <button className="icon-button" onClick={onClose}><X size={17}/></button>
      </header>

      <p>Elige quién necesita enterarse. El correo no cambia el estado de la tarea: solo comunica la acción.</p>

      {!mailStatus.configured&&<div className="mail-config-warning">
        <AlertTriangle size={16}/>
        <div><strong>Envío real todavía no configurado</strong><span>{mailStatus.reason||'Falta EMAIL_FROM con dominio verificado.'}</span></div>
      </div>}

      <div className="notify-choice-grid">
        <NotifyChoice active={target==='responsible'} disabled={!owner?.email} icon={<UserRound/>} title="Responsable" detail={owner?.email||'Sin correo interno'} onClick={()=>setTarget('responsible')}/>
        <NotifyChoice active={target==='client'} disabled={!extractEmail(lead?.contacto||'')} icon={<Mail/>} title="Cliente" detail={extractEmail(lead?.contacto||'')||'Sin correo'} onClick={()=>setTarget('client')}/>
        <NotifyChoice active={target==='supplier'} disabled={!services.length} icon={<UsersRound/>} title="Proveedor" detail={service?supplierForService(service,ops)?.email||'Sin correo asignado':'Sin experiencia'} onClick={()=>setTarget('supplier')}/>
        <NotifyChoice active={target==='custom'} icon={<Send/>} title="Otro" detail="Escribir correo" onClick={()=>setTarget('custom')}/>
      </div>

      {target==='supplier'&&services.length>0&&<label className="task-field">
        <span>Experiencia</span>
        <select value={service?.id||''} onChange={e=>setSelectedServiceId(e.target.value)}>
          {services.map(s=><option key={s.id} value={s.id}>{dateShort(s.fecha_servicio)} · {s.producto}</option>)}
        </select>
      </label>}

      {target==='custom'&&<label className="task-field">
        <span>Correo destinatario</span>
        <input type="email" value={customEmail} onChange={e=>setCustomEmail(e.target.value)} placeholder="correo@dominio.com"/>
      </label>}

      <div className={recipient.email?'notify-recipient-card ready':'notify-recipient-card missing'}>
        <small>DESTINATARIO</small>
        <strong>{recipient.name||'Sin destinatario disponible'}</strong>
        <span>{recipient.email||'Registra un correo antes de notificar.'}</span>
      </div>

      <div className="notify-preview">
        <small>ASUNTO</small>
        <strong>Hotel Experience · Acción pendiente · {task.title}</strong>
        <p>{buildNotificationBody(task,lead,service,recipient).split('\n').slice(0,6).join('\n')}</p>
      </div>

      <div className="task-modal-actions">
        <button className="secondary-button" onClick={onClose}>Cancelar</button>
        <button className="primary-button" disabled={sending||!mailStatus.configured||!recipient.email} onClick={onSend}>
          <Send size={15}/>{sending?' Enviando…':' Enviar notificación'}
        </button>
      </div>
    </section>
  </div>;
}

function NotifyChoice({
  active,disabled=false,icon,title,detail,onClick
}:{
  active:boolean;disabled?:boolean;icon:React.ReactNode;title:string;detail:string;onClick:()=>void;
}){
  return <button type="button" disabled={disabled} className={active?'notify-choice active':'notify-choice'} onClick={onClick}>
    <span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div>
  </button>;
}

function TaskKpi({label,value,icon,tone='neutral'}:{label:string;value:number;icon:React.ReactNode;tone?:string}){
  return <div className={`task-kpi ${tone}`}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></div>;
}

function FilterButton({
  active,onClick,label,count,danger=false
}:{
  active:boolean;onClick:()=>void;label:string;count:number;danger?:boolean;
}){
  return <button className={`${active?'task-filter active':'task-filter'} ${danger&&count?'danger':''}`} onClick={onClick}>
    {label}<span>{count}</span>
  </button>;
}

async function loadMailStatus():Promise<MailStatus>{
  const {data:{session}}=await assertSupabase().auth.getSession();
  if(!session?.access_token)throw new Error('Sesión requerida.');
  const r=await fetch('/api/send-communication',{
    headers:{Authorization:`Bearer ${session.access_token}`}
  });
  const body=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(body.error||'No se pudo verificar el correo.');
  return {
    configured:Boolean(body.configured),
    sender:body.sender||null,
    reason:body.reason||null
  };
}

async function sendTaskNotification({
  task,lead,service,recipient,communicationLabel
}:{
  task:CRMTask;
  lead:Lead|null|undefined;
  service:LeadService|null|undefined;
  recipient:{email:string;name:string};
  communicationLabel:string;
}){
  if(!recipient.email||!recipient.email.includes('@'))throw new Error('Destinatario sin correo válido.');

  const {data:{session}}=await assertSupabase().auth.getSession();
  if(!session?.access_token)throw new Error('Sesión requerida.');

  const subject=`Hotel Experience · Acción pendiente · ${task.title}`;
  const body=buildNotificationBody(task,lead||null,service||null,recipient);

  const r=await fetch('/api/send-communication',{
    method:'POST',
    headers:{
      'Content-Type':'application/json',
      Authorization:`Bearer ${session.access_token}`
    },
    body:JSON.stringify({
      to:recipient.email,
      subject,
      body,
      leadName:lead?.reserva||'',
      leadCode:lead?.codigo||'',
      communicationType:`Tarea · ${communicationLabel}`
    })
  });

  const result=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(result?.error||'No se pudo enviar el correo.');
  return result;
}

function buildNotificationBody(
  task:CRMTask,
  lead:Lead|null,
  service:LeadService|null,
  recipient:{email:string;name:string}
){
  const lines=[
    `Hola${recipient.name?` ${recipient.name}`:''},`,
    '',
    'Hay una acción pendiente en Hotel Experience:',
    '',
    `Tarea: ${task.title}`,
    lead?`Reserva: ${lead.reserva} · ${lead.codigo}`:null,
    service?`Experiencia: ${service.producto}${service.fecha_servicio?` · ${dateShort(service.fecha_servicio)}`:''}`:null,
    `Prioridad: ${task.priority}`,
    task.due_date?`Vence: ${dateTime(task.due_date)}`:'Vence: sin fecha definida',
    task.notes?`Contexto: ${task.notes}`:null,
    '',
    'Por favor revisa esta acción y confirma lo necesario.',
    '',
    'Hotel Experience'
  ];
  return lines.filter(x=>x!==null).join('\n');
}

function resolveRecipient(
  target:NotifyTarget,
  lead:Lead|null,
  service:LeadService|null,
  responsible:TeamUser|null,
  customEmail:string,
  ops:OpsState
){
  if(target==='responsible'){
    return {
      email:String(responsible?.email||'').trim(),
      name:String(responsible?.full_name||'Equipo')
    };
  }

  if(target==='client'){
    return {
      email:extractEmail(lead?.contacto||''),
      name:String(lead?.reserva||'Cliente')
    };
  }

  if(target==='supplier'){
    const supplier=service?supplierForService(service,ops):null;
    return {
      email:String(supplier?.email||'').trim(),
      name:String(supplier?.contact_name||supplier?.name||'Proveedor')
    };
  }

  return {
    email:String(customEmail||'').trim(),
    name:''
  };
}

function supplierForService(service:LeadService,ops:OpsState){
  const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
  if(!assignment?.supplier_id)return null;
  return ops.suppliers.find(s=>s.id===assignment.supplier_id)||null;
}

function recipientMissingReason(
  target:NotifyTarget,
  lead:Lead|null,
  service:LeadService|null,
  responsible:TeamUser|null,
  ops:OpsState
){
  if(target==='responsible')return responsible?'El usuario no tiene correo':'Selecciona un responsable';
  if(target==='client')return lead?'El cliente no tiene correo registrado':'Selecciona una reserva';
  if(target==='supplier')return service?(supplierForService(service,ops)?'El proveedor no tiene correo':'La experiencia no tiene proveedor asignado'):'Selecciona una experiencia';
  return 'Ingresa un correo';
}

function recipientLabel(target:NotifyTarget){
  if(target==='responsible')return 'Responsable interno';
  if(target==='client')return 'Pasajero / cliente';
  if(target==='supplier')return 'Proveedor';
  return 'Otro destinatario';
}

function resolveResponsible(value:string|null|undefined,team:TeamUser[]){
  if(!value)return null;
  const raw=String(value).trim().toLowerCase();
  return team.find(user=>
    String(user.id||'').toLowerCase()===raw||
    String(user.email||'').toLowerCase()===raw||
    String(user.full_name||'').toLowerCase()===raw
  )||(
    raw.includes('@')
      ?{id:value,full_name:value,email:value,role:'legacy'} as TeamUser
      :{id:value,full_name:value,email:null,role:'legacy'} as TeamUser
  );
}

function taskDueState(task:CRMTask){
  if(task.status==='Completada')return 'completed';
  if(!task.due_date)return 'nodate';
  const ms=dueMs(task);
  const start=startOfLocalDay(new Date()).getTime();
  const end=endOfLocalDay(new Date()).getTime();
  if(ms<start)return 'overdue';
  if(ms<=end)return 'today';
  return 'upcoming';
}

function dueMs(task:CRMTask){
  if(!task.due_date)return Number.POSITIVE_INFINITY;
  const ms=new Date(task.due_date).getTime();
  return Number.isFinite(ms)?ms:Number.POSITIVE_INFINITY;
}

function startOfLocalDay(d:Date){
  return new Date(d.getFullYear(),d.getMonth(),d.getDate(),0,0,0,0);
}
function endOfLocalDay(d:Date){
  return new Date(d.getFullYear(),d.getMonth(),d.getDate(),23,59,59,999);
}
function normalize(value:any){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();
}
function extractEmail(value:string){
  const match=String(value||'').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return match?.[0]||'';
}
function dateShort(value?:string|null){
  if(!value)return 'Sin fecha';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short'});
}
function dateTime(value:string){
  return new Date(value).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'});
}
