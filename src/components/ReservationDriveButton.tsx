import React,{useState} from 'react';
import {FolderOpen,LoaderCircle} from 'lucide-react';
import type {Lead} from '../types';
import {assertSupabase} from '../lib/supabase';

export default function ReservationDriveButton({reservations}:{reservations:Lead[]}){
  const [busyId,setBusyId]=useState<string|null>(null);
  if(!reservations.length)return null;

  const ensureAndOpen=async(reservation:Lead)=>{
    if(reservation.reservation_drive_folder_status==='ready'&&reservation.reservation_drive_folder_url){
      window.open(reservation.reservation_drive_folder_url,'_blank','noopener,noreferrer');
      return;
    }
    setBusyId(reservation.id);
    try{
      const sb=assertSupabase();
      const {data:{session}}=await sb.auth.getSession();
      if(!session?.access_token)throw new Error('Sesión requerida.');
      const response=await fetch('/api/reservation-archive',{
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
        body:JSON.stringify({action:'ensure_folder',leadId:reservation.id})
      });
      const body=await response.json().catch(()=>({}));
      const url=body?.folder?.url||body?.folder?.lead?.reservation_drive_folder_url;
      if(response.ok&&url){
        window.open(url,'_blank','noopener,noreferrer');
        return;
      }
      throw new Error(body?.folder?.error||body?.error||reservation.reservation_drive_folder_error||'La carpeta de respaldo todavía no está disponible.');
    }catch(error:any){
      alert(error?.message||'No se pudo abrir o crear el respaldo de antecedentes.');
    }finally{setBusyId(null)}
  };

  return <div className="reservation-drive-actions" aria-label="Respaldos de antecedentes por reserva">
    {reservations.map(reservation=>{
      const ready=reservation.reservation_drive_folder_status==='ready'&&Boolean(reservation.reservation_drive_folder_url);
      const busy=busyId===reservation.id;
      return <button
        key={reservation.id}
        type="button"
        className={ready?'reservation-drive-button ready':'reservation-drive-button pending'}
        onClick={()=>void ensureAndOpen(reservation)}
        disabled={Boolean(busyId)}
        title={ready?('Abrir respaldo '+reservation.codigo):'Crear o abrir la ficha física de esta reserva en Drive'}
      >
        {busy?<LoaderCircle size={15} className="spin"/>:<FolderOpen size={15}/>}
        <span>{busy?'Preparando respaldo…':'Respaldo antecedentes'}</span>
        <small>{reservation.codigo}</small>
      </button>;
    })}
  </div>;
}
