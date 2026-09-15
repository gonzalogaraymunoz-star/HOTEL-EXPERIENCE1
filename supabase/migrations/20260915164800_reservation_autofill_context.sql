create or replace function public.get_reservation_autofill_context(p_lead_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'lead', to_jsonb(l),
    'hotel', case when h.id is null then null else to_jsonb(h) end,
    'passengers', coalesce((
      select jsonb_agg(to_jsonb(p) order by p.is_primary desc, p.created_at, p.passenger_code)
      from public.passengers p
      where p.lead_id = l.id
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'service', to_jsonb(ls),
          'product', case when pc.id is null then null else to_jsonb(pc) end,
          'departure', case when td.id is null then null else to_jsonb(td) end,
          'assignment', case when sa.id is null then null else to_jsonb(sa) end,
          'participant_ids', coalesce((
            select jsonb_agg(lsp.passenger_id order by lsp.position)
            from public.lead_service_passengers lsp
            where lsp.lead_service_id = ls.id
          ), '[]'::jsonb),
          'resolved_operation', jsonb_build_object(
            'supplier_id', coalesce(sa.supplier_id, ls.proposed_supplier_id),
            'pickup_time', coalesce(sa.pickup_time, ls.hora_inicio, td.start_time),
            'meeting_point', coalesce(nullif(sa.meeting_point, ''), nullif(l.pickup_location, '')),
            'supplier_cost', coalesce(nullif(sa.supplier_cost, 0), ls.costo_operador_total, 0),
            'operation_mode', coalesce(
              sa.operation_mode,
              case
                when coalesce(sa.supplier_id, ls.proposed_supplier_id) is not null then 'delegated_full'
                else 'direct'
              end
            ),
            'supplier_coverage', coalesce(sa.supplier_coverage, '[]'::jsonb)
          )
        )
        order by ls.fecha_servicio nulls last, ls.created_at
      )
      from public.lead_services ls
      left join public.product_catalog pc on pc.id = ls.product_catalog_id
      left join public.tour_departures td on td.id = ls.departure_id
      left join public.service_assignments sa on sa.lead_service_id = ls.id
      where ls.lead_id = l.id
    ), '[]'::jsonb)
  )
  from public.leads l
  left join public.hotel_partners h on h.id = l.hotel_partner_id
  where l.id = p_lead_id;
$$;

revoke all on function public.get_reservation_autofill_context(uuid) from public;
revoke all on function public.get_reservation_autofill_context(uuid) from anon;
grant execute on function public.get_reservation_autofill_context(uuid) to authenticated;
grant execute on function public.get_reservation_autofill_context(uuid) to service_role;

comment on function public.get_reservation_autofill_context(uuid) is
'Canonical read model for shared Hotel Experience autofill. Returns lead, hotel, passengers, services, product/departure/assignment context and resolved operational defaults without duplicating source data.';
