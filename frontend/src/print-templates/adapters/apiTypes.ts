/**
 * API response type interfaces for print adapters.
 *
 * These mirror the backend Prisma/Express response shapes exactly so adapters
 * can be typed without importing backend code.  When the backend adds a new
 * field, add it here too — adapters can then use it without further changes.
 *
 * Source: backend/src/modules/invoices/invoices.service.ts — FULL_INCLUDE
 */

// ─── Invoice (SALES + PURCHASE) ───────────────────────────────────────────────

export interface ApiInvoiceItem {
  id: number;
  invoiceId: number;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
  priceId: number | null;
}

export interface ApiInvoicePayment {
  id: number;
  invoiceId: number;
  amount: number;
  method: string;
  date: string;
  reference: string | null;
  notes: string | null;
}

export interface ApiInvoiceCustomer {
  id: number;
  name: string;
}

export interface ApiInvoiceSupplier {
  id: number;
  name: string;
}

export interface ApiInvoiceContract {
  id: number;
  asphaltPlant: string;
}

export interface ApiInvoice {
  id: number;
  /** Auto-incremented sequence id (e.g. "INV-2026-00142") */
  number: string;
  /** Manual invoice number (e.g. "MN-INV-2026-0142") */
  invoiceNumber: string;
  direction: 'SALES' | 'PURCHASE' | string;
  invoiceType: string;
  customerId: number | null;
  supplierId: number | null;
  contractId: number | null;
  /** ISO date string */
  issueDate: string;
  dueDate: string | null;
  deliveryDate: string | null;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  status: string;
  notes: string | null;
  billingMonth: number | null;
  billingYear: number | null;
  paymentMethod: string | null;
  items: ApiInvoiceItem[];
  payments: ApiInvoicePayment[];
  customer: ApiInvoiceCustomer | null;
  supplier: ApiInvoiceSupplier | null;
  contract: ApiInvoiceContract | null;
}

// ─── Quotation (future entity — stub) ────────────────────────────────────────

/**
 * Placeholder shape for a future Quotation API endpoint.
 * Mirrors the QuotationPrintData needs. Extend when the backend adds this entity.
 */
export interface ApiQuotation {
  id: number;
  quotationNumber: string;
  issueDate: string;
  validityDays: number;
  subject: string;
  customerName: string;
  attention: string | null;
  notes: string | null;
  items: ApiQuotationItem[];
  terms: string[];
}

export interface ApiQuotationItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ─── RFQ (future entity — stub) ───────────────────────────────────────────────

/**
 * Placeholder shape for a future RFQ API endpoint.
 * Extend when the backend adds this entity.
 */
export interface ApiRFQ {
  id: number;
  rfqNumber: string;
  issueDate: string;
  supplierName: string;
  attention: string | null;
  subject: string;
  notes: string | null;
  items: ApiRFQItem[];
  terms: string[];
}

export interface ApiRFQItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
}
