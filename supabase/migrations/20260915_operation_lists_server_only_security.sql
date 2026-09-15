create index if not exists operation_templates_updated_by_idx on public.operation_templates(updated_by);
create index if not exists tour_departure_documents_generated_by_idx on public.tour_departure_documents(generated_by);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='operation_templates' and policyname='operation_templates_server_only'
  ) then
    create policy operation_templates_server_only
      on public.operation_templates
      for all to authenticated
      using (false)
      with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='tour_departure_documents' and policyname='tour_departure_documents_server_only'
  ) then
    create policy tour_departure_documents_server_only
      on public.tour_departure_documents
      for all to authenticated
      using (false)
      with check (false);
  end if;
end $$;