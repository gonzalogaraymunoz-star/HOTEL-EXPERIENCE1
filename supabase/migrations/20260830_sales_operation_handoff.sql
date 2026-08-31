-- La venta alimenta Operaciones solo cuando queda confirmada.
-- Nuevos servicios nacen en hold y no aparecen en HOTEL EXPERIENCE hasta el handoff.

alter table public.lead_services
  alter column booking_status set default 'hold';

alter table public.lead_services
  add column if not exists operation_ready_at timestamptz,
  add column if not exists operation_handoff_source text,
  add column if not exists operation_handoff_by uuid references auth.users(id) on delete set null;

update public.lead_services
set operation_ready_at=coalesce(operation_ready_at,created_at),
    operation_handoff_source=coalesce(operation_handoff_source,'legacy_confirmed')
where booking_status in ('confirmed','completed') and operation_ready_at is null;

create or replace function public.mark_operation_handoff()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.booking_status in ('confirmed','completed')
     and (tg_op='INSERT' or old.booking_status is distinct from new.booking_status or new.operation_ready_at is null) then
    new.operation_ready_at:=coalesce(new.operation_ready_at,now());
    new.operation_handoff_source:=coalesce(new.operation_handoff_source,'sales_confirmation');
    new.operation_handoff_by:=coalesce(new.operation_handoff_by,auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mark_operation_handoff on public.lead_services;
create trigger trg_mark_operation_handoff
before insert or update of booking_status on public.lead_services
for each row execute function public.mark_operation_handoff();

comment on column public.lead_services.operation_ready_at is 'Momento en que Ventas confirmó el servicio y lo entregó a Operaciones.';
comment on column public.lead_services.operation_handoff_source is 'Origen del handoff comercial→operacional.';
