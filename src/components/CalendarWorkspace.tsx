import React,{useEffect,useMemo,useState} from 'react';
import {
  CalendarDays,ChevronLeft,ChevronRight,Clock3,Filter,GripVertical,
  List,Rows3,Square,Today,Users,MapPin
} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {updateService} from '../lib/api';

type ViewMode='month'|'week'|'day'|'agenda';

export default function CalendarWorkspace({
  leads,services,onLead,onChanged,userRole
}:{leads:Lead[];services:LeadService[];onLead:(l:Lead)=>void;onChanged:()=>void;userRole:string}){
  const [view,setView]=useState<ViewMode>('month');
  const [cursor,setCursor]=useState(()=>startOfDay(new Date()));
  const [selectedDate,setSelectedDate]=useState(()=>isoDate(new Date()));
  const [statuses,setStatuses]=useState<string[]>(['Pendiente','Coordinado','En curso','Completado']);
  const canEdit=userRole!=='viewer';

  const dated=useMemo(()=>services.filter(s=>s.fecha_servicio),[services]);
  const undated=useMemo(()=>services.filter(s=>!s.fecha_servicio),[services]);
  const visible=useMemo(()=>dated.filter(s=>statuses.includes(s.estado_operacion||'Pendiente')),[dated,statuses]);

  useEffect(()=>{
    const handler=(e:KeyboardEvent)=>{
      if((e.target as HTMLElement)?.tagName==='INPUT'||(e.target as HTMLElement)?.tagName==='TEXTAREA'||(e.target as HTMLElement)?.tagName==='SELECT')return;
      const k=e.key.toLowerCase();
      if(k==='t'){e.preventDefault();goToday();}
      if(k==='m'||k==='3'){e.preventDefault();setView('month');}
      if(k==='w'||k==='2'){e.preventDefault();setView('week');}
      if(k==='d'||k==='1'){e.preventDefault();setView('day');}
      if(k==='a'||k==='5'){e.preventDefault();setView('agenda');}
      if(k==='n'||k==='j'){e.preventDefault();move(1);}
      if(k==='p'){e.preventDefault();move(-1);}
    };
    window.addEventListener('keydown',handler);
    return()=>window.removeEventListener('keydown',handler);
  },[view,cursor]);

  const goToday=()=>{
    const d=startOfDay(new Date());
    setCursor(d);setSelectedDate(isoDate(d));
  };
  const move=(dir:number)=>{
    if(view==='month')setCursor(addMonths(cursor,dir));
    else if(view==='week')setCursor(addDays(cursor,7*dir));
    else if(view==='day')setCursor(addDays(cursor,dir));
    else setCursor(addDays(cursor,14*dir));
  };

  const handleDrop=async(serviceId:string,date:string)=>{
    if(!canEdit)return;
    await updateService(serviceId,{fecha_servicio:date});
    setSelectedDate(date);
    onChanged();
  };

  const leadFor=(id:string)=>leads.find(l=>l.id===id);
  const label=periodLabel(cursor,view);

  return <div className="calendar-workspace">
    <header className="calendar-header">
      <div className="calendar-header-left">
        <button className="today-button" onClick={goToday}>Hoy</button>
        <button className="icon-button compact-icon" onClick={()=>move(-1)} title="Periodo anterior"><ChevronLeft size={18}/></button>
        <button className="icon-button compact-icon" onClick={()=>move(1)} title="Periodo siguiente"><ChevronRight size={18}/></button>
        <h2>{label}</h2>
      </div>
      <div className="calendar-view-switch">
        <button className={view==='month'?'active':''} onClick={()=>setView('month')} title="Mes · M"><CalendarDays size={16}/> Mes</button>
        <button className={view==='week'?'active':''} onClick={()=>setView('week')} title="Semana · W"><Rows3 size={16}/> Semana</button>
        <button className={view==='day'?'active':''} onClick={()=>setView('day')} title="Día · D"><Square size={16}/> Día</button>
        <button className={view==='agenda'?'active':''} onClick={()=>setView('agenda')} title="Agenda · A"><List size={16}/> Agenda</button>
      </div>
    </header>

    <div className="calendar-body">
      <aside className="calendar-sidebar-panel">
        <MiniMonth cursor={cursor} selectedDate={selectedDate} onSelect={date=>{setSelectedDate(date);setCursor(parseISO(date));}} visible={visible}/>
        <section className="calendar-filter-box">
          <div className="filter-title"><Filter size={15}/><b>Operación</b></div>
          {['Pendiente','Coordinado','En curso','Completado','Cancelado'].map(status=><label key={status} className="calendar-check">
            <input type="checkbox" checked={statuses.includes(status)} onChange={()=>setStatuses(s=>s.includes(status)?s.filter(x=>x!==status):[...s,status])}/>
            <span className={`calendar-color ${slug(status)}`}/><span>{status}</span>
          </label>)}
        </section>
        <section className="calendar-filter-box">
          <div className="filter-title"><Clock3 size={15}/><b>Sin fecha</b><span className="sidebar-counter">{undated.length}</span></div>
          <div className="undated-list">
            {undated.slice(0,6).map(s=>{
              const lead=leadFor(s.lead_id);
              return <button key={s.id} onClick={()=>lead&&onLead(lead)}><strong>{s.producto}</strong><span>{lead?.reserva||'Lead'}</span></button>
            })}
            {undated.length>6&&<small>+{undated.length-6} servicios sin fecha</small>}
            {!undated.length&&<small>Todo tiene fecha asignada.</small>}
          </div>
        </section>
        <div className="calendar-shortcuts">
          <b>Atajos</b><span>T hoy · M mes · W semana · D día · A agenda</span>
        </div>
      </aside>

      <main className="calendar-main-panel">
        {view==='month'&&<MonthView cursor={cursor} selectedDate={selectedDate} setSelectedDate={setSelectedDate} services={visible} leadFor={leadFor} onLead={onLead} onDrop={handleDrop} canEdit={canEdit} setCursor={setCursor} setView={setView}/>}
        {view==='week'&&<WeekView cursor={cursor} selectedDate={selectedDate} setSelectedDate={setSelectedDate} services={visible} leadFor={leadFor} onLead={onLead} onDrop={handleDrop} canEdit={canEdit}/>}
        {view==='day'&&<DayView cursor={cursor} services={visible} leadFor={leadFor} onLead={onLead}/>}
        {view==='agenda'&&<AgendaView cursor={cursor} services={visible} leadFor={leadFor} onLead={onLead}/>}
      </main>
    </div>
  </div>
}

function MiniMonth({cursor,selectedDate,onSelect,visible}:any){
  const start=startOfMonth(cursor),gridStart=startOfWeek(start);
  const days=Array.from({length:42},(_,i)=>addDays(gridStart,i));
  const counts:any={}; visible.forEach((s:LeadService)=>counts[s.fecha_servicio||'']=(counts[s.fecha_servicio||'']||0)+1);
  return <section className="mini-month">
    <header><b>{monthYear(cursor)}</b></header>
    <div className="mini-weekdays">{['L','M','X','J','V','S','D'].map(x=><span key={x}>{x}</span>)}</div>
    <div className="mini-grid">
      {days.map(d=>{
        const iso=isoDate(d),outside=d.getMonth()!==cursor.getMonth();
        return <button key={iso} className={`${outside?'outside ':''}${selectedDate===iso?'selected ':''}${isToday(d)?'today':''}`} onClick={()=>onSelect(iso)}>
          <span>{d.getDate()}</span>{counts[iso]?<i/>:null}
        </button>
      })}
    </div>
  </section>
}

function MonthView({cursor,selectedDate,setSelectedDate,services,leadFor,onLead,onDrop,canEdit,setCursor,setView}:any){
  const first=startOfWeek(startOfMonth(cursor));
  const days=Array.from({length:42},(_,i)=>addDays(first,i));
  return <div className="month-calendar">
    <div className="month-weekdays">{['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'].map(x=><div key={x}>{x}</div>)}</div>
    <div className="month-grid">
      {days.map(d=>{
        const iso=isoDate(d);
        const events=services.filter((s:LeadService)=>s.fecha_servicio===iso);
        const outside=d.getMonth()!==cursor.getMonth();
        return <section key={iso} className={`month-cell ${outside?'outside':''} ${isToday(d)?'today':''} ${selectedDate===iso?'selected':''}`}
          onClick={()=>setSelectedDate(iso)}
          onDragOver={e=>canEdit&&e.preventDefault()}
          onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('service');if(id)onDrop(id,iso);}}>
          <button className="day-number" onDoubleClick={()=>{setCursor(d);setView('day')}}>{d.getDate()}</button>
          <div className="month-events">
            {events.slice(0,3).map((s:LeadService)=><CalendarEvent key={s.id} service={s} lead={leadFor(s.lead_id)} onLead={onLead} draggable={canEdit}/>)}
            {events.length>3&&<button className="more-events" onClick={e=>{e.stopPropagation();setCursor(d);setView('day')}}>+{events.length-3} más</button>}
          </div>
        </section>
      })}
    </div>
  </div>
}

function WeekView({cursor,selectedDate,setSelectedDate,services,leadFor,onLead,onDrop,canEdit}:any){
  const start=startOfWeek(cursor);
  const days=Array.from({length:7},(_,i)=>addDays(start,i));
  return <div className="week-calendar">
    <div className="week-label-column"><div className="week-all-day-label">TODO<br/>EL DÍA</div></div>
    {days.map(d=>{
      const iso=isoDate(d),events=services.filter((s:LeadService)=>s.fecha_servicio===iso);
      return <section key={iso} className={`week-day ${isToday(d)?'today':''} ${selectedDate===iso?'selected':''}`}
        onClick={()=>setSelectedDate(iso)}
        onDragOver={e=>canEdit&&e.preventDefault()}
        onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData('service');if(id)onDrop(id,iso);}}>
        <header><span>{weekdayShort(d)}</span><strong>{d.getDate()}</strong></header>
        <div className="week-event-area">
          {events.map((s:LeadService)=><CalendarEvent key={s.id} service={s} lead={leadFor(s.lead_id)} onLead={onLead} draggable={canEdit} expanded/>)}
          {!events.length&&<span className="empty-day">Sin servicios</span>}
        </div>
      </section>
    })}
  </div>
}

function DayView({cursor,services,leadFor,onLead}:any){
  const iso=isoDate(cursor),events=services.filter((s:LeadService)=>s.fecha_servicio===iso);
  return <div className="day-calendar">
    <header className="day-view-header"><span>{weekdayLong(cursor)}</span><strong>{cursor.getDate()}</strong><small>{monthYear(cursor)}</small></header>
    <div className="day-all-day-row"><div className="day-time-label">TODO EL DÍA</div><div className="day-events-list">
      {events.map((s:LeadService)=><DetailedEvent key={s.id} service={s} lead={leadFor(s.lead_id)} onLead={onLead}/>)}
      {!events.length&&<div className="empty-calendar-day">No hay experiencias programadas para este día.</div>}
    </div></div>
  </div>
}

function AgendaView({cursor,services,leadFor,onLead}:any){
  const from=isoDate(addDays(cursor,-7)),to=isoDate(addDays(cursor,30));
  const upcoming=services.filter((s:LeadService)=>s.fecha_servicio!>=from&&s.fecha_servicio!<=to).sort((a:LeadService,b:LeadService)=>String(a.fecha_servicio).localeCompare(String(b.fecha_servicio)));
  const groups:any={}; upcoming.forEach((s:LeadService)=>(groups[s.fecha_servicio!]||=[]).push(s));
  return <div className="agenda-calendar">
    {Object.entries(groups).map(([date,items]:any)=><section className="agenda-day" key={date}>
      <header><div><strong>{parseISO(date).getDate()}</strong><span>{weekdayShort(parseISO(date))}</span></div><p>{longDate(parseISO(date))}</p></header>
      <div>{items.map((s:LeadService)=><DetailedEvent key={s.id} service={s} lead={leadFor(s.lead_id)} onLead={onLead}/>)}</div>
    </section>)}
    {!upcoming.length&&<div className="empty-calendar-day">No hay servicios en este rango.</div>}
  </div>
}

function CalendarEvent({service,lead,onLead,draggable,expanded=false}:any){
  return <button className={`calendar-event ${slug(service.estado_operacion)} ${expanded?'expanded':''}`}
    draggable={draggable}
    onDragStart={e=>{e.stopPropagation();e.dataTransfer.setData('service',service.id);e.dataTransfer.effectAllowed='move'}}
    onClick={e=>{e.stopPropagation();lead&&onLead(lead)}}>
    {draggable&&expanded?<GripVertical size={13}/>:null}
    <span className="event-dot"/>
    <b>{service.producto}</b>
    {expanded&&<small>{lead?.reserva||'Lead'} · {service.numero_pax} pax</small>}
  </button>
}

function DetailedEvent({service,lead,onLead}:any){
  return <button className={`detailed-event ${slug(service.estado_operacion)}`} onClick={()=>lead&&onLead(lead)}>
    <div className="event-status-line"/>
    <div className="detailed-event-main"><strong>{service.producto}</strong><span>{lead?.reserva||'Lead'} · {lead?.codigo||''}</span></div>
    <div className="event-detail"><Users size={14}/><span>{service.numero_pax} pax</span></div>
    <div className="event-detail"><MapPin size={14}/><span>{lead?.empresa_ejecuta||'Sin hotel'}</span></div>
    <span className="status-badge neutral">{service.estado_operacion}</span>
  </button>
}

function startOfDay(d:Date){const x=new Date(d);x.setHours(0,0,0,0);return x}
function addDays(d:Date,n:number){const x=new Date(d);x.setDate(x.getDate()+n);return x}
function addMonths(d:Date,n:number){const x=new Date(d);x.setMonth(x.getMonth()+n);return x}
function startOfMonth(d:Date){return new Date(d.getFullYear(),d.getMonth(),1)}
function startOfWeek(d:Date){const x=startOfDay(d);const day=x.getDay()||7;x.setDate(x.getDate()-(day-1));return x}
function isoDate(d:Date){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function parseISO(s:string){const [y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)}
function isToday(d:Date){return isoDate(d)===isoDate(new Date())}
function monthYear(d:Date){return new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric'}).format(d)}
function weekdayShort(d:Date){return new Intl.DateTimeFormat('es-CL',{weekday:'short'}).format(d)}
function weekdayLong(d:Date){return new Intl.DateTimeFormat('es-CL',{weekday:'long'}).format(d)}
function longDate(d:Date){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'}).format(d)}
function periodLabel(d:Date,v:ViewMode){
  if(v==='month')return monthYear(d);
  if(v==='day')return longDate(d);
  if(v==='week'){const s=startOfWeek(d),e=addDays(s,6);return `${s.getDate()} ${new Intl.DateTimeFormat('es-CL',{month:'short'}).format(s)} – ${e.getDate()} ${new Intl.DateTimeFormat('es-CL',{month:'short',year:'numeric'}).format(e)}`}
  return 'Agenda operacional';
}
function slug(s:string){return String(s||'Pendiente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-')}
