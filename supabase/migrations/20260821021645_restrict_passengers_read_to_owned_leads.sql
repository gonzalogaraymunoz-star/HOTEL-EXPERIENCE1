-- Reemplaza el acceso amplio de lectura a 'passengers' (cualquier rol autenticado veía TODOS los pasajeros,
-- incluyendo notas médicas y N° de documento) por un acceso restringido al mismo patrón usado en 'leads'/'lead_services':
-- admin/manager/viewer ven todo; agent solo ve pasajeros de leads que creó o tiene asignados.

drop policy if exists "ops_passengers_read" on public.passengers;

create policy "ops_passengers_read"
on public.passengers
for select
to authenticated
using (
  current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text, 'viewer'::text])
  or exists (
    select 1
    from public.leads l
    where l.id = passengers.lead_id
      and current_user_role() = 'agent'::text
      and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
  )
);
