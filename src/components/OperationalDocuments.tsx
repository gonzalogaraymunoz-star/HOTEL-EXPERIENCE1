import React,{useEffect,useMemo,useState} from 'react';
import {ClipboardList,FileText,MapPinned,Printer,RefreshCw,TicketCheck,Users} from 'lucide-react';
import type {Lead,LeadService,Passenger,ReservationDocument,ServiceAssignment,ServicePerson,Supplier,Vehicle,OperationalResource,ServiceResourceAssignment} from '../types';
import {loadOperationsData,loadOperationsDirectory} from '../lib/api';

type DocKind='operation'|'manifest'|'voucher'|'itinerary';
type OpsData={
  passengers:Passenger[];
  suppliers:Supplier[];
  vehicles:Vehicle[];
  assignments:ServiceAssignment[];
  documents:ReservationDocument[];
  people:ServicePerson[];
  resources:OperationalResource[];
  resourceAssignments:ServiceResourceAssignment[];
};

const coverageLabels:Record<string,string>={
  vehicle:'Vehículo',driver:'Conductor',guide:'Guía',food:'Alimentación',coordination:'Coordinación',resources:'Insumos',entrances:'Entradas'
};
const fullCoverage=Object.keys(coverageLabels);

export default function OperationalDocuments({lead,services}:{lead:Lead;services:LeadService[]}){
  const [data,setData]=useState<OpsData>({passengers:[],suppliers:[],vehicles:[],assignments:[],documents:[],people:[],resources:[],resourceAssignments:[]});
  const [loading,setLoading]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{
      const [ops,dir]=await Promise.all([loadOperationsData(),loadOperationsDirectory()]);
      setData({
        passengers:(ops.passengers||[]).filter((p:Passenger)=>p.lead_id===lead.id),
        suppliers:ops.suppliers||[],
        vehicles:ops.vehicles||[],
        assignments:(ops.assignments||[]).filter((a:ServiceAssignment)=>services.some(s=>s.id===a.lead_service_id)),
        documents:(ops.documents||[]).filter((d:ReservationDocument)=>d.lead_id===lead.id),
        people:dir.people||[],
        resources:dir.resources||[],
        resourceAssignments:(dir.resourceAssignments||[]).filter((r:ServiceResourceAssignment)=>services.some(s=>s.id===r.lead_service_id))
      });
    }catch(e:any){
      alert(e?.message||'No se pudieron cargar los datos para documentos.');
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[lead.id,services.map(s=>s.id).join(',')]);

  const orderedServices=useMemo(()=>[...services].sort((a,b)=>String(a.fecha_servicio||'9999-12-31').localeCompare(String(b.fecha_servicio||'9999-12-31'))),[services]);
  const risk=data.documents.find(d=>d.document_type==='risk_sheet');

  const generate=(kind:DocKind)=>{
    const html=buildDocument(kind,lead,orderedServices,data,risk);
    const w=window.open('','_blank','noopener,noreferrer');
    if(!w)return alert('El navegador bloqueó la ventana. Habilita pop-ups para generar el documento.');
    w.document.open();
    w.document.write(html);
    w.document.close();
  };

  return <section className="ops-block">
    <div className="ops-head">
      <div><span className="eyebrow">DOCUMENTOS OPERACIONALES</span><h3>Generar desde la ficha 360°</h3></div>
      <button className="secondary-button compact-btn" onClick={load} disabled={loading}><RefreshCw size={14}/> Actualizar datos</button>
    </div>
    <p style={{margin:'0 0 14px',fontSize:11,color:'#6e685f',lineHeight:1.5}}>Los documentos usan la información actual del CRM. Se abren en una vista limpia para imprimir o guardar como PDF; no incluyen datos que no estén registrados.</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
      <DocButton icon={<ClipboardList/>} title="Hoja operacional" detail="Proveedor, cobertura, pickup, equipo, recursos y estado de riesgo." disabled={loading} onClick={()=>generate('operation')}/>
      <DocButton icon={<Users/>} title="Manifiesto de pasajeros" detail="Lista nominal completa con documentos, contacto y restricciones." disabled={loading} onClick={()=>generate('manifest')}/>
      <DocButton icon={<TicketCheck/>} title="Voucher cliente" detail="Confirmación limpia para entregar al pasajero, sin costos internos." disabled={loading} onClick={()=>generate('voucher')}/>
      <DocButton icon={<MapPinned/>} title="Itinerario" detail="Experiencias ordenadas por fecha, pickup, encuentro y observaciones." disabled={loading} onClick={()=>generate('itinerary')}/>
    </div>
    {!data.passengers.length&&<div className="ops-warning" style={{marginTop:12}}><FileText size={15}/><span>El manifiesto puede generarse, pero aún no hay pasajeros individuales registrados.</span></div>}
  </section>;
}

function DocButton({icon,title,detail,disabled,onClick}:{icon:React.ReactNode;title:string;detail:string;disabled:boolean;onClick:()=>void}){
  return <button type="button" disabled={disabled} onClick={onClick} className="secondary-button" style={{justifyContent:'flex-start',textAlign:'left',height:'auto',padding:14,gap:11}}>
    <span style={{display:'grid',placeItems:'center',width:34,height:34,border:'1px solid #d7d0c5',borderRadius:'50%',flex:'0 0 auto'}}>{icon}</span>
    <span style={{display:'grid',gap:3}}><b style={{fontSize:12}}>{title}</b><small style={{fontSize:9,lineHeight:1.35,color:'#6e685f'}}>{detail}</small></span>
    <Printer size={14} style={{marginLeft:'auto'}}/>
  </button>;
}

function buildDocument(kind:DocKind,lead:Lead,services:LeadService[],data:OpsData,risk?:ReservationDocument){
  const title=kind==='operation'?'Hoja operacional':kind==='manifest'?'Manifiesto de pasajeros':kind==='voucher'?'Voucher de servicios':'Itinerario';
  const body=kind==='operation'?operationBody(lead,services,data,risk):kind==='manifest'?manifestBody(lead,services,data):kind==='voucher'?voucherBody(lead,services,data):itineraryBody(lead,services,data);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${h(title)} · ${h(lead.codigo)}</title><style>${printCss}</style></head><body>
  <div class="print-tools"><button onclick="window.print()">Imprimir / Guardar PDF</button></div>
  <main><header class="brand"><div><span>HOTEL EXPERIENCE · LINK</span><h1>${h(title)}</h1></div><div class="code">${h(lead.codigo)}</div></header>
  <section class="summary"><div><small>Cliente / reserva</small><b>${h(lead.reserva)}</b></div><div><small>Hotel / origen</small><b>${h(lead.empresa_ejecuta||'Sin registrar')}</b></div><div><small>Pasajeros</small><b>${h(String(lead.numero_pax||0))}</b></div><div><small>Generado</small><b>${h(new Date().toLocaleString('es-CL'))}</b></div></section>
  ${body}
  <footer>Documento generado desde Hotel Experience. Verifica los datos operacionales antes de utilizarlo.</footer></main></body></html>`;
}

function operationBody(_lead:Lead,services:LeadService[],data:OpsData,risk?:ReservationDocument){
  const cards=services.map(service=>{
    const a=data.assignments.find(x=>x.lead_service_id===service.id);
    const supplier=data.suppliers.find(x=>x.id===a?.supplier_id);
    const vehicle=data.vehicles.find(x=>x.id===a?.vehicle_id);
    const guide=data.people.find(x=>x.id===a?.guide_person_id);
    const driver=data.people.find(x=>x.id===a?.driver_person_id);
    const cook=data.people.find(x=>x.id===a?.cook_person_id);
    const coordinator=data.people.find(x=>x.id===a?.coordinator_person_id);
    const mode=a?.operation_mode||(a?.supplier_id?'delegated_full':'direct');
    const coverage=mode==='delegated_full'?fullCoverage:(Array.isArray(a?.supplier_coverage)?a!.supplier_coverage:[]);
    const covered=(key:string)=>Boolean(a?.supplier_id)&&mode!=='direct'&&coverage.includes(key);
    const resourceAssignments=data.resourceAssignments.filter(x=>x.lead_service_id===service.id);
    const resources=resourceAssignments.map(ra=>{
      const r=data.resources.find(x=>x.id===ra.resource_id);
      return r?`${r.name} × ${ra.quantity}`:null;
    }).filter(Boolean).join(', ');
    const modeLabel=mode==='delegated_full'?'Derivada integral':mode==='delegated_partial'?'Derivada parcial':'Operación directa';
    return `<article class="service-card">
      <div class="service-head"><div><small>${h(dateFmt(service.fecha_servicio))}</small><h2>${h(service.producto)}</h2></div><b>${h(modeLabel)}</b></div>
      <div class="grid">
        ${cell('Proveedor responsable',supplier?.name||'Operación interna')}
        ${cell('Pickup',a?.pickup_time?String(a.pickup_time).slice(0,5):'Sin registrar')}
        ${cell('Punto de encuentro',a?.meeting_point||'Sin registrar')}
        ${cell('Pax',String(service.numero_pax||0))}
        ${cell('Guía',covered('guide')?`A cargo de ${supplier?.name||'proveedor'}`:(guide?.full_name||a?.guide_name||'Sin asignar'))}
        ${cell('Conductor',covered('driver')?`A cargo de ${supplier?.name||'proveedor'}`:(driver?.full_name||a?.driver_name||'Sin asignar'))}
        ${cell('Vehículo',covered('vehicle')?`A cargo de ${supplier?.name||'proveedor'}`:(vehicle?[vehicle.plate,vehicle.label].filter(Boolean).join(' · '):'Sin asignar'))}
        ${cell('Alimentación',covered('food')?`A cargo de ${supplier?.name||'proveedor'}`:(cook?.full_name||'No asignada'))}
        ${cell('Coordinación',covered('coordination')?`A cargo de ${supplier?.name||'proveedor'}`:(coordinator?.full_name||'No asignada'))}
        ${cell('Insumos',covered('resources')?`A cargo de ${supplier?.name||'proveedor'}`:(resources||'Sin asignar'))}
      </div>
      ${coverage.length?`<p class="note"><b>Cobertura proveedor:</b> ${h(coverage.map(x=>coverageLabels[x]||x).join(' · '))}</p>`:''}
      ${service.observacion?`<p class="note"><b>Observación:</b> ${h(service.observacion)}</p>`:''}
    </article>`;
  }).join('');
  return `<section class="section-title"><h2>Operación</h2><p>Estado hoja de riesgo: <b>${h(risk?.status||'Pendiente')}</b></p></section>${cards}`;
}

function manifestBody(_lead:Lead,services:LeadService[],data:OpsData){
  const serviceList=services.map(s=>`${dateFmt(s.fecha_servicio)} · ${s.producto}`).join(' | ');
  const rows=data.passengers.length?data.passengers.map(p=>`<tr><td>${h(p.passenger_code)}</td><td><b>${h(p.full_name)}</b></td><td>${h(p.nationality||'')}</td><td>${h([p.document_type,p.document_number].filter(Boolean).join(' '))}</td><td>${h(p.birth_date||'')}</td><td>${h(p.phone||'')}</td><td>${h(p.email||'')}</td><td>${h(p.dietary_restrictions||'')}</td><td>${h(p.medical_notes||'')}</td></tr>`).join(''):`<tr><td colspan="9">No hay pasajeros individuales registrados.</td></tr>`;
  return `<section class="section-title"><h2>Servicios asociados</h2><p>${h(serviceList||'Sin servicios')}</p></section><table><thead><tr><th>Código</th><th>Nombre</th><th>Nacionalidad</th><th>Documento</th><th>Nacimiento</th><th>Teléfono</th><th>Email</th><th>Restricciones</th><th>Notas</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function voucherBody(lead:Lead,services:LeadService[],data:OpsData){
  const contact=(lead.contacto||'').split('|').map(x=>x.trim()).filter(Boolean).join(' · ');
  const serviceRows=services.map(service=>{
    const a=data.assignments.find(x=>x.lead_service_id===service.id);
    return `<article class="voucher-service"><small>${h(dateFmt(service.fecha_servicio))}</small><h2>${h(service.producto)}</h2><div class="grid">${cell('Pasajeros',String(service.numero_pax||lead.numero_pax||0))}${cell('Pickup',a?.pickup_time?String(a.pickup_time).slice(0,5):'Por confirmar')}${cell('Punto de encuentro',a?.meeting_point||'Por confirmar')}${cell('Estado',service.estado_operacion||'Pendiente')}</div>${service.observacion?`<p class="note">${h(service.observacion)}</p>`:''}</article>`;
  }).join('');
  return `<section class="section-title"><h2>Confirmación de servicios</h2><p>${h(contact||'Contacto no registrado')}</p></section>${serviceRows}<div class="notice">Presenta este voucher cuando el equipo o proveedor lo solicite. Los horarios y puntos de encuentro deben confirmarse con la operación vigente.</div>`;
}

function itineraryBody(lead:Lead,services:LeadService[],data:OpsData){
  const rows=services.map((service,index)=>{
    const a=data.assignments.find(x=>x.lead_service_id===service.id);
    return `<article class="itinerary-row"><div class="day">${index+1}</div><div><small>${h(dateFmt(service.fecha_servicio))}</small><h2>${h(service.producto)}</h2><p>${a?.pickup_time?`Pickup ${h(String(a.pickup_time).slice(0,5))}`:'Horario por confirmar'}${a?.meeting_point?` · ${h(a.meeting_point)}`:''}</p>${service.observacion?`<p class="note">${h(service.observacion)}</p>`:''}</div></article>`;
  }).join('');
  return `<section class="section-title"><h2>Programa de viaje</h2><p>${h(lead.reserva)} · ${h(String(lead.numero_pax||0))} pasajero(s)</p></section>${rows||'<p>Sin experiencias registradas.</p>'}`;
}

function cell(label:string,value:any){return `<div class="cell"><small>${h(label)}</small><b>${h(String(value??''))}</b></div>`}
function h(v:any){return String(v??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]||m));}
function dateFmt(d:any){return d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'}):'Fecha por definir';}

const printCss=`
*{box-sizing:border-box}body{margin:0;background:#f4f0e8;color:#151515;font-family:Arial,Helvetica,sans-serif}.print-tools{position:sticky;top:0;padding:10px 20px;background:#111;display:flex;justify-content:flex-end}.print-tools button{border:0;background:#fff;color:#111;padding:9px 14px;border-radius:999px;font-weight:700;cursor:pointer}main{max-width:1000px;margin:24px auto;background:#fff;padding:38px}.brand{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:18px}.brand span,.section-title small{font-size:10px;letter-spacing:.12em}.brand h1{font-size:30px;margin:6px 0 0}.code{font-size:15px;font-weight:800}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:20px 0}.summary>div,.cell{border:1px solid #d8d2c8;border-radius:8px;padding:10px}.summary small,.cell small{display:block;font-size:8px;text-transform:uppercase;letter-spacing:.08em;color:#6c665f;margin-bottom:5px}.summary b,.cell b{font-size:11px}.section-title{margin:28px 0 12px}.section-title h2{margin:0 0 5px;font-size:18px}.section-title p{margin:0;color:#5f5a53;font-size:11px}.service-card,.voucher-service{border:1px solid #d8d2c8;border-radius:10px;padding:16px;margin-bottom:12px;break-inside:avoid}.service-head{display:flex;justify-content:space-between;gap:20px;margin-bottom:12px}.service-head h2,.voucher-service h2,.itinerary-row h2{margin:3px 0;font-size:17px}.service-head small,.voucher-service small,.itinerary-row small{font-size:9px;color:#6c665f}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.note{font-size:10px;line-height:1.45;background:#f7f4ef;padding:9px;border-radius:7px;margin:9px 0 0}.notice{border:1px solid #111;padding:12px;margin-top:18px;font-size:10px;line-height:1.45}.itinerary-row{display:grid;grid-template-columns:38px 1fr;gap:14px;border-top:1px solid #d8d2c8;padding:16px 0;break-inside:avoid}.day{width:32px;height:32px;border:1px solid #111;border-radius:50%;display:grid;place-items:center;font-weight:800}.itinerary-row p{margin:4px 0;font-size:10px}table{width:100%;border-collapse:collapse;font-size:9px}th,td{border:1px solid #d8d2c8;padding:7px;text-align:left;vertical-align:top}th{background:#f3f0ea;text-transform:uppercase;font-size:7px;letter-spacing:.06em}footer{margin-top:28px;padding-top:12px;border-top:1px solid #d8d2c8;color:#777;font-size:8px}@media print{body{background:#fff}.print-tools{display:none}main{max-width:none;margin:0;padding:0}.service-card,.voucher-service,.itinerary-row{page-break-inside:avoid}}@media(max-width:700px){main{margin:0;padding:18px}.summary,.grid{grid-template-columns:1fr 1fr}}
`;
