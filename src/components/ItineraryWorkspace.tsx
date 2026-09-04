import React,{useEffect,useMemo,useState} from 'react';
import {Check,Copy,Search,Send} from 'lucide-react';
import type {Lead,LeadService,Passenger} from '../types';
import {updateLead} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import {itineraryRows} from '../lib/customerItinerary';
import CustomerItineraryPreview from './CustomerItineraryPreview';

type Props={leads:Lead[];services:LeadService[];onChanged:()=>void};

export default function ItineraryWorkspace({leads,services,onChanged}:Props){
  const [query,setQuery]=useState('');
  const [selectedId,setSelectedId]=useState<string|null>(leads[0]?.id||null);
  const [passengers,setPassengers]=useState<Passenger[]>([]);
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

  useEffect(()=>{if(selectedId&&!leads.some(item=>item.id===selectedId))setSelectedId(leads[0]?.id||null)},[leads,selectedId]);
  const lead=leads.find(item=>item.id===selectedId)||visibleLeads[0]||null;
  const itinerary=lead?(byLead.get(lead.id)||[]):[];

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(!lead){setPassengers([]);return}
      const {data}=await assertSupabase().from('passengers').select('*').eq('lead_id',lead.id).order('is_primary',{ascending:false}).order('passenger_code');
      if(active)setPassengers((data||[]) as Passenger[]);
    };
    void load();return()=>{active=false};
  },[lead?.id]);

  const copy=async()=>{
    if(!lead)return;
    const rows=itineraryRows({lead,passengers,services:itinerary});
    const text=[`${lead.reserva} · ${lead.codigo}`,...rows.map(row=>`${row.date} · ${row.schedule} · ${row.experience} · ${row.modality} · Pickup ${row.pickup}`)].join('\n');
    await navigator.clipboard.writeText(text);setCopied(true);window.setTimeout(()=>setCopied(false),1400);
  };
  const markSent=async()=>{
    if(!lead)return;
    setSaving(true);
    try{await updateLead(lead.id,{itinerary_sent_at:new Date().toISOString(),itinerary_sent_via:'Registro manual'});onChanged();}finally{setSaving(false)}
  };

  return <section className="itinerary-workspace itinerary-workspace-unified">
    <aside className="itinerary-index">
      <div className="itinerary-index-head"><span>ITINERARIOS</span><strong>{leads.length} reservas operativas</strong></div>
      <label className="workspace-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar pasajero, código, hotel o servicio…"/></label>
      <div className="itinerary-lead-list">{visibleLeads.map(item=>{
        const count=(byLead.get(item.id)||[]).length;
        return <button key={item.id} className={lead?.id===item.id?'active':''} onClick={()=>setSelectedId(item.id)}><b>{item.reserva}</b><span>{item.codigo} · {count} servicio{count===1?'':'s'}</span></button>
      })}</div>
    </aside>

    <main className="itinerary-document itinerary-document-unified">
      {!lead?<div className="workspace-empty">No hay reservas entregadas a operación.</div>:<>
        <div className="itinerary-unified-toolbar no-print">
          <div><span>MISMA FUENTE · VENTAS → OPERACIONES</span><strong>{lead.codigo}</strong><small>Lo que ve Operaciones coincide con el itinerario del pasajero.</small></div>
          <div><button onClick={copy}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Copiado':'Copiar resumen'}</button><button disabled={saving} onClick={markSent}><Send size={15}/> {lead.itinerary_sent_at?'Actualizar registro':'Registrar envío'}</button></div>
        </div>
        <CustomerItineraryPreview lead={lead} services={itinerary} passengers={passengers}/>
        {lead.itinerary_sent_at&&<footer className="itinerary-sent-note">Último registro de envío: {new Date(lead.itinerary_sent_at).toLocaleString('es-CL')} · {lead.itinerary_sent_via||'sin canal'}. Descargar el PDF no marca un envío inexistente.</footer>}
      </>}
    </main>
  </section>;
}
