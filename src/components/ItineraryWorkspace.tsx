import React,{useMemo,useState} from 'react';
import {Check,Copy,Printer,Search,Send} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {updateLead} from '../lib/api';

type Props={leads:Lead[];services:LeadService[];onChanged:()=>void};

export default function ItineraryWorkspace({leads,services,onChanged}:Props){
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(leads[0]?.id||null);
  const [copied,setCopied]=useState(false);
  const [saving,setSaving]=useState(false);

  const byLead=useMemo(()=>{
    const map=new Map<string,LeadService[]>();
    services.forEach(service=>{const list=map.get(service.lead_id)||[];list.push(service);map.set(service.lead_id,list)});
    for(const list of map.values())list.sort((a,b)=>`${a.fecha_servicio||'9999'} ${a.hora_inicio||''}`.localeCompare(`${b.fecha_servicio||'9999'} ${b.hora_inicio||''}`));
    return map;
  },[services]);

  const visibleLeads=useMemo(()=>leads.filter(lead=>{
    const q=query.trim().toLowerCase();
    if(!q)return true;
    const serviceText=(byLead.get(lead.id)||[]).map(s=>`${s.service_code||''} ${s.producto}`).join(' ');
    return `${lead.codigo} ${lead.reserva} ${lead.empresa_ejecuta||''} ${serviceText}`.toLowerCase().includes(q);
  }),[leads,byLead,query]);

  const lead=leads.find(item=>item.id===selectedId)||visibleLeads[0]||null;
  const itinerary=lead?(byLead.get(lead.id)||[]):[];

  const copy=async()=>{
    if(!lead)return;
    const text=[`${lead.reserva} · ${lead.codigo}`,...itinerary.map(s=>`${formatDate(s.fecha_servicio)} · ${time(s.hora_inicio)} · ${s.producto}${s.modality?` · ${s.modality}`:''}`)].join('\n');
    await navigator.clipboard.writeText(text);setCopied(true);window.setTimeout(()=>setCopied(false),1400);
  };
  const markSent=async()=>{
    if(!lead)return;
    setSaving(true);
    try{await updateLead(lead.id,{itinerary_sent_at:new Date().toISOString(),itinerary_sent_via:'Registro manual'});onChanged();}finally{setSaving(false)}
  };

  return <section className="itinerary-workspace">
    <aside className="itinerary-index">
      <div className="itinerary-index-head"><span>ITINERARIOS</span><strong>{leads.length} reservas operativas</strong></div>
      <label className="workspace-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente, código, hotel o servicio…"/></label>
      <div className="itinerary-lead-list">{visibleLeads.map(item=>{
        const count=(byLead.get(item.id)||[]).length;
        return <button key={item.id} className={lead?.id===item.id?'active':''} onClick={()=>setSelectedId(item.id)}><b>{item.reserva}</b><span>{item.codigo} · {count} servicio{count===1?'':'s'}</span></button>
      })}</div>
    </aside>

    <main className="itinerary-document">
      {!lead?<div className="workspace-empty">No hay reservas entregadas a operación.</div>:<>
        <header className="itinerary-document-head">
          <div><span>ITINERARIO</span><h1>{lead.reserva}</h1><p>{lead.codigo}{lead.empresa_ejecuta?` · ${lead.empresa_ejecuta}`:''}{lead.hotel_room?` · Hab. ${lead.hotel_room}`:''}</p></div>
          <div className="itinerary-actions no-print">
            <button onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copiado':'Copiar'}</button>
            <button onClick={()=>window.print()}><Printer size={15}/> Imprimir / PDF</button>
            <button disabled={saving} onClick={markSent}><Send size={15}/> {lead.itinerary_sent_at?'Actualizar registro':'Registrar envío'}</button>
          </div>
        </header>

        <section className="itinerary-context">
          <div><span>Check-in</span><b>{formatDate(lead.checkin)}</b></div><div><span>Check-out</span><b>{formatDate(lead.checkout)}</b></div><div><span>Pax</span><b>{lead.numero_pax}</b></div><div><span>Referencia</span><b>{lead.reservation_reference||'—'}</b></div>
        </section>

        <div className="itinerary-table-wrap"><table className="workspace-table itinerary-table"><thead><tr><th>Día</th><th>Fecha</th><th>Hora</th><th>Servicio</th><th>Modalidad</th><th>Estado</th></tr></thead><tbody>
          {itinerary.map((service,index)=><tr key={service.id}><td>{index+1}</td><td>{formatDate(service.fecha_servicio)}</td><td>{time(service.hora_inicio)}</td><td><b>{service.producto}</b><small>{service.service_code||service.tour_id||'—'}</small></td><td>{service.modality||'—'}</td><td>{service.estado_operacion}</td></tr>)}
        </tbody></table></div>
        {!itinerary.length&&<div className="workspace-empty">Esta reserva todavía no tiene servicios operativos confirmados.</div>}
        {lead.itinerary_sent_at&&<footer className="itinerary-sent-note">Último registro de envío: {new Date(lead.itinerary_sent_at).toLocaleString('es-CL')} · {lead.itinerary_sent_via||'sin canal'}</footer>}
      </>}
    </main>
  </section>;
}

function time(value:any){return value?String(value).slice(0,5):'—'}
function formatDate(value:any){if(!value)return'—';const [y,m,d]=String(value).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12))}
