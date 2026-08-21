import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertCircle,Check,ChevronRight,Cloud,Code2,Database,ExternalLink,Mail,Plus,RefreshCw,
  Settings2,ShieldCheck,Plug,CalendarDays,FolderOpen,X
} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import './AddonsWorkspace.css';

type Addon={
  id:string;addon_key:string;name:string;description:string|null;category:string|null;provider:string|null;
  source:string|null;auth_type:string|null;server_url:string|null;capabilities:string[]|null;modules:string[]|null;
  enabled:boolean;status:string;config:any;notes:string|null;last_checked_at:string|null;last_error:string|null;
};

const templates=[
  {name:'Gmail',icon:Mail},
  {name:'Google Calendar',icon:CalendarDays},
  {name:'Google Drive',icon:FolderOpen},
  {name:'Resend',icon:Mail},
  {name:'GitHub',icon:Code2},
  {name:'Vercel',icon:Cloud},
  {name:'Attio',icon:Database}
];

export default function AddonsWorkspace({role,onClose}:{role:string;onClose:()=>void}){
  const [addons,setAddons]=useState<Addon[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<Addon|null>(null);
  const [customOpen,setCustomOpen]=useState(false);
  const canEdit=['admin','manager'].includes(role);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const {data,error}=await assertSupabase().from('app_addons').select('*').order('category').order('name');
      if(error)throw error;
      setAddons((data||[]) as Addon[]);
      if(selected){
        const next=(data||[]).find((x:any)=>x.id===selected.id);
        if(next)setSelected(next as Addon);
      }
    }catch(e:any){setError(e.message||'No se pudieron cargar los complementos.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const connected=addons.filter(x=>x.status==='connected').length;
  const enabled=addons.filter(x=>x.enabled).length;
  const pending=addons.filter(x=>x.status!=='connected').length;
  const categories=useMemo(()=>Array.from(new Set(addons.map(x=>x.category||'Otros'))),[addons]);

  const toggle=async(addon:Addon)=>{
    if(!canEdit)return;
    const next=!addon.enabled;
    const patch:any={
      enabled:next,
      status:next?(addon.status==='connected'?'connected':'configuration_required'):'available',
      updated_at:new Date().toISOString()
    };
    const {error}=await assertSupabase().from('app_addons').update(patch).eq('id',addon.id);
    if(error)return alert(error.message);
    await load();
  };

  return <div className="addons-page-overlay">
    <header className="addons-topbar">
      <div><span className="eyebrow">SISTEMA · CAPACIDADES</span><h1>Complementos</h1><p>Conecta capacidades nuevas sin convertir el CRM en una colección de claves y accesos inseguros.</p></div>
      <div className="addons-top-actions">
        <button onClick={load}><RefreshCw size={16}/> Actualizar</button>
        <button className="addons-close" onClick={onClose}><X size={20}/></button>
      </div>
    </header>

    {error&&<div className="addons-error"><AlertCircle size={16}/>{error}</div>}

    <section className="addons-kpis">
      <Kpi label="Registrados" value={addons.length}/>
      <Kpi label="Habilitados" value={enabled}/>
      <Kpi label="Conectados" value={connected}/>
      <Kpi label="Por configurar" value={pending}/>
    </section>

    <section className="addons-intro">
      <div>
        <span className="eyebrow">CENTRO DE CAPACIDADES</span>
        <h2>La app puede crecer por módulos.</h2>
        <p>Los complementos declaran qué hacen, qué áreas pueden usar y cómo se autentican. Las credenciales reales deben permanecer en backend/Vercel, nunca en el navegador.</p>
      </div>
      {canEdit&&<button className="primary-button" onClick={()=>setCustomOpen(true)}><Plus size={16}/> Nuevo complemento</button>}
    </section>

    {loading?<div className="addons-loading">Cargando complementos...</div>:categories.map(category=><section className="addons-category" key={category}>
      <header><h3>{category}</h3><span>{addons.filter(x=>(x.category||'Otros')===category).length}</span></header>
      <div className="addons-grid">
        {addons.filter(x=>(x.category||'Otros')===category).map(addon=><AddonCard key={addon.id} addon={addon} onOpen={()=>setSelected(addon)} onToggle={()=>toggle(addon)} canEdit={canEdit}/>)}
      </div>
    </section>)}

    {selected&&<AddonDetail addon={selected} canEdit={canEdit} onClose={()=>setSelected(null)} onSaved={load}/>}
    {customOpen&&<CustomAddonModal onClose={()=>setCustomOpen(false)} onSaved={async()=>{setCustomOpen(false);await load()}}/>}
  </div>;
}

function AddonCard({addon,onOpen,onToggle,canEdit}:{addon:Addon;onOpen:()=>void;onToggle:()=>void;canEdit:boolean}){
  const Icon=iconFor(addon.name);
  return <article className={addon.enabled?'addon-card enabled':'addon-card'}>
    <div className="addon-card-head"><span className="addon-logo"><Icon size={19}/></span><Status status={addon.status}/></div>
    <h4>{addon.name}</h4>
    <p>{addon.description||fallbackDescription(addon.name)}</p>
    <div className="addon-tags">{(addon.modules||[]).slice(0,4).map(x=><span key={x}>{x}</span>)}</div>
    <div className="addon-capabilities">{(addon.capabilities||[]).slice(0,3).map(x=><small key={x}><Check size={11}/>{x}</small>)}</div>
    <footer>
      <button className="addon-details" onClick={onOpen}>Detalles <ChevronRight size={14}/></button>
      {canEdit&&<button className={addon.enabled?'addon-toggle on':'addon-toggle'} onClick={onToggle}>{addon.enabled?'Habilitado':'Habilitar'}</button>}
    </footer>
  </article>;
}

function AddonDetail({addon,canEdit,onClose,onSaved}:{addon:Addon;canEdit:boolean;onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState({
    description:addon.description||'',server_url:addon.server_url||'',notes:addon.notes||'',
    auth_type:addon.auth_type||'server',modules:(addon.modules||[]).join(', '),capabilities:(addon.capabilities||[]).join(', ')
  });
  const save=async()=>{
    const patch={
      description:form.description||null,server_url:form.server_url||null,notes:form.notes||null,auth_type:form.auth_type,
      modules:split(form.modules),capabilities:split(form.capabilities),updated_at:new Date().toISOString()
    };
    const {error}=await assertSupabase().from('app_addons').update(patch).eq('id',addon.id);
    if(error)return alert(error.message);
    await onSaved();onClose();
  };
  return <div className="addon-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="addon-modal">
      <header><div><span className="eyebrow">COMPLEMENTO</span><h2>{addon.name}</h2><p>{addon.provider||addon.category}</p></div><button onClick={onClose}><X size={20}/></button></header>
      <div className="addon-security-note"><ShieldCheck size={18}/><div><strong>Configuración segura</strong><p>No pegues API keys, access tokens ni secretos aquí. Usa variables de entorno/OAuth del backend.</p></div></div>
      <div className="addon-form-grid">
        <Field label="Descripción" wide><textarea disabled={!canEdit} value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
        <Field label="Autenticación"><select disabled={!canEdit} value={form.auth_type} onChange={e=>setForm({...form,auth_type:e.target.value})}><option value="oauth">OAuth</option><option value="api_key">API key en backend</option><option value="server">Servidor / conexión administrada</option><option value="none">Sin autenticación</option></select></Field>
        <Field label="URL pública / servidor"><input disabled={!canEdit} value={form.server_url} onChange={e=>setForm({...form,server_url:e.target.value})} placeholder="https://..."/></Field>
        <Field label="Módulos" wide><input disabled={!canEdit} value={form.modules} onChange={e=>setForm({...form,modules:e.target.value})}/></Field>
        <Field label="Capacidades" wide><input disabled={!canEdit} value={form.capabilities} onChange={e=>setForm({...form,capabilities:e.target.value})}/></Field>
        <Field label="Notas" wide><textarea disabled={!canEdit} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></Field>
      </div>
      <div className="addon-detail-state"><Settings2 size={16}/><span><small>Estado</small><strong>{statusLabel(addon.status)}</strong></span><span><small>Origen</small><strong>{addon.source||'Sistema'}</strong></span></div>
      {canEdit&&<footer><button className="primary-button" onClick={save}>Guardar configuración</button></footer>}
    </section>
  </div>;
}

function CustomAddonModal({onClose,onSaved}:{onClose:()=>void;onSaved:()=>void}){
  const [form,setForm]=useState({name:'',description:'',category:'Personalizado',server_url:'',auth_type:'server',modules:'Sistema',capabilities:'Endpoint personalizado'});
  const save=async()=>{
    if(!form.name.trim())return alert('Escribe un nombre.');
    const key=`custom_${slug(form.name)}_${Date.now().toString(36)}`;
    const {error}=await assertSupabase().from('app_addons').insert({
      addon_key:key,name:form.name.trim(),description:form.description||null,category:form.category||'Personalizado',
      provider:'Custom',source:'custom',auth_type:form.auth_type,server_url:form.server_url||null,
      capabilities:split(form.capabilities),modules:split(form.modules),enabled:false,status:'available',config:{}
    });
    if(error)return alert(error.message);
    await onSaved();
  };
  return <div className="addon-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
    <section className="addon-modal small">
      <header><div><span className="eyebrow">NUEVO COMPLEMENTO</span><h2>Agregar capacidad</h2></div><button onClick={onClose}><X size={20}/></button></header>
      <div className="addon-form-grid">
        <Field label="Nombre"><input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej. MCP Reservas"/></Field>
        <Field label="Categoría"><input value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></Field>
        <Field label="Descripción" wide><textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></Field>
        <Field label="URL / servidor" wide><input value={form.server_url} onChange={e=>setForm({...form,server_url:e.target.value})} placeholder="https://..."/></Field>
        <Field label="Autenticación"><select value={form.auth_type} onChange={e=>setForm({...form,auth_type:e.target.value})}><option value="oauth">OAuth</option><option value="api_key">API key en backend</option><option value="server">Servidor</option><option value="none">Sin autenticación</option></select></Field>
        <Field label="Módulos"><input value={form.modules} onChange={e=>setForm({...form,modules:e.target.value})}/></Field>
        <Field label="Capacidades" wide><input value={form.capabilities} onChange={e=>setForm({...form,capabilities:e.target.value})}/></Field>
      </div>
      <div className="addon-security-note"><ShieldCheck size={18}/><div><strong>Sin secretos en esta pantalla</strong><p>Las credenciales se configurarán después en el backend.</p></div></div>
      <footer><button className="primary-button" onClick={save}><Plus size={15}/> Crear complemento</button></footer>
    </section>
  </div>;
}

function Kpi({label,value}:{label:string;value:number}){return <div className="addon-kpi"><small>{label}</small><strong>{value}</strong></div>}
function Status({status}:{status:string}){return <span className={`addon-status ${status}`}>{statusLabel(status)}</span>}
function Field({label,wide,children}:{label:string;wide?:boolean;children:React.ReactNode}){return <label className={wide?'addon-field wide':'addon-field'}><span>{label}</span>{children}</label>}
function split(v:string){return v.split(',').map(x=>x.trim()).filter(Boolean)}
function slug(v:string){return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,40)||'addon'}
function iconFor(name:string){return templates.find(x=>x.name===name)?.icon||Plug}
function statusLabel(status:string){if(status==='connected')return 'Conectado';if(status==='configuration_required')return 'Configurar';if(status==='error')return 'Error';return 'Disponible'}
function fallbackDescription(name:string){
  const map:any={
    Gmail:'Envía correos desde cuentas de usuario con autorización OAuth.',
    'Google Calendar':'Sincroniza agenda, disponibilidad y eventos operacionales.',
    'Google Drive':'Respalda documentos y carpetas del negocio.',
    Resend:'Correo transaccional y automatizaciones del sistema.',
    GitHub:'Versiones, commits y estado del código.',
    Vercel:'Deployments, builds y runtime de producción.',
    Attio:'Sincronización de contactos, empresas y oportunidades.'
  };
  return map[name]||'Capacidad adicional para Hotel Experience.';
}
