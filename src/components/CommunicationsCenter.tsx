import React,{useEffect,useMemo,useState} from 'react';
import {Building2,CheckCircle2,Mail,RefreshCw,Send,Users} from 'lucide-react';
import type {Lead,LeadService,ServiceAssignment,Supplier} from '../types';
import {createActivity,loadOperationsData} from '../lib/api';
import {assertSupabase} from '../lib/supabase';

type TemplateKey='client_confirmation'|'pickup_reminder'|'missing_data'|'voucher'|'supplier_order';
type OpsState={assignments:ServiceAssignment[];suppliers:Supplier[];documents:any[]};

const templateLabels:Record<TemplateKey,string>={
  client_confirmation:'Confirmación al cliente',
  pickup_reminder:'Recordatorio de pickup',
  missing_data:'Solicitar datos faltantes',
  voucher:'Enviar voucher',
  supplier_order:'Orden al proveedor'
};

export default function CommunicationsCenter({
  lead,services,userRole,onChanged
}:{
  lead:Lead;
  services:LeadService[];
  userRole:string;
  onChanged?:()=>void;
}){
  const [ops,setOps]=useState<OpsState>({assignments:[],suppliers:[],documents:[]});
  const [template,setTemplate]=useState<TemplateKey>('client_confirmation');
  const [serviceId,setServiceId]=useState<string>(services[0]?.id||'');
  const [to,setTo]=useState('');
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [sending,setSending]=useState(false);
  const [sent,setSent]=useState(false);
  const canSend=userRole!=='viewer';

  const clientEmail=useMemo(()=>extractEmail(lead.contacto||''),[lead.contacto]);
  const selectedService=services.find(s=>s.id===serviceId)||services[0]||null;
  const assignment=selectedService?ops.assignments.find(a=>a.lead_service_id===selectedService.id):undefined;
  const supplier=assignment?ops.suppliers.find(s=>s.id===assignment.supplier_id):undefined;
  const voucher=ops.documents.find((d:any)=>d.document_type==='voucher'&&d.url);

  const load=async()=>{
    try{
      const data=await loadOperationsData();
      setOps({
        assignments:(data.assignments||[]) as ServiceAssignment[],
        suppliers:(data.suppliers||[]) as Supplier[],
        documents:(data.documents||[]).filter((d:any)=>d.lead_id===lead.id)
      });
    }catch(e:any){
      alert(e?.message||'No se pudo cargar la información para comunicaciones.');
    }
  };
  useEffect(()=>{load()},[lead.id]);

  useEffect(()=>{
    if(!services.some(s=>s.id===serviceId))setServiceId(services[0]?.id||'');
  },[services.map(s=>s.id).join(',')]);

  useEffect(()=>{
    const draft=buildTemplate(template,lead,services,selectedService,assignment,supplier,voucher);
    setTo(draft.to);
    setSubject(draft.subject);
    setBody(draft.body);
    setSent(false);
  },[
    template,lead.id,lead.contacto,lead.reserva,lead.codigo,lead.empresa_ejecuta,
    services.map(s=>`${s.id}:${s.fecha_servicio}:${s.estado_operacion}`).join('|'),
    selectedService?.id,assignment?.id,assignment?.pickup_time,assignment?.meeting_point,
    supplier?.id,supplier?.email,voucher?.url
  ]);

  const send=async()=>{
    if(!canSend)return;
    if(!to.includes('@'))return alert('Revisa el correo destinatario.');
    if(!subject.trim()||!body.trim())return alert('Completa asunto y mensaje.');
    setSending(true);setSent(false);
    try{
      const {data:{session}}=await assertSupabase().auth.getSession();
      if(!session?.access_token)throw new Error('Sesión requerida.');
      const r=await fetch('/api/send-communication',{
        method:'POST',
        headers:{
          'Content-Type':'application/json',
          Authorization:`Bearer ${session.access_token}`
        },
        body:JSON.stringify({
          to:to.trim(),
          subject:subject.trim(),
          body:body.trim(),
          leadName:lead.reserva,
          leadCode:lead.codigo,
          communicationType:templateLabels[template]
        })
      });
      const result=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(result?.error||'No se pudo enviar el correo.');

      await createActivity({
        lead_id:lead.id,
        type:'email_sent',
        title:`Correo enviado · ${templateLabels[template]}`,
        body:`Para: ${to.trim()} · Asunto: ${subject.trim()}${selectedService?` · ${selectedService.producto}`:''}`,
        created_by:'CRM'
      });
      setSent(true);
      onChanged?.();
    }catch(e:any){
      alert(e?.message||'No se pudo enviar el correo.');
    }finally{
      setSending(false);
    }
  };

  return <section className="ops-block">
    <div className="ops-head">
      <div><span className="eyebrow">COMUNICACIONES</span><h3>Cliente y proveedor desde la reserva</h3></div>
      <button className="secondary-button compact-btn" onClick={load}><RefreshCw size={14}/> Actualizar</button>
    </div>

    <p style={{margin:'0 0 14px',fontSize:11,color:'#6e685f',lineHeight:1.5}}>
      El CRM prepara el mensaje con los datos operacionales actuales. Puedes revisarlo y editarlo antes de enviarlo. Cada envío queda registrado en el timeline.
    </p>

    <div style={{display:'grid',gridTemplateColumns:'minmax(180px,1fr) minmax(180px,1fr)',gap:10}}>
      <label style={fieldStyle}><span style={labelStyle}>Tipo de comunicación</span>
        <select value={template} onChange={e=>setTemplate(e.target.value as TemplateKey)}>
          {(Object.keys(templateLabels) as TemplateKey[]).map(k=><option key={k} value={k}>{templateLabels[k]}</option>)}
        </select>
      </label>
      <label style={fieldStyle}><span style={labelStyle}>Experiencia</span>
        <select value={selectedService?.id||''} onChange={e=>setServiceId(e.target.value)} disabled={!services.length}>
          {services.map(s=><option key={s.id} value={s.id}>{dateShort(s.fecha_servicio)} · {s.producto}</option>)}
          {!services.length&&<option value="">Sin experiencias</option>}
        </select>
      </label>

      <label style={{...fieldStyle,gridColumn:'1 / -1'}}><span style={labelStyle}>Para</span>
        <input value={to} onChange={e=>setTo(e.target.value)} placeholder="correo@ejemplo.com"/>
      </label>

      <label style={{...fieldStyle,gridColumn:'1 / -1'}}><span style={labelStyle}>Asunto</span>
        <input value={subject} onChange={e=>setSubject(e.target.value)}/>
      </label>

      <label style={{...fieldStyle,gridColumn:'1 / -1'}}><span style={labelStyle}>Mensaje</span>
        <textarea value={body} onChange={e=>setBody(e.target.value)} rows={11} style={{resize:'vertical',minHeight:180}}/>
      </label>
    </div>

    <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginTop:12,flexWrap:'wrap'}}>
      <div style={{display:'flex',gap:8,alignItems:'center',fontSize:10,color:'#6e685f'}}>
        {template==='supplier_order'
          ?<><Building2 size={14}/><span>{supplier?.name||'Proveedor no asignado'}{supplier?.email?` · ${supplier.email}`:' · sin correo registrado'}</span></>
          :<><Users size={14}/><span>{clientEmail?`Cliente · ${clientEmail}`:'Cliente sin correo detectado'}</span></>}
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {sent&&<span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:10,fontWeight:700,color:'#247244'}}><CheckCircle2 size={14}/> Enviado</span>}
        <button className="primary-button compact-btn" disabled={!canSend||sending||!to.includes('@')} onClick={send}>
          <Send size={14}/>{sending?'Enviando…':'Enviar correo'}
        </button>
      </div>
    </div>

    {!canSend&&<div className="ops-warning" style={{marginTop:12}}><Mail size={15}/><span>Tu rol puede revisar el mensaje, pero no enviarlo.</span></div>}
    {template==='voucher'&&!voucher?.url&&<div className="ops-warning" style={{marginTop:12}}><Mail size={15}/><span>No hay un voucher archivado con enlace todavía. Puedes editar el mensaje o archivar primero el voucher.</span></div>}
  </section>;
}

function buildTemplate(
  template:TemplateKey,
  lead:Lead,
  services:LeadService[],
  service:LeadService|null,
  assignment:ServiceAssignment|undefined,
  supplier:Supplier|undefined,
  voucher:any
){
  const clientEmail=extractEmail(lead.contacto||'');
  const lines=[...services]
    .sort((a,b)=>String(a.fecha_servicio||'9999-12-31').localeCompare(String(b.fecha_servicio||'9999-12-31')))
    .map(s=>`• ${dateLong(s.fecha_servicio)} · ${s.producto} · ${s.numero_pax} pax`)
    .join('\n');

  const pickup=assignment?.pickup_time?String(assignment.pickup_time).slice(0,5):'por confirmar';
  const meeting=assignment?.meeting_point||lead.empresa_ejecuta||'por confirmar';
  const serviceName=service?.producto||'servicio';
  const serviceDate=dateLong(service?.fecha_servicio);

  if(template==='pickup_reminder'){
    return {
      to:clientEmail,
      subject:`Recordatorio de pickup · ${serviceName}`,
      body:`Hola ${lead.reserva},\n\nTe recordamos los datos de tu próxima experiencia:\n\nExperiencia: ${serviceName}\nFecha: ${serviceDate}\nPickup: ${pickup}\nPunto de encuentro: ${meeting}\n\nSi tienes alguna duda o necesitas informarnos un cambio, responde a este correo.\n\nHotel Experience`
    };
  }

  if(template==='missing_data'){
    return {
      to:clientEmail,
      subject:`Datos pendientes para tu reserva · ${lead.codigo}`,
      body:`Hola ${lead.reserva},\n\nPara completar correctamente tu operación necesitamos confirmar los datos pendientes de los pasajeros de la reserva ${lead.codigo}.\n\nPor favor envíanos, cuando corresponda:\n• Nombre completo\n• Nacionalidad\n• Documento de identidad o pasaporte\n• Fecha de nacimiento\n• Restricciones alimentarias\n• Información operacional relevante\n\nGracias.\n\nHotel Experience`
    };
  }

  if(template==='voucher'){
    return {
      to:clientEmail,
      subject:`Voucher de servicios · ${lead.codigo}`,
      body:`Hola ${lead.reserva},\n\nTu voucher de servicios está disponible aquí:\n${voucher?.url||'[ENLACE DE VOUCHER PENDIENTE]'}\n\nServicios confirmados:\n${lines||'Sin experiencias registradas.'}\n\nRecomendamos revisar los horarios y puntos de encuentro antes de cada salida.\n\nHotel Experience`
    };
  }

  if(template==='supplier_order'){
    const mode=assignment?.operation_mode==='delegated_partial'?'derivada parcial':assignment?.operation_mode==='delegated_full'?'derivada integral':'operación asignada';
    return {
      to:supplier?.email||'',
      subject:`Orden de servicio · ${serviceDate} · ${serviceName} · ${lead.codigo}`,
      body:`Hola ${supplier?.contact_name||supplier?.name||'equipo'},\n\nCompartimos la coordinación del siguiente servicio:\n\nReserva: ${lead.reserva} · ${lead.codigo}\nExperiencia: ${serviceName}\nFecha: ${serviceDate}\nPasajeros: ${service?.numero_pax||lead.numero_pax} pax\nPickup: ${pickup}\nPunto de encuentro: ${meeting}\nModalidad de ejecución: ${mode}\n\nObservaciones:\n${service?.observacion||'Sin observaciones adicionales.'}\n\nPor favor confirmar recepción y cualquier ajuste operativo necesario.\n\nHotel Experience`
    };
  }

  return {
    to:clientEmail,
    subject:`Confirmación de servicios · ${lead.codigo}`,
    body:`Hola ${lead.reserva},\n\nConfirmamos los servicios registrados para tu reserva ${lead.codigo}:\n\n${lines||'Sin experiencias registradas.'}\n\nLos horarios de pickup y puntos de encuentro se informarán según la coordinación vigente de cada experiencia.\n\nSi necesitas hacer algún cambio, responde a este correo.\n\nHotel Experience`
  };
}

function extractEmail(value:string){
  const matches=value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig);
  return matches?.[0]||'';
}
function dateShort(d:any){return d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha'}
function dateLong(d:any){return d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'}):'fecha por confirmar'}
const fieldStyle:React.CSSProperties={display:'grid',gap:5};
const labelStyle:React.CSSProperties={fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'};
