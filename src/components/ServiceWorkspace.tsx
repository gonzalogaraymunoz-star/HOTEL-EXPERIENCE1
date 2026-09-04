import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,CalendarDays,ClipboardList,Pencil,RefreshCw,Save,Users,UtensilsCrossed,Wrench,X} from 'lucide-react';
import type {Lead,LeadService,OperationalResource,Passenger,ServiceAssignment,ServicePerson,ServiceResourceAssignment,Supplier,Vehicle} from '../types';
import {loadServiceWorkspaceData,updatePassengerOperationalData,updateResourceFulfillment} from '../lib/operationsApi';
import ServiceAssignmentWorkspace from './ServiceAssignmentWorkspace';
import CustomerItineraryPreview from './CustomerItineraryPreview';
import './PassengerEditor.css';

export type ServiceWorkspaceTab='summary'|'assignments'|'passengers'|'food'|'itinerary';

export default function ServiceWorkspace({lead,service,userRole,onClose,onChanged,initialTab='summary'}:{lead:Lead;service:LeadService;userRole:string;onClose:()=>void;onChanged:()=>void;initialTab?:ServiceWorkspaceTab}){
  const [tab,setTab]=useState<ServiceWorkspaceTab>(initialTab);
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const load=async()=>{setLoading(true);try{setData(await loadServiceWorkspaceData(lead.id,service.id));}finally{setLoading(false)}};
  useEffect(()=>{void load()},[lead.id,service.id]);
  useEffect(()=>{setTab(initialTab)},[service.id,initialTab]);
  const refreshed=()=>{void load();onChanged()};

  const assignment=(data?.assignment||null) as ServiceAssignment|null;
  const supplier=(data?.suppliers||[]).find((item:Supplier)=>item.id===assignment?.supplier_id) as Supplier|undefined;
  const vehicle=(data?.vehicles||[]).find((item:Vehicle)=>item.id===assignment?.vehicle_id) as Vehicle|undefined;
  const people=(data?.people||[]) as ServicePerson[];
  const guide=people.find(item=>item.id===assignment?.guide_person_id);
  const driver=people.find(item=>item.id===assignment?.driver_person_id);
  const passengers=(data?.passengers||[]) as Passenger[];
  const resources=(data?.resources||[]) as OperationalResource[];
  const resourceAssignments=(data?.resourceAssignments||[]) as ServiceResourceAssignment[];
  const food=useMemo(()=>resourceAssignments.map(item=>({assignment:item,resource:resources.find(resource=>resource.id===item.resource_id)})).filter(item=>isFood(item.resource?.resource_type)),[resourceAssignments,resources]);
  const itinerary=(data?.services||[]) as LeadService[];

  return <div className="service-workspace-overlay">
    <section className="service-workspace">
      <header className="service-workspace-topbar">
        <div className="service-workspace-identity"><button onClick={onClose} title="Volver al programa"><ArrowLeft size={19}/></button><div><span>{service.service_code||lead.codigo}</span><h1>{service.producto}</h1><p>{lead.reserva} · {service.numero_pax} pax{lead.empresa_ejecuta?` · ${lead.empresa_ejecuta}`:''}</p></div></div>
        <div className="service-workspace-actions"><button onClick={()=>void load()}><RefreshCw size={16}/> Actualizar</button><span className={`daily-status ${slug(service.estado_operacion)}`}>{service.estado_operacion}</span></div>
      </header>

      <nav className="service-tabs">
        <TabButton active={tab==='summary'} icon={<ClipboardList/>} onClick={()=>setTab('summary')}>Resumen</TabButton>
        <TabButton active={tab==='assignments'} icon={<Wrench/>} onClick={()=>setTab('assignments')}>Asignaciones</TabButton>
        <TabButton active={tab==='passengers'} icon={<Users/>} onClick={()=>setTab('passengers')}>Pasajeros</TabButton>
        <TabButton active={tab==='food'} icon={<UtensilsCrossed/>} onClick={()=>setTab('food')}>Alimentación <em>{food.length}</em></TabButton>
        <TabButton active={tab==='itinerary'} icon={<CalendarDays/>} onClick={()=>setTab('itinerary')}>Itinerario</TabButton>
      </nav>

      <main className="service-workspace-body">
        {loading?<div className="workspace-empty">Cargando servicio…</div>:<>
          {tab==='summary'&&<Summary lead={lead} service={service} passengers={passengers} assignment={assignment} supplier={supplier} vehicle={vehicle} guide={guide} driver={driver}/>} 
          {tab==='assignments'&&<ServiceAssignmentWorkspace lead={lead} service={service} userRole={userRole} onChanged={refreshed}/>} 
          {tab==='passengers'&&<PassengerPanel passengers={passengers} expected={service.numero_pax} onChanged={refreshed}/>} 
          {tab==='food'&&<FoodPanel rows={food} service={service} onChanged={refreshed}/>} 
          {tab==='itinerary'&&<CustomerItineraryPreview lead={lead} services={itinerary} passengers={passengers} compact/>} 
        </>}
      </main>
    </section>
  </div>;
}

function Summary({lead,service,passengers,assignment,supplier,vehicle,guide,driver}:{lead:Lead;service:LeadService;passengers:Passenger[];assignment:ServiceAssignment|null;supplier?:Supplier;vehicle?:Vehicle;guide?:ServicePerson;driver?:ServicePerson}){
  const transfer=/transfer|trf|aeropuerto/i.test(`${service.service_type||''} ${service.producto}`);
  const flight=transfer?(lead.departure_flight_number||lead.arrival_flight_number||service.external_booking_ref):null;
  return <div className="service-summary-layout">
    <section className="service-hero-card">
      <div className="service-hero-main"><span>{service.service_code||'SERVICIO'}</span><h2>{service.producto}</h2><div className="service-time-big">{time(assignment?.pickup_time||service.hora_inicio)} <small>hrs</small></div><p>{service.modality||'Modalidad no informada'} · {service.numero_pax} pax</p></div>
      <div className="service-hero-facts"><Fact label="Fecha" value={dateLabel(service.fecha_servicio)}/><Fact label="Hotel / origen" value={lead.empresa_ejecuta||lead.pickup_location||'—'}/>{transfer&&<Fact label="Vuelo / referencia" value={flight||'—'}/>}<Fact label="Punto" value={assignment?.meeting_point||'—'}/></div>
    </section>

    <section className="service-assignment-strip">
      <Fact label="Operador" value={supplier?.name||'Operación interna'}/><Fact label="Guía" value={guide?.full_name||assignment?.guide_name||'—'}/><Fact label="Conductor" value={driver?.full_name||assignment?.driver_name||'—'}/><Fact label="Vehículo" value={vehicle?`${vehicle.label}${vehicle.plate?` · ${vehicle.plate}`:''}`:assignment?.vehicle_name_manual||'—'}/>
    </section>

    <section className="service-passenger-summary">
      <header><div><span>PASAJEROS</span><h3>{passengers.length} registrados · {service.numero_pax} esperados</h3></div></header>
      <table className="workspace-table compact-table"><thead><tr><th>#</th><th>Código</th><th>Nombre</th><th>País</th><th>Documento</th><th>Notas operacionales</th></tr></thead><tbody>{passengers.map((p,index)=><tr key={p.id}><td>{index+1}</td><td><b>{p.passenger_code}</b></td><td><b>{p.full_name}</b></td><td>{p.nationality||'—'}</td><td>{p.document_number||'—'}</td><td>{[p.dietary_restrictions,p.medical_notes,p.disability_type].filter(Boolean).join(' · ')||'—'}</td></tr>)}</tbody></table>
      {!passengers.length&&<div className="workspace-empty compact">No hay pasajeros individuales cargados todavía.</div>}
    </section>
  </div>;
}

type PassengerDraft={
  full_name:string;email:string;phone:string;nationality:string;document_type:string;document_number:string;birth_date:string;
  dietary_restrictions:string;medical_notes:string;disability_type:string;
};

function passengerDraft(passenger:Passenger):PassengerDraft{return{
  full_name:passenger.full_name||'',
  email:passenger.email||'',
  phone:passenger.phone||'',
  nationality:passenger.nationality||'',
  document_type:passenger.document_type||'Pasaporte',
  document_number:passenger.document_number||'',
  birth_date:passenger.birth_date?String(passenger.birth_date).slice(0,10):'',
  dietary_restrictions:passenger.dietary_restrictions||'',
  medical_notes:passenger.medical_notes||'',
  disability_type:passenger.disability_type||''
}}

function PassengerPanel({passengers,expected,onChanged}:{passengers:Passenger[];expected:number;onChanged:()=>void}){
  const [editingId,setEditingId]=useState<string|null>(null);
  const [draft,setDraft]=useState<PassengerDraft|null>(null);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const active=passengers.find(item=>item.id===editingId)||null;

  const begin=(passenger:Passenger)=>{setEditingId(passenger.id);setDraft(passengerDraft(passenger));setMessage('')};
  const cancel=()=>{setEditingId(null);setDraft(null);setMessage('')};
  const patch=(key:keyof PassengerDraft,value:string)=>setDraft(current=>current?{...current,[key]:value}:current);
  const save=async()=>{
    if(!editingId||!draft)return;
    setSaving(true);setMessage('');
    try{
      await updatePassengerOperationalData(editingId,draft);
      setMessage('Datos del pasajero guardados.');
      setEditingId(null);setDraft(null);
      onChanged();
    }catch(error:any){setMessage(error?.message||'No se pudieron guardar los datos del pasajero.')}finally{setSaving(false)}
  };

  return <section className="panel-page passenger-panel-page">
    <header className="panel-page-head"><div><span>LISTA NOMINAL</span><h2>Pasajeros · {passengers.length}/{expected}</h2><p>Estos son los mismos pasajeros de la reserva. Puedes completar aquí los datos faltantes sin crear registros duplicados.</p></div></header>
    <div className="workspace-table-scroll"><table className="workspace-table passenger-data-table"><thead><tr><th>Código</th><th>Nombre</th><th>Nacionalidad</th><th>Nacimiento</th><th>Documento</th><th>Contacto</th><th>Observaciones</th><th></th></tr></thead><tbody>{passengers.map(p=><tr key={p.id} className={editingId===p.id?'is-editing':''}><td><b>{p.passenger_code}</b></td><td><b>{p.full_name}</b>{p.is_primary&&<small>Principal</small>}</td><td>{p.nationality||'—'}</td><td>{p.birth_date||'—'}</td><td>{[p.document_type,p.document_number].filter(Boolean).join(' · ')||'—'}</td><td>{[p.phone,p.email].filter(Boolean).join(' · ')||'—'}</td><td>{[p.dietary_restrictions,p.medical_notes,p.disability_type].filter(Boolean).join(' · ')||'—'}</td><td><button className="passenger-edit-button" type="button" onClick={()=>begin(p)}><Pencil size={13}/> Editar</button></td></tr>)}</tbody></table></div>
    {!passengers.length&&<div className="workspace-empty compact">No hay pasajeros individuales cargados todavía.</div>}

    {active&&draft&&<section className="passenger-editor-card" aria-label={`Editar ${active.full_name}`}>
      <header><div><span>COMPLETAR PASAJERO</span><h3>{active.full_name||active.passenger_code}</h3><p>{active.passenger_code} · completa solo información real y disponible.</p></div><button className="passenger-close-button" type="button" onClick={cancel} aria-label="Cerrar editor"><X size={17}/></button></header>
      <div className="passenger-editor-grid">
        <label><span>Nombre completo</span><input value={draft.full_name} onChange={e=>patch('full_name',e.target.value)}/></label>
        <label><span>Nacionalidad</span><input value={draft.nationality} onChange={e=>patch('nationality',e.target.value)} placeholder="Ej. Chilena"/></label>
        <label><span>Fecha de nacimiento</span><input type="date" value={draft.birth_date} onChange={e=>patch('birth_date',e.target.value)}/></label>
        <label><span>Tipo de documento</span><select value={draft.document_type} onChange={e=>patch('document_type',e.target.value)}><option>Pasaporte</option><option>Cédula</option><option>DNI</option><option>Otro</option></select></label>
        <label><span>Número de documento</span><input value={draft.document_number} onChange={e=>patch('document_number',e.target.value)}/></label>
        <label><span>Teléfono</span><input value={draft.phone} onChange={e=>patch('phone',e.target.value)} placeholder="+56…"/></label>
        <label><span>Email</span><input type="email" value={draft.email} onChange={e=>patch('email',e.target.value)}/></label>
        <label><span>Restricciones alimentarias</span><input value={draft.dietary_restrictions} onChange={e=>patch('dietary_restrictions',e.target.value)} placeholder="Alergias, vegetariano, etc."/></label>
        <label className="wide"><span>Notas médicas / operacionales</span><textarea value={draft.medical_notes} onChange={e=>patch('medical_notes',e.target.value)} placeholder="Solo información necesaria para operar el servicio."/></label>
        <label className="wide"><span>Accesibilidad / discapacidad</span><textarea value={draft.disability_type} onChange={e=>patch('disability_type',e.target.value)} placeholder="Silla de ruedas, movilidad reducida u otra necesidad relevante."/></label>
      </div>
      <footer><div>{message&&<span className="passenger-save-message">{message}</span>}</div><div><button className="passenger-secondary-button" type="button" onClick={cancel} disabled={saving}>Cancelar</button><button className="passenger-primary-button" type="button" onClick={()=>void save()} disabled={saving}><Save size={14}/>{saving?'Guardando…':'Guardar datos'}</button></div></footer>
    </section>}
    {!active&&message&&<div className="passenger-global-message">{message}</div>}
  </section>
}

function FoodPanel({rows,service,onChanged}:{rows:{assignment:ServiceResourceAssignment;resource?:OperationalResource}[];service:LeadService;onChanged:()=>void}){
  const [saving,setSaving]=useState<string|null>(null);
  const update=async(id:string,status:string)=>{setSaving(id);try{await updateResourceFulfillment(id,status);onChanged();}finally{setSaving(null)}};
  return <section className="panel-page"><header className="panel-page-head"><div><span>ALIMENTACIÓN DEL SERVICIO</span><h2>{service.producto}</h2><p>Se completa automáticamente desde los insumos clasificados como Alimentación.</p></div></header><div className="workspace-table-scroll"><table className="workspace-table"><thead><tr><th>Código</th><th>Ítem</th><th>Cantidad</th><th>Nota</th><th>Estado</th></tr></thead><tbody>{rows.map(({assignment,resource})=><tr key={assignment.id}><td><b>{resource?.code||'—'}</b></td><td><b>{resource?.name||'Recurso'}</b></td><td>{assignment.quantity}</td><td>{assignment.notes||'—'}</td><td><select disabled={saving===assignment.id} value={assignment.fulfillment_status||'Pendiente'} onChange={e=>void update(assignment.id,e.target.value)}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select></td></tr>)}</tbody></table>{!rows.length&&<div className="workspace-empty">No hay alimentación asignada a este servicio.</div>}</div></section>}

function Fact({label,value}:{label:string;value:string}){return <div className="service-fact"><span>{label}</span><b>{value}</b></div>}
function TabButton({active,icon,onClick,children}:{active:boolean;icon:React.ReactNode;onClick:()=>void;children:React.ReactNode}){return <button className={active?'active':''} onClick={onClick}>{icon}<span>{children}</span></button>}
function isFood(value:any){return ['alimentación','alimentacion','food','alimentos'].includes(String(value||'').trim().toLowerCase())}
function time(value:any){return value?String(value).slice(0,5):'—'}
function dateLabel(value:any){if(!value)return'—';const [y,m,d]=String(value).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('es-CL',{weekday:'short',day:'2-digit',month:'short'}).format(new Date(y,m-1,d,12))}
function slug(value:any){return String(value||'Pendiente').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,'-')}
