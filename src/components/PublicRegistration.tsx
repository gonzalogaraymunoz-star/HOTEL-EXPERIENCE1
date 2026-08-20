import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react';
import { createPublicRequest } from '../lib/api';
import BrandLogo from './BrandLogo';

const catalog = [
  'Géiseres del Tatio + Machuca',
  'Ruta de los Salares',
  'Piedras Rojas + Lagunas Altiplánicas',
  'Cejar + Tebinquinche',
  'Valle de la Luna + Ckari',
  'Arcoíris + Yerbas Buenas',
  'Tour Astronómico',
  'Termas de Puritama + Guatín',
  'Chaxa + Toconao + Jerez',
  'Catarpe + Pukará',
  'Transfer Aeropuerto',
  'Transfer Hito Cajón',
  'Otro / Por definir'
];

type Product = { producto:string; fechaServicio:string; pax:number; observacion:string };

export default function PublicRegistration() {
  const [step, setStep] = useState(1);
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState<{codigo:string;count:number}|null>(null);
  const [form, setForm] = useState({
    nombre:'', email:'', telefono:'', nacionalidad:'', documento:'', nacimiento:'',
    hotel:'', canal:'Hotel', restricciones:'', notas:'', consentimiento:false
  });
  const [products, setProducts] = useState<Product[]>([
    { producto:'', fechaServicio:'', pax:1, observacion:'' }
  ]);

  const setField = (key:string, value:any) => setForm(prev => ({...prev,[key]:value}));
  const setProduct = (i:number, key:keyof Product, value:any) => {
    setProducts(prev => prev.map((p,idx) => idx===i ? {...p,[key]:value} : p));
  };
  const addProduct = () => setProducts(prev => [...prev,{producto:'',fechaServicio:'',pax:1,observacion:''}]);
  const removeProduct = (i:number) => setProducts(prev => prev.filter((_,idx)=>idx!==i));

  const next = () => {
    if (step===1 && (!form.nombre || !form.email || !form.telefono)) return alert('Completa nombre, correo y teléfono.');
    if (step===2 && !form.hotel) return alert('Indica el hotel o alojamiento.');
    if (step===3 && !products.some(p=>p.producto)) return alert('Agrega al menos una experiencia.');
    setStep(s=>Math.min(4,s+1));
  };

  const submit = async () => {
    if (!form.consentimiento) return alert('Confirma que los datos son correctos.');
    setSending(true);
    try {
      const result = await createPublicRequest({...form, productos:products.filter(p=>p.producto)});
      setSuccess({codigo:result.codigo,count:result.count});
    } catch (e:any) {
      alert(e.message || 'No se pudo enviar la solicitud.');
    } finally { setSending(false); }
  };

  if (success) {
    return <div className="public-shell">
      <div className="public-success">
        <div className="success-icon"><Check size={28}/></div>
        <div className="eyebrow">Hotel Experience</div>
        <h1>Solicitud recibida.</h1>
        <p>Registramos tus datos y {success.count} experiencia(s). Nuestro equipo revisará disponibilidad y continuará contigo la confirmación.</p>
        <div className="request-code">{success.codigo}</div>
        <button className="primary-button" onClick={()=>location.reload()}>Nueva solicitud</button>
      </div>
    </div>
  }

  return <div className="public-shell">
    <header className="public-header">
      <a className="brand" href="/"><BrandLogo compact /></a>
      <span>Paso {step} de 4</span>
    </header>

    <section className="public-hero">
      <div>
        <div className="eyebrow">Reserva de experiencias · San Pedro de Atacama</div>
        <h1>Elige.<br/>Registra.<br/>Disfruta.</h1>
      </div>
      <p>Este formulario permite solicitar una o varias experiencias del catálogo. Nuestro equipo revisa disponibilidad, horarios y condiciones antes de confirmar la reserva y el pago.</p>
    </section>

    <section className="process-strip">
      {[
        ['01','Elige','Selecciona tus experiencias del catálogo.'],
        ['02','Registra','Completa tus datos y alojamiento.'],
        ['03','Solicita','Agrega todos los productos necesarios.'],
        ['04','Confirma','Revisamos disponibilidad y pago.']
      ].map(x=><div key={x[0]}><b>{x[0]} · {x[1]}</b><span>{x[2]}</span></div>)}
    </section>

    <div className="public-layout">
      <main className="public-card">
        {step===1 && <section>
          <div className="step-title"><div><h2>Datos del pasajero</h2><p>Usaremos esta información para identificar la solicitud y comunicarnos contigo.</p></div><span>01</span></div>
          <div className="form-grid">
            <Field label="Nombre completo *"><input value={form.nombre} onChange={e=>setField('nombre',e.target.value)} placeholder="Nombre y apellidos"/></Field>
            <Field label="Correo electrónico *"><input type="email" value={form.email} onChange={e=>setField('email',e.target.value)} placeholder="correo@ejemplo.com"/></Field>
            <Field label="Teléfono / WhatsApp *"><input value={form.telefono} onChange={e=>setField('telefono',e.target.value)} placeholder="+56 9 ..."/></Field>
            <Field label="Nacionalidad"><input value={form.nacionalidad} onChange={e=>setField('nacionalidad',e.target.value)} placeholder="Ej. Chilena"/></Field>
            <Field label="Documento / Pasaporte"><input value={form.documento} onChange={e=>setField('documento',e.target.value)} placeholder="RUT, DNI o pasaporte"/></Field>
            <Field label="Fecha de nacimiento"><input type="date" value={form.nacimiento} onChange={e=>setField('nacimiento',e.target.value)}/></Field>
          </div>
        </section>}

        {step===2 && <section>
          <div className="step-title"><div><h2>Tu estadía</h2><p>Nos ayuda a coordinar recogidas, horarios y contacto con recepción.</p></div><span>02</span></div>
          <div className="form-grid">
            <Field label="Hotel / alojamiento *"><input value={form.hotel} onChange={e=>setField('hotel',e.target.value)} placeholder="Hotel Kimal"/></Field>
            <Field label="Origen de la solicitud"><select value={form.canal} onChange={e=>setField('canal',e.target.value)}>{['Hotel','Web','WhatsApp','Recepción','Agencia','Referido','Directo'].map(x=><option key={x}>{x}</option>)}</select></Field>
            <Field wide label="Restricciones / alimentación / movilidad"><textarea value={form.restricciones} onChange={e=>setField('restricciones',e.target.value)} placeholder="Alergias, dieta, movilidad reducida u otra información importante"/></Field>
          </div>
        </section>}

        {step===3 && <section>
          <div className="step-title"><div><h2>Elige tus experiencias</h2><p>Puedes agregar todos los tours o productos que quieras en una misma solicitud.</p></div><span>03</span></div>
          <div className="product-stack">
            {products.map((p,i)=><div className="product-form-card" key={i}>
              <div className="product-form-head"><b>Experiencia {String(i+1).padStart(2,'0')}</b>{products.length>1&&<button onClick={()=>removeProduct(i)}><Trash2 size={16}/> Eliminar</button>}</div>
              <div className="form-grid">
                <Field label="Experiencia *"><select value={p.producto} onChange={e=>setProduct(i,'producto',e.target.value)}><option value="">Seleccionar experiencia</option>{catalog.map(x=><option key={x}>{x}</option>)}</select></Field>
                <Field label="Fecha preferida"><input type="date" value={p.fechaServicio} onChange={e=>setProduct(i,'fechaServicio',e.target.value)}/></Field>
                <Field label="N° pasajeros"><input type="number" min={1} value={p.pax} onChange={e=>setProduct(i,'pax',Number(e.target.value))}/></Field>
                <Field label="Observación"><input value={p.observacion} onChange={e=>setProduct(i,'observacion',e.target.value)} placeholder="Privado, horario, preferencia..."/></Field>
              </div>
            </div>)}
          </div>
          <button className="add-button" onClick={addProduct}><Plus size={17}/> Agregar otra experiencia</button>
          <div style={{marginTop:24}}><Field wide label="Notas generales"><textarea value={form.notas} onChange={e=>setField('notas',e.target.value)} placeholder="Información adicional"/></Field></div>
        </section>}

        {step===4 && <section>
          <div className="step-title"><div><h2>Revisa antes de enviar</h2><p>Enviar la solicitud no garantiza disponibilidad. Hotel Experience confirmará cada experiencia.</p></div><span>04</span></div>
          <div className="review-box"><b>Pasajero</b><h3>{form.nombre}</h3><p>{form.email} · {form.telefono}</p><p>{form.hotel}</p></div>
          <div className="review-box"><b>{products.filter(p=>p.producto).length} experiencia(s)</b>{products.filter(p=>p.producto).map((p,i)=><p key={i}><strong>{i+1}. {p.producto}</strong><br/>{p.fechaServicio||'Fecha por definir'} · {p.pax} pasajero(s){p.observacion?` · ${p.observacion}`:''}</p>)}</div>
          <label className="consent-row"><input type="checkbox" checked={form.consentimiento} onChange={e=>setField('consentimiento',e.target.checked)}/><span>Confirmo que los datos ingresados son correctos y autorizo su uso para gestionar esta solicitud turística.</span></label>
        </section>}

        <div className="step-actions">
          {step>1?<button className="secondary-button" onClick={()=>setStep(s=>s-1)}><ArrowLeft size={17}/> Volver</button>:<span/>}
          {step<4?<button className="primary-button" onClick={next}>Continuar <ArrowRight size={17}/></button>:<button className="primary-button" disabled={sending} onClick={submit}>{sending?'Enviando...':'Enviar solicitud'} <ArrowRight size={17}/></button>}
        </div>
      </main>

      <aside className="public-summary">
        <h3>Resumen</h3>
        <Summary label="Pasajero" value={form.nombre||'Aún sin completar'}/>
        <Summary label="Hotel" value={form.hotel||'Aún sin completar'}/>
        <div className="summary-row"><small>Experiencias</small><div className="chips">{products.filter(p=>p.producto).length?products.filter(p=>p.producto).map((p,i)=><span key={i}>{p.producto}</span>):<p>Aún sin seleccionar</p>}</div></div>
        <Summary label="Estado" value="Solicitud sin confirmar"/>
        <div className="progress-track"><div style={{width:`${step*25}%`}}/></div>
      </aside>
    </div>
  </div>
}

function Field({label,children,wide=false}:{label:string;children:React.ReactNode;wide?:boolean}) {
  return <label className={wide?'field wide':'field'}><span>{label}</span>{children}</label>
}
function Summary({label,value}:{label:string;value:string}) {
  return <div className="summary-row"><small>{label}</small><p>{value}</p></div>
}
