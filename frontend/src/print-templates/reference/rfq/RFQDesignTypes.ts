export interface ReferenceRFQLineItem {
  number: number;
  description: string;
  unit: string;
  quantity: number;
  priceColumn1?: string;
  priceColumn2?: string;
  priceColumn3?: string;
}

export interface ReferenceRFQData {
  rfqNumber: string;
  date: string;
  toName: string;
  attention: string;
  subject: string;
  lineItems: ReferenceRFQLineItem[];
}

export const sampleRFQData: ReferenceRFQData = {
  rfqNumber: 'RFQ-2026-0023',
  date: '20 / 06 / 2026',
  toName: 'شركة الخليج للمواد الإنشائية',
  attention: 'إدارة المبيعات',
  subject: 'طلب عروض أسعار – مواد بناء',
  lineItems: [
    { number: 1, description: 'أسفلت خلطة ساخنة', unit: 'طن', quantity: 50 },
  ],
};
