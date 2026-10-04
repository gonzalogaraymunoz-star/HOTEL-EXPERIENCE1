alter table public.reservation_documents
  add column if not exists departure_id uuid references public.tour_departures(id) on delete cascade;

drop index if exists public.reservation_documents_passenger_unique;

create unique index if not exists reservation_documents_passenger_legacy_unique
  on public.reservation_documents(lead_id, document_type, passenger_id)
  where passenger_id is not null and departure_id is null;

create unique index if not exists reservation_documents_passenger_departure_unique
  on public.reservation_documents(lead_id, document_type, passenger_id, departure_id)
  where passenger_id is not null and departure_id is not null;

create index if not exists reservation_documents_departure_id_idx
  on public.reservation_documents(departure_id);

insert into public.operation_templates(template_key,title,file_name,mime_type,source_url,active)
select
  'risk_sheet_standard',
  'Hoja de riesgo estándar',
  'HOJA DE RIESGO STANDAR.pdf',
  'application/pdf',
  'https://drive.google.com/file/d/1jxtXJmMEf15Ge3Vnt6Eip04PBORtZOR0/view?usp=drivesdk',
  true
where not exists (
  select 1 from public.operation_templates where template_key='risk_sheet_standard'
);

update public.operation_templates
set title='Hoja de riesgo estándar',
    file_name='HOJA DE RIESGO STANDAR.pdf',
    mime_type='application/pdf',
    source_url='https://drive.google.com/file/d/1jxtXJmMEf15Ge3Vnt6Eip04PBORtZOR0/view?usp=drivesdk',
    active=true,
    updated_at=now()
where template_key='risk_sheet_standard';
