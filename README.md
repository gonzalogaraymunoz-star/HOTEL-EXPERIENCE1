# HOTEL EXPERIENCE CRM — V6

Base limpia y única del CRM Hotel Experience by LINK.

## Ya está conectado al Supabase existente
Proyecto: `lpirjwifzosdzgdncsbt`.

El frontend usa la publishable key pública del proyecto (segura para navegador + RLS), por lo que el login Supabase Auth funciona al desplegar el repo aunque no copies variables `VITE_*`.

Para funciones privadas de servidor agrega en Vercel:
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_CONFIG_SECRET`

Nunca pongas `SUPABASE_SERVICE_ROLE_KEY` en una variable `VITE_*`.

## Menú
- Inicio
- Asistente comercial
- Clientes
- Pipeline
- Reservas
- Calendario
- Tareas
- Pagos
- Reportes
- Productos
- Operaciones
- Proveedores
- Prestadores
- Vehículos
- Insumos
- Equipo (admin)

## Ficha 360°
Cada cliente contiene sus tours, pasajeros, tareas e información operacional. Cada tour tiene botón **Operación** y puede guardar:
- proveedor/agencia responsable;
- guía;
- conductor;
- vehículo/patente;
- cocinero/a;
- coordinador/a;
- pickup y punto de encuentro;
- insumos;
- costo y pago del proveedor.

## Pasajeros
Cada pax recibe código único: `CODIGO-LEAD-P01`, `P02`, etc.
Existe `app_user_ref` para cruzarlo posteriormente con un usuario de la app.
La ficha permite descargar una lista CSV nominal.

## Hoja de riesgo
Cada reserva puede guardar el link de su hoja de riesgo. Si el lead está confirmado y la hoja no está completada, la interfaz muestra una alerta.

## Tarifario TV1.2
Fuente incluida en:
`src/data/tv1_2_crm_cotizador_tours.json`

Regla inalterable:
`tour_id → modalidad → pax → tarifa`

- Compartido (LOW): precio p/p × pax.
- Semiprivado (TV1): precio p/p entre 2–10 pax; 1 pax = cotización manual.
- Privado (TV1): tramo exacto 1–12; tramo nulo = cotización manual.
- Nunca se corrigen precios del archivo fuente desde el código.

La vista Productos muestra las tres modalidades y una matriz completa 1–12 pax. Además conserva un segundo acceso para Transporte, Salud, Procedimientos y SPA/Terapias desde el catálogo Supabase existente.

## Supabase
La migración operacional V6 ya fue aplicada al proyecto actual. Se conserva en `supabase/migrations/` para reproducibilidad.

## Verificación
- `npm run validate` valida estructura y dataset.
- `npm run typecheck` valida TypeScript.
- `npm run build` ejecuta typecheck y compila Vite.

Consulta `FUNCTIONAL_MAP.md` para el inventario funcional completo.
