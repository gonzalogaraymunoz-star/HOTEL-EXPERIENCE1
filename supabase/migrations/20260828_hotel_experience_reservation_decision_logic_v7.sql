alter table public.leads
  add column if not exists acquisition_prefix text,
  add column if not exists commercial_status text,
  add column if not exists next_best_action text,
  add column if not exists opportunity_score integer;

alter table public.lead_services
  add column if not exists idioma text,
  add column if not exists hora_inicio time,
  add column if not exists hora_fin time,
  add column if not exists duracion_texto text,
  add column if not exists precio_unitario numeric,
  add column if not exists precio_total numeric,
  add column if not exists costo_operador_total numeric,
  add column if not exists margen_comercial numeric,
  add column if not exists comision_hotel numeric,
  add column if not exists comision_vendedor numeric,
  add column if not exists margen_hotel_experience numeric,
  add column if not exists afecto numeric,
  add column if not exists exento numeric,
  add column if not exists iva numeric,
  add column if not exists total_facturable numeric,
  add column if not exists horario_confirmado boolean not null default false,
  add column if not exists requiere_confirmacion boolean not null default false,
  add column if not exists modificable_por_clima boolean not null default false,
  add column if not exists responsable_dato_vuelo text,
  add column if not exists ultima_confirmacion_at timestamptz;

create index if not exists idx_leads_commercial_status on public.leads(commercial_status);
create index if not exists idx_lead_services_date on public.lead_services(fecha_servicio);
create index if not exists idx_lead_services_booking_status on public.lead_services(booking_status);

comment on column public.leads.opportunity_score is 'Score interno de oportunidad comercial; no implica venta ni disponibilidad real.';
comment on column public.leads.next_best_action is 'Siguiente acción comercial recomendada por reglas CRM; requiere validación humana cuando corresponda.';
comment on column public.lead_services.precio_unitario is 'Precio comercial por pasajero para esta línea de servicio.';
comment on column public.lead_services.precio_total is 'Precio comercial total de esta línea de servicio.';
comment on column public.lead_services.costo_operador_total is 'Costo operacional total del servicio; separado del margen comercial.';
comment on column public.lead_services.margen_comercial is 'Precio total menos costo operacional, antes de distribución de comisiones.';
