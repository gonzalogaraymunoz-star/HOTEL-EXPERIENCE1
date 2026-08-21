create table if not exists public.operational_entity_documents (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('supplier','person','vehicle','resource')),
  entity_id uuid not null,
  document_type text not null,
  title text not null,
  storage_bucket text not null default 'operational-files',
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  expires_on date,
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists operational_entity_documents_entity_idx
  on public.operational_entity_documents(entity_type, entity_id, status);
create index if not exists operational_entity_documents_expiry_idx
  on public.operational_entity_documents(expires_on) where status='active';
create unique index if not exists operational_entity_documents_storage_path_uidx
  on public.operational_entity_documents(storage_bucket, storage_path);

create or replace function public.validate_operational_entity_document()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if new.entity_type='supplier' and not exists(select 1 from public.suppliers where id=new.entity_id) then
    raise exception 'Proveedor no existe';
  elsif new.entity_type='person' and not exists(select 1 from public.service_people where id=new.entity_id) then
    raise exception 'Prestador no existe';
  elsif new.entity_type='vehicle' and not exists(select 1 from public.vehicles where id=new.entity_id) then
    raise exception 'Vehículo no existe';
  elsif new.entity_type='resource' and not exists(select 1 from public.operational_resources where id=new.entity_id) then
    raise exception 'Insumo no existe';
  end if;
  new.updated_at=now();
  return new;
end;
$$;

drop trigger if exists trg_validate_operational_entity_document on public.operational_entity_documents;
create trigger trg_validate_operational_entity_document
before insert or update on public.operational_entity_documents
for each row execute function public.validate_operational_entity_document();

alter table public.operational_entity_documents enable row level security;

drop policy if exists operational_entity_documents_read on public.operational_entity_documents;
create policy operational_entity_documents_read on public.operational_entity_documents
for select to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true));

drop policy if exists operational_entity_documents_write on public.operational_entity_documents;
create policy operational_entity_documents_write on public.operational_entity_documents
for all to authenticated
using (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')))
with check (exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')));

grant select on public.operational_entity_documents to authenticated;
grant insert,update,delete on public.operational_entity_documents to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'operational-files','operational-files',false,20971520,
  array['application/pdf','image/jpeg','image/png','image/webp','application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists operational_files_read on storage.objects;
create policy operational_files_read on storage.objects
for select to authenticated
using (bucket_id='operational-files' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true));

drop policy if exists operational_files_insert on storage.objects;
create policy operational_files_insert on storage.objects
for insert to authenticated
with check (bucket_id='operational-files' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')));

drop policy if exists operational_files_update on storage.objects;
create policy operational_files_update on storage.objects
for update to authenticated
using (bucket_id='operational-files' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')))
with check (bucket_id='operational-files' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')));

drop policy if exists operational_files_delete on storage.objects;
create policy operational_files_delete on storage.objects
for delete to authenticated
using (bucket_id='operational-files' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.is_active=true and p.role in ('admin','manager')));
