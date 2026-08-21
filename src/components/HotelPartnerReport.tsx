import React,{useMemo,useState} from 'react';
import {ArrowUpRight,Building2,CircleDollarSign,Search,TrendingUp,Users,WalletCards} from 'lucide-react';
import type {Lead} from '../types';
import './HotelPartnerReport.css';

type Mode='partners'|'channels';
type SortKey='sales'|'margin'|'conversion'|'pending';

type Props={
  rows:any[];
  leads:Lead[];
  month:string;
};

type GroupRow={
  name:string;
  leads:number;
  confirmed:number;
  conversion:number;
  services:number;
  sales:number;
  collected:number;
  pending:number;
  costs:number;
  margin:number;
  marginPct:number;
  coverage:number;
  avgTicket:number;
};

export default function HotelPartnerReport({rows,leads,month}:Props){
  const [mode,setMode]=useState<Mode>('partners');
  const [sort,setSort]=useState<SortKey>('sales');
  const [query,setQuery]=useState('');

  const leadPool=useMemo(
    ()=>leads.filter(l=>month==='all'||String(l.created_at||'').startsWith(month)),
    [leads,month]
  );

  const groups=useMemo(()=>{
    const keyForLead=(lead:Lead)=>mode==='partners'
      ?clean(lead.empresa_ejecuta,'Sin hotel / socio')
      :clean(lead.canal,'Sin canal');
    const keyForRow=(r:any)=>mode==='partners'
      ?clean(r.lead?.empresa_ejecuta,'Sin hotel / socio')
      :clean(r.lead?.canal,'Sin canal');

    const map=new Map<string,GroupRow>();
    const ensure=(name:string)=>{
      const existing=map.get(name);
      if(existing)return existing;
      const blank:GroupRow={
        name,leads:0,confirmed:0,conversion:0,services:0,sales:0,collected:0,pending:0,
        costs:0,margin:0,marginPct:0,coverage:0,avgTicket:0
      };
      map.set(name,blank);
      return blank;
    };

    for(const lead of leadPool){
      const current=ensure(keyForLead(lead));
      current.leads+=1;
      if(String(lead.estado||'').toLowerCase()==='confirmado')current.confirmed+=1;
    }

    const serviceLeads=new Map<string,Set<string>>();
    const coveredServices=new Map<string,number>();

    for(const row of rows){
      const name=keyForRow(row);
      const current=ensure(name);
      current.services+=1;
      current.sales+=Number(row.sale||0);
      current.collected+=Number(row.clientPaid||0);
      current.pending+=Number(row.clientBalance||0);
      current.costs+=Number(row.totalCost||0);
      if(row.hasCostData)coveredServices.set(name,(coveredServices.get(name)||0)+1);
      if(row.lead?.id){
        const ids=serviceLeads.get(name)||new Set<string>();
        ids.add(row.lead.id);
        serviceLeads.set(name,ids);
      }
    }

    for(const current of map.values()){
      current.margin=current.sales-current.costs;
      current.marginPct=current.sales>0?current.margin/current.sales*100:0;
      current.conversion=current.leads>0?current.confirmed/current.leads*100:0;
      current.coverage=current.services>0?(coveredServices.get(current.name)||0)/current.services*100:0;
      const financialLeads=serviceLeads.get(current.name)?.size||0;
      current.avgTicket=financialLeads>0?current.sales/financialLeads:0;
    }

    const q=query.trim().toLowerCase();
    return [...map.values()]
      .filter(x=>!q||x.name.toLowerCase().includes(q))
      .sort((a,b)=>{
        if(sort==='margin')return b.margin-a.margin;
        if(sort==='conversion')return b.conversion-a.conversion;
        if(sort==='pending')return b.pending-a.pending;
        return b.sales-a.sales;
      });
  },[rows,leadPool,mode,sort,query]);

  const totals=useMemo(()=>groups.reduce((acc,row)=>({
    sales:acc.sales+row.sales,
    margin:acc.margin+row.margin,
    pending:acc.pending+row.pending,
    collected:acc.collected+row.collected
  }),{sales:0,margin:0,pending:0,collected:0}),[groups]);

  const ranked=useMemo(()=>{
    const meaningful=groups.filter(x=>x.name!=='Sin hotel / socio'&&x.name!=='Sin canal');
    const topSales=[...meaningful].sort((a,b)=>b.sales-a.sales)[0];
    const topMargin=[...meaningful].sort((a,b)=>b.margin-a.margin)[0];
    const topPending=[...meaningful].sort((a,b)=>b.pending-a.pending)[0];
    const concentration=topSales&&totals.sales>0?topSales.sales/totals.sales*100:0;
    return {topSales,topMargin,topPending,concentration};
  },[groups,totals.sales]);

  const missing=groups.find(x=>x.name==='Sin hotel / socio'||x.name==='Sin canal');

  return <section className="partner-report">
    <header className="partner-report-head">
      <div>
        <span className="eyebrow">SOCIOS Y ORIGEN DEL NEGOCIO</span>
        <h2>{mode==='partners'?'Rendimiento por hotel / socio':'Rendimiento por canal'}</h2>
        <p>
          Cruza captación, conversión, venta, cobranza y rentabilidad con los movimientos financieros reales del CRM.
        </p>
      </div>
      <div className="partner-report-controls">
        <div className="partner-mode-tabs">
          <button className={mode==='partners'?'active':''} onClick={()=>setMode('partners')}><Building2 size={14}/> Hoteles / socios</button>
          <button className={mode==='channels'?'active':''} onClick={()=>setMode('channels')}><ArrowUpRight size={14}/> Canales</button>
        </div>
        <div className="partner-search"><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar…"/></div>
        <select value={sort} onChange={e=>setSort(e.target.value as SortKey)}>
          <option value="sales">Ordenar por venta</option>
          <option value="margin">Ordenar por margen</option>
          <option value="conversion">Ordenar por conversión</option>
          <option value="pending">Ordenar por cobrar</option>
        </select>
      </div>
    </header>

    <div className="partner-metrics">
      <Metric icon={<Building2/>} label={mode==='partners'?'Socios con actividad':'Canales con actividad'} value={String(groups.filter(x=>x.sales>0||x.leads>0).length)}/>
      <Metric icon={<CircleDollarSign/>} label="Venta atribuida" value={money(totals.sales)}/>
      <Metric icon={<TrendingUp/>} label="Margen registrado" value={money(totals.margin)} detail={totals.sales>0?pct(totals.margin/totals.sales*100):'0%'}/>
      <Metric icon={<WalletCards/>} label="Por cobrar" value={money(totals.pending)} detail={`${money(totals.collected)} cobrado`}/>
    </div>

    <div className="partner-insights">
      <Insight label="Mayor venta" value={ranked.topSales?.name||'Sin datos'} detail={ranked.topSales?money(ranked.topSales.sales):'—'}/>
      <Insight label="Mayor margen" value={ranked.topMargin?.name||'Sin datos'} detail={ranked.topMargin?`${money(ranked.topMargin.margin)} · ${pct(ranked.topMargin.marginPct)}`:'—'}/>
      <Insight label="Mayor saldo pendiente" value={ranked.topPending?.name||'Sin datos'} detail={ranked.topPending?money(ranked.topPending.pending):'—'} warn={Boolean(ranked.topPending?.pending)}/>
      <Insight label="Concentración principal" value={ranked.topSales?.name||'Sin datos'} detail={ranked.topSales?`${pct(ranked.concentration)} de la venta`:'—'} warn={ranked.concentration>=50}/>
    </div>

    {missing&&(missing.sales>0||missing.leads>0)&&<div className="partner-data-warning">
      <strong>Dato por ordenar:</strong> {missing.leads} lead(s) y {money(missing.sales)} en venta están bajo “{missing.name}”.
    </div>}

    <div className="partner-table-wrap">
      <table className="partner-table">
        <thead>
          <tr>
            <th>{mode==='partners'?'Hotel / socio':'Canal'}</th>
            <th>Leads</th>
            <th>Conversión</th>
            <th>Servicios</th>
            <th>Venta</th>
            <th>Cobrado</th>
            <th>Por cobrar</th>
            <th>Costos</th>
            <th>Margen</th>
            <th>%</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(row=><tr key={row.name}>
            <td>
              <strong>{row.name}</strong>
              <span>{row.avgTicket>0?`Ticket ${money(row.avgTicket)}`:'Sin venta registrada'}</span>
            </td>
            <td><b>{row.leads}</b><span>{row.confirmed} confirmados</span></td>
            <td><strong>{pct(row.conversion)}</strong></td>
            <td><b>{row.services}</b><span>{pct(row.coverage)} con costo</span></td>
            <td><strong>{money(row.sales)}</strong></td>
            <td>{money(row.collected)}</td>
            <td className={row.pending>0?'pending-cell':''}>{money(row.pending)}</td>
            <td>{money(row.costs)}</td>
            <td><strong>{money(row.margin)}</strong></td>
            <td className={row.marginPct<0?'negative-cell':''}>{pct(row.marginPct)}</td>
          </tr>)}
          {!groups.length&&<tr><td colSpan={10}><div className="empty-state">No hay datos para este filtro.</div></td></tr>}
        </tbody>
      </table>
    </div>

    <footer className="partner-report-note">
      <Users size={14}/>
      <span>
        {month==='all'
          ?'Conversión: todos los leads del CRM. Finanzas: todos los servicios registrados.'
          :'Conversión usa leads ingresados en el mes seleccionado; venta, cobros y costos usan la fecha del servicio del mismo filtro.'}
        {' '}No se calcula comisión del hotel hasta que exista una regla comercial registrada.
      </span>
    </footer>
  </section>;
}

function Metric({icon,label,value,detail}:{icon:React.ReactNode;label:string;value:string;detail?:string}){
  return <article className="partner-metric"><div>{icon}</div><span>{label}</span><strong>{value}</strong>{detail&&<small>{detail}</small>}</article>;
}

function Insight({label,value,detail,warn=false}:{label:string;value:string;detail:string;warn?:boolean}){
  return <article className={warn?'partner-insight warn':'partner-insight'}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function clean(value:any,fallback:string){
  const text=String(value||'').trim();
  return text||fallback;
}

const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
const pct=(n:any)=>`${new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(Number(n||0))}%`;
