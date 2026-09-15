import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp,ArrowUpRight,BellRing,CalendarDays,CheckCircle2,ChevronRight,Download,FileSpreadsheet,LayoutDashboard,RotateCcw,Search,Upload,X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import './PendingClientTasks.css';
import './PendingClientTasksV2.css';

type PendingTask = {
  task_key:string;app_scope:'sales'|'operations'|string;lead_id:string;lead_code:string;pax_name?:string|null;
  lead_service_id?:string|null;service_code?:string|null;priority:string;title:string;detail:string;sort_order:number;
  service_date?:string|null;requested_at?:string|null;
};

type DashboardSort='priority'|'date'|'request';

async function token(){const {data}=await supabase.auth.getSession();return data.session?.access_token||''}

const priorityWeight:Record<string,number>={Alta:0,Media:1,Baja:2};
function taskDateValue(task:PendingTask){const value=task.service_date||task.requested_at;if(!value)return Number.MAX_SAFE_INTEGER;const date=new Date(value.includes('T')?value:`${value}T12:00:00`);const time=date.getTime();return Number.isFinite(time)?time:Number.MAX_SAFE_INTEGER}
function formatTaskDate(task:PendingTask){const value=task.service_date||task.requested_at;if(!value)return'Sin fecha';const date=new Date(value.includes('T')?value:`${value}T12:00:00`);if(Number.isNaN(date.getTime()))return'Sin fecha';return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(date).replace('.','')}
function priorityClass(value:string){return String(value||'media').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')}

export default function PendingClientTasks({scope}:{scope:'sales'|'operations'}){
  const [tasks,setTasks]=useState<PendingTask[]>([]);
  const [open,setOpen]=useState(false);
  const [dashboardOpen,setDashboardOpen]=useState(false);
  const [dashboardSort,setDashboardSort]=useState<DashboardSort>('priority');
  const [loading,setLoading]=useState(false);
  const [query,setQuery]=useState('');
  const [priority,setPriority]=useState('Todos');
  const [workingLead,setWorkingLead]=useState('');
  const [templateReady,setTemplateReady]=useState<boolean|null>(scope==='operations'?null:true);
  const [templateMessage,setTemplateMessage]=useState('');
  const fileRef=useRef<HTMLInputElement|null>(null);
  const taskBodyRef=useRef<HTMLDivElement|null>(null);
  const previousCount=useRef(0);

  async function refresh(){
    setLoading(true);
    const {data,error}=await supabase.from('client_pending_tasks_ui').select('*').eq('app_scope',scope).order('sort_order',{ascending:true}).limit(300);
    if(!error){
      const base=(data||[]) as PendingTask[];
      const serviceIds=Array.from(new Set(base.map(task=>task.lead_service_id).filter(Boolean))) as string[];
      const leadIds=Array.from(new Set(base.map(task=>task.lead_id).filter(Boolean))) as string[];
      const [serviceResult,leadResult]=await Promise.all([
        serviceIds.length?supabase.from('lead_services').select('id,fecha_servicio,created_at').in('id',serviceIds):Promise.resolve({data:[],error:null}),
        leadIds.length?supabase.from('leads').select('id,created_at').in('id',leadIds):Promise.resolve({data:[],error:null})
      ]);
      const serviceById=new Map((serviceResult.data||[]).map((row:any)=>[row.id,row]));
      const leadById=new Map((leadResult.data||[]).map((row:any)=>[row.id,row]));
      const next=base.map(task=>{
        const service=task.lead_service_id?serviceById.get(task.lead_service_id):null;
        const lead=leadById.get(task.lead_id);
        return {...task,service_date:service?.fecha_servicio||null,requested_at:service?.created_at||lead?.created_at||null};
      });
      setTasks(next);
      if(previousCount.current===0&&next.length>0)setOpen(true);
      previousCount.current=next.length;
    }
    setLoading(false);
  }

  function openTask(task:PendingTask){
    if(scope!=='operations')return;
    window.dispatchEvent(new CustomEvent('hotel:open-pending-task',{detail:{leadId:task.lead_id,serviceId:task.lead_service_id||null,taskKey:task.task_key}}));
    setOpen(false);setDashboardOpen(false);
  }

  async function checkTemplate(){
    if(scope!=='operations')return;
    try{const accessToken=await token();const response=await fetch('/api/partner-admin?action=operation_template_status',{headers:{Authorization:`Bearer ${accessToken}`}});const result=await response.json();setTemplateReady(Boolean(response.ok&&result.ready));if(!response.ok)setTemplateMessage(result.error||'No se pudo revisar la plantilla.')}catch{setTemplateReady(false)}
  }

  async function uploadTemplate(file:File){
    if(!file)return;setTemplateMessage('Cargando plantilla maestra…');
    try{const accessToken=await token();const response=await fetch('/api/partner-admin?action=operation_template_upload',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:file});const result=await response.json();if(!response.ok)throw new Error(result.error||'No se pudo cargar la plantilla.');setTemplateReady(true);setTemplateMessage('Plantilla maestra lista. El original no se modifica al generar documentos.')}catch(error:any){setTemplateReady(false);setTemplateMessage(error?.message||'No se pudo cargar la plantilla.')}finally{if(fileRef.current)fileRef.current.value=''}
  }

  async function generateOperationSheet(task:PendingTask){
    setWorkingLead(task.lead_id);setTemplateMessage('');
    try{const accessToken=await token();const response=await fetch('/api/partner-admin?action=generate_operation_sheet',{method:'POST',headers:{Authorization:`Bearer ${accessToken}`,'Content-Type':'application/json'},body:JSON.stringify({leadId:task.lead_id})});if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error||'No se pudo generar el paquete operacional.')}const blob=await response.blob();const disposition=response.headers.get('content-disposition')||'';const match=disposition.match(/filename="?([^";]+)"?/i);const filename=match?.[1]||`${task.lead_code}_OPERACION.xlsx`;const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),2000);setTemplateMessage(`${filename} generado y versionado en Supabase.`);await refresh()}catch(error:any){setTemplateMessage(error?.message||'No se pudo generar el documento.')}finally{setWorkingLead('')}
  }

  useEffect(()=>{void refresh();void checkTemplate();const timer=window.setInterval(()=>void refresh(),45000);const onFocus=()=>{void refresh();if(scope==='operations')void checkTemplate()};window.addEventListener('focus',onFocus);return()=>{window.clearInterval(timer);window.removeEventListener('focus',onFocus)}},[scope]);
  useEffect(()=>{document.body.classList.toggle('pending-dashboard-lock',dashboardOpen);return()=>document.body.classList.remove('pending-dashboard-lock')},[dashboardOpen]);

  const visibleTasks=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return tasks.filter(task=>{
      if(priority!=='Todos'&&task.priority!==priority)return false;
      if(!q)return true;
      return [task.lead_code,task.pax_name,task.service_code,task.title,task.detail,task.service_date].some(value=>String(value||'').toLowerCase().includes(q));
    });
  },[tasks,query,priority]);

  const groups=useMemo(()=>{
    const map=new Map<string,PendingTask[]>();visibleTasks.forEach(task=>map.set(task.lead_code,[...(map.get(task.lead_code)||[]),task]));
    return Array.from(map.entries()).map(([code,rows])=>({code,paxName:rows.find(row=>row.pax_name)?.pax_name||'Pasajero por confirmar',rows}));
  },[visibleTasks]);
  const priorities=useMemo(()=>['Todos',...Array.from(new Set(tasks.map(task=>task.priority))).sort((a,b)=>(priorityWeight[a]??9)-(priorityWeight[b]??9))],[tasks]);
  const clearFilters=()=>{setQuery('');setPriority('Todos')};

  const dashboardTasks=useMemo(()=>[...visibleTasks].sort((a,b)=>{
    if(dashboardSort==='date')return taskDateValue(a)-taskDateValue(b)||(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)||a.title.localeCompare(b.title,'es');
    if(dashboardSort==='request')return a.title.localeCompare(b.title,'es')||(priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)||taskDateValue(a)-taskDateValue(b);
    return (priorityWeight[a.priority]??9)-(priorityWeight[b.priority]??9)||taskDateValue(a)-taskDateValue(b)||a.title.localeCompare(b.title,'es');
  }),[visibleTasks,dashboardSort]);
  const highCount=tasks.filter(task=>task.priority==='Alta').length;

  return <>
    <button className={`pending-task-launcher ${tasks.length?'has-items':''}`} onClick={()=>setOpen(value=>!value)} title="Pendientes por cliente"><BellRing size={18}/><span>Pendientes</span>{tasks.length>0&&<b>{tasks.length}</b>}</button>
    <aside className={`pending-task-drawer ${open?'open':''}`} aria-hidden={!open} onWheel={event=>{const body=taskBodyRef.current;if(!body||body.contains(event.target as Node)||body.scrollHeight<=body.clientHeight)return;body.scrollTop+=event.deltaY;event.preventDefault()}}>
      <header><div><small>{scope==='sales'?'LINK VENTAS':'HOTEL EXPERIENCE'}</small><strong>Pendientes por cliente</strong><span>{tasks.length?`${visibleTasks.length} visibles · ${tasks.length} total`:'Sin tareas pendientes'}</span></div><button onClick={()=>setOpen(false)} aria-label="Cerrar pendientes"><X size={18}/></button></header>

      <div className="pending-task-filterbar">
        <label><Search size={14}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Código, pasajero, servicio, pendiente…"/></label>
        <div className="pending-priority-tabs">{priorities.map(item=><button type="button" key={item} className={priority===item?'active':''} onClick={()=>setPriority(item)}>{item}</button>)}{(query||priority!=='Todos')&&<button type="button" className="pending-clear" onClick={clearFilters}><RotateCcw size={12}/> Limpiar</button>}</div>
        <button className="pending-dashboard-button" type="button" onClick={()=>{setDashboardOpen(true);setOpen(false)}}><LayoutDashboard size={14}/><span>Ver dashboard de pendientes</span><ChevronRight size={14}/></button>
      </div>

      <div className="pending-task-body" ref={taskBodyRef}>
        {loading&&tasks.length===0?<div className="pending-task-empty">Actualizando…</div>:groups.length===0?<div className="pending-task-empty"><CheckCircle2 size={24}/><strong>{tasks.length?'Sin coincidencias':'Todo al día'}</strong><span>{tasks.length?'Cambia el buscador o el filtro de prioridad.':'Los nuevos pendientes aparecerán aquí automáticamente.'}</span></div>:groups.map(group=>{
          const blockers=group.rows.filter(row=>!row.task_key.startsWith('ops_documents:'));
          return <article className="pending-client-card" key={group.code}>
            <div className="pending-client-head"><span className="pending-client-identity"><strong>{group.code}</strong><small>{group.paxName}</small></span><span className="pending-count">{group.rows.length}</span></div>
            <div>{group.rows.map(task=><section key={task.task_key} role="button" tabIndex={0} onClick={()=>openTask(task)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' ')openTask(task)}} className={`pending-task-row pending-task-action priority-${priorityClass(task.priority)}`}>
              <ChevronRight size={14}/><span><strong>{task.title}</strong><small>{task.service_code?`${task.service_code} · `:''}{task.detail}</small><small className="pending-task-date"><CalendarDays size={11}/>{formatTaskDate(task)}</small>{scope==='operations'&&task.task_key.startsWith('ops_documents:')&&<button className="pending-generate" disabled={workingLead===task.lead_id||blockers.length>0||templateReady!==true} onClick={event=>{event.stopPropagation();void generateOperationSheet(task)}}><Download size={13}/>{workingLead===task.lead_id?'Generando…':blockers.length?`Completa ${blockers.length} pendiente(s) primero`:templateReady?'Generar Excel':'Falta plantilla maestra'}</button>}</span><span className="pending-go"><ArrowUpRight size={13}/> Ir</span>
            </section>)}</div>
          </article>
        })}
        {scope==='operations'&&templateMessage&&<div className="pending-template-message">{templateMessage}</div>}
      </div>
      <footer>{scope==='operations'&&<div className="pending-template-control"><div><FileSpreadsheet size={16}/><span><strong>Plantilla Excel</strong><small>{templateReady===null?'Revisando…':templateReady?'Maestra cargada':'Falta cargar la maestra'}</small></span></div><input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event=>{const file=event.target.files?.[0];if(file)void uploadTemplate(file)}}/><button onClick={()=>fileRef.current?.click()}><Upload size={13}/>{templateReady?'Reemplazar':'Cargar'}</button></div>}<button className="pending-refresh-button" onClick={()=>void refresh()}>Actualizar ahora</button></footer>
    </aside>

    {dashboardOpen&&<section className="pending-dashboard-shell" role="dialog" aria-modal="true" aria-label="Dashboard de pendientes">
      <header className="pending-dashboard-header">
        <div><small>{scope==='sales'?'LINK VENTAS':'HOTEL EXPERIENCE'}</small><h2>Dashboard de pendientes</h2><p>Ordena el trabajo por prioridad, fecha de servicio o tipo de solicitud.</p></div>
        <button className="pending-dashboard-close" onClick={()=>setDashboardOpen(false)} aria-label="Cerrar dashboard"><X size={20}/></button>
      </header>
      <div className="pending-dashboard-kpis"><article><span>Total</span><strong>{tasks.length}</strong><small>solicitudes abiertas</small></article><article><span>Alta prioridad</span><strong>{highCount}</strong><small>requieren atención primero</small></article><article><span>Clientes</span><strong>{new Set(tasks.map(task=>task.lead_id)).size}</strong><small>ingresos con pendientes</small></article></div>
      <div className="pending-dashboard-toolbar">
        <label><Search size={15}/><input value={query} onChange={event=>setQuery(event.target.value)} placeholder="Buscar pendiente, cliente o servicio…"/></label>
        <div className="pending-dashboard-priority">{priorities.map(item=><button key={item} className={priority===item?'active':''} onClick={()=>setPriority(item)}>{item}</button>)}</div>
        <div className="pending-dashboard-sort"><span><ArrowDownUp size={13}/> Ordenar</span><button className={dashboardSort==='priority'?'active':''} onClick={()=>setDashboardSort('priority')}>Prioridad</button><button className={dashboardSort==='date'?'active':''} onClick={()=>setDashboardSort('date')}>Fecha</button><button className={dashboardSort==='request'?'active':''} onClick={()=>setDashboardSort('request')}>Solicitud</button></div>
      </div>
      <div className="pending-dashboard-list">
        <div className="pending-dashboard-list-head"><span>Prioridad</span><span>Fecha</span><span>Cliente / servicio</span><span>Solicitud</span><span></span></div>
        {dashboardTasks.length===0?<div className="pending-dashboard-empty"><CheckCircle2 size={25}/><strong>Sin pendientes para este filtro</strong><button onClick={clearFilters}>Mostrar todos</button></div>:dashboardTasks.map(task=><article className={`pending-dashboard-row priority-${priorityClass(task.priority)}`} key={task.task_key}>
          <span className="pending-dashboard-priority-pill">{task.priority}</span>
          <span className="pending-dashboard-date"><CalendarDays size={13}/>{formatTaskDate(task)}{task.service_date&&<small>fecha de servicio</small>}</span>
          <span className="pending-dashboard-client"><strong>{task.lead_code}</strong><small>{task.service_code||task.pax_name||'Sin servicio asociado'}</small></span>
          <span className="pending-dashboard-request"><strong>{task.title}</strong><small>{task.detail}</small></span>
          {scope==='operations'?<button className="pending-dashboard-go" onClick={()=>openTask(task)}>Abrir <ArrowUpRight size={13}/></button>:<span/>}
        </article>)}
      </div>
    </section>}
  </>;
}