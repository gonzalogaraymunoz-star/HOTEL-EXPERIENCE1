# HOTEL EXPERIENCE V7 — arquitectura

## Posición en el ecosistema

```text
LINK CONTROL CENTRAL
  └─ gobierno, identidad, memoria, supervisión, gateways
       │
       └── HOTEL EXPERIENCE
            └─ Operational Data Plane de hotelería/turismo
```

HOTEL EXPERIENCE no se convierte en CONTROL CENTRAL y no comparte su base por comodidad. Conserva el dominio operacional de huéspedes, leads, productos, reservas, pagos, operadores, comisiones, ejecución, postventa y feedback.

## Fuentes de verdad

- Código: GitHub.
- Datos/Auth/Storage: Supabase HOTEL EXPERIENCE.
- Deploy: Vercel.
- Gobierno transversal: LINK CONTROL CENTRAL cuando exista una integración explícita.

## Contrato de interfaz

Una función visible debe completar una cadena real:

`entrada → validación → ejecución → persistencia → actualización → auditoría cuando corresponda`

Si una dependencia no está configurada, la UI debe mostrarlo como estado pendiente/error. No se usan datos ficticios para simular conectividad.

## Principios heredados de CONTROL CENTRAL

1. Pocas decisiones principales por pantalla.
2. El estado real del sistema es visible.
3. Los datos se vuelven a leer desde la fuente de verdad después de acciones importantes.
4. Los errores deben explicar el bloqueo, no esconderlo.
5. Las integraciones se conectan como gateways/complementos; no se acoplan al núcleo.

## Principios heredados de LINK HUB / Preview Studio

1. Cada app declara identidad, health y dependencias.
2. Supabase, GitHub y Vercel tienen responsabilidades separadas.
3. Las variables privadas viven solo en servidor.
4. Después de deploy existe un protocolo de comprobación.
5. La app debe poder ser transferida sin editar IDs de cuenta dentro del frontend.

## Dominio HOTEL EXPERIENCE

El modelo operacional sigue siendo:

`Captación → Lead → Atención → Cotización → Venta → Pago → Reserva → Operación → Experiencia → Cierre → Comisiones → Feedback`

Reglas inalterables:

- un lead puede comprar múltiples productos;
- costo operacional y margen comercial son capas distintas;
- primero se paga costo operador;
- toda venta debe ser trazable a origen, vendedor, hotel y operador;
- los porcentajes de hotel/vendedor/plataforma son configurables;
- Lama Travelers puede ser operador, pero no es HOTEL EXPERIENCE ni LINK.

## Multi-hotel

Un nuevo hotel no debe exigir una nueva aplicación ni una nueva base. El crecimiento ocurre mediante entidades, scopes, prefijos, roles y RLS dentro del dominio HOTEL EXPERIENCE.

El código permanente del lead conserva el patrón:

`PREFIX-YYMM-###`

Ese identificador conecta lead, cotización, reserva, productos, pagos, operación, comisiones y feedback.

## Interfaz V7

La V7 mantiene las pantallas funcionales existentes y evoluciona progresivamente hacia:

- Inicio: pendientes y decisiones inmediatas.
- Comercial: clientes, pipeline, reservas, productos.
- Gestión: calendario, tareas, pagos, reportes.
- Operación: fichas, salidas, proveedores, prestadores, vehículos, insumos.
- Postventa: review, feedback, oportunidades futuras.
- Sistema: complementos, políticas y estado de conexiones.

No se elimina funcionalidad solo para imitar visualmente a CONTROL CENTRAL. Se adopta su lógica de claridad y verdad operacional.

## Portabilidad

El código no debe necesitar el Project Ref del propietario anterior para arrancar. Las conexiones se resuelven desde variables de entorno y se verifican mediante `/api/health`.

El cambio de propietario recomendado es:

`GitHub transfer → Supabase project transfer → Vercel project transfer → reautorizar integraciones → validar`

La migración de datos a un Supabase nuevo es un plan B para cambio de región, recuperación o clon controlado; no es la primera opción para un simple cambio de cuenta.
