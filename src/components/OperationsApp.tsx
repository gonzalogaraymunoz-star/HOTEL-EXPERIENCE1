import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  Box,Building2,CalendarDays,CarFront,CheckCircle2,ChevronLeft,ChevronRight,ClipboardList,FolderOpen,
  LogOut,Menu,RefreshCw,Route,UtensilsCrossed,UsersRound,X,Users
} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {loadCRMData} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import BrandLogo from './BrandLogo';
import OperationsCalendarHub,{type OperationsCalendarMode} from './OperationsCalendarHub';
import DailyOperationsBoard from './DailyOperationsBoard';
import FoodOperationsBoard from './FoodOperationsBoard';
import ItineraryWorkspace from './ItineraryWorkspace';
import OperationalRecordsWorkspace from './OperationalRecordsWorkspace';
import OperationsHub from './OperationsHub';
import OperationsAdminTools from './OperationsAdminTools';
import PartnerApprovalWorkspace from './PartnerApprovalWorkspace';
import ServiceWorkspace,{type ServiceWorkspaceTab} from './ServiceWorkspace';
import TeamView from './TeamView';
import './OperationsApp.css';

type View='program'|'calendar'|'itinerary'|'food'|'records'|'suppliers'|'people'|'vehicles'|'resources'|'approvals'|'team';
type CalendarMode='day'|'week'|'month'|'year';

type PendingTaskDetail={leadId:string;serviceId?:string|null;taskKey:string;fromPending?:boolean};
type RecordEntityType='supplier'|'person'|'vehicle'|'resource';
type RecordTarget={type:RecordEntityType;id:string}|null;
type NavigationSnapshot={view:View;calendarMode:CalendarMode;selectedDate:string;operationServiceId:string|null;operationTab:ServiceWorkspaceTab;recordTarget:RecordTarget};
type NavigationEntry={kind:'app';snapshot:NavigationSnapshot}|{kind:'pending'};

function operationalCopy(service:LeadService):LeadService{return {...service,precio_venta:null,precio_unitario:null,precio_total:null,price_pp_clp:null,margen_comercial:null,comision_hotel:null,comision_vendedor:null,margen_hotel_experience:null}}

export default function OperationsApp({profile}:{profile:any}){
  const [view,setView]=useState<View>('program');
  const [calendarMode,setCalendarMode]=useState<CalendarMode>('day');
  const [leads,setLeads]=useState<Lead[]>([]);
  const [services,setServices]=useState<LeadService[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedDate,setSelectedDate]=useState(()=>isoDate(new Date()));
  const [operationService,setOperationService]=useState<LeadService|null>(null);
  const [operationTab,setOperationTab]=useState<ServiceWorkspaceTab>('summary');
  const [recordTarget,setRecordTarget]=useState<RecordTarget>(null);
  const [mobileNav,setMobileNav]=useState(false);
  const [railExpanded,setRailExpanded]=useState(false);
  const [pendingVisible,setPendingVisible]=useState(false);
  const backStackRef=useRef<NavigationEntry[]>([]);
  const forwardStackRef=useRef<NavigationEntry[]>([]);
  const [navigationVersion,setNavigationVersion]=useState(0);

  const refresh=async()=>{setLoading(true);setError('');try{const data=await loadCRMData();setLeads(data.leads);setServices(data.services)}catch(e:any){setError(e?.message||'No se pudo cargar la operación.')}finally{setLoading(false)}};
  useEffect(()=>{void refresh()},[]);

  const nonHistoricalLeadIds=useMemo(()=>new Set(leads.filter(lead=>String((lead as any).lifecycle_stage||'active')!=='historical').map(lead=>lead.id)),[leads]);
  const operationalServices=useMemo(()=>services.filter(service=>{const booking=String(service.booking_status||'confirmed').toLowerCase();return nonHistoricalLeadIds.has(service.lead_id)&&['confirmed','completed'].includes(booking)}).map(operationalCopy),[services,nonHistoricalLeadIds]);
  const leadById=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const activeLeads=useMemo(()=>{const ids=new Set(operationalServices.map(s=>s.lead_id));return leads.filter(l=>nonHistoricalLeadIds.has(l.id)&&ids.has(l.id))},[leads,operationalServices,nonHistoricalLeadIds]);

  const canApprovePartners=['admin','manager'].includes(String(profile?.role||''));
  const currentAppSnapshot=():NavigationSnapshot=>({view,calendarMode,selectedDate,operationServiceId:operationService?.id||null,operationTab,recordTarget});
  const currentNavigationEntry=():NavigationEntry=>pendingVisible?{kind:'pending'}:{kind:'app',snapshot:currentAppSnapshot()};
  const navigationKey=(entry:NavigationEntry)=>entry.kind==='pending'?'pending':JSON.stringify(entry.snapshot);
  const syncNavigationButtons=()=>setNavigationVersion(value=>value+1);
  const rememberEntry=(entry:NavigationEntry=currentNavigationEntry())=>{
    const stack=backStackRef.current;
    if(navigationKey(stack[stack.length-1]||{kind:'pending'})!==navigationKey(entry))stack.push(entry);
    if(stack.length>60)stack.shift();
    forwardStackRef.current=[];
    syncNavigationButtons();
  };
  const restoreEntry=(entry:NavigationEntry)=>{
    if(entry.kind==='pending'){
      setPendingVisible(true);setOperationService(null);
      window.dispatchEvent(new CustomEvent('hotel:open-pending-dashboard'));
      return;
    }
    setPendingVisible(false);
    window.dispatchEvent(new CustomEvent('hotel:close-pending-dashboard'));
    setView(entry.snapshot.view);setCalendarMode(entry.snapshot.calendarMode);setSelectedDate(entry.snapshot.selectedDate);setOperationTab(entry.snapshot.operationTab);setRecordTarget(entry.snapshot.recordTarget||null);
    setOperationService(entry.snapshot.operationServiceId?operationalServices.find(service=>service.id===entry.snapshot.operationServiceId)||null:null);
  };
  const goBack=()=>{
    const target=backStackRef.current.pop();if(!target)return;
    forwardStackRef.current.push(currentNavigationEntry());restoreEntry(target);syncNavigationButtons();
  };
  const goForward=()=>{
    const target=forwardStackRef.current.pop();if(!target)return;
    backStackRef.current.push(currentNavigationEntry());restoreEntry(target);syncNavigationButtons();
  };
  const openView=(next:View)=>{if(next===view&&!operationService&&!recordTarget)return;rememberEntry();setPendingVisible(false);setOperationService(null);if(next!=='records')setRecordTarget(null);setView(next);setMobileNav(false)};
  const openRecord=(type:RecordEntityType,id:string)=>{rememberEntry();setPendingVisible(false);setOperationService(null);setRecordTarget({type,id});setView('records');setMobileNav(false)};
  const selectCalendarMode=(next:CalendarMode)=>{const nextView=next==='day'?'program':'calendar';if(next===calendarMode&&nextView===view&&!operationService)return;rememberEntry();setPendingVisible(false);setOperationService(null);setCalendarMode(next);setView(nextView);setMobileNav(false)};
  const movePeriod=(delta:number)=>{const base=parseDate(selectedDate);if(calendarMode==='day')base.setDate(base.getDate()+delta);if(calendarMode==='week')base.setDate(base.getDate()+delta*7);if(calendarMode==='month')base.setMonth(base.getMonth()+delta);if(calendarMode==='year')base.setFullYear(base.getFullYear()+delta);setSelectedDate(isoDate(base))};
  const openService=(service:LeadService,tab:ServiceWorkspaceTab='summary')=>{rememberEntry();setPendingVisible(false);setOperationTab(tab);setOperationService(service);if(service.fecha_servicio)setSelectedDate(service.fecha_servicio)};
  const canGoBack=backStackRef.current.length>0;
  const canGoForward=forwardStackRef.current.length>0;
  void navigationVersion;

  useEffect(()=>{
    const handler=(event:Event)=>{
      const detail=(event as CustomEvent<PendingTaskDetail>).detail;
      if(!detail?.leadId)return;
      rememberEntry(detail.fromPending?{kind:'pending'}:currentNavigationEntry());
      setPendingVisible(false);
      const taskKey=String(detail.taskKey||'');
      const tab=tabForPending(taskKey);
      if(taskKey.startsWith('ops_documents:')){setOperationService(null);setView('records');return}
      if(taskKey.startsWith('ops_food:')){setOperationService(null);setView('food');return}
      if(taskKey.startsWith('ops_itinerary:')){setOperationService(null);setView('itinerary');return}
      const direct=detail.serviceId?operationalServices.find(service=>service.id===detail.serviceId):undefined;
      const fallback=operationalServices.find(service=>service.lead_id===detail.leadId);
      const target=direct||fallback;
      if(!target){
        setError('Este pendiente todavía no tiene un servicio operacional confirmado al cual navegar.');
        return;
      }
      setCalendarMode('day');setView('program');setOperationTab(tab);setOperationService(target);if(target.fecha_servicio)setSelectedDate(target.fecha_servicio);
    };
    const onPendingOpened=()=>{if(!pendingVisible){rememberEntry({kind:'app',snapshot:currentAppSnapshot()});setPendingVisible(true)}};
    const onPendingClosed=()=>setPendingVisible(false);
    const onHistoryBack=()=>goBack();
    const onHistoryForward=()=>goForward();
    window.addEventListener('hotel:open-pending-task',handler as EventListener);
    window.addEventListener('hotel:pending-opened',onPendingOpened);
    window.addEventListener('hotel:pending-closed',onPendingClosed);
    window.addEventListener('hotel:history-back',onHistoryBack);
    window.addEventListener('hotel:history-forward',onHistoryForward);
    return()=>{
      window.removeEventListener('hotel:open-pending-task',handler as EventListener);
      window.removeEventListener('hotel:pending-opened',onPendingOpened);
      window.removeEventListener('hotel:pending-closed',onPendingClosed);
      window.removeEventListener('hotel:history-back',onHistoryBack);
      window.removeEventListener('hotel:history-forward',onHistoryForward);
    };
  },[operationalServices,pendingVisible,view,calendarMode,selectedDate,operationService,operationTab]);

  return <div className={`ops-app-shell ${railExpanded?'rail-expanded':''}`}>
    <aside className={`ops-rail ${mobileNav?'open':''} ${railExpanded?'expanded':''}`}>
      <div className="ops-rail-brand"><BrandLogo/></div>
      <button className="ops-rail-toggle" onClick={()=>setRailExpanded(value=>!value)} title={railExpanded?'Contraer menú':'Expandir menú'}><ChevronRight size={17}/><span>{railExpanded?'Contraer':'Expandir'}</span></button>
      <nav>
        <RailButton icon={<ClipboardList/>} label="Programa" active={view==='program'} onClick={()=>selectCalendarMode('day')}/>
        <RailButton icon={<CalendarDays/>} label="Calendario" active={view==='calendar'} onClick={()=>selectCalendarMode(calendarMode==='day'?'month':calendarMode)}/>
        <RailButton icon={<Route/>} label="Itinerarios" active={view==='itinerary'} onClick={()=>openView('itinerary')}/>
        <RailButton icon={<UtensilsCrossed/>} label="Alimentación" active={view==='food'} onClick={()=>openView('food')}/>
        <RailButton icon={<FolderOpen/>} label="Fichas" active={view==='records'} onClick={()=>openView('records')}/>
        <span className="ops-rail-divider"/>
        <RailButton icon={<Building2/>} label="Operadores" active={view==='suppliers'} onClick={()=>openView('suppliers')}/>
        <RailButton icon={<UsersRound/>} label="Prestadores" active={view==='people'} onClick={()=>openView('people')}/>
        <RailButton icon={<CarFront/>} label="Vehículos" active={view==='vehicles'} onClick={()=>openView('vehicles')}/>
        <RailButton icon={<Box/>} label="Recursos" active={view==='resources'} onClick={()=>openView('resources')}/>
        {canApprovePartners&&<><span className="ops-rail-divider"/><RailButton icon={<CheckCircle2/>} label="Aprobaciones" active={view==='approvals'} onClick={()=>openView('approvals')}/></>}
        {profile?.role==='admin'&&<RailButton icon={<Users/>} label="Equipo" active={view==='team'} onClick={()=>openView('team')}/>} 
      </nav>
      <button className="ops-signout" onClick={()=>assertSupabase().auth.signOut()} title="Cerrar sesión"><LogOut size={18}/><span>Cerrar sesión</span></button>
    </aside>
    {mobileNav&&<button className="ops-nav-scrim" aria-label="Cerrar menú" onClick={()=>setMobileNav(false)}/>} 

    <section className="ops-app-main">
      <header className="ops-topbar">
        <div className="ops-topbar-left"><button className="ops-mobile-menu" onClick={()=>setMobileNav(value=>!value)}>{mobileNav?<X/>:<Menu/>}</button><div className="ops-history-nav" aria-label="Navegación"><button type="button" onClick={goBack} disabled={!canGoBack} title="Atrás"><ChevronLeft size={17}/></button><button type="button" onClick={goForward} disabled={!canGoForward} title="Adelante"><ChevronRight size={17}/></button></div><div className="ops-brand-copy"><span>HOTEL EXPERIENCE</span><strong>{viewTitle(view)}</strong></div></div>
        <div className="ops-calendar-control">
          <div className="ops-date-control" aria-label="Fecha de operación"><button onClick={()=>movePeriod(-1)} title="Periodo anterior"><ChevronLeft size={18}/></button><label><small>OPERACIÓN</small><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/><b>{friendlyDate(selectedDate)}</b></label><button onClick={()=>movePeriod(1)} title="Periodo siguiente"><ChevronRight size={18}/></button><button className="ops-today" onClick={()=>setSelectedDate(isoDate(new Date()))}>Hoy</button></div>
          <div className="ops-calendar-modes"><button className={calendarMode==='day'?'active':''} onClick={()=>selectCalendarMode('day')}>Día</button><button className={calendarMode==='week'?'active':''} onClick={()=>selectCalendarMode('week')}>Semana</button><button className={calendarMode==='month'?'active':''} onClick={()=>selectCalendarMode('month')}>Mes</button><button className={calendarMode==='year'?'active':''} onClick={()=>selectCalendarMode('year')}>Año</button></div>
        </div>
        <div className="ops-topbar-right"><button className="ops-refresh" onClick={refresh} title="Actualizar"><RefreshCw size={17}/></button><div className="ops-user"><span>{String(profile?.full_name||profile?.email||'U').slice(0,1).toUpperCase()}</span><div><b>{profile?.full_name||'Usuario'}</b><small>{profile?.role||'agent'}</small></div></div></div>
      </header>

      {error&&<div className="ops-error">{error}</div>}
      {loading?<div className="ops-loading">Cargando operación…</div>:<main className="ops-workspace">
        {view==='program'&&<DailyOperationsBoard date={selectedDate} leads={activeLeads} services={operationalServices} onOperation={service=>openService(service,'summary')}/>} 
        {view==='calendar'&&<OperationsCalendarHub mode={calendarMode as OperationsCalendarMode} selectedDate={selectedDate} leads={activeLeads} services={operationalServices} onDateChange={setSelectedDate} onChanged={refresh} userRole={profile?.role||'agent'} onService={service=>openService(service,'summary')}/>} 
        {view==='itinerary'&&<ItineraryWorkspace leads={activeLeads} services={operationalServices} onChanged={refresh}/>} 
        {view==='food'&&<FoodOperationsBoard date={selectedDate}/>} 
        {view==='records'&&<OperationalRecordsWorkspace role={profile?.role||'agent'} initialType={recordTarget?.type} initialEntityId={recordTarget?.id}/>} 
        {view==='suppliers'&&<><OperationsHub role={profile?.role||'agent'} initialTab="suppliers" onOpenRecord={openRecord}/><OperationsAdminTools role={profile?.role||'agent'} section="suppliers"/></>} 
        {view==='people'&&<><OperationsHub role={profile?.role||'agent'} initialTab="people" onOpenRecord={openRecord}/><OperationsAdminTools role={profile?.role||'agent'} section="service_people"/></>} 
        {view==='vehicles'&&<><OperationsHub role={profile?.role||'agent'} initialTab="vehicles" onOpenRecord={openRecord}/><OperationsAdminTools role={profile?.role||'agent'} section="vehicles"/></>} 
        {view==='resources'&&<><OperationsHub role={profile?.role||'agent'} initialTab="resources" onOpenRecord={openRecord}/><OperationsAdminTools role={profile?.role||'agent'} section="resources"/></>} 
        {view==='approvals'&&canApprovePartners&&<PartnerApprovalWorkspace/>}
        {view==='team'&&<TeamView currentRole={profile?.role||'agent'}/>} 
      </main>}
    </section>

    {operationService&&leadById.get(operationService.lead_id)&&<ServiceWorkspace lead={leadById.get(operationService.lead_id)!} service={operationService} userRole={profile?.role||'agent'} initialTab={operationTab} onClose={()=>{if(backStackRef.current.length)goBack();else setOperationService(null)}} onChanged={refresh}/>} 
  </div>;
}

function tabForPending(taskKey:string):ServiceWorkspaceTab{
  if(['ops_assignment:','ops_supplier:','ops_vehicle:','ops_driver:','ops_guide:'].some(prefix=>taskKey.startsWith(prefix)))return'assignments';
  if(['ops_participants:','ops_pax_docs:'].some(prefix=>taskKey.startsWith(prefix)))return'passengers';
  if(taskKey.startsWith('ops_food:'))return'food';
  if(taskKey.startsWith('ops_itinerary:'))return'itinerary';
  return'summary';
}
function RailButton({icon,label,active,onClick}:{icon:React.ReactNode;label:string;active:boolean;onClick:()=>void}){return <button className={active?'ops-rail-button active':'ops-rail-button'} onClick={onClick} title={label}>{icon}<span>{label}</span></button>}
function viewTitle(view:View){return ({program:'Programa diario',calendar:'Calendario operativo',itinerary:'Itinerarios',food:'Alimentación',records:'Fichas 360',suppliers:'Operadores',people:'Prestadores',vehicles:'Vehículos',resources:'Recursos',approvals:'Aprobación de negocios',team:'Equipo'} as Record<View,string>)[view]}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function isoDate(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function friendlyDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(parseDate(value)).replace('.','').toUpperCase()}
