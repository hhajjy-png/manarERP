import type { ComponentType } from 'react';

// ─── Template taxonomy ────────────────────────────────────────────────────────

export type PrintTemplateCategory =
  | 'invoice'
  | 'quotation'
  | 'purchase-order'
  | 'rfq';

export type PrintTemplateLanguage = 'ar' | 'en' | 'bilingual';

export type PrintTemplatePaper = 'plain-a4' | 'letterhead';

// ─── Component type ───────────────────────────────────────────────────────────

/**
 * A React component that optionally accepts print data as a prop.
 * Phase 1.8: components ignore `data` (static stubs).
 * Phase 2: components render from `data`.
 */
export type PrintTemplateComponent<TData = unknown> = ComponentType<{ data?: TData }>;

// ─── Template metadata ────────────────────────────────────────────────────────

export interface PrintTemplateDefinition<TData = unknown> {
  /** Unique identifier, e.g. "invoice-design-1" or "invoice-design-1-blank" */
  id: string;
  category: PrintTemplateCategory;
  nameAr: string;
  nameEn: string;
  /** "original" = full letterhead printed in template. "blank-letterhead" = header/footer hidden for pre-printed paper. */
  variant: 'original' | 'blank-letterhead';
  language: PrintTemplateLanguage;
  supports: {
    plainA4: boolean;
    letterhead: boolean;
  };
  component: PrintTemplateComponent<TData>;
  /** Relative path to source HTML file used for this template */
  sourceFile?: string;
  notes?: string;
}

// ─── Shared company data ──────────────────────────────────────────────────────

export interface CompanyPrintData {
  nameAr: string;
  nameEn: string;
  taglineAr: string;
  taglineEn: string;
  capitalAr: string;
  capitalEn: string;
  phone: string;
  fax: string;
  email: string;
  addressAr: string;
  addressEn: string;
}

// ─── Shared line item ─────────────────────────────────────────────────────────

export interface PrintLineItem {
  number: number;
  descriptionAr: string;
  descriptionEn?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

// ─── Per-category document data ───────────────────────────────────────────────

export interface InvoicePrintData {
  company: CompanyPrintData;
  invoiceNumber: string;
  date: string;
  customerName: string;
  /** From contract.asphaltPlant — shown in project/reference rows of invoice templates. */
  projectName?: string;
  lineItems: PrintLineItem[];
  totalDinars: number;
  totalFils: number;
  totalInWords: string;
  notes?: string;
}

export interface QuotationPrintData {
  company: CompanyPrintData;
  quotationNumber: string;
  date: string;
  customerName: string;
  attention?: string;
  validity: string;
  subject: string;
  lineItems: PrintLineItem[];
  grandTotal: number;
  terms?: string[];
  notes?: string;
}

export interface PurchaseOrderPrintData {
  company: CompanyPrintData;
  poNumber: string;
  date: string;
  supplierName: string;
  attention?: string;
  deliveryLocation?: string;
  lineItems: PrintLineItem[];
  grandTotal: number;
  terms?: string[];
  notes?: string;
}

export interface RFQPrintData {
  company: CompanyPrintData;
  rfqNumber: string;
  date: string;
  supplierName: string;
  attention?: string;
  subject: string;
  lineItems: PrintLineItem[];
  notes?: string;
  terms?: string[];
}
