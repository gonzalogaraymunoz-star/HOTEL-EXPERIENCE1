-- Prevent accidental overselling and keep reservation service facts aligned with their tour.
create or replace function public.validate_tour_departure_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reserved integer;
begin
  if new.capacity_total > 0
     and new.capacity_total is distinct from old.capacity_total then
    select coalesce(sum(numero_pax), 0)::integer
    into v_reserved
    from public.lead_services
    where departure_id = new.id
      and (
        booking_status in ('confirmed','completed')
        or (
          booking_status = 'hold'
          and (hold_expires_at is null or hold_expires_at > now())
        )
      );

    if v_reserved > new.capacity_total then
      raise exception
        'El cupo no puede ser menor que los % pasajeros ya asignados.',
        v_reserved;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_tour_departure_capacity
on public.tour_departures;
create trigger trg_validate_tour_departure_capacity
before update of capacity_total on public.tour_departures
for each row execute function public.validate_tour_departure_capacity();

create or replace function public.sync_tour_departure_service_facts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (
    new.modality,
    new.service_date,
    new.start_time,
    new.tour_id,
    new.product_catalog_id,
    new.product_name
  ) is distinct from (
    old.modality,
    old.service_date,
    old.start_time,
    old.tour_id,
    old.product_catalog_id,
    old.product_name
  ) then
    update public.lead_services
    set
      modality = new.modality,
      fecha_servicio = new.service_date,
      hora_inicio = new.start_time,
      tour_id = new.tour_id,
      product_catalog_id = new.product_catalog_id,
      producto = new.product_name,
      updated_at = now()
    where departure_id = new.id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_sync_tour_departure_service_facts
on public.tour_departures;
create trigger trg_sync_tour_departure_service_facts
after update of modality, service_date, start_time, tour_id, product_catalog_id, product_name
on public.tour_departures
for each row execute function public.sync_tour_departure_service_facts();

revoke all on function public.validate_tour_departure_capacity() from public, anon, authenticated;
revoke all on function public.sync_tour_departure_service_facts() from public, anon, authenticated;
