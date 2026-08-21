create table if not exists public.automation_alerts (
  id uuid primary key default gen_random_uuid(),
  fingerprint text not null unique,
  source text not null default 'control',
  severity text not null check (severity in ('critical','warning','info')),
  category text not null,
  title text not null,
  detail text not null,
  recommended_action text,
  lead_id uuid references public.leads(id) on delete set null,
  lead_service_id uuid references public.lead_services(id) on delete set null,
  status text not null default 'open' check (status in ('open','acknowledged','resolved')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  task_id uuid references public.crm_tasks(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null default 'daily_control',
  status text not null default 'running' check (status in ('running','completed','failed')),
  critical_count integer not null default 0,
  warning_count integer not null default 0,
  info_count integer not null default 0,
  created_tasks integer not null default 0,
  emailed_recipients integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_automation_alerts_status
  on public.automation_alerts(status,severity,last_seen_at desc);

create index if not exists idx_automation_alerts_lead
  on public.automation_alerts(lead_id,status);

create index if not exists idx_automation_runs_started
  on public.automation_runs(started_at desc);

alter table public.automation_alerts enable row level security;
alter table public.automation_runs enable row level security;

revoke all on table public.automation_alerts from anon;
revoke all on table public.automation_alerts from authenticated;
revoke all on table public.automation_runs from anon;
revoke all on table public.automation_runs from authenticated;
