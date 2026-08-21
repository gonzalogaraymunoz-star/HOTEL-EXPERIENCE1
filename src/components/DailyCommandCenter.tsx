import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertCircle,ArrowRight,BarChart3,Building2,CheckCircle2,CircleDollarSign,
  Clock3,PackageSearch,Percent,Sparkles,TrendingUp,Truck,Users,WalletCards
} from 'lucide-react';
import type {
  CRMActivity,CRMTask,Lead,LeadService,Passenger,ReservationDocument,
  ServiceAssignment,Supplier
} from '../types';
import {loadOperationsData} from '../lib/api';
import {assertSupabase} from '../lib/supabase';
import './DailyCommandCenter.css';

type PaymentMovement={
  id:string;
  lead_service_id:string;
  party_type:'client'|'supplier';
  amount:number;
  paid_at:string;
};
type CostItem={lead_service_id:string;amount:number};
type ServiceClosure={
  lead_service_id:string;
  closure_status:'open'|'closed';
  refund_amount:number;
  refund_status:string;
  sale_snapshot:number;
  supplier_cost_snapshot:number;
  extra_cost_snapshot:number;
  total_cost_snapshot:number;
  net_sale_snapshot:number;
  margin_snapshot:number;
  margin_pct_snapshot:number;
};
type OpsSnapshot={
  passengers:Passenger[];
  assignments:ServiceAssignment[];
  documents:ReservationDocument[];
  suppliers:Supplier[];
  payments:PaymentMovement[];
  costs:CostItem[];
  closures:ServiceClosure[];
};
type CoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
type Period='all'|string;

const fullCoverage:CoverageKey[]=['vehicle','driver','guide','food','coordination','resources','entrances'];

export default function DailyCommandCenter({
  leads,services,tasks,activities,onLead,onOpenOperations,onOpenPayments,onOpenAI
}:{
  leads:Lead[];services:LeadService[];tasks:CRMTask[];activities:CRMActivity[];
  onLead:(lead:Lead)=>void;onOpenOperations:()=>void;onOpenPayments:()=>void;onOpenAI:()=>void;
}){
  const currentMonth=monthKey(new Date());
  const [ops,setOps]=useState<OpsSnapshot>({
    passengers:[],assignments:[],documents:[],suppliers:[],payments:[],costs:[],closures:[]
  });
  const [loading,setLoading]=useState(true);
  const [period,setPeriod]=useState<Period>(currentMonth);

  const months=useMemo(()=>{
    const values=Array.from(new Set(
      services.map(s=>String(s.fecha_servicio||'').slice(0,7)).filter(x=>/^\d{4}-\d{2}$/.test(x))
    )).sort().reverse();
    return values;
  },[services]);

  useEffect(()=>{
    if(period!==currentMonth&&period!=='all'&&!months.includes(period))setPeriod(currentMonth);
  },[months.join('|')]);

  const load=async()=>{
    setLoading(true);
    try{
      const [operational,payments,costs,closures]=await Promise.all([
        loadOperationsData(),
        assertSupabase().from('payment_movements').select('id,lead_service_id,party_type,amount,paid_at'),
        assertSupabase().from('service_cost_items').select('lead_service_id,amount'),
        assertSupabase().from('service_closures').select('lead_service_id,closure_status,refund_amount,refund_status,sale_snapshot,supplier_cost_snapshot,extra_cost_snapshot,total_cost_snapshot,net_sale_snapshot,margin_snapshot,margin_pct_snapshot')
      ]);
      if(payments.error)throw payments.error;
      if(costs.error)throw costs.error;
      if(closures.error)throw closures.error;
      setOps({
        passengers:(operational.passengers||[]) as Passenger[],
        assignments:(operational.assignments||[]) as ServiceAssignment[],
        documents:(operational.documents||[]) as ReservationDocument[],
        suppliers:(operational.suppliers||[]) as Supplier[],
        payments:(payments.data||[]) as PaymentMovement[],
        costs:(costs.data||[]) as CostItem[],
        closures:(closures.data||[]) as ServiceClosure[]
      });
    }catch{
      setOps({passengers:[],assignments:[],documents:[],suppliers:[],payments:[],costs:[],closures:[]});
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[]);

  const model=useMemo(
    ()=>buildModel({leads,services,tasks,activities,ops,period}),
    [leads,services,tasks,activities,ops,period]
  );

  return <section className="daily-command-center">
    <header className="dcc-head">
      <div>
        <span className="eyebrow">CENTRO EJECUTIVO</span>
        <h2>{todayLabel()}</h2>
        <p>{loading?'Cruzando ventas, costos, cobros y operación…':model.headline}</p>
      </div>
      <div className="dcc-head-actions">
        <label className="dcc-period">
          <span>Periodo financiero</span>
          <select value={period} onChange={e=>setPeriod(e.target.value)}>
            <option value={currentMonth}>Este mes · {periodLabel(currentMonth)}</option>
            {months.filter(m=>m!==currentMonth).map(m=><option key={m} value={m}>{periodLabel(m)}</option>)}
            <option value="all">Todo el histórico</option>
          </select>
        </label>
        <button className="dcc-ai" onClick={onOpenAI}><Sparkles size={16}/> Analizar con IA</button>
      </div>
    </header>

    <div className="dcc-exec-metrics">
      <ExecMetric icon={<CircleDollarSign/>} label="Ventas" value={money(model.sales)} detail={model.periodDescription} onClick={onOpenPayments}/>
      <ExecMetric icon={<CheckCircle2/>} label="Cobrado" value={money(model.clientPaid)} detail={`${pct(model.collectionPct)} de la venta`} good onClick={onOpenPayments}/>
      <ExecMetric icon={<Clock3/>} label="Por cobrar" value={money(model.clientPending)} detail={`${model.clientPendingCount} servicio(s) con saldo`} warn={model.clientPending>0} onClick={onOpenPayments}/>
      <ExecMetric icon={<WalletCards/>} label="Costos registrados" value={money(model.totalCosts)} detail={`${money(model.supplierCosts)} proveedor + ${money(model.extraCosts)} extras`} onClick={onOpenPayments}/>
      <ExecMetric icon={<Building2/>} label="Por pagar proveedores" value={money(model.supplierPending)} detail={`${money(model.supplierPaid)} pagado`} warn={model.supplierPending>0} onClick={onOpenPayments}/>
      <ExecMetric icon={<TrendingUp/>} label="Margen registrado" value={money(model.margin)} detail={`${pct(model.marginPct)} · ${model.closedFinancialCount} resultado(s) final(es)`} good={model.margin>=0} warn={model.margin<0} onClick={onOpenPayments}/>
      <ExecMetric icon={<Percent/>} label="Margen %" value={pct(model.marginPct)} detail={model.costCoverage<100?'Provisional por costos faltantes':'Costos cubiertos'} warn={model.costCoverage<100} onClick={onOpenPayments}/>
      <ExecMetric icon={<BarChart3/>} label="Cobertura de costos" value={`${model.costCoverage}%`} detail={`${model.costedServices}/${model.financialServiceCount} servicios con costos`} warn={model.costCoverage<100} onClick={onOpenPayments}/>
    </div>

    <div className="dcc-metrics">
      <Metric icon={<Truck/>} label="Salidas hoy" value={String(model.todayServices.length)} detail={`${model.todayServices.filter(x=>!x.ready).length} por revisar`} action="Operación" onClick={onOpenOperations}/>
      <Metric icon={<Clock3/>} label="Salidas ≤48 h" value={String(model.next48.length)} detail={`${model.next48.filter(x=>!x.ready).length} por revisar`} action="Operación" onClick={onOpenOperations}/>
      <Metric icon={<CheckCircle2/>} label="Reservas próximas listas" value={`${model.readyReservations}/${model.upcomingReservations.length}`} detail={model.upcomingReservations.length?`${model.avgReadiness}% preparación media`:'Sin próximas reservas'} action="Revisar" onClick={onOpenOperations}/>
      <Metric icon={<AlertCircle/>} label="Tareas vencidas" value={String(model.overdueCount)} detail={model.overdueCount?'Requieren seguimiento':'Sin tareas vencidas'} action="Revisar" onClick={()=>model.commercial[0]?.lead&&onLead(model.commercial[0].lead)}/>
    </div>

    {model.costCoverage<100&&model.sales>0&&<div className="dcc-finance-warning">
      <AlertCircle size={16}/>
      <span><b>Margen provisional:</b> {model.financialServiceCount-model.costedServices} servicio(s) del periodo todavía no tienen costos cargados. El margen puede verse artificialmente alto.</span>
    </div>}

    {model.refundPending>0&&<div className="dcc-finance-warning">
      <AlertCircle size={16}/>
      <span><b>Reembolsos pendientes:</b> hay {money(model.refundPending)} comprometidos en cierres operacionales y aún marcados como pendientes.</span>
    </div>}

    {model.topPriority&&<button className="dcc-priority" onClick={()=>model.topPriority!.lead&&onLead(model.topPriority!.lead!)}>
      <span className="dcc-priority-icon"><AlertCircle size={18}/></span>
      <span><small>PRIORIDAD PRINCIPAL</small><strong>{model.topPriority.title}</strong><em>{model.topPriority.detail}</em></span>
      <ArrowRight size={17}/>
    </button>}

    <section className="dcc-performance">
      <header>
        <div><span className="eyebrow">RENDIMIENTO DEL PERIODO</span><h3>Qué está moviendo el negocio</h3></div>
        <small>Basado en ventas y costos registrados del periodo seleccionado.</small>
      </header>
      <div className="dcc-performance-grid">
        <PerformanceCard icon={<PackageSearch/>} label="Producto" item={model.performance.product}/>
        <PerformanceCard icon={<Building2/>} label="Hotel / origen" item={model.performance.hotel}/>
        <PerformanceCard icon={<Users/>} label="Canal" item={model.performance.channel}/>
        <PerformanceCard icon={<Truck/>} label="Proveedor" item={model.performance.supplier}/>
      </div>
    </section>

    <div className="dcc-columns">
      <Column title="Comercial" icon={<Users size={17}/>} subtitle="Qué necesita seguimiento ahora">
        {model.commercial.slice(0,4).map(item=><ActionRow key={item.key} title={item.title} detail={item.detail} badge={item.badge} onClick={()=>item.lead&&onLead(item.lead)}/>)}
        {!model.commercial.length&&<Empty text="No hay seguimientos urgentes detectados."/>}
      </Column>

      <Column title="Finanzas" icon={<WalletCards size={17}/>} subtitle={`Saldos del ${model.periodDescription.toLowerCase()}`}>
        {model.finance.slice(0,4).map(item=><ActionRow key={item.key} title={item.title} detail={item.detail} badge={item.badge} onClick={item.lead?()=>onLead(item.lead!):onOpenPayments}/>)}
        {!model.finance.length&&<Empty text="No hay saldos pendientes cuantificados en este periodo."/>}
      </Column>

      <Column title="Operación" icon={<Truck size={17}/>} subtitle="Readiness adaptativo por ejecución">
        {model.upcomingReservations.slice(0,4).map(row=><button className="dcc-readiness" key={row.lead.id} onClick={()=>onLead(row.lead)}>
          <div className="dcc-readiness-top"><span><strong>{row.lead.reserva}</strong><small>{row.lead.codigo} · {row.modeLabel}</small></span><b>{row.percent}%</b></div>
          <div className="dcc-progress"><span style={{width:`${row.percent}%`}}/></div>
          <div className="dcc-readiness-bottom"><span className={row.ready?'ready':'review'}>{row.ready?'Lista para operar':'Por revisar'}</span><small>{row.note}</small></div>
        </button>)}
        {!model.upcomingReservations.length&&<Empty text="No hay reservas próximas para revisar."/>}
      </Column>
    </div>
  </section>;
}

function buildModel({
  leads,services,tasks,activities,ops,period
}:{
  leads:Lead[];services:LeadService[];tasks:CRMTask[];activities:CRMActivity[];
  ops:OpsSnapshot;period:Period;
}){
  const today=startOfDay(new Date());
  const endToday=new Date(today.getFullYear(),today.getMonth(),today.getDate(),23,59,59,999);
  const in48=new Date(Date.now()+48*3600*1000);
  const assignmentByService=new Map<string,ServiceAssignment>(
    ops.assignments.map(a=>[a.lead_service_id,a] as [string,ServiceAssignment])
  );
  const paymentsByService=new Map<string,PaymentMovement[]>();
  const costsByService=new Map<string,CostItem[]>();

  for(const p of ops.payments){
    const list=paymentsByService.get(p.lead_service_id)||[];
    list.push(p);paymentsByService.set(p.lead_service_id,list);
  }
  for(const c of ops.costs){
    const list=costsByService.get(c.lead_service_id)||[];
    list.push(c);costsByService.set(c.lead_service_id,list);
  }

  const financialServices=services.filter(s=>period==='all'||String(s.fecha_servicio||'').startsWith(period));
  const finance:any[]=[];
  const financialRows=financialServices.map(s=>{
    const lead=leads.find(l=>l.id===s.lead_id);
    const assignment=assignmentByService.get(s.id);
    const closure=ops.closures.find(x=>x.lead_service_id===s.id&&x.closure_status==='closed');
    const movements=paymentsByService.get(s.id)||[];
    const clientMoves=movements.filter(x=>x.party_type==='client');
    const supplierMoves=movements.filter(x=>x.party_type==='supplier');
    const grossSale=Number(s.precio_venta||0);
    const sale=closure?Number(closure.net_sale_snapshot||0):grossSale;
    const clientPaid=clientMoves.length
      ?clientMoves.reduce((a,x)=>a+Number(x.amount||0),0)
      :(s.estado_pago==='Pagado'?sale:0);
    const supplierCost=closure?Number(closure.supplier_cost_snapshot||0):Number(assignment?.supplier_cost||0);
    const supplierPaid=supplierMoves.length
      ?supplierMoves.reduce((a,x)=>a+Number(x.amount||0),0)
      :(assignment?.supplier_payment_status==='Pagado'?supplierCost:0);
    const extraCost=closure
      ?Number(closure.extra_cost_snapshot||0)
      :(costsByService.get(s.id)||[]).reduce((a,x)=>a+Number(x.amount||0),0);
    const totalCost=closure?Number(closure.total_cost_snapshot||0):supplierCost+extraCost;
    const clientBalance=Math.max(0,sale-clientPaid);
    const supplierBalance=Math.max(0,supplierCost-supplierPaid);
    const supplier=ops.suppliers.find(x=>x.id===assignment?.supplier_id);
    const hasCostData=Boolean(closure)||totalCost>0;

    if(clientBalance>0&&lead){
      finance.push({
        key:`c-${s.id}`,lead,title:`Cobrar a ${lead.reserva}`,
        detail:`${s.producto} · saldo ${money(clientBalance)}`,badge:'CLIENTE',amount:clientBalance
      });
    }
    if(supplierBalance>0&&lead){
      finance.push({
        key:`s-${s.id}`,lead,title:`Pago proveedor · ${lead.reserva}`,
        detail:`${s.producto} · saldo ${money(supplierBalance)}`,badge:'PROVEEDOR',amount:supplierBalance
      });
    }

    return {
      service:s,lead,assignment,supplier,closure,grossSale,sale,clientPaid,clientBalance,
      supplierCost,supplierPaid,supplierBalance,extraCost,totalCost,
      margin:closure?Number(closure.margin_snapshot||0):sale-totalCost,hasCostData
    };
  });
  finance.sort((a,b)=>b.amount-a.amount);

  const sales=financialRows.reduce((a,r)=>a+r.sale,0);
  const clientPaid=financialRows.reduce((a,r)=>a+r.clientPaid,0);
  const clientPending=financialRows.reduce((a,r)=>a+r.clientBalance,0);
  const supplierCosts=financialRows.reduce((a,r)=>a+r.supplierCost,0);
  const supplierPaid=financialRows.reduce((a,r)=>a+r.supplierPaid,0);
  const supplierPending=financialRows.reduce((a,r)=>a+r.supplierBalance,0);
  const extraCosts=financialRows.reduce((a,r)=>a+r.extraCost,0);
  const totalCosts=supplierCosts+extraCosts;
  const margin=sales-totalCosts;
  const marginPct=sales>0?margin/sales*100:0;
  const collectionPct=sales>0?clientPaid/sales*100:0;
  const costedServices=financialRows.filter(r=>r.hasCostData).length;
  const financialServiceCount=financialRows.length;
  const costCoverage=financialServiceCount?Math.round(costedServices/financialServiceCount*100):100;
  const clientPendingCount=financialRows.filter(r=>r.clientBalance>0).length;
  const closedFinancialCount=financialRows.filter(r=>r.closure).length;
  const refundPending=financialRows
    .filter(r=>r.closure?.refund_status==='Pendiente')
    .reduce((sum,r)=>sum+Number(r.closure?.refund_amount||0),0);
  const periodDescription=period==='all'?'Todo el histórico':periodLabel(period);

  const lastActivity=new Map<string,number>();
  for(const a of activities){
    if(!a.lead_id)continue;
    const ts=new Date(a.created_at).getTime();
    lastActivity.set(a.lead_id,Math.max(lastActivity.get(a.lead_id)||0,ts));
  }
  const commercial:any[]=[];
  const openTasks=tasks.filter(t=>t.status!=='Completada');
  const overdue=openTasks.filter(t=>t.due_date&&new Date(t.due_date).getTime()<Date.now());
  for(const t of overdue){
    const lead=t.lead_id?leads.find(l=>l.id===t.lead_id):undefined;
    commercial.push({
      key:`task-${t.id}`,lead,title:t.title,
      detail:`${lead?.reserva||'Tarea general'} · vencida`,
      badge:t.priority||'TAREA',score:100
    });
  }
  for(const l of leads.filter(x=>['nuevo','contactado','cotizado'].includes(String(x.estado)))){
    const ts=lastActivity.get(l.id)||new Date(l.updated_at||l.created_at).getTime();
    const days=Math.floor((Date.now()-ts)/86400000);
    const hasOpen=openTasks.some(t=>t.lead_id===l.id);
    if(days>=2&&!hasOpen){
      commercial.push({
        key:`stale-${l.id}`,lead:l,title:`Retomar ${l.reserva}`,
        detail:`${cap(l.estado)} · ${days} días sin actividad registrada`,
        badge:'SEGUIMIENTO',score:60+days
      });
    }
  }
  commercial.sort((a,b)=>b.score-a.score);

  const upcomingServices=services.filter(
    s=>s.estado_operacion!=='Cancelado'&&(!s.fecha_servicio||new Date(`${s.fecha_servicio}T23:59:00`)>=today)
  );
  const rows=upcomingServices.map(service=>
    readinessForService(service,leads.find(l=>l.id===service.lead_id),ops,paymentsByService.get(service.id)||[])
  );
  const byLead=new Map<string,any[]>();
  for(const r of rows){
    if(!r.lead)continue;
    const list=byLead.get(r.lead.id)||[];
    list.push(r);byLead.set(r.lead.id,list);
  }
  const upcomingReservations=Array.from(byLead.entries()).map(([leadId,list])=>{
    const lead=leads.find(l=>l.id===leadId)!;
    const score=list.reduce((a,x)=>a+x.score,0),target=list.reduce((a,x)=>a+x.target,0);
    const percent=target?Math.round(score/target*100):100;
    const ready=list.every(x=>x.ready);
    const modes=new Set(list.map(x=>x.mode));
    const modeLabel=modes.size>1?'Ejecución mixta'
      :list[0]?.mode==='delegated_full'?'Derivada integral'
      :list[0]?.mode==='delegated_partial'?'Derivada parcial':'Directa';
    const missing=Array.from(new Set(list.flatMap(x=>x.missing))).slice(0,3);
    const warnings=Array.from(new Set(list.flatMap(x=>x.warnings))).slice(0,2);
    return {
      lead,list,percent,ready,modeLabel,
      note:ready?(warnings.length?warnings.join(' · '):'Sin bloqueos operacionales')
        :missing.join(' · ')||'Revisión manual'
    };
  }).sort((a,b)=>nearestDate(a.list)-nearestDate(b.list));

  const next48=rows.filter(r=>r.date&&r.date>=today&&r.date<=in48);
  const todayServices=rows.filter(r=>r.date&&r.date>=today&&r.date<=endToday);
  const readyReservations=upcomingReservations.filter(x=>x.ready).length;
  const avgReadiness=upcomingReservations.length
    ?Math.round(upcomingReservations.reduce((a,x)=>a+x.percent,0)/upcomingReservations.length):100;

  const opUrgent=next48.filter(x=>!x.ready).sort(
    (a,b)=>(a.date?.getTime()||0)-(b.date?.getTime()||0)
  )[0];
  const moneyUrgent=finance[0];
  const commercialUrgent=commercial[0];
  const topPriority=opUrgent
    ?{lead:opUrgent.lead,title:`Preparar ${opUrgent.lead?.reserva||opUrgent.service.producto}`,detail:`Sale en menos de 48 h · falta ${opUrgent.missing.join(', ')}`}
    :commercialUrgent
      ?{lead:commercialUrgent.lead,title:commercialUrgent.title,detail:commercialUrgent.detail}
      :moneyUrgent
        ?{lead:moneyUrgent.lead,title:moneyUrgent.title,detail:moneyUrgent.detail}
        :null;

  const performance={
    product:topGroup(financialRows,r=>r.service.producto||'Sin producto'),
    hotel:topGroup(financialRows,r=>r.lead?.empresa_ejecuta||'Sin hotel'),
    channel:topGroup(financialRows,r=>r.lead?.canal||'Sin canal'),
    supplier:topGroup(financialRows.filter(r=>r.supplier),r=>r.supplier?.name||'Proveedor')
  };

  const headline=topPriority
    ?`Hay una acción prioritaria: ${topPriority.title}. ${costCoverage<100&&sales>0?'El margen del periodo todavía es provisional por costos faltantes.':'El resto del panel está ordenado por urgencia.'}`
    :costCoverage<100&&sales>0
      ?'La operación no presenta bloqueos críticos, pero el margen financiero todavía es provisional por costos faltantes.'
      :'No detecté bloqueos críticos con los datos actuales.';

  return {
    sales,clientPaid,clientPending,clientPendingCount,collectionPct,
    supplierCosts,supplierPaid,supplierPending,extraCosts,totalCosts,
    margin,marginPct,costedServices,financialServiceCount,costCoverage,
    closedFinancialCount,refundPending,
    finance,commercial,upcomingReservations,next48,todayServices,
    readyReservations,avgReadiness,topPriority,headline,
    overdueCount:overdue.length,periodDescription,performance
  };
}

function readinessForService(
  service:LeadService,lead:Lead|undefined,ops:OpsSnapshot,movements:PaymentMovement[]
){
  const assignment=ops.assignments.find(a=>a.lead_service_id===service.id);
  const passengers=lead?ops.passengers.filter(p=>p.lead_id===lead.id):[];
  const risk=lead?ops.documents.find(d=>d.lead_id===lead.id&&d.document_type==='risk_sheet'):undefined;
  const mode=String(assignment?.operation_mode||(assignment?.supplier_id?'delegated_full':'direct'));
  const coverage:CoverageKey[]=mode==='delegated_full'
    ?fullCoverage
    :(Array.isArray(assignment?.supplier_coverage)?assignment!.supplier_coverage as CoverageKey[]:[]);
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
  const labels:Record<string,string>={
    date:'fecha',passengers:'pasajeros',risk:'hoja de riesgo',
    supplier:'proveedor',guide:'guía',driver:'conductor',vehicle:'vehículo'
  };
  const missing=required.filter(k=>!checks[k]).map(k=>labels[k]||k);
  const warnings:string[]=[];
  if(delegated&&Number(assignment?.supplier_cost||0)<=0)warnings.push('precio de adquisición pendiente');
  if(!assignment?.pickup_time)warnings.push('pickup por confirmar');
  const sale=Number(service.precio_venta||0);
  const clientMoves=movements.filter(x=>x.party_type==='client');
  const paid=clientMoves.length
    ?clientMoves.reduce((a,x)=>a+Number(x.amount||0),0)
    :(service.estado_pago==='Pagado'?sale:0);
  if(sale>paid)warnings.push('saldo cliente pendiente');
  const supplierCost=Number(assignment?.supplier_cost||0);
  const supplierMoves=movements.filter(x=>x.party_type==='supplier');
  const supplierPaid=supplierMoves.length
    ?supplierMoves.reduce((a,x)=>a+Number(x.amount||0),0)
    :(assignment?.supplier_payment_status==='Pagado'?supplierCost:0);
  if(supplierCost>supplierPaid)warnings.push('pago proveedor pendiente');
  const date=service.fecha_servicio?new Date(`${service.fecha_servicio}T12:00:00`):null;
  return {service,lead,assignment,mode,score,target,ready,missing,warnings,date};
}

function topGroup(rows:any[],key:(r:any)=>string){
  if(!rows.length)return null;
  const map=new Map<string,{name:string;sales:number;costs:number;margin:number;count:number}>();
  for(const row of rows){
    const name=key(row);
    const item=map.get(name)||{name,sales:0,costs:0,margin:0,count:0};
    item.sales+=Number(row.sale||0);
    item.costs+=Number(row.totalCost||0);
    item.margin=item.sales-item.costs;
    item.count+=1;
    map.set(name,item);
  }
  return [...map.values()].sort((a,b)=>b.sales-a.sales)[0]||null;
}

function PerformanceCard({icon,label,item}:{icon:React.ReactNode;label:string;item:any}){
  return <article className="dcc-performance-card">
    <span className="dcc-performance-icon">{icon}</span>
    <div>
      <small>{label}</small>
      <strong>{item?.name||'Sin datos'}</strong>
      {item?<span>{money(item.sales)} venta · {money(item.margin)} margen · {item.count} servicio(s)</span>:<span>Sin movimientos en el periodo</span>}
    </div>
  </article>;
}

function ExecMetric({
  icon,label,value,detail,onClick,good,warn
}:{
  icon:React.ReactNode;label:string;value:string;detail?:string;onClick?:()=>void;good?:boolean;warn?:boolean;
}){
  return <button className={`dcc-exec-metric ${good?'good':''} ${warn?'warn':''}`} onClick={onClick}>
    <span className="dcc-exec-icon">{icon}</span>
    <span><small>{label}</small><strong>{value}</strong>{detail&&<em>{detail}</em>}</span>
  </button>;
}

function nearestDate(list:any[]){
  const dates=list.map(x=>x.date?.getTime()).filter(Boolean);
  return dates.length?Math.min(...dates):Number.MAX_SAFE_INTEGER;
}
function Column({title,subtitle,icon,children}:{title:string;subtitle:string;icon:React.ReactNode;children:React.ReactNode}){
  return <section className="dcc-column"><header><span>{icon}</span><div><strong>{title}</strong><small>{subtitle}</small></div></header><div className="dcc-column-body">{children}</div></section>;
}
function ActionRow({title,detail,badge,onClick}:{title:string;detail:string;badge?:string;onClick?:()=>void}){
  return <button className="dcc-action-row" onClick={onClick}><span><strong>{title}</strong><small>{detail}</small></span>{badge&&<em>{badge}</em>}<ArrowRight size={14}/></button>;
}
function Metric({icon,label,value,detail,action,onClick}:{icon:React.ReactNode;label:string;value:string;detail?:string;action:string;onClick:()=>void}){
  return <button className="dcc-metric" onClick={onClick}><span className="dcc-metric-icon">{icon}</span><span><small>{label}</small><strong>{value}</strong>{detail&&<em>{detail}</em>}</span><b>{action}</b></button>;
}
function Empty({text}:{text:string}){
  return <div className="dcc-empty"><CheckCircle2 size={16}/>{text}</div>;
}

const startOfDay=(d:Date)=>new Date(d.getFullYear(),d.getMonth(),d.getDate());
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const pct=(n:any)=>`${new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(Number(n||0))}%`;
const cap=(s:any)=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
const monthKey=(d:Date)=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
function periodLabel(value:string){
  if(value==='all')return 'Todo el histórico';
  return new Date(`${value}-01T12:00:00`).toLocaleDateString('es-CL',{month:'long',year:'numeric'});
}
function todayLabel(){
  return new Intl.DateTimeFormat('es-CL',{weekday:'long',day:'numeric',month:'long'}).format(new Date()).replace(/^./,x=>x.toUpperCase());
}
