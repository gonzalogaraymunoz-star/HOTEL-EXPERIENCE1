-- HOTEL EXPERIENCE · Cancellation policy schema
-- ALREADY APPLIED TO production. Repository history only.

create table if not exists public.cancellation_policies (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null default 1 check (version>0),
  name text not null,
  description text,
  owner_type text not null default 'company' check (owner_type in ('company','supplier','product','channel','legal_reference')),
  supplier_id uuid references public.suppliers(id) on delete set null,
  product_code text references public.product_catalog(code) on delete set null,
  channel text,
  jurisdiction text not null default 'CL',
  language text not null default 'es',
  priority integer not null default 100,
  is_default boolean not null default false,
  status text not null default 'draft' check (status in ('draft','active','archived')),
  effective_from date,
  effective_to date,
  source_document_name text,
  storage_bucket text not null default 'policy-documents',
  storage_path text,
  source_url text,
  source_sha256 text,
  raw_text text,
  normalized_summary text,
  legal_review_status text not null default 'pending' check (legal_review_status in ('pending','aligned','needs_changes','not_applicable')),
  legal_reviewed_at timestamptz,
  legal_reviewed_by uuid references auth.users(id) on delete set null,
  legal_notes text,
  scope_config jsonb not null default '{}'::jsonb check (jsonb_typeof(scope_config)='object'),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_key,version)
);

create table if not exists public.cancellation_policy_rules (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references public.cancellation_policies(id) on delete cascade,
  rule_code text not null,
  event_type text not null check (event_type in (
    'customer_cancellation','no_show','illness','weather','force_majeure',
    'supplier_cancellation','company_cancellation','reschedule','late_arrival',
    'partial_service','substitution','right_of_withdrawal','other'
  )),
  applies_to text not null default 'service' check (applies_to in ('service','reservation','package')),
  min_hours_before numeric,
  max_hours_before numeric,
  refund_percent numeric check (refund_percent is null or (refund_percent>=0 and refund_percent<=100)),
  penalty_percent numeric check (penalty_percent is null or (penalty_percent>=0 and penalty_percent<=100)),
  fixed_fee numeric check (fixed_fee is null or fixed_fee>=0),
  currency text not null default 'CLP',
  action_type text not null default 'case_by_case' check (action_type in (
    'refund','partial_refund','reschedule','credit','no_refund','substitution','case_by_case','other'
  )),
  evidence_required boolean not null default false,
  evidence_type text,
  conditions jsonb not null default '{}'::jsonb check (jsonb_typeof(conditions)='object'),
  customer_text text,
  internal_notes text,
  priority integer not null default 100,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(policy_id,rule_code)
);

create table if not exists public.service_policy_snapshots (
  id uuid primary key default gen_random_uuid(),
  lead_service_id uuid not null references public.lead_services(id) on delete cascade,
  layer text not null default 'company' check (layer in ('company','supplier','product','channel','legal_override')),
  policy_id uuid not null references public.cancellation_policies(id) on delete restrict,
  policy_version integer not null,
  policy_snapshot jsonb not null check (jsonb_typeof(policy_snapshot)='object'),
  rules_snapshot jsonb not null default '[]'::jsonb check (jsonb_typeof(rules_snapshot)='array'),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  notes text,
  unique(lead_service_id,layer)
);

create table if not exists public.cancellation_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  lead_service_id uuid references public.lead_services(id) on delete set null,
  policy_snapshot_id uuid references public.service_policy_snapshots(id) on delete set null,
  policy_rule_id uuid references public.cancellation_policy_rules(id) on delete set null,
  event_type text not null check (event_type in (
    'customer_cancellation','no_show','illness','weather','force_majeure',
    'supplier_cancellation','company_cancellation','reschedule','late_arrival',
    'partial_service','substitution','right_of_withdrawal','other'
  )),
  event_source text not null default 'customer' check (event_source in ('customer','supplier','company','weather','authority','system','other')),
  requested_at timestamptz not null default now(),
  event_at timestamptz,
  service_date_snapshot date,
  reason text,
  evidence_storage_path text,
  evidence_summary text,
  calculated_refund_percent numeric check (calculated_refund_percent is null or (calculated_refund_percent>=0 and calculated_refund_percent<=100)),
  calculated_refund_amount numeric check (calculated_refund_amount is null or calculated_refund_amount>=0),
  final_refund_amount numeric check (final_refund_amount is null or final_refund_amount>=0),
  currency text not null default 'CLP',
  resolution_type text check (resolution_type is null or resolution_type in ('full_refund','partial_refund','no_refund','reschedule','credit','substitution','other')),
  status text not null default 'open' check (status in ('open','review','approved','rejected','paid','closed')),
  legal_override boolean not null default false,
  legal_override_reason text,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cancellation_legal_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  authority text not null,
  title text not null,
  url text not null,
  legal_reference text,
  relevance text,
  checked_on date not null default current_date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cancellation_policy_status on public.cancellation_policies(status,is_default,effective_from);
create index if not exists idx_cancellation_rules_policy on public.cancellation_policy_rules(policy_id,active,priority);
create index if not exists idx_service_policy_snapshots_service on public.service_policy_snapshots(lead_service_id,layer);
create index if not exists idx_cancellation_cases_service on public.cancellation_cases(lead_service_id,status,created_at desc);
create index if not exists idx_cancellation_cases_lead on public.cancellation_cases(lead_id,status,created_at desc);

alter table public.cancellation_policies enable row level security;
alter table public.cancellation_policy_rules enable row level security;
alter table public.service_policy_snapshots enable row level security;
alter table public.cancellation_cases enable row level security;
alter table public.cancellation_legal_sources enable row level security;

grant select,insert,update,delete on public.cancellation_policies to authenticated;
grant select,insert,update,delete on public.cancellation_policy_rules to authenticated;
grant select,insert,update,delete on public.service_policy_snapshots to authenticated;
grant select,insert,update,delete on public.cancellation_cases to authenticated;
grant select,insert,update,delete on public.cancellation_legal_sources to authenticated;

drop policy if exists cancellation_policies_read on public.cancellation_policies;
create policy cancellation_policies_read on public.cancellation_policies
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists cancellation_policies_write on public.cancellation_policies;
create policy cancellation_policies_write on public.cancellation_policies
for all to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text]))
with check (public.current_user_role()=any(array['admin'::text,'manager'::text]));

drop policy if exists cancellation_rules_read on public.cancellation_policy_rules;
create policy cancellation_rules_read on public.cancellation_policy_rules
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists cancellation_rules_write on public.cancellation_policy_rules;
create policy cancellation_rules_write on public.cancellation_policy_rules
for all to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text]))
with check (public.current_user_role()=any(array['admin'::text,'manager'::text]));

drop policy if exists service_policy_snapshots_read on public.service_policy_snapshots;
create policy service_policy_snapshots_read on public.service_policy_snapshots
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists service_policy_snapshots_write on public.service_policy_snapshots;
create policy service_policy_snapshots_write on public.service_policy_snapshots
for all to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role()=any(array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists cancellation_cases_read on public.cancellation_cases;
create policy cancellation_cases_read on public.cancellation_cases
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists cancellation_cases_insert on public.cancellation_cases;
create policy cancellation_cases_insert on public.cancellation_cases
for insert to authenticated
with check (public.current_user_role()=any(array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists cancellation_cases_update on public.cancellation_cases;
create policy cancellation_cases_update on public.cancellation_cases
for update to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text,'agent'::text]))
with check (public.current_user_role()=any(array['admin'::text,'manager'::text,'agent'::text]));

drop policy if exists cancellation_cases_delete on public.cancellation_cases;
create policy cancellation_cases_delete on public.cancellation_cases
for delete to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text]));

drop policy if exists cancellation_legal_sources_read on public.cancellation_legal_sources;
create policy cancellation_legal_sources_read on public.cancellation_legal_sources
for select to authenticated using (public.current_user_role() is not null);

drop policy if exists cancellation_legal_sources_write on public.cancellation_legal_sources;
create policy cancellation_legal_sources_write on public.cancellation_legal_sources
for all to authenticated
using (public.current_user_role()=any(array['admin'::text,'manager'::text]))
with check (public.current_user_role()=any(array['admin'::text,'manager'::text]));
