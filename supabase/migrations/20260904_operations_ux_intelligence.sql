-- HOTEL EXPERIENCE · operación v2
-- Soporta asignaciones manuales explícitas, panel de alimentación y estados reales de preparación/entrega.

alter table public.service_assignments
  add column if not exists vehicle_name_manual text,
  add column if not exists cook_name text,
  add column if not exists coordinator_name text;

alter table public.service_resource_assignments
  add column if not exists fulfillment_status text not null default 'Pendiente',
  add column if not exists prepared_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists idx_lead_services_operation_day
  on public.lead_services (fecha_servicio, booking_status, estado_operacion);

create index if not exists idx_service_resource_assignments_service
  on public.service_resource_assignments (lead_service_id);

create index if not exists idx_operational_resources_type
  on public.operational_resources (lower(resource_type));

create or replace function public.sync_resource_fulfillment_timestamps()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.fulfillment_status = 'Preparado' and old.fulfillment_status is distinct from new.fulfillment_status then
    new.prepared_at := coalesce(new.prepared_at, now());
  end if;
  if new.fulfillment_status = 'Entregado' and old.fulfillment_status is distinct from new.fulfillment_status then
    new.prepared_at := coalesce(new.prepared_at, now());
    new.delivered_at := coalesce(new.delivered_at, now());
  end if;
  if new.fulfillment_status = 'Pendiente' and old.fulfillment_status is distinct from new.fulfillment_status then
    new.prepared_at := null;
    new.delivered_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_resource_fulfillment_timestamps on public.service_resource_assignments;
create trigger trg_sync_resource_fulfillment_timestamps
before update of fulfillment_status on public.service_resource_assignments
for each row execute function public.sync_resource_fulfillment_timestamps();

create or replace view public.operation_food_board
with (security_invoker=true)
as
select
  sra.id as assignment_id,
  sra.lead_service_id,
  sra.resource_id,
  sra.quantity,
  sra.notes,
  sra.fulfillment_status,
  sra.prepared_at,
  sra.delivered_at,
  r.code as resource_code,
  r.name as resource_name,
  r.resource_type,
  ls.service_code,
  ls.producto,
  ls.fecha_servicio,
  ls.numero_pax,
  ls.hora_inicio,
  ls.estado_operacion,
  l.id as lead_id,
  l.codigo as lead_code,
  l.reserva as lead_name,
  l.empresa_ejecuta as hotel,
  sa.pickup_time,
  sa.meeting_point
from public.service_resource_assignments sra
join public.operational_resources r on r.id=sra.resource_id
join public.lead_services ls on ls.id=sra.lead_service_id
join public.leads l on l.id=ls.lead_id
left join public.service_assignments sa on sa.lead_service_id=ls.id
where lower(trim(r.resource_type)) in ('alimentación','alimentacion','food','alimentos');

comment on view public.operation_food_board is 'Panel derivado de alimentación: todo recurso asignado cuyo tipo sea Alimentación aparece aquí automáticamente.';
