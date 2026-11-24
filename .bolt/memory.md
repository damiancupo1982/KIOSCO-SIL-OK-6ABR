# Project memory

## Product intent & audience

- Billing/invoicing management app for a small business (likely a social club or kiosk in Argentina).
- Core entities: invoices (facturas), articles/products (artículos), payment methods.
- Users need sales analysis by product and payment method within date ranges.

## Brand personality & voice

- UI language: Spanish (Argentine — uses "vos" forms: "marcás", "podés", "limpiá").
- Tone: practical, direct, business-oriented.

## Visual design & UX direction

- Stack: Vite + React, Tailwind CSS, Lucide React icons (no extra UI packages).
- Reports page uses date-range filtering; results show invoice listings.
- Added "Análisis por Artículo" section with checkable toggle buttons (chips/pills) for:
  - Articles present in any invoice within the filtered period.
  - Payment methods (Efectivo, Transferencia, QR, Expensa).
- "Marcar todo" / "Limpiar" helper buttons for article selection.
- Results table: rows = selected articles × selected payment methods; columns include units sold and total billed amount; footer TOTAL row.
- If no payment method is checked, all four are shown by default.

## Decisions, constraints & rationale

- Payment-method amounts are split proportionally when an invoice uses multiple payment methods and includes multiple articles, so totals reconcile correctly.
- Article buttons are dynamically generated from invoices in the current filtered period (only articles that appear in at least one invoice are listed).
- Multiple payment methods can coexist on a single invoice.

## Open questions & assumptions

- Proportional split assumes uniform price distribution across articles in multi-payment invoices; exact per-article payment attribution is not stored natively.
- Product list (e.g., "luz invitado", "Powerade") is dynamic from invoice data, not from a fixed catalog — assumed no separate product master table is required for this feature.
- No confirmation yet on whether article-level payment breakdown should be editable/exportable.