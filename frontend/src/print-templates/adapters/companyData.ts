import type { CompanyPrintData } from '../engine/types';

/**
 * Al-Manar company data for print templates.
 *
 * This is the authoritative static source for all company fields used in
 * printed documents.  If the company data ever becomes dynamic (stored in
 * Settings), this constant becomes the fallback default and
 * `createCompanyPrintData` would accept fetched data as overrides.
 *
 * Source: verified against all 5 invoice HTML design files.
 */
export const ALMANAR_COMPANY: Readonly<CompanyPrintData> = {
  nameAr: 'شركة المنار الدولية',
  nameEn: 'Al Manar Al Duwaliya Company',
  taglineAr: 'لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق',
  taglineEn: 'For construction and maintenance of roads streets pavements and road supplies',
  capitalAr: 'رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي',
  capitalEn: 'Paid-up capital: 500,000 thousand K.D.',
  phone: '99333820 / 94404401',
  fax: '98777887',
  email: 'Manar.int.co@gmail.com',
  addressAr: 'الكويت',
  addressEn: 'Kuwait',
};

/**
 * Returns the default company print data.
 *
 * Use this instead of referencing `ALMANAR_COMPANY` directly — it makes
 * future Settings-API integration a single-file change.
 */
export function getDefaultCompanyPrintData(): CompanyPrintData {
  return ALMANAR_COMPANY;
}

/**
 * Merges shallow overrides into the default company data.
 *
 * All string overrides are applied — including empty strings, which are
 * treated as intentional. Only `undefined` values fall back to the default.
 * Use `??` semantics: an explicit `''` clears a field; omitting the key
 * keeps the default.
 *
 * @example
 * // Use a different email for a specific document type
 * createCompanyPrintData({ email: 'accounting@manar.kw' })
 *
 * // Intentionally clear a field (e.g. hide fax number on print)
 * createCompanyPrintData({ fax: '' })
 *
 * // No overrides → returns a copy of ALMANAR_COMPANY
 * createCompanyPrintData()
 */
export function createCompanyPrintData(overrides?: Partial<CompanyPrintData>): CompanyPrintData {
  if (!overrides) return { ...ALMANAR_COMPANY };
  const result: CompanyPrintData = { ...ALMANAR_COMPANY };
  (Object.keys(overrides) as Array<keyof CompanyPrintData>).forEach((key) => {
    const value = overrides[key];
    if (typeof value === 'string') {
      (result as unknown as Record<string, string>)[key] = value;
    }
  });
  return result;
}
