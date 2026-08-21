import React,{useEffect,useMemo,useRef,useState} from 'react';
import {
  AlertTriangle,BookOpenCheck,CheckCircle2,ExternalLink,FileCheck2,FileUp,
  RefreshCw,Scale,ShieldAlert,ShieldCheck,X
} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import CancellationCasesPanel from './CancellationCasesPanel';
import './CancellationPoliciesWorkspace.css';

type Policy={
  id:string;policy_key:string;version:number;name:string;description:string|null;
  owner_type:string;jurisdiction:string;language:string;priority:number;is_default:boolean;
  status:string;effective_from:string|null;effective_to:string|null;source_document_name:string|null;
  storage_bucket:string;storage_path:string|null;source_sha256:string|null;raw_text:string|null;
  normalized_summary:string|null;legal_review_status:string;legal_reviewed_at:string|null;
  legal_notes:string|null;scope_config:any;created_at:string;updated_at:string;
};
type Rule={
  id:string;policy_id:string;rule_code:string;event_type:string;applies_to:string;
  min_hours_before:number|null;max_hours_before:number|null;refund_percent:number|null;
  penalty_percent:number|null;fixed_fee:number|null;currency:string;action_type:string;
  evidence_required:boolean;evidence_type:string|null;conditions:any;customer_text:string|null;
  internal_notes:string|null;priority:number;active:boolean;
};
type LegalSource={
  id:string;source_key:string;authority:string;title:string;url:string;
  legal_reference:string|null;relevance:string|null;checked_on:string;
};
type CaseRow={
  id:string;event_type:string;status:string;calculated_refund_amount:number|null;
  final_refund_amount:number|null;currency:string;created_at:string;
};

export default function CancellationPoliciesWorkspace({role,onClose}:{role:string;onClose:()=>void}){
  const [policies,setPolicies]=useState<Policy[]>([]);
  const [rules,setRules]=useState<Rule[]>([]);
  const [sources,setSources]=useState<LegalSource[]>([]);
  const [cases,setCases]=useState<CaseRow[]>([]);
  const [selectedId,setSelectedId]=useState('');
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [serviceCount,setServiceCount]=useState(0);
  const [snapshotCount,setSnapshotCount]=useState(0);
  const [pdfStored,setPdfStored]=useState(false);
  const [checkingPdf,setCheckingPdf]=useState(false);
  const [uploading,setUploading]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const canEdit=['admin','manager'].includes(role);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const db=assertSupabase();
      const [p,r,l,c,svc,snap]=await Promise.all([
        db.from('cancellation_policies').select('*').order('is_default',{ascending:false}).order('version',{ascending:false}),
        db.from('cancellation_policy_rules').select('*').eq('active',true).order('priority').order('rule_code'),
        db.from('cancellation_legal_sources').select('*').eq('active',true).order('authority').order('title'),
        db.from('cancellation_cases').select('id,event_type,status,calculated_refund_amount,final_refund_amount,currency,created_at').order('created_at',{ascending:false}).limit(20),
        db.from('lead_services').select('id',{count:'exact',head:true}),
        db.from('service_policy_snapshots').select('id',{count:'exact',head:true}).eq('layer','company')
      ]);
      for(const x of [p,r,l,c,svc,snap])if(x.error)throw x.error;
      const nextPolicies=(p.data||[]) as Policy[];
      setPolicies(nextPolicies);
      setRules((r.data||[]) as Rule[]);
      setSources((l.data||[]) as LegalSource[]);
      setCases((c.data||[]) as CaseRow[]);
      setServiceCount(svc.count||0);
      setSnapshotCount(snap.count||0);
      const stillSelected=selectedId&&nextPolicies.some(x=>x.id===selectedId);
      if(!stillSelected){
        const preferred=nextPolicies.find(x=>x.status==='active'&&x.is_default)||nextPolicies[0];
        setSelectedId(preferred?.id||'');
      }
    }catch(e:any){
      setError(e?.message||'No se pudieron cargar las políticas.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[]);

  const policy=useMemo(
    ()=>policies.find(x=>x.id===selectedId)||policies[0]||null,
    [policies,selectedId]
  );
  const policyRules=useMemo(
    ()=>rules.filter(x=>x.policy_id===policy?.id).sort((a,b)=>a.priority-b.priority||a.rule_code.localeCompare(b.rule_code)),
    [rules,policy?.id]
  );
  const riskyRules=policyRules.filter(x=>x.conditions?.legal_review==='needs_changes').length;

  const checkPdf=async()=>{
    if(!policy?.storage_path){setPdfStored(false);return}
    setCheckingPdf(true);
    try{
      const path=policy.storage_path;
      const parts=path.split('/');
      const file=parts.pop()||'';
      const folder=parts.join('/');
      const {data,error}=await assertSupabase().storage
        .from(policy.storage_bucket||'policy-documents')
        .list(folder,{limit:100,search:file});
      if(error)throw error;
      setPdfStored(Boolean((data||[]).some(x=>x.name===file)));
    }catch{
      setPdfStored(false);
    }finally{
      setCheckingPdf(false);
    }
  };
  useEffect(()=>{void checkPdf()},[policy?.id,policy?.storage_path]);

  const openPdf=async()=>{
    if(!policy?.storage_path)return;
    const {data,error}=await assertSupabase().storage
      .from(policy.storage_bucket||'policy-documents')
      .createSignedUrl(policy.storage_path,600);
    if(error||!data?.signedUrl)return alert('El PDF todavía no está archivado en Supabase Storage.');
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  };

  const uploadPdf=async(file:File)=>{
    if(!policy||!canEdit)return;
    if(file.type!=='application/pdf')return alert('Selecciona un archivo PDF.');
    setUploading(true);
    try{
      const sha=await sha256(file);
      if(policy.source_sha256&&policy.source_sha256!==sha){
        return alert('Este PDF no coincide con la huella SHA-256 del documento aprobado. Usa el PDF original de esta versión.');
      }
      const storagePath=policy.storage_path||
        `company/hotel-experience/${policy.policy_key.toLowerCase()}/v${policy.version}/${safeName(file.name)}`;
      const db=assertSupabase();
      const {error:uploadError}=await db.storage
        .from(policy.storage_bucket||'policy-documents')
        .upload(storagePath,file,{contentType:'application/pdf',upsert:false});
      if(uploadError&&!String(uploadError.message||'').toLowerCase().includes('already exists'))throw uploadError;

      const {error:updateError}=await db.from('cancellation_policies').update({
        storage_path:storagePath,
        source_document_name:file.name,
        source_sha256:sha,
        updated_at:new Date().toISOString()
      }).eq('id',policy.id);
      if(updateError)throw updateError;
      await load();
      await checkPdf();
    }catch(e:any){
      alert(e?.message||'No se pudo archivar el PDF.');
    }finally{
      setUploading(false);
      if(fileRef.current)fileRef.current.value='';
    }
  };

  if(loading)return <div className="policies-page-overlay"><div className="policies-loading">Cargando políticas y reglas…</div></div>;

  return <div className="policies-page-overlay">
    <header className="policies-topbar">
      <div>
        <span className="eyebrow">SISTEMA · POLÍTICAS</span>
        <h1>Cancelaciones, cambios y reembolsos</h1>
        <p>Una sola fuente para operación, postventa, reembolsos y trazabilidad contractual.</p>
      </div>
      <div className="policies-top-actions">
        <button onClick={load}><RefreshCw size={16}/> Actualizar</button>
        <button className="policies-close" onClick={onClose}><X size={20}/></button>
      </div>
    </header>

    {error&&<div className="policies-error"><AlertTriangle size={16}/>{error}</div>}

    <section className="policies-kpis">
      <Kpi label="Políticas" value={policies.length}/>
      <Kpi label="Reglas activas" value={policyRules.length}/>
      <Kpi label="Servicios con snapshot" value={`${snapshotCount}/${serviceCount}`}/>
      <Kpi label="Casos registrados" value={cases.length}/>
    </section>

    <section className="policies-layout">
      <aside className="policies-list">
        <header><span className="eyebrow">VERSIONES</span><h2>Políticas disponibles</h2></header>
        {policies.map(item=><button key={item.id} className={item.id===policy?.id?'active':''} onClick={()=>setSelectedId(item.id)}>
          <span className="policy-list-icon"><BookOpenCheck size={17}/></span>
          <span>
            <strong>{item.name}</strong>
            <small>{item.policy_key} · v{item.version}</small>
          </span>
          <em className={`policy-state ${item.status}`}>{item.status}</em>
        </button>)}
        {!policies.length&&<div className="policies-empty">No hay políticas registradas.</div>}
      </aside>

      {policy&&<main className="policies-main">
        <section className="policy-hero">
          <div>
            <span className="eyebrow">POLÍTICA GENERAL · CHILE</span>
            <h2>{policy.name}</h2>
            <p>{policy.description}</p>
          </div>
          <div className="policy-version-card">
            <small>VERSIÓN</small><strong>{policy.version}.0</strong>
            <span>Vigente desde {dateFmt(policy.effective_from)}</span>
          </div>
        </section>

        <section className={`policy-legal-banner ${policy.legal_review_status}`}>
          {policy.legal_review_status==='aligned'?<ShieldCheck size={20}/>:<ShieldAlert size={20}/>}
          <div>
            <strong>{legalLabel(policy.legal_review_status)}</strong>
            <p>
              {policy.legal_review_status==='needs_changes'
                ?`La política está operativa, pero ${riskyRules} regla(s) quedan marcadas para revisión humana y no deben automatizarse como resultado legal definitivo.`
                :'La política puede utilizarse conforme al estado de revisión registrado.'}
            </p>
          </div>
        </section>

        <section className="policy-grid two">
          <article className="policy-card">
            <span className="eyebrow">RESUMEN OPERATIVO</span>
            <h3>Condiciones vigentes</h3>
            <p>{policy.normalized_summary||'Sin resumen normalizado.'}</p>
          </article>
          <article className="policy-card">
            <span className="eyebrow">COBERTURA AUTOMÁTICA</span>
            <h3>{snapshotCount===serviceCount?'Todos los servicios tienen política':'Hay servicios por regularizar'}</h3>
            <p>
              Cada experiencia guarda un snapshot inmutable de la versión vigente. Si la política cambia mañana, una venta anterior conserva las condiciones que tenía al momento de ser registrada.
            </p>
            <div className="snapshot-meter"><span style={{width:`${serviceCount?Math.min(100,(snapshotCount/serviceCount)*100):0}%`}}/></div>
            <small>{snapshotCount} de {serviceCount} servicios con snapshot general.</small>
          </article>
        </section>

        <section className="policy-card policy-document-card">
          <div>
            <span className="eyebrow">DOCUMENTO FUENTE</span>
            <h3>{policy.source_document_name||'PDF original'}</h3>
            <p>SHA-256: <code>{policy.source_sha256||'pendiente'}</code></p>
          </div>
          <div className="policy-document-actions">
            <span className={pdfStored?'document-state stored':'document-state pending'}>
              {checkingPdf?'Verificando…':pdfStored?'Archivado en Supabase':'PDF pendiente de archivar'}
            </span>
            {pdfStored&&<button className="secondary-button" onClick={openPdf}><ExternalLink size={14}/> Abrir PDF</button>}
            {canEdit&&!pdfStored&&<>
              <input ref={fileRef} hidden type="file" accept="application/pdf" onChange={e=>{const f=e.target.files?.[0];if(f)void uploadPdf(f)}}/>
              <button className="primary-button" disabled={uploading} onClick={()=>fileRef.current?.click()}>
                <FileUp size={14}/>{uploading?' Archivando…':' Archivar PDF original'}
              </button>
            </>}
          </div>
        </section>

        <CancellationCasesPanel
          policy={policy}
          rules={policyRules}
          role={role}
          onChanged={load}
        />

        <PolicySimulator rules={policyRules}/>

        <section className="policy-card">
          <header className="policy-section-head">
            <div><span className="eyebrow">REGLAS ESTRUCTURADAS</span><h3>Lo que el CRM puede consultar</h3></div>
            <span>{policyRules.length} reglas</span>
          </header>
          <div className="policy-rules-table">
            <table>
              <thead><tr><th>Caso</th><th>Ventana</th><th>Resultado</th><th>Condición informada</th><th>Control</th></tr></thead>
              <tbody>{policyRules.map(rule=><tr key={rule.id}>
                <td><strong>{eventLabel(rule.event_type)}</strong><span>{rule.rule_code}</span></td>
                <td>{windowLabel(rule)}</td>
                <td><strong>{resultLabel(rule)}</strong>{rule.evidence_required&&<span>Evidencia: {rule.evidence_type||'requerida'}</span>}</td>
                <td>{rule.customer_text||'—'}</td>
                <td>{rule.conditions?.legal_review==='needs_changes'
                  ?<span className="legal-chip warning"><AlertTriangle size={12}/> Revisión humana</span>
                  :<span className="legal-chip ok"><CheckCircle2 size={12}/> Operable</span>}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </section>

        <section className="policy-grid two">
          <article className="policy-card legal-notes">
            <span className="eyebrow">REVISIÓN LEGAL PRELIMINAR</span>
            <h3>SERNAC / Ley 19.496</h3>
            <p>{policy.legal_notes||'Sin observaciones registradas.'}</p>
          </article>
          <article className="policy-card">
            <span className="eyebrow">FUENTES OFICIALES</span>
            <h3>Trazabilidad normativa</h3>
            <div className="policy-sources">{sources.map(source=><a key={source.id} href={source.url} target="_blank" rel="noreferrer">
              <span><strong>{source.title}</strong><small>{source.authority} · {source.legal_reference||'Referencia legal'}</small></span>
              <ExternalLink size={14}/>
            </a>)}</div>
          </article>
        </section>

        <details className="policy-raw">
          <summary><FileCheck2 size={15}/> Ver texto íntegro almacenado en Supabase</summary>
          <pre data-no-translate="true">{policy.raw_text||'Sin texto fuente.'}</pre>
        </details>
      </main>}
    </section>
  </div>;
}

function PolicySimulator({rules}:{rules:Rule[]}){
  const [event,setEvent]=useState('customer_cancellation');
  const [hours,setHours]=useState('72');
  const [family,setFamily]=useState('regular');

  const candidates=useMemo(()=>{
    const h=Number(hours);
    const base=rules.filter(rule=>{
      if(rule.event_type!==event)return false;
      if(Number.isFinite(h)){
        if(rule.min_hours_before!=null&&h<Number(rule.min_hours_before))return false;
        if(rule.max_hours_before!=null&&h>=Number(rule.max_hours_before))return false;
      }
      const c=rule.conditions||{};
      if(Array.isArray(c.excluded_families)&&c.excluded_families.includes(family))return false;
      if(Array.isArray(c.product_families)&&!c.product_families.includes(family))return false;
      if(c.product_family&&c.product_family!==family)return false;
      return true;
    });
    const specific=base.filter(rule=>rule.conditions?.product_family||Array.isArray(rule.conditions?.product_families));
    return (specific.length?specific:base).sort((a,b)=>a.priority-b.priority).slice(0,4);
  },[rules,event,hours,family]);

  return <section className="policy-card policy-simulator">
    <div className="policy-section-head">
      <div><span className="eyebrow">SIMULADOR INTERNO</span><h3>Buscar la regla aplicable</h3></div>
      <Scale size={18}/>
    </div>
    <p className="simulator-note">Orienta al equipo; no reemplaza revisión legal ni decide automáticamente reglas marcadas como sensibles.</p>
    <div className="simulator-fields">
      <label><span>Situación</span><select value={event} onChange={e=>setEvent(e.target.value)}>
        <option value="customer_cancellation">Cancelación pasajero</option>
        <option value="reschedule">Cambio / reprogramación</option>
        <option value="no_show">Inasistencia</option>
        <option value="late_arrival">Retraso</option>
        <option value="illness">Enfermedad</option>
        <option value="weather">Clima / cierre</option>
        <option value="substitution">Sustitución</option>
        <option value="partial_service">Servicio parcial</option>
        <option value="right_of_withdrawal">Derecho a retracto</option>
      </select></label>
      <label><span>Horas antes del servicio</span><input type="number" min="0" value={hours} onChange={e=>setHours(e.target.value)}/></label>
      <label><span>Tipo de producto</span><select value={family} onChange={e=>setFamily(e.target.value)}>
        <option value="regular">Tour regular</option>
        <option value="alta_montana">Alta montaña</option>
        <option value="uyuni">Uyuni</option>
        <option value="globo_aerostatico">Globo aerostático</option>
        <option value="experiencias_ancestrales">Experiencia ancestral</option>
        <option value="transfer">Transfer</option>
      </select></label>
    </div>
    <div className="simulator-results">
      {candidates.map(rule=><article key={rule.id} className={rule.conditions?.legal_review==='needs_changes'?'sensitive':''}>
        <div><strong>{resultLabel(rule)}</strong><small>{rule.rule_code}</small></div>
        <p>{rule.customer_text}</p>
        {rule.internal_notes&&<span>{rule.internal_notes}</span>}
      </article>)}
      {!candidates.length&&<div className="simulator-empty">
        No existe una regla contractual automática para esta combinación. Debe revisarse como caso especial / legal.
      </div>}
    </div>
  </section>;
}

function Kpi({label,value}:{label:string;value:React.ReactNode}){
  return <div className="policy-kpi"><small>{label}</small><strong>{value}</strong></div>;
}
function dateFmt(v?:string|null){
  if(!v)return 'sin fecha';
  return new Date(`${v}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
}
function legalLabel(v:string){
  if(v==='aligned')return 'Alineada';
  if(v==='needs_changes')return 'Vigente con ajustes legales recomendados';
  if(v==='not_applicable')return 'Sin revisión aplicable';
  return 'Revisión legal pendiente';
}
function eventLabel(v:string){
  const map:Record<string,string>={
    customer_cancellation:'Cancelación',no_show:'Inasistencia',illness:'Enfermedad',
    weather:'Clima / cierre',force_majeure:'Fuerza mayor',supplier_cancellation:'Cancela proveedor',
    company_cancellation:'Cancela empresa',reschedule:'Cambio / reprogramación',
    late_arrival:'Retraso',partial_service:'Servicio parcial',substitution:'Sustitución',
    right_of_withdrawal:'Retracto',other:'Otra condición'
  };
  return map[v]||v;
}
function windowLabel(rule:Rule){
  const min=rule.min_hours_before,max=rule.max_hours_before;
  if(min==null&&max==null)return 'Sin ventana fija';
  if(min!=null&&max==null)return `≥ ${formatHours(min)}`;
  if(min==null&&max!=null)return `< ${formatHours(max)}`;
  return `≥ ${formatHours(min!)} y < ${formatHours(max!)}`;
}
function formatHours(v:number){
  if(v%24===0)return `${v/24} día${v/24===1?'':'s'}`;
  return `${v} h`;
}
function resultLabel(rule:Rule){
  if(rule.action_type==='refund'&&rule.refund_percent!=null)return `${rule.refund_percent}% reembolso`;
  if(rule.action_type==='partial_refund'&&rule.refund_percent!=null)return `${rule.refund_percent}% reembolso`;
  if(rule.action_type==='no_refund')return 'Sin reembolso';
  if(rule.action_type==='reschedule')return rule.penalty_percent?`Reprogramar · hasta ${rule.penalty_percent}% penalidad`:'Reprogramar';
  if(rule.action_type==='substitution')return 'Alternativa equivalente';
  if(rule.penalty_percent!=null)return `Hasta ${rule.penalty_percent}% penalidad`;
  if(rule.refund_percent!=null)return `Hasta ${rule.refund_percent}% reembolso`;
  return 'Revisión caso a caso';
}
function safeName(v:string){
  return v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'_').replace(/^_+|_+$/g,'')||'policy.pdf';
}
async function sha256(file:File){
  const buf=await file.arrayBuffer();
  const hash=await crypto.subtle.digest('SHA-256',buf);
  return Array.from(new Uint8Array(hash)).map(x=>x.toString(16).padStart(2,'0')).join('');
}
