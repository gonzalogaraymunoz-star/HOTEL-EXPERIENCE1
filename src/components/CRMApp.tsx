import React,{useEffect,useMemo,useState} from 'react';
import {
  LayoutDashboard,Users,KanbanSquare,CalendarDays,ListChecks,WalletCards,BarChart3,BedDouble,
  Search,RefreshCw,ChevronRight,Plus,UsersRound,LogOut,Sparkles,PackageSearch,Handshake,Truck,
  UserRoundCog,CarFront,Box,AlertCircle,Star,Target,FolderOpen
} from 'lucide-react';
import type {Lead,LeadService,CRMTask,CRMActivity} from '../types';
import {loadCRMData,updateLead,updateService} from '../lib/api';
import {focusLabel,rankSalesLeads} from '../lib/salesFocus';
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
import DailyCommandCenter from './DailyCommandCenter';
import ReviewWorkspace from './ReviewWorkspace';
import SalesFocusOverview from './SalesFocusOverview';
import OperationalRecordsWorkspace from './OperationalRecordsWorkspace';
import {assertSupabase} from '../lib/supabase';

type View='dashboard'|'leads'|'pipeline'|'reservations'|'calendar'|'tasks'|'payments'|'reports'|'products'|'review'|'suppliers'|'service_people'|'vehicles'|'resources'|'operations'|'records'|'ai'|'team';

export default function CRMApp({profile}:{profile:any}){
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
  const [salesFocusOnly,setSalesFocusOnly]=useState(true);

  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      try{await assertSupabase().rpc('sync_review_lifecycle')}catch{}
      const data=await loadCRMData();
      setLeads(data.leads);setServices(data.services);setTasks(data.tasks);setActivities(data.activities);
      try{const {loadTeamDirectory}=await import('../lib/api');setDirectory(await loadTeamDirectory())}catch{}
      if(selectedLead){const next=data.leads.find(x=>x.id===selectedLead.id);if(next)setSelectedLead(next)}
    }catch(e:any){setError(e.message||'No se pudo cargar el CRM.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void refresh()},[]);

  const activeLeads=useMemo(()=>leads.filter(l=>String((l as any).lifecycle_stage||'active')==='active'),[leads]);
  const activeLeadIds=useMemo(()=>new Set(activeLeads.map(l=>l.id)),[activeLeads]);
  const activeServices=useMemo(()=>services.filter(s=>activeLeadIds.has(s.lead_id)),[services,activeLeadIds]);
  const reviewCount=leads.filter(l=>String((l as any).lifecycle_stage)==='review').length;

  const currentUserId=profile?.id||null;
  const scopedLeads=useMemo(()=>{
    if(leadScope==='unassigned')return activeLeads.filter(l=>!l.assigned_to);
    if(leadScope==='mine')return activeLeads.filter(l=>l.assigned_to===currentUserId||l.created_by===currentUserId);
    return activeLeads;
  },[activeLeads,leadScope,currentUserId]);

  const searchedLeads=useMemo(()=>{
    const q=search.toLowerCase().trim();
    if(!q)return scopedLeads;
    return scopedLeads.filter(l=>[l.reserva,l.codigo,l.contacto,l.empresa_ejecuta,l.servicio].some(v=>String(v||'').toLowerCase().includes(q)));
  },[scopedLeads,search]);

  const salesRanking=useMemo(()=>rankSalesLeads(searchedLeads,activeServices),[searchedLeads,activeServices]);
  const focusedIds=useMemo(()=>new Set(salesRanking.filter(x=>x.visible).map(x=>x.lead.id)),[salesRanking]);
  const filtered=useMemo(()=>{
    if(search.trim())return searchedLeads;
    return salesFocusOnly?searchedLeads.filter(l=>focusedIds.has(l.id)):searchedLeads;
  },[searchedLeads,salesFocusOnly,focusedIds,search]);
  const hiddenByFocus=search.trim()?0:Math.max(0,searchedLeads.length-filtered.length);

  const pendingTasks=tasks.filter(t=>t.status!=='Completada');
  const upcoming=activeServices.filter(s=>s.fecha_servicio&&new Date(s.fecha_servicio+'T23:59:00')>=new Date()).sort((a,b)=>String(a.fecha_servicio).localeCompare(String(b.fecha_servicio)));

  return <div className="crm-shell">
    <aside className="sidebar">
      <a className="sidebar-brand" href="/"><BrandLogo/></a>
      <nav>
        <Nav icon={<LayoutDashboard/>} label="Inicio" active={view==='dashboard'} onClick={()=>setView('dashboard')}/>
        <button className={view==='ai'?'nav-item ai-nav active':'nav-item ai-nav'} onClick={()=>setView('ai')}><span><Sparkles/></span><b>Asistente comercial</b><small>APOYO</small></button>
        <Nav icon={<Users/>} label="Clientes" active={view==='leads'} onClick={()=>setView('leads')} badge={activeLeads.length}/>
        <Nav icon={<KanbanSquare/>} label="Pipeline" active={view==='pipeline'} onClick={()=>setView('pipeline')}/>
        <Nav icon={<BedDouble/>} label="Reservas" active={view==='reservations'} onClick={()=>setView('reservations')} badge={activeServices.length}/>
        <Nav icon={<CalendarDays/>} label="Calendario" active={view==='calendar'} onClick={()=>setView('calendar')}/>
        <Nav icon={<ListChecks/>} label="Tareas" active={view==='tasks'} onClick={()=>setView('tasks')} badge={pendingTasks.length}/>
        <Nav icon={<WalletCards/>} label="Pagos" active={view==='payments'} onClick={()=>setView('payments')}/>
        <Nav icon={<BarChart3/>} label="Reportes" active={view==='reports'} onClick={()=>setView('reports')}/>
        <Nav icon={<PackageSearch/>} label="Productos" active={view==='products'} onClick={()=>setView('products')}/>
        <div className="nav-section-label">POSTVENTA</div>
        <Nav icon={<Star/>} label="Review" active={view==='review'} onClick={()=>setView('review')} badge={reviewCount}/>
        <div className="nav-section-label">OPERACIÓN</div>
        <Nav icon={<FolderOpen/>} label="Fichas" active={view==='records'} onClick={()=>setView('records')}/>
        <Nav icon={<Truck/>} label="Operaciones" active={view==='operations'} onClick={()=>setView('operations')}/>
        <Nav icon={<Handshake/>} label="Proveedores" active={view==='suppliers'} onClick={()=>setView('suppliers')}/>
        <Nav icon={<UserRoundCog/>} label="Prestadores" active={view==='service_people'} onClick={()=>setView('service_people')}/>
        <Nav icon={<CarFront/>} label="Vehículos" active={view==='vehicles'} onClick={()=>setView('vehicles')}/>
        <Nav icon={<Box/>} label="Insumos" active={view==='resources'} onClick={()=>setView('resources')}/>
        {profile?.role==='admin'&&<Nav icon={<UsersRound/>} label="Equipo" active={view==='team'} onClick={()=>setView('team')}/>}
      </nav>
      <div className="sidebar-bottom"><a className="public-link" href="/registro"><Plus size={16}/> Formulario público</a><small>Hotel Experience · 2026</small></div>
    </aside>

    <main className="crm-main">
      <header className="crm-topbar">
        <div><span className="eyebrow">HOTEL EXPERIENCE · LINK</span><h1>{titles[view]}</h1></div>
        <div className="top-actions">
          <div className="searchbox"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar cliente, código, hotel..."/></div>
          <button className="icon-button" onClick={refresh} title="Actualizar datos"><RefreshCw size={18}/></button>
          <div className="user-pill"><div>{(profile?.full_name||profile?.email||'U').slice(0,1).toUpperCase()}</div><span><b>{profile?.full_name||'Usuario'}</b><small>{profile?.role||'agent'}</small></span></div>
          <button className="icon-button" onClick={()=>assertSupabase().auth.signOut()} title="Cerrar sesión"><LogOut size={18}/></button>
        </div>
      </header>

      {error&&<div className="error-banner"><AlertCircle size={18}/>{error}</div>}
      {loading?<div className="loading-card">Cargando CRM...</div>:<>
        {view==='dashboard'&&<Dashboard leads={activeLeads} services={activeServices} tasks={tasks} activities={activities} upcoming={upcoming} onLead={setSelectedLead} onOpenAI={()=>setView('ai')} onOpenOperations={()=>setView('operations')} onOpenPayments={()=>setView('payments')}/>}
        {view==='leads'&&<LeadsView leads={filtered} services={activeServices} onLead={setSelectedLead} directory={directory} leadScope={leadScope} setLeadScope={setLeadScope} canCreate={profile?.role!=='viewer'} onNewLead={()=>setNewLeadOpen(true)} salesFocusOnly={salesFocusOnly} setSalesFocusOnly={setSalesFocusOnly} hiddenByFocus={hiddenByFocus}/>}
        {view==='pipeline'&&<PipelineView leads={filtered} services={activeServices} onLead={setSelectedLead} refresh={refresh} salesFocusOnly={salesFocusOnly} setSalesFocusOnly={setSalesFocusOnly} hiddenByFocus={hiddenByFocus}/>}
        {view==='reservations'&&<ReservationsView leads={activeLeads} services={activeServices} onLead={setSelectedLead} onOperation={setOperationService} refresh={refresh}/>}
        {view==='calendar'&&<CalendarWorkspace leads={activeLeads} services={activeServices} onLead={setSelectedLead} onChanged={refresh} userRole={profile?.role||'agent'}/>}
        {view==='tasks'&&<TasksWorkspace leads={leads} tasks={tasks} refresh={refresh}/>}
        {view==='payments'&&<FinancialWorkspace mode="payments" leads={leads} services={services} refresh={refresh} userRole={profile?.role||'agent'}/>}
        {view==='reports'&&<FinancialWorkspace mode="reports" leads={leads} services={services} refresh={refresh} userRole={profile?.role||'agent'}/>}
        {view==='products'&&<ProductCatalogView role={profile?.role||'agent'}/>}
        {view==='review'&&<ReviewWorkspace leads={leads} services={services} userRole={profile?.role||'agent'} onLead={setSelectedLead} onChanged={refresh}/>}
        {view==='suppliers'&&<OperationsHub role={profile?.role||'agent'} initialTab="suppliers"/>}
        {view==='service_people'&&<OperationsHub role={profile?.role||'agent'} initialTab="people"/>}
        {view==='vehicles'&&<OperationsHub role={profile?.role||'agent'} initialTab="vehicles"/>}
        {view==='resources'&&<OperationsHub role={profile?.role||'agent'} initialTab="resources"/>}
        {view==='records'&&<OperationalRecordsWorkspace role={profile?.role||'agent'}/>}
        {view==='operations'&&<OperationsControl leads={activeLeads} services={activeServices} onLead={setSelectedLead} onOperation={setOperationService}/>}
        {['suppliers','service_people','vehicles','resources'].includes(view)&&<OperationsAdminTools role={profile?.role||'agent'} section={view}/>}
        {view==='ai'&&<AiAssistant leads={leads} role={profile?.role||'agent'} onChanged={refresh}/>}
        {view==='team'&&<TeamView currentRole={profile?.role||'agent'}/>}
      </>}
    </main>

    {newLeadOpen&&<NewLeadModal onClose={()=>setNewLeadOpen(false)} onCreated={refresh}/>}
    {selectedLead&&<LeadDrawer lead={selectedLead} services={services} tasks={tasks} activities={activities} userRole={profile?.role||'agent'} onClose={()=>setSelectedLead(null)} onChanged={refresh}/>}
    {operationService&&<ServiceOperationModal lead={leads.find(l=>l.id===operationService.lead_id)!} service={operationService} userRole={profile?.role||'agent'} onClose={()=>setOperationService(null)} onChanged={refresh}/>}
  </div>;
}

function Dashboard({leads,services,tasks,activities,upcoming,onLead,onOpenAI,onOpenOperations,onOpenPayments}:any){
  const ranking=rankSalesLeads(leads,services).filter(x=>x.visible).slice(0,6);
  return <div className="view-stack">
    <DailyCommandCenter leads={leads} services={services} tasks={tasks} activities={activities} onLead={onLead} onOpenOperations={onOpenOperations} onOpenPayments={onOpenPayments} onOpenAI={onOpenAI}/>
    <SalesFocusOverview leads={leads} services={services} onLead={onLead}/>
    <section className="content-grid two">
      <div className="surface-card">
        <SectionHead title="Foco comercial" subtitle="Leads con mayor señal de venta ahora"/>
        <div className="compact-list">{ranking.map((item:any)=><button key={item.lead.id} onClick={()=>onLead(item.lead)}><div><strong>{item.lead.reserva}</strong><span>{item.lead.codigo} · {item.reasons.slice(0,2).join(' · ')||'Sin venta cargada'}</span></div><span className={`sales-focus-badge ${item.band}`}>{focusLabel(item.band)}</span><ChevronRight size={17}/></button>)}{!ranking.length&&<div className="empty-state">No hay leads con foco comercial.</div>}</div>
      </div>
      <div className="surface-card">
        <SectionHead title="Próximas experiencias" subtitle="Operación por fecha"/>
        <div className="compact-list">{upcoming.slice(0,6).map((s:LeadService)=>{const lead=leads.find((l:Lead)=>l.id===s.lead_id);return <button key={s.id} onClick={()=>lead&&onLead(lead)}><div><strong>{s.producto}</strong><span>{dateFmt(s.fecha_servicio)} · {lead?.reserva||'Lead'}</span></div><span className="status-badge neutral">{s.estado_operacion}</span><ChevronRight size={17}/></button>})}{!upcoming.length&&<div className="empty-state">No hay servicios próximos.</div>}</div>
      </div>
    </section>
  </div>;
}

function FocusControls({salesFocusOnly,setSalesFocusOnly,hiddenByFocus}:any){
  return <div className="sales-focus-controls">
    <button className={salesFocusOnly?'active':''} onClick={()=>setSalesFocusOnly(true)}><Target size={14}/> Enfoque ventas</button>
    <button className={!salesFocusOnly?'active':''} onClick={()=>setSalesFocusOnly(false)}>Mostrar todos</button>
    {salesFocusOnly&&hiddenByFocus>0&&<small>{hiddenByFocus} oculto(s) por baja señal</small>}
  </div>;
}

function LeadsView({leads,services,onLead,directory,leadScope,setLeadScope,canCreate,onNewLead,salesFocusOnly,setSalesFocusOnly,hiddenByFocus}:any){
  const owner=(id:any)=>directory.find((u:any)=>u.id===id);
  const focusMap=new Map(rankSalesLeads(leads,services).map(x=>[x.lead.id,x]));
  return <div className="view-stack">
    <section className="lead-toolbar sales-focus-toolbar">
      <div className="scope-tabs"><button className={leadScope==='all'?'active':''} onClick={()=>setLeadScope('all')}>Todos</button><button className={leadScope==='mine'?'active':''} onClick={()=>setLeadScope('mine')}>Mis leads</button><button className={leadScope==='unassigned'?'active':''} onClick={()=>setLeadScope('unassigned')}>Sin asignar</button></div>
      <FocusControls salesFocusOnly={salesFocusOnly} setSalesFocusOnly={setSalesFocusOnly} hiddenByFocus={hiddenByFocus}/>
      {canCreate&&<button className="primary-button" onClick={onNewLead}><Plus size={16}/> Nuevo lead</button>}
    </section>
    <div className="surface-card"><SectionHead title="Clientes" subtitle={salesFocusOnly?'Solo leads con señal comercial relevante':'Todos los clientes activos antes de postventa'}/><div className="table-wrap"><table><thead><tr><th>Cliente</th><th>Foco</th><th>Responsable</th><th>Hotel</th><th>Experiencias</th><th>Venta</th><th>Pago</th><th>Etapa</th><th></th></tr></thead><tbody>{leads.map((l:Lead)=>{const ss=services.filter((s:LeadService)=>s.lead_id===l.id);const sale=ss.reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0);const paid=ss.length&&ss.every((s:LeadService)=>s.estado_pago==='Pagado');const o=owner(l.assigned_to);const f:any=focusMap.get(l.id);return <tr key={l.id} onClick={()=>onLead(l)}><td><strong>{l.reserva}</strong><span>{l.codigo}</span></td><td className="sales-focus-cell">{f&&<><span className={`sales-focus-badge ${f.band}`}>{focusLabel(f.band)}</span><small>{f.reasons[0]||`${f.daysSinceUpdate} días sin movimiento`}</small></>}</td><td>{o?<><strong>{o.full_name||o.email}</strong><span>{o.role}</span></>:<span className="unassigned-pill">Sin asignar</span>}</td><td>{l.empresa_ejecuta||'-'}</td><td><b>{ss.length}</b> servicios</td><td>{money(sale)}</td><td><span className={paid?'status-badge confirmado':'status-badge neutral'}>{paid?'Pagado':'Pendiente'}</span></td><td><span className={`status-badge ${l.estado}`}>{cap(l.estado)}</span></td><td><ChevronRight size={17}/></td></tr>})}</tbody></table></div></div>
  </div>;
}

function PipelineView({leads,services,onLead,refresh,salesFocusOnly,setSalesFocusOnly,hiddenByFocus}:any){
  const stages=['nuevo','contactado','cotizado','confirmado','perdido'];
  const move=async(id:string,status:string)=>{await updateLead(id,{estado:status});refresh()};
  const focusMap=new Map(rankSalesLeads(leads,services).map(x=>[x.lead.id,x]));
  return <div className="view-stack">
    <section className="lead-toolbar sales-focus-toolbar">
      <div><span className="eyebrow">VISIBILIDAD COMERCIAL</span><p style={{margin:'4px 0 0',fontSize:10,color:'#746d64'}}>Oculta ruido sin borrar ningún lead.</p></div>
      <FocusControls salesFocusOnly={salesFocusOnly} setSalesFocusOnly={setSalesFocusOnly} hiddenByFocus={hiddenByFocus}/>
    </section>
    <div className="kanban-board">{stages.map(stage=><section className="kanban-col" key={stage} onDragOver={e=>e.preventDefault()} onDrop={e=>move(e.dataTransfer.getData('lead'),stage)}><header><div><b>{cap(stage)}</b><span>{leads.filter((l:Lead)=>l.estado===stage).length}</span></div></header><div>{leads.filter((l:Lead)=>l.estado===stage).map((l:Lead)=>{const ss=services.filter((s:LeadService)=>s.lead_id===l.id);const f:any=focusMap.get(l.id);return <article className="kanban-card" key={l.id} draggable onDragStart={e=>e.dataTransfer.setData('lead',l.id)} onClick={()=>onLead(l)}><span className="eyebrow">{l.codigo}</span><h3>{l.reserva}</h3><p>{l.empresa_ejecuta||'Sin hotel'}</p><div><span>{ss.length} experiencia(s)</span><strong>{money(ss.reduce((a:number,s:LeadService)=>a+Number(s.precio_venta||0),0))}</strong></div>{f&&<div className="kanban-focus-meta"><span className={`sales-focus-badge ${f.band}`}>{focusLabel(f.band)}</span><small>{f.reasons[0]||`${f.daysSinceUpdate} días`}</small></div>}</article>})}</div></section>)}</div>
  </div>;
}

function ReservationsView({leads,services,onLead,onOperation,refresh}:any){
  return <div className="surface-card"><SectionHead title="Reservas y operación" subtitle="Solo reservas activas; las finalizadas y pagadas pasan a Review"/><div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Cliente</th><th>Experiencia</th><th>Pax</th><th>Venta</th><th>Pago</th><th>Estado</th><th>Operación</th></tr></thead><tbody>{services.map((s:LeadService)=>{const l=leads.find((x:Lead)=>x.id===s.lead_id);return <tr key={s.id}><td>{dateFmt(s.fecha_servicio)}</td><td onClick={()=>l&&onLead(l)} className="clickable"><strong>{l?.reserva||'-'}</strong><span>{l?.codigo}</span></td><td><strong>{s.producto}</strong>{s.modality&&<span className="table-subline">{s.modality==='low'?'Compartido':s.modality==='semiprivado'?'Semiprivado':'Privado'}</span>}</td><td>{s.numero_pax}</td><td>{money(s.precio_venta)}</td><td><select value={s.estado_pago} onChange={async e=>{await updateService(s.id,{estado_pago:e.target.value});refresh()}}>{['Pendiente','Parcial','Pagado','Reembolsado'].map(x=><option key={x}>{x}</option>)}</select></td><td><select value={s.estado_operacion} onChange={async e=>{await updateService(s.id,{estado_operacion:e.target.value});refresh()}}>{['Pendiente','Coordinado','En curso','Completado','Cancelado'].map(x=><option key={x}>{x}</option>)}</select></td><td><button className="operation-button table-operation-button" onClick={()=>onOperation(s)}><Truck size={14}/> Operación</button></td></tr>})}</tbody></table></div></div>;
}

function Nav({icon,label,active,onClick,badge}:{icon:React.ReactNode;label:string;active:boolean;onClick:()=>void;badge?:number}){return <button className={active?'nav-item active':'nav-item'} onClick={onClick}><span>{icon}</span><b>{label}</b>{badge!==undefined&&<small>{badge}</small>}</button>}
function SectionHead({title,subtitle}:{title:string;subtitle:string}){return <div className="section-head-crm"><div><h2>{title}</h2><p>{subtitle}</p></div></div>}
const titles:any={dashboard:'Inicio',leads:'Clientes',pipeline:'Pipeline comercial',reservations:'Reservas',calendar:'Calendario operacional',tasks:'Tareas y seguimiento',payments:'Pagos',reports:'Reportes',products:'Productos y valores',review:'Review',suppliers:'Proveedores',service_people:'Prestadores',vehicles:'Vehículos',resources:'Insumos',operations:'Control de operación',records:'Fichas operacionales',ai:'Asistente comercial',team:'Equipo'};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const dateFmt=(d:any)=>d?new Date(String(d)+'T12:00:00').toLocaleDateString('es-CL'):'Sin fecha';
const cap=(s:string)=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
