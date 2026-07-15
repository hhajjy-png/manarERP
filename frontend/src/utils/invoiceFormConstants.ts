// ─────────────────────────────────────────────────────────────────────────
//  ثوابت نماذج الفاتورة (إنشاء/تعديل) — مُستخرَجة حرفيًا من Invoices.tsx دون أي
//  تغيير سلوكي (refactor بحت)، لتُستخدم من CreateInvoice وEditInvoice معًا بدل
//  نسختين منفصلتين.
// ─────────────────────────────────────────────────────────────────────────

export const invoiceTypes = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت', 'أخرى'] as const;
export const INVOICE_YEAR_OPTIONS = [2024, 2025, 2026, 2027, 2028] as const;
export const DEFAULT_INVOICE_YEAR = String(new Date().getFullYear());
