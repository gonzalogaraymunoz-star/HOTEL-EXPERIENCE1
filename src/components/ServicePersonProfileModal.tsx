import React,{useEffect,useMemo,useState} from 'react';
import {BadgeCheck,BriefcaseBusiness,Camera,ExternalLink,FileText,Image as ImageIcon,Link2,Mail,MapPin,Phone,RefreshCw,Save,ShieldCheck,UserRound,X} from 'lucide-react';
import type {ServicePerson,Supplier} from '../types';
import {updateServicePerson} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './ServicePersonProfileModal.css';

type DriveSource={
  id:string;title:string;url:string;source_kind:string;observed_at:string;query_text?:string|null;metadata?:Record<string,unknown>|null;
};
type EntityDocument={
  id:string;document_type:string;title:string;storage_bucket:string;storage_path:string;file_name:string;
  mime_type?:string|null;expires_on?:string|null;notes?:string|null;status:string;
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
  const [photoUrl,setPhotoUrl]=useState<string>(person.profile_photo_url||'');
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [photoLoading,setPhotoLoading]=useState(false);

  const supplier=suppliers.find(s=>s.id===draft.supplier_id);
  const sourceCount=sources.length;
  const newestSource=useMemo(()=>sources[0]||null,[sources]);

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
      setSources((src.data||[]) as DriveSource[]);
      setDocuments((docs.data||[]) as EntityDocument[]);
      const explicit=person.profile_photo_url||'';
      if(explicit){setPhotoUrl(explicit);return}
      const imageDoc=(docs.data||[]).find((d:any)=>String(d.mime_type||'').startsWith('image/'));
      if(imageDoc){
        const signed=await sb.storage.from(imageDoc.storage_bucket||BUCKET).createSignedUrl(imageDoc.storage_path,3600);
        if(!signed.error&&signed.data?.signedUrl)setPhotoUrl(signed.data.signedUrl);
      }
    }finally{setLoading(false)}
  };
  useEffect(()=>{setDraft(personDraft(person));setPhotoUrl(person.profile_photo_url||'');void load()},[person.id,person.updated_at]);

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
      onChanged();
    }catch(e:any){alert(e?.message||'No se pudo guardar la ficha.')}
    finally{setSaving(false)}
  };

  const useDocumentAsPhoto=async(doc:EntityDocument)=>{
    if(!String(doc.mime_type||'').startsWith('image/'))return alert('Para usarla como foto de perfil, el documento debe ser una imagen.');
    setPhotoLoading(true);
    try{
      const sb=assertSupabase();
      const signed=await sb.storage.from(doc.storage_bucket||BUCKET).createSignedUrl(doc.storage_path,60*60*24*30);
      if(signed.error)throw signed.error;
      await updateServicePerson(person.id,{
        profile_photo_url:signed.data.signedUrl,
        profile_photo_source_url:`supabase://${doc.storage_bucket||BUCKET}/${doc.storage_path}`,
        profile_photo_source_title:doc.title,
        profile_photo_updated_at:new Date().toISOString()
      });
      setPhotoUrl(signed.data.signedUrl);
      onChanged();
    }catch(e:any){alert(e?.message||'No se pudo usar el documento como foto.')}
    finally{setPhotoLoading(false)}
  };

  const initials=String(draft.full_name||person.full_name||'?').split(/\s+/).slice(0,2).map((x:string)=>x[0]||'').join('').toUpperCase();

  return <div className="provider-profile-backdrop" onMouseDown={onClose}>
    <section className="provider-profile" onMouseDown={e=>e.stopPropagation()}>
      <header className="provider-profile-top">
        <div className="provider-photo-wrap">
          {photoUrl?<img className="provider-photo" src={photoUrl} alt={draft.full_name||person.full_name}/>:<div className="provider-photo provider-photo-placeholder">{initials}</div>}
          <span className="provider-photo-badge"><Camera size={13}/>{photoUrl?'Foto documental':'Sin foto'}</span>
        </div>
        <div className="provider-profile-identity">
          <span className="eyebrow">FICHA DEL PRESTADOR</span>
          <h1>{draft.full_name||person.full_name}</h1>
          <div className="provider-role-line"><span>{draft.person_type||person.person_type}</span>{supplier&&<span>{supplier.name}</span>}{draft.sernatur_registration&&<span><BadgeCheck size={13}/> SERNATUR {draft.sernatur_registration}</span>}</div>
          <p>{sourceCount} fuente{sourceCount===1?'':'s'} Drive vinculada{sourceCount===1?'':'s'}{newestSource?` · última evidencia ${new Date(newestSource.observed_at).toLocaleDateString('es-CL')}`:''}</p>
        </div>
        <div className="provider-profile-actions">
          {onOpenFullRecord&&<button type="button" onClick={onOpenFullRecord}><FileText size={15}/> Ficha 360</button>}
          <button type="button" onClick={load}><RefreshCw size={15}/> Actualizar</button>
          <button className="provider-close" type="button" onClick={onClose}><X/></button>
        </div>
      </header>

      {loading?<div className="provider-loading">Cargando ficha…</div>:<div className="provider-profile-body">
        <section className="provider-profile-section">
          <SectionTitle icon={<UserRound/>} title="Identidad y contacto" subtitle="Datos básicos para reconocer y contactar al prestador."/>
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
          <SectionTitle icon={<ShieldCheck/>} title="Habilitaciones" subtitle="Credenciales y vigencias que necesitamos antes de asignarlo a una salida."/>
          <div className="provider-form-grid">
            <Field label="Registro SERNATUR"><input value={draft.sernatur_registration} onChange={e=>set('sernatur_registration',e.target.value)}/></Field>
            <Field label="PPAA vence"><input type="date" value={draft.first_aid_expiry} onChange={e=>set('first_aid_expiry',e.target.value)}/></Field>
            <Field label="Licencia conducir"><input value={draft.license_type} onChange={e=>set('license_type',e.target.value)}/></Field>
            <Field label="Licencia vence"><input type="date" value={draft.license_expiry} onChange={e=>set('license_expiry',e.target.value)}/></Field>
            <Field wide label="Certificaciones"><input value={draft.certificationsText} onChange={e=>set('certificationsText',e.target.value)} placeholder="Separadas por coma"/></Field>
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<BriefcaseBusiness/>} title="Cómo trabaja" subtitle="Información útil para elegirlo y coordinarlo."/>
          <div className="provider-form-grid">
            <Field label="Idiomas"><input value={draft.languagesText} onChange={e=>set('languagesText',e.target.value)}/></Field>
            <Field label="Especialidades"><input value={draft.specialtiesText} onChange={e=>set('specialtiesText',e.target.value)}/></Field>
            <Field label="Tarifa referencia"><input type="number" value={draft.default_rate} onChange={e=>set('default_rate',e.target.value)}/></Field>
            <Field label="Contacto emergencia"><input value={draft.emergency_contact} onChange={e=>set('emergency_contact',e.target.value)}/></Field>
            <Field wide label="Disponibilidad"><textarea value={draft.availability_notes} onChange={e=>set('availability_notes',e.target.value)}/></Field>
            <Field wide label="Notas operacionales"><textarea value={draft.notes} onChange={e=>set('notes',e.target.value)}/></Field>
          </div>
        </section>

        <section className="provider-profile-section">
          <SectionTitle icon={<Link2/>} title="Documentos y fuentes Drive" subtitle="Evidencia real que respalda y alimenta esta ficha."/>
          <div className="provider-drive-list">
            {sources.map(source=><article key={source.id}>
              <div className="provider-drive-icon"><Link2 size={16}/></div>
              <div><strong>{source.title}</strong><span>Google Drive · consultado {new Date(source.observed_at).toLocaleDateString('es-CL')}</span></div>
              <a href={source.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir</a>
            </article>)}
            {!sources.length&&<div className="provider-empty">Todavía no hay fuentes Drive vinculadas a esta persona.</div>}
          </div>

          <div className="provider-doc-list">
            {documents.map(doc=><article key={doc.id}>
              <div className="provider-drive-icon">{String(doc.mime_type||'').startsWith('image/')?<ImageIcon size={16}/>:<FileText size={16}/>}</div>
              <div><strong>{doc.title}</strong><span>{doc.document_type}{doc.expires_on?` · vence ${new Date(doc.expires_on+'T12:00:00').toLocaleDateString('es-CL')}`:''}</span></div>
              {String(doc.mime_type||'').startsWith('image/')&&<button type="button" disabled={photoLoading} onClick={()=>useDocumentAsPhoto(doc)}><Camera size={14}/> Usar como foto</button>}
              <button type="button" onClick={()=>openStoredDocument(doc)}><ExternalLink size={14}/> Abrir</button>
            </article>)}
            {!documents.length&&<div className="provider-empty">No hay documentos privados cargados en esta ficha todavía.</div>}
          </div>
          {!photoUrl&&<div className="provider-photo-note"><Camera size={15}/><span>La foto de perfil se tomará de una imagen documental real. No se genera una cara artificial.</span></div>}
        </section>

        <footer className="provider-profile-footer">
          <div><MapPin size={14}/><span>La ficha se actualiza sobre el mismo registro de Hotel Experience.</span></div>
          <button className="primary-button" type="button" disabled={saving} onClick={save}><Save size={15}/>{saving?'Guardando…':'Guardar cambios'}</button>
        </footer>
      </div>}
    </section>
  </div>;
}

async function openStoredDocument(doc:EntityDocument){
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
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){return <label className={wide?'provider-field wide':'provider-field'}><span>{label}</span>{children}</label>}
function SectionTitle({icon,title,subtitle}:{icon:React.ReactNode;title:string;subtitle:string}){return <header className="provider-section-title"><span>{icon}</span><div><h3>{title}</h3><p>{subtitle}</p></div></header>}
