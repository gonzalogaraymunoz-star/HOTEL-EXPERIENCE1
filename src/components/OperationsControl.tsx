import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,Building2,CarFront,CheckCircle2,ClipboardCheck,Search,Truck,Users,Wrench} from 'lucide-react';
import type {Lead,LeadService,Passenger,ReservationDocument,ServiceAssignment} from '../types';
import {loadOperationsData} from '../lib/api';

type OpsData={
  passengers:Passenger[];
  assignments:ServiceAssignment[];
  documents:ReservationDocument[];
};

type Horizon='upcoming'|'7'|'30'|'all';

export default function OperationsControl({
  leads,services,onLead,onOperation
}:{
  leads:Lead[];
  services:LeadService[];
  onLead:(lead:Lead)=>void;
  onOperation:(service:LeadService)=>void;
}){
  const [ops,setOps]=useState<OpsData>({passengers:[],assignments:[],documents:[]});
  const [loading,setLoading]=useState(true);
  const [query,setQuery]=useState('');
  const [horizon,setHorizon]=useState<Horizon>('upcoming');
  const [onlyIncomplete,setOnlyIncomplete]=useState(true);

  const load=async()=>{
    setLoading(true);
    try{
      const data=await loadOperationsData();
      setOps({
        passengers:(data.passengers||[]) as Passenger[],
        assignments:(data.assignments||[]) as ServiceAssignment[],
        documents:(data.documents||[]) as ReservationDocument[]
      });
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const rows=useMemo(()=>{
    const today=startOfDay(new Date());
    const limit7=addDays(today,7);
    const limit30=addDays(today,30);
    const q=query.trim().toLowerCase();

    return services
      .filter(s=>s.estado_operacion!=='Cancelado')
      .map(service=>{
        const lead=leads.find(l=>l.id===service.lead_id);
        const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
        const passengers=ops.passengers.filter(p=>p.lead_id===service.lead_id);
        const risk=ops.documents.find(d=>d.lead_id===service.lead_id&&d.document_type==='risk_sheet');
        const checks={
          supplier:Boolean(assignment?.supplier_id),
          guide:Boolean(assignment?.guide_person_id||assignment?.guide_name),
          driver:Boolean(assignment?.driver_person_id||assignment?.driver_name),
          vehicle:Boolean(assignment?.vehicle_id),
          passengers:passengers.length>=Math.max(1,Number(service.numero_pax||lead?.numero_pax||1)),
          risk:Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet')
        };
        const score=Object.values(checks).filter(Boolean).length;
        const ready=score===6;
        const date=service.fecha_servicio?startOfDay(new Date(`${service.fecha_servicio}T12:00:00`)):null;
        const hours=date?(date.getTime()-Date.now())/36e5:null;
        const urgent=!ready&&hours!==null&&hours>=0&&hours<=48;
        return {service,lead,assignment,passengers,risk,checks,score,ready,date,urgent};
      })
      .filter(row=>{
        if(horizon==='upcoming'&&row.date&&row.date<today)return false;
        if(horizon==='upcoming'&&!row.date)return true;
        if(horizon==='7'&&(!row.date||row.date<today||row.date>limit7))return false;
        if(horizon==='30'&&(!row.date||row.date<today||row.date>limit30))return false;
        if(onlyIncomplete&&row.ready)return false;
        if(q){
          const haystack=[row.lead?.reserva,row.lead?.codigo,row.service.producto,row.service.fecha_servicio].join(' ').toLowerCase();
          if(!haystack.includes(q))return false;
        }
        return true;
      })
      .sort((a,b)=>{
        if(!a.date&&!b.date)return String(a.lead?.reserva||'').localeCompare(String(b.lead?.reserva||''));
        if(!a.date)return -1;
        if(!b.date)return 1;
        return a.date.getTime()-b.date.getTime();
      });
  },[services,leads,ops,query,horizon,onlyIncomplete]);

  const allMetrics=useMemo(()=>{
    const today=startOfDay(new Date());
    const future=services.filter(s=>s.estado_operacion!=='Cancelado'&&(!s.fecha_servicio||startOfDay(new Date(`${s.fecha_servicio}T12:00:00`))>=today));
    const calculated=future.map(service=>{
      const lead=leads.find(l=>l.id===service.lead_id);
      const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
      const passengers=ops.passengers.filter(p=>p.lead_id===service.lead_id);
      const risk=ops.documents.find(d=>d.lead_id===service.lead_id&&d.document_type==='risk_sheet');
      const ready=[
        assignment?.supplier_id,
        assignment?.guide_person_id||assignment?.guide_name,
        assignment?.driver_person_id||assignment?.driver_name,
        assignment?.vehicle_id,
        passengers.length>=Math.max(1,Number(service.numero_pax||lead?.numero_pax||1)),
        Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet')
      ].every(Boolean);
      const date=service.fecha_servicio?new Date(`${service.fecha_servicio}T12:00:00`):null;
      const urgent=!ready&&date&&((date.getTime()-Date.now())/36e5)>=0&&((date.getTime()-Date.now())/36e5)<=48;
      return {ready,urgent};
    });
    return {
      total:calculated.length,
      ready:calculated.filter(x=>x.ready).length,
      incomplete:calculated.filter(x=>!x.ready).length,
      urgent:calculated.filter(x=>x.urgent).length
    };
  },[services,leads,ops]);

  return <div className="view-stack">
    <section className="surface-card" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div>
          <span className="eyebrow">CONTROL DE SALIDAS</span>
          <h2 style={{fontSize:30,margin:'6px 0'}}>¿Está lista la operación?</h2>
          <p style={{margin:0,color:'#6e685f',maxWidth:680,lineHeight:1.5}}>Cada tour se considera listo cuando tiene proveedor, guía, conductor, vehículo, pasajeros completos y hoja de riesgo registrada.</p>
        </div>
        <button className="operation-button" onClick={load}><Truck size={14}/> Actualizar operación</button>
      </div>
    </section>

    <section style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
      <Metric label="Próximas salidas" value={allMetrics.total} icon={<Truck/>}/>
      <Metric label="Listas" value={allMetrics.ready} icon={<CheckCircle2/>} good/>
      <Metric label="Incompletas" value={allMetrics.incomplete} icon={<AlertCircle/>} warn/>
      <Metric label="En próximas 48 h" value={allMetrics.urgent} icon={<ClipboardCheck/>} danger={allMetrics.urgent>0}/>
    </section>

    <section className="surface-card" style={{padding:16}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap'}}>
        <div className="searchbox" style={{flex:'1 1 280px'}}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente, código o experiencia..."/></div>
        <select value={horizon} onChange={e=>setHorizon(e.target.value as Horizon)} style={{minWidth:150}}>
          <option value="upcoming">Próximas</option>
          <option value="7">Próximos 7 días</option>
          <option value="30">Próximos 30 días</option>
          <option value="all">Todo el histórico</option>
        </select>
        <label style={{display:'flex',alignItems:'center',gap:7,fontSize:11,fontWeight:700}}><input type="checkbox" checked={onlyIncomplete} onChange={e=>setOnlyIncomplete(e.target.checked)}/> Solo incompletas</label>
      </div>
    </section>

    {loading?<div className="loading-card">Revisando asignaciones operacionales…</div>:<section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'18px 20px',borderBottom:'1px solid #d7d0c5'}}><h2 style={{margin:0,fontSize:21}}>Salidas</h2><p style={{margin:'4px 0 0',fontSize:11,color:'#6e685f'}}>{rows.length} servicio(s) según los filtros actuales.</p></div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><th>Fecha</th><th>Cliente / tour</th><th>Proveedor</th><th>Guía</th><th>Conductor</th><th>Vehículo</th><th>Pax</th><th>Riesgo</th><th>Estado</th><th></th></tr></thead>
          <tbody>{rows.map(row=>{
            const missing=missingLabels(row.checks);
            return <tr key={row.service.id} style={row.urgent?{background:'#fff3ee'}:undefined}>
              <td><strong>{dateFmt(row.service.fecha_servicio)}</strong>{row.urgent&&<span style={{display:'block',fontSize:8,fontWeight:800,color:'#9f3124',marginTop:4}}>≤ 48 HORAS</span>}</td>
              <td><button onClick={()=>row.lead&&onLead(row.lead)} style={linkButton}><strong>{row.lead?.reserva||'Cliente'}</strong><span style={{display:'block',fontSize:9,color:'#6e685f'}}>{row.lead?.codigo||'—'} · {row.service.producto}</span></button></td>
              <ReadyCell ok={row.checks.supplier} label="Proveedor" icon={<Building2 size={13}/>}/>
              <ReadyCell ok={row.checks.guide} label="Guía" icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.driver} label="Conductor" icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.vehicle} label="Vehículo" icon={<CarFront size={13}/>}/>
              <ReadyCell ok={row.checks.passengers} label={`${row.passengers.length}/${Math.max(1,Number(row.service.numero_pax||1))}`} icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.risk} label="Riesgo" icon={<ClipboardCheck size={13}/>}/>
              <td><div style={{display:'grid',gap:4,minWidth:110}}><span style={{fontWeight:800,fontSize:11,color:row.ready?'#247244':'#8e5c1c'}}>{row.ready?'LISTA':`${row.score}/6`}</span>{!row.ready&&<small style={{fontSize:8,color:'#6e685f',lineHeight:1.25}}>{missing.join(' · ')}</small>}</div></td>
              <td><button className="operation-button" onClick={()=>onOperation(row.service)}><Wrench size={13}/> {row.ready?'Revisar':'Completar'}</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>
      {!rows.length&&<div className="empty-state" style={{margin:18}}>No hay salidas que coincidan con estos filtros.</div>}
    </section>}
  </div>
}

function ReadyCell({ok,label,icon}:{ok:boolean;label:string;icon:React.ReactNode}){
  return <td><span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:9,fontWeight:700,color:ok?'#247244':'#8a8177'}}>{ok?<CheckCircle2 size={14}/>:<AlertCircle size={14}/>} {icon}{label}</span></td>;
}

function Metric({label,value,icon,good,warn,danger}:{label:string;value:number;icon:React.ReactNode;good?:boolean;warn?:boolean;danger?:boolean}){
  const color=good?'#247244':danger?'#a1392e':warn?'#94641e':'#111';
  return <div className="surface-card" style={{padding:16,display:'grid',gridTemplateColumns:'38px 1fr',gap:10,alignItems:'center'}}><div style={{width:36,height:36,border:'1px solid #cfc8bd',borderRadius:'50%',display:'grid',placeItems:'center',color}}>{icon}</div><div><span style={{display:'block',fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#6e685f'}}>{label}</span><strong style={{fontSize:27,lineHeight:1,color}}>{value}</strong></div></div>;
}

function missingLabels(checks:any){
  return [
    !checks.supplier&&'Proveedor',
    !checks.guide&&'Guía',
    !checks.driver&&'Conductor',
    !checks.vehicle&&'Vehículo',
    !checks.passengers&&'Pax',
    !checks.risk&&'Hoja riesgo'
  ].filter(Boolean) as string[];
}

const linkButton:React.CSSProperties={border:0,background:'transparent',padding:0,textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'};
const startOfDay=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const addDays=(d:Date,n:number)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
