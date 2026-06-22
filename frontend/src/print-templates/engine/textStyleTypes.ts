// ─── Token types — finite sets only, no arbitrary CSS ────────────────────────

export type TextFontSize       = 'small' | 'normal' | 'large' | 'xlarge';
export type TextFontFamily     = 'cairo' | 'ibmPlexArabic';
export type TextFontWeight     = 'regular' | 'medium' | 'bold';
export type TextColor          = 'default' | 'brand' | 'dark' | 'blue' | 'black' | 'gray';
export type TextAlign          = 'start' | 'center' | 'end';
export type TextLineHeight     = 'tight' | 'normal' | 'relaxed';
export type TextLetterSpacing  = 'tight' | 'normal' | 'wide';
export type TableBgColor       = 'default' | 'brand' | 'dark' | 'blue' | 'black' | 'gray';
export type TableBorderColor   = 'default' | 'light' | 'medium' | 'dark' | 'none';

// ─── Element style descriptors ────────────────────────────────────────────────

export interface TextElementStyle {
  fontSize?:      TextFontSize;
  fontFamily?:    TextFontFamily;
  fontWeight?:    TextFontWeight;
  color?:         TextColor;
  align?:         TextAlign;
  lineHeight?:    TextLineHeight;
  letterSpacing?: TextLetterSpacing;
}

export interface TableHeaderStyle extends TextElementStyle {
  bgColor?: TableBgColor;
}

export interface TableBorderStyle {
  color?: TableBorderColor;
}

// ─── Document text area keys ──────────────────────────────────────────────────

export type InvoiceTextAreaKey =
  | 'title'
  | 'customerBlock'
  | 'metadataLabels'
  | 'tableHeader'
  | 'tableBorder'
  | 'lineItem'
  | 'totals'
  | 'sectionTitle'
  | 'footerNote';

export type QuotationTextAreaKey =
  | 'title'
  | 'customerBlock'
  | 'metadataLabels'
  | 'tableHeader'
  | 'tableBorder'
  | 'lineItem'
  | 'totals'
  | 'introText'
  | 'terms'
  | 'sectionTitle'
  | 'footerNote';

// ─── Per-document area maps ───────────────────────────────────────────────────

export interface InvoiceTextAreas {
  title?:          TextElementStyle;
  customerBlock?:  TextElementStyle;
  metadataLabels?: TextElementStyle;
  tableHeader?:    TableHeaderStyle;
  tableBorder?:    TableBorderStyle;
  lineItem?:       TextElementStyle;
  totals?:         TextElementStyle;
  sectionTitle?:   TextElementStyle;
  footerNote?:     TextElementStyle;
}

export interface QuotationTextAreas {
  title?:          TextElementStyle;
  customerBlock?:  TextElementStyle;
  metadataLabels?: TextElementStyle;
  tableHeader?:    TableHeaderStyle;
  tableBorder?:    TableBorderStyle;
  lineItem?:       TextElementStyle;
  totals?:         TextElementStyle;
  introText?:      TextElementStyle;
  terms?:          TextElementStyle;
  sectionTitle?:   TextElementStyle;
  footerNote?:     TextElementStyle;
}

// ─── Top-level settings shape ─────────────────────────────────────────────────

export interface PrintTextStyleSettings {
  invoice:   InvoiceTextAreas;
  quotation: QuotationTextAreas;
}

// ─── Human-readable labels (used in panel) ───────────────────────────────────

export const TEXT_AREA_LABELS: Record<InvoiceTextAreaKey | QuotationTextAreaKey, string> = {
  title:          'عنوان المستند',
  customerBlock:  'بيانات العميل',
  metadataLabels: 'تسميات البيانات',
  tableHeader:    'رأس الجدول',
  tableBorder:    'إطار الجدول',
  lineItem:       'صفوف البنود',
  totals:         'صف الإجمالي',
  sectionTitle:   'عنوان القسم',
  footerNote:     'ملاحظة التذييل',
  introText:      'نص المقدمة',
  terms:          'الشروط والأحكام',
};

export const FONT_SIZE_LABELS: Record<TextFontSize, string> = {
  small: 'صغير', normal: 'عادي', large: 'كبير', xlarge: 'كبير جداً',
};

export const FONT_FAMILY_LABELS: Record<TextFontFamily, string> = {
  cairo: 'Cairo', ibmPlexArabic: 'IBM Plex Arabic',
};

export const FONT_WEIGHT_LABELS: Record<TextFontWeight, string> = {
  regular: 'عادي', medium: 'متوسط', bold: 'عريض',
};

export const COLOR_LABELS: Record<TextColor, string> = {
  default: 'افتراضي', brand: 'العلامة', dark: 'داكن', blue: 'أزرق', black: 'أسود', gray: 'رمادي',
};

export const ALIGN_LABELS: Record<TextAlign, string> = {
  start: 'يمين', center: 'وسط', end: 'يسار',
};

export const LINE_HEIGHT_LABELS: Record<TextLineHeight, string> = {
  tight: 'ضيق', normal: 'عادي', relaxed: 'فسيح',
};

export const LETTER_SPACING_LABELS: Record<TextLetterSpacing, string> = {
  tight: 'ضيق', normal: 'عادي', wide: 'فسيح',
};

export const TABLE_BG_LABELS: Record<TableBgColor, string> = {
  default: 'افتراضي', brand: 'العلامة', dark: 'داكن', blue: 'أزرق', black: 'أسود', gray: 'رمادي',
};

export const TABLE_BORDER_LABELS: Record<TableBorderColor, string> = {
  default: 'افتراضي', light: 'فاتح', medium: 'متوسط', dark: 'داكن', none: 'بدون',
};
