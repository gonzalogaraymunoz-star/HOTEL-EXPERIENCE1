import React,{useMemo,useState} from 'react';
import {BarChart3,CircleDollarSign,Filter,Target,TrendingUp} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {focusLabel,rankSalesLeads} from '../lib/salesFocus';
import './SalesFocusOverview.css';

type View='funnel'|'value'|'opportunities';

export default function SalesFocusOverview({
  leads,services,onLead
}:{leads:Lead[];services:LeadService[];onLead:(lead:Lead)=>void}){
  const [view,setView]=useState<View>('funnel');
  const ranking=useMemo(()=>rankSalesLeads(leads,services),[leads,services]);
  const focused=ranking.filter(x=>x.visible);
  const hidden=ranking.length-focused.length;
  const focusValue=focused.reduce((a,x)=>a+x.sale,0);
  const stages=['nuevo','contactado','cotizado','confirmado'];

  const stageRows=stages.map(stage=>{
    const items=ranking.filter(x=>String(x.lead.estado).toLowerCase()===stage);
    return {
      stage,
      count:items.length,
      focused:items.filter(x=>x.visible).length,
      sales:items.reduce((a,x)=>a+x.sale,0)
    };
  });
  const maxCount=Math.max(1,...stageRows.map(x=>x.count));
  const maxSales=Math.max(1,...stageRows.map(x=>x.sales));
  const maxOpportunity=Math.max(1,...focused.map(x=>x.sale));

  return <section className="sales-focus-overview">
    <header className="sfo-head">
      <div>
        <span className="eyebrow">ENFOQUE COMERCIAL</span>
        <h2>Los mismos leads, vistos como negocio</h2>
        <p>La señal comercial combina etapa, valor cargado y movimiento reciente. No es una probabilidad de cierre.</p>
      </div>
      <div className="sfo-tabs">
        <button className={view==='funnel'?'active':''} onClick={()=>setView('funnel')}><Filter size={14}/> Embudo</button>
        <button className={view==='value'?'active':''} onClick={()=>setView('value')}><BarChart3 size={14}/> Valor</button>
        <button className={view==='opportunities'?'active':''} onClick={()=>setView('opportunities')}><Target size={14}/> Top oportunidades</button>
      </div>
    </header>

    <div className="sfo-summary">
      <Summary label="Leads con foco" value={`${focused.length}/${ranking.length}`} detail={`${hidden} ocultos por baja señal`} icon={<Target/>}/>
      <Summary label="Valor con foco" value={money(focusValue)} detail="Venta cargada en leads priorizados" icon={<CircleDollarSign/>}/>
      <Summary label="Alta señal" value={String(focused.filter(x=>x.band==='high').length)} detail="Requieren atención primero" icon={<TrendingUp/>}/>
    </div>

    {view==='funnel'&&<div className="sfo-chart">
      {stageRows.map(row=><div className="sfo-funnel-row" key={row.stage}>
        <div className="sfo-row-label"><strong>{labelStage(row.stage)}</strong><span>{row.focused}/{row.count} con foco</span></div>
        <div className="sfo-bar-track"><span style={{width:`${Math.max(5,row.count/maxCount*100)}%`}}/></div>
        <b>{money(row.sales)}</b>
      </div>)}
    </div>}

    {view==='value'&&<div className="sfo-chart">
      {stageRows.map(row=><div className="sfo-value-row" key={row.stage}>
        <div className="sfo-row-label"><strong>{labelStage(row.stage)}</strong><span>{row.count} lead(s)</span></div>
        <div className="sfo-bar-track value"><span style={{width:`${row.sales?Math.max(4,row.sales/maxSales*100):0}%`}}/></div>
        <b>{money(row.sales)}</b>
      </div>)}
    </div>}

    {view==='opportunities'&&<div className="sfo-opportunities">
      {focused.slice(0,8).map(item=><button key={item.lead.id} onClick={()=>onLead(item.lead)}>
        <div className="sfo-opportunity-main">
          <span>
            <strong>{item.lead.reserva}</strong>
            <small>{item.lead.codigo} · {labelStage(String(item.lead.estado))}</small>
          </span>
          <span className={`sales-focus-badge ${item.band}`}>{focusLabel(item.band)}</span>
        </div>
        <div className="sfo-opportunity-bottom">
          <div className="sfo-score-track"><span style={{width:`${item.score}%`}}/></div>
          <b>{money(item.sale)}</b>
        </div>
        <small className="sfo-reason">{item.reasons.slice(0,2).join(' · ')||'Sin valor cargado aún'}</small>
      </button>)}
      {!focused.length&&<div className="empty-state">No hay leads con señal comercial suficiente.</div>}
    </div>}
  </section>;
}

function Summary({label,value,detail,icon}:{label:string;value:string;detail:string;icon:React.ReactNode}){
  return <article className="sfo-summary-card"><span>{icon}</span><div><small>{label}</small><strong>{value}</strong><em>{detail}</em></div></article>;
}
function labelStage(stage:string){
  const s=String(stage||'');
  return s.charAt(0).toUpperCase()+s.slice(1);
}
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
