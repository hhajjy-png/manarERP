/**
 * اشتقاق سنة رقم الفاتورة من تاريخ الإصدار (لا من ساعة الجهاز).
 *
 * رقم الفاتورة `MN-INV-<سنة>-<تسلسل>` يجب أن تعكس سنته تاريخ الإصدار، حتى لا تحصل
 * فاتورة 2024 مُدخَلة في 2026 على `MN-INV-2026-…`. الترقيم في الـ backend مُنطاق
 * لكل سنة أصلًا (MAX per prefix)، فاختيار السنة الصحيحة كافٍ — بلا Migration، وبلا
 * إعادة ترقيم أي سجل قائم.
 *
 * منطق نقي (لا React) ليُختبَر مباشرةً. التواريخ محلية بصيغة `YYYY-MM-DD`.
 */
export function deriveInvoiceYearFromIssueDate(issueDate: string | undefined | null, fallback: number): number {
  if (!issueDate || !/^\d{4}-\d{2}-\d{2}/.test(issueDate)) return fallback;
  const year = Number(issueDate.slice(0, 4));
  return Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : fallback;
}
