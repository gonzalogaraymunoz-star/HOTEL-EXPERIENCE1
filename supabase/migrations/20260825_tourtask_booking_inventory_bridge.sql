alter table public.lead_services
  add column if not exists booking_status text,
  add column if not exists hold_expires_at timestamptz,
  add column if not exists sales_channel text,
  add column if not exists external_booking_ref text,
  add column if not exists departure_id uuid;

update public.lead_services s
set booking_status = case
  when s.estado_operacion = 'Cancelado' then 'cancelled'
  when s.estado_operacion = 'Completado' then 'completed'
  else 'confirmed'
end
where booking_status is null;

update public.lead_services s
set sales_channel = coalesce(nullif(l.canal,''),'Directo')
from public.leads l
where l.id=s.lead_id and (s.sales_channel is null or btrim(s.sales_channel)='');

alter table public.lead_services
  alter column booking_status set default 'confirmed',
  alter column booking_status set not null;

create table if not exists public.tour_departures (
  id uuid primary key default gen_random_uuid(),
  tour_id text not null,
  product_name text not null,
  service_date date not null,
  start_time time,
  capacity_total integer not null default 0 check (capacity_total >= 0),
  status text not null default 'open' check (status in ('open','closed','cancelled')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tour_departures_unique_slot_idx
  on public.tour_departures (tour_id, service_date, coalesce(start_time,'00:00'::time));
create index if not exists tour_departures_date_idx on public.tour_departures(service_date);
create index if not exists lead_services_departure_idx on public.lead_services(departure_id);
create index if not exists lead_services_booking_status_idx on public.lead_services(booking_status);

alter table public.lead_services
  drop constraint if exists lead_services_booking_status_check;
alter table public.lead_services
  add constraint lead_services_booking_status_check
  check (booking_status in ('hold','confirmed','cancelled','completed','expired'));

alter table public.lead_services
  drop constraint if exists lead_services_departure_id_fkey;
alter table public.lead_services
  add constraint lead_services_departure_id_fkey
  foreign key (departure_id) references public.tour_departures(id) on delete set null;

alter table public.tour_departures enable row level security;

drop policy if exists tour_departures_auth_read on public.tour_departures;
create policy tour_departures_auth_read on public.tour_departures
  for select to authenticated using (true);

drop policy if exists tour_departures_auth_insert on public.tour_departures;
create policy tour_departures_auth_insert on public.tour_departures
  for insert to authenticated with check (true);

drop policy if exists tour_departures_auth_update on public.tour_departures;
create policy tour_departures_auth_update on public.tour_departures
  for update to authenticated using (true) with check (true);

drop policy if exists tour_departures_auth_delete on public.tour_departures;
create policy tour_departures_auth_delete on public.tour_departures
  for delete to authenticated using (true);

grant select,insert,update,delete on public.tour_departures to authenticated;

create or replace function public.normalize_booking_inventory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_capacity integer;
  v_status text;
  v_date date;
  v_tour_id text;
  v_reserved integer;
  v_channel text;
begin
  if new.sales_channel is null or btrim(new.sales_channel)='' then
    select nullif(btrim(canal),'') into v_channel from public.leads where id=new.lead_id;
    new.sales_channel := coalesce(v_channel,'Directo');
  end if;

  if new.estado_operacion='Cancelado' then
    new.booking_status := 'cancelled';
  elsif new.estado_operacion='Completado' and new.booking_status not in ('cancelled','expired') then
    new.booking_status := 'completed';
  end if;

  if new.booking_status='hold' then
    if new.hold_expires_at is null then
      new.hold_expires_at := now() + interval '15 minutes';
    end if;
  else
    new.hold_expires_at := null;
  end if;

  if new.departure_id is null then
    return new;
  end if;

  if new.booking_status not in ('hold','confirmed') then
    return new;
  end if;

  if new.booking_status='hold' and new.hold_expires_at <= now() then
    return new;
  end if;

  select capacity_total,status,service_date,tour_id
    into v_capacity,v_status,v_date,v_tour_id
  from public.tour_departures
  where id=new.departure_id;

  if not found then
    raise exception 'La salida seleccionada no existe.';
  end if;
  if v_status <> 'open' then
    raise exception 'La salida seleccionada no está abierta para reservas.';
  end if;
  if new.fecha_servicio is not null and new.fecha_servicio <> v_date then
    raise exception 'La fecha del servicio no coincide con la salida.';
  end if;
  if new.tour_id is not null and btrim(new.tour_id)<>'' and new.tour_id <> v_tour_id then
    raise exception 'El producto del servicio no coincide con la salida.';
  end if;

  select coalesce(sum(numero_pax),0)::integer into v_reserved
  from public.lead_services
  where departure_id=new.departure_id
    and (new.id is null or id<>new.id)
    and (
      booking_status='confirmed'
      or (booking_status='hold' and (hold_expires_at is null or hold_expires_at>now()))
    );

  if v_reserved + greatest(coalesce(new.numero_pax,0),0) > v_capacity then
    raise exception 'No hay cupos suficientes. Capacidad %, ocupados %, solicitados %.', v_capacity, v_reserved, new.numero_pax;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_normalize_booking_inventory on public.lead_services;
create trigger trg_normalize_booking_inventory
before insert or update of departure_id,booking_status,hold_expires_at,numero_pax,fecha_servicio,tour_id,sales_channel,estado_operacion
on public.lead_services
for each row execute function public.normalize_booking_inventory();

create or replace function public.expire_booking_holds()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare v_count integer;
begin
  update public.lead_services
  set booking_status='expired', hold_expires_at=null, updated_at=now()
  where booking_status='hold' and hold_expires_at is not null and hold_expires_at<=now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.expire_booking_holds() to authenticated;

create or replace view public.departure_inventory
with (security_invoker=true)
as
select
  d.id,
  d.tour_id,
  d.product_name,
  d.service_date,
  d.start_time,
  d.capacity_total,
  d.status,
  d.notes,
  d.created_by,
  d.created_at,
  d.updated_at,
  coalesce(sum(case when s.booking_status='confirmed' then s.numero_pax else 0 end),0)::integer as confirmed_pax,
  coalesce(sum(case when s.booking_status='hold' and (s.hold_expires_at is null or s.hold_expires_at>now()) then s.numero_pax else 0 end),0)::integer as hold_pax,
  greatest(
    d.capacity_total - coalesce(sum(case
      when s.booking_status='confirmed' then s.numero_pax
      when s.booking_status='hold' and (s.hold_expires_at is null or s.hold_expires_at>now()) then s.numero_pax
      else 0 end),0)::integer,
    0
  )::integer as available_pax,
  count(s.id) filter (where s.booking_status in ('confirmed','hold'))::integer as active_reservations
from public.tour_departures d
left join public.lead_services s on s.departure_id=d.id
group by d.id;

grant select on public.departure_inventory to authenticated;
