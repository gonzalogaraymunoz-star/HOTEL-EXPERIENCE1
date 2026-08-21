-- Registro de solicitudes de derechos del titular (acceso, rectificación,
-- cancelación/eliminación, oposición). Permite demostrar cumplimiento ante la autoridad
-- y llevar control de plazos de respuesta.

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  request_type text not null check (request_type in ('acceso','rectificacion','cancelacion','oposicion','portabilidad')),
  requester_name text not null,
  requester_email text not null,
  requester_relation text, -- ej. 'pasajero', 'lead', 'proveedor', 'personal'
  related_lead_id uuid references public.leads(id),
  related_passenger_id uuid references public.passengers(id),
  description text,
  status text not null default 'recibida' check (status in ('recibida','en_proceso','resuelta','rechazada')),
  due_date date, -- calculado según plazo legal aplicable al recibir la solicitud
  resolution_notes text,
  resolved_at timestamptz,
  handled_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.privacy_requests is
  'Registro de solicitudes de derechos ARCO+ (acceso, rectificación, cancelación, oposición, portabilidad) para trazabilidad y cumplimiento normativo.';

alter table public.privacy_requests enable row level security;

-- Cualquiera puede crear una solicitud (canal público de contacto/formulario), pero no leer otras.
create policy "privacy_requests_public_insert"
on public.privacy_requests
for insert
to anon, authenticated
with check (status = 'recibida' and resolved_at is null and handled_by is null);

-- Solo admin/manager gestionan y ven las solicitudes (contienen datos personales sensibles del solicitante).
create policy "privacy_requests_staff_read"
on public.privacy_requests
for select
to authenticated
using (current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text]));

create policy "privacy_requests_staff_update"
on public.privacy_requests
for update
to authenticated
using (current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text]))
with check (current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text]));

create policy "privacy_requests_staff_delete"
on public.privacy_requests
for delete
to authenticated
using (current_user_role() = 'admin'::text);

-- Trigger simple para mantener updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_privacy_requests_updated_at
before update on public.privacy_requests
for each row execute function public.set_updated_at();
