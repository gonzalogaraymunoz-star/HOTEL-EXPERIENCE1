create or replace function public.sync_confirmed_service_assignment_autofill()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lead public.leads%rowtype;
  v_departure public.tour_departures%rowtype;
  v_old_supplier uuid;
  v_old_time time;
  v_old_cost numeric;
begin
  if new.booking_status not in ('confirmed','completed') then
    return new;
  end if;

  select * into v_lead from public.leads where id = new.lead_id;
  if new.departure_id is not null then
    select * into v_departure from public.tour_departures where id = new.departure_id;
  end if;

  if tg_op = 'UPDATE' then
    v_old_supplier := old.proposed_supplier_id;
    v_old_time := old.hora_inicio;
    v_old_cost := old.costo_operador_total;
  end if;

  insert into public.service_assignments(
    lead_service_id,
    supplier_id,
    pickup_time,
    meeting_point,
    supplier_cost,
    supplier_payment_status,
    operation_mode,
    supplier_coverage,
    notes
  ) values (
    new.id,
    new.proposed_supplier_id,
    coalesce(new.hora_inicio, v_departure.start_time),
    nullif(v_lead.pickup_location, ''),
    coalesce(new.costo_operador_total, 0),
    'Pendiente',
    case when new.proposed_supplier_id is not null then 'delegated_full' else 'direct' end,
    case when new.proposed_supplier_id is not null
      then '["vehicle","driver","guide","food","coordination","resources","entrances"]'::jsonb
      else '[]'::jsonb
    end,
    'Valores heredados automáticamente desde Ventas; Operaciones puede sobrescribirlos cuando corresponda.'
  )
  on conflict (lead_service_id) do update set
    supplier_id = case
      when service_assignments.supplier_id is null
        or service_assignments.supplier_id is not distinct from v_old_supplier
      then excluded.supplier_id
      else service_assignments.supplier_id
    end,
    pickup_time = case
      when service_assignments.pickup_time is null
        or service_assignments.pickup_time is not distinct from v_old_time
      then excluded.pickup_time
      else service_assignments.pickup_time
    end,
    meeting_point = case
      when nullif(btrim(coalesce(service_assignments.meeting_point, '')), '') is null
      then excluded.meeting_point
      else service_assignments.meeting_point
    end,
    supplier_cost = case
      when coalesce(service_assignments.supplier_cost, 0) = 0
        or service_assignments.supplier_cost is not distinct from v_old_cost
      then excluded.supplier_cost
      else service_assignments.supplier_cost
    end,
    operation_mode = case
      when service_assignments.supplier_id is null
        or service_assignments.supplier_id is not distinct from v_old_supplier
      then excluded.operation_mode
      else service_assignments.operation_mode
    end,
    supplier_coverage = case
      when service_assignments.supplier_id is null
        or service_assignments.supplier_id is not distinct from v_old_supplier
      then excluded.supplier_coverage
      else service_assignments.supplier_coverage
    end,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_service_assignment_autofill on public.lead_services;
create trigger trg_service_assignment_autofill
after insert or update of booking_status, proposed_supplier_id, hora_inicio, costo_operador_total, departure_id
on public.lead_services
for each row
execute function public.sync_confirmed_service_assignment_autofill();

create or replace function public.sync_lead_pickup_to_inherited_assignments()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.pickup_location is not distinct from old.pickup_location then
    return new;
  end if;

  update public.service_assignments sa
  set meeting_point = nullif(new.pickup_location, ''),
      updated_at = now()
  from public.lead_services ls
  where sa.lead_service_id = ls.id
    and ls.lead_id = new.id
    and (
      nullif(btrim(coalesce(sa.meeting_point, '')), '') is null
      or sa.meeting_point is not distinct from old.pickup_location
    );

  return new;
end;
$$;

drop trigger if exists trg_lead_pickup_inheritance on public.leads;
create trigger trg_lead_pickup_inheritance
after update of pickup_location on public.leads
for each row
execute function public.sync_lead_pickup_to_inherited_assignments();

create or replace function public.autofill_passenger_shared_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_nationality text;
begin
  if nullif(btrim(coalesce(new.nationality, '')), '') is null then
    select nationality into v_nationality from public.leads where id = new.lead_id;
    new.nationality := v_nationality;
  end if;

  if nullif(btrim(coalesce(new.full_name, '')), '') is null then
    new.full_name := nullif(btrim(concat_ws(' ', nullif(new.first_name, ''), nullif(new.last_name, ''))), '');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_passenger_shared_autofill on public.passengers;
create trigger trg_passenger_shared_autofill
before insert or update of lead_id, nationality, full_name, first_name, last_name
on public.passengers
for each row
execute function public.autofill_passenger_shared_fields();

create or replace function public.sync_lead_nationality_to_inherited_passengers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.nationality is not distinct from old.nationality then
    return new;
  end if;

  update public.passengers
  set nationality = new.nationality,
      updated_at = now()
  where lead_id = new.id
    and (
      nullif(btrim(coalesce(nationality, '')), '') is null
      or nationality is not distinct from old.nationality
    );

  return new;
end;
$$;

drop trigger if exists trg_lead_nationality_inheritance on public.leads;
create trigger trg_lead_nationality_inheritance
after update of nationality on public.leads
for each row
execute function public.sync_lead_nationality_to_inherited_passengers();

insert into public.service_assignments(
  lead_service_id,
  supplier_id,
  pickup_time,
  meeting_point,
  supplier_cost,
  supplier_payment_status,
  operation_mode,
  supplier_coverage,
  notes
)
select
  ls.id,
  ls.proposed_supplier_id,
  coalesce(ls.hora_inicio, td.start_time),
  nullif(l.pickup_location, ''),
  coalesce(ls.costo_operador_total, 0),
  'Pendiente',
  case when ls.proposed_supplier_id is not null then 'delegated_full' else 'direct' end,
  case when ls.proposed_supplier_id is not null
    then '["vehicle","driver","guide","food","coordination","resources","entrances"]'::jsonb
    else '[]'::jsonb
  end,
  'Valores heredados automáticamente desde Ventas; Operaciones puede sobrescribirlos cuando corresponda.'
from public.lead_services ls
join public.leads l on l.id = ls.lead_id
left join public.tour_departures td on td.id = ls.departure_id
where ls.booking_status in ('confirmed','completed')
on conflict (lead_service_id) do update set
  supplier_id = coalesce(service_assignments.supplier_id, excluded.supplier_id),
  pickup_time = coalesce(service_assignments.pickup_time, excluded.pickup_time),
  meeting_point = coalesce(nullif(service_assignments.meeting_point, ''), excluded.meeting_point),
  supplier_cost = case when coalesce(service_assignments.supplier_cost, 0) = 0 then excluded.supplier_cost else service_assignments.supplier_cost end,
  updated_at = now();

update public.passengers p
set nationality = l.nationality,
    updated_at = now()
from public.leads l
where p.lead_id = l.id
  and nullif(btrim(coalesce(p.nationality, '')), '') is null
  and nullif(btrim(coalesce(l.nationality, '')), '') is not null;
