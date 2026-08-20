import React, { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Mail } from 'lucide-react';
import BrandLogo from './BrandLogo';
import { assertSupabase } from '../lib/supabase';

export default function LoginScreen() {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [show,setShow]=useState(false);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');

  const login=async(e:React.FormEvent)=>{
    e.preventDefault(); setLoading(true); setError('');
    try{
      const { error }=await assertSupabase().auth.signInWithPassword({email,password});
      if(error) throw error;
    }catch(e:any){setError(e.message||'No se pudo iniciar sesión.');}
    finally{setLoading(false);}
  };

  return <main className="login-shell">
    <section className="login-brand-panel">
      <div><BrandLogo/><span className="eyebrow">CRM TURÍSTICO · SAN PEDRO DE ATACAMA</span></div>
      <div className="login-hero-copy">
        <h1>Operación clara.<br/>Equipo conectado.</h1>
        <p>Ventas, pasajeros, proveedores y operación de cada tour en un solo lugar.</p>
      </div>
      <small>Hotel Experience · by LINK</small>
    </section>
    <section className="login-form-panel">
      <form className="login-card" onSubmit={login}>
        <span className="eyebrow">ACCESO INTERNO</span>
        <h2>Entrar al CRM</h2>
        <p>Acceso conectado directamente a Supabase Auth.</p>
        <label><span>Correo</span><div className="input-icon"><Mail size={17}/><input type="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="nombre@empresa.cl"/></div></label>
        <label><span>Contraseña</span><div className="input-icon"><LockKeyhole size={17}/><input type={show?'text':'password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/><button type="button" onClick={()=>setShow(x=>!x)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
        {error&&<div className="login-error">{error}</div>}
        <button className="primary-button login-submit" disabled={loading}>{loading?'Ingresando...':'Entrar'} <ArrowRight size={17}/></button>
        <div className="login-help">Las cuentas se crean desde <b>Equipo</b> por un administrador.</div>
      </form>
    </section>
  </main>
}
