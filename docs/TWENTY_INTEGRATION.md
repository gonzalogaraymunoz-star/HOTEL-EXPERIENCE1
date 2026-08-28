# HOTEL EXPERIENCE → Twenty CRM

## Source of truth

- Supabase: operational and deep data memory.
- Twenty: CRM/commercial workspace.
- LINK CONTROL CENTRAL: identity, governance and client scope.
- Vercel: synchronization runtime.

## Client scope

Twenty company:

- Name: Hotel Experience
- Control Central ID: `HOTEL-EXPERIENCE`
- Source: `LINK CONTROL CENTRAL`
- Status: `ACTIVE`

## Lead contract

Every Supabase `leads` record is synchronized to the custom Twenty `Lead` object.

Permanent identity:

`codigo` → `leadCode` → `PREFIX-YYMM-###` or the legacy source code when already assigned.

Traceability:

`leads.id` → `supabaseLeadId`
`HOTEL-EXPERIENCE:<codigo>` → `controlCentralId`

Mapped fields:

- codigo → leadCode
- reserva → reservation
- numero_pax → passengers
- servicio → service
- precio_venta → salePrice
- moneda → currencyCode
- checkin → checkin
- checkout → checkout
- contacto → contact
- prioridad → priority
- lifecycle_stage/estado → lifecycleStage
- canal → channel
- Hotel Experience company → client relation
- passenger/contact → person relation

## Synchronization

`/api/twenty-sync` reads Supabase leads and creates/updates the corresponding Twenty Person and Lead records. A local `twenty_sync_records` table stores the remote IDs, status, attempts and errors.

Vercel runs the sync every five minutes.

Required server-side environment variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TWENTY_API_KEY`
- `CRON_SECRET`

`TWENTY_API_KEY` must never be exposed to browser code.

## Principle

Do not duplicate operational truth into Twenty unnecessarily. Twenty receives the CRM projection needed for sales, follow-up and commercial visibility, while Supabase retains the full operational record and relationships.
