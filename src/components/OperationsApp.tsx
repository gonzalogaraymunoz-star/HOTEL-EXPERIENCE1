import React,{useEffect,useMemo,useState} from 'react';
import {
  Box,Building2,CalendarDays,CarFront,ChevronLeft,ChevronRight,ClipboardList,FolderOpen,
  LogOut,Menu,RefreshCw,UsersRound,X,Users
} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {loadCRMData} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import BrandLogo from './BrandLogo';
import CalendarWorkspace from './CalendarWorkspace';
import DailyOperationsBoard from './DailyOperationsBoard';
import OperationalRecordsWorkspace from './OperationalRecordsWorkspace';
import OperationsHub from './OperationsHub';
import OperationsAdminTools from './OperationsAdminTools';
import ServiceOperationModal from './ServiceOperationModal';
import TeamView from './TeamView';
import './OperationsApp.css';

type View='program'|'calendar'|'records'|'suppliers'|'people'|'vehicles'|'resources'|'team';

export default function OperationsApp({profile}:{profile:any}){
  const [view,setView]=useState<View>('program');
  const [leads,setLeads]=useState<Lead[]>([]);
  const [services,setServices]=useState<LeadService[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selectedDate,setSelectedDate]=useState(()=>isoDate(new Date()));
  const [operationService,setOperationService]=useState<LeadService|null>(null);
  const [mobileNav,setMobileNav]=useState(false);

  const refresh=async()=>{
    setLoading(true);setError('');
    try{
      const data=await loadCRMData();
      setLeads(data.leads);
      setServices(data.services);
    }catch(e:any){setError(e?.message||'No se pudo cargar la operación.');}
    finally{setLoading(false)}
  };
  useEffect(()=>{void refresh()},[]);

  const operationalServices=useMemo(()=>services.filter(service=>{
    const booking=String(service.booking_status||'confirmed').toLowerCase();
    return ['confirmed','completed'].includes(booking);
  }),[services]);

  const leadById=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const activeLeads=useMemo(()=>{
    const ids=new Set(operationalServices.map(s=>s.lead_id));
    return leads.filter(l=>ids.has(l.id));
  },[leads,operationalServices]);

  const moveDay=(delta:number)=>setSelectedDate(isoDate(addDays(parseDate(selectedDate),delta)));
  const openView=(next:View)=>{setView(next);setMobileNav(false)};

  return <div className="ops-app-shell">
    <aside className={`ops-rail ${mobileNav?'open':''}`}>
      <div className="ops-rail-brand"><BrandLogo/></div>
      <nav>
        <RailButton icon={<ClipboardList/>} label="Programa" active={view==='program'} onClick={()=>openView('program')}/>
        <RailButton icon={<CalendarDays/>} label="Calendario" active={view==='calendar'} onClick={()=>openView('calendar')}/>
        <RailButton icon={<FolderOpen/>} label="Fichas" active={view==='records'} onClick={()=>openView('records')}/>
        <span className="ops-rail-divider"/>
        <RailButton icon={<Building2/>} label="Operadores" active={view==='suppliers'} onClick={()=>openView('suppliers')}/>
        <RailButton icon={<UsersRound/>} label="Prestadores" active={view==='people'} onClick={()=>openView('people')}/>
        <RailButton icon={<CarFront/>} label="Vehículos" active={view==='vehicles'} onClick={()=>openView('vehicles')}/>
        <RailButton icon={<Box/>} label="Recursos" active={view==='resources'} onClick={()=>openView('resources')}/>
        {profile?.role==='admin'&&<><span className="ops-rail-divider"/><RailButton icon={<Users/>} label="Equipo" active={view==='team'} onClick={()=>openView('team')}/></>}
      </nav>
      <button className="ops-signout" onClick={()=>assertSupabase().auth.signOut()} title="Cerrar sesión"><LogOut size={18}/><span>Cerrar sesión</span></button>
    </aside>
    {mobileNav&&<button className="ops-nav-scrim" aria-label="Cerrar menú" onClick={()=>setMobileNav(false)}/>} 

    <section className="ops-app-main">
      <header className="ops-topbar">
        <div className="ops-topbar-left">
          <button className="ops-mobile-menu" onClick={()=>setMobileNav(v=>!v)}>{mobileNav?<X/>:<Menu/>}</button>
          <div className="ops-brand-copy"><span>HOTEL EXPERIENCE</span><strong>{viewTitle(view)}</strong></div>
        </div>
        <div className="ops-date-control" aria-label="Fecha de operación">
          <button onClick={()=>moveDay(-1)} title="Día anterior"><ChevronLeft size={18}/></button>
          <label><small>OPERACIÓN</small><input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/><b>{friendlyDate(selectedDate)}</b></label>
          <button onClick={()=>moveDay(1)} title="Día siguiente"><ChevronRight size={18}/></button>
          <button className="ops-today" onClick={()=>setSelectedDate(isoDate(new Date()))}>Hoy</button>
        </div>
        <div className="ops-topbar-right">
          <button className="ops-refresh" onClick={refresh} title="Actualizar"><RefreshCw size={17}/></button>
          <div className="ops-user"><span>{String(profile?.full_name||profile?.email||'U').slice(0,1).toUpperCase()}</span><div><b>{profile?.full_name||'Usuario'}</b><small>{profile?.role||'agent'}</small></div></div>
        </div>
      </header>

      {error&&<div className="ops-error">{error}</div>}
      {loading?<div className="ops-loading">Cargando operación…</div>:<main className="ops-workspace">
        {view==='program'&&<DailyOperationsBoard date={selectedDate} leads={activeLeads} services={operationalServices} onOperation={setOperationService}/>} 
        {view==='calendar'&&<CalendarWorkspace leads={activeLeads} services={operationalServices} onLead={()=>{}} onChanged={refresh} userRole={profile?.role||'agent'}/>} 
        {view==='records'&&<OperationalRecordsWorkspace role={profile?.role||'agent'}/>} 
        {view==='suppliers'&&<><OperationsHub role={profile?.role||'agent'} initialTab="suppliers"/><OperationsAdminTools role={profile?.role||'agent'} section="suppliers"/></>} 
        {view==='people'&&<><OperationsHub role={profile?.role||'agent'} initialTab="people"/><OperationsAdminTools role={profile?.role||'agent'} section="service_people"/></>} 
        {view==='vehicles'&&<><OperationsHub role={profile?.role||'agent'} initialTab="vehicles"/><OperationsAdminTools role={profile?.role||'agent'} section="vehicles"/></>} 
        {view==='resources'&&<><OperationsHub role={profile?.role||'agent'} initialTab="resources"/><OperationsAdminTools role={profile?.role||'agent'} section="resources"/></>} 
        {view==='team'&&<TeamView currentRole={profile?.role||'agent'}/>} 
      </main>}
    </section>

    {operationService&&<ServiceOperationModal
      lead={leadById.get(operationService.lead_id)!}
      service={operationService}
      userRole={profile?.role||'agent'}
      onClose={()=>setOperationService(null)}
      onChanged={refresh}
    />}
  </div>;
}

function RailButton({icon,label,active,onClick}:{icon:React.ReactNode;label:string;active:boolean;onClick:()=>void}){
  return <button className={active?'ops-rail-button active':'ops-rail-button'} onClick={onClick} title={label}>{icon}<span>{label}</span></button>;
}

function viewTitle(view:View){
  return ({program:'Programa diario',calendar:'Calendario operativo',records:'Fichas 360',suppliers:'Operadores',people:'Prestadores',vehicles:'Vehículos',resources:'Recursos',team:'Equipo'} as Record<View,string>)[view];
}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12,0,0)}
function addDays(date:Date,n:number){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function isoDate(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function friendlyDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'short',day:'2-digit',month:'short',year:'numeric'}).format(parseDate(value)).replace('.','').toUpperCase()}
