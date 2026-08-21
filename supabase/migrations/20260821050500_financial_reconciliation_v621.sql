create table if not exists public.financial_reconciliations (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null unique references public.lead_services(id) on delete cascade,
  status text not null default 'open' check (status in ('open','reconciled')),
  expected_net_sale numeric(14,2) not null default 0,
  client_cash numeric(14,2) not null default 0,
  client_variance numeric(14,2) not null default 0,
  expected_supplier_cost numeric(14,2) not null default 0,
  supplier_cash numeric(14,2) not null default 0,
  supplier_variance numeric(14,2) not null default 0,
  expected_margin numeric(14,2) not null default 0,
  refund_amount numeric(14,2) not null default 0,
  refund_status text,
  notes text,
  reconciled_at timestamptz,
  reconciled_by uuid references auth.users(id) on delete set null,
  reopened_at timestamptz,
  reopened_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_reconciliations_status
  on public.financial_reconciliations(status,reconciled_at desc);
create index if not exists idx_financial_reconciliations_service
  on public.financial_reconciliations(lead_service_id);

alter table public.financial_reconciliations enable row level security;
revoke all on table public.financial_reconciliations from anon;
grant select, insert, update, delete on table public.financial_reconciliations to authenticated;

drop policy if exists financial_reconciliations_read on public.financial_reconciliations;
create policy financial_reconciliations_read on public.financial_reconciliations
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists financial_reconciliations_insert on public.financial_reconciliations;
create policy financial_reconciliations_insert on public.financial_reconciliations
for insert to authenticated
with check (public.current_user_role() = any (array['admin'::text,'manager'::text]));

drop policy if exists financial_reconciliations_update on public.financial_reconciliations;
create policy financial_reconciliations_update on public.financial_reconciliations
for update to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text]))
with check (public.current_user_role() = any (array['admin'::text,'manager'::text]));

drop policy if exists financial_reconciliations_delete on public.financial_reconciliations;
create policy financial_reconciliations_delete on public.financial_reconciliations
for delete to authenticated
using (public.current_user_role() = 'admin'::text);
