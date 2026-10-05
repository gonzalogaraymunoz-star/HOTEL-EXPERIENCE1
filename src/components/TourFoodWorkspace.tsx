import React,{useEffect,useMemo,useState} from 'react';
import {Check,LoaderCircle,UtensilsCrossed} from 'lucide-react';
import type {Lead,Passenger,TourDeparture,TourFoodPassenger,TourFoodSegment} from '../types';
import {FOOD_TYPES,foodOrder,type FoodType} from '../lib/food';
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
  const [noteDraft,setNoteDraft]=useState<Record<string,string>>({});

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadDepartureFood(departure.id);
      const ordered=[...data.segments].sort((a,b)=>foodOrder(a.food_type)-foodOrder(b.food_type));
      setSegments(ordered);
      setAssignments(data.assignments);
      setNoteDraft(Object.fromEntries(ordered.map(item=>[item.food_type,item.notes||''])));
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[departure.id]);

  const segmentByType=useMemo(()=>new Map(segments.map(item=>[item.food_type,item])),[segments]);
  const assignmentKeys=useMemo(()=>new Set(assignments.map(item=>item.segment_id+':'+item.passenger_id)),[assignments]);
  const assignedCount=(type:string)=>{
    const segment=segmentByType.get(type);
    return segment?assignments.filter(item=>item.segment_id===segment.id).length:0;
  };
  const isAssigned=(type:string,passengerId:string)=>{
    const segment=segmentByType.get(type);
    return Boolean(segment&&assignmentKeys.has(segment.id+':'+passengerId));
  };

  const toggle=async(type:FoodType,passengerId:string,next:boolean)=>{
    const key=type+':'+passengerId;
    setSaving(key);
    try{
      await togglePassengerFood(departure.id,type,passengerId,next);
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

  const setAll=async(type:FoodType)=>{
    const allSelected=passengers.length>0&&passengers.every(passenger=>isAssigned(type,passenger.id));
    setSaving('all:'+type);
    try{
      for(const passenger of passengers)await togglePassengerFood(departure.id,type,passenger.id,!allSelected);
      await load();
      onChanged();
    }finally{setSaving('')}
  };

  if(loading)return <div className="workspace-empty">Cargando alimentación del tour…</div>;

  return <section className="tour-food-workspace">
    <header className="tour-food-head">
      <div>
        <span>ALIMENTACIÓN · TRAMOS POR PASAJERO</span>
        <h2>{departure.product_name}</h2>
        <p>Los tramos son Desayuno, Aperitivo, Almuerzo, Snack, Box lunch y Agua individual. Solo asigna qué recibe cada pasajero; una vez asignado el tramo no requiere otra confirmación.</p>
      </div>
      <div className="tour-food-total"><small>Pax del tour</small><strong>{passengers.length}</strong><span>{assignments.length} asignaciones de alimentación</span></div>
    </header>

    <div className="tour-food-segments">
      {FOOD_TYPES.map(type=>{
        const segment=segmentByType.get(type);
        const count=assignedCount(type);
        const busy=saving==='segment:'+type||saving==='all:'+type;
        return <article key={type} className={count?'food-segment-card active':'food-segment-card'}>
          <header><div><span>TRAMO DE ALIMENTACIÓN</span><h3>{type}</h3></div><b>{count}/{passengers.length} pax</b></header>

          <label className="food-segment-note"><span>Observación general del tramo</span><input value={noteDraft[type]??segment?.notes??''} onChange={e=>setNoteDraft(current=>({...current,[type]:e.target.value}))} onBlur={()=>void saveNote(type)} placeholder="Ej. retiro 05:30 · proveedor · preparación…"/></label>

          <footer>
            <span className={count>0?'food-assignment-state assigned':'food-assignment-state'}>{count>0?'Asignado':'No asignado'} · {count}/{passengers.length} pax</span>
            <button type="button" disabled={Boolean(saving)||!passengers.length} onClick={()=>void setAll(type)}>{busy?<LoaderCircle size={13} className="spin"/>:null}{passengers.length&&passengers.every(p=>isAssigned(type,p.id))?'Quitar a todos':'Asignar a todos'}</button>
          </footer>
        </article>
      })}
    </div>

    <section className="food-pax-sheet">
      <header>
        <div><span>FICHA INDIVIDUAL POR PAX</span><h3>Tramos de alimentación</h3><p>Marca Sí o No para cada pasajero. Las restricciones alimentarias se muestran como referencia y se gestionan en la ficha del pasajero.</p></div>
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
                const key=type+':'+passenger.id;
                return <td key={type}><button type="button" className={checked?'food-pax-toggle active':'food-pax-toggle'} disabled={Boolean(saving)} onClick={()=>void toggle(type,passenger.id,!checked)} aria-label={(checked?'Quitar ':'Asignar ')+type+' a '+passenger.full_name}>{saving===key?<LoaderCircle size={13} className="spin"/>:checked?<Check size={13}/>:null}<span>{checked?'Sí':'No'}</span></button></td>
              })}
            </tr>
          })}</tbody>
        </table>
        {!passengers.length&&<div className="workspace-empty"><UtensilsCrossed size={22}/><b>No hay pasajeros vinculados a este tour.</b></div>}
      </div>
    </section>
  </section>;
}
