import type { ComponentType } from 'react';
import {
  PurchaseOrderDesign1,
  PurchaseOrderDesign1Blank,
  PurchaseOrderDesign2,
  PurchaseOrderDesign2Blank,
} from '../reference/purchase-orders';
import type { PrintTemplateComponent, PrintTemplateDefinition } from './types';

function bridge(c: ComponentType): PrintTemplateComponent {
  return c as unknown as PrintTemplateComponent;
}

export const purchaseOrderTemplateDefinitions: PrintTemplateDefinition[] = [
  {
    id: 'purchase-order-design-1',
    category: 'purchase-order',
    nameAr: 'أمر شراء – تصميم ١',
    nameEn: 'Purchase Order – Design 1',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(PurchaseOrderDesign1),
    sourceFile: 'docs/html/po1.html',
  },
  {
    id: 'purchase-order-design-1-blank',
    category: 'purchase-order',
    nameAr: 'أمر شراء – تصميم ١ (ترويسة مطبوعة)',
    nameEn: 'Purchase Order – Design 1 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(PurchaseOrderDesign1Blank),
    sourceFile: 'docs/html/po1_blank.html',
  },
  {
    id: 'purchase-order-design-2',
    category: 'purchase-order',
    nameAr: 'أمر شراء – تصميم ٢',
    nameEn: 'Purchase Order – Design 2',
    variant: 'original',
    language: 'bilingual',
    supports: { plainA4: true, letterhead: false },
    component: bridge(PurchaseOrderDesign2),
    sourceFile: 'docs/html/po2.html',
  },
  {
    id: 'purchase-order-design-2-blank',
    category: 'purchase-order',
    nameAr: 'أمر شراء – تصميم ٢ (ترويسة مطبوعة)',
    nameEn: 'Purchase Order – Design 2 (Letterhead)',
    variant: 'blank-letterhead',
    language: 'bilingual',
    supports: { plainA4: false, letterhead: true },
    component: bridge(PurchaseOrderDesign2Blank),
    sourceFile: 'docs/html/po2_blank.html',
  },
];
