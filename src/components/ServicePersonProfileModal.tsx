import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  AlertTriangle,BadgeCheck,BriefcaseBusiness,Camera,CheckCircle2,Clock3,ExternalLink,FileCheck2,
  FileText,Image as ImageIcon,Link2,Mail,MapPin,Phone,Printer,RefreshCw,Save,ShieldCheck,
  Upload,UserRound,X
} from 'lucide-react';
import type {ServicePerson,Supplier} from '../types';
import {updateServicePerson} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './ServicePersonProfileModal.css';

type DriveSource={
  id:string;title:string;url:string;source_kind:string;observed_at:string;query_text?:string|null;metadata?:Record<string,unknown>|null;
};
type EntityDocument={
  id:string;entity_type?:string;entity_id?:string;document_type:string;title:string;storage_bucket:string;storage_path:string;file_name:string;
  mime_type?:string|null;size_bytes?:number|null;expires_on?:string|null;notes?:string|null;status:string;created_at?:string;updated_at?:string;
  source_kind?:string|null;external_url?:string|null;external_id?:string|null;verification_level?:'official'|'operational'|'historical'|string|null;source_metadata?:Record<string,unknown>|null;
};
type Requirement={
  key:string;label:string;required:boolean;reason:string;expiryField?:'first_aid_expiry'|'license_expiry';
};

const BUCKET='operational-files';

export default function ServicePersonProfileModal({
  person,suppliers,onClose,onChanged,onOpenFullRecord
}:{
  person:ServicePerson;
  suppliers:Supplier[];
  onClose:()=>void;
  onChanged:()=>void;
  onOpenFullRecord?:()=>void;
}){
  const [draft,setDraft]=useState<any>(()=>personDraft(person));
  const [sources,setSources]=useState<DriveSource[]>([]);
  const [documents,setDocuments]=useState<EntityDocument[]>([]);
  const [photoUrl,setPhotoUrl]=useState<string>('');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [photoLoading,setPhotoLoading]=useState(false);
  const [uploadingType,setUploadingType]=useState<string>('');
  const fileInputs=useRef<Record<string,HTMLInputElement|null>>({});

  const supplier=suppliers.find(s=>s.id===draft.supplier_id);
  const sourceCount=sources.length;
  const newestSource=useMemo(()=>sources[0]||null,[sources]);
  const requirements=useMemo(()=>requirementsFor(draft.person_type),[draft.person_type]);
  const compliance=useMemo(()=>complianceFor(requirements,documents,draft),[requirements,documents,draft]);

  const load=async()=>{
    setLoading(true);
    try{
      const sb=assertSupabase();
      const [src,docs]=await Promise.all([
        sb.from('operational_entity_sources').select('*').eq('entity_type','person').eq('entity_id',person.id).order('observed_at',{ascending:false}),
        sb.from('operational_entity_documents').select('*').eq('entity_type','person').eq('entity_id',person.id).eq('status','active').order('created_at',{ascending:false})
      ]);
      if(src.error)throw src.error;
      if(docs.error)throw docs.error;
      const rows=(docs.data||[]) as EntityDocument[];
      setSources((src.data||[]) as DriveSource[]);
      setDocuments(rows);
      await resolvePhoto(person,rows,setPhotoUrl);
    }catch(e:any){
      alert(e?.message||'No se pudo cargar la ficha.');
    }finally{setLoading(false)}
  };

  useEffect(()=>{
    setDraft(personDraft(person));
    setPhotoUrl('');
    void load();
  },[person.id,person.updated_at]);

  const set=(key:string,value:any)=>setDraft((prev:any)=>({...prev,[key]:value}));

  const save=async()=>{
    setSaving(true);
    try{
      await updateServicePerson(person.id,{
        full_name:draft.full_name||person.full_name,
        person_type:draft.person_type||person.person_type,
        supplier_id:draft.supplier_id||null,
        phone:draft.phone||null,
        whatsapp:draft.whatsapp||null,
        email:draft.email||null,
        rut:draft.rut||null,
        nationality:draft.nationality||null,
        languages:csv(draft.languagesText),
        specialties:csv(draft.specialtiesText),
        certifications:csv(draft.certificationsText),
        first_aid_expiry:draft.first_aid_expiry||null,
        license_type:draft.license_type||null,
        license_expiry:draft.license_expiry||null,
        sernatur_registration:draft.sernatur_registration||null,
        default_rate:draft.default_rate===''?null:Number(draft.default_rate),
        availability_notes:draft.availability_notes||null,
        emergency_contact:draft.emergency_contact||null,
        notes:draft.notes||null,
        updated_at:new Date().toISOString()
      });
      await onChanged();
      await load();
    }catch(e:any){alert(e?.message||'No se pudo guardar la ficha.')}
    finally{setSaving(false)}
  };

  const useDocumentAsPhoto=async(doc:EntityDocument)=>{
    if(!String(doc.mime_type||'').startsWith('image/'))return alert('Para usarla como foto de perfil, el documento debe ser una imagen.');
    setPhotoLoading(true);
    try{
      const sb=assertSupabase();
      const signed=await sb.storage.from(doc.storage_bucket||BUCKET).createSignedUrl(doc.storage_path,3600);
      if(signed.error)throw signed.error;
      await updateServicePerson(person.id,{
        profile_photo_url:null,
        profile_photo_source_url:`supabase://${doc.storage_bucket||BUCKET}/${doc.storage_path}`,
        profile_photo_source_title:doc.title,
        profile_photo_updated_at:new Date().toISOString()
      });
      setPhotoUrl(signed.data.signedUrl);
      await onChanged();
    }catch(e:any){alert(e?.message||'No se pudo usar el documento como foto.')}
    finally{setPhotoLoading(false)}
  };

  const uploadRequirement=async(req:Requirement,file:File)=>{
    if(file.size>20*1024*1024)return alert('El archivo supera 20 MB.');
    setUploadingType(req.key);
    const sb=assertSupabase();
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user)throw new Error('Sesión requerida.');
      const ext=safeName(file.name);
      const random=typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Math.random().toString(36).slice(2);
      const path=`person/${person.id}/${safeName(req.key)}/${Date.now()}-${random}-${ext}`;
      const uploaded=await sb.storage.from(BUCKET).upload(path,file,{contentType:file.type||undefined,upsert:false});
      if(uploaded.error)throw uploaded.error;
      const expiresOn=req.expiryField?draft[req.expiryField]||null:null;
      const saved=await sb.from('operational_entity_documents').insert({
        entity_type:'person',entity_id:person.id,document_type:req.key,title:file.name,
        storage_bucket:BUCKET,storage_path:path,file_name:file.name,mime_type:file.type||null,
        size_bytes:file.size,expires_on:expiresOn,notes:`Documento habilitante · ${req.label}`,
        status:'active',uploaded_by:user.id
      });
      if(saved.error){
        await sb.storage.from(BUCKET).remove([path]);
        throw saved.error;
      }
      if(!photoUrl&&String(file.type||'').startsWith('image/')&&req.key==='identity'){
        await updateServicePerson(person.id,{
          profile_photo_url:null,
          profile_photo_source_url:`supabase://${BUCKET}/${path}`,
          profile_photo_source_title:file.name,
          profile_photo_updated_at:new Date().toISOString()
        });
      }
      await load();
      await onChanged();
    }catch(e:any){alert(e?.message||'No se pudo subir el documento.')}
    finally{
      setUploadingType('');
      const input=fileInputs.current[req.key];
      if(input)input.value='';
    }
  };

  const initials=String(draft.full_name||person.full_name||'?').split(/\s+/).slice(0,2).map((x:string)=>x[0]||'').join('').toUpperCase();

  return <div className="provider-profile-backdrop" onMouseDown={onClose}>
    <section className="provider-profile" onMouseDown={e=>e.stopPropagation()}>
      <header className="provider-profile-top">
        <div className="provider-photo-wrap">
          {photoUrl?<img className="provider-photo" src={photoUrl} alt={draft.full_name||person.full_name}/>:<div className="provider-photo provider-photo-placeholder">{initials}</div>}
          <span className="provider-photo-badge"><Camera size={13}/>{photoUrl?'Foto documental':'Foto pendiente'}</span>
        </div>
        <div className="provider-profile-identity">
          <span className="eyebrow">HOTEL EXPERIENCE · FICHA PROFESIONAL</span>
          <h1>{draft.full_name||person.full_name}</h1>
          <div className="provider-role-line">
            <span>{draft.person_type||person.person_type}</span>
            {supplier&&<span>{supplier.name}</span>}
            {draft.sernatur_registration&&<span><BadgeCheck size={13}/> SERNATUR {draft.sernatur_registration}</span>}
          </div>
          <p>{sourceCount} antecedente{sourceCount===1?'':'s'} Drive · {documents.length} documento{documents.length===1?'':'s'} en ficha{newestSource?` · última fuente ${new Date(newestSource.observed_at).toLocaleDateString('es-CL')}`:''}</p>
        </div>
        <div className="provider-profile-actions no-print">
          <button type="button" onClick={()=>window.print()}><Printer size={15}/> Imprimir</button>
          {onOpenFullRecord&&<button type="button" onClick={onOpenFullRecord}><FileText size={15}/> Ficha 360</button>}
          <button type="button" onClick={load}><RefreshCw size={15}/> Actualizar</button>
          <button className="provider-close" type="button" onClick={onClose}><X/></button>
        </div>
      </header>

      {loading?<div className="provider-loading">Cargando ficha profesional…</div>:<div className="provider-profile-body">
        <section className={`provider-readiness ${compliance.tone}`}>
          <div className="provider-readiness-icon">{compliance.tone==='ready'?<CheckCircle2/>:compliance.tone==='review'?<Clock3/>:<AlertTriangle/>}</div>
          <div className="provider-readiness-copy">
            <span>DISPONIBILIDAD OPERACIONAL</span>
            <h2>{compliance.label}</h2>
            <p>{compliance.detail}</p>
          </div>
          <div className="provider-readiness-score"><strong>{compliance.ok}/{compliance.required}</strong><span>requisitos válidos</span></div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<FileCheck2/>} title="Documentos habilitantes" subtitle="Cada requisito tiene su respaldo. Solo los documentos vigentes cuentan para habilitación operacional."/>
          <div className="provider-requirements">
            {requirements.map(req=>{
              const state=requirementState(req,documents,draft);
              return <article key={req.key} className={`provider-requirement ${state.tone}`}>
                <div className="provider-requirement-status">{state.tone==='ok'?<CheckCircle2/>:state.tone==='expired'?<AlertTriangle/>:<Clock3/>}</div>
                <div className="provider-requirement-copy">
                  <div><strong>{req.label}</strong>{req.required?<span className="required-chip">REQUERIDO</span>:<span className="optional-chip">RESPALDO</span>}</div>
                  <p>{state.message}</p>
                  <small>{req.reason}</small>
                </div>
                <div className="provider-requirement-actions no-print">
                  {state.doc&&<button type="button" onClick={()=>openStoredDocument(state.doc!)}><ExternalLink size={14}/> Abrir documento</button>}
                  <label className="doc-upload-button">
                    <Upload size={14}/>{uploadingType===req.key?'Subiendo…':state.doc?'Reemplazar / agregar':'Subir documento'}
                    <input ref={el=>{fileInputs.current[req.key]=el}} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.docx" disabled={Boolean(uploadingType)} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadRequirement(req,file)}}/>
                  </label>
                </div>
              </article>
            })}
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<UserRound/>} title="Identidad y contacto" subtitle="Registro central del prestador. Estos datos se guardan directamente en Hotel Experience."/>
          <div className="provider-form-grid">
            <Field label="Nombre completo"><input value={draft.full_name} onChange={e=>set('full_name',e.target.value)}/></Field>
            <Field label="Rol"><input value={draft.person_type} onChange={e=>set('person_type',e.target.value)}/></Field>
            <Field label="RUT"><input value={draft.rut} onChange={e=>set('rut',e.target.value)}/></Field>
            <Field label="Nacionalidad"><input value={draft.nationality} onChange={e=>set('nationality',e.target.value)}/></Field>
            <Field label="Teléfono"><div className="field-with-icon"><Phone size={14}/><input value={draft.phone} onChange={e=>set('phone',e.target.value)}/></div></Field>
            <Field label="WhatsApp"><input value={draft.whatsapp} onChange={e=>set('whatsapp',e.target.value)}/></Field>
            <Field label="Email"><div className="field-with-icon"><Mail size={14}/><input value={draft.email} onChange={e=>set('email',e.target.value)}/></div></Field>
            <Field label="Proveedor / agencia"><select value={draft.supplier_id} onChange={e=>set('supplier_id',e.target.value)}><option value="">Independiente</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<ShieldCheck/>} title="Credenciales y vigencias" subtitle="Datos que permiten leer rápidamente si la persona puede ser asignada a una salida."/>
          <div className="provider-form-grid">
            <Field label="Registro SERNATUR"><input value={draft.sernatur_registration} onChange={e=>set('sernatur_registration',e.target.value)}/></Field>
            <Field label="PPAA vence"><input type="date" value={draft.first_aid_expiry} onChange={e=>set('first_aid_expiry',e.target.value)}/></Field>
            <Field label="Licencia conducir"><input value={draft.license_type} onChange={e=>set('license_type',e.target.value)}/></Field>
            <Field label="Licencia vence"><input type="date" value={draft.license_expiry} onChange={e=>set('license_expiry',e.target.value)}/></Field>
            <Field wide label="Certificaciones"><input value={draft.certificationsText} onChange={e=>set('certificationsText',e.target.value)} placeholder="Separadas por coma"/></Field>
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<BriefcaseBusiness/>} title="Perfil operacional" subtitle="Lo que necesitamos saber para elegir, coordinar y evaluar al prestador."/>
          <div className="provider-form-grid">
            <Field label="Idiomas"><input value={draft.languagesText} onChange={e=>set('languagesText',e.target.value)}/></Field>
            <Field label="Especialidades"><input value={draft.specialtiesText} onChange={e=>set('specialtiesText',e.target.value)}/></Field>
            <Field label="Tarifa referencia"><input type="number" value={draft.default_rate} onChange={e=>set('default_rate',e.target.value)}/></Field>
            <Field label="Contacto emergencia"><input value={draft.emergency_contact} onChange={e=>set('emergency_contact',e.target.value)}/></Field>
            <Field wide label="Disponibilidad"><textarea value={draft.availability_notes} onChange={e=>set('availability_notes',e.target.value)} placeholder="Días, horarios, restricciones, territorio, anticipación requerida…"/></Field>
            <Field wide label="Notas operacionales"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)} placeholder="Experiencia, observaciones, referencias, condiciones de trabajo…"/></Field>
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<Link2/>} title="Antecedentes y fuentes Drive" subtitle="Historial documental que explica de dónde salió la información. No reemplaza los documentos habilitantes."/>
          <div className="provider-drive-list">
            {sources.map(source=><article key={source.id}>
              <div className="provider-drive-icon"><Link2 size={16}/></div>
              <div><strong>{source.title}</strong><span>Google Drive · consultado {new Date(source.observed_at).toLocaleDateString('es-CL')}</span></div>
              <a className="no-print" href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir fuente</a>
              <span className="print-only provider-print-url">{source.url}</span>
            </article>)}
            {!sources.length&&<div className="provider-empty">Todavía no hay antecedentes Drive vinculados a esta persona.</div>}
          </div>

          <div className="provider-doc-list">
            {documents.map(doc=><article key={doc.id}>
              <div className="provider-drive-icon">{String(doc.mime_type||'').startsWith('image/')?<ImageIcon size={16}/>:<FileText size={16}/>}</div>
              <div><strong>{doc.title}</strong><span>{documentTypeLabel(doc.document_type)} · {verificationLabel(doc.verification_level)}{doc.expires_on?` · vence ${dateFmt(doc.expires_on)}`:''}</span></div>
              {String(doc.mime_type||'').startsWith('image/')&&<button className="no-print" type="button" disabled={photoLoading} onClick={()=>useDocumentAsPhoto(doc)}><Camera size={14}/> Usar como foto</button>}
              <button className="no-print" type="button" onClick={()=>openStoredDocument(doc)}><ExternalLink size={14}/> Abrir</button>
            </article>)}
            {!documents.length&&<div className="provider-empty">No hay documentos habilitantes cargados todavía.</div>}
          </div>
          {!photoUrl&&<div className="provider-photo-note"><Camera size={15}/><span>La foto de perfil se obtiene de una imagen documental real. Al subir una cédula o credencial en imagen, puede usarse como foto de ficha.</span></div>}
        </section>

        <section className="provider-print-cert print-only">
          <h3>Control documental de prestador</h3>
          <p>Estado al momento de impresión: <strong>{compliance.label}</strong>. Documento generado desde Hotel Experience el {new Date().toLocaleDateString('es-CL')}.</p>
        </section>

        <footer className="provider-profile-footer">
          <div><MapPin size={14}/><span>Registro único · Hotel Experience · {person.person_code||person.id.slice(0,8)}</span></div>
          <button className="primary-button no-print" type="button" disabled={saving} onClick={save}><Save size={15}/>{saving?'Guardando…':'Guardar cambios'}</button>
        </footer>
      </div>}
    </section>
  </div>;
}

function requirementsFor(personType:string):Requirement[]{
  const role=String(personType||'').toLowerCase();
  const isGuide=role.includes('guía')||role.includes('guia');
  const isDriver=role.includes('conductor')||role.includes('chofer');
  const isMountain=role.includes('montaña')||role.includes('montana');
  return [
    {key:'identity',label:'Cédula / pasaporte',required:true,reason:'Identidad del prestador.'},
    {key:'sernatur',label:'Registro SERNATUR',required:isGuide,reason:isGuide?'Requisito operacional definido para roles de guía.':'Antecedente profesional cuando corresponda.'},
    {key:'first_aid',label:'Primeros auxilios / PPAA',required:isGuide||isMountain,reason:(isGuide||isMountain)?'Respaldo vigente para trabajo en terreno.':'Antecedente recomendado según servicio.',expiryField:'first_aid_expiry'},
    {key:'driver_license',label:'Licencia de conducir',required:isDriver,reason:isDriver?'Requisito para asignación como conductor.':'Solo aplica si conduce vehículos en operación.',expiryField:'license_expiry'},
    {key:'certification',label:'Certificaciones / credenciales',required:isMountain,reason:isMountain?'Respaldo técnico para especialidad de montaña.':'Credenciales complementarias según especialidad.'}
  ];
}

function complianceFor(requirements:Requirement[],documents:EntityDocument[],draft:any){
  const required=requirements.filter(r=>r.required);
  const states=required.map(r=>requirementState(r,documents,draft));
  const ok=states.filter(s=>s.tone==='ok').length;
  const expired=states.filter(s=>s.tone==='expired').length;
  if(required.length&&ok===required.length)return {tone:'ready',label:'APTO DOCUMENTALMENTE',detail:'Todos los documentos definidos como obligatorios para este rol están cargados y vigentes.',ok,required:required.length};
  if(expired>0)return {tone:'blocked',label:'NO APTO · DOCUMENTO VENCIDO',detail:'Existe al menos un documento obligatorio vencido. Debe renovarse antes de asignar operación.',ok,required:required.length};
  return {tone:'review',label:'INCOMPLETO · REQUIERE REVISIÓN',detail:'Falta uno o más respaldos obligatorios antes de considerar al prestador documentalmente habilitado.',ok,required:required.length};
}

function requirementState(req:Requirement,documents:EntityDocument[],draft:any){
  const matching=documents.filter(d=>d.document_type===req.key);
  const official=matching.find(d=>(d.verification_level||'official')==='official');
  const evidence=matching.find(d=>(d.verification_level||'official')!=='official');
  const doc=official||evidence||null;
  if(!doc)return {tone:'missing',message:req.required?'Falta respaldo documental.':'Sin documento asociado.',doc:null as EntityDocument|null};
  if(!official){
    const level=doc.verification_level==='historical'?'antecedente histórico':'evidencia operativa';
    return {tone:'review',message:`Existe ${level} en Drive, pero falta el documento oficial habilitante.`,doc};
  }
  const expiry=official.expires_on||(req.expiryField?draft[req.expiryField]:null);
  if(expiry){
    const end=new Date(`${expiry}T23:59:59`).getTime();
    if(Number.isFinite(end)&&end<Date.now())return {tone:'expired',message:`Documento oficial vencido el ${dateFmt(expiry)}.`,doc:official};
    if(Number.isFinite(end)&&end-Date.now()<30*86400000)return {tone:'review',message:`Documento oficial vigente hasta ${dateFmt(expiry)} · vence pronto.`,doc:official};
    return {tone:'ok',message:`Documento oficial vigente hasta ${dateFmt(expiry)}.`,doc:official};
  }
  return {tone:'ok',message:'Documento oficial cargado y disponible para revisión.',doc:official};
}

async function resolvePhoto(person:ServicePerson,docs:EntityDocument[],setPhoto:(url:string)=>void){
  const sb=assertSupabase();
  const explicit=String(person.profile_photo_url||'');
  if(explicit){setPhoto(explicit);return}
  const stored=String(person.profile_photo_source_url||'');
  if(stored.startsWith('supabase://')){
    const raw=stored.slice('supabase://'.length);
    const slash=raw.indexOf('/');
    const bucket=slash>0?raw.slice(0,slash):BUCKET;
    const path=slash>0?raw.slice(slash+1):raw;
    const signed=await sb.storage.from(bucket).createSignedUrl(path,3600);
    if(!signed.error&&signed.data?.signedUrl){setPhoto(signed.data.signedUrl);return}
  }
  const identityImage=docs.find(d=>d.document_type==='identity'&&String(d.mime_type||'').startsWith('image/'));
  const imageDoc=identityImage||docs.find(d=>String(d.mime_type||'').startsWith('image/'));
  if(imageDoc){
    const signed=await sb.storage.from(imageDoc.storage_bucket||BUCKET).createSignedUrl(imageDoc.storage_path,3600);
    if(!signed.error&&signed.data?.signedUrl)setPhoto(signed.data.signedUrl);
  }
}

async function openStoredDocument(doc:EntityDocument){
  if(doc.external_url||doc.source_kind==='drive'){
    const url=doc.external_url||doc.storage_path;
    if(url)window.open(url,'_blank','noopener,noreferrer');
    return;
  }
  const sb=assertSupabase();
  const signed=await sb.storage.from(doc.storage_bucket||BUCKET).createSignedUrl(doc.storage_path,300);
  if(signed.error)return alert(signed.error.message);
  window.open(signed.data.signedUrl,'_blank','noopener,noreferrer');
}

function personDraft(p:ServicePerson){return{
  full_name:p.full_name||'',person_type:p.person_type||'',supplier_id:p.supplier_id||'',phone:p.phone||'',whatsapp:p.whatsapp||'',
  email:p.email||'',rut:p.rut||'',nationality:p.nationality||'',sernatur_registration:p.sernatur_registration||'',
  first_aid_expiry:p.first_aid_expiry||'',license_type:p.license_type||'',license_expiry:p.license_expiry||'',
  default_rate:p.default_rate??'',availability_notes:p.availability_notes||'',emergency_contact:p.emergency_contact||'',notes:p.notes||'',
  languagesText:(p.languages||[]).join(', '),specialtiesText:(p.specialties||[]).join(', '),certificationsText:(p.certifications||[]).join(', ')
}}
function csv(v:string){return String(v||'').split(',').map(x=>x.trim()).filter(Boolean)}
function safeName(v:string){return String(v||'archivo').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,140)}
function dateFmt(date:string){return new Date(`${date}T12:00:00`).toLocaleDateString('es-CL')}
function documentTypeLabel(type:string){return ({identity:'Cédula / pasaporte',sernatur:'Registro SERNATUR',first_aid:'Primeros auxilios',driver_license:'Licencia de conducir',certification:'Certificación / credencial',bank:'Datos bancarios',contract:'Contrato / acuerdo',other:'Otro documento'} as Record<string,string>)[type]||type}
function verificationLabel(level?:string|null){return level==='operational'?'Evidencia operativa Drive':level==='historical'?'Antecedente histórico':'Documento oficial'}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={wide?'provider-field wide':'provider-field'}><span>{label}</span>{children}</label>}
function SectionTitle({icon,title,subtitle}:{icon:React.ReactNode;title:string;subtitle:string}){return <header className="provider-section-title"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>}
