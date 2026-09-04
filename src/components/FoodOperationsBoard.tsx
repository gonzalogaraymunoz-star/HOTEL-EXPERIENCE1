import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Clock3,Search,UtensilsCrossed} from 'lucide-react';
import {loadFoodBoard,updateResourceFulfillment} from '../lib/operationsApi';

export default function FoodOperationsBoard({date}:{date:string}){
  const [rows,setRows]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('Todos');
  const [saving,setSaving]=useState<string|null>(null);

  const load=async()=>{
    setLoading(true);
    try{setRows(await loadFoodBoard(date));}finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[date]);

  const filtered=useMemo(()=>rows.filter(row=>{
    if(status!=='Todos'&&String(row.fulfillment_status||'Pendiente')!==status)return false;
    const q=query.trim().toLowerCase();
    if(!q)return true;
    return [row.lead_code,row.lead_name,row.service_code,row.producto,row.resource_code,row.resource_name,row.hotel,row.meeting_point,row.notes]
      .join(' ').toLowerCase().includes(q);
  }),[rows,query,status]);

  const metrics=useMemo(()=>({
    total:rows.reduce((sum,row)=>sum+Number(row.quantity||0),0),
    pending:rows.filter(row=>String(row.fulfillment_status||'Pendiente')==='Pendiente').length,
    prepared:rows.filter(row=>row.fulfillment_status==='Preparado').length,
    delivered:rows.filter(row=>row.fulfillment_status==='Entregado').length
  }),[rows]);

  const changeStatus=async(id:string,next:string)=>{
    setSaving(id);
    try{await updateResourceFulfillment(id,next);await load();}finally{setSaving(null)}
  };

  return <section className="food-board">
    <header className="workspace-titlebar">
      <div><span>ALIMENTACIÓN</span><h1>{longDate(date)}</h1><p>Todo insumo cuyo tipo sea Alimentación entra automáticamente en este tablero.</p></div>
      <div className="workspace-metrics">
        <Metric label="Unidades" value={metrics.total}/><Metric label="Pendientes" value={metrics.pending}/><Metric label="Preparados" value={metrics.prepared}/><Metric label="Entregados" value={metrics.delivered}/>
      </div>
    </header>

    <div className="workspace-toolbar">
      <label className="workspace-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar código, pasajero, servicio, alimento, hotel…"/></label>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>Todos</option><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select>
    </div>

    {loading?<div className="workspace-empty">Cargando alimentación…</div>:<div className="workspace-table-scroll">
      <table className="workspace-table food-table">
        <thead><tr><th>Servicio</th><th>Cliente</th><th>Alimentación</th><th>Cant.</th><th>Pick-up</th><th>Hotel / Punto</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>{filtered.map(row=><tr key={row.assignment_id}>
          <td><b>{row.producto}</b><small>{row.service_code||'Sin código servicio'}</small></td>
          <td><b>{row.lead_name}</b><small>{row.lead_code}</small></td>
          <td><b>{row.resource_name}</b><small>{row.resource_code||row.resource_type}</small>{row.notes&&<span>{row.notes}</span>}</td>
          <td><b>{row.quantity}</b></td>
          <td><b>{time(row.pickup_time||row.hora_inicio)}</b></td>
          <td><b>{row.hotel||'—'}</b><small>{row.meeting_point||'Sin punto informado'}</small></td>
          <td><FoodStatus status={row.fulfillment_status||'Pendiente'}/></td>
          <td><select disabled={saving===row.assignment_id} value={row.fulfillment_status||'Pendiente'} onChange={e=>void changeStatus(row.assignment_id,e.target.value)}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select></td>
        </tr>)}</tbody>
      </table>
      {!filtered.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay alimentación para esta fecha/filtro.</b><span>Asigna un recurso con tipo “Alimentación” a un servicio y aparecerá aquí.</span></div>}
    </div>}
  </section>;
}

function Metric({label,value}:{label:string;value:number}){return <div><strong>{value}</strong><span>{label}</span></div>}
function FoodStatus({status}:{status:string}){return <span className={`food-status ${status.toLowerCase()}`}>{status==='Pendiente'?<Clock3 size={12}/>:<CheckCircle2 size={12}/>} {status}</span>}
function time(value:any){return value?String(value).slice(0,5):'—'}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12)}
function longDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(parseDate(value))}
