alter table public.leads
  add column if not exists hidden_from_primary boolean not null default false;

comment on column public.leads.hidden_from_primary is
  'Oculta leads históricos del flujo principal sin borrar su historial operativo.';

update public.leads
set hidden_from_primary = true,
    updated_at = now()
where sales_stage = 'completed'
  and hidden_from_primary = false;

create index if not exists leads_hidden_from_primary_idx
  on public.leads(hidden_from_primary, created_at desc);
