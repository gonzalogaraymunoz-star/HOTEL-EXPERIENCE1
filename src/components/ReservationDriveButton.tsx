import React from 'react';
import {FolderOpen} from 'lucide-react';
import type {Lead} from '../types';

export default function ReservationDriveButton({reservations}:{reservations:Lead[]}){
  if(!reservations.length)return null;
  return <div className="reservation-drive-actions" aria-label="Respaldos de antecedentes por reserva">
    {reservations.map(reservation=>{
      const ready=reservation.reservation_drive_folder_status==='ready'&&Boolean(reservation.reservation_drive_folder_url);
      const open=()=>{
        if(ready&&reservation.reservation_drive_folder_url){
          window.open(reservation.reservation_drive_folder_url,'_blank','noopener,noreferrer');
          return;
        }
        alert(reservation.reservation_drive_folder_error||'La carpeta de respaldo de esta reserva todavía no está conectada.');
      };
      return <button
        key={reservation.id}
        type="button"
        className={ready?'reservation-drive-button ready':'reservation-drive-button pending'}
        onClick={open}
        title={ready?('Abrir respaldo '+reservation.codigo):(reservation.reservation_drive_folder_error||'Carpeta pendiente')}
      >
        <FolderOpen size={15}/>
        <span>Respaldo antecedentes</span>
        <small>{reservation.codigo}</small>
      </button>;
    })}
  </div>;
}