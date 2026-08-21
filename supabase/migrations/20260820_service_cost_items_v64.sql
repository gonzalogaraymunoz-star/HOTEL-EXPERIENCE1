create table if not exists public.service_cost_items (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null references public.lead_services(id) on delete cascade,
  category text not null default 'Otros',
  description text,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  supplier_id uuid references public.suppliers(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_cost_items is 'Costos adicionales por servicio/tour para cálculo de rentabilidad. El costo principal de proveedor permanece en service_assignments.supplier_cost.';

create index if not exists idx_service_cost_items_lead_service_id on public.service_cost_items(lead_service_id);
create index if not exists idx_service_cost_items_supplier_id on public.service_cost_items(supplier_id);

alter table public.service_cost_items enable row level security;

revoke all on table public.service_cost_items from anon;
grant select, insert, update, delete on table public.service_cost_items to authenticated;

drop policy if exists ops_service_cost_items_read on public.service_cost_items;
create policy ops_service_cost_items_read on public.service_cost_items
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists ops_service_cost_items_insert on public.service_cost_items;
create policy ops_service_cost_items_insert on public.service_cost_items
for insert to authenticated
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists ops_service_cost_items_update on public.service_cost_items;
create policy ops_service_cost_items_update on public.service_cost_items
for update to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists ops_service_cost_items_delete on public.service_cost_items;
create policy ops_service_cost_items_delete on public.service_cost_items
for delete to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));
