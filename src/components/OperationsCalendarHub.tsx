import React,{useMemo} from 'react';
import type {Lead,LeadService} from '../types';
import PlanningCalendar from './PlanningCalendar';
import './OperationsCalendarHub.css';
import './OperationsUxV2.css';

export type OperationsCalendarMode='week'|'month'|'year';

export default function OperationsCalendarHub({
  mode,selectedDate,leads,services,onDateChange,onChanged,userRole,onService
}:{mode:OperationsCalendarMode;selectedDate:string;leads:Lead[];services:LeadService[];onDateChange:(date:string)=>void;onChanged:()=>void;userRole:string;onService:(service:LeadService)=>void}){
  if(mode==='year')return <AnnualOperationsCalendar selectedDate={selectedDate} onDateChange={onDateChange} leads={leads} services={services} onService={onService}/>;
  return <PlanningCalendar mode={mode} focusDate={selectedDate} leads={leads} services={services} onDateChange={onDateChange} onChanged={onChanged} userRole={userRole} onService={onService}/>;
}

function AnnualOperationsCalendar({selectedDate,onDateChange,leads,services,onService}:{selectedDate:string;onDateChange:(date:string)=>void;leads:Lead[];services:LeadService[];onService:(service:LeadService)=>void}){
  const year=Number(selectedDate.slice(0,4))||new Date().getFullYear();
  const leadMap=useMemo(()=>new Map(leads.map(lead=>[lead.id,lead])),[leads]);
  const rows=useMemo(()=>services.filter(service=>service.fecha_servicio&&Number(String(service.fecha_servicio).slice(0,4))===year),[services,year]);
  const changeYear=(next:number)=>onDateChange(`${next}-${selectedDate.slice(5,10)}`);
  return <section className="annual-calendar">
    <header className="annual-calendar-toolbar"><button onClick={()=>changeYear(year-1)}>← {year-1}</button><div><span>CALENDARIO ANUAL</span><strong>{year}</strong></div><button onClick={()=>changeYear(year+1)}>{year+1} →</button></header>
    <div className="annual-month-grid">{Array.from({length:12},(_,month)=><AnnualMonth key={month} year={year} month={month} services={rows} leadMap={leadMap} onDateChange={onDateChange} onService={onService}/>)}</div>
  </section>;
}

function AnnualMonth({year,month,services,leadMap,onDateChange,onService}:{year:number;month:number;services:LeadService[];leadMap:Map<string,Lead>;onDateChange:(date:string)=>void;onService:(service:LeadService)=>void}){
  const first=new Date(year,month,1,12),totalDays=new Date(year,month+1,0,12).getDate(),mondayOffset=(first.getDay()+6)%7;
  const cells=Array.from({length:mondayOffset+totalDays},(_,index)=>index<mondayOffset?null:index-mondayOffset+1);
  const monthName=new Intl.DateTimeFormat('es-CL',{month:'long'}).format(first);
  const monthRows=services.filter(service=>Number(String(service.fecha_servicio).slice(5,7))===month+1);
  return <article className="annual-month-card"><header><strong>{monthName}</strong><span>{monthRows.length} servicio{monthRows.length===1?'':'s'}</span></header><div className="annual-weekdays">{['L','M','X','J','V','S','D'].map(day=><span key={day}>{day}</span>)}</div><div className="annual-days">{cells.map((day,index)=>{
    if(day===null)return <span key={`blank-${index}`} className="blank"/>;
    const iso=`${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`,dayRows=monthRows.filter(service=>service.fecha_servicio===iso),firstService=dayRows[0],lead=firstService?leadMap.get(firstService.lead_id):null;
    return <button key={iso} className={dayRows.length?'has-events':''} title={dayRows.map(service=>`${service.producto}${lead?` · ${lead.reserva}`:''}`).join(' | ')} onClick={()=>{onDateChange(iso);if(dayRows.length===1)onService(dayRows[0])}}><b>{day}</b>{dayRows.length?<em>{dayRows.length}</em>:null}</button>
  })}</div></article>;
}
