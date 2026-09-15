import React,{useEffect,useMemo,useState} from 'react';
import {Download,MapPin,Plane,Users} from 'lucide-react';
import type {Lead,LeadService,LeadServicePassengerLink,Passenger} from '../types';
import {assertSupabase} from '../lib/supabase';
import {downloadCustomerItinerary,humanModality,itineraryRows,modalityExplanation,passengerNames,passengersForService,pickupPoint,type CatalogHint} from '../lib/customerItinerary';
import './CustomerItineraryPreview.css';

export default function CustomerItineraryPreview({lead,services,passengers,compact=false}:{lead:Lead;services:LeadService[];passengers:Passenger[];compact?:boolean}){
  const [catalog,setCatalog]=useState<CatalogHint[]>([]);
  const [participantLinks,setParticipantLinks]=useState<LeadServicePassengerLink[]>([]);
  const [loading,setLoading]=useState(false);
  const relevant=useMemo(()=>services.filter(s=>s.lead_id===lead.id),[services,lead.id]);
  const ids=useMemo(()=>Array.from(new Set(relevant.map(s=>s.product_catalog_id).filter(Boolean) as string[])),[relevant]);

  useEffect(()=>{
    let active=true;
    const load=async()=>{
      setLoading(true);
      const serviceIds=relevant.map(item=>item.id);
      const [catalogResult,linksResult]=await Promise.all([
        ids.length?assertSupabase().from('product_catalog').select('id,duration_hours,schedule').in('id',ids):Promise.resolve({data:[]} as any),
        serviceIds.length?assertSupabase().from('lead_service_passengers').select('*').in('lead_service_id',serviceIds):Promise.resolve({data:[]} as any)
      ]);
      if(active){setCatalog((catalogResult.data||[]) as CatalogHint[]);setParticipantLinks((linksResult.data||[]) as LeadServicePassengerLink[])}
      if(active)setLoading(false);
    };
    void load();return()=>{active=false};
  },[ids.join('|'),relevant.map(item=>item.id).join('|')]);

  const input={lead,passengers,services:relevant,catalog,participantLinks};
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
      <thead><tr><th>Día</th><th>Fecha</th><th>Horario</th><th>Pickup est.</th><th>Experiencia</th><th>Modalidad</th><th>Lista pax del tour</th></tr></thead>
      <tbody>{rows.map(row=>{const tourPassengers=passengersForService(row.serviceId,passengers,participantLinks);return <tr key={row.id}><td>{row.day}</td><td>{row.date}</td><td><b>{row.schedule}</b></td><td>{row.pickup}</td><td><b>{row.experience}</b><small>{row.serviceCode}</small></td><td>{row.modality}</td><td><b>{tourPassengers.map(item=>`${item.full_name} (${age(item.birth_date)})`).join(' · ')||'Lista pendiente'}</b><small>{tourPassengers.map(item=>item.passenger_code).join(' · ')}</small></td></tr>})}</tbody>
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

function age(value?:string|null){if(!value)return'edad s/i';const born=new Date(`${String(value).slice(0,10)}T12:00:00`);if(Number.isNaN(born.getTime()))return'edad s/i';const now=new Date();let years=now.getFullYear()-born.getFullYear();if(now.getMonth()<born.getMonth()||(now.getMonth()===born.getMonth()&&now.getDate()<born.getDate()))years-=1;return `${Math.max(0,years)} a.`}
