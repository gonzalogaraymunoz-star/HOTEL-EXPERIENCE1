import React,{useEffect,useMemo,useState} from 'react';
import {Archive,Edit3,RotateCcw,Search,X} from 'lucide-react';
import type {Supplier,ServicePerson,Vehicle,OperationalResource} from '../types';
import {updateSupplier,updateServicePerson,updateVehicle,updateOperationalResource} from '../lib/api';
import {assertSupabase} from '../lib/supabase';

type Kind='supplier'|'person'|'vehicle'|'resource';

export default function OperationsAdminTools({role,section}:{role:string;section:string}){
  const canEdit=role==='admin'||role==='manager';
  const [open,setOpen]=useState(false);
  const [kind,setKind]=useState<Kind>(mapSection(section));
  const [records,setRecords]=useState<any[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [people,setPeople]=useState<ServicePerson[]>([]);
  const [search,setSearch]=useState('');
  const [editing,setEditing]=useState<any|null>(null);
  const [showArchived,setShowArchived]=useState(false);
  const [loading,setLoading]=useState(false);

  const load=async(nextKind=kind)=>{
    setLoading(true);
    try{
      const sb=assertSupabase();
      const [s,p]=await Promise.all([
        sb.from('suppliers').select('*').order('name'),
        sb.from('service_people').select('*').order('full_name')
      ]);
      if(s.error)throw s.error;if(p.error)throw p.error;
      setSuppliers((s.data||[]) as Supplier[]);setPeople((p.data||[]) as ServicePerson[]);
      const table=nextKind==='supplier'?'suppliers':nextKind==='person'?'service_people':nextKind==='vehicle'?'vehicles':'operational_resources';
      const order=nextKind==='supplier'?'name':nextKind==='person'?'full_name':nextKind==='vehicle'?'label':'name';
      const r=await sb.from(table).select('*').order(order);
      if(r.error)throw r.error;setRecords(r.data||[]);
    }catch(e:any){alert(e?.message||'No se pudo cargar el directorio.')}finally{setLoading(false)}
  };

  useEffect(()=>{setKind(mapSection(section))},[section]);
  useEffect(()=>{if(open)load(kind)},[open,kind]);
  const visible=useMemo(()=>records.filter(r=>(showArchived||r.active!==false)&&searchRecord(r,search)),[records,showArchived,search]);
  if(!canEdit)return null;

  const switchKind=(k:Kind)=>{setKind(k);setEditing(null);setSearch('')};
  const toggle=async(item:any)=>{
    if(!confirm(item.active===false?'¿Reactivar este registro?':'¿Archivar este registro? Seguirá existiendo en el historial, pero dejará de aparecer en nuevas asignaciones.'))return;
    try{
      await saveKind(kind,item.id,{active:item.active===false});
      await load(kind);
    }catch(e:any){alert(e?.message||'No se pudo actualizar.')}
  };

  return <>
    <button onClick={()=>setOpen(true)} style={floatingStyle}><Edit3 size={15}/> Editar / archivar</button>
    {open&&<div className="modal-backdrop" onMouseDown={()=>setOpen(false)}><section className="modal-card" style={{maxWidth:980,width:'min(980px,94vw)',maxHeight:'88vh',overflow:'auto'}} onMouseDown={e=>e.stopPropagation()}>
      <header><div><span className="eyebrow">DIRECTORIO OPERACIONAL</span><h2>Editar, corregir o archivar</h2></div><button className="icon-button" onClick={()=>setOpen(false)}><X/></button></header>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:14}}>
        <Tab active={kind==='supplier'} onClick={()=>switchKind('supplier')}>Proveedores</Tab>
        <Tab active={kind==='person'} onClick={()=>switchKind('person')}>Prestadores</Tab>
        <Tab active={kind==='vehicle'} onClick={()=>switchKind('vehicle')}>Vehículos</Tab>
        <Tab active={kind==='resource'} onClick={()=>switchKind('resource')}>Insumos</Tab>
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center',marginBottom:14,flexWrap:'wrap'}}>
        <div className="searchbox" style={{flex:1,minWidth:250}}><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar registro..."/></div>
        <label style={{fontSize:11,display:'flex',gap:7,alignItems:'center'}}><input type="checkbox" checked={showArchived} onChange={e=>setShowArchived(e.target.checked)}/> Mostrar archivados</label>
      </div>
      {editing?<EditForm kind={kind} item={editing} suppliers={suppliers} people={people} onCancel={()=>setEditing(null)} onSaved={async()=>{setEditing(null);await load(kind)}}/>:
      loading?<div className="loading-card">Cargando…</div>:
      <div style={{display:'grid',gap:8}}>{visible.map(item=><div key={item.id} style={rowStyle}>
        <div style={{minWidth:0}}><strong>{recordTitle(kind,item)}</strong><div style={{fontSize:10,color:'#726b62',marginTop:3}}>{recordSubtitle(kind,item,suppliers)}</div></div>
        <span className={item.active===false?'status-badge neutral':'status-badge confirmado'}>{item.active===false?'Archivado':'Activo'}</span>
        <button className="operation-button" onClick={()=>setEditing(item)}><Edit3 size={13}/> Editar</button>
        <button className="operation-button" onClick={()=>toggle(item)}>{item.active===false?<><RotateCcw size={13}/> Reactivar</>:<><Archive size={13}/> Archivar</>}</button>
      </div>)}{!visible.length&&<div className="empty-card">No hay registros para mostrar.</div>}</div>}
    </section></div>}
  </>
}

function EditForm({kind,item,suppliers,people,onCancel,onSaved}:any){
  const [f,setF]=useState<any>({...item,languages:(item.languages||[]).join(', '),specialties:(item.specialties||[]).join(', ')});
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    try{
      if(kind==='supplier') await updateSupplier(item.id,{name:f.name,supplier_type:f.supplier_type,contact_name:f.contact_name,phone:f.phone,email:f.email,services_offered:f.services_offered,payment_notes:f.payment_notes,notes:f.notes});
      if(kind==='person') await updateServicePerson(item.id,{full_name:f.full_name,person_type:f.person_type,supplier_id:f.supplier_id||null,phone:f.phone,email:f.email,languages:split(f.languages),specialties:split(f.specialties),default_rate:Number(f.default_rate||0),notes:f.notes});
      if(kind==='vehicle') await updateVehicle(item.id,{label:f.label,plate:String(f.plate||'').toUpperCase(),supplier_id:f.supplier_id||null,driver_person_id:f.driver_person_id||null,brand:f.brand,model:f.model,capacity:Number(f.capacity||0),notes:f.notes});
      if(kind==='resource') await updateOperationalResource(item.id,{name:f.name,resource_type:f.resource_type,supplier_id:f.supplier_id||null,quantity_total:Number(f.quantity_total||0),quantity_available:Number(f.quantity_available||0),location:f.location,status:f.status,notes:f.notes});
      onSaved();
    }catch(e:any){alert(e?.message||'No se pudo guardar.')}finally{setSaving(false)}
  };
  return <div style={{border:'1px solid #d9d1c5',borderRadius:16,padding:16,background:'#fbf8f2'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:12}}><div><span className="eyebrow">EDITANDO</span><h3 style={{margin:'4px 0 0'}}>{recordTitle(kind,item)}</h3></div></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:10}}>
      {kind==='supplier'&&<>
        <Field label="Nombre"><input value={f.name||''} onChange={e=>setF({...f,name:e.target.value})}/></Field>
        <Field label="Tipo"><input value={f.supplier_type||''} onChange={e=>setF({...f,supplier_type:e.target.value})}/></Field>
        <Field label="Contacto"><input value={f.contact_name||''} onChange={e=>setF({...f,contact_name:e.target.value})}/></Field>
        <Field label="Teléfono"><input value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></Field>
        <Field label="Email"><input value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></Field>
        <Field label="Servicios"><input value={f.services_offered||''} onChange={e=>setF({...f,services_offered:e.target.value})}/></Field>
        <Field label="Notas de pago"><input value={f.payment_notes||''} onChange={e=>setF({...f,payment_notes:e.target.value})}/></Field>
        <Field label="Notas"><input value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
      </>}
      {kind==='person'&&<>
        <Field label="Nombre"><input value={f.full_name||''} onChange={e=>setF({...f,full_name:e.target.value})}/></Field>
        <Field label="Rol"><select value={f.person_type||'Otro'} onChange={e=>setF({...f,person_type:e.target.value})}>{['Guía','Guía de montaña','Conductor','Cocinero/a','Coordinador/a','Fotógrafo/a','Terapeuta / Wellness','Otro'].map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Proveedor"><select value={f.supplier_id||''} onChange={e=>setF({...f,supplier_id:e.target.value})}><option value="">Independiente</option>{suppliers.filter((s:Supplier)=>s.active!==false).map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Teléfono"><input value={f.phone||''} onChange={e=>setF({...f,phone:e.target.value})}/></Field>
        <Field label="Email"><input value={f.email||''} onChange={e=>setF({...f,email:e.target.value})}/></Field>
        <Field label="Idiomas"><input value={f.languages||''} onChange={e=>setF({...f,languages:e.target.value})}/></Field>
        <Field label="Especialidades"><input value={f.specialties||''} onChange={e=>setF({...f,specialties:e.target.value})}/></Field>
        <Field label="Tarifa ref."><input type="number" value={f.default_rate||0} onChange={e=>setF({...f,default_rate:e.target.value})}/></Field>
        <Field label="Notas"><input value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
      </>}
      {kind==='vehicle'&&<>
        <Field label="Vehículo"><input value={f.label||''} onChange={e=>setF({...f,label:e.target.value})}/></Field>
        <Field label="Patente"><input value={f.plate||''} onChange={e=>setF({...f,plate:e.target.value})}/></Field>
        <Field label="Proveedor"><select value={f.supplier_id||''} onChange={e=>setF({...f,supplier_id:e.target.value})}><option value="">Propio / independiente</option>{suppliers.filter((s:Supplier)=>s.active!==false).map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Conductor habitual"><select value={f.driver_person_id||''} onChange={e=>setF({...f,driver_person_id:e.target.value})}><option value="">Sin conductor fijo</option>{people.filter((p:ServicePerson)=>p.active!==false&&p.person_type==='Conductor').map((p:ServicePerson)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
        <Field label="Marca"><input value={f.brand||''} onChange={e=>setF({...f,brand:e.target.value})}/></Field>
        <Field label="Modelo"><input value={f.model||''} onChange={e=>setF({...f,model:e.target.value})}/></Field>
        <Field label="Capacidad"><input type="number" value={f.capacity||0} onChange={e=>setF({...f,capacity:e.target.value})}/></Field>
        <Field label="Notas"><input value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
      </>}
      {kind==='resource'&&<>
        <Field label="Insumo"><input value={f.name||''} onChange={e=>setF({...f,name:e.target.value})}/></Field>
        <Field label="Tipo"><input value={f.resource_type||''} onChange={e=>setF({...f,resource_type:e.target.value})}/></Field>
        <Field label="Proveedor"><select value={f.supplier_id||''} onChange={e=>setF({...f,supplier_id:e.target.value})}><option value="">Sin proveedor</option>{suppliers.filter((s:Supplier)=>s.active!==false).map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Cantidad total"><input type="number" value={f.quantity_total||0} onChange={e=>setF({...f,quantity_total:e.target.value})}/></Field>
        <Field label="Disponible"><input type="number" value={f.quantity_available||0} onChange={e=>setF({...f,quantity_available:e.target.value})}/></Field>
        <Field label="Ubicación"><input value={f.location||''} onChange={e=>setF({...f,location:e.target.value})}/></Field>
        <Field label="Estado"><select value={f.status||'Disponible'} onChange={e=>setF({...f,status:e.target.value})}>{['Disponible','Asignado','Mantención','Fuera de servicio'].map(x=><option key={x}>{x}</option>)}</select></Field>
        <Field label="Notas"><input value={f.notes||''} onChange={e=>setF({...f,notes:e.target.value})}/></Field>
      </>}
    </div>
    <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:14}}><button className="operation-button" onClick={onCancel}>Cancelar</button><button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':'Guardar cambios'}</button></div>
  </div>
}

async function saveKind(kind:Kind,id:string,patch:any){
  if(kind==='supplier')return updateSupplier(id,patch);
  if(kind==='person')return updateServicePerson(id,patch);
  if(kind==='vehicle')return updateVehicle(id,patch);
  return updateOperationalResource(id,patch);
}
function mapSection(s:string):Kind{return s==='service_people'?'person':s==='vehicles'?'vehicle':s==='resources'?'resource':'supplier'}
function recordTitle(k:Kind,r:any){return k==='supplier'?r.name:k==='person'?r.full_name:k==='vehicle'?`${r.plate||''} · ${r.label||''}`:r.name}
function recordSubtitle(k:Kind,r:any,suppliers:Supplier[]){const supplier=suppliers.find(s=>s.id===r.supplier_id)?.name;return k==='supplier'?[r.supplier_type,r.phone,r.email].filter(Boolean).join(' · '):k==='person'?[r.person_type,supplier,r.phone].filter(Boolean).join(' · '):k==='vehicle'?[supplier,r.capacity?`${r.capacity} pax`:''].filter(Boolean).join(' · '):[r.resource_type,r.location,`${r.quantity_available||0}/${r.quantity_total||0}`].filter(Boolean).join(' · ')}
function searchRecord(r:any,q:string){if(!q.trim())return true;return JSON.stringify(r).toLowerCase().includes(q.toLowerCase())}
function split(v:any){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function Tab({active,onClick,children}:any){return <button className={active?'primary-button':'operation-button'} onClick={onClick}>{children}</button>}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label style={{display:'grid',gap:5}}><span style={{fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6e685f'}}>{label}</span>{children}</label>}
const floatingStyle:React.CSSProperties={position:'fixed',right:24,bottom:24,zIndex:35,border:'1px solid #111',borderRadius:999,background:'#111',color:'#fff',padding:'11px 16px',fontWeight:700,display:'flex',alignItems:'center',gap:7,cursor:'pointer',boxShadow:'0 8px 30px rgba(0,0,0,.15)'};
const rowStyle:React.CSSProperties={display:'grid',gridTemplateColumns:'minmax(0,1fr) auto auto auto',gap:8,alignItems:'center',border:'1px solid #ddd5c9',borderRadius:14,padding:'12px 14px',background:'#fff'};
