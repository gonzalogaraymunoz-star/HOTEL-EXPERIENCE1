import React,{useState} from 'react';
import {CheckCircle2,ClipboardList,FilePenLine,PlusCircle,StickyNote,Trash2} from 'lucide-react';
import type {Lead} from '../types';
import {createActivity,createManualLead,createTask,updateLead} from '../lib/api';

type AiAction={type:'create_lead'|'create_task'|'update_lead'|'add_note';payload:any};

export default function AiActionQueue({actions,setActions,leads,onExecuted}:{actions:AiAction[];setActions:(x:AiAction[])=>void;leads:Lead[];onExecuted:(text:string)=>void}){
  const [busy,setBusy]=useState<number|null>(null);
  if(!actions.length)return null;
  const patch=(i:number,payload:any)=>setActions(actions.map((a,idx)=>idx===i?{...a,payload}:a));
  const remove=(i:number)=>setActions(actions.filter((_,idx)=>idx!==i));
  const confirm=async(i:number)=>{
    const action=actions[i];setBusy(i);
    try{
      let result='Acción realizada.';
      if(action.type==='create_lead'){
        const created=await createManualLead(action.payload);result=`Lead creado: ${created.codigo} · ${created.reserva}.`;
      }
      if(action.type==='create_task'){
        await createTask({...action.payload,status:'Pendiente'});const lead=leads.find(l=>l.id===action.payload.lead_id);result=`Tarea creada${lead?` para ${lead.reserva}`:''}: ${action.payload.title}.`;
      }
      if(action.type==='update_lead'){
        await updateLead(action.payload.lead_id,action.payload.changes||{});const lead=leads.find(l=>l.id===action.payload.lead_id);result=`Lead actualizado${lead?`: ${lead.reserva}`:''}.`;
      }
      if(action.type==='add_note'){
        await createActivity({lead_id:action.payload.lead_id,type:'nota',title:'Nota interna creada desde IA',body:action.payload.body,created_by:'Asistente IA · confirmado por usuario'});const lead=leads.find(l=>l.id===action.payload.lead_id);result=`Nota agregada${lead?` a ${lead.reserva}`:''}.`;
      }
      remove(i);onExecuted(result);
    }catch(e:any){alert(e.message||'No se pudo ejecutar la acción.')}
    finally{setBusy(null)}
  };

  return <section className="ai-action-queue">
    <div className="ai-action-queue-head"><div><span className="eyebrow">ACCIONES PROPUESTAS</span><h3>{actions.length} cambio(s) esperando confirmación</h3><p>La IA no puede ejecutarlos sola. Revisa cada uno antes de confirmar.</p></div><button className="secondary-button" onClick={()=>setActions([])}>Descartar todas</button></div>
    <div className="ai-action-queue-list">{actions.map((action,i)=><article key={`${action.type}-${i}`} className="ai-action-item">
      <div className="ai-action-item-icon">{iconFor(action.type)}</div>
      <div className="ai-action-item-main"><strong>{titleFor(action.type)}</strong><ActionEditor action={action} leads={leads} onChange={p=>patch(i,p)}/></div>
      <div className="ai-action-item-buttons"><button className="icon-button" onClick={()=>remove(i)} title="Descartar"><Trash2 size={15}/></button><button className="primary-button" disabled={busy!==null||!valid(action)} onClick={()=>confirm(i)}>{busy===i?'Aplicando…':<><CheckCircle2 size={14}/> Confirmar</>}</button></div>
    </article>)}</div>
  </section>;
}

function ActionEditor({action,leads,onChange}:{action:AiAction;leads:Lead[];onChange:(p:any)=>void}){
  const p=action.payload||{};
  if(action.type==='create_lead')return <div className="ai-action-fields"><label><span>Cliente</span><input value={p.reserva||''} onChange={e=>onChange({...p,reserva:e.target.value})}/></label><label><span>Pax</span><input type="number" min={1} value={p.numero_pax||1} onChange={e=>onChange({...p,numero_pax:Number(e.target.value)})}/></label><label><span>Contacto</span><input value={p.contacto||''} onChange={e=>onChange({...p,contacto:e.target.value})}/></label><label><span>Hotel</span><input value={p.empresa_ejecuta||''} onChange={e=>onChange({...p,empresa_ejecuta:e.target.value})}/></label></div>;
  if(action.type==='create_task')return <div className="ai-action-fields"><label className="wide"><span>Tarea</span><input value={p.title||''} onChange={e=>onChange({...p,title:e.target.value})}/></label><label><span>Lead</span><select value={p.lead_id||''} onChange={e=>onChange({...p,lead_id:e.target.value||null})}><option value="">General</option>{leads.map(l=><option key={l.id} value={l.id}>{l.reserva} · {l.codigo}</option>)}</select></label><label><span>Prioridad</span><select value={p.priority||'Media'} onChange={e=>onChange({...p,priority:e.target.value})}>{['Baja','Media','Alta','Urgente'].map(x=><option key={x}>{x}</option>)}</select></label><label><span>Vencimiento</span><input type="datetime-local" value={toLocalInput(p.due_date)} onChange={e=>onChange({...p,due_date:e.target.value?new Date(e.target.value).toISOString():null})}/></label></div>;
  if(action.type==='update_lead')return <div className="ai-action-fields"><label><span>Lead</span><select value={p.lead_id||''} onChange={e=>onChange({...p,lead_id:e.target.value})}>{leads.map(l=><option key={l.id} value={l.id}>{l.reserva} · {l.codigo}</option>)}</select></label>{p.changes?.estado!==undefined&&<label><span>Estado</span><select value={p.changes.estado} onChange={e=>onChange({...p,changes:{...p.changes,estado:e.target.value}})}>{['nuevo','contactado','cotizado','confirmado','perdido'].map(x=><option key={x} value={x}>{x}</option>)}</select></label>}{p.changes?.prioridad!==undefined&&<label><span>Prioridad</span><select value={p.changes.prioridad} onChange={e=>onChange({...p,changes:{...p.changes,prioridad:e.target.value}})}>{['Baja','Media','Alta','Urgente'].map(x=><option key={x}>{x}</option>)}</select></label>}</div>;
  return <div className="ai-action-fields"><label><span>Lead</span><select value={p.lead_id||''} onChange={e=>onChange({...p,lead_id:e.target.value})}>{leads.map(l=><option key={l.id} value={l.id}>{l.reserva} · {l.codigo}</option>)}</select></label><label className="wide"><span>Nota</span><textarea rows={3} value={p.body||''} onChange={e=>onChange({...p,body:e.target.value})}/></label></div>;
}
function valid(a:AiAction){const p=a.payload||{};if(a.type==='create_lead')return Boolean(String(p.reserva||'').trim());if(a.type==='create_task')return Boolean(String(p.title||'').trim());if(a.type==='update_lead')return Boolean(p.lead_id&&Object.keys(p.changes||{}).length);return Boolean(p.lead_id&&String(p.body||'').trim())}
function iconFor(t:string){return t==='create_lead'?<PlusCircle size={17}/>:t==='create_task'?<ClipboardList size={17}/>:t==='update_lead'?<FilePenLine size={17}/>:<StickyNote size={17}/>}
function titleFor(t:string){return t==='create_lead'?'Crear lead':t==='create_task'?'Crear tarea':t==='update_lead'?'Actualizar lead':'Agregar nota'}
function toLocalInput(v:any){if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const p=(n:number)=>String(n).padStart(2,'0');return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`}
