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
type CoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
type OperationMode='direct'|'delegated_full'|'delegated_partial';

const fullCoverage:CoverageKey[]=['vehicle','driver','guide','food','coordination','resources','entrances'];

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

  const calculate=(service:LeadService)=>{
    const lead=leads.find(l=>l.id===service.lead_id);
    const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
    const passengers=ops.passengers.filter(p=>p.lead_id===service.lead_id);
    const risk=ops.documents.find(d=>d.lead_id===service.lead_id&&d.document_type==='risk_sheet');

    const mode:OperationMode=(assignment?.operation_mode||(assignment?.supplier_id?'delegated_full':'direct')) as OperationMode;
    const coverage:CoverageKey[]=mode==='delegated_full'
      ?fullCoverage
      :(Array.isArray(assignment?.supplier_coverage)?assignment!.supplier_coverage as CoverageKey[]:[]);
    const delegated=Boolean(assignment?.supplier_id)&&mode!=='direct';
    const covered=(key:CoverageKey)=>delegated&&coverage.includes(key);

    const checks={
      supplier:Boolean(assignment?.supplier_id),
      guide:Boolean(assignment?.guide_person_id||assignment?.guide_name),
      driver:Boolean(assignment?.driver_person_id||assignment?.driver_name),
      vehicle:Boolean(assignment?.vehicle_id),
      passengers:passengers.length>=Math.max(1,Number(service.numero_pax||lead?.numero_pax||1)),
      risk:Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet')
    };

    // Son datos recomendados para preparar la salida, no una jaula rígida.
    // La cobertura del proveedor elimina de la revisión los recursos que él asume.
    const recommendedKeys:Array<keyof typeof checks>=delegated
      ?[
          'supplier',
          ...(!covered('guide')?['guide' as const]:[]),
          ...(!covered('driver')?['driver' as const]:[]),
          ...(!covered('vehicle')?['vehicle' as const]:[]),
          'passengers',
          'risk'
        ]
      :['guide','driver','vehicle','passengers','risk'];

    const score=recommendedKeys.filter(k=>checks[k]).length;
    const target=recommendedKeys.length;
    const recommendedReady=score===target;

    // La decisión humana manda: Coordinado / En curso / Completado valida la salida
    // aunque existan campos recomendados vacíos o elementos que no apliquen.
    const manualValidated=['Coordinado','En curso','Completado'].includes(String(service.estado_operacion||''));
    const ready=manualValidated||recommendedReady;

    const missing=recommendedKeys.filter(k=>!checks[k]).map(key=>labelFor(key));
    const date=service.fecha_servicio?startOfDay(new Date(`${service.fecha_servicio}T12:00:00`)):null;
    const hours=date?(date.getTime()-Date.now())/36e5:null;
    const urgent=!ready&&hours!==null&&hours>=0&&hours<=48;

    return {
      service,lead,assignment,passengers,risk,checks,score,target,recommendedReady,manualValidated,ready,
      date,urgent,delegated,mode,coverage,covered,missing
    };
  };

  const calculatedAll=useMemo(
    ()=>services.filter(s=>s.estado_operacion!=='Cancelado').map(calculate),
    [services,leads,ops]
  );

  const rows=useMemo(()=>{
    const today=startOfDay(new Date());
    const limit7=addDays(today,7);
    const limit30=addDays(today,30);
    const q=query.trim().toLowerCase();

    return calculatedAll
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
  },[calculatedAll,query,horizon,onlyIncomplete]);

  const allMetrics=useMemo(()=>{
    const today=startOfDay(new Date());
    const future=calculatedAll.filter(row=>!row.date||row.date>=today);
    return {
      total:future.length,
      ready:future.filter(x=>x.ready).length,
      incomplete:future.filter(x=>!x.ready).length,
      urgent:future.filter(x=>x.urgent).length
    };
  },[calculatedAll]);

  return <div className="view-stack">
    <section className="surface-card" style={{padding:22}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:20,alignItems:'flex-start',flexWrap:'wrap'}}>
        <div>
          <span className="eyebrow">CONTROL DE SALIDAS</span>
          <h2 style={{fontSize:30,margin:'6px 0'}}>¿Está lista la operación?</h2>
          <p style={{margin:0,color:'#6e685f',maxWidth:720,lineHeight:1.5}}>
            El sistema recomienda lo que falta según la cobertura real del proveedor. <b>La decisión del equipo sigue mandando:</b> si una salida está marcada como Coordinado, En curso o Completado, se considera validada aunque existan campos que no apliquen.
          </p>
        </div>
        <button className="operation-button" onClick={load}><Truck size={14}/> Actualizar operación</button>
      </div>
    </section>

    <section style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10}}>
      <Metric label="Próximas salidas" value={allMetrics.total} icon={<Truck/>}/>
      <Metric label="Listas / validadas" value={allMetrics.ready} icon={<CheckCircle2/>} good/>
      <Metric label="Por revisar" value={allMetrics.incomplete} icon={<AlertCircle/>} warn/>
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
        <label style={{display:'flex',alignItems:'center',gap:7,fontSize:11,fontWeight:700}}><input type="checkbox" checked={onlyIncomplete} onChange={e=>setOnlyIncomplete(e.target.checked)}/> Solo por revisar</label>
      </div>
    </section>

    {loading?<div className="loading-card">Revisando asignaciones operacionales…</div>:<section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <div style={{padding:'18px 20px',borderBottom:'1px solid #d7d0c5'}}>
        <h2 style={{margin:0,fontSize:21}}>Salidas</h2>
        <p style={{margin:'4px 0 0',fontSize:11,color:'#6e685f'}}>{rows.length} servicio(s) según los filtros actuales.</p>
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr><th>Fecha</th><th>Cliente / tour</th><th>Ejecución</th><th>Proveedor</th><th>Guía</th><th>Conductor</th><th>Vehículo</th><th>Pax</th><th>Riesgo</th><th>Estado</th><th></th></tr></thead>
          <tbody>{rows.map(row=>{
            const guideOptional=row.delegated&&row.covered('guide');
            const driverOptional=row.delegated&&row.covered('driver');
            const vehicleOptional=row.delegated&&row.covered('vehicle');
            return <tr key={row.service.id} style={row.urgent?{background:'#fff3ee'}:undefined}>
              <td><strong>{dateFmt(row.service.fecha_servicio)}</strong>{row.urgent&&<span style={{display:'block',fontSize:8,fontWeight:800,color:'#9f3124',marginTop:4}}>≤ 48 HORAS</span>}</td>
              <td><button onClick={()=>row.lead&&onLead(row.lead)} style={linkButton}><strong>{row.lead?.reserva||'Cliente'}</strong><span style={{display:'block',fontSize:9,color:'#6e685f'}}>{row.lead?.codigo||'—'} · {row.service.producto}</span></button></td>
              <td><ExecutionCell mode={row.mode}/></td>
              <ReadyCell ok={row.checks.supplier} optional={!row.delegated} label={row.delegated?'Responsable':'Opcional'} icon={<Building2 size={13}/>}/>
              <ReadyCell ok={row.checks.guide} optional={guideOptional} label={guideOptional&&!row.checks.guide?'Proveedor':'Guía'} icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.driver} optional={driverOptional} label={driverOptional&&!row.checks.driver?'Proveedor':'Conductor'} icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.vehicle} optional={vehicleOptional} label={vehicleOptional&&!row.checks.vehicle?'Proveedor':'Vehículo'} icon={<CarFront size={13}/>}/>
              <ReadyCell ok={row.checks.passengers} label={`${row.passengers.length}/${Math.max(1,Number(row.service.numero_pax||1))}`} icon={<Users size={13}/>}/>
              <ReadyCell ok={row.checks.risk} label="Riesgo" icon={<ClipboardCheck size={13}/>}/>
              <td>
                <div style={{display:'grid',gap:4,minWidth:125}}>
                  <span style={{fontWeight:800,fontSize:11,color:row.ready?'#247244':'#8e5c1c'}}>
                    {row.manualValidated?'VALIDADA':row.recommendedReady?'LISTA':`${row.score}/${row.target} · REVISAR`}
                  </span>
                  {row.manualValidated&&<small style={{fontSize:8,color:'#6e685f'}}>Estado CRM: {row.service.estado_operacion}</small>}
                  {!row.ready&&row.missing.length>0&&<small style={{fontSize:8,color:'#6e685f',lineHeight:1.25}}>Sugerido: {row.missing.join(' · ')}</small>}
                </div>
              </td>
              <td><button className="operation-button" onClick={()=>onOperation(row.service)}><Wrench size={13}/> {row.ready?'Revisar':'Completar'}</button></td>
            </tr>
          })}</tbody>
        </table>
      </div>
      {!rows.length&&<div className="empty-state" style={{margin:18}}>No hay salidas que coincidan con estos filtros.</div>}
    </section>}
  </div>
}

function ExecutionCell({mode}:{mode:OperationMode}){
  const delegated=mode!=='direct';
  const label=mode==='delegated_full'?'DERIVADA INTEGRAL':mode==='delegated_partial'?'DERIVADA PARCIAL':'DIRECTA';
  return <td><span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:9,fontWeight:800,color:delegated?'#2f5f8f':'#6e685f'}}>{delegated?<Building2 size={13}/>:<Wrench size={13}/>} {label}</span></td>;
}

function ReadyCell({ok,label,icon,optional=false}:{ok:boolean;label:string;icon:React.ReactNode;optional?:boolean}){
  const color=ok?'#247244':optional?'#8a8177':'#9b5c1d';
  return <td><span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:9,fontWeight:700,color}}>{ok?<CheckCircle2 size={14}/>:optional?<span style={{fontSize:11}}>—</span>:<AlertCircle size={14}/>} {icon}{label}</span></td>;
}

function Metric({label,value,icon,good,warn,danger}:{label:string;value:number;icon:React.ReactNode;good?:boolean;warn?:boolean;danger?:boolean}){
  const color=good?'#247244':danger?'#a1392e':warn?'#94641e':'#111';
  return <div className="surface-card" style={{padding:16,display:'grid',gridTemplateColumns:'38px 1fr',gap:10,alignItems:'center'}}><div style={{width:36,height:36,border:'1px solid #cfc8bd',borderRadius:'50%',display:'grid',placeItems:'center',color}}>{icon}</div><div><span style={{display:'block',fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#6e685f'}}>{label}</span><strong style={{fontSize:27,lineHeight:1,color}}>{value}</strong></div></div>;
}

function labelFor(key:string){
  return ({supplier:'Proveedor',guide:'Guía',driver:'Conductor',vehicle:'Vehículo',passengers:'Pasajeros',risk:'Hoja de riesgo'} as Record<string,string>)[key]||key;
}

const linkButton:React.CSSProperties={border:0,background:'transparent',padding:0,textAlign:'left',cursor:'pointer',font:'inherit',color:'inherit'};
const startOfDay=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const addDays=(d:Date,n:number)=>new Date(d.getFullYear(),d.getMonth(),d.getDate()+n);
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
