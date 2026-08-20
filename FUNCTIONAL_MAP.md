# HOTEL EXPERIENCE V6 — MAPA FUNCIONAL

## Acceso
- Login email/contraseña conectado a Supabase Auth.
- Sesión persistente y refresh de token.
- Roles: admin, manager, agent, viewer.
- Equipo = usuarios internos del CRM.

## Comercial
- Dashboard.
- Clientes / ficha 360°.
- Responsable de lead.
- Pipeline Kanban.
- Reservas.
- Calendario Mes / Semana / Día / Agenda.
- Tareas.
- Pagos.
- Reportes.
- Notas y timeline.

## Productos y precios
- 33 tours TV1.2 incorporados desde el JSON fuente.
- Clave de precio: tour_id → modalidad → pax → tarifa.
- Compartido (LOW), Semiprivado (TV1), Privado (TV1).
- Matriz visible 1–12 pax con p/p y total.
- Tramo faltante = cotización manual, nunca inventado.
- Astronómico reúne Compartido + Semiprivado de TOUR-ASTRONOMICO y Privado de TOUR-ASTRONOMICO_PRIVADO.
- Catálogo complementario Supabase para Transporte, Salud, Procedimientos y SPA/Terapias.

## Operación turística
- Centro Operacional.
- Proveedores / agencias.
- Prestadores: guía, guía de montaña, conductor, cocinero/a, coordinador/a, fotógrafo/a, wellness y otros.
- Vehículos con patente, capacidad, proveedor, conductor habitual y vencimientos.
- Insumos / equipamiento.

## Operación por tour
Cada lead_service puede guardar:
- agencia/proveedor;
- guía;
- conductor;
- vehículo/patente;
- cocinero/a;
- coordinador/a;
- pickup;
- punto de encuentro;
- insumos;
- costo proveedor;
- estado de pago proveedor.

La ficha 360° muestra un resumen de proveedor, guía, conductor y patente debajo de cada tour y un botón Operación para editar la asignación.

## Pasajeros
- Lista nominal ligada a reserva.
- Código único por pax: CODIGO-LEAD-P01, P02, etc.
- Documento, nacionalidad, nacimiento, teléfono, email, restricciones y notas.
- app_user_ref opcional para cruzar con el usuario de la app.
- Descarga CSV de lista de pasajeros.

## Hoja de riesgo
- Link por reserva.
- Estado Pendiente / Completada.
- Alerta visible cuando la reserva está confirmada y la hoja sigue pendiente.

## Asistente comercial IA
- API OpenAI-compatible / OpenRouter.
- Clave API cifrada server-side.
- Prompt comercial adicional editable por admin.
- Contexto CRM + catálogo + reglas + matriz TV1.2.
- Indicador visible mientras genera respuesta.
- Puede proponer creación de lead, siempre con confirmación humana.

## Formulario público
- `/registro`.
- Crea lead y experiencias sin login según RLS pública ya existente.
