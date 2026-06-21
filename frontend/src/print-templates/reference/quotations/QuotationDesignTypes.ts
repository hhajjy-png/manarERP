export interface ReferenceQuotationLineItem {
  number: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReferenceQuotationData {
  quoteNumber: string;
  date: string;
  toName: string;
  attention: string;
  validity: string;
  subject: string;
  lineItems: ReferenceQuotationLineItem[];
  grandTotal: number;
}

export const sampleQuotationData: ReferenceQuotationData = {
  quoteNumber: 'QT-2026-0061',
  date: '20 / 06 / 2026',
  toName: 'مصنع الخليج للأسفلت ذ.م.م',
  attention: 'إدارة المشاريع',
  validity: '15 يوماً',
  subject: 'عرض سعر – خدمات نقل أسفلت',
  lineItems: [
    { number: 1, description: 'نقل أسفلت خلطة ساخنة', unit: 'نقلة', quantity: 25, unitPrice: 20, total: 500 },
  ],
  grandTotal: 500,
};
