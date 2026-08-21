import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,RefreshCw,ShieldAlert,Sparkles} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';

type Issue={
  id:string;
  severity:'critical'|'warning'|'info';
  category:string;
  title:string;
  detail:string;
  recommended_action:string;
  lead_id?:string|null;
  lead_name?:string|null;
  lead_code?:string|null;
  service_name?:string|null;
  service_date?:string|null;
};
type Scan={
  generated_at:string;
  summary:{total:number;critical:number;warning:number;info:number};
  issues:Issue[];
};

export default function AiControlPanel({
  onAnalyze,onSelectLead
}:{
  onAnalyze:()=>void;
  onSelectLead:(leadId:string)=>void;
}){
  const [scan,setScan]=useState<Scan|null>(null);
  const [loading,setLoading]=useState(true);
  const [expanded,setExpanded]=useState(false);

  const load=async()=>{
    setLoading(true);
    try{
      const {data:{session}}=await assertSupabase().auth.getSession();
      const r=await fetch('/api/control-checks',{
        headers:{Authorization:`Bearer ${session?.access_token||''}`}
      });
      const d=await r.json();
      if(!r.ok)throw new Error(d.error||'No se pudo ejecutar el control preventivo.');
      setScan(d);
    }catch(e:any){
      setScan({
        generated_at:new Date().toISOString(),
        summary:{total:0,critical:0,warning:0,info:0},
        issues:[{
          id:'scan-error',severity:'warning',category:'system',
          title:'No se pudo completar el control preventivo',
          detail:e?.message||'Error de lectura.',
          recommended_action:'Actualizar nuevamente o revisar la sesión.'
        }]
      });
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[]);

  const visible=useMemo(()=>{
    if(!scan)return [];
    const sorted=[...scan.issues].sort((a,b)=>rank(a.severity)-rank(b.severity));
    return expanded?sorted:sorted.slice(0,5);
  },[scan,expanded]);

  return <section className="surface-card" style={{padding:0,overflow:'hidden'}}>
    <header style={{padding:'14px 16px',borderBottom:'1px solid #e5dfd6',display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div>
        <span className="eyebrow">CONTROL PREVENTIVO</span>
        <h3 style={{margin:'3px 0 2px',fontSize:17}}>Anomalías y contradicciones antes de operar</h3>
        <p style={{margin:0,fontSize:9,color:'#6e685f'}}>Reglas determinísticas primero; IA después para interpretar y priorizar.</p>
      </div>
      <div style={{display:'flex',gap:7}}>
        <button className="secondary-button compact-btn" onClick={load} disabled={loading}><RefreshCw size={14}/> {loading?'Revisando…':'Actualizar'}</button>
        <button className="primary-button compact-btn" onClick={onAnalyze} disabled={loading}><Sparkles size={14}/> Analizar con IA</button>
      </div>
    </header>

    {scan&&<div style={{display:'grid',gridTemplateColumns:'repeat(4,minmax(0,1fr))',gap:0,borderBottom:'1px solid #e5dfd6'}}>
      <Stat label="Total" value={scan.summary.total}/>
      <Stat label="Críticos" value={scan.summary.critical} severity="critical"/>
      <Stat label="Advertencias" value={scan.summary.warning} severity="warning"/>
      <Stat label="Informativos" value={scan.summary.info} severity="info"/>
    </div>}

    <div style={{display:'grid'}}>
      {!loading&&scan?.summary.total===0&&<div style={{padding:18,display:'flex',gap:9,alignItems:'center',fontSize:10,color:'#247244'}}>
        <CheckCircle2 size={17}/> No se detectaron contradicciones con las reglas actuales.
      </div>}

      {visible.map(item=><article key={item.id} style={{padding:'12px 16px',borderBottom:'1px solid #eee8df',display:'grid',gridTemplateColumns:'26px minmax(0,1fr) auto',gap:10,alignItems:'start'}}>
        <span style={{width:26,height:26,borderRadius:'50%',display:'grid',placeItems:'center',border:'1px solid #d8d1c7',color:severityColor(item.severity)}}>
          {item.severity==='critical'?<ShieldAlert size={14}/>:<AlertTriangle size={14}/>}
        </span>
        <div>
          <div style={{display:'flex',gap:7,alignItems:'center',flexWrap:'wrap'}}>
            <strong style={{fontSize:10}}>{item.title}</strong>
            <span style={{fontSize:7,fontWeight:900,textTransform:'uppercase',letterSpacing:'.06em',color:severityColor(item.severity)}}>{severityLabel(item.severity)}</span>
          </div>
          <p style={{margin:'4px 0 0',fontSize:9,color:'#5f5952',lineHeight:1.4}}>{item.detail}</p>
          <p style={{margin:'4px 0 0',fontSize:8,color:'#80786f',lineHeight:1.35}}><b>Acción:</b> {item.recommended_action}</p>
          {(item.lead_code||item.service_name)&&<small style={{display:'block',marginTop:4,fontSize:7,color:'#8a837a'}}>
            {[item.lead_code,item.service_date,item.service_name].filter(Boolean).join(' · ')}
          </small>}
        </div>
        {item.lead_id&&<button className="secondary-button compact-btn" onClick={()=>onSelectLead(item.lead_id!)}>Usar lead</button>}
      </article>)}

      {scan&&scan.issues.length>5&&<button onClick={()=>setExpanded(v=>!v)} style={{border:0,background:'transparent',padding:10,fontSize:9,fontWeight:800,cursor:'pointer'}}>
        {expanded?'Mostrar menos':`Ver las ${scan.issues.length} observaciones`}
      </button>}
    </div>
  </section>;
}

function Stat({label,value,severity}:{label:string;value:number;severity?:Issue['severity']}){
  return <div style={{padding:'10px 14px',borderRight:'1px solid #eee8df'}}>
    <span style={{display:'block',fontSize:7,textTransform:'uppercase',letterSpacing:'.07em',color:'#756e65'}}>{label}</span>
    <strong style={{fontSize:20,color:severity?severityColor(severity):'#111'}}>{value}</strong>
  </div>;
}
function rank(s:Issue['severity']){return s==='critical'?0:s==='warning'?1:2}
function severityColor(s:Issue['severity']){return s==='critical'?'#a1392e':s==='warning'?'#94641e':'#4f6d85'}
function severityLabel(s:Issue['severity']){return s==='critical'?'Crítico':s==='warning'?'Revisar':'Informativo'}
