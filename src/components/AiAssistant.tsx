import React,{useEffect,useRef,useState} from 'react';
import {Bot,CircleCheck,KeyRound,Send,Sparkles,Settings2,WandSparkles} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import type {Lead} from '../types';
import AiResponse from './AiResponse';
import AiActionQueue from './AiActionQueue';
import './AiActionQueue.css';

type Msg={role:'user'|'assistant';content:string;mode?:string};
type AiAction={type:'create_lead'|'create_task'|'update_lead'|'add_note';payload:any};

export default function AiAssistant({leads,role,onChanged}:{leads:Lead[];role:string;onChanged?:()=>void}){
  const [messages,setMessages]=useState<Msg[]>([{role:'assistant',content:'Hola. Soy una herramienta de apoyo comercial dentro de Hotel Experience. Puedo analizar el CRM y, cuando me pidas ejecutar una acción compatible, preparar el cambio para que tú lo confirmes antes de aplicarlo.',mode:'general'}]);
  const [input,setInput]=useState('');
  const [leadId,setLeadId]=useState('');
  const [sending,setSending]=useState(false);
  const [config,setConfig]=useState<any>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [actions,setActions]=useState<AiAction[]>([]);
  const endRef=useRef<HTMLDivElement>(null);

  const loadConfig=async()=>{
    const {data:{session}}=await assertSupabase().auth.getSession();
    const r=await fetch('/api/ai-config',{headers:{Authorization:`Bearer ${session?.access_token||''}`}});
    const d=await r.json();if(r.ok)setConfig(d);
  };
  useEffect(()=>{loadConfig()},[]);
  useEffect(()=>endRef.current?.scrollIntoView({behavior:'smooth'}),[messages,sending,actions.length]);

  const send=async(text?:string)=>{
    const prompt=(text||input).trim();if(!prompt||sending)return;
    const prior=messages.slice(-10);
    setMessages(m=>[...m,{role:'user',content:prompt}]);setInput('');setSending(true);setActions([]);
    try{
      const {data:{session}}=await assertSupabase().auth.getSession();
      const headers={'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`};
      const r=await fetch('/api/ai-chat',{method:'POST',headers,body:JSON.stringify({message:prompt,leadId:leadId||null,history:prior})});
      const d=await r.json();if(!r.ok)throw new Error(d.error||'No se pudo consultar la IA.');
      setMessages(m=>[...m,{role:'assistant',content:d.answer,mode:d.responseMode||'general'}]);

      const legacy=d.action?.type==='create_lead'?[{type:'create_lead',payload:d.action.payload} as AiAction]:[];
      if(legacy.length){setActions(legacy)}
      else if(role!=='viewer'){
        const ar=await fetch('/api/ai-action-plan',{method:'POST',headers,body:JSON.stringify({message:prompt,leadId:leadId||null,history:[...prior,{role:'assistant',content:d.answer}]})});
        if(ar.ok){const planned=await ar.json();if(Array.isArray(planned.actions)&&planned.actions.length)setActions(planned.actions)}
      }
    }catch(e:any){setMessages(m=>[...m,{role:'assistant',content:`Error: ${e.message||'No fue posible responder.'}`,mode:'general'}])}
    finally{setSending(false)}
  };

  const actionExecuted=(text:string)=>{
    setMessages(m=>[...m,{role:'assistant',content:text,mode:'general'}]);
    onChanged?.();
  };

  return <div className="ai-layout">
    <section className="ai-main">
      <header className="ai-hero">
        <div><span className="eyebrow">HERRAMIENTA DE APOYO · API CONECTABLE</span><h2>Asistente comercial</h2><p>Consulta tu CRM y prepara acciones en lenguaje natural. <b>Ningún cambio se ejecuta sin tu confirmación.</b></p></div>
        <div className={config?.isEnabled&&config?.hasKey?'ai-status online':'ai-status'}><span/><div><b>{config?.isEnabled&&config?.hasKey?'API conectada':'Sin configurar'}</b><small>{config?.model||'API compatible'}</small></div></div>
      </header>

      <div className="ai-contextbar">
        <label><span>Contexto de lead</span><select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">CRM general</option>{leads.map(l=><option key={l.id} value={l.id}>{l.reserva} · {l.codigo}</option>)}</select></label>
        {role==='admin'&&<button className="secondary-button" onClick={()=>setSettingsOpen(true)}><Settings2 size={16}/> Configurar IA</button>}
      </div>

      <div className="quick-ai">{[
        '¿Qué leads necesitan seguimiento hoy?',
        'Dame un resumen comercial para comenzar el día.',
        'Revisa pagos y operación pendientes.',
        'Sugiere productos para el lead seleccionado.',
        'Crea una tarea para el lead seleccionado y déjala pendiente.',
        'Agrega una nota al lead seleccionado con lo que te indicaré.'
      ].map(x=><button key={x} onClick={()=>send(x)}><WandSparkles size={15}/>{x}</button>)}</div>

      <section className="chat-window">
        {messages.map((m,i)=><article className={`chat-message ${m.role}`} key={i}><div className="chat-avatar">{m.role==='assistant'?<Bot size={17}/>:<span>U</span>}</div><div><small>{m.role==='assistant'?'Hotel Experience IA':'Tú'}</small>{m.role==='assistant'?<AiResponse content={m.content} mode={m.mode}/>:<p>{m.content}</p>}</div></article>)}
        {sending&&<article className="chat-message assistant ai-thinking" aria-live="polite" aria-busy="true"><div className="chat-avatar thinking-avatar"><Sparkles size={17}/></div><div><small>Hotel Experience IA · generando respuesta</small><div className="thinking-bubble"><span>Consultando CRM, catálogo y reglas de venta</span><span className="thinking-dots"><i></i><i></i><i></i></span></div></div></article>}
        <div ref={endRef}/>
      </section>

      <AiActionQueue actions={actions} setActions={setActions} leads={leads} onExecuted={actionExecuted}/>

      <div className="chat-composer"><textarea value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Pregunta o pide una acción: crear tarea, cambiar estado, agregar nota…"/><button className="primary-button ai-send-button" disabled={sending||!input.trim()} onClick={()=>send()}>{sending?<span className="send-spinner"/>:<Send size={17}/>}</button></div>
    </section>

    <aside className="ai-guide">
      <span className="eyebrow">CÓMO TRABAJA</span><h3>Reglas integradas</h3>
      <div className="ai-rule"><CircleCheck size={16}/><span>Analiza CRM, catálogo y valores oficiales.</span></div>
      <div className="ai-rule"><CircleCheck size={16}/><span>TV1.2 se resuelve por tour_id → modalidad → pax.</span></div>
      <div className="ai-rule"><CircleCheck size={16}/><span>No inventa valores ni tramos faltantes.</span></div>
      <div className="ai-rule"><CircleCheck size={16}/><span>Puede preparar leads, tareas, notas y cambios de estado/prioridad.</span></div>
      <div className="ai-rule"><CircleCheck size={16}/><span>Las acciones aparecen como propuesta editable.</span></div>
      <div className="ai-rule"><CircleCheck size={16}/><span>Nada se modifica hasta que una persona pulse Confirmar.</span></div>
      {config?.salesPrompt&&<div className="ai-custom-rule"><span className="eyebrow">PROMPT COMERCIAL ACTIVO</span><p>{config.salesPrompt}</p></div>}
    </aside>

    {settingsOpen&&<AiSettings config={config} onClose={()=>setSettingsOpen(false)} onSaved={()=>{setSettingsOpen(false);loadConfig()}}/>}
  </div>;
}

function AiSettings({config,onClose,onSaved}:{config:any;onClose:()=>void;onSaved:()=>void}){
  const [baseUrl,setBaseUrl]=useState(config?.baseUrl||'');
  const [model,setModel]=useState(config?.model||'');
  const [apiKey,setApiKey]=useState('');
  const [enabled,setEnabled]=useState(config?.isEnabled??true);
  const [salesPrompt,setSalesPrompt]=useState(config?.salesPrompt||'');
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState('');
  const save=async(test=false)=>{
    setBusy(true);setResult('');
    try{const {data:{session}}=await assertSupabase().auth.getSession();const r=await fetch('/api/ai-config',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},body:JSON.stringify({baseUrl,model,apiKey,enabled,salesPrompt,test})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Error de configuración');setResult(test?'Conexión correcta.':'Configuración guardada.');if(!test)setTimeout(onSaved,600)}catch(e:any){setResult(e.message)}finally{setBusy(false)}
  };
  return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card ai-settings-card" onMouseDown={e=>e.stopPropagation()}><header><div><span className="eyebrow">PROVEEDOR LIBRE</span><h2>Configurar IA</h2></div><button className="icon-button" onClick={onClose}>×</button></header><p>Conecta cualquier API compatible con el formato OpenAI <code>/chat/completions</code>. La clave se cifra antes de guardarse y nunca vuelve al navegador.</p><label className="field"><span>Base URL</span><input value={baseUrl} onChange={e=>setBaseUrl(e.target.value)} placeholder="https://tu-proveedor.com/v1"/></label><label className="field"><span>Modelo</span><input value={model} onChange={e=>setModel(e.target.value)} placeholder="nombre-del-modelo"/></label><label className="field"><span>API Key {config?.hasKey?'(dejar vacío para conservar)':''}</span><div className="input-icon"><KeyRound size={16}/><input type="password" value={apiKey} onChange={e=>setApiKey(e.target.value)} placeholder={config?.hasKey?'•••••••• configurada':'Pega la API key'}/><span/></div></label><label className="field"><span>Prompt comercial adicional</span><textarea value={salesPrompt} onChange={e=>setSalesPrompt(e.target.value)} rows={7}/></label><label className="toggle-row"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/><span>IA habilitada para el equipo</span></label>{result&&<div className="action-message">{result}</div>}<div className="modal-buttons"><button className="secondary-button" disabled={busy} onClick={()=>save(true)}>Probar conexión</button><button className="primary-button" disabled={busy||!baseUrl||!model} onClick={()=>save(false)}>{busy?'Guardando...':'Guardar configuración'}</button></div></section></div>;
}
