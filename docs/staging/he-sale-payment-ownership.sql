-- CANDIDATE ONLY. Source: live definitions retrieved 2026-11-25.
-- Before applying, compare current definitions; test agent ownership and inactive users.
-- Existing business behavior is unchanged; this does not yet gate Opera on payment.
begin;
CREATE OR REPLACE FUNCTION public.confirm_link_sale(p_lead_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid:=auth.uid();
  v_role text;
  v_lead public.leads%rowtype;
  v_service public.lead_services%rowtype;
  v_primary public.passengers%rowtype;
  v_hotel_name text;
  v_confirmed integer:=0;
begin
  v_role:=public.current_user_role();
  if v_user is null or v_role is null or v_role not in ('admin','manager','agent') then raise exception 'Not authorized to confirm sales'; end if;
  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then raise exception 'Lead not found'; end if;
  if v_role='agent' and v_lead.assigned_to is distinct from v_user then
    raise exception 'Sin acceso a la venta asignada' using errcode='42501';
  end if;

  if exists(select 1 from public.lead_services where lead_id=p_lead_id and booking_status in ('confirmed','completed'))
     and not exists(select 1 from public.lead_services where lead_id=p_lead_id and booking_status='quoted') then
    return jsonb_build_object('lead_id',v_lead.id,'lead_code',v_lead.codigo,'already_confirmed',true);
  end if;

  select * into v_primary from public.passengers where lead_id=p_lead_id order by is_primary desc,passenger_code asc limit 1;
  if v_lead.hotel_partner_id is null then raise exception 'No se puede confirmar: falta hotel / origen.'; end if;
  if v_lead.assigned_to is null then raise exception 'No se puede confirmar: falta vendedor responsable.'; end if;
  if v_primary.id is null or nullif(trim(v_primary.full_name),'') is null or lower(trim(v_primary.full_name)) in ('cliente por completar','por completar') then
    raise exception 'No se puede confirmar: falta el nombre del cliente.';
  end if;
  if nullif(trim(coalesce(v_lead.contacto,'')),'') is null
     and nullif(trim(coalesce(v_primary.email,'')),'') is null
     and nullif(trim(coalesce(v_primary.phone,'')),'') is null then
    raise exception 'No se puede confirmar: falta teléfono o email del cliente.';
  end if;
  if v_lead.checkin is null then raise exception 'No se puede confirmar: falta fecha de arribo.'; end if;
  if v_lead.checkout is null then raise exception 'No se puede confirmar: falta fecha de salida.'; end if;
  if v_lead.checkout < v_lead.checkin then raise exception 'No se puede confirmar: la fecha de salida debe ser posterior al arribo.'; end if;
  if not exists(select 1 from public.lead_services where lead_id=p_lead_id and booking_status='quoted') then
    raise exception 'No se puede confirmar: agrega al menos un producto.';
  end if;
  if exists(
    select 1 from public.lead_services
    where lead_id=p_lead_id and booking_status='quoted'
      and (nullif(trim(producto),'') is null or fecha_servicio is null or coalesce(numero_pax,0)<=0 or coalesce(precio_total,precio_venta,0)<=0)
  ) then
    raise exception 'No se puede confirmar: completa nombre, fecha, cantidad y precio de todos los productos.';
  end if;
  if exists(
    select 1 from public.lead_services
    where lead_id=p_lead_id
      and booking_status='quoted'
      and product_catalog_id is null
      and operation_list_template_key is null
  ) then
    raise exception 'No se puede confirmar: selecciona la lista operacional que se automatizará para cada ítem manual.';
  end if;

  select hp.name into v_hotel_name from public.hotel_partners hp where hp.id=v_lead.hotel_partner_id;

  for v_service in select * from public.lead_services where lead_id=p_lead_id and booking_status='quoted' order by created_at,id
  loop
    update public.lead_services
    set booking_status='confirmed',pricing_status='confirmed',updated_at=now()
    where id=v_service.id;
    v_confirmed:=v_confirmed+1;

    if v_service.proposed_supplier_id is not null and not exists(select 1 from public.service_assignments a where a.lead_service_id=v_service.id) then
      insert into public.service_assignments(lead_service_id,supplier_id,supplier_cost,supplier_payment_status,created_by,updated_by,operation_mode,notes)
      values(v_service.id,v_service.proposed_supplier_id,coalesce(v_service.costo_operador_total,0),'Pendiente',v_user,v_user,'delegated_full','Operador propuesto por LINK Ventas; Operaciones debe validar la asignación.');
    end if;

    if coalesce(v_service.comision_hotel,0)>0 and not exists(select 1 from public.service_commissions c where c.lead_service_id=v_service.id and c.actor_type='hotel') then
      insert into public.service_commissions(lead_service_id,actor_type,actor_name,percentage,amount,calculation_basis,status,notes)
      values(v_service.id,'hotel',v_hotel_name,case when coalesce(v_service.margen_comercial,0)>0 then round((v_service.comision_hotel/v_service.margen_comercial)*100,4) else null end,v_service.comision_hotel,'margin','pending','Generada al confirmar venta en LINK');
    end if;
    if coalesce(v_service.comision_vendedor,0)>0 and not exists(select 1 from public.service_commissions c where c.lead_service_id=v_service.id and c.actor_type='seller') then
      insert into public.service_commissions(lead_service_id,actor_type,actor_name,percentage,amount,calculation_basis,status,notes)
      values(v_service.id,'seller',v_service.seller_name,case when coalesce(v_service.margen_comercial,0)>0 then round((v_service.comision_vendedor/v_service.margen_comercial)*100,4) else null end,v_service.comision_vendedor,'margin','pending','Generada al confirmar venta en LINK');
    end if;
    if coalesce(v_service.margen_hotel_experience,0)>0 and not exists(select 1 from public.service_commissions c where c.lead_service_id=v_service.id and c.actor_type='platform') then
      insert into public.service_commissions(lead_service_id,actor_type,actor_name,amount,calculation_basis,status,notes)
      values(v_service.id,'platform','HOTEL EXPERIENCE / LINK',v_service.margen_hotel_experience,'margin','pending','Margen remanente al confirmar venta');
    end if;
  end loop;

  update public.leads
  set estado='confirmado',commercial_status='won',lifecycle_stage='active',
      next_best_action='Operaciones: preparar servicios confirmados',updated_at=now()
  where id=p_lead_id;

  insert into public.crm_activities(lead_id,type,title,body,created_by)
  values(p_lead_id,'reservation_confirmed','Reserva confirmada y entregada a Operaciones',v_confirmed||' servicio(s) confirmados sobre el mismo registro comercial.',coalesce(v_user::text,'LINK Ventas'));

  return jsonb_build_object('lead_id',v_lead.id,'lead_code',v_lead.codigo,'confirmed_services',v_confirmed);
end;
$function$;

CREATE OR REPLACE FUNCTION public.register_link_client_payment(p_lead_id uuid, p_amount numeric, p_payment_method text DEFAULT NULL::text, p_reference text DEFAULT NULL::text, p_counterparty text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_role text := public.current_user_role();
  v_lead public.leads%rowtype;
  v_service public.lead_services%rowtype;
  v_total numeric;
  v_paid numeric;
  v_balance numeric;
  v_account_balance numeric := 0;
  v_remaining numeric := p_amount;
  v_apply numeric;
  v_allocated integer := 0;
  v_remaining_balance numeric;
begin
  if v_user is null or v_role is null or v_role not in ('admin','manager','agent') then
    raise exception 'Not authorized to register client payments';
  end if;
  if coalesce(p_amount,0) <= 0 then
    raise exception 'El monto debe ser mayor que cero';
  end if;

  select * into v_lead from public.leads where id=p_lead_id for update;
  if not found then raise exception 'Venta no encontrada'; end if;
  if v_role='agent' and v_lead.assigned_to is distinct from v_user then
    raise exception 'Sin acceso a la venta asignada' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_lead_id::text));

  for v_service in
    select * from public.lead_services
    where lead_id=p_lead_id and booking_status='confirmed'
    order by fecha_servicio nulls last, created_at, id
    for update
  loop
    v_total := coalesce(v_service.precio_total,v_service.precio_venta,0);
    select coalesce(sum(pm.amount),0) into v_paid
    from public.payment_movements pm
    where pm.lead_service_id=v_service.id
      and pm.party_type='client'
      and (pm.direction is null or pm.direction='inflow');
    if v_paid=0 and v_service.estado_pago='Pagado' then v_paid:=v_total; end if;
    v_account_balance := v_account_balance + greatest(0,v_total-v_paid);
  end loop;

  if v_account_balance <= 0 then raise exception 'La venta no tiene saldo pendiente'; end if;
  if p_amount > v_account_balance then
    raise exception 'El monto supera el saldo pendiente de %', to_char(v_account_balance,'FM999G999G999G990');
  end if;

  for v_service in
    select * from public.lead_services
    where lead_id=p_lead_id and booking_status='confirmed'
    order by fecha_servicio nulls last, created_at, id
    for update
  loop
    exit when v_remaining <= 0;
    v_total := coalesce(v_service.precio_total,v_service.precio_venta,0);
    select coalesce(sum(pm.amount),0) into v_paid
    from public.payment_movements pm
    where pm.lead_service_id=v_service.id
      and pm.party_type='client'
      and (pm.direction is null or pm.direction='inflow');
    if v_paid=0 and v_service.estado_pago='Pagado' then v_paid:=v_total; end if;
    v_balance := greatest(0,v_total-v_paid);
    if v_balance <= 0 then continue; end if;

    v_apply := least(v_remaining,v_balance);
    insert into public.payment_movements(
      lead_service_id,party_type,amount,currency,payment_method,reference,counterparty_name,direction,category,created_by
    ) values (
      v_service.id,'client',v_apply,coalesce(v_service.moneda,'CLP'),nullif(p_payment_method,''),nullif(p_reference,''),nullif(p_counterparty,''),'inflow','customer_payment',v_user
    );

    update public.lead_services
    set estado_pago = case when v_paid+v_apply >= v_total and v_total>0 then 'Pagado' else 'Parcial' end,
        updated_at=now()
    where id=v_service.id;

    v_remaining := v_remaining-v_apply;
    v_allocated := v_allocated+1;
  end loop;

  v_remaining_balance := greatest(0,v_account_balance-p_amount);
  update public.leads
  set next_best_action = case when v_remaining_balance<=0 then 'Cobro completo · continuar operación' else 'Cobrar saldo pendiente' end,
      updated_at=now()
  where id=p_lead_id;

  insert into public.crm_activities(lead_id,type,title,body,created_by)
  values(
    p_lead_id,
    'customer_payment',
    'Pago de cliente registrado',
    'Pago CLP '||to_char(p_amount,'FM999G999G999G990')||' distribuido en '||v_allocated||' servicio(s). Saldo restante CLP '||to_char(v_remaining_balance,'FM999G999G999G990')||'.',
    coalesce(v_user::text,'LINK Ventas')
  );

  return jsonb_build_object(
    'lead_id',p_lead_id,
    'amount',p_amount,
    'allocated_services',v_allocated,
    'remaining_balance',v_remaining_balance
  );
end;
$function$;
revoke execute on function public.confirm_link_sale(uuid) from public, anon;
revoke execute on function public.register_link_client_payment(uuid,numeric,text,text,text) from public, anon;
grant execute on function public.confirm_link_sale(uuid) to authenticated;
grant execute on function public.register_link_client_payment(uuid,numeric,text,text,text) to authenticated;
commit;
