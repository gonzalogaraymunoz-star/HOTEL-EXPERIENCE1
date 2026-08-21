import React, { useEffect, useMemo, useState } from 'react';
import {
  LayoutDashboard, Users, KanbanSquare, CalendarDays, ListChecks, WalletCards,
  BarChart3, BedDouble, Search, RefreshCw, ChevronRight, CircleDollarSign,
  Clock3, CheckCircle2, AlertCircle, ArrowUpRight, Plus, UsersRound, LogOut, Sparkles, PackageSearch, Handshake, Truck, UserRoundCog, CarFront, Box
} from 'lucide-react';
import type { Lead, LeadService, CRMTask, CRMActivity } from '../types';
import { loadCRMData, updateLead, updateService, updateTask, createTask } from '../lib/api';
import LeadDrawer from './LeadDrawer';
import BrandLogo from './BrandLogo';
import TeamView from './TeamView';
import AiAssistant from './AiAssistant';
import ProductCatalogView from './ProductCatalogView';
import NewLeadModal from './NewLeadModal';
import CalendarWorkspace from './CalendarWorkspace';
import OperationsHub from './OperationsHub';
import ServiceOperationModal from './ServiceOperationModal';
import TasksWorkspace from './TasksWorkspace';
import OperationsAdminTools from './OperationsAdminTools';
import OperationsControl from './OperationsControl';
import FinancialWorkspace from './FinancialWorkspace';
import { assertSupabase } from '../lib/supabase';

type View = 'dashboard'|'leads'|'pipeline'|'reservations'|'calendar'|'tasks'|'payments'|'reports'|'products'|'suppliers'|'service_people'|'vehicles'|'resources'|'operations'|'ai'|'team';

export default function CRMApp({profile}:{profile:any}) {
  const [view,setView]=useState<View>('dashboard');
  const [leads,setLeads]=useState<Lead[]>([]);
  const [services,setServices]=useState<LeadService[]>([]);
  const [tasks,setTasks]=useState<CRMTask[]>([]);
  const [activities,setActivities]=useState<CRMActivity[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [search,setSearch]=useState('');
  const [selectedLead,setSelectedLead]=useState<Lead|null>(null);
  const [operationService,setOperationService]=useState<LeadService|null>(null);
  const [newLeadOpen,setNewLeadOpen]=useState(false);
  const [directory,setDirectory]=useState<any[]>([]);
  const [leadScope,setLeadScope]=useState<'all'|'mine'|'unassigned'>(profile?.role==='agent'?'mine':'all');

  const refresh=async()=>{
    setLoading(true); setError('');
    try{
      const data=await loadCRMData();
      setLeads(data.leads); setServices(data.services); setTasks(data.tasks); setActivities(data.activities);
      try{ const {loadTeamDirectory}=await import('../lib/api'); setDirectory(await loadTeamDirectory()); }catch{}
      if(selectedLead){
        const next=data.leads.find(x=>x.id===selectedLead.id);
        if(next)setSelectedLead(next);
      }
    }catch(e:any){setError(e.message||'No se pudo cargar el CRM.');}
    finally{setLoading(false);}
  };
  useEffect(()=>{refresh()},[]);

  const currentUserId=profile?.id || null;
  const scopedLeads=useMemo(()=>{
    if(leadScope==='unassigned') return leads.filter(l=>!l.assigned_to);
    if(leadScope==='mine') return leads.filter(l=>l.assigned_to===currentUserId || l.created_by===currentUserId);
    return leads;
  },[leads,leadScope,currentUserId]);

  const filtered=useMemo(()=>{
    const q=search.toLowerCase().trim();
    if(!q)return scopedLeads;
    return scopedLeads.filter(l=>[l.reserva,l.codigo,l.contacto,l.empresa_ejecuta,l.servicio].some(v=>String(v||'').toLowerCase().includes(q)));
  },[scopedLeads,search]);

  const serviceFor=(leadId:string)=>services.filter(s=>s.lead_id===leadId);
  const totalSales=services.reduce((a,s)=>a+Number(s.precio_venta||0),0);
  const paidSales=services.filter(s=>s.estado_pago==='Pagado').reduce((a,s)=>a+Number(s.precio_venta||0),0);
  const pendingTasks=tasks.filter(t=>t.status!=='Completada');
  const upcoming=services.filter(s=>s.fecha_servicio&&new Date(s.fecha_servicio+'T23:59:00')>=new Date()).sort((a,b)=>String(a.fecha_servicio).localeCompare(String(b.fecha_servicio)));
  const conversion=leads.length?Math.round((leads.filter(l=>l.estado==='confirmado').length/leads.length)*100):0;

  return <div className="crm-shell">
    <aside className="sidebar">
      <a className="sidebar-brand" href="/"><BrandLogo /></a>
      <nav>
        <Nav icon={<LayoutDashboard/>} label="Inicio" active={view==='dashboard'} onClick={()=>setView('dashboard')}/>
        <button className={view==='ai'?'nav-item ai-nav active':'nav-item ai-nav'} onClick={()=>setView('ai')}><span><Sparkles/></span><b>Asistente comercial</b><small>APOYO</small></button>
        <Nav icon={<Users/>} label="Clientes" active={view==='leads'} onClick={()=>setView('leads')} badge={leads.length}/>
        <Nav icon={<KanbanSquare/>} label="Pipeline" active={view==='pipeline'} onClick={()=>setView('pipeline')}/>
        <Nav icon={<BedDouble/>} label="Reservas" active={view==='reservations'} onClick={()=>setView('reservations')} badge={services.length}/>
        <Nav icon={<CalendarDays/>} label="Calendario" active={view==='calendar'} onClick={()=>setView('calendar')}/>
        <Nav icon={<ListChecks/>} label="Tareas" active={view==='tasks'} onClick={()=>setView('tasks')} badge={pendingTasks.length}/>
        <Nav icon={<WalletCards/>} label="Pagos" active={view==='payments'} onClick={()=>setView('payments')}/>
        <Nav icon={<BarChart3/>} label="Reportes" active={view==='reports'} onClick={()=>setView('reports')}/>
        <Nav icon={<PackageSearch/>} label="Productos" active={view==='products'} onClick={()=>setView('products')}/>
        <div className="nav-section-label">OPERACIÓN</div>
        <Nav icon={<Truck/>} label="Operaciones" active={view==='operations'} onClick={()=>setView('operations')}/>
        <Nav icon={<Handshake/>} label="Proveedores" active={view==='suppliers'} onClick={()=>setView('suppliers')}/>
        <Nav icon={<UserRoundCog/>} label="Prestadores" active={view==='service_people'} onClick={()=>setView('service_people')}/>
        <Nav icon={<CarFront/>} label="Vehículos" active={view==='vehicles'} onClick={()=>setView('vehicles')}/>
        <Nav icon={<Box/>} label="Insumos" active={view==='resources'} onClick={()=>setView('resources')}/>
        {profile?.role==='admin'&&<Nav icon={<UsersRound/>} label="Equipo" active={view==='team'} onClick={()=>setView('team')}/>}
      </nav>
      <div className="sidebar-bottom">
        <a className="public-link" href="/registro"><Plus size={16}/> Formulario público</a>
        <small>Hotel Experience · 2026</small>
      </div>
    </aside>

    <main className="crm-main">
      <header className="crm-topbar">
        <div>
          <span className="eyebrow">HOTEL EXPERIENCE · LINK</span>
          <h1>{titles[view]}</h1>
        </div>
        <div className="top-actions">
          <div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, código, hotel..."/></div>
          <button className="icon-button" onClick={refresh} title="Actualizar datos"><RefreshCw size={18}/></button>
          <div className="user-pill"><div>{(profile?.full_name||profile?.email||'U').slice(0,1).toUpperCase()}</div><span><b>{profile?.full_name||'Usuario'}</b><small>{profile?.role||'agent'}</small></span></div>
          <button className="icon-button" onClick={()=>assertSupabase().auth.signOut()} title="Cerrar sesión"><LogOut size={18}/></button>
        </div>
      </header>

      {error&&<div className="error-banner"><AlertCircle size={18}/>{error}</div>}
      {loading?<div className="loading-card">Cargando CRM...</div>:
      <>
        {view==='dashboard'&&<Dashboard leads={leads} services={services} tasks={tasks} totalSales={totalSales} paidSales={paidSales} conversion={conversion} upcoming={upcoming} onLead={setSelectedLead} onOpenAI={()=>setView('ai')} onOpenOperations={()=>setView('operations')} profile={profile}/>}
        {view==='leads'&&<LeadsView leads={filtered} services={services} onLead={setSelectedLead} directory={directory} leadScope={leadScope} setLeadScope={setLeadScope} canCreate={profile?.role!=='viewer'} onNewLead={()=>setNewLeadOpen(true)}/>}
        {view==='pipeline'&&<PipelineView leads={filtered} services={services} onLead={setSelectedLead} refresh={refresh}/>}
        {view==='reservations'&&<ReservationsView leads={leads} services={services} onLead={setSelectedLead} onOperation={setOperationService} refresh={refresh}/>}
        {view==='calendar'&&<CalendarWorkspace leads={leads} services={services} onLead={setSelectedLead} onChanged={refresh} userRole={profile?.role||'agent'}/>}
        {view==='tasks'&&<TasksWorkspace leads={leads} tasks={tasks} refresh={refresh}/>}
        {view==='payments'&&<FinancialWorkspace mode="payments" leads={leads} services={services} refresh={refresh} userRole={profile?.role||'agent'}/>} 
        {view==='reports'&&<FinancialWorkspace mode="reports" leads={leads} services={services} refresh={refresh} userRole={profile?.role||'agent'}/>} 
        {view==='products'&&<ProductCatalogView role={profile?.role||'agent'}/>}
        {view==='suppliers'&&<OperationsHub role={profile?.role||'agent'} initialTab="suppliers"/>}
        {view==='service_people'&&<OperationsHub role={profile?.role||'agent'} initialTab="people"/>}
        {view==='vehicles'&&<OperationsHub role={profile?.role||'agent'} initialTab="vehicles"/>}
        {view==='resources'&&<OperationsHub role={profile?.role||'agent'} initialTab="resources"/>}
        {view==='operations'&&<OperationsControl leads={leads} services={services} onLead={setSelectedLead} onOperation={setOperationService}/>}
        {['suppliers','service_people','vehicles','resources'].includes(view)&&<OperationsAdminTools role={profile?.role||'agent'} section={view}/>}
        {view==='ai'&&<AiAssistant leads={leads} role={profile?.role||'agent'}/>}
        {view==='team'&&<TeamView currentRole={profile?.role||'agent'}/>}
      </>}
    </main>

    {newLeadOpen&&<NewLeadModal onClose={()=>setNewLeadOpen(false)} onCreated={refresh}/>}
    {selectedLead&&<LeadDrawer lead={selectedLead} services={services} tasks={tasks} activities={activities} userRole={profile?.role||'agent'} onClose={()=>setSelectedLead(null)} onChanged={refresh}/>}
    {operationService&&<ServiceOperationModal lead={leads.find(l=>l.id===operationService.lead_id)!} service={operationService} userRole={profile?.role||'agent'} onClose={()=>setOperationService(null)} onChanged={refresh}/>}
  </div>
}

function Nav({icon,label,active,onClick,badge}:{icon:React.ReactNode;label:string;active:boolean;onClick:()=>void;badge?:number}) {
  return <button className={active?'nav-item active':'nav-item'} onClick={onClick}><span>{icon}</span><b>{label}</b>{badge!==undefined&&<small>{badge}</small>}</button>
}

function Dashboard({leads,services,tasks,totalSales,paidSales,conversion,upcoming,onLead,onOpenAI,onOpenOperations,profile}:any){
  const newLeads=leads.filter((l:Lead)=>l.estado==='nuevo').length;
  const pendingPayments=services.filter((s:LeadService)=>s.estado_pago!=='Pagado').length;
  return <div className="view-stack">
    <section className="assistant-launcher">
      <div className="assistant-launcher-icon"><Sparkles/></div>
      <div className="assistant-launcher-copy"><span className="eyebrow">ASISTENTE COMERCIAL</span><h2>Pregúntale a tu CRM.</h2><p>Herramienta de apoyo con catálogo, precios, leads y tareas. <b>No confirma reservas, no modifica datos sin confirmación y no reemplaza la decisión del equipo.</b></p></div>
      <button className="primary-button" onClick={onOpenAI}>Abrir asistente <ChevronRight size={17}/></button>
    </section>
    <section className="dashboard-operations-card">
      <div className="dashboard-operations-icon"><Truck/></div>
      <div><span className="eyebrow">CENTRO OPERACIONAL</span><h2>Proveedores, personal, vehículos e insumos.</h2><p>Antes de cada salida revisa quién ejecuta, qué vehículo sale, qué personas están asignadas y si el equipamiento está disponible.</p></div>
      <button className="primary-button" onClick={onOpenOperations}>Abrir operaciones <ChevronRight size={17}/></button>
    </section>
    <section className="stat-grid">
      <Stat title="Leads activos" value={leads.filter((l:Lead)=>l.estado!=='perdido').length} detail={`${newLeads} nuevos`} icon={<Users/>}/>
      <Stat title="Conversión" value={`${conversion}%`} detail="Leads confirmados" icon={<ArrowUpRight/>}/>
      <Stat title="Venta cargada" value={money(totalSales)} detail={`${money(paidSales)} pagado`} icon={<CircleDollarSign/>}/>
      <Stat title="Pagos pendientes" value={pendingPayments} detail={`${tasks.filter((t:CRMTask)=>t.status!=='Completada').length} tareas abiertas`} icon={<Clock3/>}/>
    </section>

    <section className="content-grid two">
      <div className="surface-card">
        <SectionHead title="Leads recientes" subtitle="Últimas solicitudes ingresadas"/>
        <div className="compact-list">
          {leads.slice(0,6).map((l:Lead)=><button key={l.id} onClick={()=>onLead(l)}><div><strong>{l.reserva}</strong><span>{l.codigo} · {l.empresa_ejecuta||'Sin hotel'}</span></div><span className={`status-badge ${l.estado}`}>{cap(l.estado)}</span><ChevronRight size={17}/></button>)}
        </div>
      </div>
      <div className="surface-card">
        <SectionHead title="Próximas experiencias" subtitle="Operación por fecha"/>
        <div className="compact-list">
          {upcoming.slice(0,6).map((s:LeadService)=>{
            const lead=leads.find((l:Lead)=>l.id===s.lead_id);
            return <button key={s.id} onClick={()=>lead&&onLead(lead)}><div><strong>{s.producto}</strong><span>{dateFmt(s.fecha_servicio)} · {lead?.reserva||'Lead'}</span></div><span className="status-badge neutral">{s.estado_operacion}</span><ChevronRight size={17}/></button>
          })}
          {!upcoming.length&&<div className="empty-state">No hay servicios próximos.</div>}
        </div>
      </div>
    </section>
  </div>
}

function LeadsView({leads,services,onLead,directory,leadScope,setLeadScope,canCreate,onNewLead}:any){
  const owner=(id:any)=>directory.find((u:any)=>u.id===id);
  return <div className="view-stack">
    <section className="lead-toolbar">
      <div className="scope-tabs">
        <button className={leadScope==='all'?'active':''} onClick={()=>setLeadScope('all')}>Todos</button>
        <button className={leadScope==='mine'?'active':''} onClick={()=>setLeadScope('mine')}>Mis leads</button>
        <button className={leadScope==='unassigned'?'active':''} onClick={()=>setLeadScope('unassigned')}>Sin asignar</button>
      </div>
      {canCreate&&<button className="primary-button" onClick={onNewLead}><Plus size={16}/> Nuevo lead</button>}
    </section>
    <div className="surface-card">
      <SectionHead title="Clientes" subtitle="Vista 360° de solicitudes, responsables y oportunidades"/>
      <div className="table-wrap"><table>
        <thead><tr><th>Cliente</th><th>Responsable</th><th>Hotel</th><th>Experiencias</th><th>Venta</th><th>Pago</th><th>Etapa</th><th></th></tr></thead>
        <tbody>{leads.map((l:Lead)=>{
          const ss=services.filter((s:LeadService)=>s.lead_id===l.id);
          const sale=ss.reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0);
          const paid=ss.length&&ss.every((s:LeadService)=>s.estado_pago==='Pagado');
          const o=owner(l.assigned_to);
          return <tr key={l.id} onClick={()=>onLead(l)}>
            <td><strong>{l.reserva}</strong><span>{l.codigo}</span></td>
            <td>{o?<><strong>{o.full_name||o.email}</strong><span>{o.role}</span></>:<span className="unassigned-pill">Sin asignar</span>}</td>
            <td>{l.empresa_ejecuta||'-'}</td><td><b>{ss.length}</b> servicios</td><td>{money(sale)}</td><td><span className={paid?'status-badge confirmado':'status-badge neutral'}>{paid?'Pagado':'Pendiente'}</span></td><td><span className={`status-badge ${l.estado}`}>{cap(l.estado)}</span></td><td><ChevronRight size={17}/></td>
          </tr>
        })}</tbody>
      </table></div>
    </div>
  </div>
}
function PipelineView({leads,services,onLead,refresh}:any){
  const stages=['nuevo','contactado','cotizado','confirmado','perdido'];
  const move=async(id:string,status:string)=>{await updateLead(id,{estado:status});refresh()};
  return <div className="kanban-board">
    {stages.map(stage=><section className="kanban-col" key={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>move(e.dataTransfer.getData('lead'),stage)}>
      <header><div><b>{cap(stage)}</b><span>{leads.filter((l:Lead)=>l.estado===stage).length}</span></div></header>
      <div>{leads.filter((l:Lead)=>l.estado===stage).map((l:Lead)=>{
        const ss=services.filter((s:LeadService)=>s.lead_id===l.id);
        return <article className="kanban-card" key={l.id} draggable onDragStart={e=>e.dataTransfer.setData('lead',l.id)} onClick={()=>onLead(l)}>
          <span className="eyebrow">{l.codigo}</span><h3>{l.reserva}</h3><p>{l.empresa_ejecuta||'Sin hotel'}</p><div><span>{ss.length} experiencia(s)</span><strong>{money(ss.reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0))}</strong></div>
        </article>
      })}</div>
    </section>)}
  </div>
}

function ReservationsView({leads,services,onLead,onOperation,refresh}:any){
  return <div className="surface-card">
    <SectionHead title="Reservas y operación" subtitle="Cada experiencia se gestiona de forma independiente"/>
    <div className="table-wrap"><table>
      <thead><tr><th>Fecha</th><th>Cliente</th><th>Experiencia</th><th>Pax</th><th>Venta</th><th>Pago</th><th>Estado</th><th>Operación</th></tr></thead>
      <tbody>{services.map((s:LeadService)=>{
        const l=leads.find((x:Lead)=>x.id===s.lead_id);
        return <tr key={s.id}><td>{dateFmt(s.fecha_servicio)}</td><td onClick={()=>l&&onLead(l)} className="clickable"><strong>{l?.reserva||'-'}</strong><span>{l?.codigo}</span></td><td><strong>{s.producto}</strong>{s.modality&&<span className="table-subline">{s.modality==='low'?'Compartido':s.modality==='semiprivado'?'Semiprivado':'Privado'}</span>}</td><td>{s.numero_pax}</td><td>{money(s.precio_venta)}</td><td><select value={s.estado_pago} onChange={async e=>{await updateService(s.id,{estado_pago:e.target.value});refresh()}}>{['Pendiente','Parcial','Pagado','Reembolsado'].map(x=><option key={x}>{x}</option>)}</select></td><td><select value={s.estado_operacion} onChange={async e=>{await updateService(s.id,{estado_operacion:e.target.value});refresh()}}>{['Pendiente','Coordinado','En curso','Completado','Cancelado'].map(x=><option key={x}>{x}</option>)}</select></td><td><button className="operation-button table-operation-button" onClick={()=>onOperation(s)}><Truck size={14}/> Operación</button></td></tr>
      })}</tbody>
    </table></div>
  </div>
}

function CalendarView({leads,services,onLead}:any){
  const groups=services.reduce((acc:any,s:LeadService)=>{const k=s.fecha_servicio||'Sin fecha';(acc[k]||=[]).push(s);return acc},{});
  return <div className="calendar-list">{Object.entries(groups).sort(([a],[b])=>a.localeCompare(b)).map(([date,ss]:any)=><section className="surface-card" key={date}><SectionHead title={date==='Sin fecha'?'Fecha por definir':dateFmt(date)} subtitle={`${ss.length} experiencia(s)`}/><div className="calendar-items">{ss.map((s:LeadService)=>{const l=leads.find((x:Lead)=>x.id===s.lead_id);return <button key={s.id} onClick={()=>l&&onLead(l)}><div className="calendar-time">{s.fecha_servicio?'Servicio':'—'}</div><div><strong>{s.producto}</strong><p>{l?.reserva} · {s.numero_pax} pax</p></div><span className="status-badge neutral">{s.estado_operacion}</span></button>})}</div></section>)}</div>
}

function TasksView({leads,tasks,refresh}:any){
  const [title,setTitle]=useState('');
  const [leadId,setLeadId]=useState('');
  const add=async()=>{if(!title)return;await createTask({lead_id:leadId||null,title,priority:'Media',status:'Pendiente'});setTitle('');refresh()};
  return <div className="view-stack">
    <div className="surface-card"><SectionHead title="Nueva tarea" subtitle="Próxima acción y seguimiento"/><div className="quick-form"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Confirmar disponibilidad"/><select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sin lead asociado</option>{leads.map((l:Lead)=><option value={l.id} key={l.id}>{l.reserva}</option>)}</select><button className="primary-button" onClick={add}>Crear tarea</button></div></div>
    <div className="surface-card"><SectionHead title="Tareas" subtitle="Seguimiento pendiente y completado"/><div className="task-board">{tasks.map((t:CRMTask)=>{const l=leads.find((x:Lead)=>x.id===t.lead_id);return <article key={t.id}><button className={t.status==='Completada'?'task-check done':'task-check'} onClick={async()=>{await updateTask(t.id,{status:t.status==='Completada'?'Pendiente':'Completada'});refresh()}}>{t.status==='Completada'?<CheckCircle2/>:<Clock3/>}</button><div><strong>{t.title}</strong><p>{l?.reserva||'General'} · {t.priority}</p></div><span>{t.due_date?new Date(t.due_date).toLocaleDateString('es-CL'):'Sin fecha'}</span></article>})}</div></div>
  </div>
}

function PaymentsView({leads,services,refresh}:any){
  const total=services.reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0);
  const paid=services.filter((s:LeadService)=>s.estado_pago==='Pagado').reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0);
  return <div className="view-stack">
    <section className="stat-grid"><Stat title="Venta total" value={money(total)} detail="Servicios cargados" icon={<CircleDollarSign/>}/><Stat title="Pagado" value={money(paid)} detail={`${total?Math.round(paid/total*100):0}% recaudado`} icon={<CheckCircle2/>}/><Stat title="Por cobrar" value={money(total-paid)} detail="Saldo registrado" icon={<Clock3/>}/></section>
    <div className="surface-card"><SectionHead title="Control de pagos" subtitle="Estado financiero por experiencia"/><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Servicio</th><th>Precio</th><th>Estado</th></tr></thead><tbody>{services.map((s:LeadService)=>{const l=leads.find((x:Lead)=>x.id===s.lead_id);return <tr key={s.id}><td>{l?.reserva}</td><td>{s.producto}</td><td><MoneyInput value={Number(s.precio_venta||0)} onSave={async value=>{await updateService(s.id,{precio_venta:value});refresh()}}/></td><td><select value={s.estado_pago} onChange={async e=>{await updateService(s.id,{estado_pago:e.target.value});refresh()}}>{['Pendiente','Parcial','Pagado','Reembolsado'].map(x=><option key={x}>{x}</option>)}</select></td></tr>})}</tbody></table></div></div>
  </div>
}

function ReportsView({leads,services,totalSales,paidSales,conversion}:any){
  const byProduct=Object.entries(services.reduce((a:any,s:LeadService)=>{a[s.producto]=(a[s.producto]||0)+1;return a},{})).sort((a:any,b:any)=>b[1]-a[1]);
  const byHotel=Object.entries(leads.reduce((a:any,l:Lead)=>{const k=l.empresa_ejecuta||'Sin hotel';a[k]=(a[k]||0)+1;return a},{})).sort((a:any,b:any)=>b[1]-a[1]);
  return <div className="view-stack">
    <section className="stat-grid"><Stat title="Leads" value={leads.length} detail="Base actual" icon={<Users/>}/><Stat title="Conversión" value={`${conversion}%`} detail="Confirmados" icon={<ArrowUpRight/>}/><Stat title="Venta" value={money(totalSales)} detail={`${money(paidSales)} pagado`} icon={<CircleDollarSign/>}/><Stat title="Experiencias" value={services.length} detail="Servicios solicitados" icon={<BedDouble/>}/></section>
    <section className="content-grid two"><Rank title="Experiencias más solicitadas" items={byProduct}/><Rank title="Leads por hotel" items={byHotel}/></section>
  </div>
}


function MoneyInput({value,onSave}:{value:number;onSave:(value:number)=>Promise<void>|void}){
  const [draft,setDraft]=useState(String(value ?? 0));
  const [saving,setSaving]=useState(false);
  useEffect(()=>{if(!saving)setDraft(String(value ?? 0))},[value,saving]);
  const commit=async()=>{
    const normalized=draft.trim().replace(/\./g,'').replace(',','.');
    if(normalized===''){setDraft(String(value ?? 0));return}
    const parsed=Number(normalized);
    if(!Number.isFinite(parsed)||parsed<0){setDraft(String(value ?? 0));return}
    if(parsed===Number(value||0)){setDraft(String(parsed));return}
    setSaving(true);
    try{await onSave(parsed);setDraft(String(parsed))}
    catch(e:any){setDraft(String(value ?? 0));alert(e?.message||'No se pudo guardar el precio.')}
    finally{setSaving(false)}
  };
  return <input className="money-input" type="text" inputMode="numeric" value={draft} disabled={saving}
    onChange={e=>setDraft(e.target.value.replace(/[^\d.,]/g,''))}
    onBlur={commit}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(String(value ?? 0));e.currentTarget.blur()}}}
    placeholder="0"/>;
}

function Stat({title,value,detail,icon}:any){return <div className="stat-card"><div className="stat-icon">{icon}</div><span>{title}</span><strong>{value}</strong><small>{detail}</small></div>}
function SectionHead({title,subtitle}:{title:string;subtitle:string}){return <div className="section-head-crm"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
function Rank({title,items}:any){const max=Math.max(1,...items.map((x:any)=>x[1]));return <div className="surface-card"><SectionHead title={title} subtitle="Distribución actual"/><div className="rank-list">{items.slice(0,8).map((x:any)=><div key={x[0]}><div><span>{x[0]}</span><b>{x[1]}</b></div><div className="bar"><span style={{width:`${x[1]/max*100}%`}}/></div></div>)}</div></div>}
const titles:any={dashboard:'Inicio',leads:'Clientes',pipeline:'Pipeline comercial',reservations:'Reservas',calendar:'Calendario operacional',tasks:'Tareas y seguimiento',payments:'Pagos',reports:'Reportes',products:'Productos y valores',suppliers:'Proveedores',service_people:'Prestadores',vehicles:'Vehículos',resources:'Insumos',operations:'Control de operación',ai:'Asistente comercial',team:'Equipo'};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const dateFmt=(d:any)=>d?new Date(String(d)+'T12:00:00').toLocaleDateString('es-CL'):'Sin fecha';
const cap=(s:string)=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
