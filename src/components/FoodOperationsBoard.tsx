import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,Clock3,Printer,Search,UtensilsCrossed} from 'lucide-react';
import {loadFoodBoard,updateFoodSegment,upsertFoodSegment} from '../lib/operationsApi';
import {FOOD_TYPES,foodOrder,moneyCLP,type FoodType} from '../lib/food';

export default function FoodOperationsBoard({date}:{date:string}){
  const [departures,setDepartures]=useState<any[]>([]);
  const [segments,setSegments]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [status,setStatus]=useState('Todos');
  const [saving,setSaving]=useState('');
  const [costDraft,setCostDraft]=useState<Record<string,string>>({});

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadFoodBoard(date);
      setDepartures(data.departures);
      setSegments(data.segments);
      const next:Record<string,string>={};
      for(const item of data.segments)next[`${item.departure_id}:${item.food_type}`]=String(Number(item.unit_cost||0)||'');
      setCostDraft(next);
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[date]);

  const segmentMap=useMemo(()=>new Map(segments.map(item=>[`${item.departure_id}:${item.food_type}`,item])),[segments]);
  const visible=useMemo(()=>departures.filter(departure=>{
    const q=query.trim().toLowerCase();
    if(q&&!String([departure.departure_code,departure.product_name,departure.modality].join(' ')).toLowerCase().includes(q))return false;
    if(status==='Todos')return true;
    const rows=FOOD_TYPES.map(type=>segmentMap.get(`${departure.id}:${type}`)).filter(Boolean);
    return rows.some((row:any)=>String(row.fulfillment_status||'Pendiente')===status);
  }),[departures,query,status,segmentMap]);

  const totals=useMemo(()=>{
    const totalCost=segments.reduce((sum,row)=>sum+Number(row.total_cost||0),0);
    const assigned=segments.reduce((sum,row)=>sum+Number(row.assigned_pax||0),0);
    return{tramos:departures.length,assigned,totalCost};
  },[departures,segments]);

  const saveSegment=async(departureId:string,type:FoodType,patch:any)=>{
    const key=`${departureId}:${type}`;setSaving(key);
    try{
      const existing=segmentMap.get(key);
      if(existing)await updateFoodSegment(existing.segment_id||existing.id,patch);
      else await upsertFoodSegment(departureId,type,patch);
      await load();
    }finally{setSaving('')}
  };
  const saveCost=async(departureId:string,type:FoodType)=>{
    const key=`${departureId}:${type}`;
    const value=Math.max(0,Number(String(costDraft[key]||'').replace(/\D/g,''))||0);
    await saveSegment(departureId,type,{unit_cost:value});
  };

  return <section className="food-board unified-food-board">
    <header className="workspace-titlebar">
      <div><span>ALIMENTACIÓN · INSUMOS POR TRAMO</span><h1>{longDate(date)}</h1><p>Un criterio único: Desayuno, Aperitivo, Almuerzo, Snack, Box lunch y Agua individual. El costo se controla por tramo; la asignación se completa por pasajero dentro de cada TOUR.</p></div>
      <div className="workspace-metrics">
        <Metric label="Tramos" value={totals.tramos}/><Metric label="Asignaciones pax" value={totals.assigned}/><Metric label="Costo total" value={moneyCLP(totals.totalCost)}/>
      </div>
    </header>

    <div className="workspace-toolbar">
      <label className="workspace-search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar TOUR o experiencia…"/></label>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option>Todos</option><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select>
      <button className="food-print-button" type="button" onClick={()=>window.print()}><Printer size={14}/> Imprimir informe</button>
    </div>

    {loading?<div className="workspace-empty">Cargando alimentación…</div>:<div className="food-tramo-list">
      {visible.map(departure=>{
        const rows=FOOD_TYPES.map(type=>({type,segment:segmentMap.get(`${departure.id}:${type}`)})).sort((a,b)=>foodOrder(a.type)-foodOrder(b.type));
        const subtotal=rows.reduce((sum,row)=>sum+Number(row.segment?.total_cost||0),0);
        return <article className="food-tramo-card" key={departure.id}>
          <header>
            <div><span>TRAMO / TOUR</span><h2>{departure.product_name}</h2><p>{departure.departure_code} · {departure.total_pax||0} pax · {modality(departure.modality)}</p></div>
            <div><small>Costo tramo</small><strong>{moneyCLP(subtotal)}</strong></div>
          </header>
          <div className="food-tramo-grid food-tramo-grid-head"><span>Alimentación</span><span>Pax</span><span>Costo p/pax</span><span>Subtotal</span><span>Estado</span></div>
          {rows.map(({type,segment})=>{
            const key=`${departure.id}:${type}`;
            const assigned=Number(segment?.assigned_pax||0);
            const unit=Number(segment?.unit_cost||0);
            return <div className="food-tramo-grid" key={type}>
              <span><b>{type}</b>{segment?.notes&&<small>{segment.notes}</small>}</span>
              <span><b>{assigned}/{departure.total_pax||0}</b></span>
              <span><input inputMode="numeric" value={costDraft[key]??String(unit||'')} onChange={e=>setCostDraft(current=>({...current,[key]:e.target.value.replace(/\D/g,'')}))} onBlur={()=>void saveCost(departure.id,type)} placeholder="0"/></span>
              <span><b>{moneyCLP(Number(segment?.total_cost||assigned*unit))}</b></span>
              <span><select disabled={saving===key} value={segment?.fulfillment_status||'Pendiente'} onChange={e=>void saveSegment(departure.id,type,{fulfillment_status:e.target.value})}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select></span>
            </div>
          })}
          <footer><UtensilsCrossed size={14}/><span>Asignación individual: abrir este TOUR → Alimentación y marcar lo correspondiente para cada pax.</span></footer>
        </article>
      })}
      {!visible.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay tours para esta fecha/filtro.</b></div>}
    </div>}
  </section>;
}

function Metric({label,value}:{label:string;value:number|string}){return <div><strong>{value}</strong><span>{label}</span></div>}
function parseDate(value:string){const [y,m,d]=value.split('-').map(Number);return new Date(y,m-1,d,12)}
function longDate(value:string){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'2-digit',month:'long',year:'numeric'}).format(parseDate(value))}
function modality(value:any){const key=String(value||'').toLowerCase();return key.includes('semi')?'Semiprivado':key.includes('priv')?'Privado':'Regular'}
