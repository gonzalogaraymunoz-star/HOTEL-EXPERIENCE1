# LINK Forms

LINK Forms is the shared form-autofill engine extracted from the operational list flow in Hotel Experience.

## Principle

**The form interprets. Supabase provides truth. The engine writes. A human reviews exceptions.**

No value is invented. If a source value does not exist, the output stays empty and the run records a warning.

## Current adapters

- XLSX: scans labels, detects passenger tables, supports scalar cells and repeated passenger columns.
- PDF: fills editable AcroForm fields.
- HTML: maps inputs, textareas and selects by name/id/placeholder/aria-label.
- JSON: maps scalar keys recursively.

Scanned/image-only PDFs are detected but are not written in V1.

## Flow

1. Operator selects a reservation or tour departure.
2. Operator uploads a new form.
3. /api/link-forms analyzes field names/labels against the canonical dictionary.
4. UI shows the proposed field -> LINK variable mappings and real preview values.
5. Admin/manager corrects mappings once and saves the template.
6. The original template is stored in operation-documents/link-forms/templates/....
7. The mappings are persisted in link_form_fields.
8. Manually taught labels are reused as learned aliases in link_form_aliases.
9. Any authenticated operator can select a learned template and generate a filled copy.
10. Generated outputs are stored in operation-documents/link-forms/generated/....
11. link_form_runs keeps evidence of filled/missing values and warnings.

## Canonical context

The reservation path reuses get_reservation_autofill_context() and exposes canonical namespaces:

- passenger.*
- reservation.*
- service.*
- operation.*
- departure.*

Examples:

- passenger.full_name
- passenger.document_number
- reservation.hotel
- service.date
- operation.pickup_time
- operation.guide_name
- operation.vehicle_plate
- departure.code

## Governance

- Authenticated users can use saved templates.
- admin and manager can teach/save new templates.
- Template learning never overwrites the operational source data.
- Generated documents are copies; the master remains unchanged.
- The current upload path uses JSON/base64 and therefore caps source files at 3 MB.

## Database

Migration:

supabase/migrations/20261006143000_link_forms_engine.sql

Tables:

- link_form_templates
- link_form_fields
- link_form_aliases
- link_form_runs

## UI

Operations now includes a **LINK Forms** navigation item.

The workspace is intentionally organized around three actions:

1. Choose truth source.
2. Use a learned template.
3. Teach a new form once.

## Existing Hotel Experience forms

The existing GOAS / official operation-list generators remain intact. LINK Forms is additive and can progressively absorb forms that are currently hard-coded once each template has been validated in production.
