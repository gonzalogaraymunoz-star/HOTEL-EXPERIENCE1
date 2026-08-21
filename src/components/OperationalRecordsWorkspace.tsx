import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertCircle,Archive,Box,Building2,CalendarClock,CarFront,CheckCircle2,ChevronRight,
  ExternalLink,FileText,FolderOpen,Paperclip,Save,Search,ShieldCheck,Upload,UsersRound
} from 'lucide-react';
import type {OperationalResource,ServicePerson,Supplier,Vehicle} from '../types';
import {
  loadOperationsData,loadOperationsDirectory,updateOperationalResource,
  updateServicePerson,updateSupplier,updateVehicle
} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './OperationalRecordsWorkspace.css';

type EntityType='supplier'|'person'|'vehicle'|'resource';
type Entity=Supplier|ServicePerson|Vehicle|OperationalResource;

type OperationalDocument={
  id:string;entity_type:EntityType;entity_id:string;document_type:string;title:string;
  storage_bucket:string;storage_path:string;file_name:string;mime_type?:string|null;size_bytes?:number|null;
  expires_on?:string|null;notes?:string|null;status:'active'|'archived';uploaded_by?:string|null;
  created_at:string;updated_at:string;
};

type Option={value:string;label:string;expiry?:boolean};

const BUCKET='operational-files';
const documentOptions:Record<EntityType,Option[]>={
  supplier:[
    {value:'company_background',label:'RUT / antecedentes empresa'},
    {value:'sernatur',label:'Registro SERNATUR',expiry:true},
    {value:'permit',label:'Permiso / autorización',expiry:true},
    {value:'insurance',label:'Seguro / póliza',expiry:true},
    {value:'bank',label:'Certificado / datos bancarios'},
    {value:'contract',label:'Contrato / acuerdo comercial',expiry:true},
    {value:'other',label:'Otro documento'}
  ],
  person:[
    {value:'identity',label:'Cédula / pasaporte',expiry:true},
    {value:'sernatur',label:'Registro SERNATUR',expiry:true},
    {value:'first_aid',label:'Primeros auxilios',expiry:true},
    {value:'driver_license',label:'Licencia de conducir',expiry:true},
    {value:'certification',label:'Certificación / credencial',expiry:true},
    {value:'bank',label:'Certificado / datos bancarios'},
    {value:'contract',label:'Contrato / acuerdo',expiry:true},
    {value:'other',label:'Otro documento'}
  ],
  vehicle:[
    {value:'vehicle_registry',label:'Padrón / inscripción'},
    {value:'circulation_permit',label:'Permiso de circulación',expiry:true},
    {value:'technical_review',label:'Revisión técnica',expiry:true},
    {value:'soap',label:'SOAP',expiry:true},
    {value:'insurance',label:'Seguro adicional',expiry:true},
    {value:'maintenance',label:'Mantención / taller',expiry:true},
    {value:'photos',label:'Fotografías del vehículo'},
    {value:'other',label:'Otro documento'}
  ],
  resource:[
    {value:'invoice',label:'Factura / comprobante'},
    {value:'technical_sheet',label:'Ficha técnica'},
    {value:'maintenance',label:'Mantención / revisión',expiry:true},
    {value:'warranty',label:'Garantía',expiry:true},
    {value:'photos',label:'Fotografías'},
    {value:'other',label:'Otro documento'}
  ]
};

export default function OperationalRecordsWorkspace({role}:{role:string}){
  const [type,setType]=useState<EntityType>('person');
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [people,setPeople]=useState<ServicePerson[]>([]);
  const [vehicles,setVehicles]=useState<Vehicle[]>([]);
  const [resources,setResources]=useState<OperationalResource[]>([]);
  const [documents,setDocuments]=useState<OperationalDocument[]>([]);
  const [selectedKey,setSelectedKey]=useState('');
  const [query,setQuery]=useState('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const canEdit=role==='admin'||role==='manager';

  const load=async()=>{
    setLoading(true);
    try{
      const sb=assertSupabase();
      const [core,directory,docs]=await Promise.all([
        loadOperationsData(),
        loadOperationsDirectory(),
        sb.from('operational_entity_documents').select('*').order('created_at',{ascending:false})
      ]);
      if(docs.error)throw docs.error;
      setSuppliers(core.suppliers||[]);
      setVehicles(core.vehicles||[]);
      setPeople(directory.people||[]);
      setResources(directory.resources||[]);
      setDocuments((docs.data||[]) as OperationalDocument[]);
    }finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const entities=useMemo(()=>{
    const base=type==='supplier'?suppliers:type==='person'?people:type==='vehicle'?vehicles:resources;
    const q=query.trim().toLowerCase();
    return base.filter((item:any)=>!q||entitySearch(item,type).includes(q));
  },[type,suppliers,people,vehicles,resources,query]);

  const selected=useMemo(()=>entities.find((x:any)=>entityKey(type,x.id)===selectedKey)||null,[entities,selectedKey,type]);
  const allSelected=useMemo(()=>{
    if(selected)return selected;
    const base=type==='supplier'?suppliers:type==='person'?people:type==='vehicle'?vehicles:resources;
    return base.find((x:any)=>entityKey(type,x.id)===selectedKey)||null;
  },[selected,type,selectedKey,suppliers,people,vehicles,resources]);
  const selectedEntity=allSelected as Entity|null;
  const selectedDocs=useMemo(()=>documents.filter(d=>d.entity_type===type&&d.entity_id===(selectedEntity as any)?.id&&d.status==='active'),[documents,type,selectedEntity]);

  useEffect(()=>{setSelectedKey('')},[type]);

  const overview=useMemo(()=>{
    const base=type==='supplier'?suppliers:type==='person'?people:type==='vehicle'?vehicles:resources;
    const rows=base.map((entity:any)=>profileScore(type,entity,documents.filter(d=>d.entity_type===type&&d.entity_id===entity.id&&d.status==='active')));
    return {
      total:base.length,
      complete:rows.filter(x=>x.percent===100).length,
      expiring:documents.filter(d=>d.entity_type===type&&d.status==='active'&&expiryState(d.expires_on)==='soon').length,
      expired:documents.filter(d=>d.entity_type===type&&d.status==='active'&&expiryState(d.expires_on)==='expired').length
    };
  },[type,suppliers,people,vehicles,resources,documents]);

  return <div className="records-workspace">
    <section className="records-hero">
      <div>
        <span className="eyebrow">BASE OPERACIONAL DURA</span>
        <h2>Fichas y documentos</h2>
        <p>Cada proveedor, prestador, vehículo e insumo conserva una ficha online con sus datos vigentes y documentos privados respaldados en Supabase.</p>
      </div>
      <div className="records-path"><FolderOpen size={18}/><div><small>ALMACENAMIENTO</small><strong>{BUCKET}/tipo/id/documento/archivo</strong></div></div>
    </section>

    <section className="records-kpis">
      <Kpi label="Fichas" value={overview.total} icon={<FileText/>}/>
      <Kpi label="Completas" value={overview.complete} icon={<CheckCircle2/>}/>
      <Kpi label="Vencen ≤30 días" value={overview.expiring} icon={<CalendarClock/>}/>
      <Kpi label="Documentos vencidos" value={overview.expired} icon={<AlertCircle/>} warn={overview.expired>0}/>
    </section>

    <section className="records-toolbar">
      <div className="records-tabs">
        <TypeButton active={type==='supplier'} onClick={()=>setType('supplier')} icon={<Building2/>} label="Proveedores"/>
        <TypeButton active={type==='person'} onClick={()=>setType('person')} icon={<UsersRound/>} label="Prestadores"/>
        <TypeButton active={type==='vehicle'} onClick={()=>setType('vehicle')} icon={<CarFront/>} label="Vehículos"/>
        <TypeButton active={type==='resource'} onClick={()=>setType('resource')} icon={<Box/>} label="Insumos"/>
      </div>
      <div className="records-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar ficha…"/></div>
    </section>

    {loading?<div className="loading-card">Cargando fichas…</div>:<div className="records-layout">
      <aside className="records-directory">
        <header><strong>{typeTitle(type)}</strong><small>{entities.length} registro(s)</small></header>
        <div className="records-directory-list">
          {entities.map((entity:any)=>{
            const docs=documents.filter(d=>d.entity_type===type&&d.entity_id===entity.id&&d.status==='active');
            const score=profileScore(type,entity,docs);
            return <button key={entity.id} className={selectedKey===entityKey(type,entity.id)?'active':''} onClick={()=>setSelectedKey(entityKey(type,entity.id))}>
              <span><strong>{entityName(type,entity)}</strong><small>{entitySubtitle(type,entity,suppliers)}</small></span>
              <span className="record-score"><b>{score.percent}%</b><em>{docs.length} doc.</em></span>
              <ChevronRight size={15}/>
            </button>;
          })}
          {!entities.length&&<div className="records-empty">No hay fichas para este filtro.</div>}
        </div>
      </aside>

      <main className="records-detail">
        {!selectedEntity?<EmptySelection/>:<EntityRecord
          type={type}
          entity={selectedEntity as any}
          suppliers={suppliers}
          people={people}
          documents={selectedDocs}
          canEdit={canEdit}
          saving={saving}
          uploading={uploading}
          onSave={async patch=>{
            setSaving(true);
            try{
              if(type==='supplier')await updateSupplier((selectedEntity as Supplier).id,patch);
              if(type==='person')await updateServicePerson((selectedEntity as ServicePerson).id,patch);
              if(type==='vehicle')await updateVehicle((selectedEntity as Vehicle).id,patch);
              if(type==='resource')await updateOperationalResource((selectedEntity as OperationalResource).id,patch);
              await load();
            }catch(e:any){alert(e?.message||'No se pudo guardar la ficha.')}finally{setSaving(false)}
          }}
          onUpload={async input=>{
            setUploading(true);
            try{await uploadDocuments(type,(selectedEntity as any).id,input);await load()}catch(e:any){alert(e?.message||'No se pudo subir el documento.')}finally{setUploading(false)}
          }}
          onOpen={openDocument}
          onArchive={async doc=>{
            if(!canEdit)return;
            if(!confirm(`¿Archivar ${doc.title}? El archivo se conserva en la base documental.`))return;
            const {error}=await assertSupabase().from('operational_entity_documents').update({status:'archived',updated_at:new Date().toISOString()}).eq('id',doc.id);
            if(error)return alert(error.message);
            await load();
          }}
        />}
      </main>
    </div>}
  </div>;
}

function EntityRecord({type,entity,suppliers,people,documents,canEdit,saving,uploading,onSave,onUpload,onOpen,onArchive}:any){
  const [draft,setDraft]=useState<any>(()=>draftFor(type,entity));
  useEffect(()=>{setDraft(draftFor(type,entity))},[type,entity.id,entity.updated_at]);
  const score=profileScore(type,entity,documents);
  const set=(key:string,value:any)=>setDraft((prev:any)=>({...prev,[key]:value}));

  return <div className="entity-record">
    <header className="entity-record-head">
      <div><span className="eyebrow">FICHA {typeLabel(type).toUpperCase()}</span><h2>{entityName(type,entity)}</h2><p>{entitySubtitle(type,entity,suppliers)}</p></div>
      <div className="record-completion"><strong>{score.percent}%</strong><small>{score.done}/4 bloques completos</small><div><span style={{width:`${score.percent}%`}}/></div></div>
    </header>

    <div className="record-checks">
      {score.sections.map((s:any)=><div key={s.label} className={s.ok?'ok':'pending'}>{s.ok?<CheckCircle2 size={15}/>:<AlertCircle size={15}/>}<span><b>{s.label}</b><small>{s.detail}</small></span></div>)}
    </div>

    <section className="record-section">
      <SectionTitle icon={<ShieldCheck/>} title="Datos de la ficha" subtitle="Información estructurada usada por Operaciones."/>
      {type==='supplier'&&<SupplierFields draft={draft} set={set}/>} 
      {type==='person'&&<PersonFields draft={draft} set={set} suppliers={suppliers}/>} 
      {type==='vehicle'&&<VehicleFields draft={draft} set={set} suppliers={suppliers} people={people}/>} 
      {type==='resource'&&<ResourceFields draft={draft} set={set} suppliers={suppliers}/>} 
      {canEdit&&<div className="record-save-row"><button className="primary-button" disabled={saving} onClick={()=>onSave(normalizeDraft(type,draft))}><Save size={15}/>{saving?'Guardando…':'Guardar ficha'}</button></div>}
    </section>

    <section className="record-section">
      <SectionTitle icon={<Paperclip/>} title="Documentos respaldados" subtitle="Archivos privados asociados directamente a esta ficha."/>
      {canEdit&&<DocumentUploader type={type} uploading={uploading} onUpload={onUpload}/>} 
      <div className="document-list">
        {documents.map((doc:OperationalDocument)=>{
          const state=expiryState(doc.expires_on);
          return <article key={doc.id}>
            <div className="document-icon"><FileText size={18}/></div>
            <div className="document-copy"><strong>{doc.title}</strong><span>{documentLabel(type,doc.document_type)} · {formatBytes(doc.size_bytes)}</span>{doc.notes&&<small>{doc.notes}</small>}</div>
            <div className={`document-expiry ${state}`}><small>{doc.expires_on?'Vigencia':'Sin vencimiento'}</small><b>{doc.expires_on?dateFmt(doc.expires_on):'—'}</b></div>
            <button className="doc-open" onClick={()=>onOpen(doc)}><ExternalLink size={14}/> Abrir</button>
            {canEdit&&<button className="doc-archive" onClick={()=>onArchive(doc)} title="Archivar"><Archive size={14}/></button>}
          </article>;
        })}
        {!documents.length&&<div className="records-empty">Todavía no hay documentos cargados en esta ficha.</div>}
      </div>
    </section>
  </div>;
}

function DocumentUploader({type,uploading,onUpload}:{type:EntityType;uploading:boolean;onUpload:(x:any)=>Promise<void>}){
  const [documentType,setDocumentType]=useState(documentOptions[type][0].value);
  const [expiresOn,setExpiresOn]=useState('');
  const [notes,setNotes]=useState('');
  const [files,setFiles]=useState<File[]>([]);
  useEffect(()=>{setDocumentType(documentOptions[type][0].value);setExpiresOn('');setNotes('');setFiles([])},[type]);
  return <div className="document-uploader">
    <label><span>Tipo de documento</span><select value={documentType} onChange={e=>setDocumentType(e.target.value)}>{documentOptions[type].map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
    <label><span>Vence el</span><input type="date" value={expiresOn} onChange={e=>setExpiresOn(e.target.value)}/></label>
    <label className="wide"><span>Notas</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Número de póliza, observación, entidad emisora…"/></label>
    <label className="file-drop wide"><Upload size={18}/><span><b>{files.length?`${files.length} archivo(s) seleccionado(s)`:'Seleccionar documentos'}</b><small>PDF, JPG, PNG, WEBP o DOCX · máximo 20 MB por archivo</small></span><input type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={e=>setFiles(Array.from(e.target.files||[]))}/></label>
    <button className="primary-button" disabled={uploading||!files.length} onClick={async()=>{await onUpload({documentType,expiresOn:expiresOn||null,notes:notes||null,files});setFiles([])}}><Upload size={15}/>{uploading?'Subiendo…':'Subir a ficha'}</button>
  </div>;
}

function SupplierFields({draft,set}:any){return <div className="record-form-grid">
  <Field label="Nombre"><input value={draft.name} onChange={e=>set('name',e.target.value)}/></Field>
  <Field label="Tipo"><input value={draft.supplier_type} onChange={e=>set('supplier_type',e.target.value)}/></Field>
  <Field label="Contacto"><input value={draft.contact_name} onChange={e=>set('contact_name',e.target.value)}/></Field>
  <Field label="RUT"><input value={draft.rut} onChange={e=>set('rut',e.target.value)}/></Field>
  <Field label="Teléfono"><input value={draft.phone} onChange={e=>set('phone',e.target.value)}/></Field>
  <Field label="Email"><input value={draft.email} onChange={e=>set('email',e.target.value)}/></Field>
  <Field label="SERNATUR"><input value={draft.sernatur_registration} onChange={e=>set('sernatur_registration',e.target.value)}/></Field>
  <Field label="N° permiso"><input value={draft.permit_number} onChange={e=>set('permit_number',e.target.value)}/></Field>
  <Field label="Póliza"><input value={draft.insurance_policy} onChange={e=>set('insurance_policy',e.target.value)}/></Field>
  <Field label="Vence seguro"><input type="date" value={draft.insurance_expiry} onChange={e=>set('insurance_expiry',e.target.value)}/></Field>
  <Field label="Banco"><input value={draft.bank_name} onChange={e=>set('bank_name',e.target.value)}/></Field>
  <Field label="Cuenta"><input value={draft.account_number} onChange={e=>set('account_number',e.target.value)}/></Field>
  <Field wide label="Servicios"><textarea value={draft.services_offered} onChange={e=>set('services_offered',e.target.value)}/></Field>
  <Field wide label="Notas"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
</div>}

function PersonFields({draft,set,suppliers}:any){return <div className="record-form-grid">
  <Field label="Nombre"><input value={draft.full_name} onChange={e=>set('full_name',e.target.value)}/></Field>
  <Field label="Rol"><input value={draft.person_type} onChange={e=>set('person_type',e.target.value)}/></Field>
  <Field label="Proveedor"><select value={draft.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Independiente</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
  <Field label="RUT"><input value={draft.rut} onChange={e=>set('rut',e.target.value)}/></Field>
  <Field label="Teléfono"><input value={draft.phone} onChange={e=>set('phone',e.target.value)}/></Field>
  <Field label="Email"><input value={draft.email} onChange={e=>set('email',e.target.value)}/></Field>
  <Field label="Nacionalidad"><input value={draft.nationality} onChange={e=>set('nationality',e.target.value)}/></Field>
  <Field label="SERNATUR"><input value={draft.sernatur_registration} onChange={e=>set('sernatur_registration',e.target.value)}/></Field>
  <Field label="PPAA vence"><input type="date" value={draft.first_aid_expiry} onChange={e=>set('first_aid_expiry',e.target.value)}/></Field>
  <Field label="Licencia"><input value={draft.license_type} onChange={e=>set('license_type',e.target.value)}/></Field>
  <Field label="Licencia vence"><input type="date" value={draft.license_expiry} onChange={e=>set('license_expiry',e.target.value)}/></Field>
  <Field label="Emergencia"><input value={draft.emergency_contact} onChange={e=>set('emergency_contact',e.target.value)}/></Field>
  <Field label="Idiomas"><input value={draft.languagesText} onChange={e=>set('languagesText',e.target.value)} placeholder="Español, Portugués…"/></Field>
  <Field label="Especialidades"><input value={draft.specialtiesText} onChange={e=>set('specialtiesText',e.target.value)} placeholder="Astronomía, trekking…"/></Field>
  <Field label="Certificaciones"><input value={draft.certificationsText} onChange={e=>set('certificationsText',e.target.value)}/></Field>
  <Field label="Tarifa ref."><input type="number" value={draft.default_rate} onChange={e=>set('default_rate',e.target.value)}/></Field>
  <Field wide label="Notas"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
</div>}

function VehicleFields({draft,set,suppliers,people}:any){return <div className="record-form-grid">
  <Field label="Nombre / unidad"><input value={draft.label} onChange={e=>set('label',e.target.value)}/></Field>
  <Field label="Patente"><input value={draft.plate} onChange={e=>set('plate',e.target.value)}/></Field>
  <Field label="Proveedor"><select value={draft.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Propio / independiente</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
  <Field label="Conductor habitual"><select value={draft.driver_person_id} onChange={e=>set('driver_person_id',e.target.value)}><option value="">Sin asignar</option>{people.filter((p:ServicePerson)=>p.person_type==='Conductor').map((p:ServicePerson)=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
  <Field label="Marca"><input value={draft.brand} onChange={e=>set('brand',e.target.value)}/></Field>
  <Field label="Modelo"><input value={draft.model} onChange={e=>set('model',e.target.value)}/></Field>
  <Field label="Año"><input type="number" value={draft.year} onChange={e=>set('year',e.target.value)}/></Field>
  <Field label="Capacidad"><input type="number" value={draft.capacity} onChange={e=>set('capacity',e.target.value)}/></Field>
  <Field label="Revisión técnica vence"><input type="date" value={draft.technical_review_expiry} onChange={e=>set('technical_review_expiry',e.target.value)}/></Field>
  <Field label="Permiso circulación vence"><input type="date" value={draft.circulation_permit_expiry} onChange={e=>set('circulation_permit_expiry',e.target.value)}/></Field>
  <Field label="Seguro vence"><input type="date" value={draft.insurance_expiry} onChange={e=>set('insurance_expiry',e.target.value)}/></Field>
  <Field wide label="Notas"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
</div>}

function ResourceFields({draft,set,suppliers}:any){return <div className="record-form-grid">
  <Field label="Nombre"><input value={draft.name} onChange={e=>set('name',e.target.value)}/></Field>
  <Field label="Tipo"><input value={draft.resource_type} onChange={e=>set('resource_type',e.target.value)}/></Field>
  <Field label="Código"><input value={draft.code} onChange={e=>set('code',e.target.value)}/></Field>
  <Field label="Proveedor"><select value={draft.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Sin proveedor</option>{suppliers.map((s:Supplier)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
  <Field label="Cantidad total"><input type="number" value={draft.quantity_total} onChange={e=>set('quantity_total',e.target.value)}/></Field>
  <Field label="Disponible"><input type="number" value={draft.quantity_available} onChange={e=>set('quantity_available',e.target.value)}/></Field>
  <Field label="Ubicación"><input value={draft.location} onChange={e=>set('location',e.target.value)}/></Field>
  <Field label="Estado"><input value={draft.status} onChange={e=>set('status',e.target.value)}/></Field>
  <Field label="Mantención"><input type="date" value={draft.maintenance_due} onChange={e=>set('maintenance_due',e.target.value)}/></Field>
  <Field label="Vencimiento"><input type="date" value={draft.expiry_date} onChange={e=>set('expiry_date',e.target.value)}/></Field>
  <Field wide label="Notas"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
</div>}

async function uploadDocuments(type:EntityType,entityId:string,input:{documentType:string;expiresOn:string|null;notes:string|null;files:File[]}){
  const sb=assertSupabase();
  const {data:{user}}=await sb.auth.getUser();
  if(!user)throw new Error('Sesión requerida.');
  for(const file of input.files){
    if(file.size>20*1024*1024)throw new Error(`${file.name} supera 20 MB.`);
    const ext=safeName(file.name);
    const random=typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Math.random().toString(36).slice(2);
    const path=`${type}/${entityId}/${safeName(input.documentType)}/${Date.now()}-${random}-${ext}`;
    const upload=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined,upsert:false});
    if(upload.error)throw upload.error;
    const row={
      entity_type:type,entity_id:entityId,document_type:input.documentType,title:file.name,
      storage_bucket:BUCKET,storage_path:path,file_name:file.name,mime_type:file.type||null,
      size_bytes:file.size,expires_on:input.expiresOn,notes:input.notes,status:'active',uploaded_by:user.id
    };
    const saved=await sb.from('operational_entity_documents').insert(row);
    if(saved.error){await sb.storage.from(BUCKET).remove([path]);throw saved.error}
  }
}

async function openDocument(doc:OperationalDocument){
  const {data,error}=await assertSupabase().storage.from(doc.storage_bucket||BUCKET).createSignedUrl(doc.storage_path,300);
  if(error)return alert(error.message);
  window.open(data.signedUrl,'_blank','noopener,noreferrer');
}

function profileScore(type:EntityType,entity:any,docs:OperationalDocument[]){
  let sections:{label:string;ok:boolean;detail:string}[]=[];
  if(type==='supplier')sections=[
    {label:'Identidad',ok:Boolean(entity.name&&entity.supplier_type&&entity.rut),detail:'Nombre, tipo y RUT'},
    {label:'Contacto',ok:Boolean(entity.phone||entity.email),detail:'Teléfono o email'},
    {label:'Cumplimiento',ok:Boolean(entity.sernatur_registration||entity.permit_number||entity.insurance_policy),detail:'SERNATUR, permiso o seguro'},
    {label:'Documentos',ok:docs.length>0,detail:`${docs.length} archivo(s) respaldado(s)`}
  ];
  if(type==='person')sections=[
    {label:'Identidad',ok:Boolean(entity.full_name&&entity.person_type&&(entity.rut||entity.nationality)),detail:'Nombre, rol e identificación'},
    {label:'Contacto',ok:Boolean(entity.phone||entity.email),detail:'Teléfono o email'},
    {label:'Habilitaciones',ok:Boolean(entity.sernatur_registration||entity.first_aid_expiry||entity.license_type||(entity.certifications||[]).length),detail:'Credencial, PPAA, licencia o certificación'},
    {label:'Documentos',ok:docs.length>0,detail:`${docs.length} archivo(s) respaldado(s)`}
  ];
  if(type==='vehicle')sections=[
    {label:'Identificación',ok:Boolean(entity.label&&entity.plate&&(entity.brand||entity.model)),detail:'Unidad, patente y marca/modelo'},
    {label:'Operación',ok:Boolean(entity.capacity&&(entity.supplier_id||entity.driver_person_id||entity.driver_name)),detail:'Capacidad y responsable'},
    {label:'Vigencias',ok:Boolean(entity.technical_review_expiry||entity.circulation_permit_expiry||entity.insurance_expiry),detail:'Revisión, permiso o seguro'},
    {label:'Documentos',ok:docs.length>0,detail:`${docs.length} archivo(s) respaldado(s)`}
  ];
  if(type==='resource')sections=[
    {label:'Identificación',ok:Boolean(entity.name&&entity.resource_type),detail:'Nombre y tipo'},
    {label:'Disponibilidad',ok:Number(entity.quantity_total)>=0&&Number(entity.quantity_available)>=0,detail:'Stock controlado'},
    {label:'Control',ok:Boolean(entity.location||entity.maintenance_due||entity.expiry_date),detail:'Ubicación, mantención o vencimiento'},
    {label:'Documentos',ok:docs.length>0,detail:`${docs.length} archivo(s) respaldado(s)`}
  ];
  const done=sections.filter(x=>x.ok).length;
  return {sections,done,percent:Math.round(done/4*100)};
}

function draftFor(type:EntityType,e:any){
  if(type==='supplier')return pick(e,['name','supplier_type','contact_name','rut','phone','email','sernatur_registration','permit_number','insurance_policy','insurance_expiry','bank_name','account_number','services_offered','notes']);
  if(type==='person')return {...pick(e,['full_name','person_type','supplier_id','rut','phone','email','nationality','sernatur_registration','first_aid_expiry','license_type','license_expiry','emergency_contact','default_rate','notes']),languagesText:(e.languages||[]).join(', '),specialtiesText:(e.specialties||[]).join(', '),certificationsText:(e.certifications||[]).join(', ')};
  if(type==='vehicle')return pick(e,['label','plate','supplier_id','driver_person_id','brand','model','year','capacity','technical_review_expiry','circulation_permit_expiry','insurance_expiry','notes']);
  return pick(e,['name','resource_type','code','supplier_id','quantity_total','quantity_available','location','status','maintenance_due','expiry_date','notes']);
}
function normalizeDraft(type:EntityType,d:any){
  const out={...d};
  if(type==='person'){
    out.languages=csv(out.languagesText);out.specialties=csv(out.specialtiesText);out.certifications=csv(out.certificationsText);
    delete out.languagesText;delete out.specialtiesText;delete out.certificationsText;
    out.default_rate=out.default_rate===''?null:Number(out.default_rate);
  }
  if(type==='vehicle'){out.year=out.year===''?null:Number(out.year);out.capacity=out.capacity===''?null:Number(out.capacity)}
  if(type==='resource'){out.quantity_total=Number(out.quantity_total||0);out.quantity_available=Number(out.quantity_available||0)}
  for(const k of Object.keys(out))if(out[k]==='')out[k]=null;
  return out;
}
function pick(obj:any,keys:string[]){const out:any={};for(const k of keys)out[k]=obj?.[k]??'';return out}
function csv(v:any){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function entityKey(type:EntityType,id:string){return `${type}:${id}`}
function entityName(type:EntityType,e:any){return type==='supplier'?e.name:type==='person'?e.full_name:type==='vehicle'?`${e.plate||''} · ${e.label||''}`.replace(/^ · /,''):e.name}
function entitySubtitle(type:EntityType,e:any,suppliers:Supplier[]){if(type==='supplier')return e.supplier_type||'Proveedor';if(type==='person')return e.person_type||'Prestador';if(type==='vehicle')return suppliers.find(s=>s.id===e.supplier_id)?.name||[e.brand,e.model].filter(Boolean).join(' · ')||'Vehículo';return `${e.resource_type||'Insumo'} · ${e.quantity_available??0}/${e.quantity_total??0}`}
function entitySearch(e:any,type:EntityType){return [entityName(type,e),e.phone,e.email,e.rut,e.plate,e.brand,e.model,e.code,e.resource_type,e.person_type,e.supplier_type].filter(Boolean).join(' ').toLowerCase()}
function typeTitle(type:EntityType){return type==='supplier'?'Proveedores':type==='person'?'Prestadores':type==='vehicle'?'Vehículos':'Insumos'}
function typeLabel(type:EntityType){return type==='supplier'?'Proveedor':type==='person'?'Prestador':type==='vehicle'?'Vehículo':'Insumo'}
function documentLabel(type:EntityType,value:string){return documentOptions[type].find(x=>x.value===value)?.label||value}
function safeName(v:string){return String(v||'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,140)}
function expiryState(date?:string|null){if(!date)return 'none';const days=Math.ceil((new Date(`${date}T12:00:00`).getTime()-Date.now())/86400000);return days<0?'expired':days<=30?'soon':'ok'}
function dateFmt(d:string){return new Date(`${d}T12:00:00`).toLocaleDateString('es-CL')}
function formatBytes(v?:number|null){const n=Number(v||0);if(!n)return 'Tamaño no registrado';if(n<1024*1024)return `${Math.round(n/1024)} KB`;return `${(n/1024/1024).toFixed(1)} MB`}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={wide?'record-field wide':'record-field'}><span>{label}</span>{children}</label>}
function SectionTitle({icon,title,subtitle}:{icon:React.ReactNode;title:string;subtitle:string}){return <header className="record-section-title"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>}
function TypeButton({active,onClick,icon,label}:{active:boolean;onClick:()=>void;icon:React.ReactNode;label:string}){return <button className={active?'active':''} onClick={onClick}>{icon}{label}</button>}
function Kpi({label,value,icon,warn=false}:{label:string;value:number;icon:React.ReactNode;warn?:boolean}){return <article className={warn?'record-kpi warn':'record-kpi'}><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>}
function EmptySelection(){return <div className="records-empty-selection"><FolderOpen size={34}/><h3>Selecciona una ficha</h3><p>Elige un registro a la izquierda para completar sus datos y respaldar documentos.</p></div>}
