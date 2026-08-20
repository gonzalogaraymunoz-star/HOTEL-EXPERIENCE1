# DEPLOY — HOTEL EXPERIENCE V6

## 1. GitHub
Elimina el contenido del repo anterior y sube EL CONTENIDO de esta carpeta a la raíz de `HOTEL-EXPERIENCE`.

Debes ver directamente:
- api/
- data/
- scripts/
- src/
- supabase/
- package.json
- vercel.json
- vite.config.ts

No subas una carpeta contenedora adicional.

## 2. Vercel
Importa `gonzalogaraymunoz-star/HOTEL-EXPERIENCE`.

La interfaz y el login ya apuntan al proyecto Supabase existente mediante URL + publishable key pública.

Agrega únicamente las variables privadas que ya usabas:
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_CONFIG_SECRET`

Estas habilitan Equipo/Invitaciones y Asistente IA. El CRM principal, Auth y tablas con RLS no dependen de ellas.

## 3. Supabase
No crees otro Supabase y no borres datos.
La capa V6 ya está aplicada sobre `lpirjwifzosdzgdncsbt`.

## 4. Verificación
Al abrir la URL:
1. Debe aparecer el login Hotel Experience.
2. Ingresa con tu usuario existente de Supabase Auth.
3. Revisa menú Operación.
4. Entra a un cliente → tour → Operación.
5. Revisa Productos → Astronómico y los tramos Compartido / Semiprivado / Privado.
