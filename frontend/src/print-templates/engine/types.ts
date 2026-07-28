import type { ComponentType } from 'react';
import type { PrintTextStyleSettings } from './textStyleTypes';
import type { StaticTextOverrides } from '../designer/staticTextTypes';

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

// ─── Branding layout types (Phase 4) ─────────────────────────────────────────

export type PrintDocumentType = 'invoice' | 'quotation';

/**
 * Administrative forms that carry the shared company approval slot
 * (`ApprovalSection`) and therefore have their own signature/stamp layout.
 *
 * Deliberately a SEPARATE union from `PrintDocumentType`: that type also keys the
 * layout-override, text-style and static-text subsystems plus the Settings
 * calibration dialog's document tabs, none of which apply to these forms. Widening
 * it would drag three unrelated subsystems along.
 */
export const FORM_BRANDING_DOC_KEYS = [
  'salary-certificate',
  'to-whom-it-may-concern',
  'leave-request',
  'return-to-work',
  'salary-advance',
  'resignation',
  'employee-warning',
  'performance-evaluation',
  'purchase-request',
  'receipt-voucher',
] as const;

export type FormBrandingDocKey = typeof FORM_BRANDING_DOC_KEYS[number];

/** Any document that owns a signature/stamp layout. */
export type BrandingDocKey = PrintDocumentType | FormBrandingDocKey;

export interface BrandingElementLayout {
  x: number;
  y: number;
  scale: number;
  opacity: number;
  zIndex: number;
}

export interface BrandingLayout {
  signature: BrandingElementLayout;
  stamp: BrandingElementLayout;
}

/**
 * One layout per document. `invoice`/`quotation` stay REQUIRED so every existing
 * reader keeps its guarantees; each administrative form contributes an OPTIONAL entry
 * that simply appears the first time that form's design mode is saved. An absent entry
 * resolves to the identity layout — i.e. exactly where the template already draws.
 */
export type PrintBrandingLayoutSettings =
  Record<PrintDocumentType, BrandingLayout> &
  Partial<Record<FormBrandingDocKey, BrandingLayout>>;

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
  signatureUrl?: string;
  stampUrl?: string;
  showSignature?: boolean;
  showStamp?: boolean;
  brandingLayout?: PrintBrandingLayoutSettings;
  inkMode?: 'original' | 'blue-ink' | 'black';
  textStyleOverrides?: PrintTextStyleSettings;
  staticTextOverrides?: StaticTextOverrides;
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
  projectName?: string;
  projectLocation?: string;
  introText?: string;
  lineItems: PrintLineItem[];
  subtotal?: number;
  discount?: number;
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
