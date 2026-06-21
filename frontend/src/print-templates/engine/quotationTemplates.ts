import type { ComponentType } from 'react';
import {
  QuotationDesign1,
  QuotationDesign1Blank,
  QuotationDesign2,
  QuotationDesign2Blank,
  QuotationDesign3,
  QuotationDesign3Blank,
} from '../reference/quotations';
import type { PrintTemplateComponent, PrintTemplateDefinition } from './types';

function bridge(c: ComponentType): PrintTemplateComponent {
  return c as unknown as PrintTemplateComponent;
}

export const quotationTemplateDefinitions: PrintTemplateDefinition[] = [
  {
    id: 'quotation-design-1',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ١',
    nameEn: 'Quotation – Design 1',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(QuotationDesign1),
    sourceFile: 'docs/html/qt1.html',
  },
  {
    id: 'quotation-design-1-blank',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ١ (ترويسة مطبوعة)',
    nameEn: 'Quotation – Design 1 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(QuotationDesign1Blank),
    sourceFile: 'docs/html/qt1_blank.html',
  },
  {
    id: 'quotation-design-2',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ٢',
    nameEn: 'Quotation – Design 2',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(QuotationDesign2),
    sourceFile: 'docs/html/qt2.html',
  },
  {
    id: 'quotation-design-2-blank',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ٢ (ترويسة مطبوعة)',
    nameEn: 'Quotation – Design 2 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(QuotationDesign2Blank),
    sourceFile: 'docs/html/qt2_blank.html',
  },
  {
    id: 'quotation-design-3',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ٣',
    nameEn: 'Quotation – Design 3',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(QuotationDesign3),
    sourceFile: 'docs/html/qt3.html',
  },
  {
    id: 'quotation-design-3-blank',
    category: 'quotation',
    nameAr: 'عرض سعر – تصميم ٣ (ترويسة مطبوعة)',
    nameEn: 'Quotation – Design 3 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(QuotationDesign3Blank),
    sourceFile: 'docs/html/qt3_blank.html',
  },
];
