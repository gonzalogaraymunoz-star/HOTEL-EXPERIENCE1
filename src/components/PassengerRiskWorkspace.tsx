import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,ChevronRight,ShieldAlert} from 'lucide-react';
import type {Lead,LeadService,Passenger,ReservationDocument} from '../types';
import ReservationRiskModule from './ReservationRiskModule';
import './PassengerRiskWorkspace.css';

export default function PassengerRiskWorkspace({
  reservations,services,passengers,documents,onChanged
}:{
  reservations:Lead[];
  services:LeadService[];
  passengers:Passenger[];
  documents:ReservationDocument[];
  onChanged:()=>void;
}){
  const orderedPassengers=useMemo(()=>[...passengers].sort((a,b)=>{
    const ar=reservations.find(item=>item.id===a.lead_id)?.codigo||'';
    const br=reservations.find(item=>item.id===b.lead_id)?.codigo||'';
    return ar.localeCompare(br)||String(a.passenger_code||'').localeCompare(String(b.passenger_code||''));
  }),[passengers,reservations]);
  const riskDocuments=useMemo(()=>documents.filter(item=>item.document_type==='risk_sheet'&&item.passenger_id),[documents]);
  const [selectedId,setSelectedId]=useState<string|null>(orderedPassengers[0]?.id||null);

  useEffect(()=>{
    if(!orderedPassengers.length){setSelectedId(null);return}
    if(!selectedId||!orderedPassengers.some(item=>item.id===selectedId))setSelectedId(orderedPassengers[0].id);
  },[orderedPassengers,selectedId]);

  const selected=orderedPassengers.find(item=>item.id===selectedId)||null;
  const lead=selected?reservations.find(item=>item.id===selected.lead_id)||null:null;
  const document=selected?riskDocuments.find(item=>item.passenger_id===selected.id)||null:null;
  const completed=riskDocuments.filter(item=>item.status==='Completada'&&orderedPassengers.some(passenger=>passenger.id===item.passenger_id)).length;

  if(!orderedPassengers.length)return <div className="workspace-empty">No hay pasajeros cargados. Cada pasajero necesita su registro antes de generar la hoja de riesgo.</div>;

  return <section className="passenger-risk-workspace">
    <header className="passenger-risk-head">
      <div><span>HOJAS DE RIESGO INDIVIDUALES</span><h2>{orderedPassengers.length} hoja{orderedPassengers.length===1?'':'s'} · 1 por pasajero</h2><p>Los botones se crean automáticamente desde la lista nominal. Cada hoja reutiliza el itinerario y los datos vivos del pasajero.</p></div>
      <strong>{completed}/{orderedPassengers.length} completadas</strong>
    </header>

    <div className="passenger-risk-buttons" role="tablist" aria-label="Hojas de riesgo por pasajero">
      {orderedPassengers.map(passenger=>{
        const reservation=reservations.find(item=>item.id===passenger.lead_id);
        const risk=riskDocuments.find(item=>item.passenger_id===passenger.id);
        const done=risk?.status==='Completada';
        return <button
          key={passenger.id}
          type="button"
          role="tab"
          aria-selected={selectedId===passenger.id}
          className={selectedId===passenger.id?'active':''}
          onClick={()=>setSelectedId(passenger.id)}
        >
          <span className={done?'risk-button-status done':'risk-button-status'}>{done?<CheckCircle2 size={15}/>:<ShieldAlert size={15}/>}</span>
          <span className="risk-button-copy"><small>{passenger.passenger_code}</small><b>{passenger.full_name||'Pasajero sin nombre'}</b><em>{reservation?.codigo||'Reserva'}</em></span>
          <span className="risk-button-state">{done?'Completada':'Generar'}</span>
          <ChevronRight size={16}/>
        </button>
      })}
    </div>

    {selected&&lead&&<ReservationRiskModule
      key={selected.id}
      lead={lead}
      services={services.filter(item=>item.lead_id===lead.id)}
      passenger={selected}
      document={document}
      onChanged={onChanged}
    />}
  </section>;
}
