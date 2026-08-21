const FULL_COVERAGE=['vehicle','driver','guide','food','coordination','resources','entrances'];

function todayChile(){
  return new Intl.DateTimeFormat('en-CA',{
    timeZone:'America/Santiago',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
}
function addDaysIso(iso,days){
  const d=new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+days);
  return d.toISOString().slice(0,10);
}
function hoursUntil(date){
  if(!date)return null;
  const d=new Date(`${date}T12:00:00`);
  if(Number.isNaN(d.getTime()))return null;
  return (d.getTime()-Date.now())/36e5;
}
function amount(value){const n=Number(value||0);return Number.isFinite(n)?n:0}
function modeFor(a){return a?.operation_mode||(a?.supplier_id?'delegated_full':'direct')}
function coverageFor(a){return modeFor(a)==='delegated_full'?FULL_COVERAGE:(Array.isArray(a?.supplier_coverage)?a.supplier_coverage:[])}
function severityRank(s){return s==='critical'?0:s==='warning'?1:2}
function keyIssue(i){return [i.category,i.lead_id||'',i.service_id||'',i.title].join('|')}

function issue({
  severity='warning',category,title,detail,recommended_action,
  lead=null,service=null
}){
  return {
    id:`${category}-${service?.id||lead?.id||Math.random().toString(36).slice(2)}`,
    severity,category,title,detail,recommended_action,
    lead_id:lead?.id||service?.lead_id||null,
    lead_name:lead?.reserva||null,
    lead_code:lead?.codigo||null,
    service_id:service?.id||null,
    service_name:service?.producto||null,
    service_date:service?.fecha_servicio||null
  };
}

export async function runControlChecks(admin,profile,user){
  const today=todayChile();
  const end14=addDaysIso(today,14);

  const {data:allLeads,error:leadError}=await admin
    .from('leads')
    .select('id,codigo,reserva,numero_pax,contacto,empresa_ejecuta,estado,lifecycle_stage,checkin,checkout,created_by,assigned_to,updated_at')
    .order('updated_at',{ascending:false})
    .limit(350);
  if(leadError)throw leadError;

  const visibleLeads=(profile.role==='agent'
    ?(allLeads||[]).filter(l=>l.created_by===user.id||l.assigned_to===user.id)
    :(allLeads||[])
  ).slice(0,300);

  const leadMap=new Map(visibleLeads.map(l=>[l.id,l]));
  const leadIds=visibleLeads.map(l=>l.id);
  if(!leadIds.length)return {generated_at:new Date().toISOString(),summary:{total:0,critical:0,warning:0,info:0},issues:[]};

  const [
    serviceRes,passengerRes,documentRes
  ]=await Promise.all([
    admin.from('lead_services')
      .select('id,lead_id,producto,fecha_servicio,numero_pax,precio_venta,pricing_status,estado_pago,estado_operacion,updated_at')
      .in('lead_id',leadIds)
      .order('fecha_servicio',{ascending:true})
      .limit(900),
    admin.from('passengers').select('id,lead_id').in('lead_id',leadIds),
    admin.from('reservation_documents').select('lead_id,document_type,status,url').in('lead_id',leadIds)
  ]);
  for(const r of [serviceRes,passengerRes,documentRes])if(r.error)throw r.error;

  const services=serviceRes.data||[];
  const serviceIds=services.map(s=>s.id);
  if(!serviceIds.length){
    const noServiceIssues=visibleLeads
      .filter(l=>l.estado==='confirmado'&&String(l.lifecycle_stage||'active')==='active')
      .map(l=>issue({
        severity:'warning',category:'commercial',
        title:'Reserva confirmada sin experiencias',
        detail:`${l.reserva} figura confirmada, pero no tiene servicios asociados.`,
        recommended_action:'Abrir la reserva y registrar las experiencias contratadas.',
        lead:l
      }));
    return finalize(noServiceIssues);
  }

  const [
    assignmentRes,paymentRes,closureRes,supplierRes
  ]=await Promise.all([
    admin.from('service_assignments')
      .select('lead_service_id,supplier_id,vehicle_id,guide_person_id,driver_person_id,guide_name,driver_name,pickup_time,meeting_point,supplier_cost,supplier_payment_status,operation_mode,supplier_coverage')
      .in('lead_service_id',serviceIds),
    admin.from('payment_movements')
      .select('lead_service_id,party_type,amount,paid_at')
      .in('lead_service_id',serviceIds),
    admin.from('service_closures')
      .select('lead_service_id,closure_status,outcome,refund_amount,refund_status,net_sale_snapshot,supplier_cost_snapshot,total_cost_snapshot,closed_at')
      .in('lead_service_id',serviceIds),
    admin.from('suppliers').select('id,name').eq('active',true)
  ]);
  for(const r of [assignmentRes,paymentRes,closureRes,supplierRes])if(r.error)throw r.error;

  const assignments=assignmentRes.data||[];
  const payments=paymentRes.data||[];
  const closures=closureRes.data||[];
  const supplierMap=new Map((supplierRes.data||[]).map(s=>[s.id,s.name]));
  const assignmentMap=new Map(assignments.map(a=>[a.lead_service_id,a]));
  const closureMap=new Map(closures.map(c=>[c.lead_service_id,c]));

  const paxCount=new Map();
  for(const p of passengerRes.data||[])paxCount.set(p.lead_id,(paxCount.get(p.lead_id)||0)+1);

  const riskMap=new Map();
  for(const d of documentRes.data||[]){
    if(d.document_type==='risk_sheet')riskMap.set(d.lead_id,d);
  }

  const paymentMap=new Map();
  for(const p of payments){
    const key=`${p.lead_service_id}:${p.party_type}`;
    paymentMap.set(key,(paymentMap.get(key)||0)+amount(p.amount));
  }

  const issues=[];

  for(const lead of visibleLeads){
    if(lead.estado==='confirmado'&&String(lead.lifecycle_stage||'active')==='active'){
      const leadServices=services.filter(s=>s.lead_id===lead.id&&s.estado_operacion!=='Cancelado');
      if(!leadServices.length){
        issues.push(issue({
          severity:'warning',category:'commercial',
          title:'Reserva confirmada sin servicios activos',
          detail:`${lead.reserva} está confirmada pero no tiene experiencias activas.`,
          recommended_action:'Revisar si faltó registrar el itinerario o si la reserva debe cambiar de estado.',
          lead
        }));
      }
      if(!String(lead.contacto||'').trim()){
        issues.push(issue({
          severity:'info',category:'data',
          title:'Reserva confirmada sin contacto',
          detail:`${lead.reserva} no tiene teléfono ni email en el contacto principal.`,
          recommended_action:'Completar un medio de contacto antes de la operación.',
          lead
        }));
      }
    }
  }

  for(const service of services){
    const lead=leadMap.get(service.lead_id);
    if(!lead)continue;
    const assignment=assignmentMap.get(service.id);
    const closure=closureMap.get(service.id);
    const mode=modeFor(assignment);
    const coverage=coverageFor(assignment);
    const delegated=Boolean(assignment?.supplier_id)&&mode!=='direct';
    const covered=k=>delegated&&coverage.includes(k);
    const hrs=hoursUntil(service.fecha_servicio);
    const upcoming14=Boolean(service.fecha_servicio&&service.fecha_servicio>=today&&service.fecha_servicio<=end14);
    const upcoming48=hrs!==null&&hrs>=-12&&hrs<=48;
    const expectedPax=Math.max(1,Number(service.numero_pax||lead.numero_pax||1));
    const registeredPax=paxCount.get(service.lead_id)||0;
    const risk=riskMap.get(service.lead_id);
    const riskReady=Boolean(risk?.url)||String(risk?.status||'').toLowerCase().includes('complet');
    const supplierName=assignment?.supplier_id?supplierMap.get(assignment.supplier_id)||'Proveedor asignado':null;

    if(service.fecha_servicio&&service.fecha_servicio<today&&!['Completado','Cancelado'].includes(String(service.estado_operacion))){
      issues.push(issue({
        severity:'warning',category:'operation',
        title:'Servicio pasado todavía abierto',
        detail:`${service.producto} fue el ${service.fecha_servicio} y continúa como ${service.estado_operacion}.`,
        recommended_action:'Confirmar si se operó, canceló o debe cerrarse formalmente.',
        lead,service
      }));
    }

    if(service.fecha_servicio&&service.fecha_servicio>today&&service.estado_operacion==='Completado'){
      issues.push(issue({
        severity:'warning',category:'contradiction',
        title:'Servicio futuro marcado como completado',
        detail:`${service.producto} figura Completado pero su fecha es ${service.fecha_servicio}.`,
        recommended_action:'Revisar la fecha o corregir el estado operacional.',
        lead,service
      }));
    }

    if(closure?.closure_status==='closed'&&!['Completado','Cancelado'].includes(String(service.estado_operacion))){
      issues.push(issue({
        severity:'warning',category:'contradiction',
        title:'Cierre final contradice el estado operacional',
        detail:`Existe un cierre final, pero el servicio sigue como ${service.estado_operacion}.`,
        recommended_action:'Revisar el cierre y alinear el estado operacional.',
        lead,service
      }));
    }

    if(closure?.closure_status==='closed'&&closure.outcome==='not_operated'&&service.estado_operacion!=='Cancelado'){
      issues.push(issue({
        severity:'warning',category:'contradiction',
        title:'Servicio no operado no está cancelado',
        detail:'El cierre indica “No operado”, pero el estado del servicio no es Cancelado.',
        recommended_action:'Corregir el estado operacional o reabrir el cierre si el resultado fue otro.',
        lead,service
      }));
    }

    if(service.estado_operacion==='Completado'&&!closure){
      issues.push(issue({
        severity:'info',category:'closure',
        title:'Servicio completado sin cierre final',
        detail:`${service.producto} terminó, pero todavía no tiene snapshot de resultado real.`,
        recommended_action:'Realizar el cierre operacional para fijar costo, reembolso y margen final.',
        lead,service
      }));
    }

    if(closure?.closure_status==='closed'&&closure.refund_status==='Pendiente'&&amount(closure.refund_amount)>0){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Reembolso pendiente después del cierre',
        detail:`Quedan ${money(closure.refund_amount)} comprometidos como reembolso pendiente.`,
        recommended_action:'Revisar Finanzas y registrar el pago del reembolso cuando corresponda.',
        lead,service
      }));
    }

    const grossSale=amount(service.precio_venta);
    const finalSale=closure?.closure_status==='closed'?amount(closure.net_sale_snapshot):grossSale;
    const clientPaid=paymentMap.get(`${service.id}:client`)||0;
    const supplierPaid=paymentMap.get(`${service.id}:supplier`)||0;
    const supplierCost=closure?.closure_status==='closed'
      ?amount(closure.supplier_cost_snapshot)
      :amount(assignment?.supplier_cost);

    if(service.estado_pago==='Pagado'&&clientPaid>0&&clientPaid+1<finalSale){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Estado Pagado contradice los abonos',
        detail:`El servicio figura Pagado, pero los movimientos suman ${money(clientPaid)} sobre ${money(finalSale)}.`,
        recommended_action:'Revisar los movimientos o corregir el estado de pago.',
        lead,service
      }));
    }

    if(service.estado_pago==='Pendiente'&&clientPaid>0){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Existen abonos con estado Pendiente',
        detail:`Hay ${money(clientPaid)} registrados, pero el servicio continúa como Pendiente.`,
        recommended_action:'Revisar el estado de cobro del cliente.',
        lead,service
      }));
    }

    if(finalSale>0&&clientPaid>finalSale+1){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Cobros superiores a la venta neta',
        detail:`Los movimientos de cliente suman ${money(clientPaid)} y la venta neta es ${money(finalSale)}.`,
        recommended_action:'Revisar duplicidad de abonos, devolución o saldo a favor.',
        lead,service
      }));
    }

    if(assignment?.supplier_payment_status==='Pagado'&&supplierPaid>0&&supplierPaid+1<supplierCost){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Proveedor figura Pagado con saldo',
        detail:`Pagos registrados ${money(supplierPaid)} sobre costo proveedor ${money(supplierCost)}.`,
        recommended_action:'Revisar el movimiento o el estado de pago del proveedor.',
        lead,service
      }));
    }

    if(supplierCost>0&&supplierPaid>supplierCost+1){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Pago proveedor superior al costo',
        detail:`Los pagos al proveedor suman ${money(supplierPaid)} sobre un costo de ${money(supplierCost)}.`,
        recommended_action:'Revisar duplicidad, anticipo o diferencia de costo.',
        lead,service
      }));
    }

    if(service.estado_operacion==='Cancelado'&&(service.estado_pago==='Pagado'||clientPaid>0)&&!closure?.refund_amount){
      issues.push(issue({
        severity:'warning',category:'finance',
        title:'Servicio cancelado con cobro y sin reembolso registrado',
        detail:'Existe pago del cliente, pero no aparece un reembolso asociado al cierre.',
        recommended_action:'Revisar política aplicada y documentar el reembolso o motivo de no devolución.',
        lead,service
      }));
    }

    if(upcoming14&&service.estado_operacion!=='Cancelado'){
      if(grossSale<=0&&lead.estado==='confirmado'){
        issues.push(issue({
          severity:'warning',category:'commercial',
          title:'Servicio confirmado sin precio de venta',
          detail:`${service.producto} está próximo y no tiene venta registrada.`,
          recommended_action:'Validar tarifa antes de operar o cerrar financieramente.',
          lead,service
        }));
      }

      if(service.pricing_status==='manual_quote'&&lead.estado==='confirmado'){
        issues.push(issue({
          severity:'warning',category:'commercial',
          title:'Reserva confirmada conserva cotización manual',
          detail:'El servicio está confirmado pero su precio sigue marcado para validación manual.',
          recommended_action:'Confirmar el valor final y documentar la fuente de precio.',
          lead,service
        }));
      }

      if(registeredPax<expectedPax){
        issues.push(issue({
          severity:upcoming48?'critical':'warning',category:'operation',
          title:'Pasajeros incompletos para una salida próxima',
          detail:`Hay ${registeredPax}/${expectedPax} pasajeros registrados para ${service.producto}.`,
          recommended_action:'Completar pasajeros y datos operacionales antes de la salida.',
          lead,service
        }));
      }

      if(!riskReady){
        issues.push(issue({
          severity:upcoming48?'critical':'warning',category:'operation',
          title:'Hoja de riesgo pendiente',
          detail:`${service.producto} no tiene hoja de riesgo completada o enlazada.`,
          recommended_action:'Completar la hoja de riesgo antes de operar.',
          lead,service
        }));
      }

      if(!assignment?.pickup_time&&!assignment?.meeting_point){
        issues.push(issue({
          severity:upcoming48?'critical':'warning',category:'operation',
          title:'Salida sin pickup ni punto de encuentro',
          detail:`${service.producto} no tiene una coordinación de encuentro registrada.`,
          recommended_action:'Confirmar hora y lugar de encuentro con pasajero/proveedor.',
          lead,service
        }));
      }

      if(mode==='direct'){
        const missing=[];
        if(!assignment?.guide_person_id&&!assignment?.guide_name)missing.push('guía');
        if(!assignment?.driver_person_id&&!assignment?.driver_name)missing.push('conductor');
        if(!assignment?.vehicle_id)missing.push('vehículo');
        if(missing.length){
          issues.push(issue({
            severity:upcoming48?'critical':'warning',category:'operation',
            title:'Operación directa con recursos pendientes',
            detail:`Falta ${missing.join(', ')} para ${service.producto}.`,
            recommended_action:'Completar la asignación interna o cambiar el modo de ejecución si corresponde.',
            lead,service
          }));
        }
      }else{
        if(!assignment?.supplier_id){
          issues.push(issue({
            severity:upcoming48?'critical':'warning',category:'operation',
            title:'Derivación sin proveedor',
            detail:`${service.producto} está configurado como ${mode==='delegated_partial'?'derivada parcial':'derivada integral'} pero no tiene proveedor.`,
            recommended_action:'Asignar proveedor o corregir el modo de ejecución.',
            lead,service
          }));
        }else if(supplierCost<=0){
          issues.push(issue({
            severity:'warning',category:'finance',
            title:'Proveedor asignado sin costo de adquisición',
            detail:`${supplierName||'El proveedor'} está asignado a ${service.producto}, pero el costo figura en $0.`,
            recommended_action:'Registrar el costo de adquisición para no distorsionar el margen.',
            lead,service
          }));
        }

        if(mode==='delegated_partial'){
          const missing=[];
          if(!covered('guide')&&!assignment?.guide_person_id&&!assignment?.guide_name)missing.push('guía');
          if(!covered('driver')&&!assignment?.driver_person_id&&!assignment?.driver_name)missing.push('conductor');
          if(!covered('vehicle')&&!assignment?.vehicle_id)missing.push('vehículo');
          if(missing.length){
            issues.push(issue({
              severity:upcoming48?'critical':'warning',category:'operation',
              title:'Derivación parcial con cobertura incompleta',
              detail:`El proveedor no cubre ${missing.join(', ')} y tampoco hay asignación interna.`,
              recommended_action:'Completar los recursos no cubiertos por el proveedor.',
              lead,service
            }));
          }
        }
      }
    }
  }

  // Conflictos fuertes: mismo recurso, misma fecha y misma hora de pickup.
  const activeAssignments=assignments
    .map(a=>({a,s:services.find(s=>s.id===a.lead_service_id)}))
    .filter(x=>x.s?.fecha_servicio&&x.s.estado_operacion!=='Cancelado'&&x.a.pickup_time);

  const conflictFields=[
    ['vehicle_id','Vehículo'],
    ['guide_person_id','Guía'],
    ['driver_person_id','Conductor']
  ];

  for(const [field,label] of conflictFields){
    const seen=new Map();
    for(const row of activeAssignments){
      const resource=row.a[field];
      if(!resource)continue;
      const time=String(row.a.pickup_time).slice(0,5);
      const key=`${resource}|${row.s.fecha_servicio}|${time}`;
      const previous=seen.get(key);
      if(previous&&previous.s.id!==row.s.id){
        const lead=leadMap.get(row.s.lead_id);
        const otherLead=leadMap.get(previous.s.lead_id);
        issues.push(issue({
          severity:'critical',category:'conflict',
          title:`${label} duplicado en la misma hora`,
          detail:`${row.s.fecha_servicio} ${time}: ${row.s.producto} (${lead?.reserva||'cliente'}) coincide con ${previous.s.producto} (${otherLead?.reserva||'cliente'}).`,
          recommended_action:`Revisar la asignación de ${label.toLowerCase()} antes de confirmar ambas salidas.`,
          lead,service:row.s
        }));
      }else{
        seen.set(key,row);
      }
    }
  }

  // Posible duplicidad: se marca como dato a revisar, nunca como error.
  const contactSeen=new Map();
  for(const lead of visibleLeads){
    const contact=normalizeContact(lead.contacto);
    if(!contact)continue;
    const previous=contactSeen.get(contact);
    if(previous&&previous.id!==lead.id&&String(previous.lifecycle_stage||'active')==='active'&&String(lead.lifecycle_stage||'active')==='active'){
      issues.push(issue({
        severity:'info',category:'data',
        title:'Mismo contacto en dos leads activos',
        detail:`${previous.reserva} (${previous.codigo}) y ${lead.reserva} (${lead.codigo}) comparten el mismo contacto. Puede ser cliente recurrente o un duplicado.`,
        recommended_action:'Revisar antes de fusionar o eliminar información.',
        lead
      }));
    }else contactSeen.set(contact,lead);
  }

  return finalize(issues);
}

function finalize(raw){
  const deduped=[...new Map(raw.map(i=>[keyIssue(i),i])).values()]
    .sort((a,b)=>severityRank(a.severity)-severityRank(b.severity)
      ||String(a.service_date||'9999-12-31').localeCompare(String(b.service_date||'9999-12-31')));
  return {
    generated_at:new Date().toISOString(),
    summary:{
      total:deduped.length,
      critical:deduped.filter(x=>x.severity==='critical').length,
      warning:deduped.filter(x=>x.severity==='warning').length,
      info:deduped.filter(x=>x.severity==='info').length
    },
    issues:deduped.slice(0,120)
  };
}
function normalizeContact(value){
  const raw=String(value||'').toLowerCase();
  const email=raw.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/)?.[0];
  if(email)return `email:${email}`;
  const phone=raw.replace(/\D/g,'');
  return phone.length>=8?`phone:${phone.slice(-9)}`:'';
}
function money(value){
  return new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(amount(value));
}
