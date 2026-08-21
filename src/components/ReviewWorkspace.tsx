import React,{useEffect,useMemo,useState} from 'react';
import {Archive,Check,ChevronRight,Clipboard,MessageSquareText,RefreshCw,RotateCcw,Snowflake,Star,Users} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {assertSupabase} from '../lib/supabase';
import './ReviewWorkspace.css';

type ReviewStatus='pending'|'requested'|'responded'|'dormido';
type ReviewCase={
  id:string;lead_id:string;status:ReviewStatus;last_experience_date?:string|null;entered_at:string;
  last_action_at?:string|null;requested_at?:string|null;responded_at?:string|null;archived_at?:string|null;
  rating?:number|null;recommendation_text?:string|null;referral_name?:string|null;referral_contact?:string|null;notes?:string|null;
};
type Passenger={id:string;lead_id:string;full_name:string;email?:string|null;phone?:string|null;is_primary?:boolean|null};

type Props={
  leads:Lead[];
  services:LeadService[];
  userRole:string;
  onLead:(lead:Lead)=>void;
  onChanged:()=>void|Promise<void>;
};

const statusMeta:Record<ReviewStatus,{label:string;short:string}>={
  pending:{label:'Por contactar',short:'Pendiente'},
  requested:{label:'Recomendación solicitada',short:'Solicitado'},
  responded:{label:'Respondió',short:'Respondió'},
  dormido:{label:'Archivado por inactividad',short:'Dormido'}
};

export default function ReviewWorkspace({leads,services,userRole,onLead,onChanged}:Props){
  const [cases,setCases]=useState<ReviewCase[]>([]);
  const [passengers,setPassengers]=useState<Passenger[]>([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState<ReviewStatus>('pending');
  const [query,setQuery]=useState('');
  const [copied,setCopied]=useState('');
  const [responseCase,setResponseCase]=useState<ReviewCase|null>(null);
  const canEdit=userRole!=='viewer';

  const load=async()=>{
    setLoading(true);
    try{
      const db=assertSupabase();
      await db.rpc('sync_review_lifecycle');
      const [c,p]=await Promise.all([
        db.from('review_cases').select('*').order('last_experience_date',{ascending:false,nullsFirst:false}),
        db.from('passengers').select('id,lead_id,full_name,email,phone,is_primary').order('created_at')
      ]);
      if(c.error)throw c.error;
      if(p.error)throw p.error;
      setCases((c.data||[]) as ReviewCase[]);
      setPassengers((p.data||[]) as Passenger[]);
    }catch(e:any){
      alert(e?.message||'No se pudo cargar Review.');
    }finally{setLoading(false)}
  };

  useEffect(()=>{void load()},[]);

  const leadById=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const passengersByLead=useMemo(()=>{
    const map=new Map<string,Passenger[]>();
    for(const p of passengers){const list=map.get(p.lead_id)||[];list.push(p);map.set(p.lead_id,list)}
    return map;
  },[passengers]);
  const servicesByLead=useMemo(()=>{
    const map=new Map<string,LeadService[]>();
    for(const s of services){const list=map.get(s.lead_id)||[];list.push(s);map.set(s.lead_id,list)}
    return map;
  },[services]);

  const counts=useMemo(()=>({
    pending:cases.filter(x=>x.status==='pending').length,
    requested:cases.filter(x=>x.status==='requested').length,
    responded:cases.filter(x=>x.status==='responded').length,
    dormido:cases.filter(x=>x.status==='dormido').length
  }),[cases]);

  const rows=useMemo(()=>{
    const q=query.trim().toLowerCase();
    return cases.filter(c=>c.status===tab).map(c=>{
      const lead=leadById.get(c.lead_id);
      const pax=passengersByLead.get(c.lead_id)||[];
      const primary=pax.find(x=>x.is_primary)||pax[0];
      const leadServices=servicesByLead.get(c.lead_id)||[];
      const sale=leadServices.reduce((sum,s)=>sum+Number(s.precio_venta||0),0);
      return {case:c,lead,primary,pax,leadServices,sale};
    }).filter(row=>{
      if(!q)return true;
      return [row.lead?.reserva,row.lead?.codigo,row.lead?.contacto,row.primary?.full_name,row.primary?.email,row.primary?.phone]
        .some(v=>String(v||'').toLowerCase().includes(q));
    });
  },[cases,tab,query,leadById,passengersByLead,servicesByLead]);

  const updateCase=async(reviewCase:ReviewCase,patch:any,activityTitle:string,activityBody:string)=>{
    const db=assertSupabase();
    const now=new Date().toISOString();
    const {error}=await db.from('review_cases').update({...patch,updated_at:now}).eq('id',reviewCase.id);
    if(error)throw error;
    await db.from('crm_activities').insert({
      lead_id:reviewCase.lead_id,type:'review',title:activityTitle,body:activityBody,created_by:'Review CRM'
    });
  };

  const markRequested=async(reviewCase:ReviewCase)=>{
    try{
      const now=new Date().toISOString();
      await updateCase(reviewCase,{status:'requested',requested_at:now,last_action_at:now,archived_at:null},'Recomendación solicitada','El cliente pasó a seguimiento de recomendación.');
      await load();await onChanged();
    }catch(e:any){alert(e?.message||'No se pudo actualizar Review.')}
  };

  const sleep=async(reviewCase:ReviewCase)=>{
    if(!confirm('¿Mover este cliente a Dormido? Quedará archivado fuera del flujo activo de Review.'))return;
    try{
      const now=new Date().toISOString();
      await updateCase(reviewCase,{status:'dormido',archived_at:now,last_action_at:now},'Cliente dormido','El seguimiento de recomendación fue archivado manualmente.');
      const {error}=await assertSupabase().from('leads').update({lifecycle_stage:'dormido',updated_at:now}).eq('id',reviewCase.lead_id);
      if(error)throw error;
      await load();await onChanged();
    }catch(e:any){alert(e?.message||'No se pudo archivar.')}
  };

  const reactivate=async(reviewCase:ReviewCase)=>{
    try{
      const now=new Date().toISOString();
      await updateCase(reviewCase,{status:'pending',entered_at:now,last_action_at:null,archived_at:null},'Review reactivado','El cliente volvió a la cola de recomendación.');
      const {error}=await assertSupabase().from('leads').update({lifecycle_stage:'review',updated_at:now}).eq('id',reviewCase.lead_id);
      if(error)throw error;
      await load();await onChanged();
      setTab('pending');
    }catch(e:any){alert(e?.message||'No se pudo reactivar.')}
  };

  const copyMessage=async(row:any)=>{
    const name=(row.primary?.full_name||row.lead?.reserva||'').trim().split(/\s+/)[0]||'Hola';
    const text=`Hola ${name}, esperamos que hayas disfrutado tu experiencia en San Pedro de Atacama. Si te gustó, ¿nos ayudarías dejando una recomendación sobre tu experiencia? Tu opinión nos ayuda muchísimo. Gracias por viajar con Hotel Experience.`;
    try{await navigator.clipboard.writeText(text);setCopied(row.case.id);setTimeout(()=>setCopied(''),1600)}catch{alert(text)}
  };

  if(loading)return <div className="loading-card">Ordenando postventa y recomendaciones…</div>;

  return <div className="review-workspace">
    <section className="review-hero surface-card">
      <div>
        <span className="eyebrow">POSTVENTA · REVIEW</span>
        <h2>La experiencia terminó. Ahora empieza la recomendación.</h2>
        <p>Entran automáticamente aquí los clientes cuyos servicios están <b>pagados y completados</b>. Si pasan 30 días desde la última experiencia sin acción, se mueven a <b>Dormido</b>.</p>
      </div>
      <button className="icon-button" onClick={load} title="Actualizar Review"><RefreshCw size={17}/></button>
    </section>

    <section className="review-metrics">
      <Metric icon={<MessageSquareText/>} label="Por contactar" value={counts.pending}/>
      <Metric icon={<Star/>} label="Solicitados" value={counts.requested}/>
      <Metric icon={<Check/>} label="Respondieron" value={counts.responded}/>
      <Metric icon={<Snowflake/>} label="Dormidos" value={counts.dormido}/>
    </section>

    <section className="surface-card review-board">
      <header className="review-toolbar">
        <div className="review-tabs">
          {(['pending','requested','responded','dormido'] as ReviewStatus[]).map(status=><button key={status} className={tab===status?'active':''} onClick={()=>setTab(status)}>{statusMeta[status].short}<span>{counts[status]}</span></button>)}
        </div>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar cliente o contacto…"/>
      </header>

      <div className="review-list">
        {rows.map(row=><article className="review-row" key={row.case.id}>
          <button className="review-main" onClick={()=>row.lead&&onLead(row.lead)}>
            <div className="review-avatar">{initials(row.primary?.full_name||row.lead?.reserva||'HE')}</div>
            <div className="review-identity">
              <strong>{row.primary?.full_name||row.lead?.reserva||'Cliente'}</strong>
              <span>{row.lead?.codigo||'—'} · {row.lead?.empresa_ejecuta||'Sin hotel'}</span>
              <small>{contactLine(row.primary,row.lead)}</small>
            </div>
          </button>

          <div className="review-facts">
            <Fact label="Última experiencia" value={dateFmt(row.case.last_experience_date)} detail={daysLabel(row.case.last_experience_date)}/>
            <Fact label="Experiencias" value={String(row.leadServices.length)} detail={money(row.sale)}/>
            <Fact label="Estado" value={statusMeta[row.case.status].short} detail={actionDate(row.case)}/>
          </div>

          <div className="review-actions">
            {row.case.status==='pending'&&<>
              <button className="secondary-button" onClick={()=>copyMessage(row)}><Clipboard size={14}/>{copied===row.case.id?' Copiado':' Mensaje'}</button>
              {canEdit&&<button className="primary-button" onClick={()=>markRequested(row.case)}>Marcar solicitado</button>}
              {canEdit&&<button className="icon-button" onClick={()=>sleep(row.case)} title="Mover a Dormido"><Archive size={15}/></button>}
            </>}
            {row.case.status==='requested'&&<>
              <button className="secondary-button" onClick={()=>copyMessage(row)}><Clipboard size={14}/> Mensaje</button>
              {canEdit&&<button className="primary-button" onClick={()=>setResponseCase(row.case)}>Registrar respuesta</button>}
              {canEdit&&<button className="icon-button" onClick={()=>sleep(row.case)} title="Mover a Dormido"><Archive size={15}/></button>}
            </>}
            {row.case.status==='responded'&&<>
              <div className="review-result"><Star size={14}/><span>{row.case.rating?`${row.case.rating}/5`:'Respuesta registrada'}</span></div>
              {canEdit&&<button className="secondary-button" onClick={()=>setResponseCase(row.case)}>Editar</button>}
            </>}
            {row.case.status==='dormido'&&canEdit&&<button className="secondary-button" onClick={()=>reactivate(row.case)}><RotateCcw size={14}/> Reactivar</button>}
            <ChevronRight size={16} className="review-chevron"/>
          </div>
        </article>)}
        {!rows.length&&<div className="empty-state review-empty">No hay clientes en esta etapa.</div>}
      </div>
    </section>

    <section className="review-rule surface-card">
      <Users size={16}/><span><b>Regla automática:</b> todos los servicios Pagados + Completados → Review. Pendiente sin acción + última experiencia hace 30 días o más → Dormido.</span>
    </section>

    {responseCase&&<ResponseModal reviewCase={responseCase} onClose={()=>setResponseCase(null)} onSaved={async()=>{setResponseCase(null);await load();await onChanged()}}/>}
  </div>;
}

function ResponseModal({reviewCase,onClose,onSaved}:{reviewCase:ReviewCase;onClose:()=>void;onSaved:()=>void|Promise<void>}){
  const [rating,setRating]=useState(String(reviewCase.rating||''));
  const [recommendation,setRecommendation]=useState(reviewCase.recommendation_text||'');
  const [referralName,setReferralName]=useState(reviewCase.referral_name||'');
  const [referralContact,setReferralContact]=useState(reviewCase.referral_contact||'');
  const [notes,setNotes]=useState(reviewCase.notes||'');
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    setSaving(true);
    try{
      const db=assertSupabase();const now=new Date().toISOString();
      const payload={status:'responded',rating:rating?Number(rating):null,recommendation_text:recommendation||null,referral_name:referralName||null,referral_contact:referralContact||null,notes:notes||null,responded_at:now,last_action_at:now,archived_at:null,updated_at:now};
      const {error}=await db.from('review_cases').update(payload).eq('id',reviewCase.id);if(error)throw error;
      await db.from('crm_activities').insert({lead_id:reviewCase.lead_id,type:'review_response',title:'Respuesta de recomendación registrada',body:[rating?`Puntuación: ${rating}/5`:'',referralName?`Referido: ${referralName}`:''].filter(Boolean).join(' · ')||'Respuesta registrada.',created_by:'Review CRM'});
      await onSaved();
    }catch(e:any){alert(e?.message||'No se pudo guardar la respuesta.')}finally{setSaving(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card review-modal" onMouseDown={e=>e.stopPropagation()}>
    <header><div><span className="eyebrow">RESULTADO DE REVIEW</span><h2>Registrar respuesta</h2><p>Guarda la recomendación y cualquier referido que haya generado este cliente.</p></div><button className="icon-button" onClick={onClose}>×</button></header>
    <div className="review-form-grid">
      <label><span>Puntuación</span><select value={rating} onChange={e=>setRating(e.target.value)}><option value="">Sin puntuación</option>{[5,4,3,2,1].map(x=><option key={x} value={x}>{x}/5</option>)}</select></label>
      <label className="wide"><span>Recomendación / comentario</span><textarea value={recommendation} onChange={e=>setRecommendation(e.target.value)} placeholder="Qué dijo el cliente, reseña o comentario…"/></label>
      <label><span>Persona referida</span><input value={referralName} onChange={e=>setReferralName(e.target.value)} placeholder="Nombre"/></label>
      <label><span>Contacto referido</span><input value={referralContact} onChange={e=>setReferralContact(e.target.value)} placeholder="Teléfono / email"/></label>
      <label className="wide"><span>Notas internas</span><textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Seguimiento, contexto, oportunidad futura…"/></label>
    </div>
    <footer className="review-modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving} onClick={save}>{saving?'Guardando…':'Guardar respuesta'}</button></footer>
  </section></div>;
}

function Metric({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <article className="surface-card review-metric"><div>{icon}</div><span>{label}</span><strong>{value}</strong></article>}
function Fact({label,value,detail}:{label:string;value:string;detail:string}){return <div className="review-fact"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>}
function initials(name:string){return name.trim().split(/\s+/).slice(0,2).map(x=>x[0]?.toUpperCase()).join('')||'HE'}
function contactLine(p?:Passenger,lead?:Lead){return [p?.email,p?.phone].filter(Boolean).join(' · ')||lead?.contacto||'Sin contacto registrado'}
function dateFmt(d:any){return d?new Date(`${d}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'}):'Sin fecha'}
function daysLabel(d:any){if(!d)return 'Sin fecha para antigüedad';const one=86400000;const diff=Math.floor((Date.now()-new Date(`${d}T12:00:00`).getTime())/one);if(diff<=0)return 'Hoy';return `Hace ${diff} día${diff===1?'':'s'}`}
function actionDate(c:ReviewCase){const d=c.responded_at||c.requested_at||c.archived_at||c.entered_at;return d?new Date(d).toLocaleDateString('es-CL'):'Sin acción'}
const money=(n:any)=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(n||0));
