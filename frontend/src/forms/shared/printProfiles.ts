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
  /**
   * Payment Voucher on the company's PRE-PRINTED letterhead paper.
   *
   * A separate, document-specific profile — NOT a change to any existing one.
   * `payment-voucher` (the standard sheet) is untouched, and so is every general
   * profile; `selectable: false` keeps this out of every other form's toggle,
   * exactly like `payment-voucher`/`receipt-voucher`.
   *
   * `blankHeader: true` (with no `logoHeader`) hides the on-screen company header —
   * the physical sheet already carries it, which is the whole point.
   *
   * Margins are the Product Owner's stated content band for the printed stationery:
   * the form starts 45mm from the sheet's top edge (clear of the printed letterhead)
   * and stops 20mm above the bottom edge (clear of the printed footer). The page box
   * itself enforces this — the browser cannot paint outside it — so no element can
   * drift into either band. Left/right stay at the voucher's existing 15mm.
   */
  'payment-voucher-letterhead': {
    id: 'payment-voucher-letterhead',
    labelAr: 'سند صرف — ورق الشركة الرسمي',
    labelEn: 'Payment Voucher — Company Letterhead',
    selectable: false,
    blankHeader: true,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '45mm', right: '15mm', bottom: '20mm', left: '15mm' },
  },
  /**
   * Receipt Voucher on the company's PRE-PRINTED letterhead paper.
   *
   * The sibling of `payment-voucher-letterhead`, and like it a separate entry —
   * NOT a change to any existing profile. `receipt-voucher` (the standard sheet)
   * is untouched, and `selectable: false` keeps this out of every other form's
   * toggle.
   *
   * `blankHeader: true` (with no `logoHeader`) marks it as a pre-printed sheet:
   * the physical paper already carries the letterhead, so the form must not draw
   * one.
   *
   * Margins are the Product Owner's stated content band for the receipt voucher's
   * stationery: content starts 50mm from the sheet's top edge (the receipt sheet
   * reserves 5mm more than the payment voucher's 45mm) and stops 20mm above the
   * bottom edge. Left/right stay at the Receipt Voucher's existing 15mm — the same
   * value its current `@page { size: A4; margin: 12mm 15mm }` rule already uses, so
   * the horizontal geometry does not move between the two sheets.
   */
  'receipt-voucher-letterhead': {
    id: 'receipt-voucher-letterhead',
    labelAr: 'سند قبض — ورق الشركة الرسمي',
    labelEn: 'Receipt Voucher — Company Letterhead',
    selectable: false,
    blankHeader: true,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '50mm', right: '15mm', bottom: '20mm', left: '15mm' },
  },
  /**
   * إقرار دين موظف على ورق الشركة **المطبوع مسبقًا**.
   *
   * ملف مستقل تمامًا — لا تعديل على أي ملف قائم. `letterhead` بهوامشه الحالية
   * (40/10/20/10) لم يُمَسّ، وكل نموذج يستعمله يبقى كما هو حرفًا بحرف؛ وكما هو الحال
   * مع `payment-voucher-letterhead` و`receipt-voucher-letterhead`، فإن
   * `selectable: false` تُبقي هذا الملف خارج مبدّل ملفات الطباعة في كل نموذج آخر.
   *
   * `blankHeader: true` (وبلا `logoHeader`) تعني: الورقة الفيزيائية تحمل ترويسة
   * الشركة وتذييلها، فلا يرسم النموذج ترويسة ولا شعارًا.
   *
   * الهندسة — مطلب مالك المنتج لهذا المستند تحديدًا:
   *   · أعلى 40mm فارغة لترويسة الورق المطبوعة.
   *   · أسفل 20mm فارغة لتذييل الورق المطبوع.
   * ولأن هذه القيم تصبح هامش `@page`، يفرضها المتصفح على **كل** صفحة من صفحات
   * المستند الأربع، لا على الأولى وحدها.
   *
   * أما 16.5mm يمينًا ويسارًا فهي هامش ملفات Word المصدرية نفسها
   * (`w:pgMar right/left = 935 twips`) — منقولة كما هي لأقرب مطابقة ممكنة للأصل،
   * وهي أضيق من 10mm المستعملة في `letterhead` فلا تقترب من حواف الورق.
   */
  'employee-debt-acknowledgment-letterhead': {
    id: 'employee-debt-acknowledgment-letterhead',
    labelAr: 'إقرار دين موظف — ورق الشركة الرسمي',
    labelEn: 'Employee Debt Acknowledgment — Company Letterhead',
    selectable: false,
    blankHeader: true,
    logoHeader: false,
    page: { size: 'A4', orientation: 'portrait' },
    margins: { top: '40mm', right: '16.5mm', bottom: '20mm', left: '16.5mm' },
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
