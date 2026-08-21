import React,{useEffect,useMemo,useState} from 'react';
import {CircleDollarSign,Plus,Trash2,TrendingUp} from 'lucide-react';
import type {LeadService,ServiceAssignment,Supplier} from '../types';
import {assertSupabase} from '../lib/supabase';

type CostItem={
  id:string;
  lead_service_id:string;
  category:string;
  description?:string|null;
  amount:number;
  supplier_id?:string|null;
  notes?:string|null;
  created_at:string;
  updated_at:string;
};

type CoverageKey='vehicle'|'driver'|'guide'|'food'|'coordination'|'resources'|'entrances';
const categories=['Entradas','Guía','Conductor','Vehículo','Alimentación','Insumos','Comisión','Otros'];
const categoryCoverage:Record<string,CoverageKey|undefined>={
  Entradas:'entrances',Guía:'guide',Conductor:'driver',Vehículo:'vehicle',Alimentación:'food',Insumos:'resources'
};
const coverageLabels:Record<CoverageKey,string>={vehicle:'vehículo',driver:'conductor',guide:'guía',food:'alimentación',coordination:'coordinación',resources:'insumos',entrances:'entradas'};

export default function ServiceFinanceCard({
  service,assignment,suppliers,userRole,onChanged
}:{
  service:LeadService;
  assignment?:ServiceAssignment|Record<string,any>;
  suppliers:Supplier[];
  userRole:string;
  onChanged?:()=>void;
}){
  const [items,setItems]=useState<CostItem[]>([]);
  const [loading,setLoading]=useState(true);
  const [category,setCategory]=useState('Otros');
  const [description,setDescription]=useState('');
  const [amount,setAmount]=useState('');
  const [saving,setSaving]=useState(false);
  const canEdit=userRole!=='viewer';
  const supplierId=(assignment as any)?.supplier_id;
  const operationMode=(assignment as any)?.operation_mode||(supplierId?'delegated_full':'direct');
  const delegated=Boolean(supplierId)&&operationMode!=='direct';
  const coverage:CoverageKey[]=operationMode==='delegated_full'
    ? ['vehicle','driver','guide','food','coordination','resources','entrances']
    : (Array.isArray((assignment as any)?.supplier_coverage)?(assignment as any).supplier_coverage:[]);
  const supplier=suppliers.find(s=>s.id===supplierId);

  const load=async()=>{
    setLoading(true);
    try{
      const {data,error}=await assertSupabase()
        .from('service_cost_items')
        .select('*')
        .eq('lead_service_id',service.id)
        .order('created_at',{ascending:true});
      if(error)throw error;
      setItems((data||[]) as CostItem[]);
    }finally{setLoading(false)}
  };
  useEffect(()=>{load()},[service.id]);

  const sale=Number(service.precio_venta||0);
  const supplierCost=delegated?Number((assignment as any)?.supplier_cost||0):0;
  const extraCosts=useMemo(()=>items.reduce((sum,item)=>sum+Number(item.amount||0),0),[items]);
  const totalCost=supplierCost+extraCosts;
  const margin=sale-totalCost;
  const marginPct=sale>0?(margin/sale)*100:0;

  const add=async()=>{
    const parsed=parseMoney(amount);
    if(parsed<=0)return alert('Ingresa un costo mayor a 0.');
    const coveredKey=categoryCoverage[category];
    if(delegated&&coveredKey&&coverage.includes(coveredKey)){
      const ok=confirm(`${category} figura como cubierto por ${supplier?.name||'el proveedor'}. ¿Este monto es realmente un costo adicional fuera del precio de adquisición?`);
      if(!ok)return;
    }
    setSaving(true);
    try{
      const {data:{user}}=await assertSupabase().auth.getUser();
      const {error}=await assertSupabase().from('service_cost_items').insert({
        lead_service_id:service.id,
        category,
        description:description.trim()||null,
        amount:parsed,
        created_by:user?.id||null
      });
      if(error)throw error;
      setDescription('');setAmount('');setCategory('Otros');
      await load();onChanged?.();
    }catch(e:any){alert(e?.message||'No se pudo guardar el costo.')}finally{setSaving(false)}
  };

  const update=async(id:string,patch:Partial<CostItem>)=>{
    const {error}=await assertSupabase().from('service_cost_items').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)throw error;
    await load();onChanged?.();
  };

  const remove=async(item:CostItem)=>{
    if(!confirm(`¿Quitar ${item.description||item.category} de los costos del tour?`))return;
    const {error}=await assertSupabase().from('service_cost_items').delete().eq('id',item.id);
    if(error)return alert(error.message);
    await load();onChanged?.();
  };

  const modeLabel=operationMode==='delegated_full'?'Integral':operationMode==='delegated_partial'?'Parcial':'Directo';
  const modeDescription=operationMode==='delegated_full'
    ? `Compra integral a ${supplier?.name||'proveedor'}: el precio de adquisición es el costo principal del servicio.`
    : operationMode==='delegated_partial'
      ? `Compra parcial a ${supplier?.name||'proveedor'}: el precio de adquisición cubre ${coverage.length?coverage.map(x=>coverageLabels[x]).join(', '):'los ítems que selecciones'}.`
      : 'Operación directa: agrega solo los costos que realmente correspondan.';

  return <div style={{marginTop:14,border:'1px solid #d7d0c5',borderRadius:14,padding:14,background:'#fbfaf7'}}>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'flex-start',flexWrap:'wrap'}}>
      <div>
        <span className="eyebrow">RENTABILIDAD DEL TOUR</span>
        <h4 style={{margin:'4px 0 2px',fontSize:16}}>Venta, adquisición y margen</h4>
        <p style={{margin:0,fontSize:10,color:'#6e685f'}}>{modeDescription}</p>
      </div>
      <span className="mode-chip">{modeLabel}</span>
    </div>

    <div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:8,marginTop:12}}>
      <FinanceStat label="Venta" value={sale}/>
      <FinanceStat label={delegated?'Precio adquisición':'Costo proveedor'} value={supplierCost}/>
      <FinanceStat label="Costos adicionales" value={extraCosts}/>
      <FinanceStat label={`Margen ${sale>0?`· ${marginPct.toFixed(1)}%`:''}`} value={margin} emphasis/>
    </div>

    {delegated&&coverage.length>0&&<div style={{marginTop:10,padding:'9px 10px',border:'1px solid #cbd8cd',borderRadius:10,background:'#f1f6f1',fontSize:9,lineHeight:1.4,color:'#3d5e42'}}>
      <b>Incluido en adquisición:</b> {coverage.map(x=>coverageLabels[x]).join(' · ')}. Agrega debajo solo costos que queden fuera de ese precio.
    </div>}

    {loading?<div style={{fontSize:10,color:'#6e685f',marginTop:12}}>Cargando costos…</div>:<>
      {items.length>0&&<div style={{display:'grid',gap:6,marginTop:12}}>
        {items.map(item=><div key={item.id} style={{display:'grid',gridTemplateColumns:'130px minmax(140px,1fr) 130px 34px',gap:6,alignItems:'center'}}>
          <select disabled={!canEdit} value={item.category} onChange={async e=>{try{await update(item.id,{category:e.target.value})}catch(err:any){alert(err.message)}}}>
            {categories.map(x=><option key={x}>{x}</option>)}
          </select>
          <input disabled={!canEdit} defaultValue={item.description||''} placeholder="Detalle" onBlur={async e=>{if(e.target.value===(item.description||''))return;try{await update(item.id,{description:e.target.value.trim()||null})}catch(err:any){alert(err.message)}}}/>
          <input disabled={!canEdit} inputMode="numeric" defaultValue={formatNumber(item.amount)} onBlur={async e=>{const next=parseMoney(e.target.value);if(next===Number(item.amount||0))return;try{await update(item.id,{amount:next})}catch(err:any){alert(err.message)}}}/>
          {canEdit?<button className="danger-mini" title="Quitar costo" onClick={()=>remove(item)}><Trash2 size={13}/></button>:<span/>}
        </div>)}
      </div>}

      {canEdit&&<div style={{display:'grid',gridTemplateColumns:'130px minmax(160px,1fr) 130px auto',gap:6,alignItems:'end',marginTop:12}}>
        <label style={fieldStyle}><span style={labelStyle}>Tipo</span><select value={category} onChange={e=>setCategory(e.target.value)}>{categories.map(x=><option key={x}>{x}</option>)}</select></label>
        <label style={fieldStyle}><span style={labelStyle}>Detalle</span><input value={description} onChange={e=>setDescription(e.target.value)} placeholder={delegated?'Ej. servicio extra fuera de adquisición':'Ej. Entrada Valle de la Luna'}/></label>
        <label style={fieldStyle}><span style={labelStyle}>Costo CLP</span><input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d.,]/g,''))} placeholder="0"/></label>
        <button className="secondary-button compact-btn" disabled={saving} onClick={add}><Plus size={14}/>{saving?'Guardando…':'Agregar costo'}</button>
      </div>}
    </>}

    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:10,marginTop:12,paddingTop:10,borderTop:'1px solid #ded8cf',fontSize:10}}>
      <span style={{display:'inline-flex',alignItems:'center',gap:5,color:'#6e685f'}}><CircleDollarSign size={14}/> Costo total {money(totalCost)}</span>
      <strong style={{display:'inline-flex',alignItems:'center',gap:5,color:margin>=0?'#247244':'#a1392e',fontSize:12}}><TrendingUp size={14}/> Margen {money(margin)}</strong>
    </div>
  </div>;
}

function FinanceStat({label,value,emphasis=false}:{label:string;value:number;emphasis?:boolean}){
  return <div style={{border:'1px solid #ded8cf',borderRadius:10,padding:'9px 10px',background:emphasis?'#fff':'#f7f5f0'}}>
    <span style={{display:'block',fontSize:8,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'}}>{label}</span>
    <strong style={{display:'block',marginTop:3,fontSize:14}}>{money(value)}</strong>
  </div>;
}

const fieldStyle:React.CSSProperties={display:'grid',gap:4};
const labelStyle:React.CSSProperties={fontSize:8,fontWeight:800,textTransform:'uppercase',letterSpacing:'.07em',color:'#6e685f'};
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const formatNumber=(n:any)=>new Intl.NumberFormat('es-CL',{maximumFractionDigits:0}).format(Number(n||0));
const parseMoney=(value:any)=>{
  const raw=String(value??'').trim().replace(/\./g,'').replace(',','.');
  const parsed=Number(raw);
  return Number.isFinite(parsed)&&parsed>=0?parsed:0;
};
