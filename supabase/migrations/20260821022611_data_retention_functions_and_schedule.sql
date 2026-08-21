-- Retención de datos.
-- Plazos por defecto (ajustables): leads abandonados sin servicio asociado -> 12 meses;
-- conversaciones de IA -> 6 meses. Se anonimiza en vez de borrar registros con relaciones
-- (leads) para no romper integridad referencial ni reportes históricos; se elimina directo
-- en tablas sin relaciones aguas abajo relevantes (ai_conversations).

create or replace function public.apply_data_retention_policy()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads_anonymized int;
  v_ai_deleted int;
begin
  -- Leads sin servicio asociado, sin actividad hace más de 12 meses: se anonimiza el contacto.
  with target as (
    select l.id
    from public.leads l
    where l.updated_at < now() - interval '12 months'
      and not exists (select 1 from public.lead_services ls where ls.lead_id = l.id)
  )
  update public.leads l
  set contacto = '[eliminado por política de retención]',
      observaciones_cobros = null
  from target t
  where l.id = t.id
    and l.contacto is distinct from '[eliminado por política de retención]';
  get diagnostics v_leads_anonymized = row_count;

  -- Conversaciones de IA con más de 6 meses de antigüedad.
  delete from public.ai_conversations
  where created_at < now() - interval '6 months';
  get diagnostics v_ai_deleted = row_count;

  return jsonb_build_object(
    'ran_at', now(),
    'leads_anonymized', v_leads_anonymized,
    'ai_conversations_deleted', v_ai_deleted
  );
end;
$$;

comment on function public.apply_data_retention_policy() is
  'Aplica la política de retención de datos: anonimiza leads abandonados (>12m sin servicio) y elimina conversaciones de IA (>6m). Ajustar plazos según definición legal interna.';
