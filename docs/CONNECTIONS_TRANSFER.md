# HOTEL EXPERIENCE — mapa de conexiones para nueva cuenta

## Regla principal

Las sesiones OAuth y credenciales privadas **no se copian** entre cuentas de Gmail/ChatGPT. Se transfiere la infraestructura y se vuelve a autorizar cada conexión desde la cuenta destino.

No guardar tokens, service role keys, contraseñas ni API keys dentro del repositorio.

## Núcleo obligatorio

### GitHub

Responsabilidad: código y versionado.

Fuente actual: `gonzalogaraymunoz-star/HOTEL-EXPERIENCE1`.

Acción de migración: transferir el repositorio al usuario/organización GitHub de la nueva cuenta y reautorizar GitHub en Vercel/ChatGPT si corresponde.

### Supabase

Responsabilidad: datos, Auth, Storage, RLS y lógica persistente.

Fuente actual: proyecto `lpirjwifzosdzgdncsbt`.

Acción de migración: transferir el proyecto completo a una organización de la nueva cuenta. No reconstruirlo desde el único SQL V6 antiguo.

### Vercel

Responsabilidad: producción, previews y server functions.

Fuente actual: proyecto `hotel-experience`.

Acción de migración: transferir el proyecto al team de la nueva cuenta y revisar integraciones después del transfer.

## Conexiones de trabajo a reautorizar en la cuenta ChatGPT destino

Para conservar el mismo entorno operativo, instalar/conectar cuando sean necesarias:

- GitHub;
- Supabase;
- Vercel;
- Google Drive;
- Gmail;
- Google Calendar;
- Google Contacts;
- Attio, si HOTEL EXPERIENCE lo utiliza en el flujo futuro.

La autorización debe hacerse con la identidad correcta de la nueva cuenta o con una cuenta de servicio/empresa diseñada para compartir acceso. No reutilizar tokens exportados de la cuenta anterior.

## Registro interno de complementos en Supabase

Auditoría del 25-08-2026:

- Attio: disponible, no habilitado.
- GitHub: disponible, no habilitado desde el centro interno.
- Gmail: disponible, no habilitado desde el centro interno.
- Google Calendar: disponible, no habilitado desde el centro interno.
- Google Drive: disponible, no habilitado desde el centro interno.
- Vercel: disponible, no habilitado desde el centro interno.
- Complemento personalizado: disponible, no habilitado.
- Resend: marcado como habilitado pero `configuration_required`; falta configuración válida de proveedor de correo.

Esto significa que el inventario de botones/complementos no debe confundirse con una conexión OAuth realmente activa.

## Conexiones documentales del proyecto

Mantener acceso a las fuentes operativas ya usadas por HOTEL EXPERIENCE, especialmente el catálogo/productos y documentos que alimentan la base de conocimiento. La nueva cuenta debe recibir permisos de Drive antes de retirar la cuenta anterior.

## Comprobación de cada conexión

Una conexión se considera migrada solo cuando cumple:

1. autenticación válida;
2. lectura real;
3. escritura real cuando el rol lo requiere;
4. persistencia en la fuente de verdad;
5. resultado visible en HOTEL EXPERIENCE;
6. ausencia de dependencia de la cuenta antigua.

## Orden recomendado

1. GitHub.
2. Supabase.
3. Vercel.
4. Google Drive.
5. Gmail / Calendar / Contacts.
6. Attio y otros complementos opcionales.
7. Revisar Resend/correo.
8. Ejecutar checklist de `MIGRATION_GUIDE.md`.

## Estado de la rama de migración

La rama `migration/account-portable-v7` introduce:

- variables explícitas de Supabase en frontend;
- bloqueo de configuración en lugar de fallback silencioso;
- `/api/health` con estado real;
- indicador de conexión en el sidebar;
- manifiesto de proyecto;
- arquitectura V7;
- guía de migración;
- instrucciones reutilizables para recrear el proyecto en ChatGPT.
