import {
  getPartnerSession,noStore,publicAccount,setupAdmin
} from './_lib/partner-portal.js';

function chileYearMonth(){
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'America/Santiago',year:'2-digit',month:'2-digit'
  }).formatToParts(new Date());
  const yy=parts.find(x=>x.type==='year')?.value||String(new Date().getFullYear()).slice(-2);
  const mm=parts.find(x=>x.type==='month')?.value||String(new Date().getMonth()+1).padStart(2,'0');
  return {yy,mm};
}
async function nextCode(admin,prefix){
  const {yy,mm}=chileYearMonth();
  const stem=`${prefix}-${yy}${mm}-`;
  const {data,error}=await admin.from('leads').select('codigo').like('codigo',`${stem}%`).limit(1000);
  if(error)throw error;
  let max=0;
  for(const row of data||[]){
    const n=Number(String(row.codigo||'').slice(stem.length));
    if(Number.isInteger(n)&&n>max)max=n;
  }
  return `${stem}${String(max+1).padStart(3,'0')}`;
}
function cleanProduct(p){
  return {
    producto:String(p?.producto||'').trim().slice(0,180),
    fechaServicio:String(p?.fechaServicio||'').trim().slice(0,20),
    pax:Math.max(1,Math.min(99,Number(p?.pax||1))),
    observacion:String(p?.observacion||'').trim().slice(0,600)
  };
}
function stageLabel(value){
  const map={nuevo:'Recibida',contactado:'En revisión',cotizado:'Cotizada',confirmado:'Confirmada',perdido:'Cerrada'};
  return map[String(value||'').toLowerCase()]||'En revisión';
}

async function partnerLeads(admin,account){
  const fields='id,codigo,reserva,numero_pax,contacto,empresa_ejecuta,estado,checkin,checkout,created_at,updated_at,partner_account_id';
  const {data:direct,error}=await admin.from('leads')
    .select(fields).eq('partner_account_id',account.id)
    .order('created_at',{ascending:false}).limit(180);
  if(error)throw error;

  const merged=new Map((direct||[]).map(l=>[l.id,l]));
  if(account.partner_type==='hotel'){
    const {data:fallback,error:fallbackError}=await admin.from('leads')
      .select(fields).eq('empresa_ejecuta',account.scope_value)
      .is('partner_account_id',null)
      .order('created_at',{ascending:false}).limit(180);
    if(fallbackError)throw fallbackError;
    for(const lead of fallback||[])merged.set(lead.id,lead);
  }
  return [...merged.values()].sort((a,b)=>String(b.created_at).localeCompare(String(a.created_at))).slice(0,180);
}

export default async function handler(req,res){
  noStore(res);
  try{
    const admin=setupAdmin();
    const current=await getPartnerSession(req,admin);
    if(!current)return res.status(401).json({error:'Tu sesión B2B expiró. Vuelve a ingresar.'});
    const account=current.account;

    if(req.method==='GET'){
      const leads=await partnerLeads(admin,account);
      const leadIds=leads.map(l=>l.id);

      let services=[];
      if(leadIds.length){
        const {data,error}=await admin.from('lead_services')
          .select('id,lead_id,producto,fecha_servicio,numero_pax,estado_pago,estado_operacion,created_at')
          .in('lead_id',leadIds).order('fecha_servicio',{ascending:true}).limit(1000);
        if(error)throw error;
        services=data||[];
      }

      const {data:catalog,error:catalogError}=await admin.from('product_catalog')
        .select('name,category').eq('active',true).order('category').order('name');
      if(catalogError)throw catalogError;

      const safeLeads=leads.map(l=>({
        id:l.id,codigo:l.codigo,reserva:l.reserva,numero_pax:l.numero_pax,
        contacto:l.contacto,empresa_ejecuta:l.empresa_ejecuta,
        estado:stageLabel(l.estado),estado_raw:l.estado,
        checkin:l.checkin,checkout:l.checkout,created_at:l.created_at,
        services:services.filter(s=>s.lead_id===l.id).map(s=>({
          id:s.id,producto:s.producto,fecha_servicio:s.fecha_servicio,
          numero_pax:s.numero_pax,estado_pago:s.estado_pago,estado_operacion:s.estado_operacion
        }))
      }));

      return res.status(200).json({
        account:publicAccount(account),
        summary:{
          total:safeLeads.length,
          confirmed:safeLeads.filter(x=>x.estado_raw==='confirmado').length,
          pending:safeLeads.filter(x=>['nuevo','contactado'].includes(String(x.estado_raw))).length,
          quoted:safeLeads.filter(x=>x.estado_raw==='cotizado').length
        },
        leads:safeLeads,
        catalog:(catalog||[]).map(x=>({name:String(x.name||''),category:String(x.category||'Otros')}))
      });
    }

    if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
    if(!account.can_create_requests)return res.status(403).json({error:'Este acceso está configurado solo para consulta.'});

    const passengerName=String(req.body?.passengerName||'').trim().slice(0,180);
    const email=String(req.body?.email||'').trim().slice(0,180);
    const phone=String(req.body?.phone||'').trim().slice(0,100);
    const notes=String(req.body?.notes||'').trim().slice(0,1200);
    const products=(Array.isArray(req.body?.products)?req.body.products:[]).map(cleanProduct).filter(p=>p.producto);
    const hotel=account.partner_type==='hotel'
      ?account.scope_value
      :String(req.body?.hotel||'').trim().slice(0,180);

    if(!passengerName||(!email&&!phone)||!hotel||!products.length){
      return res.status(400).json({error:'Completa pasajero, contacto, alojamiento y al menos una experiencia.'});
    }

    const validCatalog=new Set();
    const {data:catalog}=await admin.from('product_catalog').select('name').eq('active',true);
    for(const row of catalog||[])validCatalog.add(String(row.name||''));
    for(const p of products){
      if(!validCatalog.has(p.producto)&&p.producto!=='Otro / Por definir'){
        return res.status(400).json({error:`La experiencia “${p.producto}” ya no está disponible en el catálogo.`});
      }
    }

    const maxPax=Math.max(1,...products.map(p=>p.pax));
    const firstDate=products.find(p=>p.fechaServicio)?.fechaServicio||null;
    const prefix=String(account.lead_prefix||'B2B');

    let lead=null;
    for(let attempt=0;attempt<3&&!lead;attempt++){
      const codigo=await nextCode(admin,prefix);
      const {data,error}=await admin.from('leads').insert({
        codigo,
        reserva:passengerName,
        numero_pax:maxPax,
        servicio:products.map((p,i)=>`${i+1}. ${p.producto}`).join(' | '),
        precio_venta:0,
        moneda:'CLP',
        checkin:firstDate,
        checkout:null,
        contacto:[email,phone].filter(Boolean).join(' | '),
        observaciones_cobros:notes?`Nota partner: ${notes}`:'',
        propuesta_enviada:'Pendiente',
        empresa_ejecuta:hotel,
        prioridad:'Media',
        estado:'nuevo',
        canal:account.partner_type==='hotel'?'Portal Hotel':'Portal Agencia',
        partner_account_id:account.id
      }).select('*').single();

      if(!error)lead=data;
      else if(error.code!=='23505')throw error;
    }
    if(!lead)throw new Error('No fue posible generar un código único. Intenta nuevamente.');

    const serviceRows=products.map(p=>({
      lead_id:lead.id,
      producto:p.producto,
      fecha_servicio:p.fechaServicio||null,
      numero_pax:p.pax,
      observacion:p.observacion,
      precio_venta:0,
      moneda:'CLP',
      estado_pago:'Pendiente',
      estado_operacion:'Pendiente'
    }));
    const {error:serviceError}=await admin.from('lead_services').insert(serviceRows);
    if(serviceError){
      await admin.from('leads').delete().eq('id',lead.id);
      throw serviceError;
    }

    await Promise.all([
      admin.from('crm_activities').insert({
        lead_id:lead.id,
        type:'partner_request_created',
        title:'Solicitud recibida desde portal B2B',
        body:`${account.name} registró ${products.length} experiencia(s).`,
        created_by:`Portal B2B · ${account.name}`
      }),
      admin.from('crm_tasks').insert({
        lead_id:lead.id,
        title:`Revisar solicitud B2B · ${account.name}`,
        due_date:new Date(Date.now()+4*60*60*1000).toISOString(),
        priority:'Alta',
        status:'Pendiente'
      })
    ]);

    return res.status(201).json({codigo:lead.codigo,lead_id:lead.id,count:products.length});
  }catch(e){
    console.error('partner-data',e);
    return res.status(e.status||500).json({error:e.message||'No se pudo procesar el portal B2B.'});
  }
}
