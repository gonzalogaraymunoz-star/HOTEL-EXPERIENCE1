-- Harden access policies for departure-level resources and publish the daily food board.
drop policy if exists tour_departure_resources_read on public.tour_departure_resources;
drop policy if exists tour_departure_resources_insert on public.tour_departure_resources;
drop policy if exists tour_departure_resources_update on public.tour_departure_resources;
drop policy if exists tour_departure_resources_delete on public.tour_departure_resources;
drop policy if exists tour_departure_resources_write on public.tour_departure_resources;

create policy tour_departure_resources_read
on public.tour_departure_resources for select to authenticated
using ((select public.current_user_role()) is not null);

create policy tour_departure_resources_insert
on public.tour_departure_resources for insert to authenticated
with check ((select public.current_user_role()) in ('admin','manager','agent'));

create policy tour_departure_resources_update
on public.tour_departure_resources for update to authenticated
using ((select public.current_user_role()) in ('admin','manager','agent'))
with check ((select public.current_user_role()) in ('admin','manager','agent'));

create policy tour_departure_resources_delete
on public.tour_departure_resources for delete to authenticated
using ((select public.current_user_role()) in ('admin','manager','agent'));

drop policy if exists tour_departure_notes_read on public.tour_departure_notes;
drop policy if exists tour_departure_notes_insert on public.tour_departure_notes;
drop policy if exists tour_departure_notes_delete on public.tour_departure_notes;

create policy tour_departure_notes_read
on public.tour_departure_notes for select to authenticated
using ((select public.current_user_role()) is not null);

create policy tour_departure_notes_insert
on public.tour_departure_notes for insert to authenticated
with check (
  (select public.current_user_role()) in ('admin','manager','agent')
  and created_by = (select auth.uid())
);

create policy tour_departure_notes_delete
on public.tour_departure_notes for delete to authenticated
using ((select public.current_user_role()) in ('admin','manager'));

revoke all on function public.sync_resource_fulfillment_timestamps() from public, anon, authenticated;

drop view if exists public.operation_food_board;
create view public.operation_food_board
with (security_invoker = true)
as
select
  tdr.id as assignment_id,
  x.lead_service_id,
  tdr.resource_id,
  tdr.quantity,
  tdr.notes,
  tdr.fulfillment_status,
  tdr.prepared_at,
  tdr.delivered_at,
  r.code as resource_code,
  r.name as resource_name,
  r.resource_type,
  x.service_code,
  d.product_name as producto,
  d.service_date as fecha_servicio,
  x.total_pax as numero_pax,
  d.start_time as hora_inicio,
  x.estado_operacion,
  x.lead_id,
  x.reservation_codes as lead_code,
  x.reservation_names as lead_name,
  x.hotels as hotel,
  a.pickup_time,
  a.meeting_point,
  d.id as departure_id,
  d.departure_code,
  d.modality,
  x.reservation_codes,
  x.passenger_names,
  coalesce(rs.name, os.name, 'Sin proveedor asignado') as supplier_name,
  coalesce(rs.supplier_code, os.supplier_code) as supplier_code
from public.tour_departure_resources tdr
join public.tour_departures d on d.id = tdr.departure_id
join public.operational_resources r on r.id = tdr.resource_id
left join public.suppliers rs on rs.id = r.supplier_id
left join lateral (
  select
    (array_agg(ls.id order by ls.created_at, ls.id))[1] as lead_service_id,
    min(ls.service_code) as service_code,
    (array_agg(l.id order by ls.created_at, ls.id))[1] as lead_id,
    sum(ls.numero_pax)::integer as total_pax,
    string_agg(distinct l.codigo, ' · ' order by l.codigo) as reservation_codes,
    string_agg(distinct coalesce(l.reservation_reference, l.reserva, l.codigo), ' · ') as reservation_names,
    string_agg(distinct coalesce(l.empresa_ejecuta, 'Sin hotel'), ' · ') as hotels,
    string_agg(distinct p.full_name, ' · ' order by p.full_name) as passenger_names,
    case
      when bool_and(ls.estado_operacion = 'Completado') then 'Completado'
      when bool_or(ls.estado_operacion = 'En curso') then 'En curso'
      when bool_and(ls.estado_operacion = 'Coordinado') then 'Coordinado'
      else 'Pendiente'
    end as estado_operacion
  from public.lead_services ls
  join public.leads l on l.id = ls.lead_id
  left join public.lead_service_passengers lsp on lsp.lead_service_id = ls.id
  left join public.passengers p on p.id = lsp.passenger_id
  where ls.departure_id = d.id
    and ls.booking_status in ('confirmed','completed')
  group by ls.departure_id
) x on true
left join lateral (
  select sa.*
  from public.service_assignments sa
  join public.lead_services ls on ls.id = sa.lead_service_id
  where ls.departure_id = d.id
  order by sa.created_at
  limit 1
) a on true
left join public.suppliers os on os.id = a.supplier_id
where lower(btrim(r.resource_type)) in ('alimentación','alimentacion','food','alimentos');

grant select on public.operation_food_board to authenticated;
