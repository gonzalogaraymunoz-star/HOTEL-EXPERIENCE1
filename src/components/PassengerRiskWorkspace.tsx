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
  const riskDocuments=useMemo(()=>documents.filter(item=>item.document_type==='risk_sheet'&&item.passenger_id&&!item.departure_id),[documents]);
  const generated=riskDocuments.filter(item=>item.status==='Generada'&&Boolean(item.drive_url)&&orderedPassengers.some(passenger=>passenger.id===item.passenger_id)).length;

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
        body:JSON.stringify({action:'generate',passengerId:passenger.id})
      });
      const body=await response.json();
      if(!response.ok)throw new Error(body.error||'No se pudo generar la hoja de riesgo.');
      await onChanged();
      if(body.driveUrl){
        if(target)target.location.href=body.driveUrl;else window.open(body.driveUrl,'_blank','noopener,noreferrer');
      }else{
        if(target)target.close();
        throw new Error(body.driveError||'La hoja fue rellenada, pero todavía no está subida a Google Drive. No se descargará un XLSX temporal.');
      }
    }catch(error:any){
      if(target)target.close();
      alert(error?.message||'No se pudo generar la hoja de riesgo del itinerario completo.');
    }finally{setLoadingId(null)}
  };

  const generateAll=async()=>{
    setLoadingId('__all__');
    try{
      const sb=assertSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('Sesión requerida.');
      const reservationIds=[...new Set(orderedPassengers.map(item=>item.lead_id))];
      const failed:string[]=[];
      for(const leadId of reservationIds){
        const response=await fetch('/api/reservation-archive',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({action:'prepare_risk_sheets',leadId})
        });
        const body=await response.json().catch(()=>({}));
        if(!response.ok||Number(body.failed||0)>0)failed.push(reservations.find(item=>item.id===leadId)?.codigo||leadId);
      }
      await onChanged();
      if(failed.length)alert('Quedaron hojas pendientes en: '+failed.join(', ')+'. Revisa los datos o servicios del pasajero.');
    }catch(error:any){
      alert(error?.message||'No se pudieron preparar todas las hojas de riesgo.');
    }finally{setLoadingId(null)}
  };

  if(!orderedPassengers.length)return <div className="workspace-empty">No hay pasajeros vinculados a esta salida. La hoja de riesgo se genera una sola vez por pasajero y cubre su itinerario completo.</div>;

  return <section className="passenger-risk-workspace">
    <header className="passenger-risk-head">
      <div>
        <span>HOJA DE RIESGO · ITINERARIO COMPLETO · SERNATUR</span>
        <h2>{orderedPassengers.length} hoja{orderedPassengers.length===1?'':'s'} · 1 por pasajero</h2>
        <p>Cada pasajero tiene una única hoja de riesgo. El formulario oficial XLSX se autorellena con todos sus servicios confirmados. Cuando está lista, se abre desde Google Drive para visualizarla o descargarla desde ahí.</p>
      </div>
      <div style={{display:'grid',gap:7,justifyItems:'end'}}><strong>{generated}/{orderedPassengers.length} generadas</strong><button type="button" disabled={Boolean(loadingId)||generated===orderedPassengers.length} onClick={()=>void generateAll()}>{loadingId==='__all__'?<LoaderCircle size={13} className="spin"/>:null}{generated===orderedPassengers.length?'Todas preparadas':'Preparar todas'}</button></div>
    </header>

    <div className="passenger-risk-buttons" aria-label="Hojas de riesgo por pasajero">
      {orderedPassengers.map(passenger=>{
        const reservation=reservations.find(item=>item.id===passenger.lead_id);
        const document=riskDocuments.find(item=>item.passenger_id===passenger.id);
        const driveUrl=document?.drive_url||null;
        const ready=document?.status==='Generada'&&Boolean(driveUrl);
        const loading=loadingId===passenger.id;
        const openOrGenerate=()=>{
          if(ready&&driveUrl){
            window.open(driveUrl,'_blank','noopener,noreferrer');
            return;
          }
          void generate(passenger);
        };
        return <button key={passenger.id} type="button" disabled={Boolean(loadingId)} onClick={openOrGenerate} title={ready&&driveUrl?'Abrir hoja de riesgo en Google Drive':'Generar hoja de riesgo'}>
          <span className={ready?'risk-button-status done':'risk-button-status'}>
            {loading?<LoaderCircle size={16} className="spin"/>:ready?<CheckCircle2 size={15}/>:<FileText size={15}/>}
          </span>
          <span className="risk-button-copy">
            <small>{passenger.passenger_code}</small>
            <b>{passenger.full_name||'Pasajero sin nombre'}</b>
            <em>{reservation?.codigo||'Reserva'} · itinerario completo</em>
          </span>
          <span className="risk-button-state">{loading?'Generando y subiendo…':ready?'Abrir en Drive':document?.status==='Generada'?'Pendiente Drive · reintentar':'Generar hoja'}</span>
        </button>
      })}
    </div>
  </section>;
}
