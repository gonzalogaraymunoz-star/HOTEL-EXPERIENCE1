-- Central lifecycle rule:
-- active = actionable commercial opportunity
-- review/dormido = post-sale lifecycle
-- historical = expired/lost commercial data kept for lookup/reporting

create or replace function public.sync_review_lifecycle()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed_count integer := 0;
begin
  with service_state as (
    select
      l.id as lead_id,
      count(s.id) as service_count,
      bool_and(lower(coalesce(s.estado_pago,''))='pagado') as all_paid,
      bool_and(lower(coalesce(s.estado_operacion,''))='completado') as all_completed,
      coalesce(max(s.fecha_servicio),l.checkout,l.checkin) as last_experience_date
    from public.leads l
    join public.lead_services s on s.lead_id=l.id
    group by l.id,l.checkout,l.checkin
  ), eligible as (
    select * from service_state
    where service_count>0
      and all_paid
      and all_completed
      and last_experience_date is not null
      and last_experience_date <= current_date
  )
  insert into public.review_cases(lead_id,last_experience_date,status,entered_at,updated_at)
  select lead_id,last_experience_date,'pending',now(),now()
  from eligible
  on conflict (lead_id) do update
  set
    status = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then 'pending'
      else review_cases.status
    end,
    entered_at = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then now()
      else review_cases.entered_at
    end,
    last_action_at = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.last_action_at
    end,
    requested_at = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.requested_at
    end,
    responded_at = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.responded_at
    end,
    archived_at = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.archived_at
    end,
    rating = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.rating
    end,
    recommendation_text = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.recommendation_text
    end,
    referral_name = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.referral_name
    end,
    referral_contact = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.referral_contact
    end,
    notes = case
      when excluded.last_experience_date is distinct from review_cases.last_experience_date
           and excluded.last_experience_date > coalesce(review_cases.last_experience_date, date '1900-01-01')
        then null
      else review_cases.notes
    end,
    last_experience_date = excluded.last_experience_date,
    updated_at = now();

  update public.review_cases rc
  set status='dormido', archived_at=coalesce(archived_at,now()), updated_at=now()
  where rc.status='pending'
    and rc.last_action_at is null
    and rc.last_experience_date is not null
    and rc.last_experience_date <= current_date - 30;

  with lead_state as (
    select
      l.id as lead_id,
      (select count(*) from public.lead_services s where s.lead_id=l.id) as service_count,
      coalesce((select bool_and(lower(coalesce(s.estado_pago,''))='pagado') from public.lead_services s where s.lead_id=l.id),false) as all_paid,
      coalesce((select bool_and(lower(coalesce(s.estado_operacion,''))='completado') from public.lead_services s where s.lead_id=l.id),false) as all_completed,
      (select max(s.fecha_servicio) from public.lead_services s where s.lead_id=l.id and lower(coalesce(s.estado_operacion,''))<>'cancelado') as last_service_date,
      exists(
        select 1 from public.lead_services s
        where s.lead_id=l.id
          and lower(coalesce(s.estado_operacion,''))<>'cancelado'
          and s.fecha_servicio>=current_date
      ) as has_future_service,
      (select max(a.created_at)::date from public.crm_activities a where a.lead_id=l.id) as last_activity_date
    from public.leads l
  )
  update public.leads l
  set lifecycle_stage = case
    when ls.service_count>0
      and ls.all_paid
      and ls.all_completed
      and coalesce(ls.last_service_date,l.checkout,l.checkin) is not null
      and coalesce(ls.last_service_date,l.checkout,l.checkin) <= current_date then
        case when rc.status='dormido' then 'dormido' else 'review' end

    when lower(coalesce(l.estado,''))='perdido' then 'historical'

    when not ls.has_future_service
      and coalesce(l.checkout,ls.last_service_date,l.checkin) is not null
      and coalesce(l.checkout,ls.last_service_date,l.checkin) <= current_date - 30
      then 'historical'

    when coalesce(l.checkout,ls.last_service_date,l.checkin) is null
      and coalesce(ls.last_activity_date,l.created_at::date) <= current_date - 30
      then 'historical'

    else 'active'
  end,
  updated_at = case
    when l.lifecycle_stage is distinct from case
      when ls.service_count>0
        and ls.all_paid
        and ls.all_completed
        and coalesce(ls.last_service_date,l.checkout,l.checkin) is not null
        and coalesce(ls.last_service_date,l.checkout,l.checkin) <= current_date then
          case when rc.status='dormido' then 'dormido' else 'review' end
      when lower(coalesce(l.estado,''))='perdido' then 'historical'
      when not ls.has_future_service
        and coalesce(l.checkout,ls.last_service_date,l.checkin) is not null
        and coalesce(l.checkout,ls.last_service_date,l.checkin) <= current_date - 30 then 'historical'
      when coalesce(l.checkout,ls.last_service_date,l.checkin) is null
        and coalesce(ls.last_activity_date,l.created_at::date) <= current_date - 30 then 'historical'
      else 'active'
    end then now() else l.updated_at end
  from lead_state ls
  left join public.review_cases rc on rc.lead_id=ls.lead_id
  where l.id=ls.lead_id;

  get diagnostics changed_count = row_count;
  return changed_count;
end;
$$;

select public.sync_review_lifecycle();
