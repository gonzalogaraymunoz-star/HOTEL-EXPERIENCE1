create table if not exists public.service_closures (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null unique references public.lead_services(id) on delete cascade,
  closure_status text not null default 'open' check (closure_status in ('open','closed')),
  outcome text not null default 'completed' check (outcome in ('completed','completed_with_changes','not_operated')),
  actual_pax integer check (actual_pax is null or actual_pax >= 0),
  operational_changes text,
  incident_notes text,
  refund_amount numeric(14,2) not null default 0 check (refund_amount >= 0),
  refund_status text not null default 'No aplica' check (refund_status in ('No aplica','Pendiente','Pagado')),
  refund_reason text,
  sale_snapshot numeric(14,2) not null default 0,
  supplier_cost_snapshot numeric(14,2) not null default 0,
  extra_cost_snapshot numeric(14,2) not null default 0,
  total_cost_snapshot numeric(14,2) not null default 0,
  net_sale_snapshot numeric(14,2) not null default 0,
  margin_snapshot numeric(14,2) not null default 0,
  margin_pct_snapshot numeric(10,4) not null default 0,
  client_payment_status_snapshot text,
  supplier_payment_status_snapshot text,
  notes text,
  closed_at timestamptz,
  closed_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.service_closures is
'Cierre final por experiencia: resultado operacional, incidencias, reembolsos y snapshot financiero real.';

create index if not exists idx_service_closures_status on public.service_closures(closure_status);
create index if not exists idx_service_closures_closed_at on public.service_closures(closed_at);

alter table public.service_closures enable row level security;
revoke all on table public.service_closures from anon;
grant select, insert, update, delete on table public.service_closures to authenticated;

drop policy if exists service_closures_read on public.service_closures;
create policy service_closures_read on public.service_closures
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists service_closures_insert on public.service_closures;
create policy service_closures_insert on public.service_closures
for insert to authenticated
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists service_closures_update on public.service_closures;
create policy service_closures_update on public.service_closures
for update to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists service_closures_delete on public.service_closures;
create policy service_closures_delete on public.service_closures
for delete to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text]));
