# HOTEL EXPERIENCE → LINK WORLD

HOTEL EXPERIENCE es la instancia de referencia de `operational_house_v1`.

## Responsabilidad

HOTEL EXPERIENCE conserva la verdad de leads, servicios, reservas, pasajeros, pagos, operación, costos, comisiones y feedback.

LINK WORLD recibe únicamente señales mínimas para entender estado y actividad del ecosistema.

## Transporte

`trigger de dominio → public.link_world_event_outbox → pg_net → LINK WORLD Edge Function → event_bus`

El cron `hotel-experience-link-world-bridge` ejecuta el tick cada minuto.

Semántica: **at-least-once + dedupe_key**.

Una caída de LINK WORLD no bloquea Ventas ni Operaciones: el evento queda en outbox para retry.

## Seguridad

- El token real del bridge se guarda exclusivamente en Supabase Vault con el nombre `link_world_bridge_hotel_experience_v1`.
- El repositorio no contiene el secreto.
- LINK WORLD almacena sólo SHA-256 del token.
- Los payloads no incluyen nombres, emails, teléfonos, documentos, notas médicas, notas libres ni datos bancarios.
- Las funciones del adaptador viven en schema `private`, con `SECURITY DEFINER`, `search_path=''` y sin EXECUTE para anon/authenticated.

## Eventos emitidos

- `counterparty.connected`: hotel/partner activado.
- `product.available`: producto de catálogo activado.
- `sale.confirmed`: servicio pasa a confirmed.
- `operation.completed`: cierre operacional pasa a closed.
- `commission.accrued`: comisión pasa a accrued.
- `feedback.closed`: caso de feedback pasa a responded.

No existe backfill automático: el bridge observa transiciones futuras desde su activación.

## Regla de ecosistema

Recibir un evento en LINK WORLD no crea por sí solo una venta, convenio, cliente o relación. El evento es señal/evidencia; las mutaciones de realidad siguen las reglas de LINK WORLD.
