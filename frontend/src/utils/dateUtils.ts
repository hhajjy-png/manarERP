export const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
] as const;

export function billingYearOptions(): number[] {
  const y = new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1, y + 2];
}
