# Hotel Experience · Web → Ventas → Opera (staging, 25 Nov 2026)

Status: candidate only; do not merge/deploy before tests. Public zone hotelexperience.org was still pending in Cloudflare at audit. Existing Worker hotel-experience-web remains the origin; hotel-experience-public is the restricted façade. Do not enable /solicitud-preview or the private PDF/API paths wholesale.

## Verified
- Hotel Experience data: project lpirjwifzosdzgdncsbt (not LINK CONTROL CENTRAL).
- One lead + passengers + lead_services + payment_movements; use same lead UUID throughout.
- save_link_client_intake360 only accepts authenticated active profiles; editing whitelists request fields, so it would drop new experiences[] / destination / consent unless adapted.
- confirm_link_sale requires origin, responsible seller, principal name/contact, arrival/departure, quoted items with date/pax/price and operation template. It transitions quoted → confirmed, creates commissions and proposed assignment. Existing mark_operation_handoff trigger stamps operation_ready_at on confirmation.
- register_link_client_payment requires confirmed services; distributes payment movements, updates status Pagado/Parcial; no idempotency key or explicit agent ownership check in current version. Therefore payment cannot precede commercial confirmation with current contract.
- Legacy anon insert policies on leads and lead_services are broad; role-level grants include INSERT. Do not expose new public intake before legacy callers are audited and bypass closed. Agent table-update RLS also allows changes to own services; payment and operational fields must be protected at column/RPC level.
- 76 active products have slugs; confirm the public 16-slug mapping before launch. No private customer rows read.
- Existing lead, service and payment triggers emit LINK World outbox events: test on staging only to avoid notifications or downstream automations.

## Access boundary (owner decision, 25 Nov 2026)
Public intake is contact/interest only, never a reservation. Full commercial catalog, agreement terms, detailed booking form, passenger documents, payment and settlement are authenticated, scoped resources. See he-access-layers.md. Earlier candidate SQL requires revision before use: it cannot be treated as the public reservation form. No publication until approved public projection and private access tests pass.

## Intended flow
1. Website POST /api/interes (proposed public capture endpoint, not existing /api/catalogo; no booking): challenge verified server-side, size and rate limits, Origin enforcement, allowed catalog slugs, UUID idempotency key maintained across retries; server-only Vault-matched secret; no service-role key. UI must say "solicitud recibida", never "reserva confirmada". Return opaque receipt; do not expose customer records.
2. Authenticated associate completes the reservation against the existing lead. Draft he_web_intake_v1.sql must be reduced to minimal public intake before use; currently uses leads + passengers and a minimal private receipt/digest table. No price, payment, confirmed status, seller or hotel chosen by untrusted client. Current draft requires at least one selected product; advice-only path and consent text require UI decision. Source web/Atacama. Manager assigns origin and responsible seller. Ventas needs explicit queue for unassigned web leads; verify current visibility and assign workflow. Keep multi-experience selection through F360 and quotation, use catalog IDs and price authority TV1.2. Preserve existing IDs; origin assignment may change visible code by existing assign_lead_code trigger.
3. Commercial confirmation using existing RPC after quotation approval. Keep current reservation status for inventory and commissions; operational readiness must be separate from confirmed. Do not invert payment/confirm RPC order.
4. Payment is actual verified movement in same currency. Manual collection requires evidence/reference and authorized actor. No client-declared payment, no fake transactions. Deduplicate by stable provider event/payment or approved unique manual receipt; guard concurrency and refunds. Current ownership patch is candidate; payment reference dedup and per-currency accounting remain open.
5. Opera admission: for web bookings, confirmed service plus accepted payment policy and complete required data, with idempotent transition, operation_ready_at only when eligible. Keep the existing confirmation-based behavior for historical/non-web bookings until impact review. Use the applicable versioned commercial agreement; no global payment minimum. See he-agreement-collection-policy.md. Unknown or conflicting agreement blocks automatic readiness, not recording the lead. Verify actual Opera selectors before changing trigger or filters; don't rely on hiding UI. Pending reservations can remain visible as planning-only if explicitly approved, not in ready-to-operate queue. Reconcile cancellation/refund and separate financial status. Use same UUID/service codes; no duplicate lead or transfer via copy.

## Staging acceptance (none executed yet)
- anonymous direct INSERT cannot forge lead/service, price, or payment; only the guarded endpoint can create request; invalid secret/challenge returns denial without data.
- invalid slug/date/pax, oversize, extra status/price fields rejected, no partial records; retries same UUID+payload return same receipt, changed payload conflicts.
- ES/PT/EN form and current catalog/media verified via HTTPS; private routes and POSTs except endpoint denied. No public PII.
- new request visible to admin/manager, assigned seller only after routing; F360 edit preserves selections and IDs; quote pricing verified; unassigned agent and inactive profile denied; agent cannot update payment or operation columns directly.
- agreement-specific admission tests: Paolo requires full verified customer payment; Fauna allows readiness with outstanding balance due at checkout; Casa Solcor collects externally, do not infer payment or due date; missing policy requires review. Below the applicable threshold is not ready. Replays never double charge or handoff; refund/cancellation tested.
- Opera correct date, product, pax, pickup, language, provider, payment status and missing fields; list/risk forms use actual passenger data only.
- legacy channels, roles, inventory, outbox and existing confirmed leads unchanged; rollback test; no actual payments or production reservations.
- verify DNS activation, HTTPS and old URL availability; bind subdomains for Ventas/Opera only after auth callbacks/redirects and RLS reviewed.

## Draft files
- he-web-intake-v1.sql: candidate, not installed, Vault secret not provisioned. Validate product slugs, nullable/defaults, trigger effects, retry after dates pass, and exact sales queue compatibility.
- he-sale-payment-ownership.sql: current live definitions plus deny null role and enforce assigned agent ownership. Not executed; verify manual legacy workflows and existing privileges before migration.
