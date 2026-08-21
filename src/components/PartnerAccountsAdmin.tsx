import React,{useEffect,useState} from 'react';
import {Building2,CheckCircle2,Copy,KeyRound,Plus,RefreshCw,RotateCcw,ShieldCheck} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import './PartnerPortal.css';

type Account={
  id:string;name:string;partner_type:'hotel'|'agency';scope_value:string;lead_prefix:string;
  access_code:string;active:boolean;can_create_requests:boolean;notes?:string|null;
  last_login_at?:string|null;created_at:string;
};

export default function PartnerAccountsAdmin(){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [credential,setCredential]=useState<{code:string;password:string;name:string}|null>(null);
  const [form,setForm]=useState({name:'',partnerType:'hotel',scopeValue:'',leadPrefix:'',notes:''});

  const request=async(method:string,body?:any)=>{
    const {data:{session}}=await assertSupabase().auth.getSession();
    const r=await fetch('/api/partner-admin',{
      method,headers:{
        ...(body?{'Content-Type':'application/json'}:{}),
        Authorization:`Bearer ${session?.access_token||''}`
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'No se pudo administrar partners.');
    return data;
  };

  const load=async()=>{
    setLoading(true);setError('');
    try{const data=await request('GET');setAccounts(data.accounts||[])}
    catch(e:any){setError(e.message)}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');
    if(!form.name.trim())return setError('Ingresa el nombre del partner.');
    setBusy(true);
    try{
      const data=await request('POST',{action:'create',...form});
      setCredential({code:data.account.access_code,password:data.temporary_password,name:data.account.name});
      setForm({name:'',partnerType:'hotel',scopeValue:'',leadPrefix:'',notes:''});
      await load();
    }catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  };

  const resetPassword=async(account:Account)=>{
    if(!confirm(`¿Generar una nueva contraseña para ${account.name}? Las sesiones actuales se cerrarán.`))return;
    setBusy(true);
    try{
      const data=await request('POST',{action:'reset_password',id:account.id});
      setCredential({code:account.access_code,password:data.temporary_password,name:account.name});
    }catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  };

  const toggle=async(account:Account)=>{
    setBusy(true);
    try{await request('POST',{action:'toggle',id:account.id,active:!account.active});await load()}
    catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  };

  return <main className="partner-shell partner-admin-page">
    <header className="partner-admin-head">
      <div><span className="partner-eyebrow">HOTEL EXPERIENCE · B2B</span><h1>Accesos de hoteles y agencias</h1><p>Administra quién puede registrar y consultar reservas desde el portal externo.</p></div>
      <div><a href="/">Volver al CRM</a><a className="dark" href="/b2b" target="_blank" rel="noreferrer">Abrir portal B2B</a></div>
    </header>

    {credential&&<section className="partner-credential">
      <div><ShieldCheck size={18}/><span><small>CREDENCIALES NUEVAS · MOSTRAR UNA VEZ</small><strong>{credential.name}</strong></span></div>
      <Credential label="Código" value={credential.code}/>
      <Credential label="Contraseña temporal" value={credential.password}/>
      <button onClick={()=>setCredential(null)}>Listo</button>
    </section>}

    {error&&<div className="partner-error partner-page-error">{error}</div>}

    <section className="partner-admin-grid">
      <form className="partner-panel partner-create-account" onSubmit={create}>
        <div className="partner-panel-head"><div><span className="partner-eyebrow">NUEVO PARTNER</span><h2>Crear acceso B2B</h2></div><Plus size={18}/></div>
        <div className="partner-form-grid">
          <Field label="Nombre *"><input value={form.name} onChange={e=>setForm(x=>({...x,name:e.target.value,scopeValue:x.scopeValue||e.target.value}))} placeholder="Hotel Fauna / Agencia X"/></Field>
          <Field label="Tipo"><select value={form.partnerType} onChange={e=>setForm(x=>({...x,partnerType:e.target.value}))}><option value="hotel">Hotel</option><option value="agency">Agencia</option></select></Field>
          <Field label="Alcance / hotel asociado"><input value={form.scopeValue} onChange={e=>setForm(x=>({...x,scopeValue:e.target.value}))} placeholder="Nombre que identifica sus leads"/></Field>
          <Field label="Prefijo CRM"><input value={form.leadPrefix} onChange={e=>setForm(x=>({...x,leadPrefix:e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,6)}))} placeholder="FAU / HAB / AGY"/></Field>
          <Field label="Notas" wide><textarea rows={4} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))} placeholder="Contacto, convenio o contexto interno."/></Field>
        </div>
        <div className="partner-admin-note"><KeyRound size={15}/><span>El sistema genera código y contraseña temporal. La contraseña se guarda cifrada como hash y no puede recuperarse después.</span></div>
        <button className="partner-primary" disabled={busy}>{busy?'Creando…':'Crear acceso'}</button>
      </form>

      <section className="partner-panel">
        <div className="partner-panel-head"><div><span className="partner-eyebrow">DIRECTORIO</span><h2>Partners habilitados</h2></div><button className="partner-refresh" onClick={load}><RefreshCw size={14}/></button></div>
        {loading?<div className="partner-empty">Cargando accesos…</div>:<div className="partner-account-list">
          {accounts.map(account=><article key={account.id}>
            <div className="partner-account-icon"><Building2 size={17}/></div>
            <div className="partner-account-copy">
              <strong>{account.name}</strong>
              <span>{account.access_code} · {account.partner_type==='hotel'?'Hotel':'Agencia'} · prefijo {account.lead_prefix}</span>
              <small>{account.scope_value}{account.last_login_at?` · último acceso ${new Date(account.last_login_at).toLocaleString('es-CL')}`:' · nunca ha ingresado'}</small>
            </div>
            <span className={account.active?'partner-account-state active':'partner-account-state'}>{account.active?'Activo':'Desactivado'}</span>
            <button onClick={()=>resetPassword(account)} disabled={busy} title="Nueva contraseña"><RotateCcw size={14}/></button>
            <button onClick={()=>toggle(account)} disabled={busy}>{account.active?'Desactivar':'Activar'}</button>
          </article>)}
          {!accounts.length&&<div className="partner-empty">Todavía no existen cuentas B2B.</div>}
        </div>}
      </section>
    </section>
  </main>;
}

function Credential({label,value}:{label:string;value:string}){
  const copy=()=>navigator.clipboard?.writeText(value);
  return <div className="partner-credential-value"><small>{label}</small><strong>{value}</strong><button onClick={copy} title="Copiar"><Copy size={14}/></button></div>;
}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){
  return <label className={wide?'partner-field wide':'partner-field'}><span>{label}</span>{children}</label>;
}
