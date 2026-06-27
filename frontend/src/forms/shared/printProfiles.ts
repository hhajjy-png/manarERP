export interface PrintProfile {
  id: string;
  labelAr: string;
  labelEn: string;
  page: {
    size: 'A4';
    orientation: 'portrait' | 'landscape';
  };
  margins: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
}

export const PRINT_PROFILES: Record<string, PrintProfile> = {
  'plain-a4': {
    id: 'plain-a4',
    labelAr: 'A4 عادي',
    labelEn: 'Plain A4',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  },
  'letterhead': {
    id: 'letterhead',
    labelAr: 'ورق الشركة الرسمي',
    labelEn: 'Al Manar Letterhead',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' },
  },
  'payment-voucher': {
    id: 'payment-voucher',
    labelAr: 'سند صرف',
    labelEn: 'Payment Voucher',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
  },
  'receipt-voucher': {
    id: 'receipt-voucher',
    labelAr: 'سند قبض',
    labelEn: 'Receipt Voucher',
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
  },
  // Future profiles are added here only. No API or component changes required.
  // 'letterhead-en': { ... },
  // 'invoice-template-a': { ... },
};

/**
 * ProfileId is derived from PRINT_PROFILES keys.
 * Adding a new entry automatically widens this type — no manual maintenance.
 */
export type ProfileId = keyof typeof PRINT_PROFILES;

export const DEFAULT_PROFILE_ID: ProfileId = 'plain-a4';

/**
 * Reads ?printMode URL param once at page mount to seed initial profile state.
 * After mount, profile is managed as local React state only — URL is never updated.
 */
export function getProfileIdFromSearch(search: string): ProfileId {
  const mode = new URLSearchParams(search).get('printMode');
  return mode === 'letterhead' ? 'letterhead' : DEFAULT_PROFILE_ID;
}

/**
 * Returns CSS padding shorthand string: 'top right bottom left'.
 * Usage: `padding: ${getPrintProfileStyle(PRINT_PROFILES[profile])} !important`
 */
export function getPrintProfileStyle(profile: PrintProfile): string {
  const { top, right, bottom, left } = profile.margins;
  return `${top} ${right} ${bottom} ${left}`;
}
