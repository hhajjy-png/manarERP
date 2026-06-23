// ─── Document types ────────────────────────────────────────────────────────────
export type TemplateStudioDocumentType = 'invoice' | 'quotation';

// ─── Style tokens — no arbitrary CSS allowed ──────────────────────────────────
export type StudioFontSize    = 'small' | 'normal' | 'large' | 'xlarge';
export type StudioFontWeight  = 'regular' | 'medium' | 'bold';
export type StudioTextColor   = 'default' | 'brand' | 'dark' | 'blue' | 'black' | 'gray';
export type StudioTextAlign   = 'start' | 'center' | 'end';
export type StudioColorToken  = 'transparent' | 'white' | 'light' | 'gray' | 'brand' | 'dark' | 'black';

export interface StudioTextStyle {
  fontSize?:   StudioFontSize;
  fontWeight?: StudioFontWeight;
  color?:      StudioTextColor;
  align?:      StudioTextAlign;
}

// ─── Base element ─────────────────────────────────────────────────────────────
interface BaseElement {
  id:        string;  // unique within template
  label:     string;  // human-readable label for editor UI
  x:         number;  // mm from left edge
  y:         number;  // mm from top edge
  w:         number;  // mm width
  h:         number;  // mm height
  rotation:  number;  // degrees (0 = no rotation)
  locked?:   boolean;
  hidden?:   boolean;
}

// ─── Element types (discriminated union on `type`) ────────────────────────────
export interface TextElement extends BaseElement {
  type:    'text';
  content: string;
  style:   StudioTextStyle;
}

export interface DynamicFieldElement extends BaseElement {
  type:  'dynamicField';
  field: string; // must be in INVOICE_ALLOWED_FIELDS or QUOTATION_ALLOWED_FIELDS
  style?: StudioTextStyle;
}

export interface QrElement extends BaseElement {
  type:  'qr';
  field: string; // allowed field to encode; empty = encode template name
}

export interface BarcodeElement extends BaseElement {
  type:  'barcode';
  field: string; // allowed field value to encode
}

export interface ImageElement extends BaseElement {
  type: 'image';
  src:  string; // data URL only (no external URLs)
  alt:  string;
}

export interface LineElement extends BaseElement {
  type:        'line';
  orientation: 'horizontal' | 'vertical';
  color:       StudioColorToken;
  thickness:   number; // mm
}

export interface RectElement extends BaseElement {
  type:         'rect';
  fillColor:    StudioColorToken;
  borderColor:  StudioColorToken;
  borderRadius: number; // mm
}

export interface CircleElement extends BaseElement {
  type:        'circle';
  fillColor:   StudioColorToken;
  borderColor: StudioColorToken;
}

export type TemplateStudioElement =
  | TextElement
  | DynamicFieldElement
  | QrElement
  | BarcodeElement
  | ImageElement
  | LineElement
  | RectElement
  | CircleElement;

export type TemplateStudioElementType = TemplateStudioElement['type'];

// Validated set of known element types
export const ALLOWED_ELEMENT_TYPES: ReadonlySet<TemplateStudioElementType> = new Set([
  'text', 'dynamicField', 'qr', 'barcode', 'image', 'line', 'rect', 'circle',
]);

// ─── Template page settings ───────────────────────────────────────────────────
export interface TemplatePageSettings {
  size:        'A4';
  orientation: 'portrait';
  marginMm:    number; // uniform page margin in mm
}

// ─── Template ─────────────────────────────────────────────────────────────────
export interface TemplateStudioTemplate {
  id:           string;
  name:         string;  // max 60 chars (sanitized)
  documentType: TemplateStudioDocumentType;
  page:         TemplatePageSettings;
  elements:     TemplateStudioElement[];
  createdAt:    string;  // ISO date string
  updatedAt:    string;  // ISO date string
}

// ─── Root settings blob stored at print.templateStudio.templates ──────────────
export interface TemplateStudioSettings {
  version:   1;
  templates: TemplateStudioTemplate[];
}

// ─── Dynamic field allowlists ─────────────────────────────────────────────────
export const INVOICE_ALLOWED_FIELDS = [
  'invoice.number',
  'invoice.date',
  'invoice.customerName',
  'invoice.customerAddress',
  'invoice.total',
  'invoice.subtotal',
  'invoice.discount',
  'invoice.tax',
  'invoice.grandTotal',
  'invoice.notes',
] as const;

export const QUOTATION_ALLOWED_FIELDS = [
  'quotation.number',
  'quotation.date',
  'quotation.customerName',
  'quotation.customerAddress',
  'quotation.total',
  'quotation.notes',
] as const;

export type InvoiceAllowedField  = (typeof INVOICE_ALLOWED_FIELDS)[number];
export type QuotationAllowedField = (typeof QUOTATION_ALLOWED_FIELDS)[number];

// ─── Result types ─────────────────────────────────────────────────────────────
export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}

export type ImportResult =
  | { ok: true;  template: TemplateStudioTemplate }
  | { ok: false; error: string };
