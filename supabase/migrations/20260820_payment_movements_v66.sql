create table if not exists public.payment_movements (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null references public.lead_services(id) on delete cascade,
  party_type text not null check (party_type in ('client','supplier')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'CLP',
  payment_method text,
  paid_at timestamptz not null default now(),
  reference text,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.payment_movements is
'Movimientos reales de cobro a clientes y pago a proveedores por servicio. Permite registrar abonos y pagos parciales sin perder compatibilidad con estados históricos.';

create index if not exists idx_payment_movements_service on public.payment_movements(lead_service_id);
create index if not exists idx_payment_movements_party on public.payment_movements(party_type);
create index if not exists idx_payment_movements_supplier on public.payment_movements(supplier_id);
create index if not exists idx_payment_movements_paid_at on public.payment_movements(paid_at);

alter table public.payment_movements enable row level security;
revoke all on table public.payment_movements from anon;
grant select, insert, update, delete on table public.payment_movements to authenticated;

drop policy if exists payment_movements_read on public.payment_movements;
create policy payment_movements_read on public.payment_movements
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists payment_movements_insert on public.payment_movements;
create policy payment_movements_insert on public.payment_movements
for insert to authenticated
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists payment_movements_update on public.payment_movements;
create policy payment_movements_update on public.payment_movements
for update to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists payment_movements_delete on public.payment_movements;
create policy payment_movements_delete on public.payment_movements
for delete to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));
