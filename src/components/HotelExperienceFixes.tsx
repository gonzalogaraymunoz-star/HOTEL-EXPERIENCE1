import React,{useEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Download,FileText,WalletCards,Plus,Activity as ActivityIcon} from 'lucide-react';
import {assertSupabase} from '../lib/supabase';
import {createActivity,createTask} from '../lib/api';

function esc(v:any){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]!))}
function download(name:string,html:string){
  const blob=new Blob([html],{type:'text/html;charset=utf-8'});
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function shell(title:string,body:string){return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(title)}</title><style>body{font-family:Arial,sans-serif;max-width:900px;margin:40px auto;padding:0 24px;color:#191817}h1{font-size:28px;margin-bottom:4px}h2{font-size:16px;margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:8px}p,td,th{font-size:13px;line-height:1.5}table{width:100%;border-collapse:collapse;margin-top:10px}td,th{padding:9px;border-bottom:1px solid #eee;text-align:left}th{font-size:11px;text-transform:uppercase;color:#777}small{color:#777}</style></head><body>${body}</body></html>`}

export default function HotelExperienceFixes(){
  const [drawerActions,setDrawerActions]=useState<Element|null>(null);
  const [followUpHosts,setFollowUpHosts]=useState<{task:Element|null;activity:Element|null}>({task:null,activity:null});
  const [paymentHost,setPaymentHost]=useState<Element|null>(null);
  const [pending,setPending]=useState(0);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let alive=true;
    const scan=async()=>{
      if(!alive)return;
      const actions=document.querySelector('.lead-drawer .drawer-actions');
      const sections=Array.from(document.querySelectorAll('.lead-drawer .drawer-section'));
      const taskSection=sections.find(s=>s.querySelector('.eyebrow')?.textContent?.trim()==='Seguimiento');
      const activitySection=sections.find(s=>s.querySelector('.eyebrow')?.textContent?.trim()==='Timeline');
      const dcc=document.querySelector('.daily-command-center .dcc-head-actions');
      setDrawerActions(actions||null);
      setFollowUpHosts({task:taskSection?.querySelector('.drawer-section-head')||null,activity:activitySection?.querySelector('.drawer-section-head')||null});
      setPaymentHost(dcc||null);
      try{
        const {data,error}=await assertSupabase().from('lead_services').select('id,precio_venta,estado_pago').neq('estado_pago','Pagado').neq('estado_pago','Reembolsado');
        if(!error&&alive)setPending((data||[]).filter((x:any)=>Number(x.precio_venta||0)>0).length);
      }catch{}
    };
    scan();const obs=new MutationObserver(()=>scan());obs.observe(document.body,{subtree:true,childList:true});
    const timer=setInterval(scan,2500);
    return()=>{alive=false;obs.disconnect();clearInterval(timer)};
  },[]);

  const leadCode=document.querySelector('.lead-drawer .drawer-header .eyebrow')?.textContent?.trim()||'';
  const getLead=async()=>{if(!leadCode)return null;const {data,error}=await assertSupabase().from('leads').select('*').eq('codigo',leadCode).single();if(error)throw error;return data;};

  const downloadFicha=async()=>{
    if(busy)return;setBusy(true);
    try{
      const lead=await getLead();if(!lead)return;
      const {data:services}=await assertSupabase().from('lead_services').select('*').eq('lead_id',lead.id).order('fecha_servicio');
      const rows=(services||[]).map((s:any)=>`<tr><td>${esc(s.fecha_servicio||'Por definir')}</td><td>${esc(s.producto)}</td><td>${esc(s.numero_pax)}</td><td>${esc(s.estado_pago)}</td><td>${esc(s.estado_operacion)}</td><td>${Number(s.precio_venta||0).toLocaleString('es-CL')}</td></tr>`).join('');
      download(`Ficha_${lead.codigo}.html`,shell(`Ficha ${lead.codigo}`,`<h1>${esc(lead.reserva)}</h1><small>Código único: ${esc(lead.codigo)}</small><p><b>Hotel / origen:</b> ${esc(lead.empresa_ejecuta||'Sin hotel')}<br><b>Contacto:</b> ${esc(lead.contacto||'Sin contacto')}<br><b>Pasajeros:</b> ${esc(lead.numero_pax)}<br><b>Estado:</b> ${esc(lead.estado)}</p><h2>Experiencias</h2><table><thead><tr><th>Fecha</th><th>Producto</th><th>Pax</th><th>Pago</th><th>Operación</th><th>Venta</th></tr></thead><tbody>${rows||'<tr><td colspan="6">Sin experiencias</td></tr>'}</tbody></table><p><small>Documento generado desde HOTEL EXPERIENCE · ${new Date().toLocaleString('es-CL')}</small></p>`));
    }catch(e:any){alert(e?.message||'No se pudo descargar la ficha.')}finally{setBusy(false)}
  };

  const downloadItinerary=async()=>{
    if(busy)return;setBusy(true);
    try{
      const lead=await getLead();if(!lead)return;
      const {data:services}=await assertSupabase().from('lead_services').select('*').eq('lead_id',lead.id).not('fecha_servicio','is',null).order('fecha_servicio');
      const rows=(services||[]).map((s:any)=>`<tr><td>${esc(s.fecha_servicio)}</td><td>${esc(s.producto)}</td><td>${esc(s.numero_pax)}</td><td>${esc(s.observacion||'')}</td><td>${esc(s.estado_operacion)}</td></tr>`).join('');
      download(`Itinerario_${lead.codigo}.html`,shell(`Itinerario ${lead.codigo}`,`<h1>${esc(lead.reserva)}</h1><small>${esc(lead.codigo)} · ${esc(lead.empresa_ejecuta||'')}</small><h2>Itinerario</h2><table><thead><tr><th>Fecha</th><th>Experiencia</th><th>Pax</th><th>Observaciones</th><th>Operación</th></tr></thead><tbody>${rows||'<tr><td colspan="5">No hay servicios fechados</td></tr>'}</tbody></table><p><small>Documento generado desde HOTEL EXPERIENCE · ${new Date().toLocaleString('es-CL')}</small></p>`));
    }catch(e:any){alert(e?.message||'No se pudo descargar el itinerario.')}finally{setBusy(false)}
  };

  const addTask=async()=>{
    const title=window.prompt('Nueva tarea');if(!title?.trim())return;
    try{const lead=await getLead();if(!lead)return;await createTask({lead_id:lead.id,title:title.trim(),priority:'Media',status:'Pendiente'});window.location.reload()}catch(e:any){alert(e?.message||'No se pudo crear la tarea.')}
  };
  const addActivity=async()=>{
    const body=window.prompt('Registrar actividad / nota');if(!body?.trim())return;
    try{const lead=await getLead();if(!lead)return;await createActivity({lead_id:lead.id,type:'nota',title:'Actividad registrada',body:body.trim(),created_by:'CRM'});window.location.reload()}catch(e:any){alert(e?.message||'No se pudo registrar la actividad.')}
  };

  return <>
    {drawerActions&&createPortal(<><button className="secondary-button compact-btn" onClick={downloadFicha} title="Descargar ficha"><Download size={14}/> Ficha</button><button className="secondary-button compact-btn" onClick={downloadItinerary} title="Descargar itinerario"><FileText size={14}/> Itinerario</button></>,drawerActions)}
    {followUpHosts.task&&createPortal(<button className="secondary-button compact-btn" onClick={addTask}><Plus size={14}/> Nueva tarea</button>,followUpHosts.task)}
    {followUpHosts.activity&&createPortal(<button className="secondary-button compact-btn" onClick={addActivity}><ActivityIcon size={14}/> Registrar actividad</button>,followUpHosts.activity)}
    {paymentHost&&createPortal(<div className={`he-payment-alert ${pending?'has-pending':''}`}><WalletCards size={15}/><span><b>{pending}</b> pendiente(s) de pago</span></div>,paymentHost)}
  </>;
}
