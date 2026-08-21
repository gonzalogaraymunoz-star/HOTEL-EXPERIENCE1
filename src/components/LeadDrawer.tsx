import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, CalendarDays, Mail, Phone, Hotel, Plus, CheckCircle2, Clock3, Trash2, MoreHorizontal, Wrench, Calculator, Copy, Pencil, ArchiveRestore, RotateCcw, Save } from 'lucide-react';
import type { Lead, LeadService, CRMTask, CRMActivity } from '../types';
import ReservationOperations from './ReservationOperations';
import ServiceOperationModal from './ServiceOperationModal';
import OperationalDocuments from './OperationalDocuments';
import CommunicationsCenter from './CommunicationsCenter';
import ServiceClosures from './ServiceClosures';
import { availableModalities, familyById, modalityLabel, pricingFamilies, resolveFamilyPrice, type TourModality } from '../lib/tvPricing';
import { createActivity, createTask, updateLead, updateService, deleteLead, assignLead, loadTeamDirectory, createLeadService, loadOperationsData, loadOperationsDirectory } from '../lib/api';

export default function LeadDrawer({
  lead, services, tasks, activities, userRole, onClose, onChanged
}:{lead:Lead;services:LeadService[];tasks:CRMTask[];activities:CRMActivity[];userRole:string;onClose:()=>void;onChanged:()=>void}) {
  const [busy,setBusy]=useState(false);
  const leadServices=services.filter(s=>s.lead_id===lead.id);
  const leadTasks=tasks.filter(t=>t.lead_id===lead.id);
  const leadActivities=activities.filter(a=>a.lead_id===lead.id);
  const [taskTitle,setTaskTitle]=useState('');
  const [note,setNote]=useState('');
  const [team,setTeam]=useState<any[]>([]);
  const [addingService,setAddingService]=useState(false);
  const [operationService,setOperationService]=useState<LeadService|null>(null);
  const [editingServiceId,setEditingServiceId]=useState<string|null>(null);
  const [serviceDraft,setServiceDraft]=useState<any>(null);
  const [opsSnapshot,setOpsSnapshot]=useState<any>({suppliers:[],vehicles:[],assignments:[],people:[]});

  const firstFamily=pricingFamilies[0]||null;
  const [newFamilyId,setNewFamilyId]=useState(firstFamily?.id||'__manual');
  const [newModality,setNewModality]=useState<TourModality>((firstFamily&&availableModalities(firstFamily)[0])||'low');
  const [newService,setNewService]=useState({producto:'',fecha_servicio:'',numero_pax:lead.numero_pax||1,observacion:''});
  const selectedFamily=newFamilyId==='__manual'?null:familyById(newFamilyId);
  const allowedModalities=selectedFamily?availableModalities(selectedFamily):[];
  const selectedQuote=selectedFamily?resolveFamilyPrice(selectedFamily,newModality,newService.numero_pax):null;
  React.useEffect(()=>{loadTeamDirectory().then(setTeam).catch(()=>setTeam([]))},[]);
  const loadOpsSummary=async()=>{
    try{
      const [a,b]=await Promise.all([loadOperationsData(),loadOperationsDirectory()]);
      setOpsSnapshot({suppliers:a.suppliers||[],vehicles:a.vehicles||[],assignments:a.assignments||[],people:b.people||[]});
    }catch{
      setOpsSnapshot({suppliers:[],vehicles:[],assignments:[],people:[]});
    }
  };
  React.useEffect(()=>{loadOpsSummary()},[lead.id]);
  const changed=()=>{onChanged();loadOpsSummary();};

  const contact = useMemo(()=>{
    const [email='',phone='']=(lead.contacto||'').split('|').map(x=>x.trim());
    return {email,phone};
  },[lead.contacto]);

  const patchLead=async(key:string,value:any)=>{
    setBusy(true); try { await updateLead(lead.id,{[key]:value}); onChanged(); } finally { setBusy(false); }
  };
  const patchService=async(id:string,key:string,value:any)=>{
    setBusy(true); try { await updateService(id,{[key]:value}); onChanged(); } finally { setBusy(false); }
  };
  const startServiceEdit=(service:LeadService)=>{
    setEditingServiceId(service.id);
    setServiceDraft({
      fecha_servicio:service.fecha_servicio||'',
      numero_pax:Number(service.numero_pax||lead.numero_pax||1),
      observacion:service.observacion||'',
      modality:(service.modality||'') as TourModality|string,
      precio_venta:Number(service.precio_venta||0)
    });
  };
  const familyForService=(service:LeadService)=>{
    return pricingFamilies.find(f=>
      f.name===service.producto ||
      Object.values(f.modalitySources||{}).some(id=>id===service.tour_id)
    )||null;
  };
  const saveServiceEdit=async(service:LeadService)=>{
    if(!serviceDraft)return;
    const family=familyForService(service);
    const modality=(serviceDraft.modality||service.modality||null) as TourModality|null;
    const quote=family&&modality?resolveFamilyPrice(family,modality,Number(serviceDraft.numero_pax||1)):null;
    setBusy(true);
    try{
      await updateService(service.id,{
        fecha_servicio:serviceDraft.fecha_servicio||null,
        numero_pax:Math.max(1,Number(serviceDraft.numero_pax||1)),
        observacion:serviceDraft.observacion||'',
        modality:modality||null,
        precio_venta:Math.max(0,Number(serviceDraft.precio_venta||0)),
        tour_id:quote?.sourceTourId||service.tour_id||null,
        pricing_status:quote?.status||service.pricing_status||null,
        price_pp_clp:quote?.price_pp_clp??service.price_pp_clp??null
      });
      await createActivity({
        lead_id:lead.id,
        type:'service_updated',
        title:'Experiencia actualizada',
        body:`${service.producto} · ${serviceDraft.fecha_servicio||'sin fecha'} · ${Math.max(1,Number(serviceDraft.numero_pax||1))} pax${modality?` · ${modalityLabel(modality)}`:''}`,
        created_by:'CRM'
      });
      setEditingServiceId(null);setServiceDraft(null);onChanged();
    }catch(e:any){alert(e?.message||'No se pudo actualizar la experiencia.')}
    finally{setBusy(false);}
  };
  const duplicateService=async(service:LeadService)=>{
    if(!confirm(`¿Duplicar ${service.producto}? Se copiarán sus datos comerciales, pero no proveedor, vehículo, pagos ni operación.`))return;
    setBusy(true);
    try{
      await createLeadService(lead.id,{
        producto:service.producto,
        tour_id:service.tour_id||null,
        modality:service.modality||null,
        pricing_status:service.pricing_status||null,
        price_pp_clp:service.price_pp_clp??null,
        pricing_source:service.pricing_source||null,
        precio_venta:Number(service.precio_venta||0),
        fecha_servicio:service.fecha_servicio||null,
        numero_pax:Number(service.numero_pax||lead.numero_pax||1),
        observacion:service.observacion||''
      });
      await createActivity({
        lead_id:lead.id,type:'service_duplicated',title:'Experiencia duplicada',
        body:`${service.producto}. Se creó una nueva experiencia sin copiar la asignación operacional.`,
        created_by:'CRM'
      });
      onChanged();
    }catch(e:any){alert(e?.message||'No se pudo duplicar la experiencia.')}
    finally{setBusy(false);}
  };
  const toggleServiceArchive=async(service:LeadService)=>{
    const restoring=service.estado_operacion==='Cancelado';
    if(!restoring&&!confirm(`¿Archivar ${service.producto}? No se eliminará: quedará como Cancelado y conservará su historial.`))return;
    setBusy(true);
    try{
      await updateService(service.id,{estado_operacion:restoring?'Pendiente':'Cancelado'});
      await createActivity({
        lead_id:lead.id,
        type:restoring?'service_restored':'service_archived',
        title:restoring?'Experiencia restaurada':'Experiencia archivada',
        body:`${service.producto} · ${restoring?'vuelve a Pendiente':'marcada como Cancelado sin eliminar historial'}.`,
        created_by:'CRM'
      });
      onChanged();
    }catch(e:any){alert(e?.message||'No se pudo actualizar la experiencia.')}
    finally{setBusy(false);}
  };
  const addTask=async()=>{
    if(!taskTitle.trim())return;
    await createTask({lead_id:lead.id,title:taskTitle,priority:'Media',status:'Pendiente'});
    setTaskTitle(''); onChanged();
  };
  const addNote=async()=>{
    if(!note.trim())return;
    await createActivity({lead_id:lead.id,type:'nota',title:'Nota interna',body:note,created_by:'Equipo'});
    setNote(''); onChanged();
  };

  return <div className="drawer-backdrop" onMouseDown={onClose}>
    <aside className="lead-drawer" onMouseDown={e=>e.stopPropagation()}>
      <header className="drawer-header">
        <div>
          <span className="eyebrow">{lead.codigo}</span>
          <h2>{lead.reserva}</h2>
          <p>{lead.empresa_ejecuta||'Sin hotel'} · {lead.numero_pax} pasajero(s)</p>
        </div>
        <div className="drawer-actions">
          {userRole==='admin'&&<button className="danger-icon-button" title="Eliminar lead" onClick={async()=>{
            if(!confirm(`¿Eliminar definitivamente a ${lead.reserva}? También se eliminarán sus experiencias, tareas y actividades.`)) return;
            try{await deleteLead(lead.id); onClose(); onChanged();}catch(e:any){alert(e.message||'No se pudo eliminar el lead.')}
          }}><Trash2 size={18}/></button>}
          <button className="icon-button" onClick={onClose} title="Cerrar ficha"><X/></button>
        </div>
      </header>

      <div className="drawer-content">
        <section className="drawer-grid">
          <Info icon={<Mail size={17}/>} label="Correo" value={contact.email||'Sin correo'}/>
          <Info icon={<Phone size={17}/>} label="Teléfono" value={contact.phone||'Sin teléfono'}/>
          <Info icon={<Hotel size={17}/>} label="Hotel / origen" value={lead.empresa_ejecuta||'Sin hotel'}/>
          <Info icon={<CalendarDays size={17}/>} label="Fecha ingreso" value={new Date(lead.created_at).toLocaleDateString('es-CL')}/>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head"><div><span className="eyebrow">Comercial</span><h3>Estado del lead</h3></div></div>
          <div className="control-grid">
            <label><span>Etapa</span><select disabled={busy} value={lead.estado} onChange={e=>patchLead('estado',e.target.value)}>{['nuevo','contactado','cotizado','confirmado','perdido'].map(x=><option key={x} value={x}>{cap(x)}</option>)}</select></label>
            <label><span>Prioridad</span><select disabled={busy} value={lead.prioridad||'Media'} onChange={e=>patchLead('prioridad',e.target.value)}>{['Baja','Media','Alta','Urgente'].map(x=><option key={x}>{x}</option>)}</select></label>
          </div>
          <div className="assignment-box">
            <div><span className="eyebrow">RESPONSABLE</span><strong>{team.find((u:any)=>u.id===lead.assigned_to)?.full_name || (lead.assigned_to?'Usuario asignado':'Sin asignar')}</strong></div>
            {(userRole==='admin'||userRole==='manager')&&<select value={lead.assigned_to||''} onChange={async e=>{setBusy(true);try{await assignLead(lead.id,e.target.value||null);onChanged();}finally{setBusy(false)}}}>
              <option value="">Sin asignar</option>
              {team.filter((u:any)=>['admin','manager','agent'].includes(u.role)).map((u:any)=><option key={u.id} value={u.id}>{u.full_name||u.email} · {u.role}</option>)}
            </select>}
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head service-head-actions"><div><span className="eyebrow">Productos</span><h3>{leadServices.length} experiencia(s)</h3></div>{userRole!=='viewer'&&<button className="secondary-button compact-btn" onClick={()=>setAddingService(x=>!x)}><Plus size={15}/> Agregar experiencia</button>}</div>
          {addingService&&<div className="inline-service-create quote-service-create">
            <label><span>Experiencia</span><select value={newFamilyId} onChange={e=>{
              const id=e.target.value;setNewFamilyId(id);
              const f=id==='__manual'?null:familyById(id);
              if(f){setNewModality(availableModalities(f)[0]||'low')}
            }}>
              {pricingFamilies.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}
              <option value="__manual">Otro / ingreso manual</option>
            </select></label>
            {selectedFamily?<label><span>Modalidad</span><select value={newModality} onChange={e=>setNewModality(e.target.value as TourModality)}>
              {allowedModalities.map(m=><option key={m} value={m}>{modalityLabel(m)}</option>)}
            </select></label>:<label><span>Nombre manual</span><input value={newService.producto} onChange={e=>setNewService(x=>({...x,producto:e.target.value}))} placeholder="Transfer, wellness u otro servicio"/></label>}
            <label><span>Fecha</span><input type="date" value={newService.fecha_servicio} onChange={e=>setNewService(x=>({...x,fecha_servicio:e.target.value}))}/></label>
            <label><span>Pax</span><input type="number" min={1} value={newService.numero_pax} onChange={e=>setNewService(x=>({...x,numero_pax:Number(e.target.value)}))}/></label>
            <label className="wide"><span>Observación</span><input value={newService.observacion} onChange={e=>setNewService(x=>({...x,observacion:e.target.value}))} placeholder="Horario, preferencias, restricciones..."/></label>
            {selectedFamily&&<div className={`service-quote-preview ${selectedQuote?.status||'manual_quote'}`}>
              <Calculator size={17}/><div><small>Tarifa sugerida · {modalityLabel(newModality)}</small><strong>{selectedQuote?.status==='quoted'?money(selectedQuote.group_total_clp):'Cotización manual'}</strong><span>{selectedQuote?.status==='quoted'?`${money(selectedQuote.price_pp_clp)} p/p · ${newService.numero_pax} pax`:'No se inventará un valor faltante.'}</span></div>
            </div>}
            <button className="primary-button" onClick={async()=>{
              const productName=selectedFamily?.name||newService.producto.trim();
              if(!productName)return alert('Ingresa la experiencia.');
              const quote=selectedFamily?resolveFamilyPrice(selectedFamily,newModality,newService.numero_pax):null;
              setBusy(true);
              try{
                await createLeadService(lead.id,{
                  producto:productName,
                  tour_id:quote?.sourceTourId||null,
                  modality:selectedFamily?newModality:null,
                  pricing_status:quote?.status||null,
                  price_pp_clp:quote?.price_pp_clp||null,
                  pricing_source:selectedFamily?'TV1.2 Fauna Experiencias':null,
                  precio_venta:quote?.group_total_clp||0,
                  fecha_servicio:newService.fecha_servicio,
                  numero_pax:newService.numero_pax,
                  observacion:newService.observacion
                });
                const resetFamily=pricingFamilies[0]||null;
                setNewFamilyId(resetFamily?.id||'__manual');
                setNewModality((resetFamily&&availableModalities(resetFamily)[0])||'low');
                setNewService({producto:'',fecha_servicio:'',numero_pax:lead.numero_pax||1,observacion:''});
                setAddingService(false);onChanged();
              }catch(e:any){alert(e.message||'No se pudo agregar la experiencia.')}finally{setBusy(false)}
            }}>Guardar experiencia</button>
          </div>}
          <div className="service-stack">
            {leadServices.map(s=>{
              const editing=editingServiceId===s.id&&serviceDraft;
              const family=familyForService(s);
              const editModalities=family?availableModalities(family):[];
              const editModality=(serviceDraft?.modality||s.modality||'') as TourModality|string;
              const editQuote=editing&&family&&editModality
                ?resolveFamilyPrice(family,editModality as TourModality,Number(serviceDraft.numero_pax||1))
                :null;
              return <article className="service-card" key={s.id} style={s.estado_operacion==='Cancelado'?{opacity:.72}:undefined}>
              <div className="service-card-top"><div><div className="service-title-row"><strong>{s.producto}</strong>{s.modality&&<span className="mode-chip">{modalityLabel(s.modality as TourModality)}</span>}</div><p>{s.fecha_servicio?new Date(s.fecha_servicio+'T12:00:00').toLocaleDateString('es-CL'):'Fecha por definir'} · {s.numero_pax} pax{s.pricing_source?` · ${s.pricing_source}`:''}</p></div><span className="status-dot">{s.estado_operacion}</span></div>

              {editing&&<div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10,padding:'13px 0',borderTop:'1px solid #e4ded4',borderBottom:'1px solid #e4ded4',margin:'8px 0 12px'}}>
                <label><span>Fecha</span><input type="date" value={serviceDraft.fecha_servicio} onChange={e=>setServiceDraft((x:any)=>({...x,fecha_servicio:e.target.value}))}/></label>
                <label><span>Pax</span><input type="number" min={1} value={serviceDraft.numero_pax} onChange={e=>setServiceDraft((x:any)=>({...x,numero_pax:Math.max(1,Number(e.target.value||1))}))}/></label>
                {family&&editModalities.length>0&&<label><span>Modalidad</span><select value={editModality} onChange={e=>setServiceDraft((x:any)=>({...x,modality:e.target.value}))}>{editModalities.map(m=><option key={m} value={m}>{modalityLabel(m)}</option>)}</select></label>}
                <label><span>Precio venta</span><input inputMode="numeric" value={serviceDraft.precio_venta} onChange={e=>setServiceDraft((x:any)=>({...x,precio_venta:Number(String(e.target.value).replace(/\./g,''))||0}))}/></label>
                <label style={{gridColumn:'1 / -1'}}><span>Observación</span><input value={serviceDraft.observacion} onChange={e=>setServiceDraft((x:any)=>({...x,observacion:e.target.value}))} placeholder="Horario, preferencias, restricciones..."/></label>
                {editQuote&&<div className={`service-quote-preview ${editQuote.status}`} style={{gridColumn:'1 / -1'}}>
                  <Calculator size={17}/><div><small>Tarifa según catálogo actual</small><strong>{editQuote.status==='quoted'?money(editQuote.group_total_clp):'Cotización manual'}</strong><span>{editQuote.status==='quoted'?`${money(editQuote.price_pp_clp)} p/p · ${serviceDraft.numero_pax} pax`:'El valor actual no se reemplaza automáticamente.'}</span></div>
                  {editQuote.status==='quoted'&&<button className="secondary-button compact-btn" onClick={()=>setServiceDraft((x:any)=>({...x,precio_venta:Number(editQuote.group_total_clp||0)}))}>Usar tarifa</button>}
                </div>}
                <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end',gap:8}}>
                  <button className="secondary-button compact-btn" onClick={()=>{setEditingServiceId(null);setServiceDraft(null)}}><X size={14}/> Cancelar</button>
                  <button className="primary-button compact-btn" disabled={busy} onClick={()=>saveServiceEdit(s)}><Save size={14}/> Guardar cambios</button>
                </div>
              </div>}

              {!editing&&<div className="service-controls">
                <label><span>Precio venta</span><EditableNumber value={Number(s.precio_venta||0)} min={0} onSave={value=>patchService(s.id,'precio_venta',value)}/></label>
                <label><span>Pago cliente</span><select value={s.estado_pago} onChange={e=>patchService(s.id,'estado_pago',e.target.value)}>{['Pendiente','Parcial','Pagado','Reembolsado'].map(x=><option key={x}>{x}</option>)}</select></label>
                <label><span>Estado operación</span><select value={s.estado_operacion} onChange={e=>patchService(s.id,'estado_operacion',e.target.value)}>{['Pendiente','Coordinado','En curso','Completado','Cancelado'].map(x=><option key={x}>{x}</option>)}</select></label>
              </div>}

              <ServiceOpsSummary service={s} snapshot={opsSnapshot}/>
              <div className="service-card-actions" style={{flexWrap:'wrap'}}>
                {s.pricing_status==='manual_quote'&&<span className="manual-quote-chip">Precio por validar</span>}
                {userRole!=='viewer'&&<button className="secondary-button compact-btn" onClick={()=>startServiceEdit(s)}><Pencil size={14}/> Editar</button>}
                {userRole!=='viewer'&&<button className="secondary-button compact-btn" disabled={busy} onClick={()=>duplicateService(s)}><Copy size={14}/> Duplicar</button>}
                {userRole!=='viewer'&&<button className="secondary-button compact-btn" disabled={busy} onClick={()=>toggleServiceArchive(s)}>{s.estado_operacion==='Cancelado'?<><RotateCcw size={14}/> Restaurar</>:<><ArchiveRestore size={14}/> Archivar</>}</button>}
                <button className="operation-button" onClick={()=>setOperationService(s)}><Wrench size={15}/> Operación</button>
              </div>
              {!editing&&s.observacion&&<p className="service-note">{s.observacion}</p>}
            </article>})}
            {!leadServices.length&&<div className="empty-card">Este lead todavía no tiene experiencias separadas.</div>}
          </div>
        </section>

        <section className="drawer-section">
          <ReservationOperations lead={lead} services={leadServices} userRole={userRole} onChanged={changed}/>
        </section>

        <section className="drawer-section">
          <ServiceClosures lead={lead} services={leadServices} userRole={userRole} onChanged={changed}/>
        </section>

        <section className="drawer-section">
          <OperationalDocuments lead={lead} services={leadServices}/>
        </section>

        <section className="drawer-section">
          <CommunicationsCenter lead={lead} services={leadServices} userRole={userRole} onChanged={onChanged}/>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head"><div><span className="eyebrow">Seguimiento</span><h3>Tareas</h3></div></div>
          <div className="inline-create"><input value={taskTitle} onChange={e=>setTaskTitle(e.target.value)} placeholder="Nueva tarea para este lead"/><button onClick={addTask}><Plus size={16}/></button></div>
          <div className="task-list">
            {leadTasks.map(t=><div key={t.id} className="task-row"><span>{t.status==='Completada'?<CheckCircle2 size={16}/>:<Clock3 size={16}/>}</span><div><strong>{t.title}</strong><p>{t.due_date?new Date(t.due_date).toLocaleString('es-CL'):'Sin fecha'} · {t.priority}</p></div></div>)}
            {!leadTasks.length&&<p className="muted">Sin tareas pendientes.</p>}
          </div>
        </section>

        <section className="drawer-section">
          <div className="drawer-section-head"><div><span className="eyebrow">Timeline</span><h3>Actividad</h3></div></div>
          <div className="inline-create"><input value={note} onChange={e=>setNote(e.target.value)} placeholder="Agregar nota interna"/><button onClick={addNote}><Plus size={16}/></button></div>
          <div className="timeline">
            {leadActivities.map(a=><div className="timeline-row" key={a.id}><span/><div><strong>{a.title}</strong><p>{a.body||a.type}</p><small>{new Date(a.created_at).toLocaleString('es-CL')}</small></div></div>)}
            {!leadActivities.length&&<p className="muted">Aún no hay actividad registrada.</p>}
          </div>
        </section>
      </div>
    </aside>
    {operationService&&createPortal(<ServiceOperationModal lead={lead} service={operationService} userRole={userRole} onClose={()=>setOperationService(null)} onChanged={changed}/>,document.body)}
  </div>
}



function ServiceOpsSummary({service,snapshot}:{service:LeadService;snapshot:any}){
  const a=(snapshot.assignments||[]).find((x:any)=>x.lead_service_id===service.id);
  if(!a)return <div className="service-ops-mini empty"><Wrench size={13}/><span>Operación sin asignar</span></div>;
  const supplier=(snapshot.suppliers||[]).find((x:any)=>x.id===a.supplier_id);
  const vehicle=(snapshot.vehicles||[]).find((x:any)=>x.id===a.vehicle_id);
  const guide=(snapshot.people||[]).find((x:any)=>x.id===a.guide_person_id);
  const driver=(snapshot.people||[]).find((x:any)=>x.id===a.driver_person_id);
  const parts=[
    supplier&&`Proveedor: ${supplier.name}`,
    guide&&`Guía: ${guide.full_name}`,
    driver&&`Conductor: ${driver.full_name}`,
    vehicle&&`Vehículo: ${vehicle.plate}`
  ].filter(Boolean);
  if(!parts.length)return <div className="service-ops-mini empty"><Wrench size={13}/><span>Operación sin asignar</span></div>;
  return <div className="service-ops-mini"><Wrench size={13}/>{parts.map((x:any)=><span key={x}>{x}</span>)}</div>;
}

function EditableNumber({value,onSave,min=0}:{value:number;onSave:(value:number)=>Promise<void>|void;min?:number}) {
  const [draft,setDraft]=useState(String(value ?? 0));
  const [saving,setSaving]=useState(false);
  React.useEffect(()=>{if(!saving)setDraft(String(value ?? 0))},[value,saving]);
  const commit=async()=>{
    const normalized=draft.trim().replace(/\./g,'').replace(',','.');
    if(normalized===''){setDraft(String(value ?? 0));return}
    const parsed=Number(normalized);
    if(!Number.isFinite(parsed)||parsed<min){setDraft(String(value ?? 0));return}
    if(parsed===Number(value||0)){setDraft(String(parsed));return}
    setSaving(true);
    try{await onSave(parsed);setDraft(String(parsed))}
    catch(e:any){setDraft(String(value ?? 0));alert(e?.message||'No se pudo guardar el número.')}
    finally{setSaving(false)}
  };
  return <input type="text" inputMode="numeric" value={draft} disabled={saving}
    onChange={e=>setDraft(e.target.value.replace(/[^\d.,]/g,''))}
    onBlur={commit}
    onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();if(e.key==='Escape'){setDraft(String(value ?? 0));e.currentTarget.blur()}}}
    placeholder="0"/>;
}

function Info({icon,label,value}:{icon:React.ReactNode;label:string;value:string}) {
  return <div className="info-card"><span>{icon}</span><div><small>{label}</small><p>{value}</p></div></div>
}
const money=(n:any)=>n==null?'—':new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const cap=(s:string)=>s.charAt(0).toUpperCase()+s.slice(1);
