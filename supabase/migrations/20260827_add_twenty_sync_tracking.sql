create table if not exists public.twenty_sync_records (
  id uuid primary key default gen_random_uuid(),
  source_lead_id uuid not null references public.leads(id) on delete cascade,
  twenty_lead_id text,
  twenty_person_id text,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_lead_id)
);

create index if not exists idx_twenty_sync_status on public.twenty_sync_records(status);
create index if not exists idx_twenty_sync_source_lead on public.twenty_sync_records(source_lead_id);

alter table public.twenty_sync_records enable row level security;

create policy "twenty sync service role only" on public.twenty_sync_records
for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
