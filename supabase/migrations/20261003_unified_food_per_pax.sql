create table if not exists public.tour_food_segments (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.tour_departures(id) on delete cascade,
  food_type text not null check (food_type in ('Desayuno','Aperitivo','Almuerzo','Snack','Box lunch','Agua individual')),
  unit_cost numeric(12,2) not null default 0,
  currency text not null default 'CLP',
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text,
  fulfillment_status text not null default 'Pendiente' check (fulfillment_status in ('Pendiente','Preparado','Entregado')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(departure_id,food_type)
);

create table if not exists public.tour_food_passengers (
  id uuid primary key default gen_random_uuid(),
  segment_id uuid not null references public.tour_food_segments(id) on delete cascade,
  passenger_id uuid not null references public.passengers(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(segment_id,passenger_id)
);

create index if not exists tour_food_segments_departure_idx on public.tour_food_segments(departure_id);
create index if not exists tour_food_passengers_segment_idx on public.tour_food_passengers(segment_id);
create index if not exists tour_food_passengers_passenger_idx on public.tour_food_passengers(passenger_id);

alter table public.tour_food_segments enable row level security;
alter table public.tour_food_passengers enable row level security;

drop policy if exists tour_food_segments_read on public.tour_food_segments;
create policy tour_food_segments_read on public.tour_food_segments
for select to authenticated
using ((select current_user_role()) is not null);

drop policy if exists tour_food_segments_write on public.tour_food_segments;
create policy tour_food_segments_write on public.tour_food_segments
for all to authenticated
using ((select current_user_role()) = any(array['admin','manager','agent']))
with check ((select current_user_role()) = any(array['admin','manager','agent']));

drop policy if exists tour_food_passengers_read on public.tour_food_passengers;
create policy tour_food_passengers_read on public.tour_food_passengers
for select to authenticated
using ((select current_user_role()) is not null);

drop policy if exists tour_food_passengers_write on public.tour_food_passengers;
create policy tour_food_passengers_write on public.tour_food_passengers
for all to authenticated
using ((select current_user_role()) = any(array['admin','manager','agent']))
with check ((select current_user_role()) = any(array['admin','manager','agent']));

drop view if exists public.operation_food_board;
create view public.operation_food_board
with (security_invoker=true)
as
select
  fs.id as segment_id,
  fs.departure_id,
  d.departure_code,
  d.product_name as producto,
  d.service_date as fecha_servicio,
  d.start_time as hora_inicio,
  d.modality,
  fs.food_type,
  fs.unit_cost,
  fs.currency,
  fs.notes,
  fs.fulfillment_status,
  fs.supplier_id,
  s.name as supplier_name,
  s.supplier_code,
  coalesce(a.assigned_units,0)::integer as assigned_units,
  coalesce(a.assigned_pax,0)::integer as assigned_pax,
  coalesce(a.passenger_names,'') as passenger_names,
  coalesce(a.reservation_codes,'') as reservation_codes,
  coalesce(t.total_pax,0)::integer as total_pax,
  (coalesce(a.assigned_units,0) * fs.unit_cost)::numeric(14,2) as total_cost
from public.tour_food_segments fs
join public.tour_departures d on d.id=fs.departure_id
left join public.suppliers s on s.id=fs.supplier_id
left join lateral (
  select
    sum(tfp.quantity)::integer as assigned_units,
    count(distinct tfp.passenger_id)::integer as assigned_pax,
    string_agg(distinct p.full_name,' · ' order by p.full_name) as passenger_names,
    string_agg(distinct l.codigo,' · ' order by l.codigo) as reservation_codes
  from public.tour_food_passengers tfp
  join public.passengers p on p.id=tfp.passenger_id
  join public.leads l on l.id=p.lead_id
  where tfp.segment_id=fs.id
) a on true
left join lateral (
  select sum(ls.numero_pax)::integer as total_pax
  from public.lead_services ls
  where ls.departure_id=d.id
    and ls.booking_status in ('confirmed','completed')
) t on true;

comment on table public.tour_food_segments is 'Alimentación por tramo/tour: solo seis tipos canónicos y su costo operacional.';
comment on table public.tour_food_passengers is 'Asignación individual de alimentación por pasajero dentro de cada tour.';
