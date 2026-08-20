import React, { useEffect, useState } from 'react';
import { Check, MailPlus, ShieldCheck, UserRound, UserRoundCog, X } from 'lucide-react';
import { assertSupabase } from '../lib/supabase';

type Profile={id:string;full_name:string|null;email:string|null;role:string;is_active:boolean;created_at:string};

export default function TeamView({currentRole}:{currentRole:string}) {
  const [profiles,setProfiles]=useState<Profile[]>([]);
  const [loading,setLoading]=useState(true);
  const [showInvite,setShowInvite]=useState(false);
  const [fullName,setFullName]=useState('');
  const [email,setEmail]=useState('');
  const [role,setRole]=useState('agent');
  const [sending,setSending]=useState(false);
  const [message,setMessage]=useState('');

  const load=async()=>{
    setLoading(true);
    const {data,error}=await assertSupabase().from('profiles').select('*').order('created_at',{ascending:true});
    if(!error)setProfiles((data||[]) as Profile[]);
    setLoading(false);
  };
  useEffect(()=>{load()},[]);

  const invite=async()=>{
    if(!fullName||!email)return;
    setSending(true);setMessage('');
    try{
      const {data:{session}}=await assertSupabase().auth.getSession();
      const r=await fetch('/api/invite-user',{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${session?.access_token||''}`},body:JSON.stringify({fullName,email,role})});
      const data=await r.json();
      if(!r.ok)throw new Error(data.error||'No se pudo invitar al usuario.');
      setMessage('Invitación enviada correctamente.');
      setFullName('');setEmail('');setRole('agent');setShowInvite(false);
      setTimeout(load,800);
    }catch(e:any){setMessage(e.message||'Error al invitar.');}
    finally{setSending(false);}
  };

  const updateProfile=async(id:string,patch:any)=>{
    const {error}=await assertSupabase().from('profiles').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);
    if(error)return alert(error.message);
    load();
  };

  return <div className="view-stack">
    <section className="team-hero">
      <div><span className="eyebrow">ACCESOS Y PERMISOS</span><h2>Equipo</h2><p>Crea cuentas, define roles y controla quién puede operar el CRM.</p></div>
      {currentRole==='admin'&&<button className="primary-button" onClick={()=>setShowInvite(true)}><MailPlus size={17}/> Invitar usuario</button>}
    </section>

    {message&&<div className="action-message">{message}</div>}

    <section className="surface-card">
      <div className="role-guide">
        <Role icon={<ShieldCheck/>} name="Admin" desc="Control total, usuarios y eliminación de leads."/>
        <Role icon={<UserRoundCog/>} name="Manager" desc="Ventas, pagos, reservas, operación y reportes."/>
        <Role icon={<UserRound/>} name="Agent" desc="Leads, reservas, tareas y seguimiento."/>
        <Role icon={<Check/>} name="Viewer" desc="Solo consulta del CRM."/>
      </div>
    </section>

    <section className="surface-card">
      <div className="section-head-crm"><div><h2>Usuarios</h2><p>{profiles.length} cuenta(s) registradas</p></div></div>
      {loading?<div className="empty-state">Cargando usuarios...</div>:<div className="team-list">
        {profiles.map(p=><article className="team-row" key={p.id}>
          <div className="avatar">{(p.full_name||p.email||'?').slice(0,1).toUpperCase()}</div>
          <div className="team-person"><strong>{p.full_name||'Sin nombre'}</strong><span>{p.email||'Sin correo'}</span></div>
          <div>
            {currentRole==='admin'?<select value={p.role} onChange={e=>updateProfile(p.id,{role:e.target.value})}>{['admin','manager','agent','viewer'].map(x=><option key={x} value={x}>{labelRole(x)}</option>)}</select>:<span className="status-badge neutral">{labelRole(p.role)}</span>}
          </div>
          <div className="user-status"><span className={p.is_active?'status-light active':'status-light'}/>{p.is_active?'Activo':'Desactivado'}</div>
          {currentRole==='admin'&&<button className="secondary-button compact-btn" onClick={()=>updateProfile(p.id,{is_active:!p.is_active})}>{p.is_active?'Desactivar':'Activar'}</button>}
        </article>)}
      </div>}
    </section>

    {showInvite&&<div className="modal-backdrop" onMouseDown={()=>setShowInvite(false)}>
      <section className="modal-card" onMouseDown={e=>e.stopPropagation()}>
        <header><div><span className="eyebrow">NUEVA CUENTA</span><h2>Invitar usuario</h2></div><button className="icon-button" onClick={()=>setShowInvite(false)}><X/></button></header>
        <p>El usuario recibirá un correo para definir su contraseña y entrar al CRM.</p>
        <label className="field"><span>Nombre completo</span><input value={fullName} onChange={e=>setFullName(e.target.value)} placeholder="Nombre del usuario"/></label>
        <label className="field"><span>Correo electrónico</span><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="usuario@empresa.cl"/></label>
        <label className="field"><span>Rol</span><select value={role} onChange={e=>setRole(e.target.value)}><option value="admin">Admin</option><option value="manager">Manager</option><option value="agent">Agent</option><option value="viewer">Viewer</option></select></label>
        <button className="primary-button modal-action" disabled={sending} onClick={invite}>{sending?'Enviando...':'Enviar invitación'} <MailPlus size={17}/></button>
      </section>
    </div>}
  </div>
}
function Role({icon,name,desc}:{icon:any;name:string;desc:string}){return <div className="role-card"><span>{icon}</span><div><strong>{name}</strong><p>{desc}</p></div></div>}
const labelRole=(r:string)=>({admin:'Admin',manager:'Manager',agent:'Agent',viewer:'Viewer'} as any)[r]||r;
