import React,{useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {AlertTriangle,Clock3,Link2,Plus,RefreshCw,ShieldCheck,TicketCheck,Users} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';

type Mode='dashboard'|'reservations';
type Departure={
  id:string;tour_id:string;product_name:string;service_date:string;start_time?:string|null;
  capacity_total:number;status:string;confirmed_pax:number;hold_pax:number;available_pax:number;
  active_reservations:number;notes?:string|null;
};
type ServiceRow={
  id:string;lead_id:string;producto:string;tour_id?:string|null;fecha_servicio?:string|null;numero_pax:number;
  booking_status?:string|null;hold_expires_at?:string|null;sales_channel?:string|null;
  external_booking_ref?:string|null;departure_id?:string|null;estado_operacion?:string|null;
};
type LeadRow={id:string;reserva:string;codigo:string;canal?:string|null};

const CHANNELS=['Hotel','Recepción','QR','Web','Directo','Viator','GetYourGuide','Otro'];
const BOOKING_STATES=[
  ['confirmed','Confirmada'],['hold','HOLD'],['cancelled','Cancelada'],['completed','Completada'],['expired','HOLD vencido']
] as const;

export default function TourTaskBookingBridge({role}:{role:string}){
  const [host,setHost]=useState<HTMLElement|null>(null);
  const [mode,setMode]=useState<Mode|null>(null);

  useEffect(()=>{
    let stopped=false;
    let scheduled:number|undefined;
    const bind=()=>{
      if(stopped)return;
      const title=String(document.querySelector('.crm-topbar h1')?.textContent||'').trim();
      const next:Mode|null=title==='Reservas'?'reservations':title==='Inicio'?'dashboard':null;
      let node=document.getElementById('tourtask-booking-bridge-host') as HTMLElement|null;
      if(!next){
        if(node)node.remove();
        setHost(null);setMode(null);return;
      }
      const target=next==='reservations'
        ?document.querySelector('.crm-main > .surface-card')
        :document.querySelector('.daily-command-center');
      if(!target)return;
      if(!node){node=document.createElement('div');node.id='tourtask-booking-bridge-host'}
      if(node.parentElement!==target.parentElement||node.nextSibling!==target)target.parentElement?.insertBefore(node,target);
      setHost(node);setMode(next);
    };
    const schedule=()=>{
      if(scheduled)window.cancelAnimationFrame(scheduled);
      scheduled=window.requestAnimationFrame(bind);
    };
    const observer=new MutationObserver(schedule);
    observer.observe(document.body,{subtree:true,childList:true,characterData:true});
    schedule();
    return()=>{
      stopped=true;observer.disconnect();if(scheduled)window.cancelAnimationFrame(scheduled);
      document.getElementById('tourtask-booking-bridge-host')?.remove();
    };
  },[]);

  return host&&mode?createPortal(<BookingInventoryPanel mode={mode} role={role}/>,host):null;
}

function BookingInventoryPanel({mode,role}:{mode:Mode;role:string}){
  const sb=assertSupabase();
  const [departures,setDepartures]=useState<Departure[]>([]);
  const [services,setServices]=useState<ServiceRow[]>([]);
  const [leads,setLeads]=useState<LeadRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [formOpen,setFormOpen]=useState(false);
  const [product,setProduct]=useState('');
  const [date,setDate]=useState('');
  const [time,setTime]=useState('');
  const [capacity,setCapacity]=useState(10);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      try{await sb.rpc('expire_booking_holds')}catch{}
      const today=new Date().toISOString().slice(0,10);
      const [depRes,svcRes,leadRes]=await Promise.all([
        sb.from('departure_inventory').select('*').gte('service_date',today).order('service_date').order('start_time'),
        sb.from('lead_services').select('id,lead_id,producto,tour_id,fecha_servicio,numero_pax,booking_status,hold_expires_at,sales_channel,external_booking_ref,departure_id,estado_operacion').gte('fecha_servicio',today).order('fecha_servicio'),
        sb.from('leads').select('id,reserva,codigo,canal')
      ]);
      if(depRes.error)throw depRes.error;if(svcRes.error)throw svcRes.error;if(leadRes.error)throw leadRes.error;
      setDepartures((depRes.data||[]) as Departure[]);
      setServices((svcRes.data||[]) as ServiceRow[]);
      setLeads((leadRes.data||[]) as LeadRow[]);
    }catch(e:any){setError(e.message||'No se pudo cargar disponibilidad.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const leadMap=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const products=useMemo(()=>{
    const map=new Map<string,string>();
    for(const s of services)if(s.tour_id)map.set(s.tour_id,s.producto);
    return Array.from(map.entries()).map(([tour_id,name])=>({tour_id,name})).sort((a,b)=>a.name.localeCompare(b.name));
  },[services]);
  useEffect(()=>{if(!product&&products[0])setProduct(products[0].tour_id)},[products,product]);

  const activeServices=services.filter(s=>!['cancelled','completed'].includes(String(s.booking_status||''))&&s.estado_operacion!=='Cancelado');
  const activeHolds=activeServices.filter(s=>s.booking_status==='hold'&&(!s.hold_expires_at||new Date(s.hold_expires_at)>new Date()));
  const withoutDeparture=activeServices.filter(s=>s.tour_id&&s.fecha_servicio&&!s.departure_id);
  const critical=departures.filter(d=>d.status==='open'&&d.capacity_total>0&&(d.available_pax<=2||d.available_pax/d.capacity_total<=.2));
  const confirmed=activeServices.filter(s=>s.booking_status==='confirmed').length;

  const matchingDepartures=(s:ServiceRow)=>departures.filter(d=>d.status==='open'&&d.service_date===s.fecha_servicio&&(!s.tour_id||d.tour_id===s.tour_id));

  const patchService=async(id:string,patch:any)=>{
    setError('');setNotice('');
    const {error}=await sb.from('lead_services').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);
    if(error){setError(error.message);return false}
    await load();return true;
  };

  const changeStatus=async(s:ServiceRow,status:string)=>{
    const patch:any={booking_status:status};
    if(status==='hold')patch.hold_expires_at=new Date(Date.now()+15*60*1000).toISOString();
    if(status!=='hold')patch.hold_expires_at=null;
    if(status==='cancelled')patch.estado_operacion='Cancelado';
    if(status==='completed')patch.estado_operacion='Completado';
    await patchService(s.id,patch);
  };

  const createDeparture=async(e:React.FormEvent)=>{
    e.preventDefault();setError('');setNotice('');
    const p=products.find(x=>x.tour_id===product);
    if(!p||!date||capacity<1){setError('Selecciona producto, fecha y una capacidad mayor a cero.');return}
    const {data:{user}}=await sb.auth.getUser();
    const {error}=await sb.from('tour_departures').insert({
      tour_id:p.tour_id,product_name:p.name,service_date:date,start_time:time||null,
      capacity_total:capacity,status:'open',created_by:user?.id||null
    });
    if(error){setError(error.message);return}
    setNotice('Salida creada. Ya puede recibir reservas sin superar su capacidad.');
    setFormOpen(false);setDate('');setTime('');await load();
  };

  const autoLink=async()=>{
    setError('');setNotice('');
    let linked=0,failed=0;
    for(const s of withoutDeparture){
      const matches=matchingDepartures(s);
      if(matches.length!==1)continue;
      const {error}=await sb.from('lead_services').update({departure_id:matches[0].id,updated_at:new Date().toISOString()}).eq('id',s.id);
      if(error)failed++;else linked++;
    }
    setNotice(`${linked} reserva(s) vinculadas automáticamente${failed?` · ${failed} no pudieron vincularse por capacidad o consistencia`:''}.`);
    await load();
  };

  const goReservations=()=>{
    const buttons=Array.from(document.querySelectorAll<HTMLButtonElement>('.sidebar .nav-item'));
    buttons.find(x=>String(x.textContent||'').includes('Reservas'))?.click();
  };

  if(mode==='dashboard')return <section style={summaryCardStyle}>
    <div style={{display:'flex',justifyContent:'space-between',gap:18,alignItems:'center',flexWrap:'wrap'}}>
      <div><span className="eyebrow">CONTROL DE RESERVAS · INVENTARIO CENTRAL</span><h3 style={{margin:'5px 0 2px',fontSize:20}}>Disponibilidad y canales</h3><p style={{margin:0,color:'#6e685f',fontSize:11}}>Un solo cupo para ventas directas, hotel y futuros canales externos.</p></div>
      <button className="operation-button" onClick={goReservations}><TicketCheck size={14}/> Abrir Reservas</button>
    </div>
    <div style={metricGridStyle}>
      <MiniMetric label="Confirmadas" value={confirmed} icon={<ShieldCheck size={16}/>}/>
      <MiniMetric label="HOLD activos" value={activeHolds.length} icon={<Clock3 size={16}/>} warn={activeHolds.length>0}/>
      <MiniMetric label="Sin salida" value={withoutDeparture.length} icon={<Link2 size={16}/>} warn={withoutDeparture.length>0}/>
      <MiniMetric label="Cupos críticos" value={critical.length} icon={<AlertTriangle size={16}/>} warn={critical.length>0}/>
    </div>
    {error&&<InlineError text={error}/>} 
  </section>;

  return <div style={{display:'grid',gap:12,marginBottom:12}}>
    <section style={summaryCardStyle}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div><span className="eyebrow">INVENTARIO CENTRAL</span><h2 style={{margin:'5px 0 3px',fontSize:24}}>Reservas + disponibilidad real</h2><p style={{margin:0,color:'#6e685f',fontSize:11,maxWidth:760,lineHeight:1.5}}>La reserva consume cupo de una salida única. Los HOLD duran 15 minutos y la base bloquea cualquier intento de sobreventa.</p></div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <button className="operation-button" onClick={load}><RefreshCw size={14}/> Actualizar</button>
          {role!=='viewer'&&<button className="primary-button" onClick={()=>setFormOpen(v=>!v)}><Plus size={14}/> Nueva salida</button>}
        </div>
      </div>
      <div style={metricGridStyle}>
        <MiniMetric label="Confirmadas" value={confirmed} icon={<ShieldCheck size={16}/>}/>
        <MiniMetric label="HOLD activos" value={activeHolds.length} icon={<Clock3 size={16}/>} warn={activeHolds.length>0}/>
        <MiniMetric label="Sin salida" value={withoutDeparture.length} icon={<Link2 size={16}/>} warn={withoutDeparture.length>0}/>
        <MiniMetric label="Cupos críticos" value={critical.length} icon={<AlertTriangle size={16}/>} warn={critical.length>0}/>
      </div>
      {formOpen&&<form onSubmit={createDeparture} style={formStyle}>
        <label style={fieldStyle}><span>Producto</span><select value={product} onChange={e=>setProduct(e.target.value)} required>{products.map(p=><option key={p.tour_id} value={p.tour_id}>{p.name}</option>)}</select></label>
        <label style={fieldStyle}><span>Fecha</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
        <label style={fieldStyle}><span>Hora salida</span><input type="time" value={time} onChange={e=>setTime(e.target.value)}/></label>
        <label style={fieldStyle}><span>Capacidad</span><input type="number" min={1} value={capacity} onChange={e=>setCapacity(Number(e.target.value||0))} required/></label>
        <button className="primary-button" type="submit">Crear salida</button>
      </form>}
      {notice&&<div style={noticeStyle}><ShieldCheck size={15}/>{notice}</div>}
      {error&&<InlineError text={error}/>} 
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'16px 18px',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',borderBottom:'1px solid #ddd6cc',flexWrap:'wrap'}}>
        <div><h3 style={{margin:0,fontSize:18}}>Salidas y cupos</h3><p style={{margin:'3px 0 0',fontSize:10,color:'#6e685f'}}>Fuente única de disponibilidad para cada producto, fecha y horario.</p></div>
        {withoutDeparture.length>0&&<button className="operation-button" onClick={autoLink}><Link2 size={14}/> Vincular coincidencias únicas</button>}
      </div>
      {loading?<div className="loading-card">Cargando cupos…</div>:<div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr><th>Fecha</th><th>Producto</th><th>Hora</th><th>Capacidad</th><th>Confirmados</th><th>HOLD</th><th>Disponibles</th><th>Estado</th></tr></thead><tbody>
        {departures.map(d=><tr key={d.id}><td><strong>{dateFmt(d.service_date)}</strong></td><td><strong>{d.product_name}</strong><span>{d.tour_id}</span></td><td>{d.start_time?String(d.start_time).slice(0,5):'—'}</td><td>{d.capacity_total}</td><td>{d.confirmed_pax}</td><td>{d.hold_pax}</td><td><span style={{fontWeight:800,color:d.available_pax<=2?'#9f3124':'#247244'}}>{d.available_pax}</span></td><td><span className={`status-badge ${d.status==='open'?'confirmado':'neutral'}`}>{departureStatus(d.status)}</span></td></tr>)}
      </tbody></table>{!departures.length&&<div className="empty-state" style={{margin:18}}>Todavía no hay salidas con capacidad definida.</div>}</div>}
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'16px 18px',borderBottom:'1px solid #ddd6cc'}}><h3 style={{margin:0,fontSize:18}}>Control por reserva</h3><p style={{margin:'3px 0 0',fontSize:10,color:'#6e685f'}}>Canal, estado de reserva, HOLD y salida asignada sin separar la operación existente.</p></div>
      <div style={{overflowX:'auto'}}><table style={{width:'100%'}}><thead><tr><th>Cliente</th><th>Fecha / producto</th><th>Pax</th><th>Canal</th><th>Reserva</th><th>Salida / cupo</th><th>Ref. externa</th></tr></thead><tbody>
        {services.map(s=>{const lead=leadMap.get(s.lead_id);const matches=matchingDepartures(s);const selected=departures.find(d=>d.id===s.departure_id);return <tr key={s.id}>
          <td><strong>{lead?.reserva||'Cliente'}</strong><span>{lead?.codigo||'—'}</span></td>
          <td><strong>{dateFmt(s.fecha_servicio)}</strong><span>{s.producto}</span></td>
          <td><b>{s.numero_pax}</b></td>
          <td><select value={s.sales_channel||lead?.canal||'Directo'} onChange={e=>patchService(s.id,{sales_channel:e.target.value})}>{CHANNELS.map(x=><option key={x}>{x}</option>)}</select></td>
          <td><div style={{display:'grid',gap:4}}><select value={s.booking_status||'confirmed'} onChange={e=>changeStatus(s,e.target.value)}>{BOOKING_STATES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>{s.booking_status==='hold'&&<small style={{fontSize:8,color:'#9a651d'}}>vence {holdLabel(s.hold_expires_at)}</small>}</div></td>
          <td><div style={{display:'grid',gap:4,minWidth:180}}><select value={s.departure_id||''} onChange={e=>patchService(s.id,{departure_id:e.target.value||null})}><option value="">Sin salida asignada</option>{matches.map(d=><option key={d.id} value={d.id}>{String(d.start_time||'').slice(0,5)||'s/h'} · {d.available_pax} disp.</option>)}</select>{selected&&<small style={{fontSize:8,color:selected.available_pax<=2?'#9f3124':'#247244'}}>{selected.confirmed_pax} confirmados · {selected.hold_pax} hold · {selected.available_pax} disponibles</small>}</div></td>
          <td><input style={{minWidth:120}} defaultValue={s.external_booking_ref||''} placeholder="OTA / pago" onBlur={e=>{const value=e.currentTarget.value.trim();if(value!==(s.external_booking_ref||''))void patchService(s.id,{external_booking_ref:value||null})}}/></td>
        </tr>})}
      </tbody></table>{!services.length&&<div className="empty-state" style={{margin:18}}>No hay reservas futuras.</div>}</div>
    </section>
  </div>;
}

function MiniMetric({label,value,icon,warn=false}:{label:string;value:number;icon:React.ReactNode;warn?:boolean}){
  return <div style={{border:'1px solid #d9d2c8',borderRadius:14,padding:'11px 12px',display:'flex',gap:10,alignItems:'center',background:'#fff'}}><span style={{width:30,height:30,border:'1px solid #ddd6cc',borderRadius:'50%',display:'grid',placeItems:'center',color:warn?'#9a651d':'#1c1b19'}}>{icon}</span><span><small style={{display:'block',fontSize:8,textTransform:'uppercase',letterSpacing:'.08em',color:'#746d64'}}>{label}</small><b style={{fontSize:20,color:warn?'#9a651d':'#111'}}>{value}</b></span></div>;
}
function InlineError({text}:{text:string}){return <div style={{marginTop:10,padding:'10px 12px',border:'1px solid #e2b8ae',background:'#fff3ef',borderRadius:10,display:'flex',gap:8,alignItems:'center',fontSize:10,color:'#8d3024'}}><AlertTriangle size={15}/>{text}</div>}
function departureStatus(s:string){return s==='open'?'Abierta':s==='closed'?'Cerrada':'Cancelada'}
function dateFmt(d:any){return d?new Date(String(d)+'T12:00:00').toLocaleDateString('es-CL'):'Sin fecha'}
function holdLabel(value?:string|null){if(!value)return '15 min';const d=new Date(value);return d.toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}

const summaryCardStyle:React.CSSProperties={background:'#f8f6f2',border:'1px solid #d7d0c5',borderRadius:18,padding:18,marginBottom:12};
const metricGridStyle:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginTop:14};
const formStyle:React.CSSProperties={display:'grid',gridTemplateColumns:'2fr 1fr 1fr 1fr auto',gap:8,alignItems:'end',marginTop:14,paddingTop:14,borderTop:'1px solid #ddd6cc'};
const fieldStyle:React.CSSProperties={display:'grid',gap:5,fontSize:9,fontWeight:800,textTransform:'uppercase',letterSpacing:'.05em',color:'#746d64'};
const noticeStyle:React.CSSProperties={marginTop:10,padding:'10px 12px',border:'1px solid #b9d4c3',background:'#f3faf5',borderRadius:10,display:'flex',gap:8,alignItems:'center',fontSize:10,color:'#247244'};
