import React,{useMemo,useState} from 'react';
import {CheckCircle2,FileText,LoaderCircle} from 'lucide-react';
import type {Lead,Passenger,ReservationDocument} from '../types';
import {assertSupabase} from '../lib/supabase';
import './PassengerRiskWorkspace.css';

export default function PassengerRiskWorkspace({
  reservations,passengers,documents,departureId,departureCode,onChanged
}:{
  reservations:Lead[];
  passengers:Passenger[];
  documents:ReservationDocument[];
  departureId:string;
  departureCode?:string|null;
  onChanged:()=>void;
}){
  const [loadingId,setLoadingId]=useState<string|null>(null);
  const orderedPassengers=useMemo(()=>[...passengers].sort((a,b)=>{
    const ar=reservations.find(item=>item.id===a.lead_id)?.codigo||'';
    const br=reservations.find(item=>item.id===b.lead_id)?.codigo||'';
    return ar.localeCompare(br)||String(a.passenger_code||'').localeCompare(String(b.passenger_code||''));
  }),[passengers,reservations]);
  const riskDocuments=useMemo(()=>documents.filter(item=>item.document_type==='risk_sheet'&&item.passenger_id&&item.departure_id===departureId),[documents,departureId]);
  const generated=riskDocuments.filter(item=>item.status==='Generada'&&orderedPassengers.some(passenger=>passenger.id===item.passenger_id)).length;

  const generate=async(passenger:Passenger)=>{
    const target=window.open('about:blank','_blank');
    setLoadingId(passenger.id);
    try{
      const sb=assertSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('Sesión requerida.');
      const response=await fetch('/api/risk-sheet',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({action:'generate',departureId,passengerId:passenger.id})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'No se pudo generar la hoja de riesgo.');
      if(target)target.location.href=body.url;else window.open(body.url,'_blank','noopener,noreferrer');
      onChanged();
    }catch(error:any){
      if(target)target.close();
      alert(error?.message||'No se pudo generar la hoja de riesgo estándar.');
    }finally{setLoadingId(null)}
  };

  if(!orderedPassengers.length)return <div className="workspace-empty">No hay pasajeros vinculados a esta salida. La hoja de riesgo se genera una vez por pasajero del tour.</div>;

  return <section className="passenger-risk-workspace">
    <header className="passenger-risk-head">
      <div>
        <span>HOJA DE RIESGO ESTÁNDAR · SERNATUR</span>
        <h2>{orderedPassengers.length} hoja{orderedPassengers.length===1?'':'s'} · 1 por pasajero</h2>
        <p>Cada botón toma la plantilla oficial de Google Drive, la autorellena con los datos vivos de este tour y abre el PDF listo para imprimir o firmar.</p>
      </div>
      <strong>{generated}/{orderedPassengers.length} generadas</strong>
    </header>

    <div className="passenger-risk-buttons" aria-label="Hojas de riesgo por pasajero">
      {orderedPassengers.map(passenger=>{
        const reservation=reservations.find(item=>item.id===passenger.lead_id);
        const document=riskDocuments.find(item=>item.passenger_id===passenger.id);
        const ready=document?.status==='Generada';
        const loading=loadingId===passenger.id;
        return <button key={passenger.id} type="button" disabled={Boolean(loadingId)} onClick={()=>void generate(passenger)}>
          <span className={ready?'risk-button-status done':'risk-button-status'}>
            {loading?<LoaderCircle size={16} className="spin"/>:ready?<CheckCircle2 size={15}/>:<FileText size={15}/>}
          </span>
          <span className="risk-button-copy">
            <small>{passenger.passenger_code}</small>
            <b>{passenger.full_name||'Pasajero sin nombre'}</b>
            <em>{reservation?.codigo||'Reserva'} · TOUR {departureCode||'—'}</em>
          </span>
          <span className="risk-button-state">{loading?'Generando…':ready?'Regenerar PDF':'Generar PDF'}</span>
        </button>
      })}
    </div>
  </section>;
}
