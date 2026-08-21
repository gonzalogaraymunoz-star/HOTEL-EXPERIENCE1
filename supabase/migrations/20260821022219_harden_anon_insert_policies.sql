-- 1) 'leads': mantenemos el insert público (formulario de cotización) pero evitamos que un visitante
-- anónimo pueda fijar campos internos de asignación/gestión (created_by, assigned_to). Deben quedar
-- nulos al crearse por esta vía; un agente/admin los asigna después.
drop policy if exists "leads_public_insert" on public.leads;

create policy "leads_public_insert"
on public.leads
for insert
to anon
with check (
  created_by is null
  and assigned_to is null
);

-- 2) 'lead_services': mismo criterio, evitar que el público fije estado_pago/estado_operacion
-- distintos del valor por defecto ('Pendiente'), y que el lead_id referenciado exista (ya lo exige el FK).
drop policy if exists "lead_services_public_insert" on public.lead_services;

create policy "lead_services_public_insert"
on public.lead_services
for insert
to anon
with check (
  estado_pago = 'Pendiente'
  and estado_operacion = 'Pendiente'
);

-- 3) 'crm_activities': se retira el insert anónimo. No hay caso de uso identificado para que un
-- visitante no autenticado escriba directamente en el registro de actividad interno del CRM.
drop policy if exists "crm_activities_public_insert" on public.crm_activities;
