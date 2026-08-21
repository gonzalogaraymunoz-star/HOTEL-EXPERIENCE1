import React,{useEffect,useMemo,useState} from 'react';
import {
  AlertTriangle,CheckCircle2,ChevronDown,ClipboardCheck,Clock3,Gavel,
  RefreshCw,Search,ShieldAlert
} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import {createActivity} from '../lib/api';
import './CancellationCasesPanel.css';

type Policy={
  id:string;
  policy_key:string;
  version:number;
  name:string;
};

type Rule={
  id:string;
  policy_id:string;
  rule_code:string;
  event_type:string;
  applies_to:string;
  min_hours_before:number|null;
  max_hours_before:number|null;
  refund_percent:number|null;
  penalty_percent:number|null;
  action_type:string;
  evidence_required:boolean;
  evidence_type:string|null;
  conditions:any;
  customer_text:string|null;
  internal_notes:string|null;
  priority:number;
  active:boolean;
};

type LeadRow={
  id:string;
  codigo:string;
  reserva:string;
  empresa_ejecuta?:string|null;
  numero_pax:number;
};

type ServiceRow={
  id:string;
  lead_id:string;
  producto:string;
  fecha_servicio?:string|null;
  numero_pax:number;
  precio_venta:number;
  estado_operacion:string;
  estado_pago:string;
};

type SnapshotRow={
  id:string;
  lead_service_id:string;
  policy_id:string;
  policy_version:number;
  policy_snapshot:any;
  rules_snapshot:any[];
};

type AssignmentRow={
  lead_service_id:string;
  pickup_time?:string|null;
  meeting_point?:string|null;
};

type CaseRow={
  id:string;
  lead_id?:string|null;
  lead_service_id?:string|null;
  policy_snapshot_id?:string|null;
  policy_rule_id?:string|null;
  event_type:string;
  event_source:string;
  requested_at:string;
  service_date_snapshot?:string|null;
  reason?:string|null;
  evidence_summary?:string|null;
  calculated_refund_percent?:number|null;
  calculated_refund_amount?:number|null;
  final_refund_amount?:number|null;
  currency:string;
  resolution_type?:string|null;
  status:string;
  legal_override:boolean;
  legal_override_reason?:string|null;
  notes?:string|null;
  resolved_at?:string|null;
  created_at:string;
};

const EVENT_OPTIONS=[
  ['customer_cancellation','Cancelación del pasajero'],
  ['reschedule','Cambio / reprogramación'],
  ['no_show','Inasistencia / no-show'],
  ['late_arrival','Retraso'],
  ['illness','Enfermedad'],
  ['weather','Clima / cierre'],
  ['substitution','Sustitución de experiencia'],
  ['partial_service','Servicio parcial'],
  ['force_majeure','Fuerza mayor'],
  ['supplier_cancellation','Cancelación del proveedor'],
  ['company_cancellation','Cancelación de la empresa'],
  ['right_of_withdrawal','Derecho a retracto'],
  ['other','Otro caso']
] as const;

const FAMILY_OPTIONS=[
  ['regular','Tour regular'],
  ['alta_montana','Alta montaña'],
  ['uyuni','Uyuni'],
  ['globo_aerostatico','Globo aerostático'],
  ['experiencias_ancestrales','Experiencia ancestral'],
  ['transfer','Transfer']
] as const;

export default function CancellationCasesPanel({
  policy,rules,role,onChanged
}:{
  policy:Policy;
  rules:Rule[];
  role:string;
  onChanged:()=>void|Promise<void>;
}){
  const [leads,setLeads]=useState<LeadRow[]>([]);
  const [services,setServices]=useState<ServiceRow[]>([]);
  const [snapshots,setSnapshots]=useState<SnapshotRow[]>([]);
  const [assignments,setAssignments]=useState<AssignmentRow[]>([]);
  const [cases,setCases]=useState<CaseRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [query,setQuery]=useState('');
  const [selectedServiceId,setSelectedServiceId]=useState('');
  const [eventType,setEventType]=useState('customer_cancellation');
  const [eventSource,setEventSource]=useState('customer');
  const [requestedAt,setRequestedAt]=useState(localDateTime());
  const [family,setFamily]=useState('regular');
  const [reason,setReason]=useState('');
  const [evidence,setEvidence]=useState('');
  const [resolveCase,setResolveCase]=useState<CaseRow|null>(null);
  const [resolution,setResolution]=useState({
    status:'approved',
    resolution_type:'partial_refund',
    final_refund_amount:'0',
    notes:''
  });

  const canCreate=role!=='viewer';
  const canResolve=['admin','manager'].includes(role);

  const load=async()=>{
    setLoading(true);
    try{
      const db=assertSupabase();
      const [leadRows,serviceRows,snapshotRows,assignmentRows,caseRows]=await Promise.all([
        db.from('leads')
          .select('id,codigo,reserva,empresa_ejecuta,numero_pax')
          .order('created_at',{ascending:false})
          .limit(600),
        db.from('lead_services')
          .select('id,lead_id,producto,fecha_servicio,numero_pax,precio_venta,estado_operacion,estado_pago')
          .order('fecha_servicio',{ascending:false})
          .limit(1400),
        db.from('service_policy_snapshots')
          .select('id,lead_service_id,policy_id,policy_version,policy_snapshot,rules_snapshot')
          .eq('layer','company')
          .limit(1400),
        db.from('service_assignments')
          .select('lead_service_id,pickup_time,meeting_point')
          .limit(1400),
        db.from('cancellation_cases')
          .select('id,lead_id,lead_service_id,policy_snapshot_id,policy_rule_id,event_type,event_source,requested_at,service_date_snapshot,reason,evidence_summary,calculated_refund_percent,calculated_refund_amount,final_refund_amount,currency,resolution_type,status,legal_override,legal_override_reason,notes,resolved_at,created_at')
          .order('created_at',{ascending:false})
          .limit(80)
      ]);

      for(const result of [leadRows,serviceRows,snapshotRows,assignmentRows,caseRows]){
        if(result.error)throw result.error;
      }

      const nextLeads=(leadRows.data||[]) as LeadRow[];
      const nextServices=(serviceRows.data||[]) as ServiceRow[];

      setLeads(nextLeads);
      setServices(nextServices);
      setSnapshots((snapshotRows.data||[]) as SnapshotRow[]);
      setAssignments((assignmentRows.data||[]) as AssignmentRow[]);
      setCases((caseRows.data||[]) as CaseRow[]);

      if(!selectedServiceId||!nextServices.some(s=>s.id===selectedServiceId)){
        const today=isoDate(new Date());
        const preferred=[...nextServices]
          .filter(s=>s.estado_operacion!=='Cancelado')
          .sort((a,b)=>{
            const af=a.fecha_servicio&&a.fecha_servicio>=today?0:1;
            const bf=b.fecha_servicio&&b.fecha_servicio>=today?0:1;
            return af-bf||String(a.fecha_servicio||'9999-12-31').localeCompare(String(b.fecha_servicio||'9999-12-31'));
          })[0]||nextServices[0];
        setSelectedServiceId(preferred?.id||'');
        if(preferred)setFamily(inferFamily(preferred.producto));
      }
    }catch(e:any){
      alert(e?.message||'No se pudieron cargar los casos de cancelación.');
    }finally{
      setLoading(false);
    }
  };

  useEffect(()=>{void load()},[policy.id]);

  const leadMap=useMemo(()=>new Map(leads.map(l=>[l.id,l])),[leads]);
  const snapshotMap=useMemo(()=>new Map(snapshots.map(s=>[s.lead_service_id,s])),[snapshots]);
  const assignmentMap=useMemo(()=>new Map(assignments.map(a=>[a.lead_service_id,a])),[assignments]);

  const selectedService=services.find(s=>s.id===selectedServiceId)||null;
  const selectedLead=selectedService?leadMap.get(selectedService.lead_id)||null:null;
  const selectedSnapshot=selectedService?snapshotMap.get(selectedService.id)||null:null;
  const selectedAssignment=selectedService?assignmentMap.get(selectedService.id)||null:null;

  const serviceOptions=useMemo(()=>{
    const term=normalize(query);
    return [...services]
      .filter(service=>{
        if(!term)return true;
        const lead=leadMap.get(service.lead_id);
        return normalize([
          lead?.codigo,lead?.reserva,lead?.empresa_ejecuta,
          service.producto,service.fecha_servicio
        ].filter(Boolean).join(' ')).includes(term);
      })
      .sort((a,b)=>{
        const ac=a.estado_operacion==='Cancelado'?1:0;
        const bc=b.estado_operacion==='Cancelado'?1:0;
        return ac-bc||String(b.fecha_servicio||'').localeCompare(String(a.fecha_servicio||''));
      })
      .slice(0,160);
  },[services,leadMap,query]);

  const serviceMoment=useMemo(()=>{
    if(!selectedService?.fecha_servicio)return null;
    const time=selectedAssignment?.pickup_time?String(selectedAssignment.pickup_time).slice(0,5):'12:00';
    const date=new Date(`${selectedService.fecha_servicio}T${time}:00`);
    if(Number.isNaN(date.getTime()))return null;
    return {
      date,
      time,
      estimated:!selectedAssignment?.pickup_time
    };
  },[selectedService?.id,selectedService?.fecha_servicio,selectedAssignment?.pickup_time]);

  const hoursBefore=useMemo(()=>{
    if(!serviceMoment||!requestedAt)return null;
    const requested=new Date(requestedAt);
    if(Number.isNaN(requested.getTime()))return null;
    return (serviceMoment.date.getTime()-requested.getTime())/36e5;
  },[serviceMoment,requestedAt]);

  const rulesForEvaluation=useMemo(()=>{
    const snapshotRules=Array.isArray(selectedSnapshot?.rules_snapshot)
      ?selectedSnapshot!.rules_snapshot
      :[];
    return (snapshotRules.length?snapshotRules:rules) as Rule[];
  },[selectedSnapshot,rules]);

  const candidates=useMemo(
    ()=>resolveRules(rulesForEvaluation,eventType,hoursBefore,family),
    [rulesForEvaluation,eventType,hoursBefore,family]
  );
  const matchedRule=candidates[0]||null;

  const suggestion=useMemo(
    ()=>buildSuggestion(matchedRule,Number(selectedService?.precio_venta||0)),
    [matchedRule,selectedService?.precio_venta]
  );

  const recentCases=useMemo(()=>{
    return cases.slice(0,40);
  },[cases]);

  const chooseService=(id:string)=>{
    setSelectedServiceId(id);
    const service=services.find(s=>s.id===id);
    if(service)setFamily(inferFamily(service.producto));
  };

  const changeEvent=(value:string)=>{
    setEventType(value);
    if(value==='weather')setEventSource('weather');
    else if(value==='supplier_cancellation')setEventSource('supplier');
    else if(value==='company_cancellation')setEventSource('company');
    else if(value==='force_majeure')setEventSource('other');
    else setEventSource('customer');
  };

  const saveCase=async()=>{
    if(!canCreate)return;
    if(!selectedService||!selectedLead)return alert('Selecciona una experiencia.');
    if(!reason.trim())return alert('Describe brevemente qué ocurrió o qué solicita el pasajero.');
    if(matchedRule?.evidence_required&&!evidence.trim()){
      return alert(`Esta regla requiere evidencia: ${matchedRule.evidence_type||'documento o antecedente verificable'}.`);
    }

    const requested=new Date(requestedAt);
    if(Number.isNaN(requested.getTime()))return alert('La fecha/hora de solicitud no es válida.');

    setSaving(true);
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();
      const sensitive=isSensitive(matchedRule);
      const refundAmount=suggestion.refundAmount;

      const payload={
        lead_id:selectedLead.id,
        lead_service_id:selectedService.id,
        policy_snapshot_id:selectedSnapshot?.id||null,
        policy_rule_id:matchedRule?.id||null,
        event_type:eventType,
        event_source:eventSource,
        requested_at:requested.toISOString(),
        event_at:requested.toISOString(),
        service_date_snapshot:selectedService.fecha_servicio||null,
        reason:reason.trim(),
        evidence_summary:evidence.trim()||null,
        calculated_refund_percent:matchedRule?.refund_percent??null,
        calculated_refund_amount:refundAmount,
        final_refund_amount:null,
        currency:'CLP',
        resolution_type:resolutionTypeFor(matchedRule),
        status:sensitive||matchedRule?.evidence_required||!matchedRule?'review':'open',
        legal_override:false,
        notes:[
          `Evaluador CRM · familia ${familyLabel(family)}`,
          hoursBefore==null?'Ventana temporal no calculable':`Anticipación ${formatHours(hoursBefore)}`,
          `Política ${selectedSnapshot?.policy_snapshot?.policy_key||policy.policy_key} v${selectedSnapshot?.policy_version||policy.version}`,
          matchedRule?`Regla ${matchedRule.rule_code}`:'Sin regla contractual automática',
          sensitive?'Requiere revisión humana antes de fijar monto final':null
        ].filter(Boolean).join(' · '),
        created_by:user?.id||null
      };

      const {error}=await db.from('cancellation_cases').insert(payload);
      if(error)throw error;

      await createActivity({
        lead_id:selectedLead.id,
        type:'cancellation_case_created',
        title:'Caso de cancelación / cambio registrado',
        body:[
          selectedService.producto,
          eventLabel(eventType),
          matchedRule?`regla ${matchedRule.rule_code}`:'sin regla automática',
          refundAmount!=null?`cálculo ${money(refundAmount)}`:'monto por revisar',
          sensitive?'revisión humana requerida':null
        ].filter(Boolean).join(' · '),
        created_by:'CRM'
      });

      setReason('');
      setEvidence('');
      setRequestedAt(localDateTime());
      await load();
      await onChanged();
    }catch(e:any){
      alert(e?.message||'No se pudo registrar el caso.');
    }finally{
      setSaving(false);
    }
  };

  const startResolve=(row:CaseRow)=>{
    setResolveCase(row);
    setResolution({
      status:row.status==='review'?'approved':row.status||'approved',
      resolution_type:row.resolution_type||(
        Number(row.calculated_refund_amount||0)>0?'partial_refund':'no_refund'
      ),
      final_refund_amount:String(row.final_refund_amount??row.calculated_refund_amount??0),
      notes:row.notes||''
    });
  };

  const saveResolution=async()=>{
    if(!resolveCase||!canResolve)return;
    const finalAmount=parseMoney(resolution.final_refund_amount);
    const service=services.find(s=>s.id===resolveCase.lead_service_id);
    const lead=service?leadMap.get(service.lead_id):null;

    setSaving(true);
    try{
      const db=assertSupabase();
      const {data:{user}}=await db.auth.getUser();
      const terminal=['rejected','paid','closed'].includes(resolution.status);
      const {error}=await db.from('cancellation_cases').update({
        status:resolution.status,
        resolution_type:resolution.resolution_type,
        final_refund_amount:finalAmount,
        notes:resolution.notes.trim()||null,
        resolved_at:terminal?new Date().toISOString():null,
        resolved_by:terminal?user?.id||null:null,
        updated_at:new Date().toISOString()
      }).eq('id',resolveCase.id);
      if(error)throw error;

      if(lead&&service){
        await createActivity({
          lead_id:lead.id,
          type:'cancellation_case_updated',
          title:'Caso de cancelación / cambio actualizado',
          body:`${service.producto} · ${statusLabel(resolution.status)} · resultado ${resolutionLabel(resolution.resolution_type)} · monto final ${money(finalAmount)}`,
          created_by:'CRM'
        });
      }

      setResolveCase(null);
      await load();
      await onChanged();
    }catch(e:any){
      alert(e?.message||'No se pudo actualizar el caso.');
    }finally{
      setSaving(false);
    }
  };

  return <section className="policy-case-shell">
    <header className="policy-case-head">
      <div>
        <span className="eyebrow">CASOS REALES</span>
        <h3>Aplicar la política a una experiencia</h3>
        <p>El CRM usa el snapshot de política guardado con la venta. Sugiere una regla, pero nunca ejecuta un reembolso ni cancela el tour automáticamente.</p>
      </div>
      <button className="secondary-button compact-btn" onClick={load}><RefreshCw size={14}/> Actualizar</button>
    </header>

    <div className="policy-case-layout">
      <div className="policy-case-form">
        <div className="policy-case-search">
          <Search size={15}/>
          <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar código, pasajero, hotel o experiencia…"/>
        </div>

        <label className="case-field">
          <span>Experiencia *</span>
          <select value={selectedServiceId} onChange={e=>chooseService(e.target.value)}>
            <option value="">Seleccionar experiencia</option>
            {serviceOptions.map(service=>{
              const lead=leadMap.get(service.lead_id);
              return <option key={service.id} value={service.id}>
                {[lead?.codigo,lead?.reserva,service.producto,dateShort(service.fecha_servicio)].filter(Boolean).join(' · ')}
              </option>;
            })}
          </select>
        </label>

        {selectedService&&selectedLead&&<div className="case-service-summary">
          <div>
            <small>RESERVA</small>
            <strong>{selectedLead.reserva}</strong>
            <span>{selectedLead.codigo} · {selectedLead.empresa_ejecuta||'Sin hotel'}</span>
          </div>
          <div>
            <small>EXPERIENCIA</small>
            <strong>{selectedService.producto}</strong>
            <span>{dateLong(selectedService.fecha_servicio)} · {selectedService.numero_pax} pax · venta {money(selectedService.precio_venta)}</span>
          </div>
          <div>
            <small>POLÍTICA APLICABLE</small>
            <strong>{selectedSnapshot?`${selectedSnapshot.policy_snapshot?.name||policy.name} · v${selectedSnapshot.policy_version}`:`${policy.name} · v${policy.version}`}</strong>
            <span>{selectedSnapshot?'Snapshot de la venta':'Sin snapshot: usando política vigente como referencia'}</span>
          </div>
        </div>}

        <div className="case-grid">
          <label className="case-field">
            <span>Situación *</span>
            <select value={eventType} onChange={e=>changeEvent(e.target.value)}>
              {EVENT_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>

          <label className="case-field">
            <span>Origen</span>
            <select value={eventSource} onChange={e=>setEventSource(e.target.value)}>
              <option value="customer">Pasajero</option>
              <option value="weather">Clima</option>
              <option value="authority">Autoridad / cierre</option>
              <option value="supplier">Proveedor</option>
              <option value="company">Empresa</option>
              <option value="system">Sistema</option>
              <option value="other">Otro</option>
            </select>
          </label>

          <label className="case-field">
            <span>Solicitud recibida</span>
            <input type="datetime-local" value={requestedAt} onChange={e=>setRequestedAt(e.target.value)}/>
          </label>

          <label className="case-field">
            <span>Tipo de producto</span>
            <select value={family} onChange={e=>setFamily(e.target.value)}>
              {FAMILY_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        <div className="case-window">
          <Clock3 size={15}/>
          <div>
            <strong>{hoursBefore==null?'Ventana temporal no calculable':`${formatHours(hoursBefore)} antes del servicio`}</strong>
            <span>
              {serviceMoment
                ?`Referencia: ${dateLong(selectedService?.fecha_servicio)} ${serviceMoment.time}${serviceMoment.estimated?' · hora estimada porque no hay pickup registrado':''}`
                :'La experiencia no tiene fecha suficiente para calcular la anticipación.'}
            </span>
          </div>
        </div>

        <label className="case-field">
          <span>Motivo / contexto *</span>
          <textarea rows={3} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Qué ocurrió, qué solicita el pasajero y qué antecedentes tenemos."/>
        </label>

        {matchedRule?.evidence_required&&<label className="case-field">
          <span>Evidencia requerida · {matchedRule.evidence_type||'antecedente verificable'} *</span>
          <textarea rows={2} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Ej. certificado médico recibido, registro de no-show, cierre oficial, enlace a documento…"/>
        </label>}

        <div className={`case-rule-result ${!matchedRule||isSensitive(matchedRule)?'review':'operable'}`}>
          {!matchedRule?<ShieldAlert size={19}/>:isSensitive(matchedRule)?<AlertTriangle size={19}/>:<CheckCircle2 size={19}/>}
          <div>
            <small>{matchedRule?'REGLA ENCONTRADA':'SIN REGLA AUTOMÁTICA'}</small>
            <strong>{matchedRule?matchedRule.rule_code:'Revisión humana obligatoria'}</strong>
            <p>{matchedRule?.customer_text||'La política almacenada no contiene una regla automática para esta combinación. El caso debe documentarse y revisarse antes de resolverlo.'}</p>
            {matchedRule&&<div className="case-result-values">
              <span><b>Resultado contractual</b>{suggestion.label}</span>
              <span><b>Monto orientativo</b>{suggestion.refundAmount==null?'Por revisar':money(suggestion.refundAmount)}</span>
              <span><b>Control</b>{isSensitive(matchedRule)?'Revisión humana':'Regla operable'}</span>
            </div>}
            {matchedRule?.internal_notes&&<em>{matchedRule.internal_notes}</em>}
          </div>
        </div>

        {canCreate?<button className="primary-button case-save" disabled={saving||!selectedService} onClick={saveCase}>
          <ClipboardCheck size={16}/>{saving?' Guardando…':' Registrar caso'}
        </button>:<p className="case-readonly">Tu rol puede revisar casos, pero no registrar uno nuevo.</p>}
      </div>

      <div className="policy-case-history">
        <div className="case-history-head">
          <div><span className="eyebrow">TRAZABILIDAD</span><h4>Casos recientes</h4></div>
          <span>{cases.length}</span>
        </div>

        <div className="case-history-list">
          {recentCases.map(row=>{
            const service=services.find(s=>s.id===row.lead_service_id);
            const lead=service?leadMap.get(service.lead_id):null;
            return <article key={row.id}>
              <header>
                <div>
                  <small>{lead?.codigo||'SIN CÓDIGO'} · {dateTime(row.created_at)}</small>
                  <strong>{service?.producto||'Servicio no disponible'}</strong>
                  <span>{lead?.reserva||'Cliente'} · {eventLabel(row.event_type)}</span>
                </div>
                <b className={`case-status ${row.status}`}>{statusLabel(row.status)}</b>
              </header>
              <p>{row.reason||'Sin motivo registrado.'}</p>
              <div className="case-history-values">
                <span><small>Sugerido</small><strong>{row.calculated_refund_amount==null?'—':money(row.calculated_refund_amount)}</strong></span>
                <span><small>Final</small><strong>{row.final_refund_amount==null?'—':money(row.final_refund_amount)}</strong></span>
              </div>
              {row.notes&&<em>{row.notes}</em>}
              {canResolve&&<button className="secondary-button compact-btn" onClick={()=>startResolve(row)}>
                <Gavel size={13}/> Resolver / actualizar
              </button>}
            </article>;
          })}
          {!recentCases.length&&<div className="case-empty">Todavía no hay casos registrados.</div>}
        </div>
      </div>
    </div>

    {resolveCase&&<div className="case-resolution-backdrop" onMouseDown={()=>setResolveCase(null)}>
      <section className="case-resolution-modal" onMouseDown={e=>e.stopPropagation()}>
        <header>
          <div><span className="eyebrow">RESOLUCIÓN HUMANA</span><h3>Resolver caso</h3></div>
          <button className="icon-button" onClick={()=>setResolveCase(null)}>×</button>
        </header>

        <p>El monto calculado por la política es una referencia. Aquí un manager/admin fija el resultado real sin ejecutar todavía el pago.</p>

        <div className="case-grid">
          <label className="case-field"><span>Estado</span><select value={resolution.status} onChange={e=>setResolution(x=>({...x,status:e.target.value}))}>
            <option value="review">En revisión</option>
            <option value="approved">Aprobado</option>
            <option value="rejected">Rechazado</option>
            <option value="paid">Pagado</option>
            <option value="closed">Cerrado</option>
          </select></label>

          <label className="case-field"><span>Resolución</span><select value={resolution.resolution_type} onChange={e=>setResolution(x=>({...x,resolution_type:e.target.value}))}>
            <option value="full_refund">Reembolso total</option>
            <option value="partial_refund">Reembolso parcial</option>
            <option value="no_refund">Sin reembolso</option>
            <option value="reschedule">Reprogramación</option>
            <option value="credit">Crédito</option>
            <option value="substitution">Sustitución</option>
            <option value="other">Otra</option>
          </select></label>

          <label className="case-field"><span>Monto final CLP</span><input inputMode="numeric" value={resolution.final_refund_amount} onChange={e=>setResolution(x=>({...x,final_refund_amount:e.target.value.replace(/[^\d.,]/g,'')}))}/></label>
        </div>

        <label className="case-field"><span>Notas de resolución</span><textarea rows={4} value={resolution.notes} onChange={e=>setResolution(x=>({...x,notes:e.target.value}))} placeholder="Justificación, costos no recuperables, acuerdo con pasajero, evidencia revisada…"/></label>

        <div className="case-resolution-actions">
          <button className="secondary-button" onClick={()=>setResolveCase(null)}>Cancelar</button>
          <button className="primary-button" disabled={saving} onClick={saveResolution}>{saving?'Guardando…':'Guardar resolución'}</button>
        </div>
      </section>
    </div>}
  </section>;
}

function resolveRules(rules:Rule[],event:string,hours:number|null,family:string){
  const base=rules.filter(rule=>{
    if(!rule.active&&rule.active!==undefined)return false;
    if(rule.event_type!==event)return false;

    if(hours!=null&&Number.isFinite(hours)){
      if(rule.min_hours_before!=null&&hours<Number(rule.min_hours_before))return false;
      if(rule.max_hours_before!=null&&hours>=Number(rule.max_hours_before))return false;
    }

    const c=rule.conditions||{};
    if(Array.isArray(c.excluded_families)&&c.excluded_families.includes(family))return false;
    if(Array.isArray(c.product_families)&&!c.product_families.includes(family))return false;
    if(c.product_family&&c.product_family!==family)return false;
    if(c.regular_tours_only&&family!=='regular')return false;
    return true;
  });

  const specific=base.filter(rule=>{
    const c=rule.conditions||{};
    return Boolean(c.product_family||Array.isArray(c.product_families)||c.regular_tours_only);
  });

  return (specific.length?specific:base)
    .sort((a,b)=>Number(a.priority||100)-Number(b.priority||100))
    .slice(0,6);
}

function isSensitive(rule:Rule|null){
  if(!rule)return true;
  const c=rule.conditions||{};
  return rule.action_type==='case_by_case'
    ||c.legal_review==='needs_changes'
    ||Boolean(c.requires_supplier_cancellable)
    ||Boolean(c.deduct_actual_nonrefundable_third_party_costs)
    ||Boolean(c.actual_issued_and_nonrecoverable_only)
    ||Boolean(c.deductions_require_validation)
    ||Boolean(c.requires_documented_irreversible_costs);
}

function buildSuggestion(rule:Rule|null,sale:number){
  if(!rule)return {label:'Revisión caso a caso',refundAmount:null as number|null};

  const refundPct=rule.refund_percent==null?null:Number(rule.refund_percent);
  const penaltyPct=rule.penalty_percent==null?null:Number(rule.penalty_percent);

  if(rule.action_type==='no_refund')return {label:'Sin reembolso',refundAmount:0};
  if((rule.action_type==='refund'||rule.action_type==='partial_refund')&&refundPct!=null){
    return {
      label:`${refundPct}% de reembolso${isSensitive(rule)?' · sujeto a revisión':''}`,
      refundAmount:round2(Math.max(0,sale)*refundPct/100)
    };
  }
  if(rule.action_type==='reschedule'){
    return {
      label:penaltyPct?`Reprogramación · penalidad hasta ${penaltyPct}%`:'Reprogramación',
      refundAmount:null
    };
  }
  if(rule.action_type==='substitution')return {label:'Alternativa equivalente',refundAmount:null};
  if(rule.action_type==='credit')return {label:'Crédito / saldo a favor',refundAmount:null};
  if(refundPct!=null)return {label:`Hasta ${refundPct}% de reembolso`,refundAmount:round2(Math.max(0,sale)*refundPct/100)};
  return {label:'Revisión caso a caso',refundAmount:null};
}

function resolutionTypeFor(rule:Rule|null){
  if(!rule)return 'other';
  if(rule.action_type==='refund')return Number(rule.refund_percent||0)>=100?'full_refund':'partial_refund';
  if(rule.action_type==='partial_refund')return 'partial_refund';
  if(rule.action_type==='no_refund')return 'no_refund';
  if(rule.action_type==='reschedule')return 'reschedule';
  if(rule.action_type==='credit')return 'credit';
  if(rule.action_type==='substitution')return 'substitution';
  return 'other';
}

function inferFamily(product:string){
  const text=normalize(product);
  if(text.includes('transfer')||text.includes('traslado'))return 'transfer';
  if(text.includes('uyuni'))return 'uyuni';
  if(text.includes('globo'))return 'globo_aerostatico';
  if(text.includes('ancestral')||text.includes('ceremonia'))return 'experiencias_ancestrales';
  if(text.includes('lascar')||text.includes('toco')||text.includes('volcan')||text.includes('ascenso')||text.includes('alta montana'))return 'alta_montana';
  return 'regular';
}

function normalize(value:any){
  return String(value||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .toLowerCase();
}
function eventLabel(value:string){
  return EVENT_OPTIONS.find(([v])=>v===value)?.[1]||value;
}
function familyLabel(value:string){
  return FAMILY_OPTIONS.find(([v])=>v===value)?.[1]||value;
}
function statusLabel(value:string){
  const map:Record<string,string>={
    open:'Abierto',review:'En revisión',approved:'Aprobado',
    rejected:'Rechazado',paid:'Pagado',closed:'Cerrado'
  };
  return map[value]||value;
}
function resolutionLabel(value:string){
  const map:Record<string,string>={
    full_refund:'Reembolso total',partial_refund:'Reembolso parcial',
    no_refund:'Sin reembolso',reschedule:'Reprogramación',
    credit:'Crédito',substitution:'Sustitución',other:'Otra'
  };
  return map[value]||value;
}
function formatHours(value:number){
  if(!Number.isFinite(value))return '—';
  const abs=Math.abs(value);
  const suffix=value<0?' después':'';
  if(abs>=48)return `${(abs/24).toFixed(abs%24===0?0:1)} días${suffix}`;
  return `${abs.toFixed(abs<10?1:0)} h${suffix}`;
}
function localDateTime(){
  const d=new Date();
  const pad=(n:number)=>String(n).padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function isoDate(d:Date){
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function dateShort(value?:string|null){
  if(!value)return 'sin fecha';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'2-digit'});
}
function dateLong(value?:string|null){
  if(!value)return 'Fecha por definir';
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-CL',{day:'2-digit',month:'long',year:'numeric'});
}
function dateTime(value:string){
  return new Date(value).toLocaleString('es-CL',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'});
}
function money(value:any){
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(Number(value||0));
}
function parseMoney(value:any){
  const raw=String(value??'').trim().replace(/\./g,'').replace(',','.');
  const parsed=Number(raw);
  return Number.isFinite(parsed)&&parsed>=0?parsed:0;
}
function round2(value:number){
  return Math.round((value+Number.EPSILON)*100)/100;
}
