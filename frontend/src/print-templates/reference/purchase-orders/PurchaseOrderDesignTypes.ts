export interface ReferencePurchaseOrderLineItem {
  number: number;
  description: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface ReferencePurchaseOrderData {
  poNumber: string;
  date: string;
  supplierName: string;
  lineItems: ReferencePurchaseOrderLineItem[];
  grandTotal: number;
}

export const samplePurchaseOrderData: ReferencePurchaseOrderData = {
  poNumber: 'PO-2026-0015',
  date: '20 / 06 / 2026',
  supplierName: 'شركة الخليج للمواد الإنشائية',
  lineItems: [
    { number: 1, description: 'أسفلت خلطة ساخنة', unit: 'طن', quantity: 50, unitPrice: 45, total: 2250 },
  ],
  grandTotal: 2250,
};
