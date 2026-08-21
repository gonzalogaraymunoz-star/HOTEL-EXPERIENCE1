-- Mismo criterio para UPDATE e INSERT: admin/manager sin restricción; agent solo sobre pasajeros
-- de leads que creó o tiene asignados. Evita que un agente edite/inserte datos sensibles (notas médicas,
-- N° de documento) de pasajeros que no le corresponden.

drop policy if exists "ops_passengers_update" on public.passengers;

create policy "ops_passengers_update"
on public.passengers
for update
to authenticated
using (
  current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text])
  or exists (
    select 1 from public.leads l
    where l.id = passengers.lead_id
      and current_user_role() = 'agent'::text
      and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
  )
)
with check (
  current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text])
  or exists (
    select 1 from public.leads l
    where l.id = passengers.lead_id
      and current_user_role() = 'agent'::text
      and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
  )
);

drop policy if exists "ops_passengers_insert" on public.passengers;

create policy "ops_passengers_insert"
on public.passengers
for insert
to authenticated
with check (
  current_user_role() = ANY (ARRAY['admin'::text, 'manager'::text])
  or exists (
    select 1 from public.leads l
    where l.id = passengers.lead_id
      and current_user_role() = 'agent'::text
      and (l.created_by = auth.uid() or l.assigned_to = auth.uid())
  )
);
