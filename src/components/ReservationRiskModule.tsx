import React,{useEffect,useMemo,useState} from 'react';
import {CheckCircle2,ExternalLink,Printer,Save,ShieldAlert} from 'lucide-react';
import type {Lead,LeadService,Passenger,ReservationDocument} from '../types';
import {upsertPassengerReservationDocument} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './ReservationRiskModule.css';

type RiskData={general_notes?:string;emergency_plan?:string;reviewed_scope?:string};

export default function ReservationRiskModule({
  lead,services,passenger,document,onChanged
}:{
  lead:Lead;
  services:LeadService[];
  passenger:Passenger;
  document?:ReservationDocument|null;
  onChanged?:()=>void;
}){
  const [risk,setRisk]=useState<ReservationDocument|null>(document||null);
  const [notes,setNotes]=useState('');
  const [emergencyPlan,setEmergencyPlan]=useState('');
  const [reviewedScope,setReviewedScope]=useState('');
  const [url,setUrl]=useState('');
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');

  const itinerary=useMemo(()=>[...services]
    .filter(item=>item.lead_id===lead.id)
    .sort((a,b)=>`${a.fecha_servicio||'9999'} ${a.hora_inicio||''}`.localeCompare(`${b.fecha_servicio||'9999'} ${b.hora_inicio||''}`)),[services,lead.id]);

  const declaredAlerts=useMemo(()=>[
    passenger.dietary_restrictions,
    passenger.medical_notes,
    passenger.disability_type
  ].filter(Boolean).join(' · '),[passenger.dietary_restrictions,passenger.medical_notes,passenger.disability_type]);

  const autoNotes=declaredAlerts
    ?`Antecedentes declarados del pasajero: ${declaredAlerts}`
    :'Sin alertas declaradas por el pasajero en su ficha.';
  const autoScope=`Itinerario completo de ${itinerary.length} tour${itinerary.length===1?'':'s'} revisado para ${passenger.full_name||passenger.passenger_code} (${passenger.passenger_code}).`;

  const apply=(row:ReservationDocument|null)=>{
    const data=(row?.risk_data||{}) as RiskData;
    setRisk(row);
    setNotes(data.general_notes||autoNotes);
    setEmergencyPlan(data.emergency_plan||'');
    setReviewedScope(data.reviewed_scope||autoScope);
    setUrl(row?.url||'');
  };

  useEffect(()=>{
    if(document!==undefined){apply(document||null);return}
    let active=true;
    void assertSupabase().from('reservation_documents').select('*')
      .eq('lead_id',lead.id)
      .eq('passenger_id',passenger.id)
      .eq('document_type','risk_sheet')
      .maybeSingle()
      .then(({data})=>{if(active)apply((data||null) as ReservationDocument|null)});
    return()=>{active=false};
  },[lead.id,passenger.id,document?.id]);

  const save=async(status=risk?.status||'Pendiente')=>{
    setSaving(true);setMessage('');
    try{
      await upsertPassengerReservationDocument(lead.id,passenger.id,'risk_sheet',{
        title:`Hoja de riesgo · ${passenger.passenger_code}`,
        status,
        url:url.trim()||null,
        risk_data:{
          general_notes:notes.trim(),
          emergency_plan:emergencyPlan.trim(),
          reviewed_scope:reviewedScope.trim()
        }
      });
      const {data}=await assertSupabase().from('reservation_documents').select('*')
        .eq('lead_id',lead.id)
        .eq('passenger_id',passenger.id)
        .eq('document_type','risk_sheet')
        .maybeSingle();
      apply((data||null) as ReservationDocument|null);
      setMessage(status==='Completada'?'Hoja individual completada.':'Hoja individual guardada.');
      onChanged?.();
    }catch(error:any){
      setMessage(error?.message||'No se pudo guardar la hoja de riesgo.');
    }finally{setSaving(false)}
  };

  const print=()=>{
    const win=window.open('','_blank');
    if(!win)return;
    win.opener=null;
    win.document.open();
    win.document.write(buildRiskHtml(lead,itinerary,passenger,{
      general_notes:notes,
      emergency_plan:emergencyPlan,
      reviewed_scope:reviewedScope
    }));
    win.document.close();
  };

  return <section className="risk-module">
    <header>
      <div>
        <span>HOJA DE RIESGO · PASAJERO</span>
        <h2>{passenger.full_name||passenger.passenger_code}</h2>
        <p>{lead.codigo} · {passenger.passenger_code} · autorellenada desde itinerario y ficha nominal.</p>
      </div>
      <div className={`risk-module-status ${risk?.status==='Completada'?'done':''}`}>
        {risk?.status==='Completada'?<CheckCircle2 size={15}/>:<ShieldAlert size={15}/>} {risk?.status||'Pendiente'}
      </div>
    </header>

    <div className="risk-source-grid">
      <article>
        <span>ITINERARIO BASE</span>
        <strong>{itinerary.length} tour{itinerary.length===1?'':'s'}</strong>
        {itinerary.map(item=><p key={item.id}>
          <b>{date(item.fecha_servicio)} · {time(item.hora_inicio)}</b>
          {item.producto}
          <small>{item.service_code} · {modality(item.modality)}{item.observacion?` · ${item.observacion}`:''}</small>
        </p>)}
      </article>
      <article>
        <span>PASAJERO AUTORRELLENADO</span>
        <strong>{passenger.full_name||'Nombre pendiente'} · {age(passenger.birth_date)}</strong>
        <p>
          <b>{passenger.passenger_code}</b>
          {[passenger.document_type,passenger.document_number].filter(Boolean).join(' · ')||'Documento pendiente'}
          <small>{[
            passenger.nationality,
            passenger.phone,
            passenger.email
          ].filter(Boolean).join(' · ')||'Contacto / nacionalidad sin completar'}</small>
        </p>
        <p>
          <b>Alertas declaradas</b>
          {declaredAlerts||'Sin alertas declaradas'}
          <small>Se toma directamente de la ficha del pasajero.</small>
        </p>
      </article>
    </div>

    <div className="risk-editor-grid">
      <label><span>Riesgos y observaciones generales</span><textarea value={notes} onChange={event=>setNotes(event.target.value)} placeholder="Altitud, clima, movilidad, condiciones declaradas y medidas acordadas…"/></label>
      <label><span>Plan / respuesta de emergencia</span><textarea value={emergencyPlan} onChange={event=>setEmergencyPlan(event.target.value)} placeholder="Responsable, comunicación, derivación y medidas particulares…"/></label>
      <label><span>Alcance revisado</span><textarea value={reviewedScope} onChange={event=>setReviewedScope(event.target.value)} placeholder="Qué etapas del itinerario fueron revisadas para este pasajero…"/></label>
      <label><span>Documento o respaldo externo</span><input value={url} onChange={event=>setUrl(event.target.value)} placeholder="https://… opcional"/>{url&&<a href={url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Abrir respaldo</a>}</label>
    </div>

    {message&&<div className={message.startsWith('No se')?'risk-message error':'risk-message'}>{message}</div>}
    <footer>
      <button type="button" onClick={print}><Printer size={14}/> Imprimir / PDF</button>
      <button type="button" disabled={saving} onClick={()=>void save()}><Save size={14}/> {saving?'Guardando…':'Guardar'}</button>
      <button className="primary" type="button" disabled={saving} onClick={()=>void save('Completada')}><CheckCircle2 size={14}/> Marcar completada</button>
    </footer>
  </section>;
}

function date(value?:string|null){if(!value)return'Fecha pendiente';const [y,m,d]=String(value).slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('es-CL',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d,12))}
function time(value?:string|null){return value?String(value).slice(0,5):'Hora pendiente'}
function modality(value?:string|null){const key=String(value||'').toLowerCase();if(key.includes('semi'))return'Semiprivado';if(key.includes('priv'))return'Privado';if(/regular|shared|low|compart/.test(key))return'Regular';return value||'Por definir'}
function age(value?:string|null){if(!value)return'edad pendiente';const born=new Date(`${String(value).slice(0,10)}T12:00:00`);if(Number.isNaN(born.getTime()))return'edad pendiente';const now=new Date();let years=now.getFullYear()-born.getFullYear();if(now.getMonth()<born.getMonth()||(now.getMonth()===born.getMonth()&&now.getDate()<born.getDate()))years-=1;return `${Math.max(0,years)} años`}
function escape(value:unknown){return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]||char))}

function buildRiskHtml(lead:Lead,services:LeadService[],passenger:Passenger,data:RiskData){
  const tours=services.map(item=>`<tr><td>${escape(date(item.fecha_servicio))}</td><td>${escape(time(item.hora_inicio))}</td><td><b>${escape(item.producto)}</b><small>${escape(item.service_code||item.tour_id||'')}</small></td><td>${escape(modality(item.modality))}</td><td>${escape(item.observacion||'')}</td></tr>`).join('');
  const alerts=[passenger.dietary_restrictions,passenger.medical_notes,passenger.disability_type].filter(Boolean).join(' · ')||'Sin alertas declaradas';
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Hoja de riesgo ${escape(passenger.passenger_code)}</title><style>body{font-family:Arial,sans-serif;color:#171717;margin:24px}header{display:flex;justify-content:space-between;border-bottom:2px solid #111;padding-bottom:12px}h1{font-size:22px;margin:3px 0}small{display:block;color:#666;margin-top:3px}table{width:100%;border-collapse:collapse;margin:14px 0 22px}th,td{border-bottom:1px solid #ccc;text-align:left;padding:8px;font-size:11px;vertical-align:top}th{background:#171717;color:#fff;font-size:9px}.notes{display:grid;grid-template-columns:1fr 1fr;gap:10px}.notes div{border:1px solid #ccc;padding:10px;min-height:70px;font-size:11px}.tools{position:fixed;right:18px;top:18px}.tools button{padding:10px 14px}@media print{.tools{display:none}body{margin:12mm}}</style></head><body><div class="tools"><button onclick="window.print()">Imprimir / Guardar PDF</button></div><header><div><small>HOTEL EXPERIENCE</small><h1>HOJA DE RIESGO INDIVIDUAL</h1><span>Autorrellenada desde itinerario y ficha nominal</span></div><b>${escape(passenger.passenger_code)}</b></header><h2>Pasajero</h2><table><tbody><tr><th>Reserva</th><td>${escape(lead.codigo)}</td><th>Nombre</th><td>${escape(passenger.full_name)}</td></tr><tr><th>Edad</th><td>${escape(age(passenger.birth_date))}</td><th>Documento</th><td>${escape([passenger.document_type,passenger.document_number].filter(Boolean).join(' · ')||'Pendiente')}</td></tr><tr><th>Nacionalidad</th><td>${escape(passenger.nationality||'Pendiente')}</td><th>Alertas</th><td>${escape(alerts)}</td></tr></tbody></table><h2>Itinerario base</h2><table><thead><tr><th>Fecha</th><th>Hora</th><th>Tour</th><th>Modalidad</th><th>Observación</th></tr></thead><tbody>${tours}</tbody></table><div class="notes"><div><b>Riesgos y observaciones</b><p>${escape(data.general_notes||'Sin registrar')}</p></div><div><b>Plan de emergencia</b><p>${escape(data.emergency_plan||'Sin registrar')}</p></div><div><b>Alcance revisado</b><p>${escape(data.reviewed_scope||'Sin registrar')}</p></div><div><b>Validación</b><p>Nombre / firma: ____________________________</p><p>Fecha: __________________</p></div></div></body></html>`;
}
