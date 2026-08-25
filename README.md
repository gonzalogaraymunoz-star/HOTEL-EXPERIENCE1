# HOTEL EXPERIENCE — V7 portable

Sistema operativo comercial y operacional para hoteles.

HOTEL EXPERIENCE mantiene el flujo:

`Hotel → Lead/Huésped → Venta → Producto → Pago → Operador → Operación → Comisión → Feedback`

## Arquitectura

- **GitHub:** fuente de verdad del código.
- **Supabase:** fuente de verdad de datos, Auth, Storage y reglas operacionales.
- **Vercel:** producción, previews y funciones de servidor.
- **LINK CONTROL CENTRAL:** capa superior de gobierno/control; HOTEL EXPERIENCE permanece como Operational Data Plane de turismo.

La aplicación conserva el CRM, operación, productos, pagos, proveedores, comisiones, políticas, postventa, automatizaciones y fichas existentes. La V7 no reemplaza esas funciones: hace el proyecto transferible entre cuentas y mejora la visibilidad del estado real de sus conexiones.

## Regla de interfaz

**No Fake UI.** Una conexión o estado solo se muestra como operativo cuando existe evidencia real. Si faltan variables de Supabase, la app bloquea el workspace y muestra “Conexión requerida” en vez de leer una base por defecto.

El sidebar incorpora un health check del backend para mostrar si Supabase está realmente configurado.

## Variables de entorno

Copia `.env.example`.

Frontend:

```text
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

Servidor:

```text
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
AI_CONFIG_SECRET=
APP_PUBLIC_URL=
```

Variables de integraciones adicionales ya usadas por módulos existentes deben conservarse en Vercel al transferir el proyecto.

**Nunca** expongas `SUPABASE_SERVICE_ROLE_KEY` en una variable `VITE_*`.

## Transferencia a otra cuenta

No recrees la infraestructura a ciegas. El procedimiento recomendado está documentado en `MIGRATION_GUIDE.md`.

Orden general:

1. preparar la cuenta de destino;
2. transferir GitHub;
3. transferir el proyecto Supabase existente;
4. transferir el proyecto Vercel;
5. reautorizar integraciones que no se transfieren;
6. verificar health, Auth, datos y flujos críticos.

## Reproducibilidad

La base de producción tiene una historia de migraciones posterior al archivo V6 inicial. Por eso, para el cambio de propietario se prioriza **transferir el mismo proyecto Supabase**. Antes de usar esta repo como instalación completamente nueva, se debe consolidar/exportar el historial vigente de migrations, Storage, Auth settings y funciones.

## Verificación local / CI

```bash
npm install
npm run validate
npm run typecheck
npm run build
```

Después de desplegar:

- `/api/health` debe responder `ok: true`;
- login debe usar el Supabase objetivo;
- el CRM debe mostrar datos reales;
- pagos, operación, políticas y automatizaciones deben conservar trazabilidad.

Consulta también:

- `FUNCTIONAL_MAP.md`
- `docs/ARCHITECTURE_V7.md`
- `MIGRATION_GUIDE.md`
- `PROJECT_MANIFEST.json`
