-- Guardas para que los códigos sigan siendo automáticos aunque el frontend envíe null.

create or replace function public.ensure_resource_code()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.code is null or btrim(new.code)='' then
    new.code:='RES-'||lpad(nextval('public.resource_code_seq')::text,4,'0');
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_resource_code on public.operational_resources;
create trigger trg_ensure_resource_code
before insert on public.operational_resources
for each row execute function public.ensure_resource_code();

-- Si llega el primer pasajero sin marcar principal, se transforma en P01 principal.
-- Si se marca otro como principal, el anterior vuelve a acompañante.
create or replace function public.ensure_primary_passenger()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.is_primary=true then
    update public.passengers set is_primary=false,updated_at=now()
    where lead_id=new.lead_id and id is distinct from new.id and is_primary=true;
  elsif not exists(select 1 from public.passengers where lead_id=new.lead_id and is_primary=true) then
    new.is_primary:=true;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_ensure_primary_passenger on public.passengers;
create trigger trg_ensure_primary_passenger
before insert or update of is_primary,lead_id on public.passengers
for each row execute function public.ensure_primary_passenger();
