# HOTEL EXPERIENCE — OPERACIÓN

HOTEL EXPERIENCE es la aplicación operacional del ecosistema hotelero de LINK.

La capa comercial se separa en **LINK Ventas**. Ambas aplicaciones comparten el mismo backend Supabase, de modo que una venta confirmada alimenta directamente la operación sin duplicar clientes, pasajeros ni servicios.

## Backend compartido
Proyecto Supabase: `lpirjwifzosdzgdncsbt`.

El frontend usa Supabase Auth + RLS. Nunca expongas `SUPABASE_SERVICE_ROLE_KEY` en variables `VITE_*`.

## Flujo

`LINK Ventas → lead → pasajeros → servicio vendido → booking_status=confirmed → HOTEL EXPERIENCE → operación → cierre`

Los servicios nuevos nacen en `hold`. HOTEL EXPERIENCE solo toma servicios con `booking_status=confirmed` o `completed`.

## Menú operacional
- Programa diario
- Calendario
- Fichas 360
- Operadores
- Prestadores
- Vehículos
- Recursos
- Equipo (admin)

La interfaz prioriza el uso de todo el viewport cuando existen tablas, formularios o información operacional de alta densidad.

## Programa diario
La vista inicial está organizada por fecha y permite revisar en una sola pantalla:
- código del servicio;
- cliente principal + acompañantes;
- producto;
- pax;
- pickup;
- operador;
- guía;
- conductor;
- vehículo;
- estado;
- notas.

Incluye filtros rápidos `TODO / TRF / AM / PM / NOC / !`, búsqueda y navegación por día.

## Códigos permanentes
Toda entidad operacional conserva UUID interno de Supabase y un código humano visible.

- Lead: `PREFIX-YYMM-###`
- Pasajero: `PREFIX-YYMM-###-P01`
- Servicio vendido: `PREFIX-YYMM-###-S01`
- Operación: `PREFIX-YYMM-###-S01-OP01`
- Operador: `SUP-0001`
- Prestador: `PER-0001`
- Vehículo: `VEH-0001`
- Recurso: `RES-0001`

El pasajero `P01` es el cliente/principal y los siguientes códigos corresponden a acompañantes.

## Ficha 360
La ficha operacional conserva la trazabilidad del servicio y puede relacionar:
- cliente y pasajeros;
- operador;
- guía y conductor;
- vehículo;
- pickup y punto de encuentro;
- recursos;
- documentos;
- costo operacional;
- pago del proveedor;
- incidencias y cierre.

## Ventas
El código comercial previamente construido no se elimina. La extracción destinada al futuro repositorio `linkventas` se conserva bajo `extracted/linkventas/` hasta que el repositorio independiente sea creado.

## Supabase
Las migraciones de separación Ventas → Operación y códigos persistentes están versionadas en `supabase/migrations/` y aplicadas al proyecto compartido.

## Verificación
- `npm run validate`
- `npm run typecheck`
- `npm run build`

## Deploy
La rama `main` es la fuente de producción en Vercel.
