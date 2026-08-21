import React,{useMemo,useState} from 'react';
import {CheckCircle2,Clock3,Mail,Plus,Send} from 'lucide-react';
import type {Lead,CRMTask} from '../types';
import {createTask,updateTask,createActivity} from '../lib/api';
import {assertSupabase} from '../lib/supabase';

export default function TasksWorkspace({leads,tasks,refresh}:{leads:Lead[];tasks:CRMTask[];refresh:()=>void|Promise<void>}){
  const [title,setTitle]=useState('');
  const [leadId,setLeadId]=useState('');
  const [due,setDue]=useState('');
  const [priority,setPriority]=useState('Media');
  const [email,setEmail]=useState('');
  const [notes,setNotes]=useState('');
  const [sendNow,setSendNow]=useState(true);
  const [saving,setSaving]=useState(false);
  const [sendingId,setSendingId]=useState('');
  const sorted=useMemo(()=>[...tasks].sort((a,b)=>String(a.status==='Completada').localeCompare(String(b.status==='Completada'))||String(a.due_date||'9999').localeCompare(String(b.due_date||'9999'))),[tasks]);
  const selectedLead=leads.find(l=>l.id===leadId);

  const sendEmail=async(task:CRMTask,to:string)=>{
    if(!to||!to.includes('@')) throw new Error('Ingresa un correo válido.');
    const {data:{session}}=await assertSupabase().auth.getSession();
    const lead=leads.find(l=>l.id===task.lead_id);
    const r=await fetch('/api/task-email',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:`Bearer ${session?.access_token||''}`},
      body:JSON.stringify({
        to,
        taskTitle:task.title,
        dueDate:task.due_date||null,
        priority:task.priority,
        notes:task.notes||'',
        leadName:lead?.reserva||'',
        leadCode:lead?.codigo||''
      })
    });
    const body=await r.json();
    if(!r.ok) throw new Error(body.error||'No se pudo enviar el correo.');
    if(task.lead_id){
      await createActivity({lead_id:task.lead_id,type:'task_email_sent',title:'Tarea enviada por correo',body:`${task.title} → ${to}`,created_by:'CRM'});
    }
  };

  const add=async()=>{
    if(!title.trim()) return alert('Escribe una tarea.');
    if(sendNow&&(!email||!email.includes('@'))) return alert('Para enviar por correo, ingresa un email válido.');
    setSaving(true);
    try{
      const dueIso=due?new Date(due).toISOString():null;
      const task=await createTask({lead_id:leadId||null,title:title.trim(),due_date:dueIso,priority,status:'Pendiente',assigned_to:email||null,notes:notes||null});
      if(sendNow&&email) await sendEmail(task,email);
      setTitle('');setLeadId('');setDue('');setPriority('Media');setEmail('');setNotes('');setSendNow(true);
      await refresh();
      alert(sendNow?'Tarea creada y correo enviado.':'Tarea creada.');
    }catch(e:any){alert(e?.message||'No se pudo crear la tarea.')}finally{setSaving(false)}
  };

  const resend=async(task:CRMTask)=>{
    const to=task.assigned_to||prompt('Correo destinatario:')||'';
    if(!to)return;
    setSendingId(task.id);
    try{await sendEmail(task,to);alert(`Correo enviado a ${to}.`)}catch(e:any){alert(e?.message||'No se pudo enviar.')}finally{setSendingId('')}
  };

  return <div className="view-stack">
    <section className="surface-card">
      <div className="section-head-crm"><div><h2>Nueva tarea</h2><p>Crea el seguimiento y, si quieres, envíalo inmediatamente por correo.</p></div></div>
      <div style={{display:'grid',gridTemplateColumns:'2fr 1fr 1fr',gap:10}}>
        <label style={fieldStyle}><span style={labelStyle}>Tarea *</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Ej. Confirmar disponibilidad"/></label>
        <label style={fieldStyle}><span style={labelStyle}>Cliente</span><select value={leadId} onChange={e=>setLeadId(e.target.value)}><option value="">Sin lead asociado</option>{leads.map(l=><option value={l.id} key={l.id}>{l.reserva} · {l.codigo}</option>)}</select></label>
        <label style={fieldStyle}><span style={labelStyle}>Prioridad</span><select value={priority} onChange={e=>setPriority(e.target.value)}>{['Baja','Media','Alta','Urgente'].map(x=><option key={x}>{x}</option>)}</select></label>
        <label style={fieldStyle}><span style={labelStyle}>Fecha y hora</span><input type="datetime-local" value={due} onChange={e=>setDue(e.target.value)}/></label>
        <label style={fieldStyle}><span style={labelStyle}>Correo destinatario</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="equipo@correo.com"/></label>
        <label style={{...fieldStyle,gridColumn:'span 1'}}><span style={labelStyle}>Notas</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Contexto breve de la tarea"/></label>
      </div>
      {selectedLead&&<div style={{marginTop:10,fontSize:11,color:'#6e685f'}}>Asociada a <b>{selectedLead.reserva}</b> · {selectedLead.codigo}</div>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginTop:14,flexWrap:'wrap'}}>
        <label style={{display:'flex',alignItems:'center',gap:8,fontSize:11}}><input type="checkbox" checked={sendNow} onChange={e=>setSendNow(e.target.checked)}/><Mail size={14}/> Enviar también por correo</label>
        <button className="primary-button" disabled={saving} onClick={add}>{saving?'Guardando…':sendNow?'Crear y enviar':'Crear tarea'} {sendNow?<Send size={15}/>:<Plus size={15}/>}</button>
      </div>
      <div style={{marginTop:10,fontSize:10,color:'#766f65'}}>El correo usa RESEND_API_KEY en Vercel. La tarea siempre queda guardada en Supabase.</div>
    </section>

    <section className="surface-card">
      <div className="section-head-crm"><div><h2>Tareas</h2><p>Seguimiento pendiente y completado.</p></div></div>
      <div className="task-board">{sorted.map(t=>{const l=leads.find(x=>x.id===t.lead_id);return <article key={t.id}>
        <button className={t.status==='Completada'?'task-check done':'task-check'} onClick={async()=>{await updateTask(t.id,{status:t.status==='Completada'?'Pendiente':'Completada'});refresh()}}>{t.status==='Completada'?<CheckCircle2/>:<Clock3/>}</button>
        <div style={{minWidth:0,flex:1}}><strong>{t.title}</strong><p>{l?.reserva||'General'} · {t.priority}{t.assigned_to?` · ${t.assigned_to}`:''}</p></div>
        <span>{t.due_date?new Date(t.due_date).toLocaleString('es-CL',{dateStyle:'short',timeStyle:'short'}):'Sin fecha'}</span>
        <button className="operation-button" disabled={sendingId===t.id} onClick={()=>resend(t)}><Mail size={13}/>{sendingId===t.id?'Enviando…':'Enviar correo'}</button>
      </article>})}</div>
    </section>
  </div>
}

const fieldStyle:React.CSSProperties={display:'grid',gap:5};
const labelStyle:React.CSSProperties={fontSize:9,fontWeight:700,letterSpacing:'.08em',textTransform:'uppercase',color:'#6e685f'};
