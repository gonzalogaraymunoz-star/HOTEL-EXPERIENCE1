import React,{useCallback,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Menu,PanelLeftClose,PanelLeftOpen,Plug,ScrollText,X} from 'lucide-react';
import type {Lead,LeadService,CRMTask,CRMActivity} from '../types';
import {loadCRMData} from '../lib/api';
import LeadDrawer from './LeadDrawer';
import GlobalSearchPortal from './GlobalSearchPortal';
import AddonsWorkspace from './AddonsWorkspace';
import CancellationPoliciesWorkspace from './CancellationPoliciesWorkspace';
import './AppEnhancements.css';

type HealthState={
  ok?:boolean;
  version?:string;
  environment?:string;
  connections?:{supabase?:{configured?:boolean};ai?:{configured?:boolean}};
};

function SystemStatus(){
  const [health,setHealth]=useState<HealthState|null>(null);
  const [failed,setFailed]=useState(false);

  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/health',{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        const body=await response.json().catch(()=>({}));
        if(!response.ok&&response.status!==503)throw new Error(`HTTP ${response.status}`);
        setHealth(body);
      })
      .catch(error=>{if(error?.name!=='AbortError')setFailed(true)});
    return()=>controller.abort();
  },[]);

  const connected=Boolean(health?.connections?.supabase?.configured);
  const label=failed?'Sin respuesta':health?connected?'Supabase conectado':'Configuración pendiente':'Verificando conexión';
  const state=failed?'error':connected?'ready':health?'pending':'checking';

  return <div className={`system-health ${state}`} title={health?.version?`Hotel Experience ${health.version}`:'Estado del backend'}>
    <span className="system-health-dot"/>
    <div>
      <b>{label}</b>
      <small>{health?.environment&&health.environment!=='unknown'?health.environment:'fuente de verdad operacional'}</small>
    </div>
  </div>;
}

export default function AppEnhancements({profile,children}:{profile:any;children:React.ReactNode}){
  const [addonsOpen,setAddonsOpen]=useState(false);
  const [policiesOpen,setPoliciesOpen]=useState(false);
  const [searchHost,setSearchHost]=useState<Element|null>(null);
  const [navHost,setNavHost]=useState<Element|null>(null);
  const [bottomHost,setBottomHost]=useState<Element|null>(null);
  const [sidebarHost,setSidebarHost]=useState<Element|null>(null);
  const [isMobile,setIsMobile]=useState(()=>typeof window!=='undefined'&&window.matchMedia('(max-width: 900px)').matches);
  const [mobileMenuOpen,setMobileMenuOpen]=useState(false);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(()=>{
    try{return localStorage.getItem('hotel-experience-sidebar-collapsed')==='1'}catch{return false}
  });
  const [drawerData,setDrawerData]=useState<{
    lead:Lead;services:LeadService[];tasks:CRMTask[];activities:CRMActivity[]
  }|null>(null);

  useEffect(()=>{
    const media=window.matchMedia('(max-width: 900px)');
    const sync=()=>setIsMobile(media.matches);
    sync();
    media.addEventListener?.('change',sync);
    return()=>media.removeEventListener?.('change',sync);
  },[]);

  useEffect(()=>{
    let cancelled=false;
    let tries=0;
    const bind=()=>{
      if(cancelled)return;
      const search=document.querySelector('.crm-topbar .searchbox');
      const nav=document.querySelector('.sidebar nav');
      const bottom=document.querySelector('.sidebar-bottom');
      const sidebar=document.querySelector('.sidebar');
      if(search){
        search.classList.add('global-search-host');
        setSearchHost(search);
      }
      if(nav)setNavHost(nav);
      if(bottom)setBottomHost(bottom);
      if(sidebar)setSidebarHost(sidebar);
      if((!search||!nav||!bottom||!sidebar)&&tries++<30)setTimeout(bind,100);
    };
    bind();
    return()=>{
      cancelled=true;
      document.querySelector('.crm-topbar .searchbox')?.classList.remove('global-search-host');
    };
  },[]);

  useEffect(()=>{
    const shell=document.querySelector('.crm-shell');
    const sidebar=document.querySelector('.sidebar');
    if(!shell||!sidebar)return;
    const collapsed=!isMobile&&sidebarCollapsed;
    shell.classList.toggle('sidebar-collapsed',collapsed);
    sidebar.classList.toggle('sidebar-collapsed',collapsed);
    sidebar.classList.toggle('mobile-open',isMobile&&mobileMenuOpen);
    document.body.classList.toggle('hotel-menu-open',isMobile&&mobileMenuOpen);
    return()=>document.body.classList.remove('hotel-menu-open');
  },[isMobile,sidebarCollapsed,mobileMenuOpen,sidebarHost]);

  useEffect(()=>{
    if(!navHost||!isMobile)return;
    const closeOnNavigation=(event:Event)=>{
      if((event.target as HTMLElement)?.closest('.nav-item'))setMobileMenuOpen(false);
    };
    navHost.addEventListener('click',closeOnNavigation);
    return()=>navHost.removeEventListener('click',closeOnNavigation);
  },[navHost,isMobile]);

  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){
        setMobileMenuOpen(false);
        setAddonsOpen(false);
        setPoliciesOpen(false);
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);

  const toggleDesktopSidebar=()=>{
    setSidebarCollapsed(current=>{
      const next=!current;
      try{localStorage.setItem('hotel-experience-sidebar-collapsed',next?'1':'0')}catch{}
      return next;
    });
  };

  const openLead=useCallback(async(leadId:string)=>{
    try{
      const data=await loadCRMData();
      const lead=data.leads.find((x:Lead)=>x.id===leadId);
      if(!lead)return;
      setDrawerData({
        lead,
        services:data.services,
        tasks:data.tasks,
        activities:data.activities
      });
    }catch(e){console.error('global search lead',e)}
  },[]);

  const navigate=useCallback((label:string)=>{
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar .nav-item'));
    const button=buttons.find(x=>String(x.textContent||'').toLowerCase().includes(label.toLowerCase()));
    if(button){button.click();setMobileMenuOpen(false)}
  },[]);

  return <>
    {children}

    {typeof document!=='undefined'&&createPortal(
      <>
        <div className="mobile-app-bar">
          <button className="mobile-menu-trigger" onClick={()=>setMobileMenuOpen(true)} aria-label="Abrir menú"><Menu size={21}/></button>
          <span>Hotel Experience</span>
        </div>
        <button className={`mobile-menu-backdrop ${mobileMenuOpen?'visible':''}`} onClick={()=>setMobileMenuOpen(false)} aria-label="Cerrar menú"/>
      </>,
      document.body
    )}

    {sidebarHost&&createPortal(
      <>
        <button className="desktop-sidebar-toggle" onClick={toggleDesktopSidebar} title={sidebarCollapsed?'Expandir menú':'Contraer menú'} aria-label={sidebarCollapsed?'Expandir menú':'Contraer menú'}>
          {sidebarCollapsed?<PanelLeftOpen size={18}/>:<PanelLeftClose size={18}/>} 
        </button>
        <button className="mobile-sidebar-close" onClick={()=>setMobileMenuOpen(false)} aria-label="Cerrar menú"><X size={20}/></button>
      </>,
      sidebarHost
    )}

    {searchHost&&createPortal(
      <GlobalSearchPortal onLead={openLead} onNavigate={navigate}/>,
      searchHost
    )}

    {navHost&&createPortal(
      <>
        <div className="nav-section-label enhancement-system-label">SISTEMA</div>
        <button
          className={addonsOpen?'nav-item active enhancement-addon-nav':'nav-item enhancement-addon-nav'}
          onClick={()=>{setAddonsOpen(true);setPoliciesOpen(false);setMobileMenuOpen(false)}}
        >
          <span><Plug/></span><b>Complementos</b>
        </button>
        <button
          className={policiesOpen?'nav-item active enhancement-addon-nav':'nav-item enhancement-addon-nav'}
          onClick={()=>{setPoliciesOpen(true);setAddonsOpen(false);setMobileMenuOpen(false)}}
        >
          <span><ScrollText/></span><b>Políticas</b>
        </button>
      </>,
      navHost
    )}

    {bottomHost&&createPortal(<SystemStatus/>,bottomHost)}

    {addonsOpen&&<AddonsWorkspace role={profile?.role||'agent'} onClose={()=>setAddonsOpen(false)}/>}
    {policiesOpen&&<CancellationPoliciesWorkspace role={profile?.role||'agent'} onClose={()=>setPoliciesOpen(false)}/>}

    {drawerData&&<LeadDrawer
      lead={drawerData.lead}
      services={drawerData.services}
      tasks={drawerData.tasks}
      activities={drawerData.activities}
      userRole={profile?.role||'agent'}
      onClose={()=>setDrawerData(null)}
      onChanged={async()=>{await openLead(drawerData.lead.id)}}
    />}
  </>;
}
