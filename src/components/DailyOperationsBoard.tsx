import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,RotateCcw,Search,Users} from 'lucide-react';
import type {Lead,LeadService,Passenger,ServiceAssignment,ServicePerson,Supplier,Vehicle} from '../types';
import {loadOperationsData,loadOperationsDirectory} from '../lib/api';

type Filter='all'|'transfer'|'am'|'pm'|'night'|'pending';
type OpsState={passengers:Passenger[];assignments:ServiceAssignment[];suppliers:Supplier[];vehicles:Vehicle[];people:ServicePerson[]};

export default function DailyOperationsBoard({date,leads,services,onOperation}:{date:string;leads:Lead[];services:LeadService[];onOperation:(service:LeadService)=>void}){
  const [ops,setOps]=useState<OpsState>({passengers:[],assignments:[],suppliers:[],vehicles:[],people:[]});
  const [filter,setFilter]=useState<Filter>('all');
  const [query,setQuery]=useState('');
  const [productFilter,setProductFilter]=useState('Todos');
  const [operatorFilter,setOperatorFilter]=useState('Todos');
  const [vehicleFilter,setVehicleFilter]=useState('Todos');
  const [hotelFilter,setHotelFilter]=useState('Todos');
  const [statusFilter,setStatusFilter]=useState('Todos');
  const [loading,setLoading]=useState(true);

  const load=async()=>{setLoading(true);try{const [core,directory]=await Promise.all([loadOperationsData(),loadOperationsDirectory()]);setOps({passengers:core.passengers||[],assignments:core.assignments||[],suppliers:core.suppliers||[],vehicles:core.vehicles||[],people:directory.people||[]})}finally{setLoading(false)}};
  useEffect(()=>{void load()},[]);

  const leadMap=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const assignmentMap=useMemo(()=>new Map(ops.assignments.map(a=>[a.lead_service_id,a])),[ops.assignments]);
  const supplierMap=useMemo(()=>new Map(ops.suppliers.map(s=>[s.id,s])),[ops.suppliers]);
  const vehicleMap=useMemo(()=>new Map(ops.vehicles.map(v=>[v.id,v])),[ops.vehicles]);
  const peopleMap=useMemo(()=>new Map(ops.people.map(p=>[p.id,p])),[ops.people]);
  const passengersByLead=useMemo(()=>{const map=new Map<string,Passenger[]>();for(const passenger of ops.passengers){const rows=map.get(passenger.lead_id)||[];rows.push(passenger);map.set(passenger.lead_id,rows)}for(const rows of map.values())rows.sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||a.passenger_code.localeCompare(b.passenger_code));return map},[ops.passengers]);

  const allRows=useMemo(()=>services.filter(s=>s.fecha_servicio===date&&String(s.estado_operacion||'')!=='Cancelado').map(service=>{
    const lead=leadMap.get(service.lead_id),assignment=assignmentMap.get(service.id),supplier=assignment?.supplier_id?supplierMap.get(assignment.supplier_id):undefined,vehicle=assignment?.vehicle_id?vehicleMap.get(assignment.vehicle_id):undefined,guide=assignment?.guide_person_id?peopleMap.get(assignment.guide_person_id):undefined,driver=assignment?.driver_person_id?peopleMap.get(assignment.driver_person_id):undefined,passengers=passengersByLead.get(service.lead_id)||[],start=String(assignment?.pickup_time||service.hora_inicio||'');
    return {service,lead,assignment,supplier,vehicle,guide,driver,passengers,start};
  }).sort((a,b)=>sortTime(a.start)-sortTime(b.start)||String(a.service.producto).localeCompare(String(b.service.producto))),[services,date,leadMap,assignmentMap,supplierMap,vehicleMap,peopleMap,passengersByLead]);

  const options=useMemo(()=>({products:unique(allRows.map(r=>r.service.producto)),operators:unique(allRows.map(r=>r.supplier?.name||'Operación interna')),vehicles:unique(allRows.map(r=>r.vehicle?.label||r.assignment?.vehicle_name_manual||'Sin vehículo')),hotels:unique(allRows.map(r=>r.lead?.empresa_ejecuta||'Sin hotel')),statuses:unique(allRows.map(r=>String(r.service.estado_operacion||'Pendiente')))}),[allRows]);

  const rows=useMemo(()=>{const q=query.trim().toLowerCase();return allRows.filter(row=>{
    const block=blockFor(row.service,row.start);
    if(filter==='transfer'&&!isTransfer(row.service))return false;if(filter==='am'&&block!=='am')return false;if(filter==='pm'&&block!=='pm')return false;if(filter==='night'&&block!=='night')return false;if(filter==='pending'&&['Coordinado','En curso','Completado'].includes(String(row.service.estado_operacion||'')))return false;
    if(productFilter!=='Todos'&&row.service.producto!==productFilter)return false;
    const operator=row.supplier?.name||'Operación interna';if(operatorFilter!=='Todos'&&operator!==operatorFilter)return false;
    const vehicle=row.vehicle?.label||row.assignment?.vehicle_name_manual||'Sin vehículo';if(vehicleFilter!=='Todos'&&vehicle!==vehicleFilter)return false;
    const hotel=row.lead?.empresa_ejecuta||'Sin hotel';if(hotelFilter!=='Todos'&&hotel!==hotelFilter)return false;
    if(statusFilter!=='Todos'&&String(row.service.estado_operacion||'Pendiente')!==statusFilter)return false;
    if(q){const names=row.passengers.map(p=>`${p.full_name} ${p.passenger_code} ${p.nationality||''} ${p.document_number||''}`).join(' ');const hay=[row.lead?.codigo,row.lead?.reserva,row.lead?.empresa_ejecuta,row.lead?.pickup_location,row.lead?.arrival_flight_number,row.lead?.departure_flight_number,row.service.service_code,row.service.tour_id,row.service.producto,row.service.modality,row.supplier?.supplier_code,row.supplier?.name,row.vehicle?.vehicle_code,row.vehicle?.label,row.vehicle?.plate,row.assignment?.operation_code,row.assignment?.meeting_point,row.assignment?.notes,row.guide?.person_code,row.guide?.full_name,row.driver?.person_code,row.driver?.full_name,names].join(' ').toLowerCase();if(!hay.includes(q))return false}
    return true;
  })},[allRows,filter,query,productFilter,operatorFilter,vehicleFilter,hotelFilter,statusFilter]);

  const metrics=useMemo(()=>({services:allRows.length,pax:allRows.reduce((sum,row)=>sum+Number(row.service.numero_pax||0),0),pending:allRows.filter(row=>!['Coordinado','En curso','Completado'].includes(String(row.service.estado_operacion||''))).length,active:allRows.filter(row=>String(row.service.estado_operacion)==='En curso').length}),[allRows]);
  const reset=()=>{setProductFilter('Todos');setOperatorFilter('Todos');setVehicleFilter('Todos');setHotelFilter('Todos');setStatusFilter('Todos');setQuery('');setFilter('all')};
  const hasExtraFilters=query||productFilter!=='Todos'||operatorFilter!=='Todos'||vehicleFilter!=='Todos'||hotelFilter!=='Todos'||statusFilter!=='Todos'||filter!=='all';

  return <div className="daily-ops-board"><aside className="daily-filter-rail"><FilterButton active={filter==='all'} onClick={()=>setFilter('all')} label="TODO" count={allRows.length}/><FilterButton active={filter==='transfer'} onClick={()=>setFilter('transfer')} label="TRF" count={allRows.filter(r=>isTransfer(r.service)).length}/><FilterButton active={filter==='am'} onClick={()=>setFilter('am')} label="AM" count={allRows.filter(r=>blockFor(r.service,r.start)==='am').length}/><FilterButton active={filter==='pm'} onClick={()=>setFilter('pm')} label="PM" count={allRows.filter(r=>blockFor(r.service,r.start)==='pm').length}/><FilterButton active={filter==='night'} onClick={()=>setFilter('night')} label="NOC" count={allRows.filter(r=>blockFor(r.service,r.start)==='night').length}/><FilterButton active={filter==='pending'} onClick={()=>setFilter('pending')} label="!" count={metrics.pending} warning/></aside>

    <section className="daily-program-area"><header className="daily-program-summary"><div><span>PROGRAMA</span><h1>{longDate(date)}</h1></div><div className="daily-metrics"><Metric value={metrics.services} label="Servicios"/><Metric value={metrics.pax} label="Pax"/><Metric value={metrics.pending} label="Por coordinar" warning={metrics.pending>0}/><Metric value={metrics.active} label="En curso"/></div></header>
      <div className="daily-toolbar data-aware"><div className="daily-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar código, pasajero, vuelo, producto, operador, guía, vehículo…"/></div><div className="daily-readout"><span>{rows.length}</span> visibles · <span>{allRows.length}</span> total</div></div>
      <div className="daily-data-filters"><FilterSelect label="Producto" value={productFilter} setValue={setProductFilter} options={options.products}/><FilterSelect label="Operador" value={operatorFilter} setValue={setOperatorFilter} options={options.operators}/><FilterSelect label="Vehículo" value={vehicleFilter} setValue={setVehicleFilter} options={options.vehicles}/><FilterSelect label="Hotel" value={hotelFilter} setValue={setHotelFilter} options={options.hotels}/><FilterSelect label="Estado" value={statusFilter} setValue={setStatusFilter} options={options.statuses}/>{hasExtraFilters&&<button className="filter-reset" onClick={reset}><RotateCcw size={13}/> Limpiar</button>}</div>
      {loading?<div className="daily-empty">Cargando recursos operacionales…</div>:<div className="daily-table-wrap"><table className="daily-ops-table"><thead><tr><th>Código</th><th>Cliente + acompañantes</th><th>Producto</th><th>Pax</th><th>Pick-up</th><th>Operador</th><th>Guía</th><th>Conductor</th><th>Vehículo</th><th>Estado</th><th>Notas</th></tr></thead><tbody>{rows.map(row=>{const primary=row.passengers.find(p=>p.is_primary)||row.passengers[0],companions=row.passengers.filter(p=>p.id!==primary?.id);return <tr key={row.service.id} onClick={()=>onOperation(row.service)}><td className="code-cell"><b>{row.service.service_code||row.lead?.codigo||'—'}</b><small>{row.lead?.codigo||'Sin código raíz'}</small></td><td className="passenger-cell"><strong>{primary?.full_name||row.lead?.reserva||'Cliente'}</strong><small>{primary?.passenger_code||'P01 pendiente'}{companions.length?` · +${companions.length} acompañante${companions.length>1?'s':''}`:''}</small>{companions.length>0&&<span>{companions.slice(0,2).map(p=>p.full_name).join(' · ')}{companions.length>2?` · +${companions.length-2}`:''}</span>}</td><td><strong>{row.service.producto}</strong><small>{row.service.tour_id||'Producto sin código catálogo'}{row.service.modality?` · ${row.service.modality}`:''}</small></td><td className="pax-cell"><Users size={14}/><b>{row.service.numero_pax||row.lead?.numero_pax||0}</b></td><td><strong>{timeLabel(row.start)}</strong><small>{row.assignment?.meeting_point||row.lead?.empresa_ejecuta||'Punto por confirmar'}</small></td><td><strong>{row.supplier?.name||'Operación interna'}</strong><small>{row.supplier?.supplier_code||row.assignment?.operation_code||'—'}</small></td><td><strong>{row.guide?.full_name||row.assignment?.guide_name||'—'}</strong><small>{row.guide?.person_code||'—'}</small></td><td><strong>{row.driver?.full_name||row.assignment?.driver_name||'—'}</strong><small>{row.driver?.person_code||'—'}</small></td><td><strong>{row.vehicle?.label||row.assignment?.vehicle_name_manual||'—'}</strong><small>{row.vehicle?.vehicle_code||row.vehicle?.plate||'—'}</small></td><td><StatusBadge status={String(row.service.estado_operacion||'Pendiente')}/></td><td className="notes-cell"><span>{row.assignment?.notes||row.service.observacion||'—'}</span></td></tr>})}</tbody></table>{!rows.length&&<div className="daily-empty"><CheckCircle2 size={22}/><strong>No hay servicios para este filtro.</strong><span>Cambia filtros o fecha. La búsqueda revisa códigos, pasajeros, vuelos y asignaciones reales.</span></div>}</div>}
    </section>
  </div>;
}
function FilterSelect({label,value,setValue,options}:{label:string;value:string;setValue:(value:string)=>void;options:string[]}){return <label><span>{label}</span><select value={value} onChange={e=>setValue(e.target.value)}><option>Todos</option>{options.map(option=><option key={option}>{option}</option>)}</select></label>}
function FilterButton({active,onClick,label,count,warning}:{active:boolean;onClick:()=>void;label:string;count:number;warning?:boolean}){return <button className={`${active?'active ':''}${warning&&count?'warning':''}`} onClick={onClick}><b>{label}</b><span>{count}</span></button>}
function Metric({value,label,warning}:{value:number;label:string;warning?:boolean}){return <div className={warning?'warning':''}><strong>{value}</strong><span>{label}</span></div>}
function StatusBadge({status}:{status:string}){const key=status.toLowerCase().replace(/\s+/g,'-');return <span className={`daily-status ${key}`}>{status==='Pendiente'?<AlertTriangle size={12}/>:status==='En curso'?<Clock3 size={12}/>:<CheckCircle2 size={12}/>} {status}</span>}
function unique(values:(string|undefined)[]){return [...new Set(values.filter(Boolean) as string[])].sort((a,b)=>a.localeCompare(b,'es'))}
function isTransfer(service:LeadService){return /transfer|trf|aeropuerto/i.test(`${service.service_type||''} ${service.producto||''}`)}
function blockFor(service:LeadService,start:string):'am'|'pm'|'night'|'unknown'{const explicit=String(service.time_block||'').toLowerCase();if(explicit.includes('am'))return'am';if(explicit.includes('pm'))return'pm';if(explicit.includes('noc')||explicit.includes('night'))return'night';const hour=Number(String(start||'').slice(0,2));if(Number.isNaN(hour))return'unknown';if(hour<13)return'am';if(hour<19)return'pm';return'night'}
function sortTime(value:string){const [h='99',m='99']=String(value||'').split(':');return Number(h)*60+Number(m)}
function timeLabel(value:string){return value?String(value).slice(0,5):'—'}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12)}
function longDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(parseDate(value))}
