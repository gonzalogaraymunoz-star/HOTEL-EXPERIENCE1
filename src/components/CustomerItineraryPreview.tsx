import React,{useEffect,useMemo,useState} from 'react';
import {Download,MapPin,Plane,Users} from 'lucide-react';
import type {Lead,LeadService,Passenger} from '../types';
import {assertSupabase} from '../lib/supabase';
import {downloadCustomerItinerary,humanModality,itineraryRows,modalityExplanation,passengerNames,pickupPoint,type CatalogHint} from '../lib/customerItinerary';
import './CustomerItineraryPreview.css';

export default function CustomerItineraryPreview({lead,services,passengers,compact=false}:{lead:Lead;services:LeadService[];passengers:Passenger[];compact?:boolean}){
  const [catalog,setCatalog]=useState<CatalogHint[]>([]);
  const [loading,setLoading]=useState(false);
  const relevant=useMemo(()=>services.filter(s=>s.lead_id===lead.id),[services,lead.id]);
  const ids=useMemo(()=>Array.from(new Set(relevant.map(s=>s.product_catalog_id).filter(Boolean) as string[])),[relevant]);

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      if(!ids.length){setCatalog([]);return}
      setLoading(true);
      const {data}=await assertSupabase().from('product_catalog').select('id,duration_hours,schedule').in('id',ids);
      if(active)setCatalog((data||[]) as CatalogHint[]);
      if(active)setLoading(false);
    };
    void load();return()=>{active=false};
  },[ids.join('|')]);

  const input={lead,passengers,services:relevant,catalog};
  const rows=itineraryRows(input);
  const names=passengerNames(passengers,lead);
  const modalities=Array.from(new Set(rows.map(row=>row.modality)));

  return <article className={`customer-itinerary-sheet ${compact?'compact':''}`}>
    <header className="customer-itinerary-brand">
      <div><b>LINK</b><span>HOTEL EXPERIENCE</span></div>
      <strong>{lead.codigo}</strong>
    </header>

    <section className="customer-itinerary-title">
      <div><span>DOCUMENTO DEL PASAJERO</span><h2>ITINERARIO</h2><p>La misma información comercial confirmada alimenta la operación. No se vuelve a escribir la reserva.</p></div>
      <button type="button" onClick={()=>downloadCustomerItinerary(input)} disabled={loading}><Download size={15}/> Descargar PDF</button>
    </section>

    <section className="customer-itinerary-identity">
      <div><Users size={15}/><span><small>PASAJEROS</small><b>{names.join(' · ')}</b></span></div>
      <div><MapPin size={15}/><span><small>HOTEL / ORIGEN</small><b>{lead.empresa_ejecuta||'Por confirmar'}</b></span></div>
    </section>

    <div className="customer-itinerary-table-wrap"><table className="customer-itinerary-table">
      <thead><tr><th>Día</th><th>Fecha</th><th>Horario</th><th>Pickup est.</th><th>Experiencia</th><th>Modalidad</th></tr></thead>
      <tbody>{rows.map(row=><tr key={row.id}><td>{row.day}</td><td>{row.date}</td><td><b>{row.schedule}</b></td><td>{row.pickup}</td><td><b>{row.experience}</b><small>{row.serviceCode}</small></td><td>{row.modality}</td></tr>)}</tbody>
    </table>{!rows.length&&<div className="customer-itinerary-empty">Todavía no hay servicios con fecha confirmada para este itinerario.</div>}</div>

    <section className="customer-itinerary-trip">
      <div><MapPin size={14}/><span><small>PUNTO DE RECOGIDA</small><b>{pickupPoint(lead)}</b></span></div>
      <div><Plane size={14}/><span><small>VUELO LLEGADA</small><b>{lead.arrival_flight_number||'No informado'}</b></span></div>
      <div><Plane size={14}/><span><small>VUELO SALIDA</small><b>{lead.departure_flight_number||'No informado'}</b></span></div>
      <div><span><small>HABITACIÓN</small><b>{lead.hotel_room||'No informada'}</b></span></div>
    </section>

    {modalities.length>0&&<section className="customer-itinerary-modalities"><header><span>MODALIDADES</span><strong>Cómo se ejecuta cada servicio</strong></header><div>{modalities.map(label=><article key={label}><b>{humanModality(label)}</b><p>{modalityExplanation(label)}</p></article>)}</div></section>}

    <section className="customer-itinerary-recommendations"><span>RECOMENDACIONES</span><p>Revisa horario y punto de recogida antes de cada salida. Lleva agua, protección solar, abrigo por capas y documento de identificación cuando corresponda. Si un dato aparece como “Por confirmar”, Operaciones todavía debe validarlo y no se inventa información.</p></section>

    <footer><span>LINK · HOTEL EXPERIENCE</span><b>{lead.codigo}</b></footer>
  </article>;
}
