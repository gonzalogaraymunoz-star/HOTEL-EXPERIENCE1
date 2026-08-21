import {createClient} from '@supabase/supabase-js';

function setup(){
  const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL||'https://lpirjwifzosdzgdncsbt.supabase.co';
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)throw new Error('Configuración del servidor incompleta.');
  return createClient(url,key,{auth:{autoRefreshToken:false,persistSession:false}});
}

function emailFrom(value){
  return String(value||'').toLowerCase().match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0]||'';
}
function phoneFrom(value){
  const digits=String(value||'').replace(/\D/g,'');
  return digits.length>=8?digits:'';
}
function contactMatches(input,values){
  const requested=String(input||'').trim().toLowerCase();
  if(!requested)return false;

  if(requested.includes('@')){
    const email=emailFrom(requested);
    return Boolean(email&&values.some(v=>emailFrom(v)===email));
  }

  const phone=phoneFrom(requested);
  if(!phone)return false;
  return values.some(v=>{
    const known=phoneFrom(v);
    if(!known)return false;
    return known===phone || known.endsWith(phone) || phone.endsWith(known);
  });
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store, private, max-age=0');
  res.setHeader('Pragma','no-cache');
  res.setHeader('Referrer-Policy','no-referrer');

  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});

  try{
    const code=String(req.body?.code||'').trim().toUpperCase().slice(0,80);
    const contact=String(req.body?.contact||'').trim().slice(0,240);
    if(!code||!contact)return res.status(400).json({error:'Completa código de reserva y contacto.'});

    const admin=setup();

    const {data:lead,error:leadError}=await admin
      .from('leads')
      .select('id,codigo,reserva,numero_pax,empresa_ejecuta,checkin,checkout,contacto,estado,lifecycle_stage')
      .eq('codigo',code)
      .maybeSingle();

    if(leadError)throw leadError;

    // Mensaje deliberadamente genérico para no confirmar si un código existe.
    const genericError='No pudimos validar esa combinación. Revisa el código y el contacto usado en la reserva.';
    if(!lead)return res.status(401).json({error:genericError});

    const {data:passengers,error:paxError}=await admin
      .from('passengers')
      .select('email,phone,is_primary')
      .eq('lead_id',lead.id);
    if(paxError)throw paxError;

    const contactValues=[
      lead.contacto,
      ...(passengers||[]).flatMap(p=>[p.email,p.phone])
    ].filter(Boolean);

    if(!contactMatches(contact,contactValues)){
      await new Promise(resolve=>setTimeout(resolve,250));
      return res.status(401).json({error:genericError});
    }

    const allowed=
      String(lead.estado||'')==='confirmado' ||
      ['review','dormido'].includes(String(lead.lifecycle_stage||''));
    if(!allowed){
      return res.status(403).json({error:'Esta reserva todavía no está habilitada para el portal de viaje.'});
    }

    const [{data:services,error:servicesError},{data:documents,error:docsError}]=await Promise.all([
      admin.from('lead_services')
        .select('id,producto,fecha_servicio,numero_pax,estado_operacion,estado_pago')
        .eq('lead_id',lead.id)
        .order('fecha_servicio',{ascending:true}),
      admin.from('reservation_documents')
        .select('id,document_type,title,url,status')
        .eq('lead_id',lead.id)
        .in('document_type',['voucher','itinerary'])
    ]);
    if(servicesError)throw servicesError;
    if(docsError)throw docsError;

    const serviceIds=(services||[]).map(s=>s.id);
    let assignments=[];
    if(serviceIds.length){
      const {data,error}=await admin.from('service_assignments')
        .select('lead_service_id,pickup_time,meeting_point')
        .in('lead_service_id',serviceIds);
      if(error)throw error;
      assignments=data||[];
    }
    const assignmentMap=new Map(assignments.map(a=>[a.lead_service_id,a]));

    const safeServices=(services||[]).map(service=>{
      const assignment=assignmentMap.get(service.id);
      return {
        id:service.id,
        producto:service.producto,
        fecha_servicio:service.fecha_servicio,
        numero_pax:Number(service.numero_pax||lead.numero_pax||1),
        estado_operacion:service.estado_operacion||'Pendiente',
        estado_pago:service.estado_pago||'Pendiente',
        pickup_time:assignment?.pickup_time?String(assignment.pickup_time).slice(0,5):null,
        meeting_point:assignment?.meeting_point||null
      };
    });

    const safeDocuments=(documents||[])
      .filter(d=>d.url&&String(d.status||'').toLowerCase()!=='archived')
      .map(d=>({
        id:d.id,
        document_type:d.document_type,
        title:d.title|| (d.document_type==='voucher'?'Voucher':'Itinerario'),
        url:d.url
      }));

    return res.status(200).json({
      reservation:{
        codigo:lead.codigo,
        reserva:lead.reserva,
        numero_pax:Number(lead.numero_pax||1),
        empresa_ejecuta:lead.empresa_ejecuta||null,
        checkin:lead.checkin||null,
        checkout:lead.checkout||null
      },
      services:safeServices,
      documents:safeDocuments,
      verified_at:new Date().toISOString()
    });
  }catch(e){
    console.error('passenger-portal',e);
    return res.status(500).json({error:'No pudimos abrir el portal en este momento.'});
  }
}
