// Tafqeet — Arabic amount-in-words for Kuwaiti Dinar (KWD).
// 1 KWD = 1000 fils. Handles amounts up to 999,999.999 KWD.
// Used in cheque preview and print output.

const ONES: string[] = [
  '', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة',
  'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر',
  'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر',
];

const TENS: string[] = [
  '', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون',
];

const HUNDREDS: string[] = [
  '', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة',
  'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة',
];

/** Converts 1–999 to Arabic words. */
function spell(n: number): string {
  if (n <= 0 || n >= 1000) return '';
  if (n < 20) return ONES[n];

  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];

  if (hundreds > 0) parts.push(HUNDREDS[hundreds]);

  if (rem > 0) {
    if (rem < 20) {
      parts.push(ONES[rem]);
    } else {
      const tens = Math.floor(rem / 10);
      const units = rem % 10;
      parts.push(units > 0 ? `${ONES[units]} و${TENS[tens]}` : TENS[tens]);
    }
  }

  return parts.join(' و');
}

/** Converts a non-negative integer to Arabic words. */
function spellInt(n: number): string {
  if (n === 0) return 'صفر';
  if (n < 1000) return spell(n);

  const parts: string[] = [];
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1000);
  const remainder = n % 1000;

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions <= 10) parts.push(`${spell(millions)} ملايين`);
    else {
      // For 11–99: مليوناً (tamyeez); for round hundreds and above: مليون (genitive)
      const remM = millions % 100;
      parts.push(remM >= 11 && remM <= 99 ? `${spell(millions)} مليوناً` : `${spell(millions)} مليون`);
    }
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands <= 10) parts.push(`${spell(thousands)} آلاف`);
    else {
      // For 11–99: ألفاً (tamyeez); for round hundreds and above: ألف (genitive)
      // Prevents incorrect forms like "مائة ألفاً"
      const remT = thousands % 100;
      parts.push(remT >= 11 && remT <= 99 ? `${spell(thousands)} ألفاً` : `${spell(thousands)} ألف`);
    }
  }

  if (remainder > 0) parts.push(spell(remainder));

  return parts.join(' و');
}

// n % 100 drives the tamyeez form for numbers > 99:
// rem 11–99 → accusative singular (ديناراً / فلساً)
// rem 0–10  → plain singular (دينار / فلس)

function withDinarUnit(n: number): string {
  if (n === 1) return 'دينار كويتي واحد';
  if (n === 2) return 'ديناران كويتيان';
  if (n <= 10) return `${spellInt(n)} دنانير كويتية`;
  if (n <= 99) return `${spellInt(n)} ديناراً كويتياً`;
  const rem = n % 100;
  return rem >= 11 && rem <= 99
    ? `${spellInt(n)} ديناراً كويتياً`
    : `${spellInt(n)} دينار كويتي`;
}

function withFilsUnit(n: number): string {
  if (n === 1) return 'فلس واحد';
  if (n === 2) return 'فلسان';
  if (n <= 10) return `${spellInt(n)} فلوس`;
  if (n <= 99) return `${spellInt(n)} فلساً`;
  const rem = n % 100;
  return rem >= 11 && rem <= 99
    ? `${spellInt(n)} فلساً`
    : `${spellInt(n)} فلس`;
}

/**
 * Converts a KWD amount to Arabic cheque wording (tafqeet).
 * Returns '' for invalid or negative input.
 *
 * Examples:
 *   tafqeetKWD(0)          → "فقط صفر لا غير"
 *   tafqeetKWD(1)          → "فقط دينار كويتي واحد لا غير"
 *   tafqeetKWD(10.5)       → "فقط عشرة دنانير كويتية وخمسمائة فلس لا غير"
 *   tafqeetKWD(125.75)     → "فقط مائة وخمسة وعشرون ديناراً كويتياً وسبعمائة وخمسون فلساً لا غير"
 *   tafqeetKWD(1000)       → "فقط ألف دينار كويتي لا غير"
 *   tafqeetKWD(100000)     → "فقط مائة ألف دينار كويتي لا غير"
 */
export function tafqeetKWD(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return '';
  if (amount === 0) return 'فقط صفر لا غير';

  const rounded = Math.round(amount * 1000) / 1000;
  const dinars = Math.floor(rounded);
  const fils = Math.round((rounded - dinars) * 1000);

  const parts: string[] = [];
  if (dinars > 0) parts.push(withDinarUnit(dinars));
  if (fils > 0) parts.push(withFilsUnit(fils));

  return `فقط ${parts.join(' و')} لا غير`;
}
