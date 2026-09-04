import React,{useEffect,useMemo,useState} from 'react';
import {Check,Plus,Trash2} from 'lucide-react';
import type {Lead,LeadService,OperationalResource,ServiceAssignment,ServicePerson,ServiceResourceAssignment,Supplier,Vehicle} from '../types';
import {assignResourceToService,removeResourceFromService,updateService,updateServiceAssignment} from '../lib/api';
import {loadServiceWorkspaceData} from '../lib/operationsApi';

type Coverage='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
const coverage:[Coverage,string][]=[['vehicle','Vehículo'],['driver','Conductor'],['guide','Guía'],['food','Alimentación'],['coordination','Coordinación'],['resources','Insumos'],['entrances','Entradas']];

export default function ServiceAssignmentWorkspace({lead,service,userRole,onChanged}:{lead:Lead;service:LeadService;userRole:string;onChanged:()=>void}){
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [resourceId,setResourceId]=useState('');
  const [resourceQty,setResourceQty]=useState(1);
  const [resourceNotes,setResourceNotes]=useState('');
  const canEdit=userRole!=='viewer';

  const load=async()=>{setLoading(true);try{setData(await loadServiceWorkspaceData(lead.id,service.id));}finally{setLoading(false)}};
  useEffect(()=>{void load()},[lead.id,service.id]);

  if(loading||!data)return <div className="workspace-empty">Cargando asignaciones…</div>;
  const a=(data.assignment||{}) as Partial<ServiceAssignment>;
  const people=data.people as ServicePerson[];
  const suppliers=data.suppliers as Supplier[];
  const vehicles=data.vehicles as Vehicle[];
  const resources=data.resources as OperationalResource[];
  const resourceAssignments=data.resourceAssignments as ServiceResourceAssignment[];

  const save=async(patch:any)=>{if(!canEdit)return;setSaving(true);try{await updateServiceAssignment(service.id,patch);await load();onChanged();}finally{setSaving(false)}};
  const saveStatus=async(next:string)=>{if(!canEdit)return;setSaving(true);try{await updateService(service.id,{estado_operacion:next});onChanged();}finally{setSaving(false)}};
  const assignedIds=new Set(resourceAssignments.map(item=>item.resource_id));
  const availableResources=resources.filter(item=>!assignedIds.has(item.id));
  const coverageSet=new Set<Coverage>(Array.isArray(a.supplier_coverage)?a.supplier_coverage as Coverage[]:[]);
  const mode=String(a.operation_mode||'direct');

  const changeCoverage=async(key:Coverage)=>{
    const next=coverageSet.has(key)?[...coverageSet].filter(item=>item!==key):[...coverageSet,key];
    await save({operation_mode:'delegated_partial',supplier_coverage:next});
  };

  const addResource=async()=>{
    if(!resourceId)return;
    setSaving(true);
    try{await assignResourceToService(service.id,resourceId,Math.max(1,Number(resourceQty||1)),resourceNotes);setResourceId('');setResourceQty(1);setResourceNotes('');await load();onChanged();}finally{setSaving(false)}
  };

  return <div className="assignment-workspace">
    <header className="assignment-summary-strip">
      <div><span>SERVICIO</span><b>{service.service_code||lead.codigo}</b></div>
      <div><span>Fecha</span><b>{service.fecha_servicio||'—'}</b></div>
      <div><span>Pax</span><b>{service.numero_pax}</b></div>
      <label><span>Estado</span><select disabled={!canEdit||saving} value={service.estado_operacion||'Pendiente'} onChange={e=>void saveStatus(e.target.value)}><option>Pendiente</option><option>Coordinado</option><option>En curso</option><option>Completado</option><option>Cancelado</option></select></label>
    </header>

    <section className="assignment-section">
      <div className="assignment-section-head"><div><span>RESPONSABLE</span><h3>Operador y forma de ejecución</h3></div></div>
      <div className="assignment-form-grid two">
        <Field label="Operador"><select disabled={!canEdit||saving} value={a.supplier_id||''} onChange={e=>void save({supplier_id:e.target.value||null,operation_mode:e.target.value?'delegated_full':'direct',supplier_coverage:e.target.value?coverage.map(([key])=>key):[]})}><option value="">Operación interna</option>{suppliers.map(item=><option key={item.id} value={item.id}>{item.supplier_code?`${item.supplier_code} · `:''}{item.name}</option>)}</select></Field>
        <Field label="Modalidad operacional"><select disabled={!canEdit||saving||!a.supplier_id} value={mode} onChange={e=>void save({operation_mode:e.target.value,supplier_coverage:e.target.value==='delegated_full'?coverage.map(([key])=>key):[]})}><option value="direct">Directa</option><option value="delegated_full">Derivada integral</option><option value="delegated_partial">Derivada parcial</option></select></Field>
      </div>
      {a.supplier_id&&<div className="coverage-compact">{coverage.map(([key,label])=>{const active=mode==='delegated_full'||coverageSet.has(key);return <button key={key} disabled={!canEdit||mode==='delegated_full'} className={active?'active':''} onClick={()=>void changeCoverage(key)}><span>{active?<Check size={12}/>:null}</span>{label}</button>})}</div>}
    </section>

    <section className="assignment-section">
      <div className="assignment-section-head"><div><span>PERSONAS + MOVILIDAD</span><h3>Asignaciones del servicio</h3></div><small>Usa el directorio cuando exista. Si es una excepción, selecciona “Manual”.</small></div>
      <div className="assignment-form-grid">
        <PersonField label="Guía" role="guide" people={people} id={a.guide_person_id} manual={a.guide_name} disabled={!canEdit||saving} onChange={(id,manual)=>void save({guide_person_id:id,guide_name:manual})}/>
        <PersonField label="Conductor" role="driver" people={people} id={a.driver_person_id} manual={a.driver_name} disabled={!canEdit||saving} onChange={(id,manual)=>void save({driver_person_id:id,driver_name:manual})}/>
        <PersonField label="Cocinero/a" role="cook" people={people} id={a.cook_person_id} manual={a.cook_name} disabled={!canEdit||saving} onChange={(id,manual)=>void save({cook_person_id:id,cook_name:manual})}/>
        <PersonField label="Coordinación" role="coord" people={people} id={a.coordinator_person_id} manual={a.coordinator_name} disabled={!canEdit||saving} onChange={(id,manual)=>void save({coordinator_person_id:id,coordinator_name:manual})}/>
        <VehicleField vehicles={vehicles} id={a.vehicle_id} manual={a.vehicle_name_manual} disabled={!canEdit||saving} onChange={(id,manual)=>void save({vehicle_id:id,vehicle_name_manual:manual})}/>
        <Field label="Pick-up"><input disabled={!canEdit||saving} type="time" value={String(a.pickup_time||'').slice(0,5)} onChange={e=>void save({pickup_time:e.target.value||null})}/></Field>
        <Field label="Punto de encuentro"><input disabled={!canEdit||saving} value={a.meeting_point||''} onChange={e=>void save({meeting_point:e.target.value||null})} placeholder="Hotel, aeropuerto, dirección…"/></Field>
        <Field label="Notas operacionales"><input disabled={!canEdit||saving} value={a.notes||''} onChange={e=>void save({notes:e.target.value||null})} placeholder="Solo información útil para ejecutar"/></Field>
      </div>
    </section>

    <section className="assignment-section">
      <div className="assignment-section-head"><div><span>INSUMOS</span><h3>Recursos asignados</h3></div><small>Los recursos con tipo “Alimentación” alimentan automáticamente el tablero de Alimentación.</small></div>
      {canEdit&&<div className="resource-add-row"><select value={resourceId} onChange={e=>setResourceId(e.target.value)}><option value="">Seleccionar insumo…</option>{availableResources.map(item=><option key={item.id} value={item.id}>{item.resource_type} · {item.code||''} · {item.name}</option>)}</select><input type="number" min="1" value={resourceQty} onChange={e=>setResourceQty(Number(e.target.value))}/><input value={resourceNotes} onChange={e=>setResourceNotes(e.target.value)} placeholder="Nota opcional"/><button disabled={!resourceId||saving} onClick={()=>void addResource()}><Plus size={15}/> Agregar</button></div>}
      <div className="assigned-resource-list">{resourceAssignments.map(item=>{
        const resource=resources.find(r=>r.id===item.resource_id);
        return <article key={item.id}><div><b>{resource?.name||'Recurso'}</b><span>{resource?.code||'—'} · {resource?.resource_type||'Sin tipo'} · x{item.quantity}</span>{item.notes&&<small>{item.notes}</small>}</div><span className={`resource-fulfillment ${(item.fulfillment_status||'Pendiente').toLowerCase()}`}>{item.fulfillment_status||'Pendiente'}</span>{canEdit&&<button title="Quitar insumo" onClick={async()=>{if(!confirm('¿Quitar este insumo del servicio?'))return;await removeResourceFromService(item.id);await load();onChanged()}}><Trash2 size={14}/></button>}</article>
      })}{!resourceAssignments.length&&<div className="workspace-empty compact">Sin insumos asignados.</div>}</div>
    </section>
  </div>;
}

function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="assignment-field"><span>{label}</span>{children}</label>}

function PersonField({label,role,people,id,manual,disabled,onChange}:{label:string;role:'guide'|'driver'|'cook'|'coord';people:ServicePerson[];id?:string|null;manual?:string|null;disabled:boolean;onChange:(id:string|null,manual:string|null)=>void}){
  const matches=useMemo(()=>people.filter(person=>matchRole(person.person_type,role)),[people,role]);
  const manualMode=!id&&Boolean(manual);
  const value=id|| (manualMode?'__manual__':'');
  return <div className="assignment-field manual-field"><span>{label}</span><select disabled={disabled} value={value} onChange={e=>{if(e.target.value==='__manual__')onChange(null,manual||' ');else onChange(e.target.value||null,null)}}><option value="">Sin asignar</option>{matches.map(person=><option key={person.id} value={person.id}>{person.person_code?`${person.person_code} · `:''}{person.full_name}</option>)}<option value="__manual__">Manual…</option></select>{value==='__manual__'&&<input disabled={disabled} autoFocus value={manual?.trimStart()||''} onChange={e=>onChange(null,e.target.value)} placeholder={`Nombre ${label.toLowerCase()}`}/>}</div>
}

function VehicleField({vehicles,id,manual,disabled,onChange}:{vehicles:Vehicle[];id?:string|null;manual?:string|null;disabled:boolean;onChange:(id:string|null,manual:string|null)=>void}){
  const value=id|| (manual?'__manual__':'');
  return <div className="assignment-field manual-field"><span>Vehículo</span><select disabled={disabled} value={value} onChange={e=>{if(e.target.value==='__manual__')onChange(null,manual||' ');else onChange(e.target.value||null,null)}}><option value="">Sin asignar</option>{vehicles.map(vehicle=><option key={vehicle.id} value={vehicle.id}>{vehicle.vehicle_code?`${vehicle.vehicle_code} · `:''}{vehicle.label}{vehicle.plate?` · ${vehicle.plate}`:''}</option>)}<option value="__manual__">Manual…</option></select>{value==='__manual__'&&<input disabled={disabled} autoFocus value={manual?.trimStart()||''} onChange={e=>onChange(null,e.target.value)} placeholder="Vehículo / patente manual"/>}</div>
}

function matchRole(type:string,role:string){const value=String(type||'').toLowerCase();if(role==='guide')return value.includes('guía')||value.includes('guia');if(role==='driver')return value.includes('conductor')||value.includes('chofer');if(role==='cook')return value.includes('cocin');return value.includes('coord')}
