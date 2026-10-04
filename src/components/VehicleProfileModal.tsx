import React,{useEffect,useRef,useState} from 'react';
import {AlertTriangle,CarFront,CheckCircle2,ExternalLink,FileText,FolderOpen,Printer,RefreshCw,Save,ShieldCheck,Upload,X} from 'lucide-react';
import type {ServicePerson,Supplier,Vehicle} from '../types';
import {updateVehicle} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import {chileToday,hasStoredOperationalFile,vehicleDateFmt,vehicleDocumentReadiness,vehicleDocumentRequirements,vehicleRequirementState,type VehicleDocument,type VehicleRequirement} from '../lib/vehicleDocuments';
import './ServicePersonProfileModal.css';
import './VehicleProfileModal.css';

type Source={id:string;title:string;url:string;observed_at:string};
type Props={vehicle:Vehicle;suppliers:Supplier[];people:ServicePerson[];canEdit:boolean;onClose:()=>void;onChanged:()=>Promise<void>;onOpenFullRecord?:()=>void};

export default function VehicleProfileModal({vehicle,suppliers,people,canEdit,onClose,onChanged,onOpenFullRecord}:Props){
  const [draft,setDraft]=useState(()=>vehicleDraft(vehicle));
  const [documents,setDocuments]=useState<VehicleDocument[]>([]);
  const [sources,setSources]=useState<Source[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState('');
  const [uploadExpiry,setUploadExpiry]=useState<Record<string,string>>({});
  const dialog=useRef<HTMLElement>(null);
  const fileInputs=useRef<Record<string,HTMLInputElement|null>>({});

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const sb=assertSupabase();
      const [record,docs,src]=await Promise.all([
        sb.from('vehicles').select('*').eq('id',vehicle.id).single(),
        sb.from('operational_entity_documents').select('*').eq('entity_type','vehicle').eq('entity_id',vehicle.id).eq('status','active').order('created_at',{ascending:false}),
        sb.from('operational_entity_sources').select('*').eq('entity_type','vehicle').eq('entity_id',vehicle.id).order('observed_at',{ascending:false})
      ]);
      for(const result of [record,docs,src])if(result.error)throw result.error;
      setDraft(vehicleDraft(record.data));setDocuments(docs.data||[]);setSources(src.data||[]);
    }catch(e:any){setError(e?.message||'No se pudo cargar la ficha del vehículo.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[vehicle.id]);
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    dialog.current?.querySelector<HTMLButtonElement>('.provider-close')?.focus();
    return ()=>{previous?.focus()};
  },[]);

  const set=(key:string,value:any)=>setDraft(prev=>({...prev,[key]:value}));
  const readiness=vehicleDocumentReadiness(documents,draft.active);
  const registry=documents.find(d=>d.document_type==='vehicle_registry'&&d.verification_level==='official')?.source_metadata?.vehicle_details||{};
  const supplier=suppliers.find(s=>s.id===draft.supplier_id);
  const storedCount=documents.filter(hasStoredOperationalFile).length;
  const save=async()=>{
    if(!canEdit||saving)return;
    if(!draft.label.trim()||!draft.plate.trim()){setError('Ingresa el nombre y la patente.');return}
    const capacity=draft.capacity===''?null:Number(draft.capacity);
    const year=draft.year===''?null:Number(draft.year);
    if((capacity!==null&&(!Number.isInteger(capacity)||capacity<=0))||(year!==null&&(!Number.isInteger(year)||year<1900))){setError('Revisa el año y la capacidad del vehículo.');return}
    setSaving(true);setError('');
    try{
      await updateVehicle(vehicle.id,{...draft,label:draft.label.trim(),plate:draft.plate.trim().toUpperCase(),capacity,year,updated_at:new Date().toISOString()});
      await onChanged();await load();
    }catch(e:any){setError(e?.message||'No se pudo guardar la ficha.')}
    finally{setSaving(false)}
  };

  const upload=async(req:VehicleRequirement,file:File)=>{
    if(!canEdit||uploading)return;
    if(file.size>20*1024*1024){setError('El archivo supera 20 MB.');return}
    setUploading(req.key);setError('');
    const sb=assertSupabase();
    const path=`vehicle/${vehicle.id}/${req.key}/${crypto.randomUUID()}-${safeName(file.name)}`;
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user)throw new Error('Sesión requerida.');
      const uploaded=await sb.storage.from('operational-files').upload(path,file,{contentType:file.type||undefined,upsert:false});
      if(uploaded.error)throw uploaded.error;
      const expires=uploadExpiry[req.key]||null;
      const saved=await sb.from('operational_entity_documents').insert({
        entity_type:'vehicle',entity_id:vehicle.id,document_type:req.key,title:file.name,
        storage_bucket:'operational-files',storage_path:path,file_name:file.name,mime_type:file.type||null,
        size_bytes:file.size,expires_on:expires,notes:`Documento de vehículo · ${req.label}`,
        status:'active',uploaded_by:user.id,source_kind:'upload',verification_level:'official'
      });
      if(saved.error){await sb.storage.from('operational-files').remove([path]);throw saved.error}
      const expiryField=({technical_review:'technical_review_expiry',circulation_permit:'circulation_permit_expiry',soap:'insurance_expiry'} as Record<string,string>)[req.key];
      if(expiryField&&expires)await updateVehicle(vehicle.id,{[expiryField]:expires});
      await onChanged();await load();
    }catch(e:any){setError(e?.message||'No se pudo subir el documento.')}
    finally{setUploading('');const input=fileInputs.current[req.key];if(input)input.value=''}
  };

  const keyboard=(event:React.KeyboardEvent<HTMLElement>)=>{
    if(event.key==='Escape'){event.preventDefault();onClose();return}
    if(event.key!=='Tab')return;
    const elements=Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')||[]).filter(el=>el.offsetParent!==null);
    const first=elements[0],last=elements[elements.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
  };

  return <div className="provider-profile-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="provider-profile vehicle-profile" role="dialog" aria-modal="true" aria-labelledby="vehicle-profile-title" ref={dialog} onKeyDown={keyboard}>
      <header className="provider-profile-top">
        <div className="provider-photo-wrap"><div className="provider-photo provider-photo-placeholder vehicle-profile-plate"><CarFront size={30}/><strong>{draft.plate}</strong></div></div>
        <div className="provider-profile-identity">
          <span className="eyebrow">HOTEL EXPERIENCE · {vehicle.vehicle_code||'VEHÍCULO'}</span>
          <h1 id="vehicle-profile-title">{draft.label}</h1>
          <div className="provider-role-line"><span>{[draft.brand,draft.year].filter(Boolean).join(' · ')||'Identificación pendiente'}</span><span>{draft.active?'Registro activo':'Fuera de servicio'}</span><span>{documents.length} documento(s) · {storedCount} copia(s) cargada(s)</span></div>
          <p>{supplier?.name||'Proveedor sin vincular'} · {draft.capacity?`${draft.capacity} pasajeros`:'Capacidad pendiente de respaldo'}</p>
        </div>
        <div className="provider-profile-actions no-print">
          <button type="button" disabled={loading||Boolean(error)} onClick={()=>window.print()}><Printer size={15}/> Imprimir / PDF</button>
          <button type="button" disabled={loading} onClick={()=>void load()}><RefreshCw size={15}/> Actualizar</button>
          {onOpenFullRecord&&<button type="button" onClick={onOpenFullRecord}><FolderOpen size={15}/> Ficha y archivos</button>}
          <button className="provider-close" type="button" aria-label="Cerrar ficha del vehículo" onClick={onClose}><X size={18}/></button>
        </div>
      </header>

      {loading?<div className="provider-loading">Cargando ficha del vehículo…</div>:<div className="provider-profile-body">
        {error&&<div className="vehicle-profile-error" role="alert">{error}</div>}
        <section className={`provider-readiness ${readiness.tone}`}>
          <div className="provider-readiness-icon">{readiness.tone==='ready'?<CheckCircle2/>:<AlertTriangle/>}</div>
          <div className="provider-readiness-copy"><span>CONTROL DOCUMENTAL</span><h2>{readiness.label}</h2><p>Revisión de padrón, permiso de circulación, revisión técnica y SOAP. La disponibilidad para cada salida se confirma en Operaciones.</p></div>
          <div className="provider-readiness-score"><strong>{readiness.ok}/{readiness.total}</strong><span>Respaldos completos</span></div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<ShieldCheck size={18}/>} title="Documentos del vehículo" subtitle="Abre cada respaldo, revisa su fecha o carga el que falta."/>
          <div className="provider-requirements">
            {vehicleDocumentRequirements.map(req=>{
              const state=vehicleRequirementState(req,documents);
              const date=uploadExpiry[req.key]||'';
              return <article className={`provider-requirement ${state.tone==='soon'?'review':state.tone}`} key={req.key}>
                <div className="provider-requirement-status">{state.tone==='ok'||state.tone==='soon'?<CheckCircle2/>:<AlertTriangle/>}</div>
                <div className="provider-requirement-copy"><div><strong>{req.label}</strong><span className={req.required?'required-chip':'optional-chip'}>{req.required?'CONTROL BASE':'SEGÚN OPERACIÓN'}</span></div><p>{state.message}</p>{state.doc&&<small>{state.doc.file_name} · {hasStoredOperationalFile(state.doc)?'Copia cargada en ficha':'Enlace a Drive'}</small>}</div>
                <div className="provider-requirement-actions no-print">
                  {state.doc&&<button type="button" onClick={()=>void openVehicleDocument(state.doc!)}><ExternalLink size={13}/> Abrir</button>}
                  {canEdit&&<>
                    {req.expiry&&<label className="vehicle-upload-expiry">Vence el<input aria-label={`Vencimiento de ${req.label}`} type="date" value={date} onChange={e=>setUploadExpiry(prev=>({...prev,[req.key]:e.target.value}))}/></label>}
                    <label className="doc-upload-button"><Upload size={13}/>{uploading===req.key?'Subiendo…':'Subir documento'}<input ref={el=>{fileInputs.current[req.key]=el}} disabled={Boolean(uploading)} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" onChange={e=>{const file=e.target.files?.[0];if(file)void upload(req,file)}}/></label>
                  </>}
                </div>
              </article>;
            })}
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<CarFront size={18}/>} title="Identificación y operación" subtitle="Datos que se utilizan al asignar el vehículo a una salida."/>
          <div className="provider-form-grid">
            <Field label="Nombre de la unidad"><input disabled={!canEdit} value={draft.label} onChange={e=>set('label',e.target.value)}/></Field>
            <Field label="Patente"><input disabled={!canEdit} value={draft.plate} onChange={e=>set('plate',e.target.value)}/></Field>
            <Field label="Marca"><input disabled={!canEdit} value={draft.brand} onChange={e=>set('brand',e.target.value)}/></Field>
            <Field label="Modelo"><input disabled={!canEdit} value={draft.model} onChange={e=>set('model',e.target.value)}/></Field>
            <Field label="Año"><input disabled={!canEdit} type="number" value={draft.year} onChange={e=>set('year',e.target.value)}/></Field>
            <Field label="Capacidad de pasajeros"><input disabled={!canEdit} type="number" min="1" value={draft.capacity} onChange={e=>set('capacity',e.target.value)}/></Field>
            <Field label="Proveedor"><select disabled={!canEdit} value={draft.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Sin vincular</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
            <Field label="Conductor habitual"><select disabled={!canEdit} value={draft.driver_person_id} onChange={e=>set('driver_person_id',e.target.value)}><option value="">Sin asignar</option>{people.filter(p=>/conductor|chofer/i.test(p.person_type)).map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select></Field>
            <Field label="Contacto del conductor"><input disabled={!canEdit} value={draft.driver_name} onChange={e=>set('driver_name',e.target.value)}/></Field>
            <Field label="Teléfono del conductor"><input disabled={!canEdit} value={draft.driver_phone} onChange={e=>set('driver_phone',e.target.value)}/></Field>
            <Field label="Estado del registro"><select disabled={!canEdit} value={draft.active?'active':'inactive'} onChange={e=>set('active',e.target.value==='active')}><option value="active">Activo</option><option value="inactive">Fuera de servicio</option></select></Field>
            <Field wide label="Observaciones y pendientes"><textarea disabled={!canEdit} value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
          </div>
        </section>

        {Object.keys(registry).length>0&&<section className="provider-profile-section">
          <SectionTitle icon={<FileText size={18}/>} title="Antecedentes de inscripción" subtitle="Transcritos desde el certificado de Registro Civil; conserva su fecha de emisión."/>
          <dl className="vehicle-registry-details">{Object.entries({Propietaria:registry.owner_name,'RUT propietaria':registry.owner_rut,'Tipo de vehículo':registry.vehicle_type,Color:registry.color,Combustible:registry.fuel,'Número de motor':registry.engine_number,'Número de chasis':registry.chassis_number,'Peso bruto':registry.gross_weight_kg?`${registry.gross_weight_kg} kg`:null,'Certificado emitido':registry.issued_on?vehicleDateFmt(registry.issued_on):null}).filter(([,value])=>value).map(([label,value])=><div key={label}><dt>{label}</dt><dd>{String(value)}</dd></div>)}</dl>
        </section>}

        <section className="provider-profile-section">
          <SectionTitle icon={<FolderOpen size={18}/>} title="Archivos y fuentes" subtitle="Todos los documentos quedan asociados a este vehículo y conservan su origen."/>
          <div className="provider-doc-list">{documents.map(doc=><article key={doc.id}>
            <div className="provider-drive-icon"><FileText size={17}/></div>
            <div><strong>{doc.title}</strong><span>{hasStoredOperationalFile(doc)?'Copia privada cargada':'Documento en Drive'} · {doc.verification_level==='operational'?'Evidencia por revisar':doc.verification_level==='historical'?'Antecedente histórico':'Documento oficial'}</span>{doc.notes&&<span>{doc.notes}</span>}{doc.expires_on&&<span>Vence: {vehicleDateFmt(doc.expires_on)}</span>}</div>
            <button className="no-print" type="button" onClick={()=>void openVehicleDocument(doc)}><ExternalLink size={13}/> {hasStoredOperationalFile(doc)?'Abrir copia':'Abrir documento'}</button>
            {doc.external_url&&<a className="no-print" href={doc.external_url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Drive</a>}
            {doc.external_url&&<span className="print-only provider-print-url">{doc.external_url}</span>}
          </article>)}</div>
          {!documents.length&&<div className="provider-empty">No hay documentos cargados.</div>}
          <div className="provider-drive-list vehicle-source-list">{sources.map(source=><article key={source.id}><div className="provider-drive-icon"><FolderOpen size={17}/></div><div><strong>{source.title}</strong><span>Fuente documental de este vehículo</span></div><a className="no-print" href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={13}/> Abrir fuente</a><span className="print-only provider-print-url">{source.url}</span></article>)}</div>
        </section>
        <section className="provider-print-cert print-only"><h3>Control documental del vehículo</h3><p>Estado al imprimir: <strong>{readiness.label}</strong> · {readiness.ok}/{readiness.total} respaldos completos. Generado desde Hotel Experience el {vehicleDateFmt(chileToday())}.</p></section>
        <footer className="provider-profile-footer"><div><CarFront size={14}/><span>{vehicle.vehicle_code||vehicle.id.slice(0,8)} · {draft.plate} · Hotel Experience</span></div>{canEdit&&<button className="primary-button no-print" disabled={saving||Boolean(uploading)} type="button" onClick={()=>void save()}><Save size={15}/>{saving?'Guardando…':'Guardar cambios'}</button>}</footer>
      </div>}
    </section>
  </div>;
}

async function openVehicleDocument(doc:VehicleDocument){
  const tab=window.open('about:blank','_blank');
  if(!tab){alert('Permite abrir ventanas para ver el documento.');return}
  tab.opener=null;
  try{
    if(hasStoredOperationalFile(doc)){
      const signed=await assertSupabase().storage.from(doc.storage_bucket).createSignedUrl(doc.storage_path,300);
      if(signed.error)throw signed.error;
      tab.location.href=signed.data.signedUrl;
    }else{
      const url=doc.external_url||(/^https?:\/\//.test(doc.storage_path)?doc.storage_path:null);
      if(!url)throw new Error('El archivo no tiene una copia ni un enlace disponible.');
      tab.location.href=url;
    }
  }catch(e:any){tab.close();alert(e?.message||'No se pudo abrir el documento.')}
}
function vehicleDraft(v:Vehicle){return {label:v.label||'',plate:v.plate||'',brand:v.brand||'',model:v.model||'',year:v.year??'',capacity:v.capacity??'',supplier_id:v.supplier_id||'',driver_person_id:v.driver_person_id||'',driver_name:v.driver_name||'',driver_phone:v.driver_phone||'',notes:v.notes||'',active:v.active}}
function safeName(value:string){return value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').slice(0,140)}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={wide?'provider-field wide':'provider-field'}><span>{label}</span>{children}</label>}
function SectionTitle({icon,title,subtitle}:{icon:React.ReactNode;title:string;subtitle:string}){return <header className="provider-section-title"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>}
