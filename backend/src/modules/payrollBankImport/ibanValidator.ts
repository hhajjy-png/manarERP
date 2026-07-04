// Kuwait IBAN validation — offline, deterministic, no external services.
// Validates format, country code (KW), length, and the ISO 7064 mod-97 checksum,
// and extracts the 4-letter Kuwaiti bank code when safely detectable.
//
// Kuwait IBAN structure (30 chars): KW | 2 check digits | 4-letter bank code | 22-char account
//   e.g. KW81CBKU0000000000001234560101

export type IbanReason = 'EMPTY' | 'FORMAT' | 'COUNTRY' | 'LENGTH' | 'CHECKSUM';

export interface IbanCheckResult {
  input: string;
  normalized: string;
  valid: boolean;
  reasons: IbanReason[];
  countryCode: string | null;
  bankCode: string | null;
}

const KUWAIT_IBAN_LENGTH = 30;

/** Strip whitespace and upper-case an IBAN string. */
export function normalizeIban(raw: string): string {
  return (raw ?? '').replace(/\s+/g, '').toUpperCase();
}

/**
 * ISO 7064 mod-97-10 remainder for an IBAN. Moves the first 4 chars to the end,
 * expands letters (A=10 … Z=35), and folds the (very long) integer with a running
 * modulus so no BigInt is required. A valid IBAN yields a remainder of 1.
 * Returns -1 if a non-alphanumeric character is encountered.
 */
export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    let expanded: string;
    if (code >= 48 && code <= 57) {
      expanded = ch;                       // '0'–'9'
    } else if (code >= 65 && code <= 90) {
      expanded = String(code - 55);        // 'A'(65)→10 … 'Z'(90)→35
    } else {
      return -1;
    }
    for (let i = 0; i < expanded.length; i++) {
      remainder = (remainder * 10 + (expanded.charCodeAt(i) - 48)) % 97;
    }
  }
  return remainder;
}

/**
 * Validate a Kuwait IBAN. All checks are additive: `reasons` lists every failed
 * rule so callers can explain the problem. `valid` is true only when empty.
 */
export function validateKuwaitIban(raw: string): IbanCheckResult {
  const normalized = normalizeIban(raw);
  if (!normalized) {
    return { input: raw, normalized, valid: false, reasons: ['EMPTY'], countryCode: null, bankCode: null };
  }

  const reasons: IbanReason[] = [];
  const formatOk = /^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(normalized);
  if (!formatOk) reasons.push('FORMAT');

  const countryCode = /^[A-Z]{2}/.test(normalized) ? normalized.slice(0, 2) : null;
  if (countryCode !== 'KW') reasons.push('COUNTRY');

  if (normalized.length !== KUWAIT_IBAN_LENGTH) reasons.push('LENGTH');

  // Checksum is only meaningful once the basic character layout is valid.
  if (formatOk) {
    if (ibanMod97(normalized) !== 1) reasons.push('CHECKSUM');
  } else {
    reasons.push('CHECKSUM');
  }

  // Kuwaiti bank code = the 4 letters after the check digits (positions 4–7).
  let bankCode: string | null = null;
  if (countryCode === 'KW' && normalized.length >= 8) {
    const candidate = normalized.slice(4, 8);
    if (/^[A-Z]{4}$/.test(candidate)) bankCode = candidate;
  }

  return { input: raw, normalized, valid: reasons.length === 0, reasons, countryCode, bankCode };
}

/** Arabic explanation for an IBAN failure, for UI display. */
export function ibanReasonAr(reason: IbanReason): string {
  switch (reason) {
    case 'EMPTY':    return 'رقم IBAN فارغ';
    case 'FORMAT':   return 'صيغة IBAN غير صحيحة';
    case 'COUNTRY':  return 'رمز الدولة ليس KW';
    case 'LENGTH':   return 'طول IBAN غير صحيح (يجب أن يكون ٣٠ خانة للكويت)';
    case 'CHECKSUM': return 'خانة التحقق (checksum) غير مطابقة';
    default:         return 'IBAN غير صالح';
  }
}
