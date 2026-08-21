import React,{useEffect,useState} from 'react';
import {Check,Clock3,Download,ExternalLink,FileCheck2,MapPin,Phone,Plus,ShieldAlert,Trash2,WalletCards} from 'lucide-react';
import type {Lead,LeadService,Passenger,Supplier,Vehicle,ServiceAssignment,ReservationDocument,ServicePerson,OperationalResource} from '../types';
import {createPassenger,deletePassenger,loadOperationsData,loadOperationsDirectory,assignResourceToService,removeResourceFromService,updateServiceAssignment,upsertReservationDocument} from '../lib/api';
import ServiceFinanceCard from './ServiceFinanceCard';
import './OperationCoverage.css';

type CoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
type OperationMode='direct'|'delegated_full'|'delegated_partial';

const coverageOptions:{key:CoverageKey;label:string;detail:string}[]=[
  {key:'vehicle',label:'Vehículo',detail:'Vehículo, patente y logística de transporte'},
  {key:'driver',label:'Conductor',detail:'Conductor incluido por el operador'},
  {key:'guide',label:'Guía',detail:'Guía o guía de montaña incluido'},
  {key:'food',label:'Alimentación',detail:'Desayuno, snack, cocina o alimentación'},
  {key:'coordination',label:'Coordinación',detail:'Coordinación y soporte en terreno'},
  {key:'resources',label:'Insumos',detail:'Equipamiento y materiales necesarios'},
  {key:'entrances',label:'Entradas',detail:'Entradas o tickets incluidos en la compra'}
];
const fullCoverage=coverageOptions.map(x=>x.key);

export default function ReservationOperations({lead,services,userRole,onChanged}:{lead:Lead;services:LeadService[];userRole:string;onChanged:()=>void}){
  const [data,setData]=useState<any>({passengers:[],suppliers:[],vehicles:[],assignments:[],documents:[]});
  const [directory,setDirectory]=useState<any>({people:[],resources:[],resourceAssignments:[]});
  const [loading,setLoading]=useState(true);
  const [paxOpen,setPaxOpen]=useState(false);
  const [pax,setPax]=useState<any>({full_name:'',email:'',phone:'',nationality:'',document_type:'Pasaporte',document_number:'',birth_date:'',dietary_restrictions:'',medical_notes:'',app_user_ref:'',is_primary:false});
  const [riskUrl,setRiskUrl]=useState('');
  const canEdit=userRole!=='viewer';
  const canDelete=['admin','manager'].includes(userRole);

  const load=async()=>{
    setLoading(true);
    try{
      const [all,dir]=await Promise.all([loadOperationsData(),loadOperationsDirectory()]);
      const relevantAssignments=all.assignments.filter((a:ServiceAssignment)=>services.some(s=>s.id===a.lead_service_id));
      setDirectory(dir);
      setData({
        ...all,
        passengers:all.passengers.filter((x:Passenger)=>x.lead_id===lead.id),
        assignments:relevantAssignments,
        documents:all.documents.filter((d:ReservationDocument)=>d.lead_id===lead.id)
      });
      const risk=all.documents.find((d:ReservationDocument)=>d.lead_id===lead.id&&d.document_type==='risk_sheet');
      setRiskUrl(risk?.url||'');
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[lead.id,services.map(s=>s.id).join(',')]);

  const assignmentFor=(serviceId:string)=>data.assignments.find((x:ServiceAssignment)=>x.lead_service_id===serviceId);
  const risk=data.documents.find((d:ReservationDocument)=>d.document_type==='risk_sheet');
  const passengerMismatch=Number(lead.numero_pax||0)!==data.passengers.length;

  const addPassenger=async()=>{
    if(!pax.full_name.trim())return alert('Ingresa el nombre del pasajero.');
    await createPassenger(lead.id,pax);
    setPax({full_name:'',email:'',phone:'',nationality:'',document_type:'Pasaporte',document_number:'',birth_date:'',dietary_restrictions:'',medical_notes:'',app_user_ref:'',is_primary:false});
    setPaxOpen(false);await load();onChanged();
  };
  const saveRisk=async(status?:string)=>{
    await upsertReservationDocument(lead.id,'risk_sheet',{title:'Hoja de riesgo',url:riskUrl||null,status:status||risk?.status||'Pendiente'});
    await load();onChanged();
  };
  const downloadManifest=()=>{
    const rows=[
      ['Código pax','Nombre','Nacionalidad','Documento','N° documento','Nacimiento','Teléfono','Email','Restricciones','Notas','Usuario app'],
      ...data.passengers.map((p:Passenger)=>[p.passenger_code,p.full_name,p.nationality||'',p.document_type||'',p.document_number||'',p.birth_date||'',p.phone||'',p.email||'',p.dietary_restrictions||'',p.medical_notes||'',p.app_user_ref||''])
    ];
    const csv=rows.map((r:any[])=>r.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`${lead.codigo}-lista-pasajeros.csv`;a.click();URL.revokeObjectURL(url);
  };

  if(loading)return <div className="empty-state">Cargando operación de la reserva…</div>;

  return <div className="reservation-ops">
    <section className="ops-block">
      <div className="ops-head"><div><span className="eyebrow">PASAJEROS</span><h3>Lista nominal · {data.passengers.length}/{lead.numero_pax||0}</h3></div><div className="ops-actions">{data.passengers.length>0&&<button className="secondary-button compact-btn" onClick={downloadManifest}><Download size={15}/> Lista CSV</button>}{canEdit&&<button className="secondary-button compact-btn" onClick={()=>setPaxOpen(x=>!x)}><Plus size={15}/> Agregar persona</button>}</div></div>
      {passengerMismatch&&<div className="ops-warning"><ShieldAlert size={16}/><span>La reserva indica {lead.numero_pax||0} pax, pero hay {data.passengers.length} persona(s) registradas.</span></div>}
      {paxOpen&&<div className="pax-create">
        <label><span>Nombre completo *</span><input value={pax.full_name} onChange={e=>setPax({...pax,full_name:e.target.value})}/></label>
        <label><span>Nacionalidad</span><input value={pax.nationality} onChange={e=>setPax({...pax,nationality:e.target.value})}/></label>
        <label><span>Tipo documento</span><select value={pax.document_type} onChange={e=>setPax({...pax,document_type:e.target.value})}><option>Pasaporte</option><option>DNI</option><option>RUT</option><option>Otro</option></select></label>
        <label><span>N° documento</span><input value={pax.document_number} onChange={e=>setPax({...pax,document_number:e.target.value})}/></label>
        <label><span>Nacimiento</span><input type="date" value={pax.birth_date} onChange={e=>setPax({...pax,birth_date:e.target.value})}/></label>
        <label><span>Email</span><input value={pax.email} onChange={e=>setPax({...pax,email:e.target.value})}/></label>
        <label><span>Teléfono</span><input value={pax.phone} onChange={e=>setPax({...pax,phone:e.target.value})}/></label>
        <label><span>Restricciones</span><input value={pax.dietary_restrictions} onChange={e=>setPax({...pax,dietary_restrictions:e.target.value})}/></label>
        <label className="wide"><span>Notas médicas / operacionales</span><input value={pax.medical_notes} onChange={e=>setPax({...pax,medical_notes:e.target.value})}/></label>
        <label className="wide"><span>Usuario App / ID externo</span><input value={pax.app_user_ref||''} onChange={e=>setPax({...pax,app_user_ref:e.target.value})} placeholder="Opcional. El código pax sigue siendo el identificador principal."/></label>
        <button className="primary-button" onClick={addPassenger}>Guardar pasajero</button>
      </div>}
      <div className="passenger-list">
        {data.passengers.map((p:Passenger)=><article key={p.id}>
          <div className="pax-code">{p.passenger_code}</div>
          <div><strong>{p.full_name}</strong><span>{[p.nationality,p.document_type,p.document_number].filter(Boolean).join(' · ')||'Datos por completar'}</span>{p.app_user_ref&&<span>App: {p.app_user_ref}</span>}</div>
          <div><small>{p.birth_date||'Sin nacimiento'}</small></div>
          {canDelete&&<button className="danger-mini" title="Eliminar pasajero" onClick={async()=>{if(!confirm(`¿Eliminar ${p.full_name}?`))return;await deletePassenger(p.id);await load();onChanged()}}><Trash2 size={14}/></button>}
        </article>)}
        {!data.passengers.length&&<div className="empty-card">Todavía no hay pasajeros individuales cargados.</div>}
      </div>
    </section>

    <section className="ops-block">
      <div className="ops-head"><div><span className="eyebrow">OPERACIÓN POR TOUR</span><h3>Quién ejecuta, qué cubre y cuánto cuesta</h3></div></div>
      <div className="assignment-stack">
        {services.map(service=>{
          const a=assignmentFor(service.id)||{};
          const supplier=data.suppliers.find((x:Supplier)=>x.id===a.supplier_id);
          const vehicles=data.vehicles.filter((v:Vehicle)=>!a.supplier_id||!v.supplier_id||v.supplier_id===a.supplier_id);
          const people=directory.people as ServicePerson[];
          const resourcesForService=directory.resourceAssignments.filter((ra:any)=>ra.lead_service_id===service.id);
          const operationMode:OperationMode=(a.operation_mode||(a.supplier_id?'delegated_full':'direct')) as OperationMode;
          const supplierCoverage:CoverageKey[]=Array.isArray(a.supplier_coverage)?a.supplier_coverage:[];
          const coverageSet=new Set<CoverageKey>(operationMode==='delegated_full'?fullCoverage:supplierCoverage);
          const delegated=Boolean(a.supplier_id)&&operationMode!=='direct';
          const covered=(key:CoverageKey)=>delegated&&coverageSet.has(key);

          const saveAndRefresh=async(patch:any)=>{await updateServiceAssignment(service.id,patch);await load();onChanged()};
          const changeSupplier=async(nextSupplier:string)=>{
            if(!nextSupplier){
              await saveAndRefresh({supplier_id:null,operation_mode:'direct',supplier_coverage:[],supplier_cost:0,supplier_payment_status:'Pendiente',supplier_payment_date:null});
              return;
            }
            await saveAndRefresh({
              supplier_id:nextSupplier,
              operation_mode:'delegated_full',
              supplier_coverage:fullCoverage,
              vehicle_id:null,
              guide_person_id:null,
              driver_person_id:null,
              cook_person_id:null,
              coordinator_person_id:null,
              guide_name:null,
              driver_name:null
            });
          };
          const changeMode=async(nextMode:OperationMode)=>{
            if(nextMode==='delegated_full'){
              await saveAndRefresh({
                operation_mode:'delegated_full',supplier_coverage:fullCoverage,
                vehicle_id:null,guide_person_id:null,driver_person_id:null,cook_person_id:null,coordinator_person_id:null,
                guide_name:null,driver_name:null
              });
            }else{
              await saveAndRefresh({operation_mode:'delegated_partial',supplier_coverage:[]});
            }
          };
          const toggleCoverage=async(key:CoverageKey)=>{
            const adding=!coverageSet.has(key);
            const next=adding?[...supplierCoverage,key]:supplierCoverage.filter(x=>x!==key);
            const patch:any={operation_mode:'delegated_partial',supplier_coverage:next};
            if(adding&&key==='vehicle')patch.vehicle_id=null;
            if(adding&&key==='driver'){patch.driver_person_id=null;patch.driver_name=null;}
            if(adding&&key==='guide'){patch.guide_person_id=null;patch.guide_name=null;}
            if(adding&&key==='food')patch.cook_person_id=null;
            if(adding&&key==='coordination')patch.coordinator_person_id=null;
            await saveAndRefresh(patch);
          };

          return <article className={`assignment-card operation-mode-${operationMode}`} key={service.id}>
            <header><div><strong>{service.producto}</strong><span>{service.fecha_servicio||'Fecha por definir'} · {service.numero_pax} pax · {service.modality||'modalidad por definir'}</span></div><span className="status-badge neutral">{service.estado_operacion}</span></header>

            <div className="operation-source-row">
              <label><span>Agencia / proveedor responsable</span><select disabled={!canEdit} value={a.supplier_id||''} onChange={e=>changeSupplier(e.target.value)}><option value="">Operación directa / sin proveedor</option>{data.suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name} · {s.supplier_type}</option>)}</select></label>
              {supplier&&<label><span>Forma de ejecución</span><select disabled={!canEdit} value={operationMode==='delegated_partial'?'delegated_partial':'delegated_full'} onChange={e=>changeMode(e.target.value as OperationMode)}><option value="delegated_full">Derivada integral · proveedor hace todo</option><option value="delegated_partial">Derivada parcial · elegimos qué cubre</option></select></label>}
            </div>

            {!supplier&&<div className="operation-mode-banner direct"><div><span className="eyebrow">OPERACIÓN DIRECTA</span><strong>Hotel Experience arma la ejecución</strong></div><p>Asigna vehículo, guía, conductor, alimentación, coordinación e insumos cuando corresponda.</p></div>}

            {supplier&&<div className={`operation-mode-banner ${operationMode==='delegated_full'?'full':'partial'}`}>
              <div><span className="eyebrow">{operationMode==='delegated_full'?'OPERACIÓN DERIVADA INTEGRAL':'OPERACIÓN DERIVADA PARCIAL'}</span><strong>{supplier.name}</strong></div>
              <p>{operationMode==='delegated_full'?'El proveedor ejecuta el servicio completo. Solo necesitamos controlar compra, pago, pickup y punto de encuentro.':'Define exactamente qué incluye el precio de adquisición. La app seguirá pidiendo solo lo que quede a cargo de Hotel Experience.'}</p>
            </div>}

            {supplier&&<div className="supplier-coverage-box">
              <div className="supplier-coverage-head"><div><span className="eyebrow">COBERTURA DEL OPERADOR</span><strong>{operationMode==='delegated_full'?'Todo incluido en la ejecución':'Selecciona qué cubre el proveedor'}</strong></div><span>{coverageSet.size}/{coverageOptions.length}</span></div>
              <div className="supplier-coverage-grid">
                {coverageOptions.map(item=>{
                  const active=covered(item.key);
                  return <button type="button" key={item.key} disabled={!canEdit||operationMode==='delegated_full'} className={active?'coverage-option active':'coverage-option'} onClick={()=>toggleCoverage(item.key)}>
                    <span className="coverage-check">{active?<Check size={14}/>:null}</span>
                    <span><b>{item.label}</b><small>{item.detail}</small></span>
                  </button>
                })}
              </div>
            </div>}

            <div className="assignment-grid adaptive-assignment-grid">
              {!covered('vehicle')&&<label><span>Vehículo / patente</span><select disabled={!canEdit} value={a.vehicle_id||''} onChange={async e=>{const v=data.vehicles.find((x:Vehicle)=>x.id===e.target.value);await saveAndRefresh({vehicle_id:e.target.value||null,driver_person_id:a.driver_person_id||v?.driver_person_id||null})}}><option value="">Sin asignar</option>{vehicles.map((v:Vehicle)=><option key={v.id} value={v.id}>{v.plate} · {v.label} · {v.capacity||'?'} pax</option>)}</select></label>}
              {!covered('guide')&&<label><span>Guía</span><select disabled={!canEdit} value={a.guide_person_id||''} onChange={async e=>{const person=people.find(p=>p.id===e.target.value);await saveAndRefresh({guide_person_id:e.target.value||null,guide_name:person?.full_name||null})}}><option value="">Sin asignar</option>{people.filter(p=>p.person_type==='Guía'||p.person_type==='Guía de montaña').map(p=>{const org=data.suppliers.find((s:Supplier)=>s.id===p.supplier_id);return <option key={p.id} value={p.id}>{p.full_name} · {p.person_type}{org?` · ${org.name}`:''}</option>})}</select></label>}
              {!covered('driver')&&<label><span>Conductor</span><select disabled={!canEdit} value={a.driver_person_id||''} onChange={async e=>{const person=people.find(p=>p.id===e.target.value);await saveAndRefresh({driver_person_id:e.target.value||null,driver_name:person?.full_name||null})}}><option value="">Sin asignar</option>{people.filter(p=>p.person_type==='Conductor').map(p=>{const org=data.suppliers.find((s:Supplier)=>s.id===p.supplier_id);return <option key={p.id} value={p.id}>{p.full_name}{org?` · ${org.name}`:''}</option>})}</select></label>}
              {!covered('food')&&<label><span>Cocina / alimentación</span><select disabled={!canEdit} value={a.cook_person_id||''} onChange={e=>saveAndRefresh({cook_person_id:e.target.value||null})}><option value="">No aplica / sin asignar</option>{people.filter(p=>p.person_type==='Cocinero/a').map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>}
              {!covered('coordination')&&<label><span>Coordinación terreno</span><select disabled={!canEdit} value={a.coordinator_person_id||''} onChange={e=>saveAndRefresh({coordinator_person_id:e.target.value||null})}><option value="">Sin asignar</option>{people.filter(p=>p.person_type==='Coordinador/a').map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></label>}
              <label><span>Pickup</span><input disabled={!canEdit} type="time" value={a.pickup_time?.slice(0,5)||''} onChange={e=>saveAndRefresh({pickup_time:e.target.value||null})}/></label>
              <label><span>Punto de encuentro</span><input disabled={!canEdit} defaultValue={a.meeting_point||''} onBlur={e=>saveAndRefresh({meeting_point:e.target.value||null})} placeholder="Hotel / recepción / dirección"/></label>
              {supplier&&<label className="acquisition-price-field"><span>Precio de adquisición</span><input disabled={!canEdit} inputMode="numeric" defaultValue={a.supplier_cost||0} onBlur={e=>saveAndRefresh({supplier_cost:Number(e.target.value.replace(/\./g,''))||0})}/><small>Precio total que cobra {supplier.name} por lo que tiene cubierto.</small></label>}
              {supplier&&<label><span>Pago proveedor</span><select disabled={!canEdit} value={a.supplier_payment_status||'Pendiente'} onChange={e=>saveAndRefresh({supplier_payment_status:e.target.value,supplier_payment_date:e.target.value==='Pagado'?new Date().toISOString():null})}><option>Pendiente</option><option>Programado</option><option>Pagado</option><option>Disputado</option></select></label>}
            </div>

            <div className="operation-summary-line">
              {supplier?<><b>{supplier.name}</b><span className="operation-summary-mode">{operationMode==='delegated_full'?'Integral':'Parcial'}</span>{supplier.phone&&<a href={`tel:${supplier.phone}`}><Phone size={13}/>{supplier.phone}</a>}</>:<span>Operación directa</span>}
              {a.pickup_time&&<span><Clock3 size={13}/>{String(a.pickup_time).slice(0,5)}</span>}
              {a.meeting_point&&<span><MapPin size={13}/>{a.meeting_point}</span>}
            </div>

            <ServiceFinanceCard
              service={service}
              assignment={a}
              suppliers={data.suppliers}
              userRole={userRole}
              onChanged={()=>{load();onChanged()}}
            />

            {!covered('resources')&&<div className="service-resource-box">
              <div><span className="eyebrow">INSUMOS ASIGNADOS</span><small>{delegated?'Solo agrega insumos que no estén incluidos en el precio de adquisición.':'Equipamiento y materiales necesarios para esta salida.'}</small></div>
              <div className="resource-chips">
                {resourcesForService.map((ra:any)=>{
                  const rr=directory.resources.find((r:OperationalResource)=>r.id===ra.resource_id);
                  return rr?<span key={ra.id}>{rr.name} × {ra.quantity}{canEdit&&<button title="Quitar" onClick={async()=>{await removeResourceFromService(ra.id);await load();onChanged()}}>×</button>}</span>:null
                })}
              </div>
              {canEdit&&<div className="resource-assign-inline">
                <select id={`resource-${service.id}`} defaultValue=""><option value="">Agregar insumo…</option>{directory.resources.filter((r:OperationalResource)=>r.quantity_available>0&&r.status==='Disponible').map((r:OperationalResource)=><option key={r.id} value={r.id}>{r.name} · disp. {r.quantity_available}</option>)}</select>
                <input id={`qty-${service.id}`} type="number" min={1} defaultValue={1}/>
                <button className="secondary-button compact-btn" onClick={async()=>{const sel=document.getElementById(`resource-${service.id}`) as HTMLSelectElement;const qty=document.getElementById(`qty-${service.id}`) as HTMLInputElement;if(!sel?.value)return;await assignResourceToService(service.id,sel.value,Number(qty?.value||1));await load();onChanged()}}>Asignar</button>
              </div>}
            </div>}
            {covered('resources')&&<div className="covered-resource-note"><Check size={15}/><span><b>Insumos cubiertos por {supplier?.name}.</b> No necesitas asignarlos desde el inventario interno.</span></div>}
            {supplier?.payment_notes&&<p className="supplier-payment-note"><WalletCards size={14}/> {supplier.payment_notes}</p>}
          </article>
        })}
      </div>
    </section>

    <section className="ops-block risk-block">
      <div className="ops-head"><div><span className="eyebrow">DOCUMENTACIÓN</span><h3>Hoja de riesgo</h3></div><span className={`risk-status ${risk?.status==='Completada'?'done':''}`}>{risk?.status||'Pendiente'}</span></div>
      {lead.estado==='confirmado'&&risk?.status!=='Completada'&&<div className="ops-warning"><ShieldAlert size={16}/><span>Reserva confirmada: falta completar la hoja de riesgo.</span></div>}
      <div className="risk-row">
        <input disabled={!canEdit} value={riskUrl} onChange={e=>setRiskUrl(e.target.value)} placeholder="Link de Google Drive, formulario o documento"/>
        {riskUrl&&<a className="secondary-button compact-btn" href={riskUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Abrir</a>}
        {canEdit&&<button className="secondary-button compact-btn" onClick={()=>saveRisk()}>Guardar link</button>}
        {canEdit&&<button className="primary-button compact-btn" onClick={()=>saveRisk('Completada')}><FileCheck2 size={15}/> Marcar completada</button>}
      </div>
    </section>
  </div>
}
