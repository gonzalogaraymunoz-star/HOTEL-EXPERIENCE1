import React,{useState} from 'react';
import {FolderOpen,LoaderCircle} from 'lucide-react';
import type {Lead} from '../types';
import {assertSupabase} from '../lib/supabase';

export default function ReservationDriveButton({reservations}:{reservations:Lead[]}){
  const [busyId,setBusyId]=useState<string|null>(null);
  const [messages,setMessages]=useState<Record<string,string>>({});
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
        setMessages(current=>({...current,[reservation.id]:''}));
        window.open(url,'_blank','noopener,noreferrer');
        return;
      }
      const message=body?.folder?.error||body?.error||reservation.reservation_drive_folder_error||'La carpeta de respaldo todavía no está disponible.';
      setMessages(current=>({...current,[reservation.id]:message}));
    }catch(error:any){
      setMessages(current=>({...current,[reservation.id]:error?.message||'No se pudo conectar el respaldo con Drive.'}));
    }finally{setBusyId(null)}
  };

  return <div className="reservation-drive-actions" aria-label="Respaldos de antecedentes por reserva">
    {reservations.map(reservation=>{
      const ready=reservation.reservation_drive_folder_status==='ready'&&Boolean(reservation.reservation_drive_folder_url);
      const busy=busyId===reservation.id;
      const detail=messages[reservation.id]||reservation.reservation_drive_folder_error||'';
      const credentialPending=/credencial|GOOGLE_DRIVE|permiso de edición/i.test(detail);
      return <div key={reservation.id} className="reservation-drive-item">
        <button
          type="button"
          className={ready?'reservation-drive-button ready':'reservation-drive-button pending'}
          onClick={()=>void ensureAndOpen(reservation)}
          disabled={Boolean(busyId)}
          title={ready?('Abrir respaldo '+reservation.codigo):(credentialPending?'Drive pendiente de autorización. Presiona para reintentar.':'Crear o abrir la ficha física de esta reserva en Drive')}
        >
          {busy?<LoaderCircle size={15} className="spin"/>:<FolderOpen size={15}/>}
          <span>{busy?'Preparando respaldo…':ready?'Abrir respaldo':credentialPending?'Drive pendiente · reintentar':'Respaldo antecedentes'}</span>
          <small>{reservation.codigo}</small>
        </button>
        {!ready&&detail&&<small className="reservation-drive-hint">{credentialPending?'La reserva sigue respaldada internamente. Drive se habilitará cuando quede autorizada la cuenta del servidor.':detail}</small>}
      </div>;
    })}
  </div>;
}
