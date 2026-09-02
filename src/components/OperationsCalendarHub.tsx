import React,{useMemo,useState} from 'react';
import {CalendarDays,Grid3X3} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import CalendarWorkspace from './CalendarWorkspace';
import './OperationsCalendarHub.css';

type Mode='month'|'year';

export default function OperationsCalendarHub({
  leads,services,onLead,onChanged,userRole
}:{leads:Lead[];services:LeadService[];onLead:(lead:Lead)=>void;onChanged:()=>void;userRole:string}){
  const [mode,setMode]=useState<Mode>('month');
  const [year,setYear]=useState(new Date().getFullYear());

  return <div className="ops-calendar-hub">
    <header className="ops-calendar-hub-head">
      <div><span>CALENDARIO OPERATIVO</span><strong>{mode==='year'?`Año ${year}`:'Vista mensual y planificación detallada'}</strong></div>
      <div className="ops-calendar-primary-switch">
        <button className={mode==='month'?'active':''} onClick={()=>setMode('month')}><CalendarDays size={15}/> Mensual</button>
        <button className={mode==='year'?'active':''} onClick={()=>setMode('year')}><Grid3X3 size={15}/> Anual</button>
      </div>
    </header>
    {mode==='month'
      ?<CalendarWorkspace leads={leads} services={services} onLead={onLead} onChanged={onChanged} userRole={userRole}/>
      :<AnnualOperationsCalendar year={year} setYear={setYear} leads={leads} services={services} onLead={onLead}/>
    }
  </div>;
}

function AnnualOperationsCalendar({year,setYear,leads,services,onLead}:{year:number;setYear:(year:number)=>void;leads:Lead[];services:LeadService[];onLead:(lead:Lead)=>void}){
  const leadMap=useMemo(()=>new Map(leads.map(lead=>[lead.id,lead])),[leads]);
  const rows=useMemo(()=>services.filter(service=>{
    if(!service.fecha_servicio)return false;
    return Number(String(service.fecha_servicio).slice(0,4))===year;
  }),[services,year]);
  return <section className="annual-calendar">
    <div className="annual-calendar-toolbar"><button onClick={()=>setYear(year-1)}>← {year-1}</button><strong>{year}</strong><button onClick={()=>setYear(year+1)}>{year+1} →</button></div>
    <div className="annual-month-grid">{Array.from({length:12},(_,month)=><AnnualMonth key={month} year={year} month={month} services={rows} leadMap={leadMap} onLead={onLead}/>)}</div>
  </section>;
}

function AnnualMonth({year,month,services,leadMap,onLead}:{year:number;month:number;services:LeadService[];leadMap:Map<string,Lead>;onLead:(lead:Lead)=>void}){
  const first=new Date(year,month,1,12);
  const totalDays=new Date(year,month+1,0,12).getDate();
  const mondayOffset=(first.getDay()+6)%7;
  const cells=Array.from({length:mondayOffset+totalDays},(_,index)=>index<mondayOffset?null:index-mondayOffset+1);
  const monthName=new Intl.DateTimeFormat('es-CL',{month:'long'}).format(first);
  const monthRows=services.filter(service=>Number(String(service.fecha_servicio).slice(5,7))===month+1);
  return <article className="annual-month-card">
    <header><strong>{monthName}</strong><span>{monthRows.length} servicio(s)</span></header>
    <div className="annual-weekdays">{['L','M','X','J','V','S','D'].map(day=><span key={day}>{day}</span>)}</div>
    <div className="annual-days">{cells.map((day,index)=>{
      if(day===null)return <span key={`blank-${index}`} className="blank"/>;
      const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dayRows=monthRows.filter(service=>service.fecha_servicio===iso);
      const firstLead=dayRows[0]?leadMap.get(dayRows[0].lead_id):null;
      return <button key={iso} className={dayRows.length?'has-events':''} title={dayRows.map(service=>service.producto).join(' · ')} onClick={()=>firstLead&&onLead(firstLead)}><b>{day}</b>{dayRows.length?<em>{dayRows.length}</em>:null}</button>;
    })}</div>
  </article>;
}
