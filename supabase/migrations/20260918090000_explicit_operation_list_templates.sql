-- Explicit product -> operation-list template contract.
-- Every catalog product has at least one deliberate mapping; routes that use
-- more than one operational form can have multiple ordered mappings.

create table if not exists public.product_operation_list_templates (
  product_id uuid not null references public.product_catalog(id) on delete cascade,
  template_key text not null,
  sort_order integer not null default 10 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, template_key),
  constraint product_operation_list_templates_key_check check (
    template_key = any (array[
      'luna','chaxa','marte','socaire','arcoiris','catarpe','quitor',
      'talabre','coyo','frontera','transfer','tatio','otros','d80'
    ])
  )
);

comment on table public.product_operation_list_templates is
  'Contrato explícito y ordenado entre un producto comercial y las plantillas GOAS que debe completar.';

create index if not exists product_operation_list_templates_order_idx
  on public.product_operation_list_templates(product_id, sort_order, template_key);

insert into public.product_operation_list_templates(product_id, template_key, sort_order)
select id, coalesce(nullif(operation_list_template_key, ''), 'otros'), 10
from public.product_catalog
on conflict (product_id, template_key) do update
set sort_order = excluded.sort_order, updated_at = now();

insert into public.product_operation_list_templates(product_id, template_key, sort_order)
select id, 'chaxa', 20
from public.product_catalog
where product_slug in ('lagunas_altiplanicas','piedras_rojas','piedras_rojas_full_chaxa')
on conflict (product_id, template_key) do update
set sort_order = excluded.sort_order, updated_at = now();

alter table public.product_operation_list_templates enable row level security;

drop policy if exists product_operation_list_templates_read on public.product_operation_list_templates;
create policy product_operation_list_templates_read
  on public.product_operation_list_templates for select to authenticated
  using ((select public.current_user_role()) is not null);

drop policy if exists product_operation_list_templates_insert on public.product_operation_list_templates;
create policy product_operation_list_templates_insert
  on public.product_operation_list_templates for insert to authenticated
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists product_operation_list_templates_update on public.product_operation_list_templates;
create policy product_operation_list_templates_update
  on public.product_operation_list_templates for update to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists product_operation_list_templates_delete on public.product_operation_list_templates;
create policy product_operation_list_templates_delete
  on public.product_operation_list_templates for delete to authenticated
  using ((select public.current_user_role()) in ('admin','manager'));

grant select, insert, update, delete on public.product_operation_list_templates to authenticated;
