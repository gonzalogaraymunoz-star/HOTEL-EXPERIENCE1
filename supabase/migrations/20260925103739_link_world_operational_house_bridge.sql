-- HOTEL EXPERIENCE → LINK WORLD · Operational House source adapter
-- This migration contains NO bridge secret. Provision the source token separately in Vault
-- under the name: link_world_bridge_hotel_experience_v1

create schema if not exists private;

create table if not exists public.link_world_event_outbox (
  id uuid primary key default gen_random_uuid(),
  cell_global_id text not null default 'LNK-BIZ-9483042A457C4D36',
  source_project_id text not null default 'lpirjwifzosdzgdncsbt',
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  dedupe_key text not null unique,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending',
  attempts integer not null default 0,
  published_at timestamptz null,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_request_id bigint null,
  last_attempt_at timestamptz null,
  constraint link_world_event_outbox_event_chk check (event_type ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  constraint link_world_event_outbox_payload_chk check (jsonb_typeof(payload)='object'),
  constraint link_world_event_outbox_status_chk check (status in ('pending','publishing','published','error')),
  constraint link_world_event_outbox_attempts_chk check (attempts >= 0)
);

alter table public.link_world_event_outbox
  add column if not exists last_request_id bigint null,
  add column if not exists last_attempt_at timestamptz null;

alter table public.link_world_event_outbox enable row level security;
revoke all on public.link_world_event_outbox from public, anon, authenticated;
grant all on public.link_world_event_outbox to service_role;

drop policy if exists link_world_event_outbox_service_role_all on public.link_world_event_outbox;
create policy link_world_event_outbox_service_role_all
on public.link_world_event_outbox
for all to service_role
using (true)
with check (true);

create index if not exists link_world_event_outbox_pending_idx
on public.link_world_event_outbox(status, occurred_at)
where status in ('pending','error');

create index if not exists link_world_event_outbox_request_idx
on public.link_world_event_outbox(last_request_id)
where last_request_id is not null;

create or replace function private.he_link_world_enqueue_event(
  p_event_type text,
  p_aggregate_type text,
  p_aggregate_id uuid,
  p_dedupe_key text,
  p_payload jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'Event payload must be a JSON object';
  end if;

  insert into public.link_world_event_outbox(
    event_type,aggregate_type,aggregate_id,dedupe_key,payload,occurred_at
  )
  values(
    p_event_type,p_aggregate_type,p_aggregate_id,p_dedupe_key,p_payload,coalesce(p_occurred_at,now())
  )
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then
    select o.id into v_id
    from public.link_world_event_outbox o
    where o.dedupe_key=p_dedupe_key;
  end if;

  return v_id;
end;
$$;

revoke execute on function private.he_link_world_enqueue_event(text,text,uuid,text,jsonb,timestamptz)
from public, anon, authenticated;
grant execute on function private.he_link_world_enqueue_event(text,text,uuid,text,jsonb,timestamptz)
to service_role;

create or replace function private.he_link_world_outbox_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed boolean := false;
  v_event text;
  v_type text;
  v_id uuid;
  v_key text;
  v_payload jsonb;
  v_at timestamptz := now();
begin
  if tg_table_name='lead_services' then
    v_changed := new.booking_status='confirmed'
      and (tg_op='INSERT' or old.booking_status is distinct from new.booking_status);
    if v_changed then
      v_event := 'sale.confirmed';
      v_type := 'lead_service';
      v_id := new.id;
      v_at := coalesce(new.updated_at,new.created_at,now());
      v_key := concat('he:lead_services:',new.id,':sale.confirmed:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','lead_services',
        'source_record_id',new.id,
        'lead_id',new.lead_id,
        'product_catalog_id',new.product_catalog_id,
        'booking_status',new.booking_status,
        'service_date',new.fecha_servicio,
        'pax_count',new.numero_pax
      );
    end if;

  elsif tg_table_name='service_closures' then
    v_changed := new.closure_status='closed'
      and (tg_op='INSERT' or old.closure_status is distinct from new.closure_status);
    if v_changed then
      v_event := 'operation.completed';
      v_type := 'service_closure';
      v_id := new.id;
      v_at := coalesce(new.closed_at,new.updated_at,new.created_at,now());
      v_key := concat('he:service_closures:',new.id,':operation.completed:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','service_closures',
        'source_record_id',new.id,
        'lead_service_id',new.lead_service_id,
        'outcome',new.outcome,
        'actual_pax',new.actual_pax,
        'closure_status',new.closure_status
      );
    end if;

  elsif tg_table_name='service_commissions' then
    v_changed := new.status='accrued'
      and (tg_op='INSERT' or old.status is distinct from new.status);
    if v_changed then
      v_event := 'commission.accrued';
      v_type := 'service_commission';
      v_id := new.id;
      v_at := coalesce(new.updated_at,new.created_at,now());
      v_key := concat('he:service_commissions:',new.id,':commission.accrued:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','service_commissions',
        'source_record_id',new.id,
        'lead_service_id',new.lead_service_id,
        'actor_type',new.actor_type,
        'percentage',new.percentage,
        'amount',new.amount,
        'calculation_basis',new.calculation_basis,
        'status',new.status
      );
    end if;

  elsif tg_table_name='hotel_partners' then
    v_changed := new.active=true
      and (tg_op='INSERT' or old.active is distinct from new.active);
    if v_changed then
      v_event := 'counterparty.connected';
      v_type := 'hotel_partner';
      v_id := new.id;
      v_at := coalesce(new.updated_at,new.created_at,now());
      v_key := concat('he:hotel_partners:',new.id,':counterparty.connected:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','hotel_partners',
        'source_record_id',new.id,
        'slug',new.slug,
        'partner_type',new.partner_type,
        'lead_prefix',new.lead_prefix,
        'active',new.active
      );
    end if;

  elsif tg_table_name='product_catalog' then
    v_changed := new.active=true
      and (tg_op='INSERT' or old.active is distinct from new.active);
    if v_changed then
      v_event := 'product.available';
      v_type := 'product_catalog';
      v_id := new.id;
      v_at := coalesce(new.updated_at,new.created_at,now());
      v_key := concat('he:product_catalog:',new.id,':product.available:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','product_catalog',
        'source_record_id',new.id,
        'code',new.code,
        'product_slug',new.product_slug,
        'category',new.category,
        'active',new.active
      );
    end if;

  elsif tg_table_name='review_cases' then
    v_changed := new.status='responded'
      and (tg_op='INSERT' or old.status is distinct from new.status);
    if v_changed then
      v_event := 'feedback.closed';
      v_type := 'review_case';
      v_id := new.id;
      v_at := coalesce(new.responded_at,new.updated_at,new.created_at,now());
      v_key := concat('he:review_cases:',new.id,':feedback.closed:',v_at::text);
      v_payload := jsonb_build_object(
        'source_table','review_cases',
        'source_record_id',new.id,
        'lead_id',new.lead_id,
        'status',new.status,
        'rating',new.rating,
        'nps',new.nps,
        'issue_resolved',new.issue_resolved,
        'follow_up_status',new.follow_up_status,
        'testimonial_permission',new.testimonial_permission
      );
    end if;
  end if;

  if v_changed and v_event is not null then
    perform private.he_link_world_enqueue_event(
      v_event,v_type,v_id,v_key,coalesce(v_payload,'{}'::jsonb),v_at
    );
  end if;

  return new;
end;
$$;

revoke execute on function private.he_link_world_outbox_trigger()
from public, anon, authenticated;
grant execute on function private.he_link_world_outbox_trigger()
to service_role;

drop trigger if exists he_lw_lead_services_event on public.lead_services;
create trigger he_lw_lead_services_event
after insert or update of booking_status on public.lead_services
for each row execute function private.he_link_world_outbox_trigger();

drop trigger if exists he_lw_service_closures_event on public.service_closures;
create trigger he_lw_service_closures_event
after insert or update of closure_status on public.service_closures
for each row execute function private.he_link_world_outbox_trigger();

drop trigger if exists he_lw_service_commissions_event on public.service_commissions;
create trigger he_lw_service_commissions_event
after insert or update of status on public.service_commissions
for each row execute function private.he_link_world_outbox_trigger();

drop trigger if exists he_lw_hotel_partners_event on public.hotel_partners;
create trigger he_lw_hotel_partners_event
after insert or update of active on public.hotel_partners
for each row execute function private.he_link_world_outbox_trigger();

drop trigger if exists he_lw_product_catalog_event on public.product_catalog;
create trigger he_lw_product_catalog_event
after insert or update of active on public.product_catalog
for each row execute function private.he_link_world_outbox_trigger();

drop trigger if exists he_lw_review_cases_event on public.review_cases;
create trigger he_lw_review_cases_event
after insert or update of status on public.review_cases
for each row execute function private.he_link_world_outbox_trigger();

create or replace function private.he_reconcile_link_world_outbox()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
begin
  with responses as (
    select
      o.id as outbox_id,
      r.status_code,
      r.timed_out,
      r.error_msg,
      r.content
    from public.link_world_event_outbox o
    join net._http_response r on r.id=o.last_request_id
    where o.status='publishing'
      and o.last_request_id is not null
  ),
  updated as (
    update public.link_world_event_outbox o
    set status = case
          when coalesce(r.timed_out,false)=false and r.status_code between 200 and 299 then 'published'
          else 'error'
        end,
        published_at = case
          when coalesce(r.timed_out,false)=false and r.status_code between 200 and 299 then now()
          else o.published_at
        end,
        last_error = case
          when coalesce(r.timed_out,false)=false and r.status_code between 200 and 299 then null
          else left(coalesce(r.error_msg,r.content,'HTTP '||coalesce(r.status_code::text,'unknown')),500)
        end,
        updated_at=now()
    from responses r
    where o.id=r.outbox_id
    returning o.id
  )
  select count(*) into v_count from updated;

  return v_count;
end;
$$;

revoke execute on function private.he_reconcile_link_world_outbox() from public, anon, authenticated;
grant execute on function private.he_reconcile_link_world_outbox() to service_role;

create or replace function private.he_publish_link_world_outbox_batch(p_limit integer default 20)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_row record;
  v_request_id bigint;
  v_count integer := 0;
  v_endpoint text := 'https://zgbnjlrxzvzpigmwidsp.supabase.co/functions/v1/ingest-operational-house-event';
begin
  select ds.decrypted_secret into v_token
  from vault.decrypted_secrets ds
  where ds.name='link_world_bridge_hotel_experience_v1'
  limit 1;

  if v_token is null or length(v_token)<32 then
    raise exception 'LINK WORLD bridge secret unavailable';
  end if;

  for v_row in
    select o.*
    from public.link_world_event_outbox o
    where o.status in ('pending','error')
      and o.attempts < 10
      and (o.last_attempt_at is null or o.last_attempt_at < now()-interval '1 minute')
    order by o.occurred_at,o.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  loop
    begin
      select net.http_post(
        url := v_endpoint,
        body := jsonb_build_object(
          'cell_global_id',v_row.cell_global_id,
          'source_project_id',v_row.source_project_id,
          'event_type',v_row.event_type,
          'aggregate_type',v_row.aggregate_type,
          'aggregate_id',v_row.aggregate_id,
          'dedupe_key',v_row.dedupe_key,
          'payload',v_row.payload,
          'occurred_at',v_row.occurred_at
        ),
        params := '{}'::jsonb,
        headers := jsonb_build_object(
          'Content-Type','application/json',
          'x-link-bridge-token',v_token
        ),
        timeout_milliseconds := 5000
      ) into v_request_id;

      update public.link_world_event_outbox
      set status='publishing',
          attempts=attempts+1,
          last_request_id=v_request_id,
          last_attempt_at=now(),
          last_error=null,
          updated_at=now()
      where id=v_row.id;

      v_count := v_count+1;
    exception when others then
      update public.link_world_event_outbox
      set status='error',
          attempts=attempts+1,
          last_attempt_at=now(),
          last_error=left(sqlerrm,500),
          updated_at=now()
      where id=v_row.id;
    end;
  end loop;

  return v_count;
end;
$$;

revoke execute on function private.he_publish_link_world_outbox_batch(integer) from public, anon, authenticated;
grant execute on function private.he_publish_link_world_outbox_batch(integer) to service_role;

create or replace function private.he_link_world_bridge_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reconciled integer;
  v_published integer;
begin
  v_reconciled := private.he_reconcile_link_world_outbox();
  v_published := private.he_publish_link_world_outbox_batch(20);
  return jsonb_build_object(
    'reconciled',v_reconciled,
    'published',v_published,
    'ran_at',now()
  );
end;
$$;

revoke execute on function private.he_link_world_bridge_tick() from public, anon, authenticated;
grant execute on function private.he_link_world_bridge_tick() to service_role;

do $$
declare
  v_job bigint;
begin
  select jobid into v_job
  from cron.job
  where jobname='hotel-experience-link-world-bridge'
  limit 1;

  if v_job is not null then
    perform cron.unschedule(v_job);
  end if;

  perform cron.schedule(
    'hotel-experience-link-world-bridge',
    '* * * * *',
    'select private.he_link_world_bridge_tick();'
  );
end;
$$;
