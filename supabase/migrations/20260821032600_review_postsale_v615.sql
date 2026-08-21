alter table public.review_cases
  add column if not exists nps smallint,
  add column if not exists issue_text text,
  add column if not exists issue_resolved boolean,
  add column if not exists next_interest text,
  add column if not exists follow_up_date date,
  add column if not exists follow_up_status text not null default 'none',
  add column if not exists testimonial_permission boolean not null default false,
  add column if not exists follow_up_task_id uuid references public.crm_tasks(id) on delete set null;

alter table public.review_cases drop constraint if exists review_cases_nps_check;
alter table public.review_cases add constraint review_cases_nps_check
  check (nps is null or nps between 0 and 10);

alter table public.review_cases drop constraint if exists review_cases_follow_up_status_check;
alter table public.review_cases add constraint review_cases_follow_up_status_check
  check (follow_up_status in ('none','scheduled','contacted','won','lost'));

comment on column public.review_cases.nps is 'Probabilidad de recomendar de 0 a 10.';
comment on column public.review_cases.issue_text is 'Problema o inconveniente reportado en postventa.';
comment on column public.review_cases.issue_resolved is 'Indica si el inconveniente reportado quedó resuelto.';
comment on column public.review_cases.next_interest is 'Interés declarado para una futura experiencia o venta adicional.';
comment on column public.review_cases.follow_up_date is 'Fecha de próximo seguimiento comercial de postventa.';
comment on column public.review_cases.follow_up_status is 'Estado de la oportunidad comercial originada en postventa.';
comment on column public.review_cases.testimonial_permission is 'Permiso explícito para usar el comentario como testimonio.';
comment on column public.review_cases.follow_up_task_id is 'Tarea CRM creada para el seguimiento comercial de esta postventa.';
