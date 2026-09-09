// Tafqeet — unified Amount-to-Words engine for Kuwaiti Dinar (KWD, 1 KWD = 1000 fils).
//
// Single source of truth for this codebase's amount-in-words rendering. Consolidates
// what used to be three separately-maintained implementations:
//   - frontend/src/lib/tafqeet.ts (this file, "standard" Arabic variant)
//   - frontend/src/print-templates/utils/tafqeet.ts ("invoice-legacy" Arabic variant)
//   - backend/src/core/utils/tafqeet.ts (a manual mirror of the standard variant,
//     used only by backend test coverage — no backend production code calls it,
//     and it's kept as-is since the frontend/backend are separate TS projects with
//     no shared package boundary; see that file's own header comment)
//
// The two Arabic variants below are preserved BYTE-FOR-BYTE from their original
// implementations, under clearly-scoped internal names, rather than merged into one
// grammar engine — they produced (and still produce) genuinely different Arabic text
// for the same amount (different suffix/tamyeez rules, different فقط placement), and
// both were already live in production at different call sites. Unifying them into a
// single algorithm would change one side's already-shipped financial/legal document
// text, which this consolidation must not do.

import { roundMoney } from './money';

export type TafqeetLang = 'ar' | 'en';

// ═══════════════════════════════════════════════════════════════════════════════
// Arabic — STANDARD variant word tables (historical frontend/src/lib/tafqeet.ts).
// Used by: Cheques, Payment Voucher, Receipt Voucher, Salary Certificate,
// Employment Contract.
// ═══════════════════════════════════════════════════════════════════════════════

const AR_STD_ONES: string[] = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const AR_STD_TENS: string[] = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const AR_STD_HUNDREDS: string[] = [
  '', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

function arStdSpell(n: number): string {
  if (n <= 0 || n >= 1000) return '';
  if (n < 20) return AR_STD_ONES[n];

  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(AR_STD_HUNDREDS[hundreds]);

  if (rem > 0) {
    if (rem < 20) {
      parts.push(AR_STD_ONES[rem]);
    } else {
      const tens = Math.floor(rem / 10);
      const units = rem % 10;
      parts.push(units > 0 ? `${AR_STD_ONES[units]} و${AR_STD_TENS[tens]}` : AR_STD_TENS[tens]);
    }
  }

  return parts.join(' و');
}

function arStdSpellInt(n: number): string {
  if (n === 0) return 'صفر';
  if (n < 1000) return arStdSpell(n);

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions <= 10) parts.push(`${arStdSpell(millions)} ملايين`);
    else {
      const remM = millions % 100;
      parts.push(remM >= 11 && remM <= 99 ? `${arStdSpell(millions)} مليوناً` : `${arStdSpell(millions)} مليون`);
    }
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(`${arStdSpell(thousands)} آلاف`);
    else {
      const remT = thousands % 100;
      parts.push(remT >= 11 && remT <= 99 ? `${arStdSpell(thousands)} ألفاً` : `${arStdSpell(thousands)} ألف`);
    }
  }

  if (remainder > 0) parts.push(arStdSpell(remainder));

  return parts.join(' و');
}

function arStdWithDinarUnit(n: number): string {
  if (n === 1) return 'دينار كويتي واحد';
  if (n === 2) return 'ديناران كويتيان';
  if (n <= 10) return `${arStdSpellInt(n)} دنانير كويتية`;
  if (n <= 99) return `${arStdSpellInt(n)} ديناراً كويتياً`;
  const rem = n % 100;
  return rem >= 11 && rem <= 99
    ? `${arStdSpellInt(n)} ديناراً كويتياً`
    : `${arStdSpellInt(n)} دينار كويتي`;
}

function arStdWithFilsUnit(n: number): string {
  if (n === 1) return 'فلس واحد';
  if (n === 2) return 'فلسان';
  if (n <= 10) return `${arStdSpellInt(n)} فلوس`;
  if (n <= 99) return `${arStdSpellInt(n)} فلساً`;
  const rem = n % 100;
  return rem >= 11 && rem <= 99
    ? `${arStdSpellInt(n)} فلساً`
    : `${arStdSpellInt(n)} فلس`;
}

/**
 * Arabic "standard" tafqeet — historical `frontend/src/lib/tafqeet.ts` output,
 * unchanged. Handles amounts up to 999,999.999 KWD. Rejects negative input (returns
 * '') — the documents that use this variant never carry negative amounts.
 *
 * Examples:
 *   arabicStandard(0)      → "فقط صفر لا غير"
 *   arabicStandard(1)      → "فقط دينار كويتي واحد لا غير"
 *   arabicStandard(1000)   → "فقط ألف دينار كويتي لا غير"
 */
function arabicStandard(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  if (amount === 0) return 'فقط صفر لا غير';

  const rounded = roundMoney(amount);
  const dinars = Math.floor(rounded);
  const fils = Math.round((rounded - dinars) * 1000);

  const parts: string[] = [];
  if (dinars > 0) parts.push(arStdWithDinarUnit(dinars));
  if (fils > 0) parts.push(arStdWithFilsUnit(fils));

  return `فقط ${parts.join(' و')} لا غير`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Arabic — INVOICE-LEGACY variant word tables (historical
// frontend/src/print-templates/utils/tafqeet.ts). Used by: Invoice print templates
// only. Supports negative amounts via a credit-amount prefix (invoices can be
// credit notes).
// ═══════════════════════════════════════════════════════════════════════════════

const AR_INV_FORM_A: readonly string[] = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const AR_INV_TENS: readonly string[] = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const AR_INV_HUNDREDS: readonly string[] = [
  '', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

function arInvBelowHundred(n: number): string {
  if (n === 0) return '';
  if (n <= 19) return AR_INV_FORM_A[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return AR_INV_TENS[tens];
  return `${AR_INV_FORM_A[ones]} و${AR_INV_TENS[tens]}`;
}

function arInvBelowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 100) return arInvBelowHundred(n);
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (rem === 0) return AR_INV_HUNDREDS[h];
  return `${AR_INV_HUNDREDS[h]} و${arInvBelowHundred(rem)}`;
}

function arInvThousandsWord(n: number): string {
  if (n === 1) return 'ألف';
  if (n === 2) return 'ألفان';
  if (n <= 10) return `${AR_INV_FORM_A[n]} آلاف`;
  return `${arInvBelowThousand(n)} ألفاً`;
}

function arInvMillionsWord(n: number): string {
  if (n === 1) return 'مليون';
  if (n === 2) return 'مليونان';
  if (n <= 10) return `${AR_INV_FORM_A[n]} ملايين`;
  return `${arInvBelowThousand(n)} مليوناً`;
}

function arInvIntToWords(n: number): string {
  if (n === 0) return 'صفر';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (millions > 0) parts.push(arInvMillionsWord(millions));
  if (thousands > 0) parts.push(arInvThousandsWord(thousands));
  if (remainder > 0) parts.push(arInvBelowThousand(remainder));
  return parts.join(' و');
}

function arInvDinarSuffix(n: number): string {
  if (n === 0) return 'دينار كويتي';
  if (n === 1) return 'دينار كويتي';
  if (n === 2) return 'ديناران كويتيان';
  const last = n % 100;
  if (last >= 3 && last <= 10) return 'دنانير كويتية';
  return 'ديناراً كويتياً';
}

function arInvFilsSuffix(n: number): string {
  if (n === 1) return 'فلس';
  if (n === 2) return 'فلسان';
  if (n >= 3 && n <= 10) return 'فلوس';
  return 'فلساً';
}

/**
 * Arabic "invoice-legacy" tafqeet — historical
 * `frontend/src/print-templates/utils/tafqeet.ts` output, unchanged. Supported
 * range: 0 – 9,999,999.999 KWD.
 *
 * Examples:
 *   arabicInvoiceLegacy(732.5) → "سبعمائة واثنا وثلاثون ديناراً كويتياً وخمسمائة فلساً فقط لا غير"
 *   arabicInvoiceLegacy(0)     → "صفر دينار كويتي فقط لا غير"
 */
function arabicInvoiceLegacy(amount: number): string {
  if (!isFinite(amount)) return '';
  if (amount < 0) {
    const pos = arabicInvoiceLegacy(-amount);
    return pos ? 'مبلغ دائن: ' + pos : '';
  }

  const rounded = roundMoney(amount);
  const dinars = Math.floor(rounded);
  const fils = Math.round((rounded - dinars) * 1000);

  const parts: string[] = [];

  if (dinars > 0) {
    parts.push(`${arInvIntToWords(dinars)} ${arInvDinarSuffix(dinars)}`);
  } else if (fils === 0) {
    return 'صفر دينار كويتي فقط لا غير';
  }

  if (fils > 0) {
    parts.push(`${arInvIntToWords(fils)} ${arInvFilsSuffix(fils)}`);
  }

  return parts.join(' و') + ' فقط لا غير';
}

// ═══════════════════════════════════════════════════════════════════════════════
// English — NEW. Supports zero, negative, thousands, millions, billions.
// ═══════════════════════════════════════════════════════════════════════════════

const EN_ONES: readonly string[] = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen',
  'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];

const EN_TENS: readonly string[] = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety',
];

const EN_SCALE: readonly string[] = ['', 'Thousand', 'Million', 'Billion'];

function enBelowHundred(n: number): string {
  if (n === 0) return '';
  if (n < 20) return EN_ONES[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return ones > 0 ? `${EN_TENS[tens]}-${EN_ONES[ones]}` : EN_TENS[tens];
}

function enBelowThousand(n: number): string {
  if (n === 0) return '';
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (hundreds > 0) parts.push(`${EN_ONES[hundreds]} Hundred`);
  if (rem > 0) parts.push(enBelowHundred(rem));
  return parts.join(' ');
}

/** Converts a non-negative integer (up to 999,999,999,999) to English words. */
function enIntToWords(n: number): string {
  if (n === 0) return 'Zero';

  const chunks: number[] = [];
  let x = n;
  while (x > 0) {
    chunks.push(x % 1000);
    x = Math.floor(x / 1000);
  }

  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i--) {
    if (chunks[i] === 0) continue;
    const scale = EN_SCALE[i];
    parts.push(scale ? `${enBelowThousand(chunks[i])} ${scale}` : enBelowThousand(chunks[i]));
  }
  return parts.join(' ');
}

/**
 * English amount-to-words for KWD. General-purpose — supports zero, negative
 * (prefixed "Negative "), and amounts into the billions.
 *
 * Example:
 *   englishWordsKWD(1250.5) → "One Thousand Two Hundred Fifty Kuwaiti Dinars and Five Hundred Fils Only"
 */
function englishWordsKWD(amount: number, negativePrefix = 'Negative '): string {
  if (!Number.isFinite(amount)) return '';

  const rounded = roundMoney(amount);
  const isNegative = rounded < 0;
  const abs = Math.abs(rounded);
  const dinars = Math.floor(abs);
  const fils = Math.round((abs - dinars) * 1000);
  const prefix = isNegative ? negativePrefix : '';

  if (dinars === 0 && fils === 0) return `${prefix}Zero Kuwaiti Dinars Only`;

  const parts: string[] = [];
  if (dinars > 0) parts.push(`${enIntToWords(dinars)} ${dinars === 1 ? 'Kuwaiti Dinar' : 'Kuwaiti Dinars'}`);
  if (fils > 0) parts.push(`${enIntToWords(fils)} Fils`);

  return `${prefix}${parts.join(' and ')} Only`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Public API — language-aware dispatchers (use these for all new/updated call sites)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standard amount-to-words dispatcher — Cheques, Payment Voucher, Receipt Voucher,
 * Salary Certificate, Employment Contract. Mirrors the pre-consolidation Arabic
 * contract exactly: negative input returns '' in both languages (these documents'
 * amounts are never negative in practice).
 */
export function amountToWordsKWD(amount: number, lang: TafqeetLang): string {
  if (lang === 'en') {
    if (!Number.isFinite(amount) || amount < 0) return '';
    return englishWordsKWD(amount);
  }
  return arabicStandard(amount);
}

/**
 * Invoice amount-to-words dispatcher — Invoice print templates only. Preserves the
 * invoice-legacy negative handling (credit-amount prefix) in both languages, since
 * invoice totals can be negative (credit notes).
 */
export function amountToWordsInvoiceKWD(amount: number, lang: TafqeetLang): string {
  if (lang === 'en') {
    if (!isFinite(amount)) return '';
    if (amount < 0) {
      const pos = englishWordsKWD(-amount);
      return pos ? 'Credit Amount: ' + pos : '';
    }
    return englishWordsKWD(amount);
  }
  return arabicInvoiceLegacy(amount);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Backward-compatible named exports — unchanged signature and behavior, kept so any
// caller using the original names keeps working identically.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A BARE integer in words — no currency unit, no "فقط … لا غير" / "… Only" wrapper.
 *
 * WHY THIS EXISTS (and why it is not a fourth tafqeet variant): some legal templates
 * already carry the currency unit and the "only" wrapper in their own printed text —
 * the Employee Debt Acknowledgment reads «… مبلغاً قدره (500 د.ك) فقط ‹words›
 * ديناراً كويتياً لا غير», so dropping `amountToWordsKWD`'s complete phrase into that
 * blank would print the unit and the wrapper twice. Those documents need only the
 * number spelled out.
 *
 * This is a THIN RE-EXPORT of the very same spellers `amountToWordsKWD` already uses
 * (`arStdSpellInt` / `enIntToWords`) — no new grammar, no second algorithm, and no
 * change whatsoever to any existing export's output.
 *
 * Non-integers and negatives return '' rather than a rounded guess: a legal amount in
 * words must never silently disagree with the figures beside it. A caller that needs
 * fils spells them out itself.
 */
export function integerToWords(value: number, lang: TafqeetLang): string {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return '';
  return lang === 'en' ? enIntToWords(value) : arStdSpellInt(value);
}

/** @deprecated Prefer `amountToWordsKWD(amount, 'ar')`. Unchanged behavior. */
export function tafqeetKWD(amount: number): string {
  return arabicStandard(amount);
}

/** @deprecated Prefer `amountToWordsInvoiceKWD(amount, 'ar')`. Unchanged behavior. */
export function tafqeet(amount: number): string {
  return arabicInvoiceLegacy(amount);
}
