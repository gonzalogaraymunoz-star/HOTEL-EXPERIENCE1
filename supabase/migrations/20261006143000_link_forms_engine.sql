-- LINK Forms V1
-- Motor transversal para aprender formularios, mapear campos canónicos y generar documentos autorrellenados.

create table if not exists public.link_form_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title text not null,
  business_scope text not null default 'link',
  context_scope text not null default 'reservation'
    check (context_scope in ('reservation','departure')),
  document_kind text not null
    check (document_kind in ('xlsx','pdf','html','json')),
  file_name text not null,
  mime_type text not null,
  storage_bucket text not null default 'operation-documents',
  storage_path text not null,
  fingerprint text,
  parser_version integer not null default 1,
  active boolean not null default true,
  version integer not null default 1,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.link_form_templates is
  'Plantillas aprendidas por LINK Forms. Conserva el archivo maestro y su alcance de contexto.';

create index if not exists link_form_templates_scope_idx
  on public.link_form_templates(context_scope, active, updated_at desc);

create table if not exists public.link_form_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.link_form_templates(id) on delete cascade,
  target_key text not null,
  field_label text not null,
  canonical_key text not null,
  target jsonb not null default '{}'::jsonb,
  source_collection text not null default 'root'
    check (source_collection in ('root','passengers','services','operation')),
  confidence numeric(5,4) not null default 0
    check (confidence >= 0 and confidence <= 1),
  required boolean not null default false,
  mapping_source text not null default 'auto'
    check (mapping_source in ('auto','manual','imported')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(template_id, target_key)
);

comment on table public.link_form_fields is
  'Contrato campo→variable de LINK Forms. target describe celda, columna, campo PDF o input HTML.';

create index if not exists link_form_fields_template_idx
  on public.link_form_fields(template_id, source_collection, canonical_key);

create table if not exists public.link_form_aliases (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  alias text not null,
  scope text not null default 'global',
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(canonical_key, alias, scope)
);

comment on table public.link_form_aliases is
  'Diccionario multilingüe que permite interpretar el mismo dato aunque el formulario cambie de palabras.';

create index if not exists link_form_aliases_alias_idx
  on public.link_form_aliases(lower(alias), active);

create table if not exists public.link_form_runs (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.link_form_templates(id) on delete restrict,
  lead_id uuid references public.leads(id) on delete set null,
  departure_id uuid references public.tour_departures(id) on delete set null,
  lead_service_id uuid references public.lead_services(id) on delete set null,
  status text not null default 'generated'
    check (status in ('analyzed','ready','generated','error')),
  input_context jsonb not null default '{}'::jsonb,
  mapping_report jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  output_bucket text,
  output_path text,
  output_file_name text,
  error_message text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

comment on table public.link_form_runs is
  'Evidencia de cada análisis o generación de LINK Forms. No reemplaza la fuente de verdad operacional.';

create index if not exists link_form_runs_template_idx
  on public.link_form_runs(template_id, created_at desc);
create index if not exists link_form_runs_lead_idx
  on public.link_form_runs(lead_id, created_at desc);
create index if not exists link_form_runs_departure_idx
  on public.link_form_runs(departure_id, created_at desc);

alter table public.link_form_templates enable row level security;
alter table public.link_form_fields enable row level security;
alter table public.link_form_aliases enable row level security;
alter table public.link_form_runs enable row level security;

drop policy if exists link_form_templates_read on public.link_form_templates;
create policy link_form_templates_read on public.link_form_templates
  for select to authenticated using (true);

drop policy if exists link_form_templates_write on public.link_form_templates;
create policy link_form_templates_write on public.link_form_templates
  for all to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_fields_read on public.link_form_fields;
create policy link_form_fields_read on public.link_form_fields
  for select to authenticated using (true);

drop policy if exists link_form_fields_write on public.link_form_fields;
create policy link_form_fields_write on public.link_form_fields
  for all to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_aliases_read on public.link_form_aliases;
create policy link_form_aliases_read on public.link_form_aliases
  for select to authenticated using (true);

drop policy if exists link_form_aliases_write on public.link_form_aliases;
create policy link_form_aliases_write on public.link_form_aliases
  for all to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_runs_read on public.link_form_runs;
create policy link_form_runs_read on public.link_form_runs
  for select to authenticated using (true);

grant select on public.link_form_templates, public.link_form_fields, public.link_form_aliases, public.link_form_runs to authenticated;
grant insert, update, delete on public.link_form_templates, public.link_form_fields, public.link_form_aliases to authenticated;

insert into public.link_form_aliases(canonical_key,alias,scope,priority) values
  ('passenger.full_name','nombre pasajero','global',10),
  ('passenger.full_name','nombre completo','global',10),
  ('passenger.full_name','pasajero','global',20),
  ('passenger.full_name','pax','global',30),
  ('passenger.full_name','passenger name','global',10),
  ('passenger.full_name','full name','global',20),
  ('passenger.full_name','nome do passageiro','global',10),
  ('passenger.first_name','nombre','passenger',30),
  ('passenger.first_name','first name','passenger',10),
  ('passenger.first_name','nome','passenger',30),
  ('passenger.last_name','apellido','passenger',20),
  ('passenger.last_name','apellidos','passenger',10),
  ('passenger.last_name','last name','passenger',10),
  ('passenger.last_name','surname','passenger',20),
  ('passenger.last_name','sobrenome','passenger',20),
  ('passenger.document_number','pasaporte','global',10),
  ('passenger.document_number','passport','global',10),
  ('passenger.document_number','documento','global',20),
  ('passenger.document_number','document number','global',10),
  ('passenger.document_number','rut','passenger',30),
  ('passenger.document_type','tipo documento','global',10),
  ('passenger.document_type','document type','global',10),
  ('passenger.nationality','nacionalidad','global',10),
  ('passenger.nationality','nationality','global',10),
  ('passenger.nationality','nacionalidade','global',10),
  ('passenger.birth_date','fecha nacimiento','global',10),
  ('passenger.birth_date','fecha de nacimiento','global',10),
  ('passenger.birth_date','date of birth','global',10),
  ('passenger.birth_date','birth date','global',20),
  ('passenger.birth_date','data de nascimento','global',10),
  ('passenger.age','edad','global',10),
  ('passenger.age','age','global',10),
  ('passenger.phone','telefono','global',10),
  ('passenger.phone','teléfono','global',10),
  ('passenger.phone','phone','global',10),
  ('passenger.phone','whatsapp','global',20),
  ('passenger.email','email','global',10),
  ('passenger.dietary','restricciones alimentarias','global',10),
  ('passenger.dietary','restricciones','passenger',30),
  ('passenger.dietary','dietary restrictions','global',10),
  ('passenger.medical_notes','antecedentes medicos','global',10),
  ('passenger.medical_notes','observaciones medicas','global',10),
  ('passenger.medical_notes','medical notes','global',10),
  ('passenger.disability','discapacidad','global',10),
  ('passenger.disability','disability','global',10),
  ('passenger.gender','sexo','global',10),
  ('passenger.gender','genero','global',20),
  ('passenger.gender','género','global',20),
  ('passenger.gender','gender','global',10),
  ('reservation.code','codigo reserva','global',10),
  ('reservation.code','código reserva','global',10),
  ('reservation.code','booking code','global',10),
  ('reservation.reference','reserva','reservation',20),
  ('reservation.reference','reservation','reservation',20),
  ('reservation.contact','contacto','reservation',20),
  ('reservation.hotel','hotel','global',10),
  ('reservation.hotel','alojamiento','global',20),
  ('reservation.hotel','accommodation','global',10),
  ('reservation.arrival_flight','vuelo llegada','global',10),
  ('reservation.arrival_flight','arrival flight','global',10),
  ('reservation.departure_flight','vuelo salida','global',10),
  ('reservation.departure_flight','departure flight','global',10),
  ('service.name','servicio','global',20),
  ('service.name','tour','global',20),
  ('service.name','experiencia','global',30),
  ('service.date','fecha servicio','global',10),
  ('service.date','service date','global',10),
  ('operation.pickup_time','hora pickup','global',10),
  ('operation.pickup_time','hora salida','global',20),
  ('operation.pickup_time','pickup time','global',10),
  ('operation.meeting_point','punto de encuentro','global',10),
  ('operation.meeting_point','pickup','global',30),
  ('operation.meeting_point','meeting point','global',10),
  ('operation.guide_name','guia','global',20),
  ('operation.guide_name','guía','global',20),
  ('operation.guide_name','guide','global',20),
  ('operation.guide_rut','rut guia','global',10),
  ('operation.guide_sernatur','registro sernatur','global',10),
  ('operation.driver_name','conductor','global',10),
  ('operation.driver_name','driver','global',10),
  ('operation.driver_rut','rut conductor','global',10),
  ('operation.vehicle_plate','patente','global',10),
  ('operation.vehicle_plate','vehicle plate','global',10),
  ('operation.vehicle_type','vehiculo','global',20),
  ('operation.vehicle_type','vehículo','global',20),
  ('operation.vehicle_type','vehicle','global',20),
  ('operation.supplier_name','operador','global',20),
  ('operation.supplier_name','agencia','global',20),
  ('operation.supplier_name','supplier','global',20),
  ('operation.supplier_phone','telefono operador','global',10),
  ('departure.code','codigo salida','global',10),
  ('departure.code','código salida','global',10),
  ('departure.code','departure code','global',10),
  ('departure.modality','modalidad','global',10)
on conflict (canonical_key,alias,scope) do update
set priority=excluded.priority, active=true;
