import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,ArrowRight,CheckCircle2,Clock3,CircleDollarSign,Sparkles,Truck,Users,WalletCards} from 'lucide-react';
import type {CRMActivity,CRMTask,Lead,LeadService,Passenger,ReservationDocument,ServiceAssignment} from '../types';
import {loadOperationsData} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './DailyCommandCenter.css';

type PaymentMovement={id:string;lead_service_id:string;party_type:'client'|'supplier';amount:number;paid_at:string};
type OpsSnapshot={passengers:Passenger[];assignments:ServiceAssignment[];documents:ReservationDocument[];payments:PaymentMovement[]};
type CoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
type DayRange=7|30|90|'all';
const fullCoverage:CoverageKey[]=['vehicle','driver','guide','food','coordination','resources','entrances'];
const rangeOptions:{value:DayRange;label:string}[]=[
  {value:7,label:'7 días'},
  {value:30,label:'30 días'},
  {value:90,label:'90 días'},
  {value:'all',label:'Todo'}
];

export default function DailyCommandCenter({
  leads,services,tasks,activities,onLead,onOpenOperations,onOpenPayments,onOpenAI
}:{
  leads:Lead[];services:LeadService[];tasks:CRMTask[];activities:CRMActivity[];
  onLead:(lead:Lead)=>void;onOpenOperations:()=>void;onOpenPayments:()=>void;onOpenAI:()=>void;
}){
  const [ops,setOps]=useState<OpsSnapshot>({passengers:[],assignments:[],documents:[],payments:[]});
  const [loading,setLoading]=useState(true);
  const [range,setRange]=useState<DayRange>(30);

  const load=async()=>{
    setLoading(true);
    try{
      const [operational,payments]=await Promise.all([
        loadOperationsData(),
        assertSupabase().from('payment_movements').select('id,lead_service_id,party_type,amount,paid_at')
      ]);
      if(payments.error)throw payments.error;
      setOps({
        passengers:(operational.passengers||[]) as Passenger[],
        assignments:(operational.assignments||[]) as ServiceAssignment[],
        documents:(operational.documents||[]) as ReservationDocument[],
        payments:(payments.data||[]) as PaymentMovement[]
      });
    }catch{
      setOps({passengers:[],assignments:[],documents:[],payments:[]});
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const model=useMemo(()=>buildModel({leads,services,tasks,activities,ops,range}),[leads,services,tasks,activities,ops,range]);

  return <section className="daily-command-center">
    <header className="dcc-head">
      <div>
        <span className="eyebrow">CENTRO DEL DÍA</span>
        <h2>{todayLabel()}</h2>
        <p>{loading?'Cruzando ventas, cobros y operación…':model.headline}</p>
      </div>
      <div className="dcc-head-actions">
        <div className="dcc-range-filter" aria-label="Filtrar panel por días">
          <span><Clock3 size={13}/> Rango</span>
          <div>{rangeOptions.map(option=><button key={String(option.value)} className={range===option.value?'active':''} onClick={()=>setRange(option.value)}>{option.label}</button>)}</div>
        </div>
        <button className="dcc-ai" onClick={onOpenAI}><Sparkles size={16}/> Analizar con IA</button>
      </div>
    </header>

    <div className="dcc-metrics">
      <Metric icon={<CircleDollarSign/>} label="Por cobrar" value={money(model.clientPending)} action="Ver pagos" onClick={onOpenPayments}/>
      <Metric icon={<WalletCards/>} label="Por pagar proveedores" value={money(model.supplierPending)} action="Ver pagos" onClick={onOpenPayments}/>
      <Metric icon={<Truck/>} label="Salidas ≤48 h" value={String(model.next48.length)} detail={`${model.next48.filter(x=>!x.ready).length} por revisar`} action="Operación" onClick={onOpenOperations}/>
      <Metric icon={<CheckCircle2/>} label="Reservas próximas listas" value={`${model.readyReservations}/${model.upcomingReservations.length}`} detail={model.upcomingReservations.length?`${model.avgReadiness}% preparación media`:'Sin próximas reservas'} action="Revisar" onClick={onOpenOperations}/>
    </div>

    {model.topPriority&&<button className="dcc-priority" onClick={()=>model.topPriority!.lead&&onLead(model.topPriority!.lead!)}>
      <span className="dcc-priority-icon"><AlertCircle size={18}/></span>
      <span><small>PRIORIDAD PRINCIPAL</small><strong>{model.topPriority.title}</strong><em>{model.topPriority.detail}</em></span>
      <ArrowRight size={17}/>
    </button>}

    <div className="dcc-columns">
      <Column title="Comercial" icon={<Users size={17}/>} subtitle="Qué necesita seguimiento ahora">
        {model.commercial.slice(0,4).map(item=><ActionRow key={item.key} title={item.title} detail={item.detail} badge={item.badge} onClick={()=>item.lead&&onLead(item.lead)}/>) }
        {!model.commercial.length&&<Empty text="No hay seguimientos urgentes detectados en este rango."/>}
      </Column>

      <Column title="Finanzas" icon={<WalletCards size={17}/>} subtitle="Saldos reales registrados">
        {model.finance.slice(0,4).map(item=><ActionRow key={item.key} title={item.title} detail={item.detail} badge={item.badge} onClick={item.lead?()=>onLead(item.lead!):onOpenPayments}/>) }
        {!model.finance.length&&<Empty text="No hay saldos pendientes en este rango."/>}
      </Column>

      <Column title="Operación" icon={<Truck size={17}/>} subtitle="Readiness adaptativo por ejecución">
        {model.upcomingReservations.slice(0,4).map(row=><button className="dcc-readiness" key={row.lead.id} onClick={()=>onLead(row.lead)}>
          <div className="dcc-readiness-top"><span><strong>{row.lead.reserva}</strong><small>{row.lead.codigo} · {row.modeLabel}</small></span><b>{row.percent}%</b></div>
          <div className="dcc-progress"><span style={{width:`${row.percent}%`}}/></div>
          <div className="dcc-readiness-bottom"><span className={row.ready?'ready':'review'}>{row.ready?'Lista para operar':'Por revisar'}</span><small>{row.note}</small></div>
        </button>)}
        {!model.upcomingReservations.length&&<Empty text="No hay reservas próximas en este rango."/>}
      </Column>
    </div>
  </section>;
}

function buildModel({leads,services,tasks,activities,ops,range}:{leads:Lead[];services:LeadService[];tasks:CRMTask[];activities:CRMActivity[];ops:OpsSnapshot;range:DayRange}){
  const today=startOfDay(new Date());
  const in48=new Date(Date.now()+48*3600*1000);
  const rangeStart=range==='all'?null:new Date(today.getTime()-Number(range)*86400000);
  const rangeEnd=range==='all'?null:new Date(today.getTime()+(Number(range)+1)*86400000-1);
  const inRange=(value:any)=>{
    if(range==='all')return true;
    if(!value)return false;
    const d=new Date(value);
    return Number.isFinite(d.getTime())&&d>=rangeStart!&&d<=rangeEnd!;
  };
  const serviceDate=(s:LeadService)=>s.fecha_servicio?new Date(`${s.fecha_servicio}T12:00:00`):new Date(s.created_at);
  const assignmentByService=new Map(ops.assignments.map(a=>[a.lead_service_id,a]));
  const paymentsByService=new Map<string,PaymentMovement[]>();
  for(const p of ops.payments){const list=paymentsByService.get(p.lead_service_id)||[];list.push(p);paymentsByService.set(p.lead_service_id,list)}

  let clientPending=0,supplierPending=0;
  const finance:any[]=[];
  for(const s of services.filter(s=>range==='all'||inRange(serviceDate(s)))){
    const lead=leads.find(l=>l.id===s.lead_id);
    const sale=Number(s.precio_venta||0);
    const assignment=assignmentByService.get(s.id);
    const movements=paymentsByService.get(s.id)||[];
    const clientMoves=movements.filter(x=>x.party_type==='client');
    const supplierMoves=movements.filter(x=>x.party_type==='supplier');
    const clientPaid=clientMoves.length?clientMoves.reduce((a,x)=>a+Number(x.amount||0),0):(s.estado_pago==='Pagado'?sale:0);
    const supplierCost=Number(assignment?.supplier_cost||0);
    const supplierPaid=supplierMoves.length?supplierMoves.reduce((a,x)=>a+Number(x.amount||0),0):(assignment?.supplier_payment_status==='Pagado'?supplierCost:0);
    const clientBalance=Math.max(0,sale-clientPaid);
    const supplierBalance=Math.max(0,supplierCost-supplierPaid);
    clientPending+=clientBalance;supplierPending+=supplierBalance;
    if(clientBalance>0&&lead)finance.push({key:`c-${s.id}`,lead,title:`Cobrar a ${lead.reserva}`,detail:`${s.producto} · saldo ${money(clientBalance)}`,badge:'CLIENTE',amount:clientBalance});
    if(supplierBalance>0&&lead)finance.push({key:`s-${s.id}`,lead,title:`Pago proveedor · ${lead.reserva}`,detail:`${s.producto} · saldo ${money(supplierBalance)}`,badge:'PROVEEDOR',amount:supplierBalance});
  }
  finance.sort((a,b)=>b.amount-a.amount);

  const lastActivity=new Map<string,number>();
  for(const a of activities){if(a.lead_id&&!lastActivity.has(a.lead_id))lastActivity.set(a.lead_id,new Date(a.created_at).getTime())}
  const commercial:any[]=[];
  const openTasks=tasks.filter(t=>t.status!=='Completada');
  const overdue=openTasks.filter(t=>t.due_date&&new Date(t.due_date).getTime()<Date.now()&&(range==='all'||inRange(t.due_date)));
  for(const t of overdue){
    const lead=t.lead_id?leads.find(l=>l.id===t.lead_id):undefined;
    commercial.push({key:`task-${t.id}`,lead,title:t.title,detail:`${lead?.reserva||'Tarea general'} · vencida`,badge:t.priority||'TAREA',score:100});
  }
  for(const l of leads.filter(x=>['nuevo','contactado','cotizado'].includes(String(x.estado)))){
    const ts=lastActivity.get(l.id)||new Date(l.updated_at||l.created_at).getTime();
    const days=Math.floor((Date.now()-ts)/86400000);
    const hasOpen=openTasks.some(t=>t.lead_id===l.id);
    const visible=range==='all'||(rangeStart!==null&&new Date(ts)>=rangeStart);
    if(days>=2&&!hasOpen&&visible)commercial.push({key:`stale-${l.id}`,lead:l,title:`Retomar ${l.reserva}`,detail:`${cap(l.estado)} · ${days} días sin actividad registrada`,badge:'SEGUIMIENTO',score:60+days});
  }
  commercial.sort((a,b)=>b.score-a.score);

  const upcomingServices=services.filter(s=>{
    if(s.estado_operacion==='Cancelado')return false;
    if(!s.fecha_servicio)return range==='all';
    const date=new Date(`${s.fecha_servicio}T23:59:00`);
    return date>=today&&(range==='all'||date<=rangeEnd!);
  });
  const rows=upcomingServices.map(service=>readinessForService(service,leads.find(l=>l.id===service.lead_id),ops,paymentsByService.get(service.id)||[]));
  const byLead=new Map<string,any[]>();
  for(const r of rows){if(!r.lead)continue;const list=byLead.get(r.lead.id)||[];list.push(r);byLead.set(r.lead.id,list)}
  const upcomingReservations=Array.from(byLead.entries()).map(([leadId,list])=>{
    const lead=leads.find(l=>l.id===leadId)!;
    const score=list.reduce((a,x)=>a+x.score,0),target=list.reduce((a,x)=>a+x.target,0);
    const percent=target?Math.round(score/target*100):100;
    const ready=list.every(x=>x.ready);
    const modes=new Set(list.map(x=>x.mode));
    const modeLabel=modes.size>1?'Ejecución mixta':list[0]?.mode==='delegated_full'?'Derivada integral':list[0]?.mode==='delegated_partial'?'Derivada parcial':'Directa';
    const missing=Array.from(new Set(list.flatMap(x=>x.missing))).slice(0,3);
    const warnings=Array.from(new Set(list.flatMap(x=>x.warnings))).slice(0,2);
    return {lead,list,percent,ready,modeLabel,note:ready?(warnings.length?warnings.join(' · '):'Sin bloqueos operacionales'):missing.join(' · ')||'Revisión manual'};
  }).sort((a,b)=>{
    const da=nearestDate(a.list),db=nearestDate(b.list);return da-db;
  });

  const next48=rows.filter(r=>r.date&&r.date>=today&&r.date<=in48);
  const readyReservations=upcomingReservations.filter(x=>x.ready).length;
  const avgReadiness=upcomingReservations.length?Math.round(upcomingReservations.reduce((a,x)=>a+x.percent,0)/upcomingReservations.length):100;

  const opUrgent=next48.filter(x=>!x.ready).sort((a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0))[0];
  const moneyUrgent=finance[0];
  const commercialUrgent=commercial[0];
  const topPriority=opUrgent?{lead:opUrgent.lead,title:`Preparar ${opUrgent.lead?.reserva||opUrgent.service.producto}`,detail:`Sale en menos de 48 h · falta ${opUrgent.missing.join(', ')}`}
    :commercialUrgent?{lead:commercialUrgent.lead,title:commercialUrgent.title,detail:commercialUrgent.detail}
    :moneyUrgent?{lead:moneyUrgent.lead,title:moneyUrgent.title,detail:moneyUrgent.detail}:null;

  const rangeLabel=range==='all'?'todo el historial':`ventana de ${range} días`;
  const headline=topPriority?`Hay una acción prioritaria en la ${rangeLabel}: ${topPriority.title}.`:`No detecté bloqueos críticos en la ${rangeLabel}.`;
  return {clientPending,supplierPending,finance,commercial,upcomingReservations,next48,readyReservations,avgReadiness,topPriority,headline};
}

function readinessForService(service:LeadService,lead:Lead|undefined,ops:OpsSnapshot,movements:PaymentMovement[]){
  const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
  const passengers=lead?ops.passengers.filter(p=>p.lead_id===lead.id):[];
  const risk=lead?ops.documents.find(d=>d.lead_id===lead.id&&d.document_type==='risk_sheet'):undefined;
  const mode=String(assignment?.operation_mode||(assignment?.supplier_id?'delegated_full':'direct'));
  const coverage:CoverageKey[]=mode==='delegated_full'?fullCoverage:(Array.isArray(assignment?.supplier_coverage)?assignment!.supplier_coverage as CoverageKey[]:[]);
  const delegated=Boolean(assignment?.supplier_id)&&mode!=='direct';
  const covered=(key:CoverageKey)=>delegated&&coverage.includes(key);
  const checks:Record<string,boolean>={
    date:Boolean(service.fecha_servicio),
    passengers:passengers.length>=Math.max(1,Number(service.numero_pax||lead?.numero_pax||1)),
    risk:lead?.estado!=='confirmado'||Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet'),
    supplier:Boolean(assignment?.supplier_id),
    guide:Boolean(assignment?.guide_person_id||assignment?.guide_name),
    driver:Boolean(assignment?.driver_person_id||assignment?.driver_name),
    vehicle:Boolean(assignment?.vehicle_id)
  };
  const required:string[]=['date','passengers','risk'];
  if(mode==='direct')required.push('guide','driver','vehicle');
  else{
    required.push('supplier');
    if(!covered('guide'))required.push('guide');
    if(!covered('driver'))required.push('driver');
    if(!covered('vehicle'))required.push('vehicle');
  }
  const score=required.filter(k=>checks[k]).length,target=required.length;
  const manualValidated=['Coordinado','En curso','Completado'].includes(String(service.estado_operacion||''));
  const ready=manualValidated||score===target;
  const labels:Record<string,string>={date:'fecha',passengers:'pasajeros',risk:'hoja de riesgo',supplier:'proveedor',guide:'guía',driver:'conductor',vehicle:'vehículo'};
  const missing=required.filter(k=>!checks[k]).map(k=>labels[k]||k);
  const warnings:string[]=[];
  if(delegated&&Number(assignment?.supplier_cost||0)<=0)warnings.push('precio de adquisición pendiente');
  if(!assignment?.pickup_time)warnings.push('pickup por confirmar');
  const sale=Number(service.precio_venta||0);
  const clientMoves=movements.filter(x=>x.party_type==='client');
  const paid=clientMoves.length?clientMoves.reduce((a,x)=>a+Number(x.amount||0),0):(service.estado_pago==='Pagado'?sale:0);
  if(sale>paid)warnings.push('saldo cliente pendiente');
  const supplierCost=Number(assignment?.supplier_cost||0);
  const supplierMoves=movements.filter(x=>x.party_type==='supplier');
  const supplierPaid=supplierMoves.length?supplierMoves.reduce((a,x)=>a+Number(x.amount||0),0):(assignment?.supplier_payment_status==='Pagado'?supplierCost:0);
  if(supplierCost>supplierPaid)warnings.push('pago proveedor pendiente');
  const date=service.fecha_servicio?new Date(`${service.fecha_servicio}T12:00:00`):null;
  return {service,lead,assignment,mode,score,target,ready,missing,warnings,date};
}

function nearestDate(list:any[]){const dates=list.map(x=>x.date?.getTime()).filter(Boolean);return dates.length?Math.min(...dates):Number.MAX_SAFE_INTEGER}
function Column({title,subtitle,icon,children}:{title:string;subtitle:string;icon:React.ReactNode;children:React.ReactNode}){return <section className="dcc-column"><header><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div></header><div className="dcc-column-body">{children}</div></section>}
function ActionRow({title,detail,badge,onClick}:{title:string;detail:string;badge?:string;onClick?:()=>void}){return <button className="dcc-action-row" onClick={onClick}><span><strong>{title}</strong><small>{detail}</small></span>{badge&&<em>{badge}</em>}<ArrowRight size={14}/></button>}
function Metric({icon,label,value,detail,action,onClick}:{icon:React.ReactNode;label:string;value:string;detail?:string;action:string;onClick:()=>void}){return <button className="dcc-metric" onClick={onClick}><span className="dcc-metric-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong>{detail&&<em>{detail}</em>}</span><b>{action}</b></button>}
function Empty({text}:{text:string}){return <div className="dcc-empty"><CheckCircle2 size={16}/>{text}</div>}
const startOfDay=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const cap=(s:any)=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
function todayLabel(){return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).replace(/^./,x=>x.toUpperCase())}
