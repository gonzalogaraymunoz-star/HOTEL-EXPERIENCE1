import React,{useEffect,useMemo,useState} from 'react';
import {AlertCircle,CheckCircle2,Clock3,LockKeyhole,RefreshCw,RotateCcw,TrendingUp} from 'lucide-react';
import type {Lead,LeadService,ServiceAssignment,Supplier} from '../types';
import {createActivity,loadOperationsData,updateService,updateServiceAssignment} from '../lib/api';
import {assertSupabase} from '../lib/supabase';

type Closure={
  id:string;
  lead_service_id:string;
  closure_status:'open'|'closed';
  outcome:'completed'|'completed_with_changes'|'not_operated';
  actual_pax?:number|null;
  operational_changes?:string|null;
  incident_notes?:string|null;
  refund_amount:number;
  refund_status:'No aplica'|'Pendiente'|'Pagado';
  refund_reason?:string|null;
  sale_snapshot:number;
  supplier_cost_snapshot:number;
  extra_cost_snapshot:number;
  total_cost_snapshot:number;
  net_sale_snapshot:number;
  margin_snapshot:number;
  margin_pct_snapshot:number;
  client_payment_status_snapshot?:string|null;
  supplier_payment_status_snapshot?:string|null;
  notes?:string|null;
  closed_at?:string|null;
  updated_at:string;
};

type CostItem={lead_service_id:string;amount:number};

const outcomeLabels={
  completed:'Completado sin novedades',
  completed_with_changes:'Completado con cambios',
  not_operated:'No operado / cancelado'
};

export default function ServiceClosures({
  lead,services,userRole,onChanged
}:{
  lead:Lead;
  services:LeadService[];
  userRole:string;
  onChanged:()=>void;
}){
  const [closures,setClosures]=useState<Closure[]>([]);
  const [assignments,setAssignments]=useState<ServiceAssignment[]>([]);
  const [suppliers,setSuppliers]=useState<Supplier[]>([]);
  const [costs,setCosts]=useState<CostItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [editing,setEditing]=useState<string|null>(null);
  const [draft,setDraft]=useState<any>(null);
  const [saving,setSaving]=useState(false);
  const canEdit=userRole!=='viewer';

  const load=async()=>{
    setLoading(true);
    if(!services.length){
      setClosures([]);setAssignments([]);setSuppliers([]);setCosts([]);setLoading(false);
      return;
    }
    try{
      const db=assertSupabase();
      const [ops,closureRows,costRows]=await Promise.all([
        loadOperationsData(),
        db.from('service_closures').select('*').in('lead_service_id',services.map(s=>s.id)),
        db.from('service_cost_items').select('lead_service_id,amount').in('lead_service_id',services.map(s=>s.id))
      ]);
      if(closureRows.error)throw closureRows.error;
      if(costRows.error)throw costRows.error;
      setAssignments((ops.assignments||[]).filter((a:ServiceAssignment)=>services.some(s=>s.id===a.lead_service_id)));
      setSuppliers((ops.suppliers||[]) as Supplier[]);
      setClosures((closureRows.data||[]) as Closure[]);
      setCosts((costRows.data||[]) as CostItem[]);
    }catch(e:any){
      alert(e?.message||'No se pudo cargar el cierre de los servicios.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{load()},[lead.id,services.map(s=>s.id).join(',')]);

  const sorted=useMemo(
    ()=>[...services].sort((a,b)=>String(a.fecha_servicio||'9999-12-31').localeCompare(String(b.fecha_servicio||'9999-12-31'))),
    [services]
  );

  const startClose=(service:LeadService)=>{
    const assignment=assignments.find(a=>a.lead_service_id===service.id);
    setEditing(service.id);
    setDraft({
      outcome:service.estado_operacion==='Cancelado'?'not_operated':'completed',
      actual_pax:Number(service.numero_pax||lead.numero_pax||0),
      supplier_cost:Number(assignment?.supplier_cost||0),
      supplier_payment_status:assignment?.supplier_payment_status||'Pendiente',
      operational_changes:'',
      incident_notes:'',
      refund_amount:0,
      refund_status:'No aplica',
      refund_reason:'',
      notes:''
    });
  };

  const closeService=async(service:LeadService)=>{
    if(!draft)return;
    const refund=parseMoney(draft.refund_amount);
    const sale=Number(service.precio_venta||0);
    if(refund>sale)return alert('El reembolso no puede superar la venta registrada del servicio.');
    const supplierCost=parseMoney(draft.supplier_cost);
    const extraCost=costs
      .filter(c=>c.lead_service_id===service.id)
      .reduce((sum,c)=>sum+Number(c.amount||0),0);
    const totalCost=supplierCost+extraCost;
    const netSale=Math.max(0,sale-refund);
    const margin=netSale-totalCost;
    const marginPct=netSale>0?margin/netSale*100:0;
    const outcome=draft.outcome as Closure['outcome'];
    const refundStatus=refund>0?(draft.refund_status==='No aplica'?'Pendiente':draft.refund_status):'No aplica';

    if(!confirm(
      `¿Cerrar ${service.producto}?\n\nVenta neta: ${money(netSale)}\nCosto final: ${money(totalCost)}\nMargen real: ${money(margin)}`
    ))return;

    setSaving(true);
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();

      await updateServiceAssignment(service.id,{
        supplier_cost:supplierCost,
        supplier_payment_status:draft.supplier_payment_status||'Pendiente',
        supplier_payment_date:draft.supplier_payment_status==='Pagado'?new Date().toISOString():null
      });

      const payload={
        lead_service_id:service.id,
        closure_status:'closed',
        outcome,
        actual_pax:Math.max(0,Number(draft.actual_pax||0)),
        operational_changes:draft.operational_changes?.trim()||null,
        incident_notes:draft.incident_notes?.trim()||null,
        refund_amount:refund,
        refund_status:refundStatus,
        refund_reason:draft.refund_reason?.trim()||null,
        sale_snapshot:sale,
        supplier_cost_snapshot:supplierCost,
        extra_cost_snapshot:extraCost,
        total_cost_snapshot:totalCost,
        net_sale_snapshot:netSale,
        margin_snapshot:margin,
        margin_pct_snapshot:marginPct,
        client_payment_status_snapshot:service.estado_pago||null,
        supplier_payment_status_snapshot:draft.supplier_payment_status||null,
        notes:draft.notes?.trim()||null,
        closed_at:new Date().toISOString(),
        closed_by:user?.id||null,
        updated_at:new Date().toISOString()
      };

      const {error}=await db.from('service_closures').upsert(payload,{onConflict:'lead_service_id'});
      if(error)throw error;

      await updateService(service.id,{
        estado_operacion:outcome==='not_operated'?'Cancelado':'Completado'
      });

      await createActivity({
        lead_id:lead.id,
        type:'service_closed',
        title:'Servicio cerrado',
        body:`${service.producto} · ${outcomeLabels[outcome]} · venta neta ${money(netSale)} · costo ${money(totalCost)} · margen ${money(margin)}${refund?` · reembolso ${money(refund)} (${refundStatus})`:''}`,
        created_by:'CRM'
      });

      setEditing(null);setDraft(null);
      await load();
      onChanged();
    }catch(e:any){
      alert(e?.message||'No se pudo cerrar el servicio.');
    }finally{
      setSaving(false);
    }
  };

  const reopen=async(service:LeadService,closure:Closure)=>{
    if(!canEdit)return;
    if(!confirm(`¿Reabrir el cierre de ${service.producto}? El snapshot final quedará editable hasta que vuelvas a cerrarlo.`))return;
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();
      const {error}=await db.from('service_closures').update({
        closure_status:'open',
        reopened_at:new Date().toISOString(),
        reopened_by:user?.id||null,
        updated_at:new Date().toISOString()
      }).eq('id',closure.id);
      if(error)throw error;
      await createActivity({
        lead_id:lead.id,type:'service_closure_reopened',title:'Cierre reabierto',
        body:`${service.producto} · el resultado final quedó abierto para corrección.`,
        created_by:'CRM'
      });
      await load();onChanged();
    }catch(e:any){alert(e?.message||'No se pudo reabrir el cierre.')}
  };

  if(loading)return <div className="empty-state">Cargando cierres operacionales…</div>;

  const closedCount=closures.filter(c=>c.closure_status==='closed').length;

  return <section className="ops-block">
    <div className="ops-head">
      <div><span className="eyebrow">CIERRE OPERACIONAL</span><h3>Resultado real · {closedCount}/{services.length} servicio(s) cerrados</h3></div>
      <button className="secondary-button compact-btn" onClick={load}><RefreshCw size={14}/> Actualizar</button>
    </div>
    <p style={{margin:'0 0 14px',fontSize:11,color:'#6e685f',lineHeight:1.5}}>
      El cierre fija una fotografía final de la venta, costo, reembolso y margen. Los costos adicionales se toman del bloque de rentabilidad de cada tour.
    </p>

    <div style={{display:'grid',gap:10}}>
      {sorted.map(service=>{
        const closure=closures.find(c=>c.lead_service_id===service.id);
        const assignment=assignments.find(a=>a.lead_service_id===service.id);
        const supplier=suppliers.find(s=>s.id===assignment?.supplier_id);
        const extraCost=costs.filter(c=>c.lead_service_id===service.id).reduce((sum,c)=>sum+Number(c.amount||0),0);
        const isClosed=closure?.closure_status==='closed';
        const isEditing=editing===service.id&&draft;
        const preview=isEditing?previewResult(service,draft,extraCost):null;
        const isFuture=service.fecha_servicio&&new Date(`${service.fecha_servicio}T23:59:00`)>new Date();

        return <article key={service.id} style={{border:'1px solid #d8d1c7',borderRadius:14,padding:14,background:isClosed?'#f7faf7':'#fff'}}>
          <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
            <div>
              <strong style={{display:'block',fontSize:13}}>{service.producto}</strong>
              <span style={{fontSize:9,color:'#6e685f'}}>{dateFmt(service.fecha_servicio)} · {service.numero_pax} pax{supplier?` · ${supplier.name}`:''}</span>
            </div>
            <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:9,fontWeight:800,color:isClosed?'#247244':'#8d5b17'}}>
              {isClosed?<LockKeyhole size={13}/>:<Clock3 size={13}/>}
              {isClosed?'CERRADO':'ABIERTO'}
            </span>
          </div>

          {isClosed&&closure&&<>
            <div style={metricGrid}>
              <FinalStat label="Venta bruta" value={closure.sale_snapshot}/>
              <FinalStat label="Reembolso" value={closure.refund_amount}/>
              <FinalStat label="Costo final" value={closure.total_cost_snapshot}/>
              <FinalStat label={`Margen real · ${Number(closure.margin_pct_snapshot||0).toFixed(1)}%`} value={closure.margin_snapshot} emphasis/>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginTop:10,fontSize:9}}>
              <Info label="Resultado" value={outcomeLabels[closure.outcome]}/>
              <Info label="Pax reales" value={String(closure.actual_pax??'—')}/>
              <Info label="Pago proveedor" value={closure.supplier_payment_status_snapshot||'No informado'}/>
              <Info label="Pago cliente al cierre" value={closure.client_payment_status_snapshot||'No informado'}/>
            </div>
            {closure.operational_changes&&<Note label="Cambios realizados" value={closure.operational_changes}/>}
            {closure.incident_notes&&<Note label="Incidencias" value={closure.incident_notes} warn/>}
            {closure.refund_amount>0&&<Note label={`Reembolso · ${closure.refund_status}`} value={`${money(closure.refund_amount)}${closure.refund_reason?` · ${closure.refund_reason}`:''}`} warn={closure.refund_status==='Pendiente'}/>}
            {closure.notes&&<Note label="Notas de cierre" value={closure.notes}/>}
            <div style={{display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',marginTop:10}}>
              <small style={{fontSize:8,color:'#6e685f'}}>Cerrado {closure.closed_at?new Date(closure.closed_at).toLocaleString('es-CL'):'—'}</small>
              {canEdit&&<button className="secondary-button compact-btn" onClick={()=>reopen(service,closure)}><RotateCcw size={13}/> Reabrir cierre</button>}
            </div>
          </>}

          {!isClosed&&!isEditing&&<div style={{marginTop:10,display:'flex',justifyContent:'space-between',gap:10,alignItems:'center',flexWrap:'wrap'}}>
            <div style={{fontSize:9,color:'#6e685f'}}>
              Venta {money(service.precio_venta)} · proveedor {money(assignment?.supplier_cost||0)} · extras {money(extraCost)}
              {closure?.closure_status==='open'&&<span> · cierre reabierto</span>}
            </div>
            {canEdit&&<button className="primary-button compact-btn" onClick={()=>startClose(service)}><CheckCircle2 size={14}/> Cerrar tour</button>}
          </div>}

          {isFuture&&!isClosed&&<div style={{marginTop:9,padding:'8px 10px',border:'1px solid #ead4a8',borderRadius:9,background:'#fff9eb',fontSize:9,color:'#76521e'}}>
            <AlertCircle size={13} style={{verticalAlign:'middle',marginRight:5}}/>La fecha del servicio aún no termina. Puedes cerrar manualmente si corresponde.
          </div>}

          {isEditing&&preview&&<div style={{marginTop:12,borderTop:'1px solid #e4ded4',paddingTop:12}}>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:9}}>
              <label style={field}><span style={label}>Resultado *</span><select value={draft.outcome} onChange={e=>setDraft((x:any)=>({...x,outcome:e.target.value}))}>{Object.entries(outcomeLabels).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
              <label style={field}><span style={label}>Pax reales</span><input type="number" min={0} value={draft.actual_pax} onChange={e=>setDraft((x:any)=>({...x,actual_pax:Number(e.target.value||0)}))}/></label>
              <label style={field}><span style={label}>Costo final proveedor</span><input inputMode="numeric" value={draft.supplier_cost} onChange={e=>setDraft((x:any)=>({...x,supplier_cost:e.target.value.replace(/[^\d.,]/g,'')}))}/></label>
              <label style={field}><span style={label}>Pago proveedor</span><select value={draft.supplier_payment_status} onChange={e=>setDraft((x:any)=>({...x,supplier_payment_status:e.target.value}))}>{['Pendiente','Programado','Pagado','Disputado','No informado'].map(x=><option key={x}>{x}</option>)}</select></label>
              <label style={{...field,gridColumn:'1 / -1'}}><span style={label}>Cambios respecto a lo planificado</span><textarea rows={2} value={draft.operational_changes} onChange={e=>setDraft((x:any)=>({...x,operational_changes:e.target.value}))} placeholder="Cambio de horario, proveedor, ruta, sustitución de experiencia..."/></label>
              <label style={{...field,gridColumn:'1 / -1'}}><span style={label}>Incidencias</span><textarea rows={2} value={draft.incident_notes} onChange={e=>setDraft((x:any)=>({...x,incident_notes:e.target.value}))} placeholder="Clima, atraso, reclamo, seguridad, no show..."/></label>
              <label style={field}><span style={label}>Reembolso cliente</span><input inputMode="numeric" value={draft.refund_amount} onChange={e=>setDraft((x:any)=>({...x,refund_amount:e.target.value.replace(/[^\d.,]/g,'')}))}/></label>
              <label style={field}><span style={label}>Estado reembolso</span><select value={draft.refund_status} disabled={parseMoney(draft.refund_amount)<=0} onChange={e=>setDraft((x:any)=>({...x,refund_status:e.target.value}))}>{['No aplica','Pendiente','Pagado'].map(x=><option key={x}>{x}</option>)}</select></label>
              {parseMoney(draft.refund_amount)>0&&<label style={{...field,gridColumn:'1 / -1'}}><span style={label}>Motivo reembolso</span><input value={draft.refund_reason} onChange={e=>setDraft((x:any)=>({...x,refund_reason:e.target.value}))} placeholder="Servicio no realizado, diferencia de producto, acuerdo comercial..."/></label>}
              <label style={{...field,gridColumn:'1 / -1'}}><span style={label}>Notas de cierre</span><textarea rows={2} value={draft.notes} onChange={e=>setDraft((x:any)=>({...x,notes:e.target.value}))} placeholder="Información interna que debe quedar en el cierre."/></label>
            </div>

            <div style={metricGrid}>
              <FinalStat label="Venta neta" value={preview.netSale}/>
              <FinalStat label="Costo proveedor" value={preview.supplierCost}/>
              <FinalStat label="Extras registrados" value={extraCost}/>
              <FinalStat label={`Margen final · ${preview.marginPct.toFixed(1)}%`} value={preview.margin} emphasis/>
            </div>

            {draft.supplier_payment_status!=='Pagado'&&assignment?.supplier_id&&<div style={{marginTop:9,padding:'8px 10px',border:'1px solid #ead4a8',borderRadius:9,background:'#fff9eb',fontSize:9,color:'#76521e'}}>
              <AlertCircle size={13} style={{verticalAlign:'middle',marginRight:5}}/>Puedes cerrar el tour aunque el proveedor siga pendiente de pago. El saldo continuará visible en Finanzas.
            </div>}

            <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:11}}>
              <button className="secondary-button compact-btn" onClick={()=>{setEditing(null);setDraft(null)}}>Cancelar</button>
              <button className="primary-button compact-btn" disabled={saving} onClick={()=>closeService(service)}>
                <TrendingUp size={14}/>{saving?'Cerrando…':'Fijar resultado y cerrar'}
              </button>
            </div>
          </div>}
        </article>;
      })}
      {!services.length&&<div className="empty-card">No hay experiencias para cerrar.</div>}
    </div>
  </section>;
}

function previewResult(service:LeadService,draft:any,extraCost:number){
  const sale=Number(service.precio_venta||0);
  const refund=Math.min(sale,parseMoney(draft.refund_amount));
  const supplierCost=parseMoney(draft.supplier_cost);
  const netSale=Math.max(0,sale-refund);
  const totalCost=supplierCost+extraCost;
  const margin=netSale-totalCost;
  return {netSale,supplierCost,totalCost,margin,marginPct:netSale>0?margin/netSale*100:0};
}
function FinalStat({label:txt,value,emphasis=false}:{label:string;value:number;emphasis?:boolean}){
  return <div style={{border:'1px solid #ded8cf',borderRadius:10,padding:'9px 10px',background:emphasis?'#fff':'#f7f5f0'}}>
    <span style={{display:'block',fontSize:8,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'}}>{txt}</span>
    <strong style={{display:'block',fontSize:14,marginTop:3}}>{money(value)}</strong>
  </div>;
}
function Info({label:txt,value}:{label:string;value:string}){
  return <div style={{border:'1px solid #e2ddd5',borderRadius:9,padding:'8px 9px'}}><small style={{display:'block',fontSize:7,textTransform:'uppercase',color:'#6e685f'}}>{txt}</small><strong style={{fontSize:10}}>{value}</strong></div>;
}
function Note({label:txt,value,warn=false}:{label:string;value:string;warn?:boolean}){
  return <div style={{marginTop:8,padding:'8px 10px',border:`1px solid ${warn?'#ead4a8':'#ded8cf'}`,borderRadius:9,background:warn?'#fff9eb':'#f8f6f2',fontSize:9,lineHeight:1.45,color:warn?'#76521e':'#4e4943'}}><b>{txt}:</b> {value}</div>;
}
const metricGrid:React.CSSProperties={display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:7,marginTop:10};
const field:React.CSSProperties={display:'grid',gap:4};
const label:React.CSSProperties={fontSize:8,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const dateFmt=(d:any)=>d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL'):'Sin fecha';
const parseMoney=(value:any)=>{
  const raw=String(value??'').trim().replace(/\./g,'').replace(',','.');
  const parsed=Number(raw);
  return Number.isFinite(parsed)&&parsed>=0?parsed:0;
};
