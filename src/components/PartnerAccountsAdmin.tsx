import React,{useEffect,useState} from 'react';
import {Building2,CheckCircle2,Copy,KeyRound,Plus,RefreshCw,RotateCcw,ShieldCheck,UserRound} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import './PartnerPortal.css';

type Account={
  id:string;name:string;partner_type:'hotel'|'agency';scope_value:string;lead_prefix:string;
  access_code:string;active:boolean;can_create_requests:boolean;notes?:string|null;
  last_login_at?:string|null;created_at:string;
};
type Hotel={id:string;name:string;slug:string};
type Seller={id:string;full_name:string|null;email:string|null};

export default function PartnerAccountsAdmin(){
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [sellers,setSellers]=useState<Seller[]>([]);
  const [hotels,setHotels]=useState<Hotel[]>([]);
  const [assignments,setAssignments]=useState<Array<{seller_profile_id:string;hotel_partner_id:string}>>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [credential,setCredential]=useState<{code:string;password:string;name:string}|null>(null);
  const [form,setForm]=useState({name:'',scopeValue:'',leadPrefix:'',notes:''});

  const request=async(method:string,body?:any)=>{
    const {data:{session}}=await assertSupabase().auth.getSession();
    const r=await fetch('/api/partner-admin',{
      method,headers:{
        ...(body?{'Content-Type':'application/json'}:{}),
        Authorization:'Bearer '+(session?.access_token||'')
      },
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await r.json();
    if(!r.ok)throw new Error(data.error||'No se pudo administrar el portal.');
    return data;
  };

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const sb=assertSupabase();
      const [accountData,sellerResult,hotelResult,assignmentResult]=await Promise.all([
        request('GET'),
        sb.from('profiles').select('id,full_name,email').eq('role','agent').eq('is_active',true).order('full_name'),
        sb.from('hotel_partners').select('id,name,slug').eq('active',true).in('slug',['hotel-fauna','hotel-casa-solcor']).order('name'),
        sb.from('seller_partner_assignments').select('seller_profile_id,hotel_partner_id')
      ]);
      if(sellerResult.error)throw sellerResult.error;
      if(hotelResult.error)throw hotelResult.error;
      if(assignmentResult.error)throw assignmentResult.error;
      setAccounts(accountData.accounts||[]);
      setSellers(sellerResult.data||[]);
      setHotels(hotelResult.data||[]);
      setAssignments(assignmentResult.data||[]);
    }catch(e:any){setError(e.message||'No se pudo cargar la administración.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const create=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');
    if(!form.name.trim()||!form.scopeValue)return setError('Selecciona el hotel y confirma el nombre del acceso.');
    setBusy(true);
    try{
      const data=await request('POST',{action:'create',name:form.name,partnerType:'hotel',scopeValue:form.scopeValue,leadPrefix:form.leadPrefix,notes:form.notes});
      setCredential({code:data.account.access_code,password:data.temporary_password,name:data.account.name});
      setForm({name:'',scopeValue:'',leadPrefix:'',notes:''});
      await load();
    }catch(e:any){setError(e.message)}
    finally{setBusy(false)}
  };

  const chooseHotel=(hotel:Hotel)=>{
    const prefix=hotel.slug==='hotel-fauna'?'FAU':'SOL';
    setForm({name:hotel.name,scopeValue:hotel.name,leadPrefix:prefix,notes:''});
  };

  const resetPassword=async(account:Account)=>{
    if(!confirm('¿Generar una nueva contraseña para '+account.name+'? Las sesiones actuales se cerrarán.'))return;
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

  const toggleAssignment=async(sellerId:string,hotelId:string)=>{
    setBusy(true);setError('');
    try{
      const sb=assertSupabase();
      const exists=assignments.some(item=>item.seller_profile_id===sellerId&&item.hotel_partner_id===hotelId);
      if(exists){
        const {error}=await sb.from('seller_partner_assignments').delete().eq('seller_profile_id',sellerId).eq('hotel_partner_id',hotelId);
        if(error)throw error;
      }else{
        const {data:{user}}=await sb.auth.getUser();
        const {error}=await sb.from('seller_partner_assignments').insert({seller_profile_id:sellerId,hotel_partner_id:hotelId,created_by:user?.id||null});
        if(error)throw error;
      }
      const {data,error}=await sb.from('seller_partner_assignments').select('seller_profile_id,hotel_partner_id');
      if(error)throw error;
      setAssignments(data||[]);
    }catch(e:any){setError(e.message||'No se pudo actualizar la asignación.')}
    finally{setBusy(false)}
  };

  return <main className="partner-shell partner-admin-page">
    <header className="partner-admin-head">
      <div><span className="partner-eyebrow">HOTEL EXPERIENCE · ACCESOS</span><h1>Administración del portal</h1><p>Un espacio compartido, con permisos separados por hotel y vendedor.</p></div>
      <div><a href="/">Volver al CRM</a><a className="dark" href="/portal" target="_blank" rel="noreferrer">Abrir portal</a></div>
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
        <div className="partner-panel-head"><div><span className="partner-eyebrow">ACCESO DE RECEPCIÓN</span><h2>Crear acceso de hotel</h2></div><Plus size={18}/></div>
        <div className="partner-form-grid">
          <Field label="Hotel *"><select value={form.scopeValue} onChange={e=>{const target=hotels.find(h=>h.name===e.target.value);if(target)chooseHotel(target);else setForm(x=>({...x,scopeValue:''}))}}><option value="">Seleccionar hotel</option>{hotels.map(h=><option key={h.id} value={h.name}>{h.name}</option>)}</select></Field>
          <Field label="Nombre del acceso"><input value={form.name} readOnly placeholder="Selecciona un hotel"/></Field>
          <Field label="Prefijo CRM"><input value={form.leadPrefix} readOnly/></Field>
          <Field label="Notas internas" wide><textarea rows={4} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))} placeholder="Contacto o contexto interno."/></Field>
        </div>
        <div className="partner-admin-note"><KeyRound size={15}/><span>El sistema genera código y contraseña temporal. La contraseña se guarda como hash y solo se muestra una vez.</span></div>
        <button className="partner-primary" disabled={busy||!form.scopeValue}>{busy?'Creando…':'Crear acceso'}</button>
      </form>

      <section className="partner-panel">
        <div className="partner-panel-head"><div><span className="partner-eyebrow">DIRECTORIO</span><h2>Accesos de recepción</h2></div><button className="partner-refresh" onClick={load} disabled={busy}><RefreshCw size={14}/></button></div>
        {loading?<div className="partner-empty">Cargando accesos…</div>:<div className="partner-account-list">
          {accounts.filter(account=>account.partner_type==='hotel').map(account=><article key={account.id}>
            <div className="partner-account-icon"><Building2 size={17}/></div>
            <div className="partner-account-copy">
              <strong>{account.name}</strong>
              <span>{account.access_code} · prefijo {account.lead_prefix}</span>
              <small>{account.scope_value}{account.last_login_at?' · último acceso '+new Date(account.last_login_at).toLocaleString('es-CL'):' · nunca ha ingresado'}</small>
            </div>
            <span className={account.active?'partner-account-state active':'partner-account-state'}>{account.active?'Activo':'Desactivado'}</span>
            <button onClick={()=>resetPassword(account)} disabled={busy} title="Nueva contraseña"><RotateCcw size={14}/></button>
            <button onClick={()=>toggle(account)} disabled={busy}>{account.active?'Desactivar':'Activar'}</button>
          </article>)}
          {!accounts.some(account=>account.partner_type==='hotel')&&<div className="partner-empty">Todavía no existen accesos de recepción.</div>}
        </div>}
      </section>
    </section>

    <section className="partner-panel partner-seller-admin">
      <div className="partner-panel-head"><div><span className="partner-eyebrow">PERMISOS DE VENTA</span><h2>Vendedores y hoteles asignados</h2></div><UserRound size={18}/></div>
      <p className="partner-admin-note">Un vendedor solo puede consultar y crear solicitudes para los hoteles marcados. El selector del portal utiliza estas asignaciones.</p>
      {loading?<div className="partner-empty">Cargando vendedores…</div>:sellers.length?<div className="partner-seller-list">
        {sellers.map(seller=><article className="partner-seller-row" key={seller.id}>
          <div><strong>{seller.full_name||seller.email||'Vendedor'}</strong><small>{seller.email||'Perfil vendedor activo'}</small></div>
          {hotels.map(hotel=>{
            const checked=assignments.some(item=>item.seller_profile_id===seller.id&&item.hotel_partner_id===hotel.id);
            return <label key={hotel.id}><input type="checkbox" checked={checked} disabled={busy} onChange={()=>void toggleAssignment(seller.id,hotel.id)}/><span>{hotel.name}</span></label>;
          })}
        </article>)}
      </div>:<div className="partner-empty">Todavía no hay perfiles activos con rol vendedor. Primero crea o activa a Paolo en Equipo; luego podrás asignarle Hotel Fauna y Hotel Casa Solcor aquí.</div>}
    </section>
  </main>;
}

function Credential({label,value}:{label:string;value:string}){
  const copy=()=>navigator.clipboard?.writeText(value);
  return <div className="partner-credential-value"><small>{label}</small><strong>{value}</strong><button type="button" onClick={copy} title="Copiar"><Copy size={14}/></button></div>;
}
function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){
  return <label className={wide?'partner-field wide':'partner-field'}><span>{label}</span>{children}</label>;
}
