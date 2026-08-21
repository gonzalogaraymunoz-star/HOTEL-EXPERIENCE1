-- HOTEL EXPERIENCE · Cancellation policy runtime + storage
-- ALREADY APPLIED TO production. This file is repository history only.

insert into storage.buckets(id,name,public)
values ('policy-documents','policy-documents',false)
on conflict (id) do update set public=false;

drop policy if exists policy_documents_read on storage.objects;
create policy policy_documents_read on storage.objects
for select to authenticated
using (bucket_id='policy-documents' and public.current_user_role() is not null);

drop policy if exists policy_documents_insert on storage.objects;
create policy policy_documents_insert on storage.objects
for insert to authenticated
with check (
  bucket_id='policy-documents'
  and public.current_user_role()=any(array['admin'::text,'manager'::text])
);

drop policy if exists policy_documents_update on storage.objects;
create policy policy_documents_update on storage.objects
for update to authenticated
using (
  bucket_id='policy-documents'
  and public.current_user_role()=any(array['admin'::text,'manager'::text])
)
with check (
  bucket_id='policy-documents'
  and public.current_user_role()=any(array['admin'::text,'manager'::text])
);

drop policy if exists policy_documents_delete on storage.objects;
create policy policy_documents_delete on storage.objects
for delete to authenticated
using (
  bucket_id='policy-documents'
  and public.current_user_role()='admin'::text
);

create or replace function public.assign_default_cancellation_policy_snapshot(p_lead_service_id uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  v_policy public.cancellation_policies%rowtype;
  v_snapshot_id uuid;
begin
  if p_lead_service_id is null then return null; end if;

  select * into v_policy
  from public.cancellation_policies
  where status='active'
    and is_default=true
    and owner_type='company'
    and (effective_from is null or effective_from<=current_date)
    and (effective_to is null or effective_to>=current_date)
  order by priority asc,version desc
  limit 1;

  if v_policy.id is null then return null; end if;

  insert into public.service_policy_snapshots(
    lead_service_id,layer,policy_id,policy_version,policy_snapshot,rules_snapshot,notes
  )
  values(
    p_lead_service_id,'company',v_policy.id,v_policy.version,
    jsonb_build_object(
      'policy_key',v_policy.policy_key,'version',v_policy.version,'name',v_policy.name,
      'description',v_policy.description,'jurisdiction',v_policy.jurisdiction,
      'language',v_policy.language,'effective_from',v_policy.effective_from,
      'source_document_name',v_policy.source_document_name,'source_sha256',v_policy.source_sha256,
      'normalized_summary',v_policy.normalized_summary,
      'legal_review_status',v_policy.legal_review_status,'legal_notes',v_policy.legal_notes,
      'scope_config',v_policy.scope_config
    ),
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id',r.id,'rule_code',r.rule_code,'event_type',r.event_type,'applies_to',r.applies_to,
          'min_hours_before',r.min_hours_before,'max_hours_before',r.max_hours_before,
          'refund_percent',r.refund_percent,'penalty_percent',r.penalty_percent,
          'fixed_fee',r.fixed_fee,'currency',r.currency,'action_type',r.action_type,
          'evidence_required',r.evidence_required,'evidence_type',r.evidence_type,
          'conditions',r.conditions,'customer_text',r.customer_text,
          'internal_notes',r.internal_notes,'priority',r.priority
        ) order by r.priority,r.rule_code
      )
      from public.cancellation_policy_rules r
      where r.policy_id=v_policy.id and r.active=true
    ),'[]'::jsonb),
    'Snapshot automático de la política general vigente.'
  )
  on conflict (lead_service_id,layer) do nothing
  returning id into v_snapshot_id;

  if v_snapshot_id is null then
    select id into v_snapshot_id
    from public.service_policy_snapshots
    where lead_service_id=p_lead_service_id and layer='company';
  end if;
  return v_snapshot_id;
end;
$$;

create or replace function public.trg_assign_default_cancellation_policy_snapshot()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  perform public.assign_default_cancellation_policy_snapshot(new.id);
  return new;
end;
$$;

drop trigger if exists trg_lead_service_default_cancellation_policy on public.lead_services;
create trigger trg_lead_service_default_cancellation_policy
after insert on public.lead_services
for each row execute function public.trg_assign_default_cancellation_policy_snapshot();

do $$
declare r record;
begin
  for r in select id from public.lead_services loop
    perform public.assign_default_cancellation_policy_snapshot(r.id);
  end loop;
end $$;
