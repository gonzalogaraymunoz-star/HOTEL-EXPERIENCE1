alter table public.leads
  add column if not exists lifecycle_stage text not null default 'active';

alter table public.leads drop constraint if exists leads_lifecycle_stage_check;
alter table public.leads add constraint leads_lifecycle_stage_check
  check (lifecycle_stage in ('active','review','dormido'));

create table if not exists public.review_cases (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique references public.leads(id) on delete cascade,
  status text not null default 'pending',
  last_experience_date date,
  entered_at timestamptz not null default now(),
  last_action_at timestamptz,
  requested_at timestamptz,
  responded_at timestamptz,
  archived_at timestamptz,
  rating smallint,
  recommendation_text text,
  referral_name text,
  referral_contact text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_cases_status_check check (status in ('pending','requested','responded','dormido')),
  constraint review_cases_rating_check check (rating is null or rating between 1 and 5)
);

create index if not exists review_cases_status_idx on public.review_cases(status);
create index if not exists review_cases_last_experience_idx on public.review_cases(last_experience_date);

alter table public.review_cases enable row level security;
drop policy if exists review_cases_authenticated_read on public.review_cases;
create policy review_cases_authenticated_read on public.review_cases for select to authenticated using (true);
drop policy if exists review_cases_authenticated_write on public.review_cases;
create policy review_cases_authenticated_write on public.review_cases for all to authenticated using (true) with check (true);

create or replace function public.sync_review_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare changed_count integer := 0;
begin
  with service_state as (
    select l.id lead_id,count(s.id) service_count,
      bool_and(lower(coalesce(s.estado_pago,''))='pagado') all_paid,
      bool_and(lower(coalesce(s.estado_operacion,''))='completado') all_completed,
      max(s.fecha_servicio) last_experience_date
    from public.leads l join public.lead_services s on s.lead_id=l.id group by l.id
  ), eligible as (
    select * from service_state where service_count>0 and all_paid and all_completed
  )
  insert into public.review_cases(lead_id,last_experience_date,status,entered_at,updated_at)
  select lead_id,last_experience_date,'pending',now(),now() from eligible
  on conflict (lead_id) do update set
    status=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then 'pending' else review_cases.status end,
    entered_at=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then now() else review_cases.entered_at end,
    last_action_at=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.last_action_at end,
    requested_at=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.requested_at end,
    responded_at=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.responded_at end,
    archived_at=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.archived_at end,
    rating=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.rating end,
    recommendation_text=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.recommendation_text end,
    referral_name=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.referral_name end,
    referral_contact=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.referral_contact end,
    notes=case when excluded.last_experience_date is distinct from review_cases.last_experience_date and excluded.last_experience_date>coalesce(review_cases.last_experience_date,date '1900-01-01') then null else review_cases.notes end,
    last_experience_date=excluded.last_experience_date,updated_at=now();

  update public.review_cases set status='dormido',archived_at=coalesce(archived_at,now()),updated_at=now()
  where status='pending' and last_action_at is null and last_experience_date is not null and last_experience_date<=current_date-30;

  with service_state as (
    select l.id lead_id,count(s.id) service_count,
      bool_and(lower(coalesce(s.estado_pago,''))='pagado') all_paid,
      bool_and(lower(coalesce(s.estado_operacion,''))='completado') all_completed
    from public.leads l left join public.lead_services s on s.lead_id=l.id group by l.id
  )
  update public.leads l set lifecycle_stage=case
    when ss.service_count>0 and ss.all_paid and ss.all_completed then case when rc.status='dormido' then 'dormido' else 'review' end
    else 'active' end,
    updated_at=case when lifecycle_stage is distinct from case when ss.service_count>0 and ss.all_paid and ss.all_completed then case when rc.status='dormido' then 'dormido' else 'review' end else 'active' end then now() else l.updated_at end
  from service_state ss left join public.review_cases rc on rc.lead_id=ss.lead_id where l.id=ss.lead_id;

  get diagnostics changed_count=row_count;
  return changed_count;
end;
$$;

grant execute on function public.sync_review_lifecycle() to authenticated;
select public.sync_review_lifecycle();
