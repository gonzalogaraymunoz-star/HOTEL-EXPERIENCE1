import React,{useEffect,useMemo,useState} from 'react';
import {Printer,Search,UtensilsCrossed} from 'lucide-react';
import type {FoodConsumptionType} from '../types';
import {loadFoodBoard,updateFoodSegment,upsertFoodSegment} from '../lib/operationsApi';
import {FOOD_TYPES,consumptionLabel,foodOrder,type FoodType} from '../lib/food';

export default function FoodOperationsBoard({date}:{date:string}){
  const [departures,setDepartures]=useState<any[]>([]);
  const [segments,setSegments]=useState<any[]>([]);
  const [assignments,setAssignments]=useState<any[]>([]);
  const [consumptionTypes,setConsumptionTypes]=useState<FoodConsumptionType[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('Todos');
  const [saving,setSaving]=useState('');

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadFoodBoard(date);
      setDepartures(data.departures);
      setSegments(data.segments);
      setAssignments(data.assignments);
      setConsumptionTypes(data.consumptionTypes);
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[date]);

  const segmentMap=useMemo(()=>new Map(segments.map(item=>[String(item.departure_id)+':'+String(item.food_type),item])),[segments]);
  const assignmentsBySegment=useMemo(()=>{
    const map=new Map<string,any[]>();
    for(const item of assignments){
      const rows=map.get(item.segment_id)||[];
      rows.push(item);
      map.set(item.segment_id,rows);
    }
    return map;
  },[assignments]);

  const visible=useMemo(()=>departures.filter(departure=>{
    const q=query.trim().toLowerCase();
    if(q&&!String([departure.departure_code,departure.product_name,departure.modality].join(' ')).toLowerCase().includes(q))return false;
    if(status==='Todos')return true;
    const rows=FOOD_TYPES.map(type=>segmentMap.get(String(departure.id)+':'+String(type))).filter(Boolean);
    return rows.some((row:any)=>String(row.fulfillment_status||'Pendiente')===status);
  }),[departures,query,status,segmentMap]);

  const totals=useMemo(()=>({
    tramos:departures.length,
    pax:departures.reduce((sum,row)=>sum+Number(row.total_pax||0),0),
    definidos:assignments.length,
  }),[departures,assignments]);

  const saveSegment=async(departureId:string,type:FoodType,patch:any)=>{
    const key=departureId+':'+type;
    setSaving(key);
    try{
      const existing=segmentMap.get(key);
      if(existing)await updateFoodSegment((existing as any).segment_id||(existing as any).id,patch);
      else await upsertFoodSegment(departureId,type,patch);
      await load();
    }finally{setSaving('')}
  };

  const profileSummary=(rows:any[])=>{
    if(!rows.length)return 'Sin definir';
    const counts=new Map<string,number>();
    for(const row of rows){
      const key=String(row.consumption_type||'standard');
      counts.set(key,(counts.get(key)||0)+1);
    }
    return Array.from(counts.entries()).map(([key,count])=>consumptionLabel(key,consumptionTypes)+' ×'+count).join(' · ');
  };

  return <section className="food-board unified-food-board">
    <header className="workspace-titlebar">
      <div><span>ALIMENTACIÓN · PLAN OPERATIVO POR TOUR</span><h1>{longDate(date)}</h1><p>Define qué recibe cada pasajero y su tipo de consumo. Los precios y costos se gestionan fuera de esta pantalla.</p></div>
      <div className="workspace-metrics">
        <Metric label="Tours" value={totals.tramos}/><Metric label="Pax del día" value={totals.pax}/><Metric label="Perfiles definidos" value={totals.definidos}/>
      </div>
    </header>

    <div className="workspace-toolbar">
      <label className="workspace-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar TOUR o experiencia…"/></label>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>Todos</option><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select>
      <button className="food-print-button" type="button" onClick={()=>window.print()}><Printer size={14}/> Imprimir plan</button>
    </div>

    {loading?<div className="workspace-empty">Cargando alimentación…</div>:<div className="food-tramo-list">
      {visible.map(departure=>{
        const rows=FOOD_TYPES.map(type=>({type,segment:segmentMap.get(String(departure.id)+':'+String(type))})).sort((a,b)=>foodOrder(a.type)-foodOrder(b.type));
        const profiles=rows.flatMap(row=>row.segment?(assignmentsBySegment.get((row.segment as any).segment_id||(row.segment as any).id)||[]):[]);
        return <article className="food-tramo-card" key={departure.id}>
          <header>
            <div><span>TOUR</span><h2>{departure.product_name}</h2><p>{departure.departure_code} · {departure.total_pax||0} pax · {modality(departure.modality)}</p></div>
            <div><small>Perfiles cargados</small><strong>{profiles.length}</strong></div>
          </header>
          <div className="food-tramo-grid food-tramo-grid-head"><span>Momento</span><span>Pax</span><span>Tipo de consumo</span><span>Observación</span><span>Estado</span></div>
          {rows.map(({type,segment})=>{
            const key=String(departure.id)+':'+String(type);
            const rowAssignments=segment?(assignmentsBySegment.get((segment as any).segment_id||(segment as any).id)||[]):[];
            const consuming=rowAssignments.filter((item:any)=>String(item.consumption_type||'standard')!=='none').length;
            return <div className="food-tramo-grid" key={type}>
              <span><b>{type}</b></span>
              <span><b>{consuming}/{departure.total_pax||0}</b><small>{rowAssignments.length?String(rowAssignments.length)+' definidos':'Sin definir'}</small></span>
              <span><b>{profileSummary(rowAssignments)}</b></span>
              <span>{(segment as any)?.notes||'—'}</span>
              <span><select disabled={saving===key} value={(segment as any)?.fulfillment_status||'Pendiente'} onChange={e=>void saveSegment(departure.id,type,{fulfillment_status:e.target.value})}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select></span>
            </div>
          })}
          <footer><UtensilsCrossed size={14}/><span>Abre este TOUR → Alimentación para definir el consumo de cada pasajero.</span></footer>
        </article>
      })}
      {!visible.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay pasajeros confirmados que alimentar para esta fecha.</b><span>Los tours aparecen aquí cuando tienen reservas y pax operacionales.</span></div>}
    </div>}
  </section>;
}

function Metric({label,value}:{label:string;value:number|string}){return <div><strong>{value}</strong><span>{label}</span></div>}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12)}
function longDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(parseDate(value))}
function modality(value:any){const key=String(value||'').toLowerCase();return key.includes('semi')?'Semiprivado':key.includes('priv')?'Privado':'Regular'}
