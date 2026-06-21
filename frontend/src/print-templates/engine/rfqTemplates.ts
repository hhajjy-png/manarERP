import type { ComponentType } from 'react';
import {
  RFQDesign1,
  RFQDesign1Blank,
  RFQDesign2,
  RFQDesign2Blank,
  RFQDesign3,
  RFQDesign3Blank,
} from '../reference/rfq';
import type { PrintTemplateComponent, PrintTemplateDefinition } from './types';

function bridge(c: ComponentType): PrintTemplateComponent {
  return c as unknown as PrintTemplateComponent;
}

export const rfqTemplateDefinitions: PrintTemplateDefinition[] = [
  {
    id: 'rfq-design-1',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ١',
    nameEn: 'RFQ – Design 1',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(RFQDesign1),
    sourceFile: 'docs/html/rfq1.html',
  },
  {
    id: 'rfq-design-1-blank',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ١ (ترويسة مطبوعة)',
    nameEn: 'RFQ – Design 1 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(RFQDesign1Blank),
    sourceFile: 'docs/html/rfq1_blank.html',
  },
  {
    id: 'rfq-design-2',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ٢',
    nameEn: 'RFQ – Design 2',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(RFQDesign2),
    sourceFile: 'docs/html/rfq2.html',
  },
  {
    id: 'rfq-design-2-blank',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ٢ (ترويسة مطبوعة)',
    nameEn: 'RFQ – Design 2 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(RFQDesign2Blank),
    sourceFile: 'docs/html/rfq2_blank.html',
  },
  {
    id: 'rfq-design-3',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ٣',
    nameEn: 'RFQ – Design 3',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(RFQDesign3),
    sourceFile: 'docs/html/rfq3.html',
  },
  {
    id: 'rfq-design-3-blank',
    category: 'rfq',
    nameAr: 'طلب عروض أسعار – تصميم ٣ (ترويسة مطبوعة)',
    nameEn: 'RFQ – Design 3 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(RFQDesign3Blank),
    sourceFile: 'docs/html/rfq3_blank.html',
  },
];
