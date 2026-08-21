import React,{useEffect,useMemo,useState} from 'react';
import {Building2,CheckCircle2,CircleDollarSign,Clock3,Pencil,Plus,RefreshCw,Trash2,TrendingUp,WalletCards,X} from 'lucide-react';
import type {Lead,LeadService,Supplier,ServiceAssignment} from '../types';
import {assertSupabase} from '../lib/supabase';
import {updateService} from '../lib/api';
import HotelPartnerReport from './HotelPartnerReport';

type CostItem={
  id:string;
  lead_service_id:string;
  category:string;
  description?:string|null;
  amount:number;
  supplier_id?:string|null;
};

type PaymentMovement={
  id:string;
  lead_service_id:string;
  party_type:'client'|'supplier';
  supplier_id?:string|null;
  amount:number;
  currency:string;
  payment_method?:string|null;
  paid_at:string;
  reference?:string|null;
  notes?:string|null;
  created_at:string;
};

type Mode='payments'|'reports';
type Party='client'|'supplier';

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
  const [payments,setPayments]=useState<PaymentMovement[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [loading,setLoading]=useState(true);
  const [month,setMonth]=useState('all');
  const [target,setTarget]=useState<any|null>(null);
  const [targetParty,setTargetParty]=useState<Party>('client');
  const canEdit=userRole!=='viewer';
  const canDelete=['admin','manager'].includes(userRole);

  const loadFinance=async()=>{
    setLoading(true);
    try{
      const db=assertSupabase();
      const [a,c,p,s]=await Promise.all([
        db.from('service_assignments').select('*'),
        db.from('service_cost_items').select('*'),
        db.from('payment_movements').select('*').order('paid_at',{ascending:false}),
        db.from('suppliers').select('*')
      ]);
      if(a.error)throw a.error;
      if(c.error)throw c.error;
      if(p.error)throw p.error;
      if(s.error)throw s.error;
      setAssignments((a.data||[]) as ServiceAssignment[]);
      setCostItems((c.data||[]) as CostItem[]);
      setPayments((p.data||[]) as PaymentMovement[]);
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
    const assignmentByService=new Map<string,ServiceAssignment>(
      assignments.map(a=>[a.lead_service_id,a] as [string,ServiceAssignment])
    );
    const costsByService=new Map<string,CostItem[]>();
    const paymentsByService=new Map<string,PaymentMovement[]>();

    for(const item of costItems){
      const current=costsByService.get(item.lead_service_id)||[];
      current.push(item);
      costsByService.set(item.lead_service_id,current);
    }
    for(const movement of payments){
      const current=paymentsByService.get(movement.lead_service_id)||[];
      current.push(movement);
      paymentsByService.set(movement.lead_service_id,current);
    }

    return services
      .filter(s=>month==='all'||String(s.fecha_servicio||'').startsWith(month))
      .map(service=>{
        const lead=leads.find(l=>l.id===service.lead_id);
        const assignment=assignmentByService.get(service.id);
        const extras=costsByService.get(service.id)||[];
        const movementList=paymentsByService.get(service.id)||[];
        const clientMovements=movementList.filter(x=>x.party_type==='client');
        const supplierMovements=movementList.filter(x=>x.party_type==='supplier');

        const sale=Number(service.precio_venta||0);
        const supplierCost=Number(assignment?.supplier_cost||0);
        const extraCost=extras.reduce((sum,x)=>sum+Number(x.amount||0),0);
        const totalCost=supplierCost+extraCost;
        const margin=sale-totalCost;
        const marginPct=sale>0?(margin/sale)*100:0;
        const supplier=suppliers.find(x=>x.id===assignment?.supplier_id);

        const quantifiedClientPaid=clientMovements.reduce((sum,x)=>sum+Number(x.amount||0),0);
        const clientPaid=clientMovements.length
          ? quantifiedClientPaid
          : service.estado_pago==='Pagado'?sale:0;
        const clientBalance=Math.max(0,sale-clientPaid);

        const quantifiedSupplierPaid=supplierMovements.reduce((sum,x)=>sum+Number(x.amount||0),0);
        const supplierPaid=supplierMovements.length
          ? quantifiedSupplierPaid
          : assignment?.supplier_payment_status==='Pagado'?supplierCost:0;
        const supplierBalance=Math.max(0,supplierCost-supplierPaid);

        return {
          service,lead,assignment,extras,sale,supplierCost,extraCost,totalCost,margin,marginPct,supplier,
          hasCostData:supplierCost>0||extras.length>0,
          clientMovements,supplierMovements,clientPaid,clientBalance,supplierPaid,supplierBalance,
          clientLegacyPaid:clientMovements.length===0&&service.estado_pago==='Pagado',
          supplierLegacyPaid:supplierMovements.length===0&&assignment?.supplier_payment_status==='Pagado',
          unquantifiedPartial:clientMovements.length===0&&service.estado_pago==='Parcial'
        };
      });
  },[services,leads,assignments,costItems,payments,suppliers,month]);

  const totals=useMemo(()=>{
    const sales=rows.reduce((s,r)=>s+r.sale,0);
    const paid=rows.reduce((s,r)=>s+r.clientPaid,0);
    const supplierCosts=rows.reduce((s,r)=>s+r.supplierCost,0);
    const supplierPaid=rows.reduce((s,r)=>s+r.supplierPaid,0);
    const extras=rows.reduce((s,r)=>s+r.extraCost,0);
    const costs=supplierCosts+extras;
    const margin=sales-costs;
    const coverage=rows.length?Math.round(rows.filter(r=>r.hasCostData).length/rows.length*100):0;
    return {
      sales,paid,clientPending:rows.reduce((s,r)=>s+r.clientBalance,0),
      supplierCosts,supplierPaid,supplierPending:rows.reduce((s,r)=>s+r.supplierBalance,0),
      extras,costs,margin,marginPct:sales>0?margin/sales*100:0,coverage,
      unquantifiedPartials:rows.filter(r=>r.unquantifiedPartial).length
    };
  },[rows]);

  const openPayment=(row:any,party:Party)=>{
    setTarget(row);
    setTargetParty(party);
  };

  const syncStatus=async(serviceId:string,party:Party)=>{
    const db=assertSupabase();
    const {data,error}=await db.from('payment_movements')
      .select('amount')
      .eq('lead_service_id',serviceId)
      .eq('party_type',party);
    if(error)throw error;
    const total=(data||[]).reduce((sum:any,x:any)=>sum+Number(x.amount||0),0);
    const row=rows.find(r=>r.service.id===serviceId);
    if(!row)return;

    if(party==='client'){
      const status=total<=0?'Pendiente':total>=row.sale?'Pagado':'Parcial';
      await updateService(serviceId,{estado_pago:status});
    }else if(row.assignment){
      const status=total<=0?'Pendiente':total>=row.supplierCost?'Pagado':'Programado';
      const {error:updateError}=await db.from('service_assignments')
        .update({
          supplier_payment_status:status,
          supplier_payment_date:status==='Pagado'?new Date().toISOString():null
        })
        .eq('id',row.assignment.id);
      if(updateError)throw updateError;
    }
  };

  const afterMovementChange=async(serviceId:string,party:Party)=>{
    await syncStatus(serviceId,party);
    await loadFinance();
    await refresh();
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
              ?'Registra abonos reales de clientes y pagos a proveedores sin perder los estados históricos.'
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
      ?<PaymentsMode rows={rows} totals={totals} canEdit={canEdit} onPayment={openPayment}/>
      :<>
        <ReportsMode rows={rows} totals={totals}/>
        <HotelPartnerReport rows={rows} leads={leads} month={month}/>
      </>}

    {target&&<PaymentModal
      row={target}
      party={targetParty}
      canEdit={canEdit}
      canDelete={canDelete}
      onClose={()=>setTarget(null)}
      onChanged={afterMovementChange}
    />}
  </div>;
}

function PaymentsMode({rows,totals,canEdit,onPayment}:any){
  const supplierRows=rows.filter((r:any)=>r.assignment&&(r.assignment.supplier_id||r.supplierCost>0));

  return <>
    <section style={metricGrid}>
      <Metric label="Venta registrada" value={money(totals.sales)} icon={<CircleDollarSign/>}/>
      <Metric label="Cobrado clientes" value={money(totals.paid)} detail="Movimientos + estados históricos pagados" icon={<CheckCircle2/>} good/>
      <Metric label="Por cobrar" value={money(totals.clientPending)} icon={<Clock3/>} warn={totals.clientPending>0}/>
      <Metric label="Por pagar proveedores" value={money(totals.supplierPending)} detail={`${money(totals.supplierPaid)} ya pagado`} icon={<WalletCards/>} warn={totals.supplierPending>0}/>
    </section>

    {totals.unquantifiedPartials>0&&<div className="error-banner" style={{background:'#fff7e8',color:'#76521e'}}>
      <Clock3 size={17}/>
      <span>Hay <b>{totals.unquantifiedPartials}</b> servicio(s) marcados Parcial sin monto de abono. Registra sus movimientos para conocer el saldo real.</span>
    </div>}

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Clientes" subtitle="Cada abono queda con fecha, medio de pago, referencia y monto."/>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Cliente</th><th>Experiencia</th><th>Venta</th><th>Cobrado</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
        <tbody>{rows.map((r:any)=><tr key={r.service.id}>
          <td>{dateFmt(r.service.fecha_servicio)}</td>
          <td><strong>{r.lead?.reserva||'—'}</strong><span>{r.lead?.codigo||''}</span></td>
          <td>{r.service.producto}</td>
          <td>{money(r.sale)}</td>
          <td><strong>{money(r.clientPaid)}</strong>{r.clientLegacyPaid&&<span>Estado histórico</span>}</td>
          <td>{money(r.clientBalance)}</td>
          <td><span className={r.service.estado_pago==='Pagado'?'status-badge confirmado':'status-badge neutral'}>{r.service.estado_pago}</span></td>
          <td>{canEdit&&<button className="operation-button" onClick={()=>onPayment(r,'client')}><Plus size={13}/> Abono</button>}</td>
        </tr>)}</tbody>
      </table></div>
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Proveedores" subtitle={`Costo proveedor: ${money(totals.supplierCosts)} · Pagado: ${money(totals.supplierPaid)} · Pendiente: ${money(totals.supplierPending)}`}/>
      <div className="table-wrap"><table>
        <thead><tr><th>Fecha</th><th>Proveedor</th><th>Cliente / experiencia</th><th>Costo</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th></th></tr></thead>
        <tbody>{supplierRows.map((r:any)=><tr key={r.assignment.id}>
          <td>{dateFmt(r.service.fecha_servicio)}</td>
          <td><strong>{r.supplier?.name||'Proveedor sin nombre'}</strong></td>
          <td><strong>{r.lead?.reserva||'—'}</strong><span>{r.service.producto}</span></td>
          <td>{money(r.supplierCost)}</td>
          <td><strong>{money(r.supplierPaid)}</strong>{r.supplierLegacyPaid&&<span>Estado histórico</span>}</td>
          <td>{money(r.supplierBalance)}</td>
          <td><span className={r.assignment.supplier_payment_status==='Pagado'?'status-badge confirmado':'status-badge neutral'}>{r.assignment.supplier_payment_status||'Pendiente'}</span></td>
          <td>{canEdit&&<button className="operation-button" onClick={()=>onPayment(r,'supplier')}><Plus size={13}/> Pago</button>}</td>
        </tr>)}</tbody>
      </table></div>
      {!supplierRows.length&&<div className="empty-state" style={{margin:18}}>Todavía no hay costos de proveedor cargados.</div>}
    </section>
  </>;
}

function ReportsMode({rows,totals}:any){
  const byProduct=groupRows(rows,(r:any)=>r.service.producto||'Sin producto');
  const byChannel=groupRows(rows,(r:any)=>r.lead?.canal||'Sin canal');
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
      <SummaryTable title="Rentabilidad por canal" rows={byChannel}/>
    </section>

    <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
      <BlockHead title="Cruce por proveedor" subtitle="Venta de los servicios asignados a cada proveedor versus costos registrados en esos servicios."/>
      <SummaryTableBody rows={bySupplier}/>
      {!bySupplier.length&&<div className="empty-state" style={{margin:18}}>Todavía no hay suficiente información de proveedores para comparar.</div>}
    </section>
  </>;
}

function PaymentModal({
  row,party,canEdit,canDelete,onClose,onChanged
}:{
  row:any;
  party:Party;
  canEdit:boolean;
  canDelete:boolean;
  onClose:()=>void;
  onChanged:(serviceId:string,party:Party)=>Promise<void>;
}){
  const movements:PaymentMovement[]=party==='client'?row.clientMovements:row.supplierMovements;
  const total=party==='client'?row.sale:row.supplierCost;
  const paid=party==='client'?row.clientPaid:row.supplierPaid;
  const balance=party==='client'?row.clientBalance:row.supplierBalance;
  const [editingId,setEditingId]=useState('');
  const [amount,setAmount]=useState('');
  const [method,setMethod]=useState('Transferencia');
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [reference,setReference]=useState('');
  const [notes,setNotes]=useState('');
  const [saving,setSaving]=useState(false);

  const reset=()=>{
    setEditingId('');
    setAmount('');
    setMethod('Transferencia');
    setDate(new Date().toISOString().slice(0,10));
    setReference('');
    setNotes('');
  };

  const edit=(m:PaymentMovement)=>{
    setEditingId(m.id);
    setAmount(String(m.amount));
    setMethod(m.payment_method||'Transferencia');
    setDate(String(m.paid_at||'').slice(0,10)||new Date().toISOString().slice(0,10));
    setReference(m.reference||'');
    setNotes(m.notes||'');
  };

  const save=async()=>{
    const value=Number(amount.replace(/\./g,'').replace(',','.'));
    if(!Number.isFinite(value)||value<=0)return alert('Ingresa un monto válido.');
    setSaving(true);
    try{
      const db=assertSupabase();
      const payload={
        lead_service_id:row.service.id,
        party_type:party,
        supplier_id:party==='supplier'?(row.assignment?.supplier_id||null):null,
        amount:value,
        currency:'CLP',
        payment_method:method||null,
        paid_at:new Date(`${date}T12:00:00`).toISOString(),
        reference:reference||null,
        notes:notes||null,
        updated_at:new Date().toISOString()
      };
      if(editingId){
        const {error}=await db.from('payment_movements').update(payload).eq('id',editingId);
        if(error)throw error;
      }else{
        const {error}=await db.from('payment_movements').insert(payload);
        if(error)throw error;
      }
      await onChanged(row.service.id,party);
      reset();
      onClose();
    }catch(e:any){
      alert(e?.message||'No se pudo guardar el movimiento.');
    }finally{
      setSaving(false);
    }
  };

  const remove=async(id:string)=>{
    if(!confirm('¿Eliminar este movimiento? El saldo se recalculará.'))return;
    const {error}=await assertSupabase().from('payment_movements').delete().eq('id',id);
    if(error)return alert(error.message);
    await onChanged(row.service.id,party);
    onClose();
  };

  return <div className="modal-backdrop" onMouseDown={onClose}>
    <section className="modal-card" style={{maxWidth:760}} onMouseDown={e=>e.stopPropagation()}>
      <header>
        <div>
          <span className="eyebrow">{party==='client'?'COBRO CLIENTE':'PAGO PROVEEDOR'}</span>
          <h2>{row.service.producto}</h2>
          <p>{row.lead?.reserva||'Cliente'} · {party==='supplier'?(row.supplier?.name||'Proveedor'):'Abonos del servicio'}</p>
        </div>
        <button className="icon-button" onClick={onClose}><X/></button>
      </header>

      <section style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,margin:'14px 0'}}>
        <MiniStat label={party==='client'?'Total venta':'Costo proveedor'} value={money(total)}/>
        <MiniStat label="Registrado pagado" value={money(paid)}/>
        <MiniStat label="Saldo" value={money(balance)}/>
      </section>

      {movements.length>0&&<section style={{border:'1px solid #d7d0c5',borderRadius:10,overflow:'hidden',marginBottom:14}}>
        {movements.map(m=><div key={m.id} style={{display:'grid',gridTemplateColumns:'95px 1fr 130px auto',gap:10,alignItems:'center',padding:'10px 12px',borderBottom:'1px solid #e6e0d7'}}>
          <span style={{fontSize:10}}>{dateFmtTime(m.paid_at)}</span>
          <div><strong style={{display:'block',fontSize:11}}>{m.payment_method||'Sin medio'}</strong><small>{m.reference||m.notes||'Sin referencia'}</small></div>
          <strong>{money(m.amount)}</strong>
          <div style={{display:'flex',gap:5}}>
            {canEdit&&<button className="icon-button" onClick={()=>edit(m)} title="Editar"><Pencil size={14}/></button>}
            {canDelete&&<button className="icon-button" onClick={()=>remove(m.id)} title="Eliminar"><Trash2 size={14}/></button>}
          </div>
        </div>)}
      </section>}

      {canEdit&&<section style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
        <label style={fieldStyle}><span style={labelStyle}>Monto *</span><input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.,]/g,''))} placeholder={balance?String(Math.round(balance)):'0'}/></label>
        <label style={fieldStyle}><span style={labelStyle}>Medio de pago</span><select value={method} onChange={e=>setMethod(e.target.value)}>{['Transferencia','Pix','Efectivo','Tarjeta','Wise','Otro'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label style={fieldStyle}><span style={labelStyle}>Fecha</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
        <label style={fieldStyle}><span style={labelStyle}>Referencia</span><input value={reference} onChange={e=>setReference(e.target.value)} placeholder="N° operación / comprobante"/></label>
        <label style={{...fieldStyle,gridColumn:'1 / -1'}}><span style={labelStyle}>Notas</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></label>
        <div style={{gridColumn:'1 / -1',display:'flex',justifyContent:'flex-end',gap:8}}>
          {editingId&&<button className="secondary-button" onClick={reset}>Cancelar edición</button>}
          <button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':editingId?'Guardar cambio':'Registrar movimiento'}</button>
        </div>
      </section>}
    </section>
  </div>;
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

function MiniStat({label,value}:{label:string;value:string}){
  return <div style={{border:'1px solid #d7d0c5',borderRadius:10,padding:12}}><span style={{display:'block',fontSize:8,textTransform:'uppercase',letterSpacing:'.08em',color:'#6e685f'}}>{label}</span><strong style={{fontSize:20}}>{value}</strong></div>;
}

function BlockHead({title,subtitle}:{title:string;subtitle:string}){
  return <div style={{padding:'17px 19px',borderBottom:'1px solid #d7d0c5'}}><h2 style={{margin:0,fontSize:20}}>{title}</h2><p style={{margin:'4px 0 0',fontSize:10,color:'#6e685f'}}>{subtitle}</p></div>;
}

const metricGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:10};
const fieldStyle:React.CSSProperties={display:'grid',gap:5};
const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6e685f'};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const pct=(n:any)=>`${new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(Number(n||0))}%`;
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
const dateFmtTime=(d:any)=>d?new Date(d).toLocaleDateString('es-CL'):'Sin fecha';
const monthLabel=(m:string)=>new Date(`${m}-01T12:00:00`).toLocaleDateString('es-CL',{month:'long',year:'numeric'});
