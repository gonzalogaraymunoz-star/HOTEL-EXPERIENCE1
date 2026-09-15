-- Keep the linking RPC subject to table RLS and index every new foreign key.
alter function public.set_link_service_departures(uuid, jsonb) security invoker;

create index if not exists lead_services_departure_id_idx
  on public.lead_services(departure_id);
create index if not exists tour_departures_product_catalog_id_idx
  on public.tour_departures(product_catalog_id);
create index if not exists tour_departures_created_by_fk_idx
  on public.tour_departures(created_by);
create index if not exists tour_departure_resources_resource_id_idx
  on public.tour_departure_resources(resource_id);
create index if not exists tour_departure_resources_created_by_fk_idx
  on public.tour_departure_resources(created_by);
create index if not exists tour_departure_notes_created_by_fk_idx
  on public.tour_departure_notes(created_by);
