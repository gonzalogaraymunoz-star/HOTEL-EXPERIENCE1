import React,{useCallback,useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Plug} from 'lucide-react';
import type {Lead,LeadService,CRMTask,CRMActivity} from '../types';
import {loadCRMData} from '../lib/api';
import LeadDrawer from './LeadDrawer';
import GlobalSearchPortal from './GlobalSearchPortal';
import AddonsWorkspace from './AddonsWorkspace';
import './AppEnhancements.css';

export default function AppEnhancements({profile,children}:{profile:any;children:React.ReactNode}){
  const [addonsOpen,setAddonsOpen]=useState(false);
  const [searchHost,setSearchHost]=useState<Element|null>(null);
  const [navHost,setNavHost]=useState<Element|null>(null);
  const [drawerData,setDrawerData]=useState<{
    lead:Lead;services:LeadService[];tasks:CRMTask[];activities:CRMActivity[]
  }|null>(null);

  useEffect(()=>{
    let cancelled=false;
    let tries=0;
    const bind=()=>{
      if(cancelled)return;
      const search=document.querySelector('.crm-topbar .searchbox');
      const nav=document.querySelector('.sidebar nav');
      if(search){
        search.classList.add('global-search-host');
        setSearchHost(search);
      }
      if(nav)setNavHost(nav);
      if((!search||!nav)&&tries++<30)setTimeout(bind,100);
    };
    bind();
    return()=>{
      cancelled=true;
      document.querySelector('.crm-topbar .searchbox')?.classList.remove('global-search-host');
    };
  },[]);

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
    if(button)button.click();
  },[]);

  return <>
    {children}

    {searchHost&&createPortal(
      <GlobalSearchPortal onLead={openLead} onNavigate={navigate}/>,
      searchHost
    )}

    {navHost&&createPortal(
      <>
        <div className="nav-section-label enhancement-system-label">SISTEMA</div>
        <button className={addonsOpen?'nav-item active enhancement-addon-nav':'nav-item enhancement-addon-nav'} onClick={()=>setAddonsOpen(true)}>
          <span><Plug/></span><b>Complementos</b>
        </button>
      </>,
      navHost
    )}

    {addonsOpen&&<AddonsWorkspace role={profile?.role||'agent'} onClose={()=>setAddonsOpen(false)}/>}

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
