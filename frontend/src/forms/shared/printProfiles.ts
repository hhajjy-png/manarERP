export interface PrintProfile {
  id: string;
  labelAr: string;
  labelEn: string;
  /**
   * Whether users may switch to this profile from a form's PrintProfileToggle.
   * Only general document "shells" (plain A4, company letterhead, ready paper) are
   * selectable. Document-specific profiles (payment/receipt vouchers) are margin
   * presets used by their own dedicated pages and must NOT appear as options on
   * other forms.
   */
  selectable: boolean;
  /**
   * Whether this profile represents a pre-printed physical sheet, so the on-screen
   * company header (FormHeader) and its reserved clearance are hidden — the
   * physical paper already carries the letterhead. Shared by every "blank sheet"
   * profile (letterhead, ready-paper); each profile still owns its own config
   * object, so this flag can diverge per profile later without affecting others.
   */
  blankHeader: boolean;
  /**
   * Whether FormLayout should render the official `logohead.png` header image
   * (logo mark + Arabic + English name, as one flattened image — the same asset
   * and component already used by the Payment Voucher's `useLogoHeader` opt-in)
   * automatically for every form on this profile, with no per-form prop needed.
   * Only meaningful when `blankHeader` is also true: it turns the "hidden,
   * assume-pre-printed" header back on as a rendered logo image instead of
   * plain text — the profile's own margins/page config are untouched either way.
   * False/omitted for every other profile, so this is strictly additive.
   */
  logoHeader: boolean;
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
    selectable: true,
    blankHeader: false,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '10mm', right: '10mm', bottom: '10mm', left: '10mm' },
  },
  'letterhead': {
    id: 'letterhead',
    labelAr: 'ورق الشركة الرسمي',
    labelEn: 'Al Manar Letterhead',
    selectable: true,
    blankHeader: true,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' },
  },
  /**
   * "Ready Paper": an intentionally independent config object — not a
   * reference/alias to `letterhead` — so it can keep diverging without ever
   * touching `letterhead` or any form still on it.
   *
   * Phase 1 made it byte-identical to `letterhead` (same margins/page/blankHeader).
   * Phase 2 (this pack) adds `logoHeader: true` only: FormLayout renders the same
   * official `logohead.png` header image used by the Payment Voucher instead of
   * hiding the header. margins/page are UNCHANGED from Phase 1 — still identical
   * to `letterhead` — so the printable content band and Preview/print positioning
   * stay exactly where they were; only the header's own content differs.
   */
  'ready-paper': {
    id: 'ready-paper',
    labelAr: 'ورق جاهز',
    labelEn: 'Ready Paper',
    selectable: true,
    blankHeader: true,
    logoHeader: true,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '40mm', right: '10mm', bottom: '20mm', left: '10mm' },
  },
  'payment-voucher': {
    id: 'payment-voucher',
    labelAr: 'سند صرف',
    labelEn: 'Payment Voucher',
    selectable: false,
    blankHeader: false,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '12mm', right: '15mm', bottom: '12mm', left: '15mm' },
  },
  'receipt-voucher': {
    id: 'receipt-voucher',
    labelAr: 'سند قبض',
    labelEn: 'Receipt Voucher',
    selectable: false,
    blankHeader: false,
    logoHeader: false,
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
 * Profile IDs a user may switch between from a form's PrintProfileToggle.
 * Derived from the `selectable` flag so document-specific profiles (vouchers)
 * never leak into HR/ops form toolbars.
 */
export const SELECTABLE_PROFILE_IDS: ProfileId[] = (
  Object.keys(PRINT_PROFILES) as ProfileId[]
).filter((id) => PRINT_PROFILES[id].selectable);

/**
 * Reads ?printMode URL param once at page mount to seed initial profile state.
 * After mount, profile is managed as local React state only — URL is never updated.
 *
 * Accepts any `selectable` profile id (derived from `PRINT_PROFILES` — no
 * hardcoded id list to maintain as profiles are added/removed). Anything else
 * — missing, unrecognized, or a non-selectable id like a voucher profile —
 * falls back to `DEFAULT_PROFILE_ID`, exactly as before.
 */
export function getProfileIdFromSearch(search: string): ProfileId {
  const mode = new URLSearchParams(search).get('printMode');
  return mode && SELECTABLE_PROFILE_IDS.includes(mode as ProfileId)
    ? (mode as ProfileId)
    : DEFAULT_PROFILE_ID;
}

/**
 * Returns CSS padding shorthand string: 'top right bottom left'.
 * Usage: `padding: ${getPrintProfileStyle(PRINT_PROFILES[profile])} !important`
 */
export function getPrintProfileStyle(profile: PrintProfile): string {
  const { top, right, bottom, left } = profile.margins;
  return `${top} ${right} ${bottom} ${left}`;
}
