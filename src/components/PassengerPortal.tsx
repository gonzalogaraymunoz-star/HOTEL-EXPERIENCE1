import React,{useEffect,useMemo,useState} from 'react';
import {
  CalendarDays,CheckCircle2,Clock3,FileText,Hotel,LockKeyhole,MapPin,
  ShieldCheck,TicketCheck,Users
} from 'lucide-react';
import './PassengerPortal.css';

type PortalService={
  id:string;
  producto:string;
  fecha_servicio?:string|null;
  numero_pax:number;
  estado_operacion:string;
  estado_pago:string;
  pickup_time?:string|null;
  meeting_point?:string|null;
};
type PortalDocument={
  id:string;
  document_type:'voucher'|'itinerary';
  title:string;
  url:string;
};
type PortalData={
  reservation:{
    codigo:string;
    reserva:string;
    numero_pax:number;
    empresa_ejecuta?:string|null;
    checkin?:string|null;
    checkout?:string|null;
  };
  services:PortalService[];
  documents:PortalDocument[];
  verified_at:string;
};

export default function PassengerPortal(){
  const pathCode=decodeURIComponent(
    window.location.pathname.replace(/^\/viaje\/?/,'').split('/')[0]||''
  ).trim().toUpperCase();

  const [code,setCode]=useState(pathCode);
  const [contact,setContact]=useState('');
  const [data,setData]=useState<PortalData|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    const previousTitle=document.title;
    document.title='Tu viaje · Hotel Experience';

    let robots=document.querySelector('meta[name="robots"]') as HTMLMetaElement|null;
    const created=!robots;
    if(!robots){
      robots=document.createElement('meta');
      robots.name='robots';
      document.head.appendChild(robots);
    }
    const previous=robots.content;
    robots.content='noindex,nofollow,noarchive,nosnippet';

    return ()=>{
      document.title=previousTitle;
      if(created)robots?.remove();
      else if(robots)robots.content=previous;
    };
  },[]);

  const login=async(e?:React.FormEvent)=>{
    e?.preventDefault();
    if(!code.trim()||!contact.trim())return;
    setLoading(true);setError('');
    try{
      const r=await fetch('/api/passenger-portal',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          code:code.trim().toUpperCase(),
          contact:contact.trim()
        })
      });
      const body=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(body?.error||'No pudimos validar la reserva.');
      setData(body);
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e:any){
      setError(e?.message||'No pudimos validar la reserva.');
      setData(null);
    }finally{
      setLoading(false);
    }
  };

  const upcoming=useMemo(()=>{
    if(!data)return [];
    const today=localIso(new Date());
    return data.services
      .filter(s=>s.estado_operacion!=='Cancelado'&&(!s.fecha_servicio||s.fecha_servicio>=today))
      .sort((a,b)=>String(a.fecha_servicio||'9999-12-31').localeCompare(String(b.fecha_servicio||'9999-12-31')));
  },[data]);

  if(!data){
    return <main className="passenger-portal">
      <section className="portal-login-shell">
        <div className="portal-brand">
          <span>HOTEL EXPERIENCE · BY LINK</span>
          <strong>Tu viaje en San Pedro de Atacama</strong>
          <p>Consulta tus experiencias, horarios de encuentro y documentos confirmados desde un solo lugar.</p>
        </div>

        <form className="portal-access-card" onSubmit={login}>
          <div className="portal-lock"><LockKeyhole size={20}/></div>
          <span className="portal-eyebrow">ACCESO PRIVADO</span>
          <h1>Revisa tu reserva</h1>
          <p>Para proteger tus datos, confirma el código de reserva y el correo o teléfono registrado.</p>

          <label>
            <span>Código de reserva</span>
            <input
              value={code}
              onChange={e=>setCode(e.target.value.toUpperCase())}
              placeholder="Ej. LAM-2608-001"
              autoComplete="off"
            />
          </label>

          <label>
            <span>Correo o teléfono</span>
            <input
              value={contact}
              onChange={e=>setContact(e.target.value)}
              placeholder="El mismo usado en la reserva"
              autoComplete="email"
            />
          </label>

          {error&&<div className="portal-error">{error}</div>}

          <button disabled={loading||!code.trim()||!contact.trim()}>
            {loading?'Validando…':'Ver mi viaje'}
          </button>

          <small>
            Este acceso no muestra documentos personales, pasaportes, notas médicas, proveedores ni información interna.
          </small>
        </form>
      </section>
    </main>;
  }

  const next=upcoming[0]||null;

  return <main className="passenger-portal portal-trip">
    <header className="portal-trip-head">
      <div>
        <span className="portal-eyebrow">HOTEL EXPERIENCE · BY LINK</span>
        <h1>Hola, {firstName(data.reservation.reserva)}</h1>
        <p>{data.reservation.codigo} · {data.reservation.numero_pax} pasajero(s)</p>
      </div>
      <button className="portal-exit" onClick={()=>{setData(null);setContact('')}}>Cerrar acceso</button>
    </header>

    <section className="portal-security-note">
      <ShieldCheck size={17}/>
      <span>Estás viendo una versión segura y limitada de tu reserva. La información operacional puede actualizarse hasta antes de cada salida.</span>
    </section>

    <section className="portal-summary-grid">
      <Summary icon={<Hotel/>} label="Alojamiento / origen" value={data.reservation.empresa_ejecuta||'Por confirmar'}/>
      <Summary icon={<Users/>} label="Pasajeros" value={`${data.reservation.numero_pax} pasajero(s)`}/>
      <Summary icon={<CalendarDays/>} label="Inicio" value={dateFmt(data.reservation.checkin)}/>
      <Summary icon={<CalendarDays/>} label="Fin" value={dateFmt(data.reservation.checkout)}/>
    </section>

    {next&&<section className="portal-next">
      <div className="portal-next-icon"><TicketCheck size={20}/></div>
      <div>
        <span>PRÓXIMA EXPERIENCIA</span>
        <h2>{next.producto}</h2>
        <p>{dateLong(next.fecha_servicio)} · {next.numero_pax} pax</p>
      </div>
      <div className="portal-next-pickup">
        <small>PICKUP</small>
        <strong>{timeFmt(next.pickup_time)}</strong>
        <span>{next.meeting_point||'Punto de encuentro por confirmar'}</span>
      </div>
    </section>}

    <section className="portal-section">
      <div className="portal-section-head">
        <div><span className="portal-eyebrow">ITINERARIO</span><h2>Tus experiencias</h2></div>
        <small>{data.services.length} servicio(s)</small>
      </div>

      <div className="portal-services">
        {data.services.map((service,index)=><article key={service.id} className={`portal-service ${service.estado_operacion==='Cancelado'?'cancelled':''}`}>
          <div className="portal-service-index">{String(index+1).padStart(2,'0')}</div>
          <div className="portal-service-main">
            <span>{dateLong(service.fecha_servicio)}</span>
            <h3>{service.producto}</h3>
            <p>{service.numero_pax} pasajero(s)</p>
          </div>
          <div className="portal-service-pickup">
            <div><Clock3 size={14}/><span>{timeFmt(service.pickup_time)}</span></div>
            <div><MapPin size={14}/><span>{service.meeting_point||'Por confirmar'}</span></div>
          </div>
          <div className="portal-service-status">
            <span className={operationClass(service.estado_operacion)}>{operationLabel(service.estado_operacion)}</span>
            <small>{paymentLabel(service.estado_pago)}</small>
          </div>
        </article>)}

        {!data.services.length&&<div className="portal-empty">Todavía no hay experiencias publicadas en esta reserva.</div>}
      </div>
    </section>

    <section className="portal-section">
      <div className="portal-section-head">
        <div><span className="portal-eyebrow">DOCUMENTOS</span><h2>Voucher e itinerario</h2></div>
      </div>

      <div className="portal-documents">
        {data.documents.map(doc=><a key={doc.id} href={doc.url} target="_blank" rel="noreferrer">
          <FileText size={18}/>
          <span><strong>{doc.title}</strong><small>{doc.document_type==='voucher'?'Voucher de servicios':'Itinerario de viaje'}</small></span>
          <span>ABRIR</span>
        </a>)}
        {!data.documents.length&&<div className="portal-empty">Los documentos se publicarán aquí cuando estén confirmados.</div>}
      </div>
    </section>

    <footer className="portal-footer">
      <span>HOTEL EXPERIENCE · BY LINK</span>
      <p>Los horarios y puntos de encuentro visibles son los últimos registrados en la operación. Ante cualquier cambio recibirás la coordinación correspondiente por los canales de tu reserva.</p>
    </footer>
  </main>;
}

function Summary({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){
  return <article className="portal-summary"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}
function firstName(value:string){
  return String(value||'viajero').trim().split(/\s+/)[0]||'viajero';
}
function localIso(d:Date){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateFmt(value?:string|null){
  if(!value)return 'Por confirmar';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
}
function dateLong(value?:string|null){
  if(!value)return 'Fecha por confirmar';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{weekday:'short',day:'2-digit',month:'long'}).replace(/^./,x=>x.toUpperCase());
}
function timeFmt(value?:string|null){
  return value?String(value).slice(0,5):'Por confirmar';
}
function operationLabel(value:string){
  if(value==='Coordinado')return 'Confirmado';
  if(value==='En curso')return 'En curso';
  if(value==='Completado')return 'Realizado';
  if(value==='Cancelado')return 'Cancelado';
  return 'En coordinación';
}
function operationClass(value:string){
  if(value==='Completado')return 'done';
  if(value==='Cancelado')return 'cancelled';
  if(value==='Coordinado'||value==='En curso')return 'confirmed';
  return 'pending';
}
function paymentLabel(value:string){
  if(value==='Pagado')return 'Pago confirmado';
  if(value==='Parcial')return 'Pago parcial';
  if(value==='Reembolsado')return 'Reembolso registrado';
  return 'Pago pendiente';
}
