# Print Templates — Reference React Components (Phase 1)

> **Reference only.** These are static React components converted from HTML design sources.
> Do NOT use these directly in production pages.
> Do NOT connect to InvoicePreview, Quotation, or PurchaseRequest pages.

## Purpose

Phase 1 pixel-perfect conversion of HTML print templates to React TSX.
Data binding, dynamic props, and Print Profile integration are Phase 2.

## Sources

| Directory | Source |
|-----------|--------|
| invoices/ | docs/invoice_templates/html/ |
| quotations/ | docs/html/qt*.html |
| purchase-orders/ | docs/html/po*.html |
| rfq/ | docs/html/rfq*.html |

## Font

Cairo is used in all templates. Loaded via @fontsource/cairo package (already in the project).
The @font-face base64 blocks from the source HTML have been removed — the project font system handles this.

## Status

| Template | Source | Status |
|----------|--------|--------|
| InvoiceDesign1 | design1.html | Phase 1 |
| InvoiceDesign1Blank | design1_blank.html | Phase 1 |
| InvoiceDesign2 | design2.html | Phase 1 |
| InvoiceDesign2Blank | design2_blank.html | Phase 1 |
| InvoiceDesign3 | design3.html | Phase 1 |
| InvoiceDesign3Blank | design3_blank.html | Phase 1 |
| InvoiceDesign4 | design4.html | Phase 1 |
| InvoiceDesign4Blank | design4_blank.html | Phase 1 |
| InvoiceDesign5 | design5.html | Phase 1 |
| InvoiceDesign5Blank | design5_blank.html | Phase 1 |
| QuotationDesign1 | qt1.html | Phase 1 |
| QuotationDesign1Blank | qt1_blank.html | Phase 1 |
| QuotationDesign2 | qt2.html | Phase 1 |
| QuotationDesign2Blank | qt2_blank.html | Phase 1 |
| QuotationDesign3 | qt3.html | Phase 1 |
| QuotationDesign3Blank | qt3_blank.html | Phase 1 |
| PurchaseOrderDesign1 | po1.html | Phase 1 |
| PurchaseOrderDesign1Blank | po1_blank.html | Phase 1 |
| PurchaseOrderDesign2 | po2.html | Phase 1 |
| PurchaseOrderDesign2Blank | po2_blank.html | Phase 1 |
| RFQDesign1 | rfq1.html | Phase 1 |
| RFQDesign1Blank | rfq1_blank.html | Phase 1 |
| RFQDesign2 | rfq2.html | Phase 1 |
| RFQDesign2Blank | rfq2_blank.html | Phase 1 |
| RFQDesign3 | rfq3.html | Phase 1 |
| RFQDesign3Blank | rfq3_blank.html | Phase 1 |
