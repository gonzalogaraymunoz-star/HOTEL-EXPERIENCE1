import React,{useEffect,useMemo,useState} from 'react';
import {ChevronLeft,ChevronRight,Search} from 'lucide-react';
import type {Lead,LeadService,ServiceAssignment,Supplier} from '../types';
import {loadOperationsData,updateService} from '../lib/api';

export type PlanningMode='week'|'month';

export default function PlanningCalendar({mode,focusDate,leads,services,userRole,onDateChange,onChanged,onService}:{mode:PlanningMode;focusDate:string;leads:Lead[];services:LeadService[];userRole:string;onDateChange:(date:string)=>void;onChanged:()=>void;onService:(service:LeadService)=>void}){
  const [ops,setOps]=useState<{assignments:ServiceAssignment[];suppliers:Supplier[]}>({assignments:[],suppliers:[]});
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('Todos');
  const canEdit=userRole!=='viewer';
  useEffect(()=>{void loadOperationsData().then(data=>setOps({assignments:data.assignments||[],suppliers:data.suppliers||[]})).catch(()=>setOps({assignments:[],suppliers:[]}))},[]);
  const cursor=parseDate(focusDate);
  const leadMap=useMemo(()=>new Map(leads.map(lead=>[lead.id,lead])),[leads]);
  const assignmentMap=useMemo(()=>new Map(ops.assignments.map(item=>[item.lead_service_id,item])),[ops.assignments]);
  const supplierMap=useMemo(()=>new Map(ops.suppliers.map(item=>[item.id,item])),[ops.suppliers]);
  const filtered=useMemo(()=>services.filter(service=>{
    if(status!=='Todos'&&String(service.estado_operacion||'Pendiente')!==status)return false;
    const q=query.trim().toLowerCase();if(!q)return true;
    const lead=leadMap.get(service.lead_id),a=assignmentMap.get(service.id),supplier=a?.supplier_id?supplierMap.get(a.supplier_id):undefined;
    return [service.service_code,service.producto,service.tour_id,lead?.codigo,lead?.reserva,lead?.empresa_ejecuta,supplier?.name,a?.meeting_point].join(' ').toLowerCase().includes(q);
  }),[services,status,query,leadMap,assignmentMap,supplierMap]);

  const move=(delta:number)=>onDateChange(isoDate(mode==='month'?addMonths(cursor,delta):addDays(cursor,delta*7)));
  const drop=async(id:string,date:string)=>{if(!canEdit)return;await updateService(id,{fecha_servicio:date});onDateChange(date);onChanged()};
  const context=(service:LeadService)=>{const a=assignmentMap.get(service.id);return {a,supplier:a?.supplier_id?supplierMap.get(a.supplier_id):undefined,lead:leadMap.get(service.lead_id)}};

  return <section className="planning-calendar">
    <header className="planning-calendar-toolbar">
      <div className="planning-period"><button onClick={()=>move(-1)}><ChevronLeft size={17}/></button><div><span>{mode==='month'?'MES':'SEMANA'}</span><b>{periodLabel(cursor,mode)}</b></div><button onClick={()=>move(1)}><ChevronRight size={17}/></button><button className="planning-today" onClick={()=>onDateChange(isoDate(new Date()))}>Hoy</button></div>
      <div className="planning-filters"><label><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar servicio, código, cliente, hotel…"/></label><select value={status} onChange={e=>setStatus(e.target.value)}><option>Todos</option><option>Pendiente</option><option>Coordinado</option><option>En curso</option><option>Completado</option><option>Cancelado</option></select></div>
    </header>
    {mode==='month'?<Month cursor={cursor} selected={focusDate} services={filtered} context={context} onSelect={onDateChange} onService={onService} onDrop={drop} canEdit={canEdit}/>:<Week cursor={cursor} selected={focusDate} services={filtered} context={context} onSelect={onDateChange} onService={onService} onDrop={drop} canEdit={canEdit}/>} 
  </section>;
}

function Month({cursor,selected,services,context,onSelect,onService,onDrop,canEdit}:any){const first=startOfWeek(startOfMonth(cursor));const days=Array.from({length:42},(_,i)=>addDays(first,i));return <div className="planning-month"><div className="planning-weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=><span key={x}>{x}</span>)}</div><div className="planning-month-grid">{days.map(day=>{const iso=isoDate(day),events=sortEvents(services.filter((s:LeadService)=>s.fecha_servicio===iso),context),outside=day.getMonth()!==cursor.getMonth();return <section key={iso} className={`${outside?'outside ':''}${selected===iso?'selected ':''}${isToday(day)?'today':''}`} onClick={()=>onSelect(iso)} onDragOver={e=>canEdit&&e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('service');if(id)void onDrop(id,iso)}}><header><b>{day.getDate()}</b><span>{events.length||''}</span></header><div>{events.slice(0,4).map((service:LeadService)=><Event key={service.id} service={service} context={context(service)} onService={onService} canEdit={canEdit}/>)}{events.length>4&&<small>+{events.length-4} más</small>}</div></section>})}</div></div>}
function Week({cursor,selected,services,context,onSelect,onService,onDrop,canEdit}:any){const start=startOfWeek(cursor),days=Array.from({length:7},(_,i)=>addDays(start,i));return <div className="planning-week">{days.map(day=>{const iso=isoDate(day),events=sortEvents(services.filter((s:LeadService)=>s.fecha_servicio===iso),context);return <section key={iso} className={`${selected===iso?'selected ':''}${isToday(day)?'today':''}`} onClick={()=>onSelect(iso)} onDragOver={e=>canEdit&&e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('service');if(id)void onDrop(id,iso)}}><header><span>{weekday(day)}</span><b>{day.getDate()}</b><small>{events.length} serv.</small></header><div className="planning-week-events">{events.map((service:LeadService)=><Event key={service.id} service={service} context={context(service)} onService={onService} canEdit={canEdit}/>)}</div></section>})}</div>}
function Event({service,context,onService,canEdit}:any){const pickup=context.a?.pickup_time?String(context.a.pickup_time).slice(0,5):service.hora_inicio?String(service.hora_inicio).slice(0,5):'—';return <button draggable={canEdit} onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('service',service.id)}} onClick={e=>{e.stopPropagation();onService(service)}} className={`planning-event ${slug(service.estado_operacion)}`}><b>{pickup} · {service.producto}</b><span>{context.lead?.reserva||'Cliente'} · {service.numero_pax} pax</span><small>{context.supplier?.name||context.lead?.empresa_ejecuta||'Operación interna'}</small></button>}
function sortEvents(items:LeadService[],context:(s:LeadService)=>any){return [...items].sort((a,b)=>String(context(a).a?.pickup_time||a.hora_inicio||'99:99').localeCompare(String(context(b).a?.pickup_time||b.hora_inicio||'99:99')))}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12)}
function isoDate(date:Date){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`}
function addDays(date:Date,n:number){const d=new Date(date);d.setDate(d.getDate()+n);return d}
function addMonths(date:Date,n:number){const d=new Date(date);d.setMonth(d.getMonth()+n);return d}
function startOfMonth(date:Date){return new Date(date.getFullYear(),date.getMonth(),1,12)}
function startOfWeek(date:Date){const d=new Date(date);const day=d.getDay()||7;d.setDate(d.getDate()-(day-1));return d}
function isToday(date:Date){return isoDate(date)===isoDate(new Date())}
function weekday(date:Date){return new Intl.DateTimeFormat('es-CL',{weekday:'short'}).format(date)}
function periodLabel(date:Date,mode:PlanningMode){if(mode==='month')return new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric'}).format(date);const start=startOfWeek(date),end=addDays(start,6);return `${start.getDate()} ${new Intl.DateTimeFormat('es-CL',{month:'short'}).format(start)} – ${end.getDate()} ${new Intl.DateTimeFormat('es-CL',{month:'short',year:'numeric'}).format(end)}`}
function slug(value:any){return String(value||'Pendiente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-')}
