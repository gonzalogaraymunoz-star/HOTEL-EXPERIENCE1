create table if not exists public.partner_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  partner_type text not null check (partner_type in ('hotel','agency')),
  scope_value text not null,
  lead_prefix text not null check (lead_prefix ~ '^[A-Z0-9]{2,6}$'),
  access_code text not null unique,
  password_hash text not null,
  active boolean not null default true,
  can_create_requests boolean not null default true,
  notes text,
  created_by uuid,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_portal_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.partner_portal_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.leads
  add column if not exists partner_account_id uuid references public.partner_portal_accounts(id) on delete set null;

create index if not exists idx_partner_sessions_account on public.partner_portal_sessions(account_id);
create index if not exists idx_partner_sessions_expires on public.partner_portal_sessions(expires_at);
create index if not exists idx_leads_partner_account on public.leads(partner_account_id);
create index if not exists idx_partner_accounts_scope on public.partner_portal_accounts(partner_type,scope_value);

alter table public.partner_portal_accounts enable row level security;
alter table public.partner_portal_sessions enable row level security;
