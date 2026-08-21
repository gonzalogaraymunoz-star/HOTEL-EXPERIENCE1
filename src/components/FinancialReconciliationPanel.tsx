import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertCircle,CheckCircle2,Clock3,RefreshCw,RotateCcw,Scale,ShieldCheck
} from 'lucide-react';
import type {Lead,LeadService,ServiceAssignment,Supplier} from '../types';
import {createActivity} from '../lib/api';
import {assertSupabase} from '../lib/supabase';

type CostItem={lead_service_id:string;amount:number};
type PaymentMovement={
  lead_service_id:string;
  party_type:'client'|'supplier';
  amount:number;
};
type Closure={
  lead_service_id:string;
  closure_status:'open'|'closed';
  refund_amount:number;
  refund_status:'No aplica'|'Pendiente'|'Pagado';
  sale_snapshot:number;
  supplier_cost_snapshot:number;
  extra_cost_snapshot:number;
  total_cost_snapshot:number;
  net_sale_snapshot:number;
  margin_snapshot:number;
};
type Reconciliation={
  id:string;
  lead_service_id:string;
  status:'open'|'reconciled';
  expected_net_sale:number;
  client_cash:number;
  client_variance:number;
  expected_supplier_cost:number;
  supplier_cash:number;
  supplier_variance:number;
  expected_margin:number;
  refund_amount:number;
  refund_status?:string|null;
  notes?:string|null;
  reconciled_at?:string|null;
  reconciled_by?:string|null;
  reopened_at?:string|null;
  updated_at:string;
};

export default function FinancialReconciliationPanel({
  leads,services,month,userRole
}:{
  leads:Lead[];
  services:LeadService[];
  month:string;
  userRole:string;
}){
  const [assignments,setAssignments]=useState<ServiceAssignment[]>([]);
  const [costs,setCosts]=useState<CostItem[]>([]);
  const [payments,setPayments]=useState<PaymentMovement[]>([]);
  const [closures,setClosures]=useState<Closure[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [records,setRecords]=useState<Reconciliation[]>([]);
  const [loading,setLoading]=useState(true);
  const [target,setTarget]=useState<any|null>(null);
  const [note,setNote]=useState('');
  const [saving,setSaving]=useState(false);

  const canReconcile=['admin','manager'].includes(userRole);
  const filteredServices=useMemo(
    ()=>services.filter(s=>month==='all'||String(s.fecha_servicio||'').startsWith(month)),
    [services,month]
  );

  const load=async()=>{
    if(!filteredServices.length){
      setAssignments([]);setCosts([]);setPayments([]);setClosures([]);setSuppliers([]);setRecords([]);
      setLoading(false);return;
    }
    setLoading(true);
    try{
      const db=assertSupabase();
      const ids=filteredServices.map(s=>s.id);
      const [a,c,p,cl,s,r]=await Promise.all([
        db.from('service_assignments').select('*').in('lead_service_id',ids),
        db.from('service_cost_items').select('lead_service_id,amount').in('lead_service_id',ids),
        db.from('payment_movements').select('lead_service_id,party_type,amount').in('lead_service_id',ids),
        db.from('service_closures')
          .select('lead_service_id,closure_status,refund_amount,refund_status,sale_snapshot,supplier_cost_snapshot,extra_cost_snapshot,total_cost_snapshot,net_sale_snapshot,margin_snapshot')
          .in('lead_service_id',ids),
        db.from('suppliers').select('*'),
        db.from('financial_reconciliations').select('*').in('lead_service_id',ids)
      ]);
      for(const x of [a,c,p,cl,s,r])if(x.error)throw x.error;
      setAssignments((a.data||[]) as ServiceAssignment[]);
      setCosts((c.data||[]) as CostItem[]);
      setPayments((p.data||[]) as PaymentMovement[]);
      setClosures((cl.data||[]) as Closure[]);
      setSuppliers((s.data||[]) as Supplier[]);
      setRecords((r.data||[]) as Reconciliation[]);
    }catch(e:any){
      alert(e?.message||'No se pudo cargar la conciliación financiera.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[filteredServices]);

  const rows=useMemo(()=>{
    const assignmentMap=new Map(assignments.map(a=>[a.lead_service_id,a]));
    const closureMap=new Map(closures.map(c=>[c.lead_service_id,c]));
    const reconciliationMap=new Map(records.map(r=>[r.lead_service_id,r]));
    const supplierMap=new Map(suppliers.map(s=>[s.id,s]));
    const costMap=new Map<string,number>();
    const paymentMap=new Map<string,number>();

    for(const c of costs)costMap.set(c.lead_service_id,(costMap.get(c.lead_service_id)||0)+Number(c.amount||0));
    for(const p of payments){
      const key=`${p.lead_service_id}:${p.party_type}`;
      paymentMap.set(key,(paymentMap.get(key)||0)+Number(p.amount||0));
    }

    return filteredServices.map(service=>{
      const lead=leads.find(l=>l.id===service.lead_id);
      const assignment=assignmentMap.get(service.id);
      const closure=closureMap.get(service.id);
      const record=reconciliationMap.get(service.id);
      const closed=closure?.closure_status==='closed';

      const grossSale=closed?Number(closure.sale_snapshot||0):Number(service.precio_venta||0);
      const refundAmount=closed?Number(closure.refund_amount||0):0;
      const refundPaid=closed&&closure.refund_status==='Pagado'?refundAmount:0;
      const expectedNetSale=closed?Number(closure.net_sale_snapshot||0):grossSale;

      const clientMovementTotal=paymentMap.get(`${service.id}:client`)||0;
      const clientLegacyPaid=clientMovementTotal===0&&service.estado_pago==='Pagado';
      const clientCollected=clientMovementTotal>0?clientMovementTotal:(clientLegacyPaid?grossSale:0);
      const clientCash=clientCollected-refundPaid;
      const clientVariance=round2(clientCash-expectedNetSale);

      const supplierCost=closed
        ?Number(closure.supplier_cost_snapshot||0)
        :Number(assignment?.supplier_cost||0);
      const supplierMovementTotal=paymentMap.get(`${service.id}:supplier`)||0;
      const supplierLegacyPaid=supplierMovementTotal===0&&assignment?.supplier_payment_status==='Pagado'&&supplierCost>0;
      const supplierCash=supplierMovementTotal>0?supplierMovementTotal:(supplierLegacyPaid?supplierCost:0);
      const supplierVariance=round2(supplierCash-supplierCost);

      const extraCost=closed?Number(closure.extra_cost_snapshot||0):(costMap.get(service.id)||0);
      const totalCost=closed?Number(closure.total_cost_snapshot||0):supplierCost+extraCost;
      const expectedMargin=closed?Number(closure.margin_snapshot||0):expectedNetSale-totalCost;
      const refundResolved=!refundAmount||closure?.refund_status==='Pagado'||closure?.refund_status==='No aplica';
      const balanced=Math.abs(clientVariance)<=1&&Math.abs(supplierVariance)<=1&&refundResolved;
      const legacy=clientLegacyPaid||supplierLegacyPaid;
      const drift=Boolean(record?.status==='reconciled'&&(
        Math.abs(Number(record.expected_net_sale||0)-expectedNetSale)>1||
        Math.abs(Number(record.client_cash||0)-clientCash)>1||
        Math.abs(Number(record.expected_supplier_cost||0)-supplierCost)>1||
        Math.abs(Number(record.supplier_cash||0)-supplierCash)>1||
        Math.abs(Number(record.refund_amount||0)-refundAmount)>1||
        String(record.refund_status||'')!==String(closure?.refund_status||'')
      ));

      const supplier=assignment?.supplier_id?supplierMap.get(assignment.supplier_id):undefined;
      return {
        service,lead,assignment,closure,record,closed,grossSale,refundAmount,refundPaid,
        expectedNetSale,clientCollected,clientCash,clientVariance,
        supplierCost,supplierCash,supplierVariance,extraCost,totalCost,expectedMargin,
        refundResolved,balanced,legacy,drift,supplier
      };
    }).sort((a,b)=>{
      if(a.record?.status==='reconciled'!== (b.record?.status==='reconciled')){
        return a.record?.status==='reconciled'?1:-1;
      }
      if(a.closed!==b.closed)return a.closed?-1:1;
      return String(b.service.fecha_servicio||'').localeCompare(String(a.service.fecha_servicio||''));
    });
  },[filteredServices,leads,assignments,costs,payments,closures,suppliers,records]);

  const closedRows=rows.filter(r=>r.closed);
  const reconciled=closedRows.filter(r=>r.record?.status==='reconciled'&&!r.drift).length;
  const ready=closedRows.filter(r=>r.record?.status!=='reconciled'&&r.balanced).length;
  const review=closedRows.filter(r=>r.record?.status!=='reconciled'&&!r.balanced).length;
  const stale=closedRows.filter(r=>r.drift).length;

  const save=async()=>{
    if(!target)return;
    const needsNote=!target.balanced||target.legacy||target.drift;
    if(needsNote&&!note.trim()){
      return alert('Esta conciliación tiene diferencia, datos históricos o cambió después del último cierre. Agrega una nota explicativa.');
    }
    setSaving(true);
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();
      const now=new Date().toISOString();
      const payload={
        lead_service_id:target.service.id,
        status:'reconciled',
        expected_net_sale:target.expectedNetSale,
        client_cash:target.clientCash,
        client_variance:target.clientVariance,
        expected_supplier_cost:target.supplierCost,
        supplier_cash:target.supplierCash,
        supplier_variance:target.supplierVariance,
        expected_margin:target.expectedMargin,
        refund_amount:target.refundAmount,
        refund_status:target.closure?.refund_status||null,
        notes:note.trim()||null,
        reconciled_at:now,
        reconciled_by:user?.id||null,
        reopened_at:null,
        reopened_by:null,
        updated_at:now
      };
      const {error}=await db.from('financial_reconciliations').upsert(payload,{onConflict:'lead_service_id'});
      if(error)throw error;

      await createActivity({
        lead_id:target.lead?.id||target.service.lead_id,
        type:'financial_reconciled',
        title:'Servicio conciliado financieramente',
        body:`${target.service.producto} · venta neta ${money(target.expectedNetSale)} · caja cliente ${money(target.clientCash)} · costo proveedor ${money(target.supplierCost)} · pagado proveedor ${money(target.supplierCash)}${note.trim()?` · ${note.trim()}`:''}`,
        created_by:'CRM'
      });

      setTarget(null);setNote('');
      await load();
    }catch(e:any){
      alert(e?.message||'No se pudo guardar la conciliación.');
    }finally{
      setSaving(false);
    }
  };

  const reopen=async(row:any)=>{
    if(!canReconcile||!row.record)return;
    if(!confirm(`¿Reabrir la conciliación de ${row.service.producto}?`))return;
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();
      const now=new Date().toISOString();
      const {error}=await db.from('financial_reconciliations').update({
        status:'open',
        reopened_at:now,
        reopened_by:user?.id||null,
        updated_at:now
      }).eq('id',row.record.id);
      if(error)throw error;
      await createActivity({
        lead_id:row.lead?.id||row.service.lead_id,
        type:'financial_reconciliation_reopened',
        title:'Conciliación financiera reabierta',
        body:`${row.service.producto} · queda pendiente de nueva revisión.`,
        created_by:'CRM'
      });
      await load();
    }catch(e:any){
      alert(e?.message||'No se pudo reabrir.');
    }
  };

  if(loading)return <div className="loading-card">Cruzando cierres y movimientos para conciliación…</div>;

  return <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
    <div style={{padding:'17px 19px',borderBottom:'1px solid #d7d0c5',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div>
        <span className="eyebrow">CONCILIACIÓN FINANCIERA</span>
        <h2 style={{margin:'4px 0 3px',fontSize:20}}>Del cierre operacional a la caja real</h2>
        <p style={{margin:0,fontSize:10,color:'#6e685f',maxWidth:760,lineHeight:1.45}}>
          Cruza venta neta final, reembolsos, cobros y pagos al proveedor. Un servicio conciliado conserva una fotografía auditable de esos valores.
        </p>
      </div>
      <button className="icon-button" onClick={load} title="Actualizar conciliación"><RefreshCw size={16}/></button>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',borderBottom:'1px solid #e7e1d8'}}>
      <ReconMetric label="Cierres financieros" value={closedRows.length} icon={<Scale size={15}/>}/>
      <ReconMetric label="Listos para conciliar" value={ready} icon={<CheckCircle2 size={15}/>} good/>
      <ReconMetric label="Con diferencias" value={review} icon={<AlertCircle size={15}/>} warn={review>0}/>
      <ReconMetric label="Conciliados" value={reconciled} detail={stale?`${stale} debe revisarse de nuevo`:undefined} icon={<ShieldCheck size={15}/>} good={reconciled>0} warn={stale>0}/>
    </div>

    <div className="table-wrap"><table>
      <thead><tr>
        <th>Fecha</th><th>Cliente / experiencia</th><th>Venta neta</th><th>Caja cliente</th>
        <th>Costo proveedor</th><th>Pagado proveedor</th><th>Diferencia</th><th>Estado</th><th></th>
      </tr></thead>
      <tbody>{closedRows.map(row=>{
        const variance=row.clientVariance-row.supplierVariance;
        const status=row.drift?'Desactualizado':row.record?.status==='reconciled'?'Conciliado':row.balanced?'Listo':'Revisar';
        return <tr key={row.service.id}>
          <td>{dateFmt(row.service.fecha_servicio)}</td>
          <td>
            <strong>{row.lead?.reserva||'—'}</strong>
            <span>{row.lead?.codigo||''} · {row.service.producto}</span>
            {row.supplier&&<span>{row.supplier.name}</span>}
          </td>
          <td>
            <strong>{money(row.expectedNetSale)}</strong>
            {row.refundAmount>0&&<span>Reembolso {money(row.refundAmount)} · {row.closure?.refund_status}</span>}
          </td>
          <td>
            <strong>{money(row.clientCash)}</strong>
            {row.clientLegacyPaid&&<span>Basado en estado histórico</span>}
          </td>
          <td>{money(row.supplierCost)}</td>
          <td>
            <strong>{money(row.supplierCash)}</strong>
            {row.supplierLegacyPaid&&<span>Basado en estado histórico</span>}
          </td>
          <td>
            <strong style={{color:Math.abs(variance)<=1?'#247244':'#8d5b17'}}>{money(variance)}</strong>
            {(Math.abs(row.clientVariance)>1||Math.abs(row.supplierVariance)>1)&&
              <span>Cliente {signedMoney(row.clientVariance)} · proveedor {signedMoney(row.supplierVariance)}</span>}
          </td>
          <td>
            <span className={
              status==='Conciliado'?'status-badge confirmado':
              status==='Listo'?'status-badge confirmado':'status-badge neutral'
            }>{status}</span>
            {row.record?.notes&&<span title={row.record.notes}>{row.record.notes}</span>}
          </td>
          <td>
            {canReconcile&&status!=='Conciliado'&&
              <button className="operation-button" onClick={()=>{setTarget(row);setNote(row.record?.notes||'')}}>
                <CheckCircle2 size={13}/>{row.drift?' Actualizar':' Conciliar'}
              </button>}
            {canReconcile&&status==='Conciliado'&&
              <button className="operation-button" onClick={()=>reopen(row)}>
                <RotateCcw size={13}/> Reabrir
              </button>}
          </td>
        </tr>;
      })}</tbody>
    </table></div>

    {!closedRows.length&&<div className="empty-state" style={{margin:18}}>
      Todavía no hay cierres operacionales en este periodo. La conciliación aparece después de cerrar cada tour.
    </div>}

    {!canReconcile&&closedRows.length>0&&<div style={{padding:'10px 18px',borderTop:'1px solid #e7e1d8',fontSize:9,color:'#6e685f'}}>
      Tu rol puede revisar la conciliación, pero solo manager/admin puede cerrarla o reabrirla.
    </div>}

    {target&&<div className="modal-backdrop" onMouseDown={()=>{setTarget(null);setNote('')}}>
      <section className="modal-card" style={{maxWidth:720}} onMouseDown={e=>e.stopPropagation()}>
        <header>
          <div>
            <span className="eyebrow">CONCILIAR SERVICIO</span>
            <h2>{target.service.producto}</h2>
            <p>{target.lead?.reserva||'Cliente'} · {target.lead?.codigo||''}</p>
          </div>
          <button className="icon-button" onClick={()=>{setTarget(null);setNote('')}}>×</button>
        </header>

        <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,margin:'14px 0'}}>
          <Mini label="Venta neta final" value={target.expectedNetSale}/>
          <Mini label="Caja neta cliente" value={target.clientCash} variance={target.clientVariance}/>
          <Mini label="Costo proveedor" value={target.supplierCost}/>
          <Mini label="Pagado proveedor" value={target.supplierCash} variance={target.supplierVariance}/>
          <Mini label="Margen final esperado" value={target.expectedMargin}/>
          <Mini label="Reembolso" value={target.refundAmount} text={target.closure?.refund_status||'No aplica'}/>
        </div>

        {(!target.balanced||target.legacy||target.drift)&&<div style={{display:'flex',gap:8,alignItems:'flex-start',border:'1px solid #ead4a8',background:'#fff9eb',color:'#76521e',borderRadius:10,padding:'9px 10px',fontSize:9,lineHeight:1.45,marginBottom:10}}>
          <AlertCircle size={15}/>
          <span>
            {target.drift
              ?'Los valores cambiaron después de la última conciliación. Debes documentar por qué vuelves a fijarla.'
              :target.legacy
                ?'Hay al menos un pago inferido desde un estado histórico sin movimientos cuantificados.'
                :'Existen diferencias entre los valores esperados y los movimientos registrados.'}
          </span>
        </div>}

        <label style={{display:'grid',gap:5}}>
          <span style={{fontSize:8,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'}}>
            Nota de conciliación {(!target.balanced||target.legacy||target.drift)?'*':'(opcional)'}
          </span>
          <textarea
            rows={4}
            value={note}
            onChange={e=>setNote(e.target.value)}
            placeholder="Ej. transferencia histórica sin comprobante individual, ajuste acordado, diferencia revisada..."
          />
        </label>

        <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:12}}>
          <button className="secondary-button" onClick={()=>{setTarget(null);setNote('')}}>Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={save}>
            {saving?'Guardando…':'Fijar conciliación'}
          </button>
        </div>
      </section>
    </div>}
  </section>;
}

function ReconMetric({label,value,detail,icon,good,warn}:{label:string;value:number;detail?:string;icon:React.ReactNode;good?:boolean;warn?:boolean}){
  const color=warn?'#8d5b17':good?'#247244':'#111';
  return <div style={{padding:'11px 14px',borderRight:'1px solid #ece6dd',display:'grid',gridTemplateColumns:'28px 1fr',gap:8,alignItems:'center'}}>
    <span style={{width:28,height:28,border:'1px solid #d8d1c7',borderRadius:'50%',display:'grid',placeItems:'center',color}}>{icon}</span>
    <div><small style={{display:'block',fontSize:7,textTransform:'uppercase',letterSpacing:'.07em',color:'#756e65'}}>{label}</small><strong style={{fontSize:18,color}}>{value}</strong>{detail&&<em style={{display:'block',fontStyle:'normal',fontSize:7,color:'#8d5b17'}}>{detail}</em>}</div>
  </div>;
}
function Mini({label,value,variance,text}:{label:string;value:number;variance?:number;text?:string}){
  return <div style={{border:'1px solid #ddd6cd',borderRadius:10,padding:'10px 11px'}}>
    <small style={{display:'block',fontSize:7,textTransform:'uppercase',letterSpacing:'.07em',color:'#756e65'}}>{label}</small>
    <strong style={{display:'block',fontSize:17,marginTop:2}}>{money(value)}</strong>
    {variance!==undefined&&Math.abs(variance)>1&&<span style={{fontSize:8,color:'#8d5b17'}}>Diferencia {signedMoney(variance)}</span>}
    {text&&<span style={{display:'block',fontSize:8,color:'#756e65'}}>{text}</span>}
  </div>;
}
const round2=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const signedMoney=(n:any)=>`${Number(n||0)>=0?'+':'−'}${money(Math.abs(Number(n||0)))}`;
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
