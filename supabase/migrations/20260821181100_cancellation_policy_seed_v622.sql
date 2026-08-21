-- HOTEL EXPERIENCE · Policy v1 seed
-- ALREADY APPLIED TO production. This file is repository history only.
-- Source SHA-256: 16b97c66de8ea536a7a3e809d187120c6b31639e3ea4e5fda6fdd79bbf7bfa38

insert into public.cancellation_legal_sources
(source_key,authority,title,url,legal_reference,relevance,checked_on,active)
values
('sernac_retracto_servicios','SERNAC','Derecho a retracto','https://www.sernac.cl/portal/617/w3-propertyvalue-64530.html','Ley 19.496 art. 3 bis','Contratos de servicios a distancia: retracto de 10 días antes de la prestación, salvo exclusión válida e informada por el proveedor.','2026-08-21',true),
('bcn_comercio_electronico_6','Biblioteca del Congreso Nacional','Decreto 6: Reglamento de Comercio Electrónico','https://www.bcn.cl/leychile/navegar?idNorma=1165504','Decreto 6, art. 14','La existencia o exclusión del retracto debe informarse de forma inequívoca, destacada, fácilmente accesible y antes de contratar/pagar.','2026-08-21',true),
('bcn_reglamento_retracto_52','Biblioteca del Congreso Nacional','Decreto 52: Reglamento sobre exclusiones al derecho a retracto','https://www.bcn.cl/leychile/navegar?idNorma=1206144','Decreto 52, arts. 5 y 6','En servicios contratados a distancia el retracto procede por 10 días y antes del inicio, salvo exclusión expresa e informada oportunamente conforme al reglamento.','2026-08-21',true),
('sernac_art_16','SERNAC','Ley 19.496, artículo 16','https://www.sernac.cl/portal/609/w3-propertyvalue-58716.html','Ley 19.496 art. 16','Cláusulas abusivas: no puede reservarse al proveedor una facultad arbitraria de modificar, suspender o dejar sin efecto el contrato, ni trasladar al consumidor errores no imputables.','2026-08-21',true),
('sernac_art_43','SERNAC','Artículo 43','https://www.sernac.cl/portal/609/w3-article-52769.html','Ley 19.496 art. 43','El intermediario responde directamente frente al consumidor por incumplimientos contractuales, sin perjuicio de repetir contra el prestador responsable.','2026-08-21',true),
('sernac_viajes','SERNAC','Consejos y derechos en viajes','https://www.sernac.cl/portal/618/w3-propertyvalue-21019.html','Ley 19.496','Los servicios turísticos deben cumplir lo informado y contratado, evitar cláusulas abusivas y respetar seguridad e información.','2026-08-21',true)
on conflict (source_key) do update set
authority=excluded.authority,title=excluded.title,url=excluded.url,legal_reference=excluded.legal_reference,
relevance=excluded.relevance,checked_on=excluded.checked_on,active=excluded.active,updated_at=now();

insert into public.cancellation_policies(
  policy_key,version,name,description,owner_type,jurisdiction,language,priority,is_default,status,
  effective_from,source_document_name,storage_bucket,storage_path,source_sha256,raw_text,
  normalized_summary,legal_review_status,legal_reviewed_at,legal_notes,scope_config,updated_at
) values (
  'HOTEL_EXPERIENCE_GENERAL',1,
  'Política de cancelación, cambios y reembolsos',
  'Política general para excursiones, programas de varios días y traslados. Versión 1.0, julio 2026.',
  'company','CL','es',100,true,'active','2026-07-01',
  'Politica_cancelacion_cambios_reembolsos(1).pdf','policy-documents',
  'company/hotel-experience/general/v1/politica_cancelacion_cambios_reembolsos_v1.pdf',
  '16b97c66de8ea536a7a3e809d187120c6b31639e3ea4e5fda6fdd79bbf7bfa38',
  $policy$POLÍTICA DE CANCELACIÓN, CAMBIOS Y REEMBOLSOS
Versión 1.0 | Julio 2026
Operaciones turísticas

Este documento establece las condiciones aplicables a cancelaciones, cambios, inasistencias, contingencias operativas y devoluciones relacionadas con servicios turísticos. Su objetivo es informar con claridad los plazos, porcentajes y responsabilidades de cada parte.

1. Alcance
Esta política aplica a excursiones, programas de varios días y traslados. Las condiciones especiales informadas por escrito en la cotización, confirmación de reserva o voucher prevalecerán sobre la política general.

2. Resumen de condiciones
Cancelación anticipada — 6 días o más — 100% de reembolso, menos costos no reembolsables.
Cancelación intermedia — Entre 5 días y más de 24 horas — 70% de reembolso.
Cancelación tardía — Menos de 24 horas — Sin reembolso del servicio afectado.
Enfermedad — Certificado médico válido — 80% en tours regulares, salvo exclusiones.
Inasistencia — No presentación en horario y lugar informados — Sin reembolso; un nuevo servicio se cobra por separado.

3. Cancelaciones generales
• Con 6 días o más de anticipación: reembolso del 100%, descontando entradas, permisos, reservas o servicios de terceros ya emitidos y no reembolsables.
• Entre 5 días y más de 24 horas antes del servicio: reembolso del 70%.
• Con menos de 24 horas de anticipación: no corresponde reembolso del servicio afectado.
• En programas de varios días, los servicios posteriores podrán acceder a un reembolso de hasta el 80% únicamente cuando todavía sea posible cancelarlos con los respectivos proveedores.

4. Cambios y reprogramaciones
• Solicitudes realizadas con 6 días o más de anticipación: sin penalidad, sujetas a disponibilidad.
• Solicitudes realizadas entre 5 días y 24 horas antes del servicio: sujetas a disponibilidad y a una penalidad de hasta el 30%.
• Solicitudes realizadas con menos de 24 horas: se considerarán cancelación y nueva reserva.

5. Inasistencia y retrasos
• Si el pasajero no se presenta en el horario y punto informados, el servicio se considerará utilizado y no habrá reembolso.
• Una nueva recogida, salida, excursión o traslado se cobrará como un servicio nuevo.
• El pasajero debe considerar el tiempo necesario para presentarse puntualmente y seguir las instrucciones operativas entregadas antes de la actividad.

6. Enfermedad
• En tours regulares, la cancelación por enfermedad podrá acceder a un reembolso del 80% cuando se presente un certificado médico válido.
• El certificado deberá corresponder al período inmediatamente anterior al servicio o al día de su realización y ser presentado antes del inicio de la actividad o tan pronto como sea razonablemente posible.
• Esta excepción no aplica a servicios expresamente informados como no reembolsables ni a productos con condiciones especiales, incluyendo alta montaña, Uyuni, globo aerostático y experiencias ancestrales.

7. Clima, cierres y contingencias operativas
• Si una ruta, parque o atractivo no puede operar antes de la salida por condiciones climáticas, restricciones de acceso, cierres de ruta u otras causas externas, se intentará primero reprogramar la experiencia.
• Si la reprogramación no es posible, se ofrecerá una ruta o experiencia alternativa de valor y características equivalentes.
• Si el pasajero rechaza la alternativa propuesta, podrá aplicarse un reembolso de hasta el 50%, según los costos ya comprometidos y las condiciones del proveedor.
• Una vez iniciada la operación, no habrá reembolso, salvo que el proveedor autorice expresamente una devolución proporcional.
• Cuando la salida del vehículo o la activación de recursos operativos genere costos irreversibles, podrá aplicarse un cargo mínimo del 50%.

8. Entradas, permisos y servicios de terceros
• Las entradas, permisos, tickets, reservas y otros costos de terceros ya emitidos no son reembolsables.
• Las actividades operadas por terceros pueden tener condiciones particulares. Cuando estas hayan sido informadas antes de confirmar la reserva, prevalecerán sobre la política general.
• Cualquier diferencia de precio producida por cambios de tarifas de entradas o servicios de terceros será informada antes de la operación y deberá ser cubierta por el pasajero cuando corresponda.

9. Condiciones especiales por tipo de servicio
• Alta montaña y Uyuni: cancelando con más de 24 horas de anticipación corresponde un reembolso del 100%. Con menos de 24 horas, no hay reembolso. No aplica excepción médica.
• Globo aerostático, experiencias ancestrales y otros servicios informados como no reembolsables: una vez confirmados y pagados, no admiten devolución.
• Transfers: los cambios deben solicitarse con al menos 5 horas de anticipación. Si el pasajero no se presenta una vez concluido el desembarque o en el horario confirmado, el traslado se considerará utilizado.

10. Devoluciones
• Las devoluciones aprobadas se procesarán dentro de un plazo máximo de 10 días desde su confirmación.
• Toda devolución se realizará descontando entradas, permisos, costos no reembolsables, comisiones externas y diferencias de cambio, cuando corresponda.
• La devolución se efectuará, siempre que sea posible, mediante el mismo medio utilizado para el pago original.

11. Seguridad y cumplimiento
• No habrá reembolso si el pasajero pierde el servicio por incumplimiento de horarios, normas de seguridad, reglas de parques o instrucciones del equipo operativo.
• Se podrá negar o interrumpir la participación de una persona cuya conducta ponga en riesgo su seguridad, la del grupo, la operación o el entorno.
• No se permitirá participar bajo los efectos del alcohol, drogas o sustancias que comprometan la seguridad. En estos casos, el servicio se considerará utilizado y no habrá devolución.

12. Aplicación de condiciones particulares
• Las condiciones específicas de cada producto deberán quedar informadas en la cotización, confirmación de reserva o voucher.
• Cuando exista una diferencia entre esta política general y una condición especial previamente informada, se aplicará la condición especial.
• La confirmación y pago de la reserva supone el conocimiento y aceptación de estas condiciones.$policy$,
  'Regla general: ≥6 días, 100% menos costos efectivamente no reembolsables; entre >24 h y <6 días, 70%; <24 h, sin reembolso. Enfermedad con certificado: 80% en tours regulares, con exclusiones. No-show: sin reembolso. Reprogramaciones: sin penalidad ≥6 días; hasta 30% entre >24 h y <6 días; <24 h se trata como cancelación y nueva reserva. Clima: primero reprogramar, luego alternativa equivalente; los resultados económicos quedan sujetos a costos comprometidos y revisión. Alta montaña/Uyuni y servicios no reembolsables tienen condiciones especiales. Transfers requieren cambios ≥5 h. Devoluciones aprobadas: hasta 10 días.',
  'needs_changes',now(),
  'Revisión preliminar de cumplimiento SERNAC/Ley 19.496. Requieren control legal antes de automatizar: retracto en contratación a distancia y su exclusión expresa; límites de reembolso por clima; prohibiciones absolutas de reembolso; descuentos de comisiones/cambio; aceptación por pago; y responsabilidad directa del intermediario frente al consumidor.',
  jsonb_build_object(
    'applies_to',jsonb_build_array('excursions','multi_day_programs','transfers'),
    'special_terms_precedence',true,'source_version','1.0','source_date','2026-07',
    'legal_review_basis',jsonb_build_array('Ley 19.496 art. 3 bis','Ley 19.496 art. 12','Ley 19.496 art. 16','Ley 19.496 art. 43','Decreto 6/2021 art. 14')
  ),now()
)
on conflict (policy_key,version) do update set
name=excluded.name,description=excluded.description,status=excluded.status,effective_from=excluded.effective_from,
source_document_name=excluded.source_document_name,storage_bucket=excluded.storage_bucket,
storage_path=excluded.storage_path,source_sha256=excluded.source_sha256,raw_text=excluded.raw_text,
normalized_summary=excluded.normalized_summary,legal_review_status=excluded.legal_review_status,
legal_reviewed_at=excluded.legal_reviewed_at,legal_notes=excluded.legal_notes,
scope_config=excluded.scope_config,updated_at=now();

-- Rule rows are intentionally structured for the CRM.
-- Legal-sensitive clauses remain case_by_case instead of being auto-applied.
with p as (
  select id from public.cancellation_policies
  where policy_key='HOTEL_EXPERIENCE_GENERAL' and version=1
)
insert into public.cancellation_policy_rules
(policy_id,rule_code,event_type,applies_to,min_hours_before,max_hours_before,refund_percent,penalty_percent,action_type,evidence_required,evidence_type,conditions,customer_text,internal_notes,priority)
select p.id,v.rule_code,v.event_type,v.applies_to,v.min_h,v.max_h,v.refund,v.penalty,v.action_type,v.evidence_required,v.evidence_type,v.conditions,v.customer_text,v.internal_notes,v.priority
from p cross join (values
('CANCEL_6D_PLUS','customer_cancellation','service',144::numeric,null::numeric,100::numeric,null::numeric,'refund',false,null::text,'{"source_section":"3","deduct_actual_nonrefundable_third_party_costs":true,"legal_review":"aligned_with_conditions"}'::jsonb,'Con 6 días o más de anticipación: reembolso del 100%, descontando entradas, permisos, reservas o servicios de terceros ya emitidos y no reembolsables.','Aplicar descuentos solo a costos efectivamente emitidos/no recuperables y previamente informados.',10),
('CANCEL_24H_TO_5D','customer_cancellation','service',24::numeric,144::numeric,70::numeric,null::numeric,'partial_refund',false,null::text,'{"source_section":"3","normalized_window_note":"Interpretado como >24 h y <6 días para evitar una ventana sin regla entre los tramos declarados."}'::jsonb,'Entre 5 días y más de 24 horas antes del servicio: reembolso del 70%.',null,20),
('CANCEL_LT_24H','customer_cancellation','service',0::numeric,24::numeric,0::numeric,null::numeric,'no_refund',false,null::text,'{"source_section":"3","customer_initiated_only":true}'::jsonb,'Con menos de 24 horas de anticipación: no corresponde reembolso del servicio afectado.','No aplicar para incumplimiento/cancelación imputable al proveedor o cuando una norma imperativa disponga otra solución.',30),
('MULTIDAY_FUTURE_SERVICES','customer_cancellation','package',null::numeric,null::numeric,80::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"3","maximum_refund_percent":80,"requires_supplier_cancellable":true}'::jsonb,'En programas de varios días, los servicios posteriores podrán acceder a un reembolso de hasta el 80% únicamente cuando todavía sea posible cancelarlos con los respectivos proveedores.','No automatizar: verificar recuperabilidad real por cada componente.',40),
('RESCHEDULE_6D_PLUS','reschedule','service',144::numeric,null::numeric,null::numeric,0::numeric,'reschedule',false,null::text,'{"source_section":"4","subject_to_availability":true}'::jsonb,'Solicitudes realizadas con 6 días o más de anticipación: sin penalidad, sujetas a disponibilidad.',null,10),
('RESCHEDULE_24H_TO_5D','reschedule','service',24::numeric,144::numeric,null::numeric,30::numeric,'reschedule',false,null::text,'{"source_section":"4","subject_to_availability":true,"maximum_penalty_percent":30,"normalized_window_note":"Interpretado como >24 h y <6 días para evitar una ventana sin regla entre los tramos declarados."}'::jsonb,'Solicitudes realizadas entre 5 días y 24 horas antes del servicio: sujetas a disponibilidad y a una penalidad de hasta el 30%.','La penalidad debe reflejar costos/condiciones previamente informadas; no asumir siempre 30%.',20),
('RESCHEDULE_LT_24H','reschedule','service',0::numeric,24::numeric,0::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"4","treat_as_new_booking":true}'::jsonb,'Solicitudes realizadas con menos de 24 horas: se considerarán cancelación y nueva reserva.',null,30),
('NO_SHOW','no_show','service',null::numeric,null::numeric,0::numeric,null::numeric,'no_refund',false,null::text,'{"source_section":"5","requires_confirmed_time_and_place":true}'::jsonb,'Si el pasajero no se presenta en el horario y punto informados, el servicio se considerará utilizado y no habrá reembolso.','Debe existir constancia de horario/punto informados y ausencia imputable al pasajero.',10),
('LATE_ARRIVAL','late_arrival','service',null::numeric,null::numeric,0::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"5","new_pickup_charged_separately":true}'::jsonb,'Una nueva recogida, salida, excursión o traslado se cobrará como un servicio nuevo.',null,20),
('ILLNESS_REGULAR','illness','service',null::numeric,null::numeric,80::numeric,null::numeric,'partial_refund',true,'medical_certificate','{"source_section":"6","regular_tours_only":true,"excluded_families":["alta_montana","uyuni","globo_aerostatico","experiencias_ancestrales"]}'::jsonb,'En tours regulares, la cancelación por enfermedad podrá acceder a un reembolso del 80% cuando se presente un certificado médico válido.',null,10),
('WEATHER_RESCHEDULE_FIRST','weather','service',null::numeric,null::numeric,null::numeric,null::numeric,'reschedule',false,null::text,'{"source_section":"7","first_option":true,"external_cause_required":true}'::jsonb,'Si una ruta, parque o atractivo no puede operar antes de la salida por condiciones climáticas, restricciones de acceso, cierres de ruta u otras causas externas, se intentará primero reprogramar la experiencia.',null,10),
('WEATHER_EQUIVALENT_SUBSTITUTION','substitution','service',null::numeric,null::numeric,null::numeric,null::numeric,'substitution',false,null::text,'{"source_section":"7","requires_equivalent_value_and_characteristics":true}'::jsonb,'Si la reprogramación no es posible, se ofrecerá una ruta o experiencia alternativa de valor y características equivalentes.','La equivalencia debe poder justificarse y la alternativa debe ser informada al pasajero.',20),
('WEATHER_REJECT_ALTERNATIVE','weather','service',null::numeric,null::numeric,50::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"7","maximum_refund_percent":50,"legal_review":"needs_changes","depends_on_actual_committed_costs":true}'::jsonb,'Si el pasajero rechaza la alternativa propuesta, podrá aplicarse un reembolso de hasta el 50%, según los costos ya comprometidos y las condiciones del proveedor.','NO automatizar. Revisar causa, equivalencia, costos reales y derechos legales.',30),
('OPERATION_STARTED_CONTINGENCY','partial_service','service',null::numeric,null::numeric,null::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"7","legal_review":"needs_changes","operation_started":true}'::jsonb,'Una vez iniciada la operación, no habrá reembolso, salvo que el proveedor autorice expresamente una devolución proporcional.','NO automatizar. No puede excluir remedios por incumplimiento, servicio defectuoso o causa imputable al proveedor.',40),
('IRREVERSIBLE_RESOURCES','force_majeure','service',null::numeric,null::numeric,null::numeric,50::numeric,'case_by_case',false,null::text,'{"source_section":"7","minimum_charge_percent":50,"legal_review":"needs_changes","requires_documented_irreversible_costs":true}'::jsonb,'Cuando la salida del vehículo o la activación de recursos operativos genere costos irreversibles, podrá aplicarse un cargo mínimo del 50%.','NO automatizar. El cargo debe justificarse con costos efectivamente comprometidos.',50),
('THIRD_PARTY_NONREFUNDABLE','other','service',null::numeric,null::numeric,null::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"8","actual_issued_and_nonrecoverable_only":true}'::jsonb,'Las entradas, permisos, tickets, reservas y otros costos de terceros ya emitidos no son reembolsables.','Aplicar solo a importes realmente emitidos/no recuperables y previamente informados.',60),
('HIGH_MOUNTAIN_UYUNI_GT_24','customer_cancellation','service',24::numeric,null::numeric,100::numeric,null::numeric,'refund',false,null::text,'{"source_section":"9","product_families":["alta_montana","uyuni"],"illness_exception":false}'::jsonb,'Alta montaña y Uyuni: cancelando con más de 24 horas de anticipación corresponde un reembolso del 100%.',null,5),
('HIGH_MOUNTAIN_UYUNI_LT_24','customer_cancellation','service',0::numeric,24::numeric,0::numeric,null::numeric,'no_refund',false,null::text,'{"source_section":"9","product_families":["alta_montana","uyuni"],"illness_exception":false,"customer_initiated_only":true}'::jsonb,'Alta montaña y Uyuni: con menos de 24 horas, no hay reembolso. No aplica excepción médica.',null,6),
('NONREFUNDABLE_SPECIAL','customer_cancellation','service',null::numeric,null::numeric,0::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"9","product_families":["globo_aerostatico","experiencias_ancestrales"],"requires_precontract_disclosure":true,"legal_review":"needs_changes","customer_initiated_only":true}'::jsonb,'Globo aerostático, experiencias ancestrales y otros servicios informados como no reembolsables: una vez confirmados y pagados, no admiten devolución.','NO automatizar como prohibición absoluta; debe respetar derechos legales e incumplimientos del proveedor.',7),
('TRANSFER_RESCHEDULE','reschedule','service',5::numeric,null::numeric,null::numeric,null::numeric,'reschedule',false,null::text,'{"source_section":"9","product_family":"transfer","minimum_notice_hours":5}'::jsonb,'Transfers: los cambios deben solicitarse con al menos 5 horas de anticipación.',null,5),
('TRANSFER_NO_SHOW','no_show','service',null::numeric,null::numeric,0::numeric,null::numeric,'no_refund',false,null::text,'{"source_section":"9","product_family":"transfer","requires_confirmed_pickup":true}'::jsonb,'Si el pasajero no se presenta una vez concluido el desembarque o en el horario confirmado, el traslado se considerará utilizado.',null,6),
('REFUND_PROCESSING','other','reservation',null::numeric,null::numeric,null::numeric,null::numeric,'case_by_case',false,null::text,'{"source_section":"10","processing_max_days":10,"prefer_original_payment_method":true,"deductions_require_validation":true}'::jsonb,'Las devoluciones aprobadas se procesarán dentro de un plazo máximo de 10 días desde su confirmación y, siempre que sea posible, mediante el mismo medio utilizado para el pago original.','Comisiones externas/diferencias de cambio no deben descontarse cuando una norma o incumplimiento del proveedor obligue a devolución íntegra.',70),
('SAFETY_BREACH','other','service',null::numeric,null::numeric,0::numeric,null::numeric,'no_refund',true,'incident_record','{"source_section":"11","customer_safety_breach_required":true}'::jsonb,'No habrá reembolso si el pasajero pierde el servicio por incumplimiento de horarios, normas de seguridad, reglas de parques o instrucciones del equipo operativo.','Documentar regla informada e incumplimiento imputable al pasajero.',80),
('INTOXICATION_SAFETY','other','service',null::numeric,null::numeric,0::numeric,null::numeric,'no_refund',true,'incident_record','{"source_section":"11","intoxication_or_impairment":true,"safety_risk_required":true}'::jsonb,'No se permitirá participar bajo los efectos del alcohol, drogas o sustancias que comprometan la seguridad. En estos casos, el servicio se considerará utilizado y no habrá devolución.','Documentar hecho/riesgo y aplicar de forma proporcional.',81)
) as v(rule_code,event_type,applies_to,min_h,max_h,refund,penalty,action_type,evidence_required,evidence_type,conditions,customer_text,internal_notes,priority)
on conflict (policy_id,rule_code) do update set
event_type=excluded.event_type,applies_to=excluded.applies_to,min_hours_before=excluded.min_hours_before,
max_hours_before=excluded.max_hours_before,refund_percent=excluded.refund_percent,
penalty_percent=excluded.penalty_percent,action_type=excluded.action_type,
evidence_required=excluded.evidence_required,evidence_type=excluded.evidence_type,
conditions=excluded.conditions,customer_text=excluded.customer_text,internal_notes=excluded.internal_notes,
priority=excluded.priority,active=true,updated_at=now();
