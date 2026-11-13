# Hotel Experience · Catálogo público en Cloudflare

**Estado:** desplegado como Worker independiente, sin dependencias del hosting de Vercel.

- Sitio: https://hotel-experience-web.gonzalogaraymunoz.workers.dev/
- Catálogo: https://hotel-experience-web.gonzalogaraymunoz.workers.dev/catalogo
- Fichas individuales: /catalogo/<product_slug>
- Worker: `hotel-experience-web` (cuenta Cloudflare `gonzalogaraymunoz`)
- Código desplegado: [cloudflare-catalog-worker.js](./cloudflare-catalog-worker.js)

## Fuente y estética
Migración **solo de la web pública de catálogo**, con diseño inspirado directamente en:
- `src/components/NeutralCatalogPage.tsx`
- `src/components/NeutralCatalogPage.css`
- `src/lib/catalogData.ts`

Se conservan la paleta papel / tinta, tipografías Georgia y Arial, buscador, filtros por categoría, cuadrícula de fichas, detalles, recorrido, imágenes y composición adaptable a móviles. No se ha migrado el CRM administrativo.

## Información de catálogo
La versión de Cloudflare consume en tiempo de consulta los datos **públicos** de Supabase, utilizando `get_public_products` y las imágenes activas de `catalog_images`; sigue usando el mismo proyecto `lpirjwifzosdzgdncsbt`. La clave pública de Supabase incluida es publicable. **Nunca introducir** la service role key, información privada de clientes, usuarios ni funciones administrativas en esta web. Los precios/ventas permanecen separados en LINK Ventas.

Las imágenes especializadas presentes en `public/catalog/` se sirven mediante una redirección a los archivos originales públicos de GitHub, mientras la galería y portadas utilizan el almacenamiento público de Supabase.

## Despliegue y mantenimiento
El archivo `cloudflare-catalog-worker.js` es el código del Worker vigente al 13 de noviembre de 2026. El Worker se desplegó directamente en Cloudflare y está habilitado en `workers.dev`.

**Importante:** esta rama es respaldo del código; no se activó un pipeline automático GitHub → Cloudflare. Para actualizar diseño o código, revisar primero la versión de GitHub, probar localmente y desplegar una versión nueva del Worker. Para actualizar productos e imágenes, usar los datos públicos del proyecto de Supabase.

## Verificación realizada
- Worker subido y `workers.dev` habilitado.
- Navegación /catalogo cargó **31 experiencias** en la comprobación del 13/11/2026.
- Se comprobaron enlaces individuales, nombres y rutas de portadas desde el almacén público.
- La ficha `/catalogo/geiser_del_tatio` presentó título, imagen y secciones del detalle en sesión móvil de navegador.
- Vercel y la operación administrativa original quedaron sin modificaciones.
