import React,{useEffect,useMemo,useState} from 'react';
import {Building2,CheckCircle2,CircleDollarSign,Clock3,RefreshCw,TrendingUp,WalletCards} from 'lucide-react';
import type {Lead,LeadService,Supplier,ServiceAssignment} from '../types';
import {assertSupabase} from '../lib/supabase';
import {updateService} from '../lib/api';

type CostItem={
  id:string;
  lead_service_id:string;
  category:string;
  description?:string|null;
  amount:number;
  supplier_id?:string|null;
};

type Mode='payments'|'reports';

export default function FinancialWorkspace({
  mode,leads,services,refresh,userRole
}:{
  mode:Mode;
  leads:Lead[];
  services:LeadService[];
  refresh:()=>void|Promise<void>;
  userRole:string;
}){
  const [assignments,setAssignments]=useState<ServiceAssignment[]>([]);
  const [costItems,setCostItems]=useState<CostItem[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [loading,setLoading]=useState(true);
  const [month,setMonth]=useState('all');
  const canEdit=userRole!=='viewer';

  const loadFinance=async()=>{
    setLoading(true);
    try{
      const db=assertSupabase();
      const [a,c,s]=await Promise.all([
        db.from('service_assignments').select('*'),
        db.from('service_cost_items').select('*'),
        db.from('suppliers').select('*')
      ]);
      if(a.error)throw a.error;
      if(c.error)throw c.error;
      if(s.error)throw s.error;
      setAssignments((a.data||[]) as ServiceAssignment[]);
      setCostItems((c.data||[]) as CostItem[]);
      setSuppliers((s.data||[]) as Supplier[]);
    }catch(e:any){
      alert(e?.message||'No se pudo cargar la información financiera.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{loadFinance()},[]);

  const months=useMemo(()=>{
    return Array.from(new Set(
      services
        .map(s=>String(s.fecha_servicio||'').slice(0,7))
        .filter(x=>/^\d{4}-\d{2}$/.test(x))
    )).sort().reverse();
  },[services]);

  const rows=useMemo(()=>{
    const assignmentByService=new Map<string,ServiceAssignment>(assignments.map(a=>[a.lead_service_id,a] as [string,ServiceAssignment]));
    const costsByService=new Map<string,CostItem[]>();
    for(const item of costItems){
      const current=costsByService.get(item.lead_service_id)||[];
      current.push(item);
      costsByService.set(item.lead_service_id,current);
    }

    return services
      .filter(s=>month==='all'||String(s.fecha_servicio||'').startsWith(month))
      .map(service=>{
        const lead=leads.find(l=>l.id===service.lead_id);
        const assignment=assignmentByService.get(service.id);
        const extras=costsByService.get(service.id)||[];
        const sale=Number(service.precio_venta||0);
        const supplierCost=Number(assignment?.supplier_cost||0);
        const extraCost=extras.reduce((sum,x)=>sum+Number(x.amount||0),0);
        const totalCost=supplierCost+extraCost;
        const margin=sale-totalCost;
        const marginPct=sale>0?(margin/sale)*100:0;
        const supplier=suppliers.find(x=>x.id===assignment?.supplier_id);
        return {
          service,lead,assignment,extras,sale,supplierCost,extraCost,totalCost,margin,marginPct,supplier,
          hasCostData:supplierCost>0||extras.length>0
        };
      });
  },[services,leads,assignments,costItems,suppliers,month]);

  const totals=useMemo(()=>{
    const sales=rows.reduce((s,r)=>s+r.sale,0);
    const paid=rows.filter(r=>r.service.estado_pago==='Pagado').reduce((s,r)=>s+r.sale,0);
    const supplierCosts=rows.reduce((s,r)=>s+r.supplierCost,0);
    const extras=rows.reduce((s,r)=>s+r.extraCost,0);
    const costs=supplierCosts+extras;
    const margin=sales-costs;
    const supplierPending=rows
      .filter(r=>r.assignment&&r.assignment.supplier_payment_status!=='Pagado')
      .reduce((s,r)=>s+r.supplierCost,0);
    const coverage=rows.length?Math.round(rows.filter(r=>r.hasCostData).length/rows.length*100):0;
    return {
      sales,paid,clientPending:sales-paid,supplierCosts,extras,costs,margin,
      marginPct:sales>0?margin/sales*100:0,
      supplierPending,coverage
    };
  },[rows]);

  const setSupplierPayment=async(assignment:ServiceAssignment,status:string)=>{
    if(!canEdit)return;
    const {error}=await assertSupabase()
      .from('service_assignments')
      .update({
        supplier_payment_status:status,
        supplier_payment_date:status==='Pagado'?new Date().toISOString():null
      })
      .eq('id',assignment.id);
    if(error)return alert(error.message);
    await loadFinance();
  };

  const setClientPayment=async(service:LeadService,status:string)=>{
    if(!canEdit)return;
    try{
      await updateService(service.id,{estado_pago:status});
      await refresh();
    }catch(e:any){
      alert(e?.message||'No se pudo actualizar el pago del cliente.');
    }
  };

  if(loading)return <div className="loading-card">Cargando control financiero…</div>;

  return <div className="view-stack">
    <section className="surface-card" style={{padding:18}}>
      <div style={{display:'flex',justifyContent:'space-between',gap:16,alignItems:'center',flexWrap:'wrap'}}>
        <div>
          <span className="eyebrow">{mode==='payments'?'CONTROL FINANCIERO':'RENTABILIDAD'}</span>
          <h2 style={{margin:'5px 0 3px'}}>{mode==='payments'?'Cobros y pagos':'Resultado del negocio'}</h2>
          <p style={{margin:0,fontSize:11,color:'#6e685f'}}>
            {mode==='payments'
              ?'Separa lo que paga el cliente de lo que debemos pagar a proveedores.'
              :'Margen calculado únicamente con los costos que están registrados en el CRM.'}
          </p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <select value={month} onChange={e=>setMonth(e.target.value)} style={{minWidth:150}}>
            <option value="all">Todos los meses</option>
            {months.map(m=><option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
          <button className="icon-button" onClick={loadFinance} title="Actualizar finanzas"><RefreshCw size={16}/></button>
        </div>
      </div>
    </section>

    {mode==='payments'
      ?<PaymentsMode rows={rows} totals={totals} canEdit={canEdit} setClientPayment={setClientPayment} setSupplierPayment={setSupplierPayment}/>
      :<ReportsMode rows={rows} totals={totals}/>}
  </div>;
}

function PaymentsMode({rows,totals,canEdit,setClientPayment,setSupplierPayment}:any){
  const supplierRows=rows.filter((r:any)=>r.assignment&&(r.assignment.supplier_id||r.supplierCost>0));

  return <>
    <section style={metricGrid}>
      <Metric label="Venta registrada" value={money(totals.sales)} icon={<CircleDollarSign/>}/>
      <Metric label="Cliente pagado" value={money(totals.paid)} detail="Servicios marcados Pagado" icon={<CheckCircle2/>} good/>
      <Metric label="Por cobrar" value={money(totals.clientPending)} detail="No considera abonos parciales" icon={<Clock3/>} warn/>
      <Metric label="Por pagar proveedores" value={money(totals.supplierPending)} icon={<WalletCards/>} warn={totals.supplierPending>0}/>
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Clientes" subtitle="Cobro por cada experiencia. El estado Parcial no descuenta un monto porque el CRM aún no registra abonos individuales."/>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Experiencia</th><th>Venta</th><th>Estado cliente</th></tr></thead>
        <tbody>{rows.map((r:any)=><tr key={r.service.id}>
          <td>{dateFmt(r.service.fecha_servicio)}</td>
          <td><strong>{r.lead?.reserva||'—'}</strong><span>{r.lead?.codigo||''}</span></td>
          <td>{r.service.producto}</td>
          <td><strong>{money(r.sale)}</strong></td>
          <td><select disabled={!canEdit} value={r.service.estado_pago} onChange={e=>setClientPayment(r.service,e.target.value)}>
            {['Pendiente','Parcial','Pagado','Reembolsado'].map(x=><option key={x}>{x}</option>)}
          </select></td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Proveedores" subtitle={`Costo principal registrado: ${money(totals.supplierCosts)} · Otros costos del tour: ${money(totals.extras)}`}/>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Cliente / experiencia</th><th>Costo proveedor</th><th>Estado pago</th></tr></thead>
        <tbody>{supplierRows.map((r:any)=><tr key={r.assignment.id}>
          <td>{dateFmt(r.service.fecha_servicio)}</td>
          <td><strong>{r.supplier?.name||'Proveedor sin nombre'}</strong></td>
          <td><strong>{r.lead?.reserva||'—'}</strong><span>{r.service.producto}</span></td>
          <td>{money(r.supplierCost)}</td>
          <td><select disabled={!canEdit} value={r.assignment.supplier_payment_status||'Pendiente'} onChange={e=>setSupplierPayment(r.assignment,e.target.value)}>
            {['Pendiente','Programado','Pagado','Disputado'].map(x=><option key={x}>{x}</option>)}
          </select></td>
        </tr>)}</tbody>
      </table></div>
      {!supplierRows.length&&<div className="empty-state" style={{margin:18}}>Todavía no hay costos de proveedor cargados.</div>}
    </section>
  </>;
}

function ReportsMode({rows,totals}:any){
  const byProduct=groupRows(rows,(r:any)=>r.service.producto||'Sin producto');
  const byHotel=groupRows(rows,(r:any)=>r.lead?.empresa_ejecuta||'Sin hotel');
  const bySupplier=groupRows(
    rows.filter((r:any)=>r.assignment?.supplier_id),
    (r:any)=>r.supplier?.name||'Proveedor sin nombre'
  );

  return <>
    <section style={metricGrid}>
      <Metric label="Ventas" value={money(totals.sales)} icon={<CircleDollarSign/>}/>
      <Metric label="Costos registrados" value={money(totals.costs)} detail={`${money(totals.supplierCosts)} proveedor + ${money(totals.extras)} extras`} icon={<WalletCards/>}/>
      <Metric label="Margen registrado" value={money(totals.margin)} detail={`${pct(totals.marginPct)} sobre venta`} icon={<TrendingUp/>} good={totals.margin>=0} warn={totals.margin<0}/>
      <Metric label="Cobertura de costos" value={`${totals.coverage}%`} detail="Tours con al menos un costo cargado" icon={<Building2/>} warn={totals.coverage<100}/>
    </section>

    {totals.coverage<100&&<div className="error-banner" style={{background:'#fff7e8',color:'#76521e'}}>
      <Clock3 size={17}/>
      <span><b>Margen provisional.</b> Hay servicios sin costos cargados; mientras falten, el margen puede verse artificialmente alto.</span>
    </div>}

    <section className="content-grid two">
      <SummaryTable title="Rentabilidad por producto" rows={byProduct}/>
      <SummaryTable title="Rentabilidad por hotel / canal" rows={byHotel}/>
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Cruce por proveedor" subtitle="Venta de los servicios asignados a cada proveedor versus costos registrados en esos servicios."/>
      <SummaryTableBody rows={bySupplier}/>
      {!bySupplier.length&&<div className="empty-state" style={{margin:18}}>Todavía no hay suficiente información de proveedores para comparar.</div>}
    </section>
  </>;
}

function SummaryTable({title,rows}:{title:string;rows:any[]}){
  return <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
    <BlockHead title={title} subtitle="Venta, costo y margen registrado"/>
    <SummaryTableBody rows={rows}/>
  </section>;
}

function SummaryTableBody({rows}:{rows:any[]}){
  return <div className="table-wrap"><table>
    <thead><tr><th>Grupo</th><th>Servicios</th><th>Venta</th><th>Costo</th><th>Margen</th><th>%</th></tr></thead>
    <tbody>{rows.slice(0,15).map(r=><tr key={r.name}>
      <td><strong>{r.name}</strong></td>
      <td>{r.count}</td>
      <td>{money(r.sales)}</td>
      <td>{money(r.costs)}</td>
      <td><strong>{money(r.margin)}</strong></td>
      <td>{pct(r.marginPct)}</td>
    </tr>)}</tbody>
  </table></div>;
}

function groupRows(rows:any[],key:(r:any)=>string){
  const map=new Map<string,{name:string;count:number;sales:number;costs:number;margin:number;marginPct:number}>();
  for(const r of rows){
    const name=key(r);
    const current=map.get(name)||{name,count:0,sales:0,costs:0,margin:0,marginPct:0};
    current.count+=1;
    current.sales+=Number(r.sale||0);
    current.costs+=Number(r.totalCost||0);
    current.margin=current.sales-current.costs;
    current.marginPct=current.sales>0?current.margin/current.sales*100:0;
    map.set(name,current);
  }
  return [...map.values()].sort((a,b)=>b.sales-a.sales);
}

function Metric({label,value,detail,icon,good,warn}:{label:string;value:string;detail?:string;icon:React.ReactNode;good?:boolean;warn?:boolean}){
  const color=warn?'#8d5b17':good?'#267044':'#111';
  return <div className="surface-card" style={{padding:16,display:'grid',gridTemplateColumns:'38px 1fr',gap:10,alignItems:'center'}}>
    <div style={{width:36,height:36,border:'1px solid #cfc8bd',borderRadius:'50%',display:'grid',placeItems:'center',color}}>{icon}</div>
    <div><span style={{display:'block',fontSize:9,textTransform:'uppercase',letterSpacing:'.08em',color:'#6e685f'}}>{label}</span><strong style={{fontSize:23,lineHeight:1.15,color}}>{value}</strong>{detail&&<small style={{display:'block',fontSize:9,color:'#6e685f',marginTop:3}}>{detail}</small>}</div>
  </div>;
}

function BlockHead({title,subtitle}:{title:string;subtitle:string}){
  return <div style={{padding:'17px 19px',borderBottom:'1px solid #d7d0c5'}}><h2 style={{margin:0,fontSize:20}}>{title}</h2><p style={{margin:'4px 0 0',fontSize:10,color:'#6e685f'}}>{subtitle}</p></div>;
}

const metricGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const pct=(n:any)=>`${new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(Number(n||0))}%`;
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
const monthLabel=(m:string)=>new Date(`${m}-01T12:00:00`).toLocaleDateString('es-CL',{month:'long',year:'numeric'});
