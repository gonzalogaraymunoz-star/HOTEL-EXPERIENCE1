import React,{useEffect,useMemo,useState} from 'react';
import {Box,Building2,CarFront,ChefHat,ClipboardCheck,Compass,HardHat,Languages,LifeBuoy,Mail,PackagePlus,Phone,Plus,Radio,Search,ShieldCheck,Stethoscope,Truck,UserRoundCog,UsersRound,Wrench,X} from 'lucide-react';
import type {Supplier,Vehicle,ServicePerson,OperationalResource} from '../types';
import {createOperationalResource,createServicePerson,createSupplier,createVehicle,loadOperationsData,loadOperationsDirectory} from '../lib/api';

export type Tab='suppliers'|'people'|'vehicles'|'resources';

export default function OperationsHub({role,initialTab='suppliers'}:{role:string;initialTab?:Tab}){
  const [tab,setTab]=useState<Tab>(initialTab);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [people,setPeople]=useState<ServicePerson[]>([]);
  const [resources,setResources]=useState<OperationalResource[]>([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState<'supplier'|'vehicle'|'person'|'resource'|null>(null);
  const [quickType,setQuickType]=useState<'supplier'|'person'|'resource'>('supplier');
  const [quickName,setQuickName]=useState('');
  const [quickContact,setQuickContact]=useState('');
  const [quickPhone,setQuickPhone]=useState('');
  const [quickEmail,setQuickEmail]=useState('');
  const [quickNotes,setQuickNotes]=useState('');
  const [quickSaving,setQuickSaving]=useState(false);
  const [directorySearch,setDirectorySearch]=useState('');
  const canEdit=role==='admin'||role==='manager';

  const load=async()=>{
    setLoading(true);
    try{
      const [a,b]=await Promise.all([loadOperationsData(),loadOperationsDirectory()]);
      setSuppliers(a.suppliers);setVehicles(a.vehicles);setPeople(b.people);setResources(b.resources);
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);
  useEffect(()=>{setTab(initialTab)},[initialTab]);

  const activePeople=people.filter(p=>p.active);
  const vehicleIssues=vehicles.filter(v=>!v.active).length;
  const resourceAlerts=resources.filter(r=>r.status!=='Disponible'||(r.quantity_available??0)<=0).length;


  const saveQuick=async()=>{
    if(!quickName.trim()) return alert('Ingresa un nombre.');
    setQuickSaving(true);
    try{
      if(quickType==='supplier'){
        await createSupplier({
          name:quickName.trim(),
          supplier_type:'Por clasificar',
          contact_name:quickContact||null,
          phone:quickPhone||null,
          email:quickEmail||null,
          payment_notes:quickNotes||null,
          active:true
        });
      }
      if(quickType==='person'){
        await createServicePerson({
          full_name:quickName.trim(),
          person_type:'Otro',
          phone:quickPhone||null,
          email:quickEmail||null,
          notes:[quickContact,quickNotes].filter(Boolean).join(' · ')||null,
          languages:[],
          specialties:[],
          certifications:[],
          active:true
        });
      }
      if(quickType==='resource'){
        await createOperationalResource({
          resource_type:'Otro',
          name:quickName.trim(),
          code:null,
          quantity_total:1,
          quantity_available:1,
          supplier_id:null,
          location:quickContact||null,
          status:'Disponible',
          notes:[quickPhone&&`Tel: ${quickPhone}`,quickEmail&&`Email: ${quickEmail}`,quickNotes].filter(Boolean).join(' · ')||null,
          active:true
        });
      }
      setQuickName('');setQuickContact('');setQuickPhone('');setQuickEmail('');setQuickNotes('');
      await load();
    }catch(e:any){
      alert(e?.message||'No se pudo guardar.');
    }finally{
      setQuickSaving(false);
    }
  };

  return <div className="view-stack">
    <section className="ops-hub-hero">
      <div>
        <span className="eyebrow">OPERACIÓN TURÍSTICA</span>
        <h2>Proveedores, personas e insumos</h2>
        <p>Centraliza quién presta el servicio, quién trabaja en terreno y qué recursos están disponibles antes de confirmar una salida.</p>
      </div>
      <div className="ops-hub-kpis">
        <Kpi value={suppliers.length} label="Proveedores"/>
        <Kpi value={activePeople.length} label="Prestadores"/>
        <Kpi value={vehicles.length} label="Vehículos"/>
        <Kpi value={resources.length} label="Insumos"/>
      </div>
    </section>

    {canEdit&&<>
    <section className="quick-directory-card">
      <div className="quick-directory-copy">
        <span className="eyebrow">CAPTURA RÁPIDA</span>
        <h3>Agregar al directorio operacional</h3>
        <p>Guarda un contacto ahora y completa su ficha después. Ideal para nuevos proveedores, prestadores o insumos que quieras cotizar o contactar.</p>
      </div>
      <div className="quick-directory-form">
        <div className="quick-type-switch">
          <button className={quickType==='supplier'?'active':''} onClick={()=>setQuickType('supplier')}><Building2 size={14}/> Proveedor</button>
          <button className={quickType==='person'?'active':''} onClick={()=>setQuickType('person')}><UsersRound size={14}/> Prestador</button>
          <button className={quickType==='resource'?'active':''} onClick={()=>setQuickType('resource')}><Box size={14}/> Insumo</button>
        </div>
        <div className="quick-directory-grid">
          <label><span>Nombre *</span><input value={quickName} onChange={e=>setQuickName(e.target.value)} placeholder={quickType==='supplier'?'Ej. Atacama Transportes':quickType==='person'?'Ej. Juan Pérez':'Ej. Cooler 45L'}/></label>
          <label><span>{quickType==='resource'?'Ubicación / referencia':'Contacto / empresa'}</span><input value={quickContact} onChange={e=>setQuickContact(e.target.value)} placeholder={quickType==='resource'?'Bodega / proveedor / referencia':'Nombre de contacto o empresa'}/></label>
          <label><span>Teléfono</span><input value={quickPhone} onChange={e=>setQuickPhone(e.target.value)} placeholder="+56 9 ..."/></label>
          <label><span>Email</span><input value={quickEmail} onChange={e=>setQuickEmail(e.target.value)} placeholder="correo@ejemplo.com"/></label>
          <label className="wide"><span>Notas</span><input value={quickNotes} onChange={e=>setQuickNotes(e.target.value)} placeholder="Qué ofrece, precio referencial, disponibilidad, dónde lo conocimos..."/></label>
        </div>
        <button className="primary-button quick-save-button" disabled={quickSaving||!quickName.trim()} onClick={saveQuick}>{quickSaving?'Guardando...':'Guardar en base de datos'} <Plus size={15}/></button>
      </div>
    </section>
    </>}

    <section className="directory-search-row">
      <div className="searchbox wide-search"><Search size={16}/><input value={directorySearch} onChange={e=>setDirectorySearch(e.target.value)} placeholder="Buscar proveedor, prestador, teléfono, especialidad o insumo..."/></div>
      <div className="directory-contact-hint"><Phone size={14}/><Mail size={14}/><span>Los teléfonos y correos quedan disponibles para contacto posterior.</span></div>
    </section>

    <section className="ops-priority-strip">
      <div><ShieldCheck size={16}/><span>Prestadores activos</span><b>{activePeople.length}</b></div>
      <div><Truck size={16}/><span>Vehículos registrados</span><b>{vehicles.length}</b></div>
      <div><Box size={16}/><span>Alertas de insumos</span><b>{resourceAlerts}</b></div>
      <div><ClipboardCheck size={16}/><span>Objetivo</span><b>Salida lista</b></div>
    </section>

    <div className="ops-tabs">
      <button className={tab==='suppliers'?'active':''} onClick={()=>setTab('suppliers')}><Building2 size={16}/> Proveedores</button>
      <button className={tab==='people'?'active':''} onClick={()=>setTab('people')}><UsersRound size={16}/> Prestadores</button>
      <button className={tab==='vehicles'?'active':''} onClick={()=>setTab('vehicles')}><CarFront size={16}/> Vehículos</button>
      <button className={tab==='resources'?'active':''} onClick={()=>setTab('resources')}><Box size={16}/> Insumos</button>
    </div>

    {loading?<div className="loading-card">Cargando operación…</div>:<>
            {tab==='suppliers'&&<SuppliersTab suppliers={filterSuppliers(suppliers,directorySearch)} vehicles={vehicles} canEdit={canEdit} onNew={()=>setModal('supplier')}/>}
      {tab==='people'&&<PeopleTab people={filterPeople(people,directorySearch)} suppliers={suppliers} canEdit={canEdit} onNew={()=>setModal('person')}/>}
      {tab==='vehicles'&&<VehiclesTab vehicles={filterVehicles(vehicles,directorySearch)} suppliers={suppliers} people={people} canEdit={canEdit} onNew={()=>setModal('vehicle')}/>}
      {tab==='resources'&&<ResourcesTab resources={filterResources(resources,directorySearch)} suppliers={suppliers} canEdit={canEdit} onNew={()=>setModal('resource')}/>}
    </>}

    {modal&&<CreateModal type={modal} suppliers={suppliers} people={people} onClose={()=>setModal(null)} onSaved={async()=>{setModal(null);await load()}}/>}
  </div>
}

function SuppliersTab({suppliers,vehicles,canEdit,onNew}:any){
  return <section>
    <TabHeader title="Proveedores / agencias" subtitle="Empresas o personas jurídicas a quienes se contrata y paga." action={canEdit?'Nuevo proveedor':null} onAction={onNew}/>
    <div className="supplier-grid">
      {suppliers.map((s:Supplier)=>{
        const fleet=vehicles.filter((v:Vehicle)=>v.supplier_id===s.id);
        return <article className="supplier-card" key={s.id}>
          <div className="supplier-card-head"><div className="supplier-icon"><Building2/></div><span className="mode-chip">{s.supplier_type}</span></div>
          <h3>{s.name}</h3>
          <p>{s.contact_name||'Sin contacto'}</p>
          <div className="contact-actions">
            {s.phone&&<a href={`tel:${s.phone}`}><Phone size={13}/>{s.phone}</a>}
            {s.whatsapp&&<a href={`https://wa.me/${String(s.whatsapp).replace(/\D/g,'')}`} target="_blank" rel="noreferrer"><Phone size={13}/>WhatsApp</a>}
            {s.email&&<a href={`mailto:${s.email}`}><Mail size={13}/>{s.email}</a>}
          </div>
          <div className="supplier-meta-row"><span>RUT</span><b>{s.rut||'—'}</b></div>
          <div className="supplier-meta-row"><span>SERNATUR</span><b>{(s as any).sernatur_registration||'—'}</b></div>
          <div className="supplier-meta-row"><span>Servicios</span><b>{s.services_offered||'—'}</b></div>
          <div className="supplier-meta-row"><span>Vehículos</span><b>{fleet.length}</b></div>
          <div className="supplier-meta-row"><span>Banco</span><b>{s.bank_name||'—'}</b></div>
          {s.payment_notes&&<div className="supplier-note">{s.payment_notes}</div>}
        </article>
      })}
      {!suppliers.length&&<div className="empty-card">No hay proveedores registrados.</div>}
    </div>
  </section>
}

function PeopleTab({people,suppliers,canEdit,onNew}:any){
  const groups=['Guía','Conductor','Cocinero/a','Guía de montaña','Coordinador/a','Fotógrafo/a','Terapeuta / Wellness','Otro'];
  return <section>
    <TabHeader title="Prestadores de servicios" subtitle="Base de datos de personas disponibles para ejecutar la operación." action={canEdit?'Nuevo prestador':null} onAction={onNew}/>
    <div className="people-summary">{groups.map(g=><div key={g}><span>{g}</span><b>{people.filter((p:ServicePerson)=>p.person_type===g).length}</b></div>)}</div>
    <div className="people-grid">
      {people.map((p:ServicePerson)=><article className="person-card" key={p.id}>
        <div className="person-card-head"><div className="person-role-icon">{personIcon(p.person_type)}</div><span className="mode-chip">{p.person_type}</span></div>
        <h3>{p.full_name}</h3>
        {p.supplier_id&&<p className="person-company">Agencia / proveedor: {suppliers.find((s:Supplier)=>s.id===p.supplier_id)?.name||'Vinculado'}</p>}
        <div className="contact-actions">
          {p.phone&&<a href={`tel:${p.phone}`}><Phone size={13}/>{p.phone}</a>}
          {p.whatsapp&&<a href={`https://wa.me/${String(p.whatsapp).replace(/\D/g,'')}`} target="_blank" rel="noreferrer"><Phone size={13}/>WhatsApp</a>}
          {p.email&&<a href={`mailto:${p.email}`}><Mail size={13}/>{p.email}</a>}
        </div>
        <div className="person-tags">
          {(p.languages||[]).map(x=><span key={x}><Languages size={12}/>{x}</span>)}
          {(p.specialties||[]).slice(0,3).map(x=><span key={x}><Compass size={12}/>{x}</span>)}
        </div>
        <div className="supplier-meta-row"><span>PPAA</span><b>{p.first_aid_expiry||'—'}</b></div>
        <div className="supplier-meta-row"><span>SERNATUR</span><b>{p.sernatur_registration||'—'}</b></div>
        <div className="supplier-meta-row"><span>Tarifa ref.</span><b>{p.default_rate?money(p.default_rate):'—'}</b></div>
        {p.notes&&<div className="supplier-note">{p.notes}</div>}
      </article>)}
      {!people.length&&<div className="empty-card">No hay prestadores individuales cargados.</div>}
    </div>
  </section>
}

function VehiclesTab({vehicles,suppliers,people,canEdit,onNew}:any){
  return <section>
    <TabHeader title="Vehículos" subtitle="Flota propia y de terceros: patente, capacidad, conductor y disponibilidad." action={canEdit?'Nuevo vehículo':null} onAction={onNew}/>
    <div className="vehicle-grid">
      {vehicles.map((v:Vehicle)=>{
        const s=suppliers.find((x:Supplier)=>x.id===v.supplier_id);
        return <article className="vehicle-card" key={v.id}>
          <div className="vehicle-plate">{v.plate}</div><h3>{v.label}</h3><p>{[v.brand,v.model,v.year].filter(Boolean).join(' · ')||s?.name||'Propio / independiente'}</p>
          <div className="supplier-meta-row"><span>Proveedor</span><b>{s?.name||'Propio / independiente'}</b></div>
          <div className="supplier-meta-row"><span>Capacidad</span><b>{v.capacity||'—'} pax</b></div>
          <div className="supplier-meta-row"><span>Conductor habitual</span><b>{people?.find((p:ServicePerson)=>p.id===v.driver_person_id)?.full_name||v.driver_name||'—'}</b></div>
          <div className="supplier-meta-row"><span>Estado</span><b>{v.active?'Activo':'Fuera de servicio'}</b></div>
          <div className="supplier-meta-row"><span>Rev. técnica</span><b>{(v as any).technical_review_expiry||'—'}</b></div>
          <div className="supplier-meta-row"><span>Seguro</span><b>{(v as any).insurance_expiry||'—'}</b></div>
        </article>
      })}
      {!vehicles.length&&<div className="empty-card">No hay vehículos cargados.</div>}
    </div>
  </section>
}

function ResourcesTab({resources,suppliers,canEdit,onNew}:any){
  return <section>
    <TabHeader title="Insumos operacionales" subtitle="Equipamiento, seguridad, alimentación y logística disponibles para cada salida." action={canEdit?'Nuevo insumo':null} onAction={onNew}/>
    <div className="resource-guide">
      {[
        ['Seguridad','Botiquines, oxígeno, radios, mantas térmicas'],
        ['Montaña','Bastones, cascos, crampones, mochilas'],
        ['Alimentación','Coolers, termos, vajilla, mesas, agua'],
        ['Operación','Carpas, sillas, linternas, baterías, GPS'],
        ['Higiene','Alcohol gel, bolsas, papel, limpieza'],
        ['Vestuario','Parkas, guantes, polainas, chalecos reflectantes']
      ].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}
    </div>
    <div className="resource-table">
      <div className="resource-row head"><span>Insumo</span><span>Tipo</span><span>Disponible</span><span>Ubicación</span><span>Estado</span><span>Vence / mantención</span></div>
      {resources.map((r:OperationalResource)=><div className="resource-row" key={r.id}>
        <span><b>{r.name}</b><small>{r.code||''}</small></span><span>{r.resource_type}</span><span>{r.quantity_available}/{r.quantity_total}</span><span>{r.location||'—'}</span><span><i className={`resource-status ${statusSlug(r.status)}`}/>{r.status}</span><span>{r.expiry_date||r.maintenance_due||'—'}</span>
      </div>)}
      {!resources.length&&<div className="empty-card">No hay insumos cargados.</div>}
    </div>
  </section>
}

function CreateModal({type,suppliers,people,onClose,onSaved}:any){
  const [form,setForm]=useState<any>(defaults(type));
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    try{
      if(type==='supplier') await createSupplier({...form,active:true});
      if(type==='vehicle'){
        const driver=people.find((p:ServicePerson)=>p.id===form.driver_person_id);
        await createVehicle({...form,supplier_id:form.supplier_id||null,driver_person_id:form.driver_person_id||null,driver_name:driver?.full_name||form.driver_name||null,driver_phone:driver?.phone||form.driver_phone||null,year:form.year?Number(form.year):null,capacity:Number(form.capacity||0),active:true});
      }
      if(type==='person') await createServicePerson({...form,supplier_id:form.supplier_id||null,languages:split(form.languages),specialties:split(form.specialties),certifications:split(form.certifications),active:true,default_rate:Number(form.default_rate||0)});
      if(type==='resource') await createOperationalResource({...form,supplier_id:form.supplier_id||null,quantity_total:Number(form.quantity_total||0),quantity_available:Number(form.quantity_available||0),active:true});
      onSaved();
    }catch(e:any){alert(e.message||'No se pudo guardar.')}finally{setSaving(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card ops-create-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div><span className="eyebrow">OPERACIÓN</span><h2>{titles[type]}</h2></div><button className="icon-button" onClick={onClose}><X/></button></header>
    <div className="form-grid">
      {type==='supplier'&&<>
        <F label="Nombre *" wide><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></F>
        <F label="Tipo"><select value={form.supplier_type} onChange={e=>setForm({...form,supplier_type:e.target.value})}>{['Operador turístico','Agencia','Transporte','Wellness','Restaurante','Alojamiento','Otro'].map(x=><option key={x}>{x}</option>)}</select></F>
        <F label="Contacto"><input value={form.contact_name} onChange={e=>setForm({...form,contact_name:e.target.value})}/></F>
        <F label="Teléfono"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></F>
        <F label="WhatsApp"><input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></F>
        <F label="Email"><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></F>
        <F label="Sitio web"><input value={form.website} onChange={e=>setForm({...form,website:e.target.value})}/></F>
        <F label="Servicios que ofrece" wide><input value={form.services_offered} onChange={e=>setForm({...form,services_offered:e.target.value})} placeholder="Tours, transporte, alimentación, wellness…"/></F>
        <F label="RUT"><input value={form.rut} onChange={e=>setForm({...form,rut:e.target.value})}/></F>
        <F label="Registro SERNATUR"><input value={form.sernatur_registration} onChange={e=>setForm({...form,sernatur_registration:e.target.value})}/></F>
        <F label="Permiso / autorización"><input value={form.permit_number} onChange={e=>setForm({...form,permit_number:e.target.value})}/></F>
        <F label="Seguro / póliza"><input value={form.insurance_policy} onChange={e=>setForm({...form,insurance_policy:e.target.value})}/></F>
        <F label="Vence seguro"><input type="date" value={form.insurance_expiry} onChange={e=>setForm({...form,insurance_expiry:e.target.value})}/></F>
        <F label="Banco"><input value={form.bank_name} onChange={e=>setForm({...form,bank_name:e.target.value})}/></F>
        <F label="Tipo de cuenta"><input value={form.account_type} onChange={e=>setForm({...form,account_type:e.target.value})} placeholder="Corriente, Vista…"/></F>
        <F label="N° cuenta"><input value={form.account_number} onChange={e=>setForm({...form,account_number:e.target.value})}/></F>
        <F label="Notas pago" wide><textarea value={form.payment_notes} onChange={e=>setForm({...form,payment_notes:e.target.value})}/></F>
        <F label="Notas generales" wide><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></F>
      </>}
      {type==='vehicle'&&<>
        <F label="Proveedor" wide><select value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}><option value="">Propio / independiente</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
        <F label="Vehículo *"><input value={form.label} onChange={e=>setForm({...form,label:e.target.value})} placeholder="Van, SUV, Minibus…"/></F>
        <F label="Patente *"><input value={form.plate} onChange={e=>setForm({...form,plate:e.target.value.toUpperCase()})}/></F>
        <F label="Marca"><input value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}/></F>
        <F label="Modelo"><input value={form.model} onChange={e=>setForm({...form,model:e.target.value})}/></F>
        <F label="Año"><input inputMode="numeric" value={form.year} onChange={e=>setForm({...form,year:e.target.value.replace(/\D/g,'')})}/></F>
        <F label="Capacidad"><input type="number" min={1} value={form.capacity} onChange={e=>setForm({...form,capacity:Number(e.target.value)})}/></F>
        <F label="Conductor habitual" wide><select value={form.driver_person_id||''} onChange={e=>setForm({...form,driver_person_id:e.target.value})}><option value="">Sin conductor fijo</option>{people.filter((p:ServicePerson)=>p.person_type==='Conductor').map((p:ServicePerson)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></F>
        <F label="Vence revisión técnica"><input type="date" value={form.technical_review_expiry} onChange={e=>setForm({...form,technical_review_expiry:e.target.value})}/></F>
        <F label="Vence permiso circulación"><input type="date" value={form.circulation_permit_expiry} onChange={e=>setForm({...form,circulation_permit_expiry:e.target.value})}/></F>
        <F label="Vence seguro"><input type="date" value={form.insurance_expiry} onChange={e=>setForm({...form,insurance_expiry:e.target.value})}/></F>
      </>}
      {type==='person'&&<>
        <F label="Nombre completo *" wide><input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></F>
        <F label="Rol"><select value={form.person_type} onChange={e=>setForm({...form,person_type:e.target.value})}>{['Guía','Guía de montaña','Conductor','Cocinero/a','Coordinador/a','Fotógrafo/a','Terapeuta / Wellness','Otro'].map(x=><option key={x}>{x}</option>)}</select></F>
        <F label="Agencia / proveedor"><select value={form.supplier_id||''} onChange={e=>setForm({...form,supplier_id:e.target.value})}><option value="">Independiente / sin agencia</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
        <F label="Teléfono"><input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></F>
        <F label="WhatsApp"><input value={form.whatsapp} onChange={e=>setForm({...form,whatsapp:e.target.value})}/></F>
        <F label="Email"><input value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></F>
        <F label="RUT"><input value={form.rut} onChange={e=>setForm({...form,rut:e.target.value})}/></F>
        <F label="Idiomas"><input value={form.languages} onChange={e=>setForm({...form,languages:e.target.value})} placeholder="Español, Inglés, Portugués"/></F>
        <F label="Especialidades"><input value={form.specialties} onChange={e=>setForm({...form,specialties:e.target.value})} placeholder="Astronomía, montaña, cultura"/></F>
        <F label="Certificaciones"><input value={form.certifications} onChange={e=>setForm({...form,certifications:e.target.value})}/></F>
        <F label="Vence PPAA"><input type="date" value={form.first_aid_expiry} onChange={e=>setForm({...form,first_aid_expiry:e.target.value})}/></F>
        <F label="Licencia conducir"><input value={form.license_type} onChange={e=>setForm({...form,license_type:e.target.value})}/></F>
        <F label="Vence licencia"><input type="date" value={form.license_expiry} onChange={e=>setForm({...form,license_expiry:e.target.value})}/></F>
        <F label="Registro SERNATUR"><input value={form.sernatur_registration} onChange={e=>setForm({...form,sernatur_registration:e.target.value})}/></F>
        <F label="Tarifa referencia"><input inputMode="numeric" value={form.default_rate} onChange={e=>setForm({...form,default_rate:e.target.value.replace(/\D/g,'')})}/></F>
        <F label="Disponibilidad / turnos" wide><input value={form.availability_notes} onChange={e=>setForm({...form,availability_notes:e.target.value})} placeholder="Días, horarios, zonas, aviso mínimo…"/></F>
        <F label="Contacto emergencia"><input value={form.emergency_contact} onChange={e=>setForm({...form,emergency_contact:e.target.value})}/></F>
        <F label="Notas" wide><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></F>
      </>}
      {type==='resource'&&<>
        <F label="Nombre *" wide><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></F>
        <F label="Tipo"><select value={form.resource_type} onChange={e=>setForm({...form,resource_type:e.target.value})}>{['Seguridad','Montaña','Alimentación','Operación','Higiene','Vestuario','Tecnología','Otro'].map(x=><option key={x}>{x}</option>)}</select></F>
        <F label="Código interno"><input value={form.code} onChange={e=>setForm({...form,code:e.target.value})}/></F>
        <F label="Cantidad total"><input type="number" min={0} value={form.quantity_total} onChange={e=>setForm({...form,quantity_total:Number(e.target.value)})}/></F>
        <F label="Disponible"><input type="number" min={0} value={form.quantity_available} onChange={e=>setForm({...form,quantity_available:Number(e.target.value)})}/></F>
        <F label="Ubicación"><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></F>
        <F label="Estado"><select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}>{['Disponible','En uso','Mantención','Vencido','Baja'].map(x=><option key={x}>{x}</option>)}</select></F>
        <F label="Próxima mantención"><input type="date" value={form.maintenance_due} onChange={e=>setForm({...form,maintenance_due:e.target.value})}/></F>
        <F label="Vencimiento"><input type="date" value={form.expiry_date} onChange={e=>setForm({...form,expiry_date:e.target.value})}/></F>
        <F label="Proveedor"><select value={form.supplier_id} onChange={e=>setForm({...form,supplier_id:e.target.value})}><option value="">Sin proveedor</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></F>
        <F label="Notas" wide><textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></F>
      </>}
    </div>
    <button className="primary-button modal-action" disabled={saving} onClick={save}>{saving?'Guardando...':'Guardar'}</button>
  </section></div>
}

function TabHeader({title,subtitle,action,onAction}:any){return <div className="ops-tab-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{action&&<button className="primary-button" onClick={onAction}><Plus size={15}/>{action}</button>}</div>}
function Kpi({value,label}:any){return <div><strong>{value}</strong><span>{label}</span></div>}
function F({label,children,wide=false}:any){return <label className={wide?'field wide':'field'}><span>{label}</span>{children}</label>}
function split(s:string){return String(s||'').split(',').map(x=>x.trim()).filter(Boolean)}

function filterSuppliers(items:Supplier[],q:string){const s=q.toLowerCase().trim();if(!s)return items;return items.filter(x=>[x.name,x.supplier_type,x.contact_name,x.phone,x.email,x.rut].some(v=>String(v||'').toLowerCase().includes(s)))}
function filterPeople(items:ServicePerson[],q:string){const s=q.toLowerCase().trim();if(!s)return items;return items.filter(x=>[x.full_name,x.person_type,x.phone,x.email,x.rut,...(x.languages||[]),...(x.specialties||[])].some(v=>String(v||'').toLowerCase().includes(s)))}
function filterVehicles(items:Vehicle[],q:string){const s=q.toLowerCase().trim();if(!s)return items;return items.filter(x=>[x.label,x.plate,x.driver_name,x.driver_phone].some(v=>String(v||'').toLowerCase().includes(s)))}
function filterResources(items:OperationalResource[],q:string){const s=q.toLowerCase().trim();if(!s)return items;return items.filter(x=>[x.name,x.resource_type,x.code,x.location,x.status,x.notes].some(v=>String(v||'').toLowerCase().includes(s)))}

function defaults(type:string){if(type==='supplier')return{name:'',supplier_type:'Operador turístico',contact_name:'',phone:'',whatsapp:'',email:'',website:'',services_offered:'',rut:'',sernatur_registration:'',permit_number:'',insurance_policy:'',insurance_expiry:'',bank_name:'',account_type:'',account_number:'',payment_notes:'',notes:''};if(type==='vehicle')return{supplier_id:'',driver_person_id:'',label:'',plate:'',brand:'',model:'',year:'',capacity:1,driver_name:'',driver_phone:'',technical_review_expiry:'',circulation_permit_expiry:'',insurance_expiry:'',notes:''};if(type==='person')return{full_name:'',person_type:'Guía',supplier_id:'',phone:'',whatsapp:'',email:'',rut:'',languages:'Español',specialties:'',certifications:'',first_aid_expiry:'',license_type:'',license_expiry:'',sernatur_registration:'',default_rate:'',availability_notes:'',emergency_contact:'',notes:''};return{resource_type:'Seguridad',name:'',code:'',quantity_total:1,quantity_available:1,supplier_id:'',location:'',maintenance_due:'',expiry_date:'',status:'Disponible',notes:''}}
const titles:any={supplier:'Agregar proveedor',vehicle:'Agregar vehículo',person:'Agregar prestador',resource:'Agregar insumo'}
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0))
const statusSlug=(s:string)=>String(s||'').toLowerCase().replace(/\s+/g,'-')
function personIcon(type:string){if(type.includes('Cociner'))return <ChefHat/>;if(type.includes('Conductor'))return <Truck/>;if(type.includes('montaña'))return <HardHat/>;if(type.includes('Wellness'))return <Stethoscope/>;return <UserRoundCog/>}
