-- LINK Forms RLS cleanup.
-- Keep one SELECT policy and split write permissions so admin/manager do not create duplicate permissive SELECT policies.

drop policy if exists link_form_templates_write on public.link_form_templates;
drop policy if exists link_form_fields_write on public.link_form_fields;
drop policy if exists link_form_aliases_write on public.link_form_aliases;

drop policy if exists link_form_templates_insert on public.link_form_templates;
create policy link_form_templates_insert on public.link_form_templates
  for insert to authenticated
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_templates_update on public.link_form_templates;
create policy link_form_templates_update on public.link_form_templates
  for update to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_templates_delete on public.link_form_templates;
create policy link_form_templates_delete on public.link_form_templates
  for delete to authenticated
  using ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_fields_insert on public.link_form_fields;
create policy link_form_fields_insert on public.link_form_fields
  for insert to authenticated
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_fields_update on public.link_form_fields;
create policy link_form_fields_update on public.link_form_fields
  for update to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_fields_delete on public.link_form_fields;
create policy link_form_fields_delete on public.link_form_fields
  for delete to authenticated
  using ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_aliases_insert on public.link_form_aliases;
create policy link_form_aliases_insert on public.link_form_aliases
  for insert to authenticated
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_aliases_update on public.link_form_aliases;
create policy link_form_aliases_update on public.link_form_aliases
  for update to authenticated
  using ((select public.current_user_role()) in ('admin','manager'))
  with check ((select public.current_user_role()) in ('admin','manager'));

drop policy if exists link_form_aliases_delete on public.link_form_aliases;
create policy link_form_aliases_delete on public.link_form_aliases
  for delete to authenticated
  using ((select public.current_user_role()) in ('admin','manager'));
