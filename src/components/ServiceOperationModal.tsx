import React from 'react';
import {X,Wrench} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import ReservationOperations from './ReservationOperations';

export default function ServiceOperationModal({
  lead,service,userRole,onClose,onChanged
}:{lead:Lead;service:LeadService;userRole:string;onClose:()=>void;onChanged:()=>void}){
  return <div className="modal-backdrop" onMouseDown={e=>{e.stopPropagation();onClose()}}>
    <section className="modal-card service-operation-modal" onMouseDown={e=>e.stopPropagation()}>
      <header>
        <div>
          <span className="eyebrow">OPERACIÓN DEL SERVICIO</span>
          <h2>{service.producto}</h2>
          <p>{lead.reserva} · {lead.codigo} · {service.numero_pax} pax</p>
        </div>
        <button className="icon-button" onClick={onClose}><X/></button>
      </header>
      <div className="service-operation-intro">
        <Wrench size={17}/>
        <span>Asigna agencia/proveedor, guía, conductor, vehículo, personal de apoyo, insumos, costo y pago. La hoja de riesgo y la lista de pasajeros quedan vinculadas a la reserva.</span>
      </div>
      <ReservationOperations lead={lead} services={[service]} userRole={userRole} onChanged={onChanged}/>
    </section>
  </div>
}
