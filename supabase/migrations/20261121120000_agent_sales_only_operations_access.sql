-- LINK Ventas / Operaciones: separar el rol agent del espacio operacional.
-- Draft de seguridad. No aplicar a producción sin revisión y aprobación.
-- Supabase project: lpirjwifzosdzgdncsbt
-- No modifica profiles, current_user_role(), leads ni lead_services.

-- 1) Lectura: Operaciones solo para perfiles activos admin/manager.
-- Mantiene el mismo helper activo, pero agrega autorización por rol.

drop policy if exists app_addons_read on public.app_addons;
create policy app_addons_read on public.app_addons
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists cancellation_cases_read on public.cancellation_cases;
create policy cancellation_cases_read on public.cancellation_cases
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists cancellation_legal_sources_read on public.cancellation_legal_sources;
create policy cancellation_legal_sources_read on public.cancellation_legal_sources
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists cancellation_policies_read on public.cancellation_policies;
create policy cancellation_policies_read on public.cancellation_policies
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists cancellation_rules_read on public.cancellation_policy_rules;
create policy cancellation_rules_read on public.cancellation_policy_rules
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists data_imports_read on public.data_imports;
create policy data_imports_read on public.data_imports
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists data_import_items_read on public.data_import_items;
create policy data_import_items_read on public.data_import_items
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists financial_reconciliations_read on public.financial_reconciliations;
create policy financial_reconciliations_read on public.financial_reconciliations
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_resources_read on public.operational_resources;
create policy ops_resources_read on public.operational_resources
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists payment_movements_read on public.payment_movements;
create policy payment_movements_read on public.payment_movements
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists operation_list_catalog_read on public.operation_list_catalog;
create policy operation_list_catalog_read on public.operation_list_catalog
for select to authenticated
using (active = true and public.current_user_role() in ('admin','manager'));

drop policy if exists product_operation_list_templates_read on public.product_operation_list_templates;
create policy product_operation_list_templates_read on public.product_operation_list_templates
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_assignments_read on public.service_assignments;
create policy ops_assignments_read on public.service_assignments
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists service_closures_read on public.service_closures;
create policy service_closures_read on public.service_closures
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists service_commissions_read on public.service_commissions;
create policy service_commissions_read on public.service_commissions
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_service_cost_items_read on public.service_cost_items;
create policy ops_service_cost_items_read on public.service_cost_items
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_people_read on public.service_people;
create policy ops_people_read on public.service_people
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists service_policy_snapshots_read on public.service_policy_snapshots;
create policy service_policy_snapshots_read on public.service_policy_snapshots
for select to authenticated
using (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = service_policy_snapshots.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists ops_service_resources_read on public.service_resource_assignments;
create policy ops_service_resources_read on public.service_resource_assignments
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists supplier_rates_read on public.supplier_rates;
create policy supplier_rates_read on public.supplier_rates
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_suppliers_read on public.suppliers;
create policy ops_suppliers_read on public.suppliers
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_notes_read on public.tour_departure_notes;
create policy tour_departure_notes_read on public.tour_departure_notes
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_resources_read on public.tour_departure_resources;
create policy tour_departure_resources_read on public.tour_departure_resources
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departures_auth_read on public.tour_departures;
create policy tour_departures_auth_read on public.tour_departures
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_food_passengers_read on public.tour_food_passengers;
create policy tour_food_passengers_read on public.tour_food_passengers
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_food_segments_read on public.tour_food_segments;
create policy tour_food_segments_read on public.tour_food_segments
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists traffic_financial_reconciliations_read on public.traffic_financial_reconciliations;
create policy traffic_financial_reconciliations_read on public.traffic_financial_reconciliations
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists traffic_service_rows_read on public.traffic_service_rows;
create policy traffic_service_rows_read on public.traffic_service_rows
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_vehicles_read on public.vehicles;
create policy ops_vehicles_read on public.vehicles
for select to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists operational_entity_documents_read on public.operational_entity_documents;
create policy operational_entity_documents_read on public.operational_entity_documents
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role in ('admin','manager')
  )
);

-- 2) Documentos de Ventas: agent conserva solo documentos comerciales de sus propios leads.
-- Tipos observados en producción: evidence_quote, evidence_quote_draft,
-- evidence_itinerary, evidence_chat, risk_sheet y operation_list.
-- risk_sheet / operation_list quedan reservados a Operaciones.

drop policy if exists ops_documents_read on public.reservation_documents;
create policy ops_documents_read on public.reservation_documents
for select to authenticated
using (
  public.current_user_role() in ('admin','manager','viewer')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_documents.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists reservation_document_versions_read on public.reservation_document_versions;
create policy reservation_document_versions_read on public.reservation_document_versions
for select to authenticated
using (
  public.current_user_role() in ('admin','manager','viewer')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_document_versions.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

-- Las escrituras comerciales sobre documentos quedan acotadas al lead propio/asignado.
drop policy if exists ops_documents_insert on public.reservation_documents;
create policy ops_documents_insert on public.reservation_documents
for insert to authenticated
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_documents.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists ops_documents_update on public.reservation_documents;
create policy ops_documents_update on public.reservation_documents
for update to authenticated
using (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_documents.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
)
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_documents.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists reservation_document_versions_insert on public.reservation_document_versions;
create policy reservation_document_versions_insert on public.reservation_document_versions
for insert to authenticated
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_document_versions.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists reservation_document_versions_update on public.reservation_document_versions;
create policy reservation_document_versions_update on public.reservation_document_versions
for update to authenticated
using (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_document_versions.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
)
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and document_type in ('evidence_quote','evidence_quote_draft','evidence_itinerary','evidence_chat')
    and exists (
      select 1 from public.leads l
      where l.id = reservation_document_versions.lead_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

-- El vínculo pasajero-servicio es parte de la ficha comercial; agent solo opera sus leads.
drop policy if exists lead_service_passengers_select on public.lead_service_passengers;
create policy lead_service_passengers_select on public.lead_service_passengers
for select to authenticated
using (
  public.current_user_role() in ('admin','manager','viewer')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = lead_service_passengers.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

drop policy if exists lead_service_passengers_write on public.lead_service_passengers;
create policy lead_service_passengers_write on public.lead_service_passengers
for all to authenticated
using (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = lead_service_passengers.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
)
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = lead_service_passengers.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

-- Snapshots de política vinculados a un servicio propio son parte del expediente de Ventas.
drop policy if exists service_policy_snapshots_write on public.service_policy_snapshots;
create policy service_policy_snapshots_write on public.service_policy_snapshots
for all to authenticated
using (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = service_policy_snapshots.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
)
with check (
  public.current_user_role() in ('admin','manager')
  or (
    public.current_user_role() = 'agent'
    and exists (
      select 1
      from public.lead_services ls
      join public.leads l on l.id = ls.lead_id
      where ls.id = service_policy_snapshots.lead_service_id
        and (l.created_by = (select auth.uid()) or l.assigned_to = (select auth.uid()))
    )
  )
);

-- 3) Escrituras de Operaciones: agent no administra recursos, cierres, costos,
-- comisiones, pagos operacionales, alimentación ni conciliaciones.
-- Las escrituras de Ventas en leads/lead_services y los documentos comerciales
-- anteriores no se modifican.

drop policy if exists cancellation_cases_insert on public.cancellation_cases;
create policy cancellation_cases_insert on public.cancellation_cases
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists cancellation_cases_update on public.cancellation_cases;
create policy cancellation_cases_update on public.cancellation_cases
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists payment_movements_insert on public.payment_movements;
create policy payment_movements_insert on public.payment_movements
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists payment_movements_update on public.payment_movements;
create policy payment_movements_update on public.payment_movements
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists payment_movements_delete on public.payment_movements;
create policy payment_movements_delete on public.payment_movements
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_assignments_insert on public.service_assignments;
create policy ops_assignments_insert on public.service_assignments
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists ops_assignments_update on public.service_assignments;
create policy ops_assignments_update on public.service_assignments
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_service_resources_insert on public.service_resource_assignments;
create policy ops_service_resources_insert on public.service_resource_assignments
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists ops_service_resources_update on public.service_resource_assignments;
create policy ops_service_resources_update on public.service_resource_assignments
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists ops_service_resources_delete on public.service_resource_assignments;
create policy ops_service_resources_delete on public.service_resource_assignments
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists service_closures_insert on public.service_closures;
create policy service_closures_insert on public.service_closures
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists service_closures_update on public.service_closures;
create policy service_closures_update on public.service_closures
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists service_commissions_insert on public.service_commissions;
create policy service_commissions_insert on public.service_commissions
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists service_commissions_update on public.service_commissions;
create policy service_commissions_update on public.service_commissions
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists service_commissions_delete on public.service_commissions;
create policy service_commissions_delete on public.service_commissions
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists ops_service_cost_items_insert on public.service_cost_items;
create policy ops_service_cost_items_insert on public.service_cost_items
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists ops_service_cost_items_update on public.service_cost_items;
create policy ops_service_cost_items_update on public.service_cost_items
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists ops_service_cost_items_delete on public.service_cost_items;
create policy ops_service_cost_items_delete on public.service_cost_items
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_food_segments_write on public.tour_food_segments;
create policy tour_food_segments_write on public.tour_food_segments
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_food_passengers_write on public.tour_food_passengers;
create policy tour_food_passengers_write on public.tour_food_passengers
for all to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists traffic_financial_reconciliations_insert on public.traffic_financial_reconciliations;
create policy traffic_financial_reconciliations_insert on public.traffic_financial_reconciliations
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists traffic_financial_reconciliations_update on public.traffic_financial_reconciliations;
create policy traffic_financial_reconciliations_update on public.traffic_financial_reconciliations
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists traffic_financial_reconciliations_delete on public.traffic_financial_reconciliations;
create policy traffic_financial_reconciliations_delete on public.traffic_financial_reconciliations
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists traffic_service_rows_insert on public.traffic_service_rows;
create policy traffic_service_rows_insert on public.traffic_service_rows
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));
drop policy if exists traffic_service_rows_update on public.traffic_service_rows;
create policy traffic_service_rows_update on public.traffic_service_rows
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));
drop policy if exists traffic_service_rows_delete on public.traffic_service_rows;
create policy traffic_service_rows_delete on public.traffic_service_rows
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

-- 4) Ajuste específico de 20260915180539_harden_tour_departure_rls.
-- Ventas conserva solo la nota de origen 'sales' que escribe el vendedor.
-- Las salidas y los recursos de salida son Operaciones.

drop policy if exists tour_departures_auth_insert on public.tour_departures;
create policy tour_departures_auth_insert on public.tour_departures
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departures_auth_update on public.tour_departures;
create policy tour_departures_auth_update on public.tour_departures
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_resources_insert on public.tour_departure_resources;
create policy tour_departure_resources_insert on public.tour_departure_resources
for insert to authenticated with check (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_resources_update on public.tour_departure_resources;
create policy tour_departure_resources_update on public.tour_departure_resources
for update to authenticated
using (public.current_user_role() in ('admin','manager'))
with check (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_resources_delete on public.tour_departure_resources;
create policy tour_departure_resources_delete on public.tour_departure_resources
for delete to authenticated using (public.current_user_role() in ('admin','manager'));

drop policy if exists tour_departure_notes_insert on public.tour_departure_notes;
create policy tour_departure_notes_insert on public.tour_departure_notes
for insert to authenticated
with check (
  (
    public.current_user_role() in ('admin','manager')
    or (
      public.current_user_role() = 'agent'
      and source = 'sales'
    )
  )
  and created_by = (select auth.uid())
);

-- 5) Storage: private operational buckets remain readable only by admin/manager.
drop policy if exists operational_files_read on storage.objects;
create policy operational_files_read on storage.objects
for select to authenticated
using (
  bucket_id = 'operational-files'
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.is_active = true
      and p.role in ('admin','manager')
  )
);

drop policy if exists policy_documents_read on storage.objects;
create policy policy_documents_read on storage.objects
for select to authenticated
using (
  bucket_id = 'policy-documents'
  and public.current_user_role() in ('admin','manager')
);

-- operation-documents is private and has no authenticated storage.objects policy
-- in the inspected production state. This migration intentionally does not open it.
-- catalog-images and brand-assets are public marketing assets and are unchanged.

-- 6) Sales-specific functions remain intentionally available:
-- list_sellable_tour_departures(date,date) is a SECURITY DEFINER read projection
-- for booking availability; set_link_service_departures(uuid,jsonb) only assigns
-- an existing sellable departure to the seller's own quoted lead_service.
-- Neither grants direct SELECT/UPDATE on operational tables.
