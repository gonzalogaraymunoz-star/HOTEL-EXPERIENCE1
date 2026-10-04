import React,{useEffect,useMemo,useState} from 'react';
import {Check,LoaderCircle,UtensilsCrossed} from 'lucide-react';
import type {Lead,Passenger,TourDeparture,TourFoodPassenger,TourFoodSegment} from '../types';
import {FOOD_TYPES,foodOrder,moneyCLP,type FoodType} from '../lib/food';
import {loadDepartureFood,togglePassengerFood,updateFoodSegment,upsertFoodSegment} from '../lib/operationsApi';
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
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState('');
  const [costDraft,setCostDraft]=useState<Record<string,string>>({});
  const [noteDraft,setNoteDraft]=useState<Record<string,string>>({});

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadDepartureFood(departure.id);
      const ordered=[...data.segments].sort((a,b)=>foodOrder(a.food_type)-foodOrder(b.food_type));
      setSegments(ordered);
      setAssignments(data.assignments);
      setCostDraft(Object.fromEntries(ordered.map(item=>[item.food_type,String(Number(item.unit_cost||0)||'')])));
      setNoteDraft(Object.fromEntries(ordered.map(item=>[item.food_type,item.notes||''])));
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[departure.id]);

  const segmentByType=useMemo(()=>new Map(segments.map(item=>[item.food_type,item])),[segments]);
  const assignmentKeys=useMemo(()=>new Set(assignments.map(item=>`${item.segment_id}:${item.passenger_id}`)),[assignments]);
  const assignedCount=(type:string)=>{
    const segment=segmentByType.get(type);
    return segment?assignments.filter(item=>item.segment_id===segment.id).length:0;
  };
  const assignedUnits=(type:string)=>{
    const segment=segmentByType.get(type);
    return segment?assignments.filter(item=>item.segment_id===segment.id).reduce((sum,item)=>sum+Number(item.quantity||1),0):0;
  };
  const isAssigned=(type:string,passengerId:string)=>{
    const segment=segmentByType.get(type);
    return Boolean(segment&&assignmentKeys.has(`${segment.id}:${passengerId}`));
  };

  const toggle=async(type:FoodType,passengerId:string,next:boolean)=>{
    const key=`${type}:${passengerId}`;setSaving(key);
    try{await togglePassengerFood(departure.id,type,passengerId,next);await load();onChanged()}finally{setSaving('')}
  };
  const saveSegment=async(type:FoodType,patch:Partial<TourFoodSegment>)=>{
    setSaving(`segment:${type}`);
    try{
      const existing=segmentByType.get(type);
      if(existing)await updateFoodSegment(existing.id,patch);
      else await upsertFoodSegment(departure.id,type,patch);
      await load();onChanged();
    }finally{setSaving('')}
  };
  const saveCost=async(type:FoodType)=>{
    const raw=costDraft[type]||'';
    const value=Math.max(0,Number(raw.replace(/\D/g,''))||0);
    await saveSegment(type,{unit_cost:value});
  };
  const saveNote=async(type:FoodType)=>saveSegment(type,{notes:(noteDraft[type]||'').trim()||null});
  const setAll=async(type:FoodType)=>{
    const allSelected=passengers.length>0&&passengers.every(passenger=>isAssigned(type,passenger.id));
    setSaving(`all:${type}`);
    try{
      for(const passenger of passengers)await togglePassengerFood(departure.id,type,passenger.id,!allSelected);
      await load();onChanged();
    }finally{setSaving('')}
  };

  if(loading)return <div className="workspace-empty">Cargando alimentación del tour…</div>;

  const totalCost=FOOD_TYPES.reduce((sum,type)=>{
    const segment=segmentByType.get(type);
    return sum+assignedUnits(type)*Number(segment?.unit_cost||0);
  },0);

  return <section className="tour-food-workspace">
    <header className="tour-food-head">
      <div>
        <span>ALIMENTACIÓN · INSUMOS POR TRAMO</span>
        <h2>{departure.product_name}</h2>
        <p>Un solo criterio: seis tipos de alimentación, costo por tramo y asignación individual a cada pasajero.</p>
      </div>
      <div className="tour-food-total"><small>Costo alimentación</small><strong>{moneyCLP(totalCost)}</strong><span>{passengers.length} pax del tour</span></div>
    </header>

    <div className="tour-food-segments">
      {FOOD_TYPES.map(type=>{
        const segment=segmentByType.get(type);
        const count=assignedCount(type);
        const units=assignedUnits(type);
        const subtotal=units*Number(segment?.unit_cost||0);
        const busy=saving===`segment:${type}`||saving===`all:${type}`;
        return <article key={type} className={count?'food-segment-card active':'food-segment-card'}>
          <header><div><span>TRAMO DE ALIMENTACIÓN</span><h3>{type}</h3></div><b>{count}/{passengers.length} pax</b></header>
          <div className="food-segment-cost">
            <label><span>Costo p/pax</span><input inputMode="numeric" value={costDraft[type]??String(Number(segment?.unit_cost||0)||'')} onChange={e=>setCostDraft(current=>({...current,[type]:e.target.value.replace(/\D/g,'')}))} onBlur={()=>void saveCost(type)} placeholder="0"/></label>
            <div><span>Subtotal</span><strong>{moneyCLP(subtotal)}</strong></div>
          </div>
          <label className="food-segment-note"><span>Detalle / proveedor / preparación</span><input value={noteDraft[type]??segment?.notes??''} onChange={e=>setNoteDraft(current=>({...current,[type]:e.target.value}))} onBlur={()=>void saveNote(type)} placeholder="Nota del tramo…"/></label>
          <footer>
            <select disabled={busy} value={segment?.fulfillment_status||'Pendiente'} onChange={e=>void saveSegment(type,{fulfillment_status:e.target.value})}><option>Pendiente</option><option>Preparado</option><option>Entregado</option></select>
            <button type="button" disabled={Boolean(saving)||!passengers.length} onClick={()=>void setAll(type)}>{busy?<LoaderCircle size={13} className="spin"/>:null}{passengers.length&&passengers.every(p=>isAssigned(type,p.id))?'Quitar a todos':'Asignar a todos'}</button>
          </footer>
        </article>
      })}
    </div>

    <section className="food-pax-sheet">
      <header>
        <div><span>FICHA INDIVIDUAL POR PAX</span><h3>Alimentación asignada</h3><p>Cada marca queda ligada a este TOUR y a este pasajero. Las restricciones se muestran como referencia, pero no asignan alimentos automáticamente.</p></div>
      </header>
      <div className="workspace-table-scroll">
        <table className="workspace-table food-pax-table">
          <thead><tr><th>Reserva / Pax</th><th>Pasajero</th><th>Restricción</th>{FOOD_TYPES.map(type=><th key={type}>{type}</th>)}</tr></thead>
          <tbody>{passengers.map(passenger=>{
            const reservation=reservations.find(item=>item.id===passenger.lead_id);
            return <tr key={passenger.id}>
              <td><b>{reservation?.codigo||'—'}</b><small>{passenger.passenger_code}</small></td>
              <td><b>{passenger.full_name||'Sin nombre'}</b></td>
              <td><span>{passenger.dietary_restrictions||'Sin restricción informada'}</span></td>
              {FOOD_TYPES.map(type=>{
                const checked=isAssigned(type,passenger.id);
                const key=`${type}:${passenger.id}`;
                return <td key={type}><button type="button" className={checked?'food-pax-toggle active':'food-pax-toggle'} disabled={Boolean(saving)} onClick={()=>void toggle(type,passenger.id,!checked)} aria-label={`${checked?'Quitar':'Asignar'} ${type} a ${passenger.full_name}`}>{saving===key?<LoaderCircle size={13} className="spin"/>:checked?<Check size={13}/>:null}<span>{checked?'Sí':'No'}</span></button></td>
              })}
            </tr>
          })}</tbody>
        </table>
        {!passengers.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay pasajeros vinculados a este tour.</b></div>}
      </div>
    </section>
  </section>;
}
