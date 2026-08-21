-- Define si un tour se ejecuta internamente o se compra a un operador.
-- Migración aditiva: no elimina ni renombra columnas existentes.

alter table public.service_assignments
  add column if not exists operation_mode text not null default 'direct',
  add column if not exists supplier_coverage jsonb not null default '[]'::jsonb;

-- Antes de esta migración, cualquier ficha con supplier_id era tratada por la app
-- como tour derivado. Conservamos ese significado y lo hacemos explícito.
update public.service_assignments
set operation_mode = 'delegated_full',
    supplier_coverage = '["vehicle","driver","guide","food","coordination","resources","entrances"]'::jsonb
where supplier_id is not null
  and operation_mode = 'direct';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'service_assignments_operation_mode_check'
  ) then
    alter table public.service_assignments
      add constraint service_assignments_operation_mode_check
      check (operation_mode in ('direct','delegated_full','delegated_partial'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'service_assignments_supplier_coverage_array_check'
  ) then
    alter table public.service_assignments
      add constraint service_assignments_supplier_coverage_array_check
      check (jsonb_typeof(supplier_coverage) = 'array');
  end if;
end $$;

comment on column public.service_assignments.operation_mode is
'Execution mode: direct, delegated_full or delegated_partial.';
comment on column public.service_assignments.supplier_coverage is
'JSON array with components covered by the supplier: vehicle, driver, guide, food, coordination, resources, entrances.';
