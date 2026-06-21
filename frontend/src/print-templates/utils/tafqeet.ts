/**
 * Arabic tafqeet for Kuwaiti Dinar (KWD — 3 decimal places / fils).
 *
 * Polarity rule: for masculine nouns (دينار / فلس), numbers 3–10 use the
 * form ending in ة (Form A). Numbers 1–2 and 11+ agree with noun gender.
 *
 * Supported range: 0 – 9,999,999.999 KWD.
 */

// ─── Word tables ──────────────────────────────────────────────────────────────

/** Form A — used when counting masculine nouns (3–10 items). */
const FORM_A: readonly string[] = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
];

const TENS: readonly string[] = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
];

// Hundreds — مائتان kept in construct form before a noun (مائتا X).
const HUNDREDS: readonly string[] = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
];

// ─── Internal helpers ─────────────────────────────────────────────────────────

function belowHundred(n: number): string {
  if (n === 0) return '';
  if (n <= 19) return FORM_A[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  if (ones === 0) return TENS[tens];
  return `${FORM_A[ones]} و${TENS[tens]}`;
}

function belowThousand(n: number): string {
  if (n === 0) return '';
  if (n < 100) return belowHundred(n);
  const h = Math.floor(n / 100);
  const rem = n % 100;
  if (rem === 0) return HUNDREDS[h];
  return `${HUNDREDS[h]} و${belowHundred(rem)}`;
}

function thousandsWord(n: number): string {
  // n = 1..9999 (thousands count)
  if (n === 1) return 'ألف';
  if (n === 2) return 'ألفان';
  if (n <= 10) return `${FORM_A[n]} آلاف`;
  return `${belowThousand(n)} ألفاً`;
}

function millionsWord(n: number): string {
  if (n === 1) return 'مليون';
  if (n === 2) return 'مليونان';
  if (n <= 10) return `${FORM_A[n]} ملايين`;
  return `${belowThousand(n)} مليوناً`;
}

function intToWords(n: number): string {
  if (n === 0) return 'صفر';
  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const remainder = n % 1_000;
  if (millions > 0) parts.push(millionsWord(millions));
  if (thousands > 0) parts.push(thousandsWord(thousands));
  if (remainder > 0) parts.push(belowThousand(remainder));
  return parts.join(' و');
}

// ─── Noun suffixes ────────────────────────────────────────────────────────────

/**
 * Returns the correct Arabic noun phrase for n dinars.
 * Singular/dual/plural/accusative rules per standard Arabic grammar.
 */
function dinarSuffix(n: number): string {
  if (n === 0) return 'دينار كويتي';
  if (n === 1) return 'دينار كويتي';
  if (n === 2) return 'ديناران كويتيان';
  const last = n % 100;
  if (last >= 3 && last <= 10) return 'دنانير كويتية';
  return 'ديناراً كويتياً';
}

function filsSuffix(n: number): string {
  if (n === 1) return 'فلس';
  if (n === 2) return 'فلسان';
  if (n >= 3 && n <= 10) return 'فلوس';
  return 'فلساً';
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Converts a KWD amount to Arabic words.
 *
 * @example
 * tafqeet(200)     // "مائتان دينار كويتي فقط لا غير"
 * tafqeet(732.5)   // "سبعمائة واثنا وثلاثون ديناراً كويتياً وخمسمائة فلساً فقط لا غير"
 * tafqeet(0)       // "صفر دينار كويتي فقط لا غير"
 */
export function tafqeet(amount: number): string {
  if (!isFinite(amount)) return '';
  if (amount < 0) {
    const pos = tafqeet(-amount);
    return pos ? 'مبلغ دائن: ' + pos : '';
  }

  const dinars = Math.floor(amount);
  const fils = Math.round((amount - dinars) * 1000);

  const parts: string[] = [];

  if (dinars > 0) {
    parts.push(`${intToWords(dinars)} ${dinarSuffix(dinars)}`);
  } else if (fils === 0) {
    return 'صفر دينار كويتي فقط لا غير';
  }

  if (fils > 0) {
    parts.push(`${intToWords(fils)} ${filsSuffix(fils)}`);
  }

  return parts.join(' و') + ' فقط لا غير';
}
