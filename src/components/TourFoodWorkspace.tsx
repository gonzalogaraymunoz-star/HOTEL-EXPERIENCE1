import React,{useEffect,useMemo,useState} from 'react';
import {LoaderCircle,UtensilsCrossed} from 'lucide-react';
import type {FoodConsumptionType,Lead,Passenger,TourDeparture,TourFoodPassenger,TourFoodSegment} from '../types';
import {DEFAULT_CONSUMPTION_TYPES,FOOD_TYPES,consumptionLabel,foodOrder,type FoodType} from '../lib/food';
import {loadDepartureFood,setPassengerFoodConsumption,updateFoodSegment,upsertFoodSegment} from '../lib/operationsApi';
import './TourFoodWorkspace.css';

export default function TourFoodWorkspace({
  departure,passengers,reservations,onChanged
}:{
  departure:TourDeparture;
  passengers:Passenger[];
  reservations:Lead[];
  onChanged:()=>void;
}){
  const [segments,setSegments]=useState<TourFoodSegment[]>([]);
  const [assignments,setAssignments]=useState<TourFoodPassenger[]>([]);
  const [consumptionTypes,setConsumptionTypes]=useState<FoodConsumptionType[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState('');
  const [noteDraft,setNoteDraft]=useState<Record<string,string>>({});

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadDepartureFood(departure.id);
      const ordered=[...data.segments].sort((a,b)=>foodOrder(a.food_type)-foodOrder(b.food_type));
      setSegments(ordered);
      setAssignments(data.assignments);
      setConsumptionTypes(data.consumptionTypes||[]);
      setNoteDraft(Object.fromEntries(ordered.map(item=>[item.food_type,item.notes||''])));
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[departure.id]);

  const catalog=useMemo<FoodConsumptionType[]>(()=>{
    if(consumptionTypes.length)return consumptionTypes;
    return DEFAULT_CONSUMPTION_TYPES.map((item,index)=>({key:item.key,label:item.label,active:true,sort_order:(index+1)*10}));
  },[consumptionTypes]);

  const segmentByType=useMemo(()=>new Map(segments.map(item=>[item.food_type,item])),[segments]);
  const assignmentMap=useMemo(()=>{
    const map=new Map<string,TourFoodPassenger>();
    for(const item of assignments)map.set(item.segment_id+':'+item.passenger_id,item);
    return map;
  },[assignments]);

  const assignmentFor=(type:string,passengerId:string)=>{
    const segment=segmentByType.get(type);
    return segment?assignmentMap.get(segment.id+':'+passengerId):undefined;
  };
  const rowsForType=(type:string)=>{
    const segment=segmentByType.get(type);
    return segment?assignments.filter(item=>item.segment_id===segment.id):[];
  };
  const consumingCount=(type:string)=>rowsForType(type).filter(item=>String(item.consumption_type||'standard')!=='none').length;

  const setConsumption=async(type:FoodType,passengerId:string,value:string)=>{
    const key=type+':'+passengerId;
    setSaving(key);
    try{
      await setPassengerFoodConsumption(departure.id,type,passengerId,value||null);
      await load();
      onChanged();
    }finally{setSaving('')}
  };

  const saveSegment=async(type:FoodType,patch:Partial<TourFoodSegment>)=>{
    setSaving('segment:'+type);
    try{
      const existing=segmentByType.get(type);
      if(existing)await updateFoodSegment(existing.id,patch);
      else await upsertFoodSegment(departure.id,type,patch);
      await load();
      onChanged();
    }finally{setSaving('')}
  };
  const saveNote=async(type:FoodType)=>saveSegment(type,{notes:(noteDraft[type]||'').trim()||null});

  const setPendingStandard=async(type:FoodType)=>{
    const pending=passengers.filter(passenger=>!assignmentFor(type,passenger.id));
    if(!pending.length)return;
    setSaving('all:'+type);
    try{
      for(const passenger of pending)await setPassengerFoodConsumption(departure.id,type,passenger.id,'standard');
      await load();
      onChanged();
    }finally{setSaving('')}
  };

  const summary=(type:string)=>{
    const rows=rowsForType(type);
    if(!rows.length)return [] as {key:string;label:string;count:number}[];
    const counts=new Map<string,number>();
    for(const row of rows){
      const key=String(row.consumption_type||'standard');
      counts.set(key,(counts.get(key)||0)+1);
    }
    return Array.from(counts.entries()).map(([key,count])=>({key,label:consumptionLabel(key,catalog),count}));
  };

  if(loading)return <div className="workspace-empty">Cargando alimentación del tour…</div>;

  return <section className="tour-food-workspace">
    <header className="tour-food-head">
      <div>
        <span>ALIMENTACIÓN · PLAN POR PASAJERO</span>
        <h2>{departure.product_name}</h2>
        <p>Aquí Operaciones define qué consume cada pasajero. El costeo queda fuera de esta pantalla.</p>
      </div>
      <div className="tour-food-total"><small>Pax del tour</small><strong>{passengers.length}</strong><span>{assignments.length} perfiles de consumo definidos</span></div>
    </header>

    <div className="tour-food-segments">
      {FOOD_TYPES.map(type=>{
        const segment=segmentByType.get(type);
        const rows=rowsForType(type);
        const consuming=consumingCount(type);
        const busy=saving==='segment:'+type||saving==='all:'+type;
        const pending=Math.max(0,passengers.length-rows.length);
        return <article key={type} className={rows.length?'food-segment-card active':'food-segment-card'}>
          <header><div><span>MOMENTO DE ALIMENTACIÓN</span><h3>{type}</h3></div><b>{consuming}/{passengers.length} consumen</b></header>

          <div className="food-consumption-summary">
            <span>TIPOS DEFINIDOS</span>
            <div>{summary(type).length?summary(type).map(item=><b key={item.key}>{item.label} ×{item.count}</b>):<small>Sin definir todavía</small>}</div>
          </div>

          <label className="food-segment-note"><span>Observación general del tramo</span><input value={noteDraft[type]??segment?.notes??''} onChange={e=>setNoteDraft(current=>({...current,[type]:e.target.value}))} onBlur={()=>void saveNote(type)} placeholder="Ej. retiro 05:30 · proveedor · preparación…"/></label>

          <footer>
            <select disabled={busy} value={segment?.fulfillment_status||'Pendiente'} onChange={e=>void saveSegment(type,{fulfillment_status:e.target.value})}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select>
            <button type="button" disabled={Boolean(saving)||!pending} onClick={()=>void setPendingStandard(type)}>{saving==='all:'+type?<LoaderCircle size={13} className="spin"/>:null}{pending?'Estándar a '+pending+' pendientes':'Todos definidos'}</button>
          </footer>
        </article>
      })}
    </div>

    <section className="food-pax-sheet">
      <header>
        <div><span>FICHA INDIVIDUAL POR PAX</span><h3>Tipo de consumo</h3><p>Selecciona el perfil real para cada pasajero y cada momento. “Sin definir” significa que Operaciones todavía debe resolverlo; “No consume” es una decisión confirmada.</p></div>
      </header>
      <div className="workspace-table-scroll">
        <table className="workspace-table food-pax-table">
          <thead><tr><th>Reserva / Pax</th><th>Pasajero</th><th>Restricción informada</th>{FOOD_TYPES.map(type=><th key={type}>{type}</th>)}</tr></thead>
          <tbody>{passengers.map(passenger=>{
            const reservation=reservations.find(item=>item.id===passenger.lead_id);
            return <tr key={passenger.id}>
              <td><b>{reservation?.codigo||'—'}</b><small>{passenger.passenger_code}</small></td>
              <td><b>{passenger.full_name||'Sin nombre'}</b></td>
              <td><span>{passenger.dietary_restrictions||'Sin restricción informada'}</span></td>
              {FOOD_TYPES.map(type=>{
                const assignment=assignmentFor(type,passenger.id);
                const key=type+':'+passenger.id;
                return <td key={type}>
                  <select className="food-pax-select" disabled={Boolean(saving)} value={assignment?.consumption_type||''} onChange={e=>void setConsumption(type,passenger.id,e.target.value)} aria-label={'Tipo de consumo '+type+' para '+passenger.full_name}>
                    <option value="">Sin definir</option>
                    {catalog.map(item=><option key={item.key} value={item.key}>{item.label}</option>)}
                  </select>
                  {saving===key&&<LoaderCircle size={12} className="spin food-cell-saving"/>}
                </td>
              })}
            </tr>
          })}</tbody>
        </table>
        {!passengers.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay pasajeros vinculados a este tour.</b></div>}
      </div>
    </section>
  </section>;
}
