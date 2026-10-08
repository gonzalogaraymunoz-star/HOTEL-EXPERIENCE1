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
  const [notice,setNotice]=useState('');
  const [method,setMethod]=useState<'email'|'password'>('email');
  const [otp,setOtp]=useState('');
  const [sent,setSent]=useState(false);

  const login=async(e:React.FormEvent)=>{
    e.preventDefault(); setLoading(true); setError(''); setNotice('');
    try{
      if(method==='password'){
        const {error}=await assertSupabase().auth.signInWithPassword({email:email.trim(),password});
        if(error) throw error;
      }else if(!sent){
        // Do not create arbitrary accounts from this public login form.
        const {error}=await assertSupabase().auth.signInWithOtp({
          email:email.trim(),
          options:{shouldCreateUser:false,emailRedirectTo:window.location.origin}
        });
        if(error) throw error;
        setSent(true);
        setNotice('Revisa tu correo. Ingresa el código si lo recibiste o abre el enlace de acceso.');
      }else{
        const {error}=await assertSupabase().auth.verifyOtp({email:email.trim(),token:otp.trim(),type:'email'});
        if(error) throw error;
      }
    }catch(e:any){setError(e.message||'No se pudo iniciar sesión. Consulta al administrador si tu cuenta aún no está activada.');}
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
        <p>Acceso exclusivo para personas autorizadas en Equipo.</p>
        <label><span>Correo asignado</span><div className="input-icon"><Mail size={17}/><input type="email" required value={email} disabled={sent} onChange={e=>setEmail(e.target.value)} placeholder="nombre@empresa.cl"/></div></label>
        {method==='password'?<>
          <label><span>Contraseña personal</span><div className="input-icon"><LockKeyhole size={17}/><input type={show?'text':'password'} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••"/><button type="button" onClick={()=>setShow(x=>!x)}>{show?<EyeOff size={17}/>:<Eye size={17}/>}</button></div></label>
        </>:sent?<>
          <label><span>Código de correo (si recibiste uno)</span><div className="input-icon"><LockKeyhole size={17}/><input autoComplete="one-time-code" inputMode="numeric" value={otp} onChange={e=>setOtp(e.target.value)} placeholder="Código de verificación"/></div></label>
        </>:<p>Te enviaremos un código o enlace temporal para comprobar tu identidad.</p>}
        {error&&<div className="login-error" role="alert">{error}</div>}
        {notice&&<div role="status">{notice}</div>}
        <button className="primary-button login-submit" disabled={loading||(method==='email'&&sent&&!otp.trim())}>{loading?'Procesando…':method==='password'?'Entrar':sent?'Verificar código':'Enviar acceso al correo'} <ArrowRight size={17}/></button>
        {sent?<button type="button" onClick={()=>{setSent(false);setOtp('');setNotice('');setError('')}}>Usar otro correo o reenviar</button>:<button type="button" onClick={()=>{setMethod(x=>x==='email'?'password':'email');setError('');setNotice('')}}>{method==='email'?'Ingresar con contraseña existente':'Ingresar con correo sin contraseña'}</button>}
        <div className="login-help">Las cuentas y permisos se administran desde <b>Equipo</b>.</div>
      </form>
    </section>
  </main>;
}
