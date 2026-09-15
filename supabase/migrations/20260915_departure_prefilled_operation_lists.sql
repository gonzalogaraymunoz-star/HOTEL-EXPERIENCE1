alter table public.product_catalog
  add column if not exists operation_list_template_key text;

comment on column public.product_catalog.operation_list_template_key is
  'Concepto canónico de formulario operacional para listas prellenadas por salida: luna, chaxa, marte, socaire, arcoiris, catarpe, quitor, talabre, coyo, frontera, transfer, tatio u otros.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'product_catalog_operation_list_template_key_check'
  ) then
    alter table public.product_catalog
      add constraint product_catalog_operation_list_template_key_check
      check (
        operation_list_template_key is null or
        operation_list_template_key = any (array['luna','chaxa','marte','socaire','arcoiris','catarpe','quitor','talabre','coyo','frontera','transfer','tatio','otros'])
      );
  end if;
end $$;

update public.product_catalog set operation_list_template_key='luna' where product_slug='valle_de_la_luna';
update public.product_catalog set operation_list_template_key='chaxa' where product_slug='salar_de_atacama';
update public.product_catalog set operation_list_template_key='socaire' where product_slug in ('lagunas_altiplanicas','piedras_rojas','piedras_rojas_full_chaxa');
update public.product_catalog set operation_list_template_key='tatio' where product_slug='geiser_del_tatio';
update public.product_catalog set operation_list_template_key='arcoiris' where product_slug='valle_arcoiris';
update public.product_catalog set operation_list_template_key='catarpe' where product_slug='catarpe_y_cuchabrache';
update public.product_catalog set operation_list_template_key='coyo' where product_slug in ('baltinache','laguna_cejar','vallecito');
update public.product_catalog set operation_list_template_key='marte' where product_slug='valle_de_marte';
update public.product_catalog set operation_list_template_key='frontera' where product_slug='trf_hito_cajon';
update public.product_catalog set operation_list_template_key='transfer' where category='Transporte' and operation_list_template_key is null;

create table if not exists public.operation_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title text not null,
  file_name text not null,
  mime_type text not null default 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  file_bytes bytea,
  source_url text,
  sha256 text,
  active boolean not null default true,
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.operation_templates is
  'Plantillas maestras controladas por Hotel Experience. El motor operacional solo lee la plantilla activa por template_key.';

alter table public.operation_templates enable row level security;

create table if not exists public.tour_departure_documents (
  id uuid primary key default gen_random_uuid(),
  departure_id uuid not null references public.tour_departures(id) on delete cascade,
  document_type text not null default 'prefilled_lists',
  title text not null,
  storage_bucket text not null default 'operation-documents',
  storage_path text not null,
  file_name text not null,
  generated_from jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  generated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  unique(departure_id, document_type)
);

comment on table public.tour_departure_documents is
  'Un documento vigente por salida/tour y tipo. Regenerar reemplaza el mismo objeto para evitar duplicados entre reservas del mismo tour.';

alter table public.tour_departure_documents enable row level security;
create index if not exists idx_tour_departure_documents_departure on public.tour_departure_documents(departure_id);

insert into public.operation_templates(template_key,title,file_name,source_url,active)
values (
  'site_lists_master',
  'Listas sitios autorellenada',
  'LISTAS SITIOS AUTORELLENADA.xlsx',
  'https://docs.google.com/spreadsheets/d/1JWv35WyZMlx4UsYAzR0K5P8gnT871Rr1ObdjVPBZWsM',
  true
)
on conflict (template_key) do update set
  title=excluded.title,
  file_name=excluded.file_name,
  source_url=excluded.source_url,
  active=true,
  updated_at=now();