export type InvoiceStaticKey =
  | 'invoice.titleAr'
  | 'invoice.titleEn'
  | 'invoice.paymentTermsLabel'
  | 'invoice.paymentTermsText'
  | 'invoice.footerAccountant'
  | 'invoice.footerManager';

export type QuotationStaticKey =
  | 'quotation.titleAr'
  | 'quotation.titleEn'
  | 'quotation.footerSignatoryRole'
  | 'quotation.footerAddressAr'
  | 'quotation.footerAddressEn';

export type StaticTextKey = InvoiceStaticKey | QuotationStaticKey;

export type StaticTextOverrides = Partial<Record<StaticTextKey, string>>;

export const DEFAULT_STATIC_TEXT: Readonly<Record<StaticTextKey, string>> = {
  'invoice.titleAr': 'فاتورة نقداً / بالحساب',
  'invoice.titleEn': 'Cash / Credit Invoice',
  'invoice.paymentTermsLabel': 'شروط الدفع',
  'invoice.paymentTermsText': 'السداد خلال 30 يوماً من تاريخ الفاتورة.',
  'invoice.footerAccountant': 'المحاسبة',
  'invoice.footerManager': 'المسؤول',
  'quotation.titleAr': 'عرض سعر',
  'quotation.titleEn': 'Price Quotation',
  'quotation.footerSignatoryRole': 'عن شركة المنار الدولية',
  'quotation.footerAddressAr': 'جليب الشيوخ - المجمع التجاري الروضة - الدور الثاني - مكتب ١٣',
  'quotation.footerAddressEn': 'Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13',
};

export const STATIC_TEXT_LIMITS: Readonly<Record<StaticTextKey, number>> = {
  'invoice.titleAr': 60,
  'invoice.titleEn': 60,
  'invoice.paymentTermsLabel': 40,
  'invoice.paymentTermsText': 100,
  'invoice.footerAccountant': 40,
  'invoice.footerManager': 40,
  'quotation.titleAr': 60,
  'quotation.titleEn': 60,
  'quotation.footerSignatoryRole': 60,
  'quotation.footerAddressAr': 80,
  'quotation.footerAddressEn': 80,
};
