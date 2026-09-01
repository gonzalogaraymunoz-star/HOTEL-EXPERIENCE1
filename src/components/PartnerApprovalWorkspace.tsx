import {useEffect,useState} from 'react';
import {Building2,Check,Clock3,RefreshCw,X} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import './PartnerApprovalWorkspace.css';

type PartnerRequest={
  id:string;
  name:string;
  partner_type:string;
  lead_prefix:string;
  contact_name?:string|null;
  email?:string|null;
  phone?:string|null;
  notes?:string|null;
  created_at:string;
  seller_profile_id:string;
  seller_name:string;
  requested_by:string;
  requester_name:string;
};

export default function PartnerApprovalWorkspace(){
  const [rows,setRows]=useState<PartnerRequest[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');

  async function load(){
    setLoading(true);setError('');
    const {data,error}=await assertSupabase().rpc('list_pending_partner_requests');
    if(error)setError(error.message);else setRows((data||[]) as PartnerRequest[]);
    setLoading(false);
  }
  useEffect(()=>{void load()},[]);

  async function decide(id:string,approve:boolean){
    setBusy(id);setError('');setMessage('');
    try{
      const {error}=await assertSupabase().rpc('approve_partner_request',{p_request_id:id,p_approve:approve,p_review_notes:null});
      if(error)throw error;
      setMessage(approve?'Negocio aprobado y activado para Ventas.':'Solicitud rechazada.');
      await load();
    }catch(e:any){setError(e?.message||'No se pudo revisar la solicitud.')}finally{setBusy('')}
  }

  return <div className="partner-approval-workspace">
    <section className="partner-approval-hero">
      <div><span className="partner-eyebrow">VENTAS → OPERACIONES</span><h1>Aprobación de negocios</h1><p>Los vendedores pueden proponer hoteles y negocios. Aquí se valida el origen antes de habilitarlo como partner comercial.</p></div>
      <button onClick={()=>void load()} disabled={loading}><RefreshCw size={16} className={loading?'spin':''}/>Actualizar</button>
    </section>
    {message&&<div className="partner-approval-message ok">{message}</div>}
    {error&&<div className="partner-approval-message error">{error}</div>}
    <section className="partner-approval-summary"><div><Clock3 size={18}/><span>Pendientes</span><strong>{rows.length}</strong></div><p>Aprobar crea el registro oficial en <code>hotel_partners</code> y lo vincula al vendedor. Rechazar no crea ningún partner.</p></section>
    <section className="partner-request-list">
      {rows.map(row=><article key={row.id} className="partner-request-card">
        <header><div className="partner-request-icon"><Building2 size={21}/></div><div><span>{row.partner_type||'hotel'} · {row.lead_prefix}</span><h2>{row.name}</h2><p>Vendedor: <strong>{row.seller_name}</strong></p></div><time>{new Date(row.created_at).toLocaleDateString('es-CL')}</time></header>
        <div className="partner-request-details">
          <div><span>Contacto</span><strong>{row.contact_name||'Sin contacto'}</strong><small>{row.email||row.phone||'Sin dato adicional'}</small></div>
          <div><span>Solicitado por</span><strong>{row.requester_name}</strong><small>Quedará asignado a {row.seller_name}</small></div>
          <div><span>Observaciones</span><strong>{row.notes||'Sin observaciones'}</strong></div>
        </div>
        <footer><button className="reject" disabled={busy===row.id} onClick={()=>void decide(row.id,false)}><X size={15}/>Rechazar</button><button className="approve" disabled={busy===row.id} onClick={()=>void decide(row.id,true)}><Check size={15}/>{busy===row.id?'Procesando…':'Aprobar y activar'}</button></footer>
      </article>)}
      {!loading&&!rows.length&&<div className="partner-approval-empty"><Check size={24}/><strong>Sin solicitudes pendientes</strong><span>Cuando un vendedor proponga un nuevo hotel o negocio aparecerá aquí.</span></div>}
    </section>
  </div>;
}
