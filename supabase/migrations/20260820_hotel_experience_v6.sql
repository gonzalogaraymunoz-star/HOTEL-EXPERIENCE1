
-- HOTEL EXPERIENCE V6 — capa operacional y tarifaria
-- Migración ADITIVA sobre la base existente. No elimina leads, servicios, usuarios, catálogo ni IA.

create extension if not exists pgcrypto;

-- Prompt comercial adicional para orientar al asistente.
alter table public.ai_settings
  add column if not exists sales_prompt text;

-- Claves de precio TV1.2 en cada servicio.
alter table public.lead_services
  add column if not exists tour_id text,
  add column if not exists modality text,
  add column if not exists pricing_status text,
  add column if not exists price_pp_clp numeric,
  add column if not exists pricing_source text;

create index if not exists lead_services_tour_id_idx on public.lead_services(tour_id);
create index if not exists lead_services_modality_idx on public.lead_services(modality);

-- Pasajeros individuales de una reserva.
create table if not exists public.passengers (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  passenger_code text not null unique,
  full_name text not null,
  email text,
  phone text,
  nationality text,
  document_type text,
  document_number text,
  birth_date date,
  dietary_restrictions text,
  medical_notes text,
  app_user_ref text,
  is_primary boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.passengers
  add column if not exists app_user_ref text,
  add column if not exists is_primary boolean not null default false;

create index if not exists passengers_lead_id_idx on public.passengers(lead_id);
create index if not exists passengers_document_number_idx on public.passengers(document_number);
create unique index if not exists passengers_app_user_ref_unique
  on public.passengers(app_user_ref) where app_user_ref is not null and app_user_ref <> '';

-- Proveedores / agencias.
create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  supplier_type text not null default 'Operador turístico',
  contact_name text,
  phone text,
  whatsapp text,
  email text,
  website text,
  rut text,
  services_offered text,
  sernatur_registration text,
  permit_number text,
  insurance_policy text,
  insurance_expiry date,
  bank_name text,
  account_type text,
  account_number text,
  payment_notes text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.suppliers
  add column if not exists whatsapp text,
  add column if not exists website text,
  add column if not exists account_type text,
  add column if not exists services_offered text,
  add column if not exists sernatur_registration text,
  add column if not exists permit_number text,
  add column if not exists insurance_policy text,
  add column if not exists insurance_expiry date,
  add column if not exists notes text;

-- Prestadores individuales.
create table if not exists public.service_people (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  full_name text not null,
  person_type text not null,
  phone text,
  whatsapp text,
  email text,
  rut text,
  nationality text,
  languages text[] not null default '{}',
  specialties text[] not null default '{}',
  certifications text[] not null default '{}',
  first_aid_expiry date,
  license_type text,
  license_expiry date,
  sernatur_registration text,
  bank_name text,
  account_type text,
  account_number text,
  default_rate numeric not null default 0,
  payment_notes text,
  availability_notes text,
  emergency_contact text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.service_people
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null,
  add column if not exists whatsapp text,
  add column if not exists availability_notes text;

create index if not exists service_people_supplier_id_idx on public.service_people(supplier_id);
create index if not exists service_people_type_idx on public.service_people(person_type);

-- Vehículos / flota.
create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.suppliers(id) on delete set null,
  driver_person_id uuid references public.service_people(id) on delete set null,
  label text not null,
  plate text not null unique,
  brand text,
  model text,
  year integer,
  capacity integer,
  driver_name text,
  driver_phone text,
  technical_review_expiry date,
  circulation_permit_expiry date,
  insurance_expiry date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.vehicles
  add column if not exists driver_person_id uuid references public.service_people(id) on delete set null,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists year integer,
  add column if not exists technical_review_expiry date,
  add column if not exists circulation_permit_expiry date,
  add column if not exists insurance_expiry date,
  add column if not exists notes text;

create index if not exists vehicles_supplier_id_idx on public.vehicles(supplier_id);
create index if not exists vehicles_driver_person_id_idx on public.vehicles(driver_person_id);

-- Insumos / equipamiento.
create table if not exists public.operational_resources (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null,
  name text not null,
  code text unique,
  quantity_total integer not null default 1,
  quantity_available integer not null default 1,
  supplier_id uuid references public.suppliers(id) on delete set null,
  location text,
  maintenance_due date,
  expiry_date date,
  status text not null default 'Disponible',
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (quantity_total >= 0),
  check (quantity_available >= 0)
);

create index if not exists operational_resources_type_idx on public.operational_resources(resource_type);
create index if not exists operational_resources_supplier_id_idx on public.operational_resources(supplier_id);

-- Una ficha operacional por tour/servicio.
create table if not exists public.service_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null unique references public.lead_services(id) on delete cascade,
  supplier_id uuid references public.suppliers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  guide_person_id uuid references public.service_people(id) on delete set null,
  driver_person_id uuid references public.service_people(id) on delete set null,
  cook_person_id uuid references public.service_people(id) on delete set null,
  coordinator_person_id uuid references public.service_people(id) on delete set null,
  guide_name text,
  driver_name text,
  pickup_time time,
  meeting_point text,
  supplier_cost numeric not null default 0,
  supplier_payment_status text not null default 'Pendiente',
  supplier_payment_date timestamptz,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (supplier_cost >= 0)
);

alter table public.service_assignments
  add column if not exists guide_person_id uuid references public.service_people(id) on delete set null,
  add column if not exists driver_person_id uuid references public.service_people(id) on delete set null,
  add column if not exists cook_person_id uuid references public.service_people(id) on delete set null,
  add column if not exists coordinator_person_id uuid references public.service_people(id) on delete set null,
  add column if not exists pickup_time time,
  add column if not exists meeting_point text;

create index if not exists service_assignments_supplier_id_idx on public.service_assignments(supplier_id);
create index if not exists service_assignments_vehicle_id_idx on public.service_assignments(vehicle_id);
create index if not exists service_assignments_guide_person_id_idx on public.service_assignments(guide_person_id);
create index if not exists service_assignments_driver_person_id_idx on public.service_assignments(driver_person_id);

-- Insumos asignados a cada tour.
create table if not exists public.service_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null references public.lead_services(id) on delete cascade,
  resource_id uuid not null references public.operational_resources(id) on delete cascade,
  quantity integer not null default 1 check (quantity > 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_service_id, resource_id)
);

create index if not exists service_resource_assignments_service_idx on public.service_resource_assignments(lead_service_id);

-- Documentos ligados a la reserva, incluida Hoja de Riesgo.
create table if not exists public.reservation_documents (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  document_type text not null,
  title text not null,
  url text,
  status text not null default 'Pendiente',
  completed_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(lead_id, document_type)
);

alter table public.reservation_documents
  add column if not exists completed_at timestamptz;

create index if not exists reservation_documents_lead_id_idx on public.reservation_documents(lead_id);

-- updated_at automático.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'passengers','suppliers','service_people','vehicles',
    'operational_resources','service_assignments',
    'service_resource_assignments','reservation_documents'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', tbl);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      tbl
    );
  end loop;
end $$;

-- RLS.
alter table public.passengers enable row level security;
alter table public.suppliers enable row level security;
alter table public.service_people enable row level security;
alter table public.vehicles enable row level security;
alter table public.operational_resources enable row level security;
alter table public.service_assignments enable row level security;
alter table public.service_resource_assignments enable row level security;
alter table public.reservation_documents enable row level security;

-- Directorios: todo usuario CRM activo puede leer; admin/manager administran la base.
drop policy if exists ops_suppliers_read on public.suppliers;
create policy ops_suppliers_read on public.suppliers
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_suppliers_write on public.suppliers;
create policy ops_suppliers_write on public.suppliers
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_people_read on public.service_people;
create policy ops_people_read on public.service_people
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_people_write on public.service_people;
create policy ops_people_write on public.service_people
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_vehicles_read on public.vehicles;
create policy ops_vehicles_read on public.vehicles
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_vehicles_write on public.vehicles;
create policy ops_vehicles_write on public.vehicles
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_resources_read on public.operational_resources;
create policy ops_resources_read on public.operational_resources
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_resources_write on public.operational_resources;
create policy ops_resources_write on public.operational_resources
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

-- Pasajeros/documentos/asignaciones: todo CRM activo lee; viewer no escribe.
drop policy if exists ops_passengers_read on public.passengers;
create policy ops_passengers_read on public.passengers
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_passengers_insert on public.passengers;
create policy ops_passengers_insert on public.passengers
for insert to authenticated with check (public.current_user_role() in ('admin','manager','agent'));
drop policy if exists ops_passengers_update on public.passengers;
create policy ops_passengers_update on public.passengers
for update to authenticated
using (public.current_user_role() in ('admin','manager','agent'))
with check (public.current_user_role() in ('admin','manager','agent'));
drop policy if exists ops_passengers_delete on public.passengers;
create policy ops_passengers_delete on public.passengers
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_assignments_read on public.service_assignments;
create policy ops_assignments_read on public.service_assignments
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_assignments_write on public.service_assignments;
create policy ops_assignments_write on public.service_assignments
for all to authenticated
using (public.current_user_role() in ('admin','manager','agent'))
with check (public.current_user_role() in ('admin','manager','agent'));

drop policy if exists ops_service_resources_read on public.service_resource_assignments;
create policy ops_service_resources_read on public.service_resource_assignments
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_service_resources_write on public.service_resource_assignments;
create policy ops_service_resources_write on public.service_resource_assignments
for all to authenticated
using (public.current_user_role() in ('admin','manager','agent'))
with check (public.current_user_role() in ('admin','manager','agent'));

drop policy if exists ops_documents_read on public.reservation_documents;
create policy ops_documents_read on public.reservation_documents
for select to authenticated using (public.current_user_role() is not null);
drop policy if exists ops_documents_write on public.reservation_documents;
create policy ops_documents_write on public.reservation_documents
for all to authenticated
using (public.current_user_role() in ('admin','manager','agent'))
with check (public.current_user_role() in ('admin','manager','agent'));

grant select, insert, update, delete on public.passengers to authenticated;
grant select, insert, update, delete on public.suppliers to authenticated;
grant select, insert, update, delete on public.service_people to authenticated;
grant select, insert, update, delete on public.vehicles to authenticated;
grant select, insert, update, delete on public.operational_resources to authenticated;
grant select, insert, update, delete on public.service_assignments to authenticated;
grant select, insert, update, delete on public.service_resource_assignments to authenticated;
grant select, insert, update, delete on public.reservation_documents to authenticated;

comment on column public.passengers.passenger_code is
'Código único por pasajero. Formato recomendado: CODIGO-LEAD-PXX.';
comment on column public.passengers.app_user_ref is
'Referencia opcional al usuario correspondiente en la app externa.';
comment on column public.lead_services.tour_id is
'Clave TV1.2. La tarifa nunca se resuelve por nombre visible.';
comment on column public.lead_services.modality is
'Modalidad tarifaria TV1.2: low, semiprivado o privado.';
comment on table public.service_assignments is
'Operación por tour: proveedor, prestadores, vehículo, horario, costo y pago.';


-- RLS / índices complementarios aplicados a producción
DROP POLICY IF EXISTS ops_suppliers_write ON public.suppliers;
DROP POLICY IF EXISTS ops_people_write ON public.service_people;
DROP POLICY IF EXISTS ops_vehicles_write ON public.vehicles;
DROP POLICY IF EXISTS ops_resources_write ON public.operational_resources;
DROP POLICY IF EXISTS ops_assignments_write ON public.service_assignments;
DROP POLICY IF EXISTS ops_service_resources_write ON public.service_resource_assignments;
DROP POLICY IF EXISTS ops_documents_write ON public.reservation_documents;

DROP POLICY IF EXISTS ops_suppliers_insert ON public.suppliers;
CREATE POLICY ops_suppliers_insert ON public.suppliers FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_suppliers_update ON public.suppliers;
CREATE POLICY ops_suppliers_update ON public.suppliers FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_suppliers_delete ON public.suppliers;
CREATE POLICY ops_suppliers_delete ON public.suppliers FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

DROP POLICY IF EXISTS ops_people_insert ON public.service_people;
CREATE POLICY ops_people_insert ON public.service_people FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_people_update ON public.service_people;
CREATE POLICY ops_people_update ON public.service_people FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_people_delete ON public.service_people;
CREATE POLICY ops_people_delete ON public.service_people FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

DROP POLICY IF EXISTS ops_vehicles_insert ON public.vehicles;
CREATE POLICY ops_vehicles_insert ON public.vehicles FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_vehicles_update ON public.vehicles;
CREATE POLICY ops_vehicles_update ON public.vehicles FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_vehicles_delete ON public.vehicles;
CREATE POLICY ops_vehicles_delete ON public.vehicles FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

DROP POLICY IF EXISTS ops_resources_insert ON public.operational_resources;
CREATE POLICY ops_resources_insert ON public.operational_resources FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_resources_update ON public.operational_resources;
CREATE POLICY ops_resources_update ON public.operational_resources FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager')) WITH CHECK (public.current_user_role() IN ('admin','manager'));
DROP POLICY IF EXISTS ops_resources_delete ON public.operational_resources;
CREATE POLICY ops_resources_delete ON public.operational_resources FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

DROP POLICY IF EXISTS ops_assignments_insert ON public.service_assignments;
CREATE POLICY ops_assignments_insert ON public.service_assignments FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_assignments_update ON public.service_assignments;
CREATE POLICY ops_assignments_update ON public.service_assignments FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager','agent')) WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_assignments_delete ON public.service_assignments;
CREATE POLICY ops_assignments_delete ON public.service_assignments FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

DROP POLICY IF EXISTS ops_service_resources_insert ON public.service_resource_assignments;
CREATE POLICY ops_service_resources_insert ON public.service_resource_assignments FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_service_resources_update ON public.service_resource_assignments;
CREATE POLICY ops_service_resources_update ON public.service_resource_assignments FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager','agent')) WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_service_resources_delete ON public.service_resource_assignments;
CREATE POLICY ops_service_resources_delete ON public.service_resource_assignments FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager','agent'));

DROP POLICY IF EXISTS ops_documents_insert ON public.reservation_documents;
CREATE POLICY ops_documents_insert ON public.reservation_documents FOR INSERT TO authenticated WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_documents_update ON public.reservation_documents;
CREATE POLICY ops_documents_update ON public.reservation_documents FOR UPDATE TO authenticated USING (public.current_user_role() IN ('admin','manager','agent')) WITH CHECK (public.current_user_role() IN ('admin','manager','agent'));
DROP POLICY IF EXISTS ops_documents_delete ON public.reservation_documents;
CREATE POLICY ops_documents_delete ON public.reservation_documents FOR DELETE TO authenticated USING (public.current_user_role() IN ('admin','manager'));

CREATE INDEX IF NOT EXISTS service_assignments_cook_person_id_idx ON public.service_assignments(cook_person_id);
CREATE INDEX IF NOT EXISTS service_assignments_coordinator_person_id_idx ON public.service_assignments(coordinator_person_id);
CREATE INDEX IF NOT EXISTS service_assignments_created_by_idx ON public.service_assignments(created_by);
CREATE INDEX IF NOT EXISTS service_assignments_updated_by_idx ON public.service_assignments(updated_by);
CREATE INDEX IF NOT EXISTS service_resource_assignments_resource_idx ON public.service_resource_assignments(resource_id);
CREATE INDEX IF NOT EXISTS passengers_created_by_idx ON public.passengers(created_by);
CREATE INDEX IF NOT EXISTS reservation_documents_created_by_idx ON public.reservation_documents(created_by);
CREATE INDEX IF NOT EXISTS ai_conversations_lead_id_idx ON public.ai_conversations(lead_id);
CREATE INDEX IF NOT EXISTS ai_conversations_user_id_idx ON public.ai_conversations(user_id);
CREATE INDEX IF NOT EXISTS ai_settings_updated_by_idx ON public.ai_settings(updated_by);
CREATE INDEX IF NOT EXISTS crm_activities_lead_id_idx ON public.crm_activities(lead_id);
CREATE INDEX IF NOT EXISTS crm_tasks_lead_id_idx ON public.crm_tasks(lead_id);

REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
