export interface ReferenceInvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceDinars: number;
  unitPriceFils: number;
  totalDinars: number;
  totalFils: number;
}

export interface ReferenceInvoiceData {
  date: string;
  customerName: string;
  lineItems: ReferenceInvoiceLineItem[];
  totalInWords: string;
}

export const sampleInvoiceData: ReferenceInvoiceData = {
  date: '20 / 06 / 2026',
  customerName: 'مصنع الخليج للأسفلت ذ.م.م',
  lineItems: [
    { description: 'نقل أسفلت', quantity: 10, unitPriceDinars: 20, unitPriceFils: 0, totalDinars: 200, totalFils: 0 },
  ],
  totalInWords: 'مائتا دينار كويتي فقط لا غير',
};
