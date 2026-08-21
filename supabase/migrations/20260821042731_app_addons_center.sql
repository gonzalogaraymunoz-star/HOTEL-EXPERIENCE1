-- Centro de Complementos de Hotel Experience.
-- Migración ya aplicada en producción. Se incluye para versionar el esquema.
create table if not exists public.app_addons (
  id uuid primary key default gen_random_uuid(),
  addon_key text not null unique,
  name text not null,
  description text,
  category text,
  provider text,
  source text,
  auth_type text,
  server_url text,
  capabilities text[] not null default '{}',
  modules text[] not null default '{}',
  enabled boolean not null default false,
  status text not null default 'available',
  config jsonb not null default '{}'::jsonb,
  notes text,
  last_checked_at timestamptz,
  last_error text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_addons enable row level security;

drop policy if exists app_addons_read on public.app_addons;
create policy app_addons_read on public.app_addons
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists app_addons_write on public.app_addons;
create policy app_addons_write on public.app_addons
for all to authenticated
using (public.current_user_role() = any(array['admin','manager']))
with check (public.current_user_role() = any(array['admin','manager']));

grant select,insert,update,delete on public.app_addons to authenticated;
