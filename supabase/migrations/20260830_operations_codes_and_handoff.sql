-- HOTEL EXPERIENCE — separación Ventas / Operación + códigos persistentes
-- Migración aditiva: no elimina datos ni cambia relaciones existentes.

-- 1) El código raíz del lead pasa a ser inequívoco en la base.
create unique index if not exists leads_codigo_unique on public.leads(codigo);

-- 2) Cliente principal + acompañantes: máximo un pasajero principal por lead.
with ranked as (
  select id, lead_id,
         row_number() over(partition by lead_id order by is_primary desc, created_at, passenger_code) as rn,
         bool_or(is_primary) over(partition by lead_id) as has_primary
  from public.passengers
)
update public.passengers p
set is_primary=true, updated_at=now()
from ranked r
where p.id=r.id and r.rn=1 and r.has_primary=false;

create unique index if not exists passengers_one_primary_per_lead
  on public.passengers(lead_id) where is_primary=true;

-- 3) Cada producto vendido/servicio recibe código hijo permanente: LEAD-S01, LEAD-S02...
alter table public.lead_services add column if not exists service_code text;

with numbered as (
  select s.id,
         l.codigo || '-S' || lpad(row_number() over(partition by s.lead_id order by s.created_at,s.id)::text,2,'0') as code
  from public.lead_services s
  join public.leads l on l.id=s.lead_id
  where s.service_code is null or btrim(s.service_code)=''
)
update public.lead_services s set service_code=n.code from numbered n where n.id=s.id;

create unique index if not exists lead_services_service_code_unique on public.lead_services(service_code);

create or replace function public.assign_service_code()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  v_lead_code text;
  v_next integer;
begin
  if new.service_code is not null and btrim(new.service_code)<>'' then return new; end if;
  perform pg_advisory_xact_lock(hashtext(new.lead_id::text));
  select codigo into v_lead_code from public.leads where id=new.lead_id;
  if coalesce(v_lead_code,'')='' then raise exception 'Lead % has no root code',new.lead_id; end if;
  select coalesce(max((regexp_match(service_code,'-S([0-9]+)$'))[1]::integer),0)+1
    into v_next
  from public.lead_services
  where lead_id=new.lead_id and service_code ~ '-S[0-9]+$';
  new.service_code:=v_lead_code||'-S'||lpad(v_next::text,2,'0');
  return new;
end;
$$;

drop trigger if exists trg_assign_service_code on public.lead_services;
create trigger trg_assign_service_code before insert on public.lead_services
for each row execute function public.assign_service_code();

alter table public.lead_services alter column service_code set not null;

-- 4) La ficha de operación es hija directa del servicio.
alter table public.service_assignments add column if not exists operation_code text;

update public.service_assignments a
set operation_code=s.service_code||'-OP01'
from public.lead_services s
where s.id=a.lead_service_id and (a.operation_code is null or btrim(a.operation_code)='');

create unique index if not exists service_assignments_operation_code_unique on public.service_assignments(operation_code);

create or replace function public.assign_operation_code()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare v_service_code text;
begin
  if new.operation_code is not null and btrim(new.operation_code)<>'' then return new; end if;
  select service_code into v_service_code from public.lead_services where id=new.lead_service_id;
  if coalesce(v_service_code,'')='' then raise exception 'Service % has no service_code',new.lead_service_id; end if;
  new.operation_code:=v_service_code||'-OP01';
  return new;
end;
$$;

drop trigger if exists trg_assign_operation_code on public.service_assignments;
create trigger trg_assign_operation_code before insert on public.service_assignments
for each row execute function public.assign_operation_code();

alter table public.service_assignments alter column operation_code set not null;

-- 5) Directorio operacional: todos los actores y activos tienen código visible.
create sequence if not exists public.supplier_code_seq;
alter table public.suppliers add column if not exists supplier_code text;
update public.suppliers set supplier_code='SUP-'||lpad(nextval('public.supplier_code_seq')::text,4,'0') where supplier_code is null or btrim(supplier_code)='';
select setval('public.supplier_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(supplier_code,'\\D','','g'),'')::bigint) from public.suppliers),1)),true);
alter table public.suppliers alter column supplier_code set default ('SUP-'||lpad(nextval('public.supplier_code_seq')::text,4,'0'));
alter table public.suppliers alter column supplier_code set not null;
create unique index if not exists suppliers_supplier_code_unique on public.suppliers(supplier_code);

create sequence if not exists public.person_code_seq;
alter table public.service_people add column if not exists person_code text;
update public.service_people set person_code='PER-'||lpad(nextval('public.person_code_seq')::text,4,'0') where person_code is null or btrim(person_code)='';
select setval('public.person_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(person_code,'\\D','','g'),'')::bigint) from public.service_people),1)),true);
alter table public.service_people alter column person_code set default ('PER-'||lpad(nextval('public.person_code_seq')::text,4,'0'));
alter table public.service_people alter column person_code set not null;
create unique index if not exists service_people_person_code_unique on public.service_people(person_code);

create sequence if not exists public.vehicle_code_seq;
alter table public.vehicles add column if not exists vehicle_code text;
update public.vehicles set vehicle_code='VEH-'||lpad(nextval('public.vehicle_code_seq')::text,4,'0') where vehicle_code is null or btrim(vehicle_code)='';
select setval('public.vehicle_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(vehicle_code,'\\D','','g'),'')::bigint) from public.vehicles),1)),true);
alter table public.vehicles alter column vehicle_code set default ('VEH-'||lpad(nextval('public.vehicle_code_seq')::text,4,'0'));
alter table public.vehicles alter column vehicle_code set not null;
create unique index if not exists vehicles_vehicle_code_unique on public.vehicles(vehicle_code);

create sequence if not exists public.resource_code_seq;
update public.operational_resources set code='RES-'||lpad(nextval('public.resource_code_seq')::text,4,'0') where code is null or btrim(code)='';
select setval('public.resource_code_seq',greatest(1,coalesce((select max(nullif(regexp_replace(code,'\\D','','g'),'')::bigint) from public.operational_resources),1)),true);
alter table public.operational_resources alter column code set default ('RES-'||lpad(nextval('public.resource_code_seq')::text,4,'0'));
alter table public.operational_resources alter column code set not null;

comment on column public.lead_services.service_code is 'Código operativo permanente hijo del lead: PREFIX-YYMM-###-S##.';
comment on column public.service_assignments.operation_code is 'Código de ficha operacional hijo del servicio: <service_code>-OP01.';
comment on column public.suppliers.supplier_code is 'Código humano permanente del operador/proveedor.';
comment on column public.service_people.person_code is 'Código humano permanente del prestador.';
comment on column public.vehicles.vehicle_code is 'Código humano permanente del vehículo.';
