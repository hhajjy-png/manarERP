/**
 * Developer-only preview component for Phase 1.5 reference templates.
 *
 * NOT routed in App.tsx. NOT linked from the sidebar.
 * Import manually in a dev sandbox to verify template rendering.
 *
 * Usage:
 *   import ReferenceTemplatePreview from './print-templates/reference/ReferenceTemplatePreview';
 *   // Render <ReferenceTemplatePreview /> in a temporary dev page.
 */

import { useState } from 'react';

import { InvoiceDesign1 } from './invoices';
import { InvoiceDesign1Blank } from './invoices';
import { InvoiceDesign2 } from './invoices';
import { InvoiceDesign2Blank } from './invoices';
import { InvoiceDesign3 } from './invoices';
import { InvoiceDesign3Blank } from './invoices';
import { InvoiceDesign4 } from './invoices';
import { InvoiceDesign4Blank } from './invoices';
import { InvoiceDesign5 } from './invoices';
import { InvoiceDesign5Blank } from './invoices';
import { QuotationDesign1 } from './quotations';
import { QuotationDesign1Blank } from './quotations';
import { QuotationDesign2 } from './quotations';
import { QuotationDesign2Blank } from './quotations';
import { QuotationDesign3 } from './quotations';
import { QuotationDesign3Blank } from './quotations';
import { PurchaseOrderDesign1 } from './purchase-orders';
import { PurchaseOrderDesign1Blank } from './purchase-orders';
import { PurchaseOrderDesign2 } from './purchase-orders';
import { PurchaseOrderDesign2Blank } from './purchase-orders';
import { RFQDesign1 } from './rfq';
import { RFQDesign1Blank } from './rfq';
import { RFQDesign2 } from './rfq';
import { RFQDesign2Blank } from './rfq';
import { RFQDesign3 } from './rfq';
import { RFQDesign3Blank } from './rfq';

const TEMPLATES: { label: string; component: React.ComponentType }[] = [
  { label: 'Invoice 1', component: InvoiceDesign1 },
  { label: 'Invoice 1 (Blank)', component: InvoiceDesign1Blank },
  { label: 'Invoice 2', component: InvoiceDesign2 },
  { label: 'Invoice 2 (Blank)', component: InvoiceDesign2Blank },
  { label: 'Invoice 3', component: InvoiceDesign3 },
  { label: 'Invoice 3 (Blank)', component: InvoiceDesign3Blank },
  { label: 'Invoice 4', component: InvoiceDesign4 },
  { label: 'Invoice 4 (Blank)', component: InvoiceDesign4Blank },
  { label: 'Invoice 5', component: InvoiceDesign5 },
  { label: 'Invoice 5 (Blank)', component: InvoiceDesign5Blank },
  { label: 'Quotation 1', component: QuotationDesign1 },
  { label: 'Quotation 1 (Blank)', component: QuotationDesign1Blank },
  { label: 'Quotation 2', component: QuotationDesign2 },
  { label: 'Quotation 2 (Blank)', component: QuotationDesign2Blank },
  { label: 'Quotation 3', component: QuotationDesign3 },
  { label: 'Quotation 3 (Blank)', component: QuotationDesign3Blank },
  { label: 'Purchase Order 1', component: PurchaseOrderDesign1 },
  { label: 'Purchase Order 1 (Blank)', component: PurchaseOrderDesign1Blank },
  { label: 'Purchase Order 2', component: PurchaseOrderDesign2 },
  { label: 'Purchase Order 2 (Blank)', component: PurchaseOrderDesign2Blank },
  { label: 'RFQ 1', component: RFQDesign1 },
  { label: 'RFQ 1 (Blank)', component: RFQDesign1Blank },
  { label: 'RFQ 2', component: RFQDesign2 },
  { label: 'RFQ 2 (Blank)', component: RFQDesign2Blank },
  { label: 'RFQ 3', component: RFQDesign3 },
  { label: 'RFQ 3 (Blank)', component: RFQDesign3Blank },
];

export default function ReferenceTemplatePreview() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const Selected = TEMPLATES[selectedIndex].component;

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      <div style={{ width: 220, overflowY: 'auto', borderRight: '1px solid #ccc', padding: 8 }}>
        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 12, color: '#555' }}>
          REFERENCE TEMPLATES
        </div>
        {TEMPLATES.map((t, i) => (
          <button
            key={t.label}
            onClick={() => setSelectedIndex(i)}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '6px 8px',
              border: 'none',
              background: i === selectedIndex ? '#30246C' : 'transparent',
              color: i === selectedIndex ? '#fff' : '#333',
              cursor: 'pointer',
              fontSize: 12,
              borderRadius: 4,
              marginBottom: 2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'auto', background: '#eee', display: 'flex', justifyContent: 'center', padding: 24 }}>
        <div style={{ transform: 'scale(0.75)', transformOrigin: 'top center' }}>
          <Selected />
        </div>
      </div>
    </div>
  );
}
