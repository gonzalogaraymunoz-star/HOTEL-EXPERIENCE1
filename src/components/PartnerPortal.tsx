import React,{useEffect,useMemo,useState} from 'react';
import {
  ArrowRight,Building2,CheckCircle2,ClipboardList,Hotel,KeyRound,
  LogOut,Plus,RefreshCw,ShieldCheck,Trash2,Users
} from 'lucide-react';
import './PartnerPortal.css';

type Account={
  id:string;name:string;partner_type:'hotel'|'agency';scope_value:string;
  lead_prefix:string;access_code:string;can_create_requests:boolean;
};
type Product={producto:string;fechaServicio:string;pax:number;observacion:string};
type PartnerLead={
  id:string;codigo:string;reserva:string;numero_pax:number;contacto:string;
  empresa_ejecuta:string;estado:string;estado_raw:string;created_at:string;
  services:Array<{id:string;producto:string;fecha_servicio?:string|null;numero_pax:number;estado_pago:string;estado_operacion:string}>;
};
type Data={
  account:Account;
  summary:{total:number;confirmed:number;pending:number;quoted:number};
  leads:PartnerLead[];
  catalog:Array<{name:string;category:string}>;
};

export default function PartnerPortal(){
  const [account,setAccount]=useState<Account|null>(null);
  const [data,setData]=useState<Data|null>(null);
  const [checking,setChecking]=useState(true);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [accessCode,setAccessCode]=useState('');
  const [password,setPassword]=useState('');
  const [tab,setTab]=useState<'reservations'|'new'>('reservations');

  const loadData=async()=>{
    setLoading(true);setError('');
    try{
      const r=await fetch('/api/partner-data');
      const body=await r.json();
      if(!r.ok)throw new Error(body.error||'No se pudo cargar el portal.');
      setData(body);setAccount(body.account);
    }catch(e:any){
      setError(e.message||'No se pudo cargar el portal.');
      if(String(e.message||'').toLowerCase().includes('sesión')){setAccount(null);setData(null)}
    }finally{setLoading(false)}
  };

  useEffect(()=>{
    const previousTitle=document.title;
    document.title='Portal B2B · Hotel Experience';
    let robots=document.querySelector('meta[name="robots"]') as HTMLMetaElement|null;
    const created=!robots;
    if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.appendChild(robots)}
    const previous=robots.content;
    robots.content='noindex,nofollow,noarchive,nosnippet';

    void (async()=>{
      try{
        const r=await fetch('/api/partner-data?area=auth');
        const body=await r.json();
        if(r.ok&&body.authenticated){setAccount(body.account);await loadData()}
      }finally{setChecking(false)}
    })();

    return()=>{
      document.title=previousTitle;
      if(created)robots?.remove();else if(robots)robots.content=previous;
    };
  },[]);

  const login=async(e:React.FormEvent)=>{
    e.preventDefault();setLoading(true);setError('');
    try{
      const r=await fetch('/api/partner-data?area=auth',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'login',accessCode,password})
      });
      const body=await r.json();
      if(!r.ok)throw new Error(body.error||'No se pudo ingresar.');
      setAccount(body.account);setPassword('');await loadData();
    }catch(e:any){setError(e.message||'No se pudo ingresar.')}
    finally{setLoading(false)}
  };

  const logout=async()=>{
    await fetch('/api/partner-data?area=auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})});
    setAccount(null);setData(null);setPassword('');setTab('reservations');
  };

  if(checking)return <main className="partner-shell"><div className="partner-loading">Preparando portal B2B…</div></main>;

  if(!account)return <main className="partner-shell partner-login-page">
    <section className="partner-login">
      <div className="partner-login-copy">
        <span className="partner-eyebrow">HOTEL EXPERIENCE · BY LINK</span>
        <h1>Portal para hoteles y agencias.</h1>
        <p>Registra solicitudes de pasajeros y revisa el avance de las reservas asociadas a tu organización sin entrar al CRM interno.</p>
        <div className="partner-security"><ShieldCheck size={18}/><span>Sin acceso a costos, márgenes, proveedores, documentos personales ni notas internas.</span></div>
      </div>

      <form className="partner-login-card" onSubmit={login}>
        <div className="partner-login-icon"><KeyRound size={20}/></div>
        <span className="partner-eyebrow">ACCESO B2B</span>
        <h2>Ingresa a tu cuenta</h2>
        <label><span>Código partner</span><input value={accessCode} onChange={e=>setAccessCode(e.target.value.toUpperCase())} placeholder="HTL-FAUNA-XXXX" autoComplete="username"/></label>
        <label><span>Contraseña</span><input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Contraseña asignada" autoComplete="current-password"/></label>
        {error&&<div className="partner-error">{error}</div>}
        <button disabled={loading||!accessCode.trim()||!password}>{loading?'Validando…':<>Ingresar <ArrowRight size={16}/></>}</button>
        <small>El acceso es personal para la organización. No compartas las credenciales fuera del equipo autorizado.</small>
      </form>
    </section>
  </main>;

  return <main className="partner-shell partner-dashboard">
    <header className="partner-topbar">
      <div><span className="partner-eyebrow">HOTEL EXPERIENCE · PORTAL B2B</span><h1>{account.name}</h1><p>{account.partner_type==='hotel'?'Hotel / alojamiento':'Agencia'} · {account.access_code}</p></div>
      <div className="partner-top-actions">
        <button onClick={loadData}><RefreshCw size={15}/> Actualizar</button>
        <button onClick={logout}><LogOut size={15}/> Salir</button>
      </div>
    </header>

    <section className="partner-tabs">
      <button className={tab==='reservations'?'active':''} onClick={()=>setTab('reservations')}><ClipboardList size={15}/> Reservas</button>
      {account.can_create_requests&&<button className={tab==='new'?'active':''} onClick={()=>setTab('new')}><Plus size={15}/> Nueva solicitud</button>}
    </section>

    {error&&<div className="partner-error partner-page-error">{error}</div>}

    {tab==='reservations'&&data&&<Reservations data={data}/>}
    {tab==='new'&&data&&account.can_create_requests&&<NewRequest data={data} onCreated={async()=>{setTab('reservations');await loadData()}}/>}
  </main>;
}

function Reservations({data}:{data:Data}){
  return <div className="partner-content">
    <section className="partner-kpis">
      <Kpi label="Reservas visibles" value={data.summary.total}/>
      <Kpi label="Confirmadas" value={data.summary.confirmed}/>
      <Kpi label="En revisión" value={data.summary.pending}/>
      <Kpi label="Cotizadas" value={data.summary.quoted}/>
    </section>

    <section className="partner-panel">
      <div className="partner-panel-head"><div><span className="partner-eyebrow">SEGUIMIENTO</span><h2>Reservas de tu organización</h2></div><small>{data.leads.length} registro(s)</small></div>
      <div className="partner-reservations">
        {data.leads.map(lead=><article key={lead.id} className="partner-reservation">
          <div className="partner-reservation-head">
            <div><span>{lead.codigo}</span><h3>{lead.reserva}</h3><p>{lead.empresa_ejecuta||'Alojamiento por confirmar'} · {lead.numero_pax} pax</p></div>
            <strong className={`partner-stage ${stageClass(lead.estado_raw)}`}>{lead.estado}</strong>
          </div>
          <div className="partner-service-list">
            {lead.services.map(service=><div key={service.id}>
              <span><b>{service.producto}</b><small>{dateFmt(service.fecha_servicio)} · {service.numero_pax} pax</small></span>
              <span><em>{operationLabel(service.estado_operacion)}</em><small>{paymentLabel(service.estado_pago)}</small></span>
            </div>)}
            {!lead.services.length&&<p className="partner-muted">Aún no hay experiencias asociadas.</p>}
          </div>
        </article>)}
        {!data.leads.length&&<div className="partner-empty">Todavía no hay reservas asociadas a esta cuenta.</div>}
      </div>
    </section>
  </div>;
}

function NewRequest({data,onCreated}:{data:Data;onCreated:()=>Promise<void>}){
  const account=data.account;
  const [form,setForm]=useState({
    passengerName:'',email:'',phone:'',hotel:account.partner_type==='hotel'?account.scope_value:'',notes:''
  });
  const [products,setProducts]=useState<Product[]>([{producto:'',fechaServicio:'',pax:1,observacion:''}]);
  const [sending,setSending]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');

  const groups=useMemo(()=>{
    const map=new Map<string,string[]>();
    for(const item of data.catalog){
      const list=map.get(item.category||'Otros')||[];
      if(item.name&&!list.includes(item.name))list.push(item.name);
      map.set(item.category||'Otros',list);
    }
    return [...map.entries()].map(([category,items])=>({category,items:items.sort((a,b)=>a.localeCompare(b,'es'))}));
  },[data.catalog]);

  const setProduct=(i:number,key:keyof Product,value:any)=>setProducts(prev=>prev.map((p,idx)=>idx===i?{...p,[key]:value}:p));
  const addProduct=()=>setProducts(prev=>[...prev,{producto:'',fechaServicio:'',pax:1,observacion:''}]);
  const removeProduct=(i:number)=>setProducts(prev=>prev.filter((_,idx)=>idx!==i));

  const submit=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');setSuccess('');
    const clean=products.filter(p=>p.producto);
    if(!form.passengerName||(!form.email&&!form.phone)||!form.hotel||!clean.length){
      return setError('Completa pasajero, contacto, alojamiento y al menos una experiencia.');
    }
    setSending(true);
    try{
      const r=await fetch('/api/partner-data',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...form,products:clean})
      });
      const body=await r.json();
      if(!r.ok)throw new Error(body.error||'No se pudo enviar la solicitud.');
      setSuccess(`Solicitud ${body.codigo} recibida.`);
      setTimeout(()=>void onCreated(),900);
    }catch(e:any){setError(e.message||'No se pudo enviar la solicitud.')}
    finally{setSending(false)}
  };

  return <div className="partner-content">
    <section className="partner-panel">
      <div className="partner-panel-head"><div><span className="partner-eyebrow">NUEVA SOLICITUD</span><h2>Registrar pasajero y experiencias</h2></div></div>
      <form className="partner-request-form" onSubmit={submit}>
        <div className="partner-form-grid">
          <Field label="Pasajero *"><input value={form.passengerName} onChange={e=>setForm(x=>({...x,passengerName:e.target.value}))} placeholder="Nombre completo"/></Field>
          <Field label="Correo"><input type="email" value={form.email} onChange={e=>setForm(x=>({...x,email:e.target.value}))} placeholder="correo@ejemplo.com"/></Field>
          <Field label="Teléfono / WhatsApp"><input value={form.phone} onChange={e=>setForm(x=>({...x,phone:e.target.value}))} placeholder="+56 / +55 ..."/></Field>
          <Field label="Hotel / alojamiento *"><input value={form.hotel} readOnly={account.partner_type==='hotel'} onChange={e=>setForm(x=>({...x,hotel:e.target.value}))} placeholder="Alojamiento del pasajero"/></Field>
        </div>

        <div className="partner-products-head"><div><span className="partner-eyebrow">EXPERIENCIAS</span><h3>Productos solicitados</h3></div><button type="button" onClick={addProduct}><Plus size={14}/> Agregar</button></div>

        <div className="partner-products">
          {products.map((p,i)=><article key={i}>
            <div className="partner-product-number">{String(i+1).padStart(2,'0')}</div>
            <div className="partner-form-grid">
              <Field label="Experiencia *"><select value={p.producto} onChange={e=>setProduct(i,'producto',e.target.value)}><option value="">Seleccionar</option>{groups.map(g=><optgroup key={g.category} label={g.category}>{g.items.map(x=><option key={`${g.category}-${x}`} value={x}>{x}</option>)}</optgroup>)}</select></Field>
              <Field label="Fecha preferida"><input type="date" value={p.fechaServicio} onChange={e=>setProduct(i,'fechaServicio',e.target.value)}/></Field>
              <Field label="Pax"><input type="number" min={1} max={99} value={p.pax} onChange={e=>setProduct(i,'pax',Number(e.target.value||1))}/></Field>
              <Field label="Observación"><input value={p.observacion} onChange={e=>setProduct(i,'observacion',e.target.value)} placeholder="Privado, horario, preferencia…"/></Field>
            </div>
            {products.length>1&&<button type="button" className="partner-remove-product" onClick={()=>removeProduct(i)}><Trash2 size={14}/> Quitar</button>}
          </article>)}
        </div>

        <Field label="Nota para Hotel Experience" wide><textarea rows={4} value={form.notes} onChange={e=>setForm(x=>({...x,notes:e.target.value}))} placeholder="Contexto comercial u operacional relevante para revisar la solicitud."/></Field>

        {error&&<div className="partner-error">{error}</div>}
        {success&&<div className="partner-success"><CheckCircle2 size={16}/>{success}</div>}

        <div className="partner-submit-row"><button disabled={sending}>{sending?'Enviando…':'Enviar solicitud'} <ArrowRight size={15}/></button></div>
      </form>
    </section>
  </div>;
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}){
  return <label className={wide?'partner-field wide':'partner-field'}><span>{label}</span>{children}</label>;
}
function Kpi({label,value}:{label:string;value:number}){
  return <div><small>{label}</small><strong>{value}</strong></div>;
}
function dateFmt(value?:string|null){
  return value?new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'}):'Fecha por definir';
}
function operationLabel(value:string){
  if(value==='Coordinado')return 'Coordinado';
  if(value==='En curso')return 'En curso';
  if(value==='Completado')return 'Realizado';
  if(value==='Cancelado')return 'Cancelado';
  return 'Pendiente';
}
function paymentLabel(value:string){
  if(value==='Pagado')return 'Pago confirmado';
  if(value==='Parcial')return 'Pago parcial';
  if(value==='Reembolsado')return 'Reembolsado';
  return 'Pago pendiente';
}
function stageClass(value:string){
  return value==='confirmado'?'confirmed':value==='cotizado'?'quoted':value==='perdido'?'closed':'pending';
}
