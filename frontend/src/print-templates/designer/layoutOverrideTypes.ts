import type { PrintDocumentType } from '../engine/types';

export interface LayoutElementOverride {
  x: number;        // px offset from natural position (translate X)
  y: number;        // px offset from natural position (translate Y)
  rotation: number; // degrees, -180 to 180
  scaleX: number;   // width scale, 0.1 to 5
  scaleY: number;   // height scale, 0.1 to 5
  zIndex: number;   // 1 to 20
  opacity: number;  // 0.1 to 1
  hidden: boolean;
  locked: boolean;
}

// keyed by data-designer-id value, e.g. 'invoice.title'
export type DocumentLayoutOverrides = Partial<Record<string, LayoutElementOverride>>;

export type AllLayoutOverrides = Record<PrintDocumentType, DocumentLayoutOverrides>;

// IDs eligible for layout manipulation (excludes table internals)
export const LAYOUT_ELEMENT_IDS = [
  'invoice.title',
  'invoice.customerBlock',
  'invoice.tableBorder',
  'invoice.footerBlock',
  'quotation.title',
  'quotation.customerBlock',
  'quotation.tableBorder',
  'quotation.footerBlock',
] as const;

export type LayoutElementId = typeof LAYOUT_ELEMENT_IDS[number];

export const LAYOUT_ELEMENT_LABELS: Record<string, string> = {
  'invoice.title': 'عنوان الفاتورة',
  'invoice.customerBlock': 'بيانات العميل',
  'invoice.tableBorder': 'جدول البنود',
  'invoice.footerBlock': 'تذييل الصفحة',
  'quotation.title': 'عنوان عرض السعر',
  'quotation.customerBlock': 'بيانات العميل',
  'quotation.tableBorder': 'جدول البنود',
  'quotation.footerBlock': 'تذييل الصفحة',
};
