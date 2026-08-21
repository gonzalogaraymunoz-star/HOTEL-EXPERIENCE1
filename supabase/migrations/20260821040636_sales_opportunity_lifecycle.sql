-- Separates current commercial opportunities from historical leads.
alter table public.leads drop constraint if exists leads_lifecycle_stage_check;
alter table public.leads
  add constraint leads_lifecycle_stage_check
  check (lifecycle_stage in ('active','review','dormido','historical'));
