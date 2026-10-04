alter table public.reservation_documents
  add column if not exists passenger_id uuid references public.passengers(id) on delete cascade;

comment on column public.reservation_documents.passenger_id is
  'Pasajero al que pertenece el documento cuando el documento es individual.';

alter table public.reservation_documents
  drop constraint if exists reservation_documents_lead_id_document_type_key;

update public.reservation_documents rd
set passenger_id = (
  select p.id
  from public.passengers p
  where p.lead_id = rd.lead_id
  order by coalesce(p.is_primary,false) desc, p.passenger_code asc, p.created_at asc
  limit 1
)
where rd.document_type = 'risk_sheet'
  and rd.passenger_id is null
  and exists (
    select 1 from public.passengers p where p.lead_id = rd.lead_id
  );

create unique index if not exists reservation_documents_reservation_unique
  on public.reservation_documents(lead_id, document_type)
  where passenger_id is null;

create unique index if not exists reservation_documents_passenger_unique
  on public.reservation_documents(lead_id, document_type, passenger_id)
  where passenger_id is not null;

create index if not exists reservation_documents_passenger_id_idx
  on public.reservation_documents(passenger_id);
