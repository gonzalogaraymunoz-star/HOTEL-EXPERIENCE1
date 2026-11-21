# Draft: agent solo Ventas; Operaciones admin/manager

Estado: propuesta en PR Draft. No aplicar a producción todavía.

## Fuente de verdad revisada

Proyecto Supabase operativo: `lpirjwifzosdzgdncsbt` (Postgres 17.6.1, estado ACTIVE_HEALTHY). Revisión de solo lectura de `pg_policies`, definición de `current_user_role()`, columnas de documentos, buckets y registro de migraciones.

- `current_user_role()` es `SECURITY DEFINER` y devuelve `profiles.role` si `id = auth.uid()` y `is_active = true`. No hace autorización por aplicación ni por módulo.
- El registro remoto identifica la migración v6 como `20260820222500_hotel_experience_v6_operations_pricing`; el repositorio conserva el archivo fuente `20260820_hotel_experience_v6.sql`.
- La migración `20260915180539_harden_tour_departure_rls.sql` está aplicada y sus políticas actuales coinciden con el patrón revisado.
- La contención temporal `profiles.is_active=false` no se modifica. Debe mantenerse hasta que el cambio se aplique y supere todas las pruebas.

## Cambio propuesto

### 1. Gate de la aplicación Operaciones

En `src/App.tsx`, después de validar que el perfil existe y está activo, se permite renderizar `OperationsApp` y `PendingClientTasks scope="operations"` únicamente si `profile.role` es `admin` o `manager`. Agent y cualquier rol desconocido reciben una pantalla de acceso restringido y no se monta la aplicación operacional.

La ruta pública neutral `/catalogo` queda fuera del gate, como ya estaba. No se usa ocultación de menú como control de seguridad.

### 2. RLS de lectura operacional

La migración restringe a `current_user_role() in ('admin','manager')` las lecturas de:

- `app_addons`
- `cancellation_cases`, `cancellation_legal_sources`, `cancellation_policies`, `cancellation_policy_rules`
- `data_imports`, `data_import_items`
- `financial_reconciliations`, `payment_movements`
- `operational_resources`, `service_assignments`, `service_resource_assignments`
- `service_closures`, `service_commissions`, `service_cost_items`, `service_people`, `service_policy_snapshots`
- `supplier_rates`, `suppliers`, `vehicles`
- `operation_list_catalog`, `product_operation_list_templates`
- `tour_departures`, `tour_departure_resources`, `tour_departure_notes`, `tour_food_segments`, `tour_food_passengers`
- `traffic_financial_reconciliations`, `traffic_service_rows`
- `operational_entity_documents`
- `review_cases` y `link_form_runs` dejan de ser lecturas globales: admin/manager conservan lectura completa; agent solo accede a registros asociados a sus propios leads/servicios.

La vista `operation_food_board` ya está definida con `security_invoker = true`; por ello sus consultas quedan sometidas a las políticas de las tablas subyacentes. No se modifica la vista.

### 3. Ventas conserva acceso comercial acotado

No se cambian las políticas de `leads` ni `lead_services`.

Se conserva el acceso de agent a sus propios leads (creados por él o asignados a él) para:
- `passengers` (la política existente ya aplica este alcance).
- `lead_service_passengers` (la política global de agent se sustituye por una condición de pertenencia al lead).
- `reservation_documents` y `reservation_document_versions`, únicamente para los tipos comerciales observados en producción: `evidence_quote`, `evidence_quote_draft`, `evidence_itinerary`, `evidence_chat`. La misma condición se aplica a insert/update de esos documentos comerciales.

Los tipos `risk_sheet` y `operation_list` observados en `reservation_documents` no se exponen a agent. Los registros de `operational_entity_documents` quedan solo para admin/manager. `review_cases` y `link_form_runs` se conservan como funciones de seguimiento/formularios comerciales, pero agent solo puede leer los vinculados a sus propios leads o servicios.

Se conserva `service_policy_snapshots` únicamente cuando corresponde a un `lead_service` cuyo lead pertenece al agente; no se deja lectura/escritura global.

### 4. Revisión específica de 20260915180539

Esta migración mezcló lecturas generales con escrituras de agent:

| Política / tabla | Decisión del borrador | Motivo |
|---|---|---|
| `tour_departures_auth_read` | Solo admin/manager | La tabla contiene el registro operacional completo. Ventas obtiene disponibilidad mediante la RPC específica. |
| `tour_departure_resources_read` | Solo admin/manager | Asignaciones de recursos y cumplimiento son Operaciones. |
| `tour_departure_notes_read` | Solo admin/manager | Las notas operacionales no se exponen como tabla. |
| `tour_departures_auth_insert/update` | Solo admin/manager | Agent no crea ni edita salidas operacionales directamente. |
| `tour_departure_resources_insert/update/delete` | Solo admin/manager | Agent no asigna ni modifica recursos de una salida. |
| `tour_departure_notes_insert` | Admin/manager; agent solo `source='sales'` y `created_by=auth.uid()` | Conserva la nota comercial usada por el flujo de Ventas, pero no permite notas de origen `operations` o `system`. |
| `tour_departure_resources_delete` | Solo admin/manager | La política original también incluía agent; se cierra la escritura operacional. |

Se mantienen disponibles para Ventas las funciones específicas ya existentes:
- `list_sellable_tour_departures(date,date)`: proyección de disponibilidad, autorizada para agent y con salida comercial acotada.
- `set_link_service_departures(uuid,jsonb)`: permite vincular una salida existente a servicios cotizados del lead propio; no concede UPDATE directo sobre `tour_departures`.

La función de trigger `normalize_booking_inventory()` que crea/valida salidas durante el flujo de reserva es SECURITY DEFINER. Su funcionamiento deberá comprobarse en staging tras restringir las políticas directas.

### 5. Escrituras operacionales

Para que la exclusividad no dependa únicamente de la interfaz, se retira agent de las políticas de escritura de operaciones para cancelaciones, pagos operacionales, asignaciones, recursos, cierres, comisiones, costos, alimentación y conciliaciones. Las políticas de admin/manager permanecen habilitadas.

Se preservan las escrituras de agent en las entidades comerciales descritas arriba y la inserción de notas de origen `sales`. No se modifican las políticas de `leads` ni `lead_services`.

### 6. Storage, Drive y enlaces

Estado observado:
- `operational-files`: bucket privado; su política de lectura actual solo exige perfil activo. El borrador la restringe a admin/manager.
- `policy-documents`: bucket privado; su política de lectura actual acepta cualquier rol activo. El borrador la restringe a admin/manager.
- `operation-documents`: bucket privado sin política autenticada sobre `storage.objects` en el estado consultado. Se mantiene cerrado; no se crea una nueva vía de lectura.
- `catalog-images` y `brand-assets`: buckets públicos de activos de catálogo/marca; no se modifican.
- Los enlaces Drive almacenados en `reservation_documents` / `reservation_document_versions` solo se exponen al agente para documentos comerciales de su propio lead. Los documentos de riesgo/listas operacionales quedan fuera.
- Las URLs externas no se protegen con RLS de Supabase una vez copiadas. Drive aplica sus propios permisos y ACL.

**Riesgo residual que bloquea la activación:** `leads` contiene `reservation_drive_folder_url` y la política de lectura de leads se conserva intacta por requerimiento. Un agente puede recuperar esa URL para un lead propio. RLS por fila no puede ocultar esa columna sin cambiar el modelo de privilegios/proyección. Antes de activar agentes, confirmar que las carpetas Drive accesibles desde Ventas no contienen documentos operacionales restringidos y que sus ACL son correctas. Si comparten archivos de Operaciones, se necesita una solución separada de permisos/estructura Drive; este PR no puede afirmar que la ACL externa quedó cubierta.

## Matriz de pruebas requerida (staging)

Usar cuentas de prueba independientes con perfiles activos admin, manager y agent. No probar con datos personales de producción.

| Prueba | admin | manager | agent |
|---|---:|---:|---:|
| Abrir aplicación Operaciones | Permitir | Permitir | Bloquear antes de montar OperationsApp |
| SELECT directo a tablas operacionales listadas | Permitir | Permitir | Denegar / 0 filas |
| INSERT/UPDATE/DELETE de recursos operacionales | Según política vigente | Según política vigente | Denegar |
| Consultar disponibilidad con `list_sellable_tour_departures` | Permitir | Permitir | Permitir |
| Asignar salida a lead propio con `set_link_service_departures` | Permitir | Permitir | Permitir |
| Leer/editar lead propio en Ventas | Permitir | Permitir | Permitir |
| Leer lead de otro agente | Permitir | Permitir | Denegar |
| Leer pasajeros y vínculos de lead propio | Permitir | Permitir | Permitir |
| Leer quote/itinerary/evidence de lead propio | Permitir | Permitir | Permitir |
| Leer `risk_sheet`, `operation_list` o `operational_entity_documents` | Permitir | Permitir | Denegar |
| Leer `operational-files` / `policy-documents` en Storage | Permitir | Permitir | Denegar |
| Leer `operation-documents` directamente desde Storage | Según política/servicio actual | Según política/servicio actual | Denegar |
| Insertar nota de salida con `source='sales'` y propio `created_by` | Permitir | Permitir | Permitir |
| Insertar nota con `source='operations'` o `system` como agent | — | — | Denegar |
| Leer nota operacional directamente | Permitir | Permitir | Denegar |

Comprobar además:
1. La reserva comercial que activa el trigger puede seguir generando/vinculando la salida sin UPDATE directo del agent.
2. No se rompen la cotización, documentos comerciales, pasajeros, enlaces, ni las tareas de Ventas.
3. Las llamadas REST directas (no solo la UI) respetan RLS.
4. Un agente no puede obtener signed URLs operacionales por un endpoint/Edge Function privilegiado. Auditar todos los generadores de URLs antes de liberar.
5. Verificar ACL de Drive y el riesgo `reservation_drive_folder_url` señalado arriba.

## Rollback

1. Mantener `profiles.is_active=false` para el agente durante toda la reversión; no reactivar mientras existan dudas.
2. Si falla el gate, revertir el commit de `src/App.tsx` o desplegar el último artefacto de Operaciones aprobado.
3. Si falla la migración en staging o tras una aplicación autorizada, revertir cada política modificada a la definición previa registrada en la revisión previa a la aplicación (snapshot de `pg_policies` y definiciones en este PR). No usar un `DROP POLICY` aislado que deje tablas sin política accidentalmente.
4. Verificar de nuevo `pg_policies`, pruebas de roles y accesos Storage tras el rollback.
5. La contención `is_active=false` se retira solo después de que el estado final haya sido probado y aprobado por el dueño.

No se aplicó SQL a Supabase, no se cambió ningún perfil y no se desplegó código. Esta migración es un artefacto de propuesta, no una ejecución.
