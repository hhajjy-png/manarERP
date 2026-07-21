export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

// Additive English counterpart — ARABIC_MONTHS above stays untouched (many
// callers across the app render it unconditionally regardless of UI language;
// migrating them is out of scope here). Use `getMonthName(index, lang)` in any
// NEW lang-aware call site instead of indexing ARABIC_MONTHS directly.
const ENGLISH_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** 0-based month index (0 = January) → localized month name. */
export function getMonthName(monthIndex: number, lang: 'ar' | 'en'): string {
  return (lang === 'en' ? ENGLISH_MONTHS : ARABIC_MONTHS)[monthIndex] ?? '';
}

export function billingYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1, y + 2];
}
