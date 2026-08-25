# HOTEL EXPERIENCE — guía de migración de cuenta

## Objetivo

Trasladar HOTEL EXPERIENCE a otra cuenta sin romper CRM, datos, Auth, Storage, despliegues ni trazabilidad.

Estado fuente auditado al 25-08-2026:

- GitHub: `gonzalogaraymunoz-star/HOTEL-EXPERIENCE1`
- rama de preparación: `migration/account-portable-v7`
- Supabase: proyecto `lpirjwifzosdzgdncsbt` (`ca-central-1`)
- Vercel: proyecto `hotel-experience` (`prj_m4p0v2jWBcekHwJjkbUR80ZD04y6`)
- Vercel scope fuente: `gonzalogaraymunoz-8382s-projects`
- último deployment de producción auditado antes de esta rama: `READY`

## Principio

Para este cambio de propietario, **transferir es preferible a clonar**.

El proyecto Supabase actual contiene datos, Auth, RLS, Storage y una historia de migraciones mucho más extensa que el SQL V6 inicial del repositorio. Crear una base nueva solo desde ese archivo produciría una instalación incompleta.

## 0. Preparar la cuenta de destino

La nueva identidad debe tener cuentas activas en:

- GitHub;
- Supabase;
- Vercel.

Antes de mover nada, añade la nueva identidad a los scopes/organizaciones necesarios. No elimines todavía la cuenta original.

## 1. GitHub

Transferir el repositorio existente, no crear una copia manual.

Condiciones:

- el usuario de destino no debe tener ya un repo con el mismo nombre;
- debe aceptar la transferencia;
- mantener la cuenta original como colaborador hasta completar la validación.

Después de transferir:

- comprobar `main` y `migration/account-portable-v7`;
- comprobar Actions/Secrets si existen;
- actualizar cualquier remote local;
- confirmar que Vercel sigue viendo la nueva ubicación o volver a autorizar GitHub en Vercel.

## 2. Supabase

Mover **el mismo proyecto** `lpirjwifzosdzgdncsbt` a una organización de la nueva cuenta.

Antes de transferir:

- la cuenta actual debe ser Owner de la organización fuente;
- la nueva cuenta debe ser miembro de la organización destino;
- revisar que no exista una integración GitHub activa que bloquee la transferencia;
- revisar límites del plan de destino;
- registrar las variables y configuraciones externas vigentes.

Después de transferir, verificar:

- Project Ref y API URL;
- Auth users y `profiles`;
- tablas y RLS;
- Storage buckets/objetos;
- Edge Functions si existen;
- cron/jobs, extensiones y políticas;
- publishable key y service role vigentes.

Si las keys cambian o se rotan, actualizar Vercel inmediatamente.

### Datos mínimos a contrastar

La fuente auditada tiene, entre otras entidades, leads, lead_services, passengers, hotel_partners, product_catalog, suppliers, service_assignments, payment_movements, service_commissions, cancellation policies, review cases y automation alerts. No aprobar la migración si esas relaciones no aparecen en destino.

## 3. Vercel

Transferir el proyecto `hotel-experience` al team/scope de la nueva cuenta.

Vercel transfiere el proyecto, deployments, variables de entorno, configuración, dominios/aliases y vínculo Git; las **integraciones** deben revisarse/reinstalarse después.

Antes de transferir:

- la cuenta actual debe ser Owner del team fuente;
- la nueva cuenta debe ser miembro del team destino;
- crear el team destino si aún no existe;
- no borrar el proyecto fuente;
- revisar variables de producción/preview.

Variables obligatorias en la V7:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_PUBLISHABLE_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
AI_CONFIG_SECRET
APP_PUBLIC_URL
```

Además, conservar variables de integraciones existentes como correo/Resend cuando estén activas.

## 4. Orden de reconexión

Después de los transfers:

1. GitHub autorizado para la nueva cuenta/team de Vercel.
2. Supabase visible en la nueva organización.
3. Variables Vercel apuntando al Supabase correcto.
4. Integraciones externas reautorizadas.
5. Deploy nuevo desde el repo ya transferido.

## 5. Checklist de aceptación

- [ ] `/api/health` responde `ok: true`.
- [ ] La interfaz muestra `Supabase conectado`.
- [ ] Login funciona con el usuario esperado.
- [ ] Leads y servicios reales están presentes.
- [ ] Una ficha 360 abre sin errores.
- [ ] Productos y tarifas se cargan desde sus fuentes reales.
- [ ] Pagos y costos no se mezclan con comisiones.
- [ ] Operaciones conservan proveedor, recursos y estados.
- [ ] Políticas/cancelaciones cargan sus snapshots.
- [ ] Automatizaciones y tareas conservan trazabilidad.
- [ ] Formulario público escribe en el Supabase correcto.
- [ ] Correo/integraciones activas se prueban con una acción real controlada.
- [ ] Producción queda `READY` en Vercel.

## 6. Rollback

Hasta completar el checklist:

- no eliminar la cuenta original;
- no eliminar la organización Supabase anterior;
- no borrar deployments anteriores;
- no eliminar la rama de migración.

Si una validación crítica falla, volver al último deployment `READY` y corregir la conexión antes de continuar.

## 7. Qué NO hacer

- no reconstruir el CRM desde cero;
- no crear un Supabase vacío y asumir que el SQL V6 representa producción actual;
- no copiar service role keys a frontend;
- no mezclar la base de LINK CONTROL CENTRAL con la base operacional de HOTEL EXPERIENCE;
- no declarar una conexión como operativa sin health check y prueba de lectura/escritura real.
