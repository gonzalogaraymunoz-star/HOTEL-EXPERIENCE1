
import React,{useEffect,useMemo,useState} from 'react';
import {AlertTriangle,CheckCircle2,Database,Download,FileText,RefreshCw,Save,Sparkles,UploadCloud,WandSparkles} from 'lucide-react';
import type {Lead,LeadService} from '../types';
import {
  analyzeLinkForm,generateLinkForm,loadLinkFormTemplates,saveLinkFormTemplate,
  type LinkFormCanonicalField,type LinkFormDetectedField,type LinkFormTemplate
} from '../lib/linkForms';
import './LinkFormsWorkspace.css';

type Props={role:string;leads:Lead[];services:LeadService[]};

function serviceLabel(service:LeadService){
  const raw=service as any;
  return [raw.service_code,raw.producto,raw.fecha_servicio].filter(Boolean).join(' · ')||raw.id;
}
function targetLabel(field:LinkFormDetectedField){
  const t=field.target||{};
  if(t.kind==='xlsx_cell')return (t.sheet||'Hoja')+' · '+t.address;
  if(t.kind==='xlsx_column')return (t.sheet||'Hoja')+' · columna '+t.column+' desde fila '+t.rowStart;
  if(t.kind==='pdf_field')return 'PDF · '+t.name;
  if(t.kind==='html_input')return 'HTML · '+(t.name||t.id||field.targetKey);
  if(t.kind==='json_path')return 'JSON · '+(t.path||[]).join('.');
  return field.targetKey;
}
function confidenceLabel(value:number){
  if(value>=.9)return'Alta';
  if(value>=.72)return'Media';
  return'Revisar';
}
function formatPreview(value:unknown){
  if(value===null||value===undefined||value==='')return'—';
  if(typeof value==='object')return JSON.stringify(value);
  return String(value);
}

export default function LinkFormsWorkspace({role,leads,services}:Props){
  const canTeach=['admin','manager'].includes(String(role||''));
  const [templates,setTemplates]=useState<LinkFormTemplate[]>([]);
  const [dictionary,setDictionary]=useState<LinkFormCanonicalField[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [scope,setScope]=useState<'reservation'|'departure'>('reservation');
  const [leadId,setLeadId]=useState('');
  const [serviceId,setServiceId]=useState('');
  const [departureId,setDepartureId]=useState('');
  const [file,setFile]=useState<File|null>(null);
  const [title,setTitle]=useState('');
  const [analysis,setAnalysis]=useState<null|{
    documentKind:string;fields:LinkFormDetectedField[];warnings:string[];meta:Record<string,any>;
    contextSummary?:any;
  }>(null);
  const [lastResult,setLastResult]=useState<null|{fileName:string;url:string;filled:number;missing:number;warnings:string[]}>(null);

  const load=async()=>{
    setLoading(true);setError('');
    try{
      const body=await loadLinkFormTemplates();
      setTemplates(body.templates||[]);
      setDictionary(body.dictionary||[]);
    }catch(e:any){setError(e?.message||'No se pudo cargar LINK Forms.')}
    finally{setLoading(false)}
  };
  useEffect(()=>{void load()},[]);

  const leadServices=useMemo(()=>services.filter(service=>service.lead_id===leadId),[services,leadId]);
  const departures=useMemo(()=>{
    const map=new Map<string,{id:string;label:string}>();
    for(const service of services){
      const raw=service as any,id=String(raw.departure_id||'');
      if(!id||map.has(id))continue;
      map.set(id,{id,label:[raw.producto,raw.fecha_servicio,raw.service_code].filter(Boolean).join(' · ')||id});
    }
    return[...map.values()];
  },[services]);
  const visibleTemplates=useMemo(()=>templates.filter(t=>t.context_scope===scope),[templates,scope]);

  useEffect(()=>{
    setAnalysis(null);setLastResult(null);setError('');setMessage('');
    if(scope==='reservation')setDepartureId('');
    else{setLeadId('');setServiceId('')}
  },[scope]);

  const selectedContextValid=scope==='reservation'?Boolean(leadId):Boolean(departureId);

  const analyze=async()=>{
    if(!file){setError('Sube un formulario primero.');return}
    if(!selectedContextValid){setError(scope==='reservation'?'Selecciona una reserva para probar los datos.':'Selecciona una salida para probar los datos.');return}
    setBusy(true);setError('');setMessage('');setLastResult(null);
    try{
      const body=await analyzeLinkForm({
        file,contextScope:scope,leadId:scope==='reservation'?leadId:null,
        departureId:scope==='departure'?departureId:null,leadServiceId:scope==='reservation'?(serviceId||null):null
      });
      setAnalysis({documentKind:body.documentKind,fields:body.fields||[],warnings:body.warnings||[],meta:body.meta||{},contextSummary:body.contextSummary});
      setDictionary(body.dictionary||dictionary);
      if(!title)setTitle(file.name.replace(/\.[^.]+$/,''));
      setMessage('Formulario leído. Revisa el mapeo antes de enseñarlo.');
    }catch(e:any){setError(e?.message||'No se pudo analizar el formulario.')}
    finally{setBusy(false)}
  };

  const changeMapping=(index:number,canonicalKey:string)=>{
    setAnalysis(current=>{
      if(!current)return current;
      const fields=current.fields.slice(),definition=dictionary.find(item=>item.key===canonicalKey);
      fields[index]={...fields[index],canonicalKey,sourceCollection:definition?.collection||fields[index].sourceCollection,confidence:canonicalKey===fields[index].canonicalKey?fields[index].confidence:1,mappingSource:'manual'};
      return{...current,fields};
    });
  };

  const saveTemplate=async()=>{
    if(!canTeach){setError('Tu rol puede usar plantillas, pero no enseñar nuevas.');return}
    if(!file||!analysis){setError('Primero analiza el formulario.');return}
    const mapped=analysis.fields.filter(field=>field.canonicalKey);
    if(!mapped.length){setError('Asigna al menos una variable LINK antes de guardar.');return}
    setBusy(true);setError('');setMessage('');
    try{
      const body=await saveLinkFormTemplate({title:title.trim()||file.name,contextScope:scope,file,fields:mapped});
      setMessage('Plantilla aprendida: '+(body.template?.title||title||file.name)+'.');
      await load();
    }catch(e:any){setError(e?.message||'No se pudo guardar la plantilla.')}
    finally{setBusy(false)}
  };

  const generate=async(template:LinkFormTemplate)=>{
    if(!selectedContextValid){setError(scope==='reservation'?'Selecciona la reserva que quieres rellenar.':'Selecciona la salida que quieres rellenar.');return}
    setBusy(true);setError('');setMessage('');setLastResult(null);
    try{
      const body=await generateLinkForm({
        templateId:template.id,leadId:scope==='reservation'?leadId:null,departureId:scope==='departure'?departureId:null,
        leadServiceId:scope==='reservation'?(serviceId||null):null
      });
      setLastResult({fileName:body.fileName,url:body.url,filled:body.filled,missing:body.missing,warnings:body.warnings||[]});
      setMessage('Documento generado desde la fuente de verdad.');
    }catch(e:any){setError(e?.message||'No se pudo generar el documento.')}
    finally{setBusy(false)}
  };

  return <div className="link-forms">
    <section className="lf-hero">
      <div>
        <span className="lf-kicker"><WandSparkles size={16}/> LINK FORMS</span>
        <h1>El operador revisa. LINK rellena.</h1>
        <p>Sube un formulario, identifica qué pide, conéctalo una sola vez con las variables del sistema y reutilízalo para las próximas operaciones.</p>
      </div>
      <div className="lf-rule"><Database size={18}/><div><strong>Regla del motor</strong><span>La plantilla interpreta. Supabase entrega la verdad. Los datos faltantes quedan vacíos y visibles.</span></div></div>
    </section>

    <section className="lf-context-card">
      <div className="lf-section-title"><div><small>PASO 1</small><h2>Elige de dónde salen los datos</h2></div><button type="button" className="lf-icon-button" onClick={()=>void load()} disabled={loading||busy} title="Actualizar plantillas"><RefreshCw size={16}/></button></div>
      <div className="lf-scope-switch">
        <button className={scope==='reservation'?'active':''} onClick={()=>setScope('reservation')}>Una reserva</button>
        <button className={scope==='departure'?'active':''} onClick={()=>setScope('departure')}>Una salida / tour</button>
      </div>
      {scope==='reservation'?<div className="lf-context-grid">
        <label><span>Reserva</span><select value={leadId} onChange={e=>{setLeadId(e.target.value);setServiceId('')}}><option value="">Seleccionar…</option>{leads.map(lead=><option key={lead.id} value={lead.id}>{[lead.codigo,(lead as any).reserva].filter(Boolean).join(' · ')}</option>)}</select></label>
        <label><span>Servicio específico <em>opcional</em></span><select value={serviceId} onChange={e=>setServiceId(e.target.value)} disabled={!leadId}><option value="">Usar servicio principal</option>{leadServices.map(service=><option key={service.id} value={service.id}>{serviceLabel(service)}</option>)}</select></label>
      </div>:<div className="lf-context-grid one">
        <label><span>Salida operacional</span><select value={departureId} onChange={e=>setDepartureId(e.target.value)}><option value="">Seleccionar…</option>{departures.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      </div>}
    </section>

    <section className="lf-template-library">
      <div className="lf-section-title"><div><small>PASO 2</small><h2>Usa una plantilla aprendida</h2></div><span>{visibleTemplates.length} disponibles</span></div>
      {loading?<div className="lf-empty">Cargando plantillas…</div>:visibleTemplates.length?<div className="lf-template-grid">{visibleTemplates.map(template=><article className="lf-template-card" key={template.id}>
        <div className="lf-template-icon"><FileText size={21}/></div>
        <div className="lf-template-copy"><strong>{template.title}</strong><span>{template.document_kind.toUpperCase()} · {template.field_count||0} campos · {template.context_scope==='reservation'?'Reserva':'Salida'}</span></div>
        <button type="button" onClick={()=>void generate(template)} disabled={busy||!selectedContextValid}><Sparkles size={15}/> Rellenar</button>
      </article>)}</div>:<div className="lf-empty">Todavía no hay plantillas para este tipo de operación.</div>}
    </section>

    {canTeach&&<section className="lf-teach">
      <div className="lf-section-title"><div><small>PASO 3 · SOLO LA PRIMERA VEZ</small><h2>Enseña un formulario nuevo</h2></div><span>Se aprende una vez</span></div>
      <div className="lf-upload-row">
        <label className="lf-drop">
          <UploadCloud size={25}/>
          <strong>{file?file.name:'Subir formulario'}</strong>
          <span>XLSX · PDF editable · HTML · JSON</span>
          <input type="file" accept=".xlsx,.pdf,.html,.htm,.json,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e=>{const next=e.target.files?.[0]||null;setFile(next);setAnalysis(null);setTitle(next?next.name.replace(/\.[^.]+$/,''):'')}}/>
        </label>
        <div className="lf-upload-actions">
          <label><span>Nombre de la plantilla</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Lista operador Tatio"/></label>
          <button type="button" className="lf-primary" onClick={()=>void analyze()} disabled={busy||!file||!selectedContextValid}><WandSparkles size={16}/>{busy?'Leyendo…':'Identificar campos'}</button>
        </div>
      </div>

      {analysis&&<div className="lf-analysis">
        <div className="lf-analysis-head">
          <div><strong>{analysis.fields.length} casillas detectadas</strong><span>{analysis.contextSummary?.passengerCount??0} pasajero(s) disponibles para probar</span></div>
          <div className="lf-analysis-badges"><span>{String(analysis.documentKind).toUpperCase()}</span><span>{analysis.fields.filter(f=>f.canonicalKey).length} mapeadas</span></div>
        </div>
        {analysis.warnings.length>0&&<div className="lf-warning"><AlertTriangle size={16}/><div>{analysis.warnings.map((warning,index)=><span key={index}>{warning}</span>)}</div></div>}
        <div className="lf-mapping-table">
          <div className="lf-mapping-header"><span>Lo que pide el formulario</span><span>Variable LINK</span><span>Ejemplo real</span><span>Confianza</span></div>
          {analysis.fields.map((field,index)=><div className="lf-mapping-row" key={field.targetKey}>
            <div><strong>{field.fieldLabel}</strong><small>{targetLabel(field)}</small></div>
            <select value={field.canonicalKey||''} onChange={e=>changeMapping(index,e.target.value)}>
              <option value="">Sin mapear</option>
              {dictionary.map(item=><option key={item.key} value={item.key}>{item.label} · {item.key}</option>)}
            </select>
            <span className={field.previewValue===undefined||field.previewValue===''?'empty':''}>{formatPreview(field.previewValue)}</span>
            <span className={'lf-confidence '+(field.confidence>=.9?'high':field.confidence>=.72?'medium':'low')}>{confidenceLabel(field.confidence)}</span>
          </div>)}
        </div>
        <div className="lf-save-row"><div><strong>Cuando guardas, LINK recuerda este formulario.</strong><span>La próxima vez el operador solo elige la reserva o salida y presiona “Rellenar”.</span></div><button type="button" className="lf-primary" onClick={()=>void saveTemplate()} disabled={busy}><Save size={16}/>{busy?'Guardando…':'Guardar aprendizaje'}</button></div>
      </div>}
    </section>}

    {error&&<div className="lf-status error"><AlertTriangle size={17}/><span>{error}</span></div>}
    {message&&<div className="lf-status success"><CheckCircle2 size={17}/><span>{message}</span></div>}
    {lastResult&&<section className="lf-result">
      <div><CheckCircle2 size={22}/><div><strong>{lastResult.fileName}</strong><span>{lastResult.filled} datos escritos · {lastResult.missing} faltantes</span></div></div>
      <a href={lastResult.url} target="_blank" rel="noreferrer"><Download size={16}/> Abrir documento</a>
      {lastResult.warnings.length>0&&<div className="lf-result-warnings">{lastResult.warnings.map((warning,index)=><span key={index}>{warning}</span>)}</div>}
    </section>}
  </div>;
}
