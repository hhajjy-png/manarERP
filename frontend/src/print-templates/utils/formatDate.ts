/**
 * Date formatting utilities for print templates.
 * All output is in the format expected by the Al-Manar print designs.
 */

/**
 * Formats a date for the Arabic print header: "DD / MM / YYYY"
 *
 * @example
 * formatDateForPrint("2026-06-20")  // "20 / 06 / 2026"
 * formatDateForPrint(new Date())    // "20 / 06 / 2026"
 */
export function formatDateForPrint(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd} / ${mm} / ${yyyy}`;
}

/**
 * Formats a date as "DD-MM-YYYY" (compact, for reference fields).
 */
export function formatDateCompact(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
}

const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

/**
 * Formats a date as "20 يونيو 2026" (Arabic long format for quotation/RFQ headers).
 */
export function formatDateArabicLong(date: string | Date | null | undefined): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return `${d.getDate()} ${ARABIC_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}
