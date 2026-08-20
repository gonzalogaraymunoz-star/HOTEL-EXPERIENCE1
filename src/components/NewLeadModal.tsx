import React,{useState} from 'react';
import {Plus,UserPlus,X} from 'lucide-react';
import {createManualLead} from '../lib/api';

export default function NewLeadModal({onClose,onCreated}:{onClose:()=>void;onCreated:()=>void}){
  const [form,setForm]=useState({reserva:'',numero_pax:1,contacto:'',empresa_ejecuta:'',canal:'Directo',prioridad:'Media',servicio:''});
  const [busy,setBusy]=useState(false);
  const set=(k:string,v:any)=>setForm(x=>({...x,[k]:v}));
  const save=async()=>{
    if(!form.reserva.trim())return alert('Ingresa el nombre del cliente.');
    setBusy(true);
    try{await createManualLead(form);onCreated();onClose();}
    catch(e:any){alert(e.message||'No se pudo crear el lead.')}
    finally{setBusy(false);}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card new-lead-modal" onMouseDown={e=>e.stopPropagation()}>
      <header><div><span className="eyebrow">NUEVA OPORTUNIDAD</span><h2>Crear lead</h2></div><button className="icon-button" onClick={onClose}><X/></button></header>
      <p>El lead quedará creado por ti y asignado inicialmente a tu cuenta.</p>
      <div className="form-grid">
        <label className="field wide"><span>Cliente *</span><input value={form.reserva} onChange={e=>set('reserva',e.target.value)} placeholder="Nombre y apellidos"/></label>
        <label className="field"><span>Contacto</span><input value={form.contacto} onChange={e=>set('contacto',e.target.value)} placeholder="correo | teléfono"/></label>
        <label className="field"><span>Hotel / origen</span><input value={form.empresa_ejecuta} onChange={e=>set('empresa_ejecuta',e.target.value)} placeholder="Hotel Fauna"/></label>
        <label className="field"><span>Pasajeros</span><input type="number" min={1} value={form.numero_pax} onChange={e=>set('numero_pax',Number(e.target.value))}/></label>
        <label className="field"><span>Canal</span><select value={form.canal} onChange={e=>set('canal',e.target.value)}>{['Directo','Hotel','Web','WhatsApp','Recepción','Agencia','Referido'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field"><span>Prioridad</span><select value={form.prioridad} onChange={e=>set('prioridad',e.target.value)}>{['Baja','Media','Alta','Urgente'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label className="field wide"><span>Interés inicial</span><input value={form.servicio} onChange={e=>set('servicio',e.target.value)} placeholder="Ej. Valle de la Luna privado"/></label>
      </div>
      <button className="primary-button modal-action" disabled={busy} onClick={save}><UserPlus size={17}/>{busy?'Creando...':'Crear lead'}</button>
    </section>
  </div>
}
