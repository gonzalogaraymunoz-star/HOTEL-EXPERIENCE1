create table if not exists public.reservation_document_versions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  document_type text not null check (document_type in ('operation_sheet','manifest','voucher','itinerary','risk_sheet','other')),
  title text not null,
  url text not null,
  drive_file_id text,
  version integer not null check (version > 0),
  status text not null default 'Archivado',
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lead_id, document_type, version)
);

create index if not exists reservation_document_versions_lead_idx on public.reservation_document_versions(lead_id);
create index if not exists reservation_document_versions_type_idx on public.reservation_document_versions(document_type);
create index if not exists reservation_document_versions_created_at_idx on public.reservation_document_versions(created_at desc);

alter table public.reservation_document_versions enable row level security;
revoke all on table public.reservation_document_versions from anon;
grant select, insert, update, delete on table public.reservation_document_versions to authenticated;

drop policy if exists reservation_document_versions_read on public.reservation_document_versions;
create policy reservation_document_versions_read on public.reservation_document_versions
for select to authenticated
using (public.current_user_role() is not null);

drop policy if exists reservation_document_versions_insert on public.reservation_document_versions;
create policy reservation_document_versions_insert on public.reservation_document_versions
for insert to authenticated
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists reservation_document_versions_update on public.reservation_document_versions;
create policy reservation_document_versions_update on public.reservation_document_versions
for update to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role() = any (array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists reservation_document_versions_delete on public.reservation_document_versions;
create policy reservation_document_versions_delete on public.reservation_document_versions
for delete to authenticated
using (public.current_user_role() = any (array['admin'::text,'manager'::text]));
