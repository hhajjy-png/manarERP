// ─────────────────────────────────────────────────────────────────────────────
//  Date-input contract helpers — Global Date Input Standardization v1
//  ------------------------------------------------------------------------------
//  Canonical contracts:
//    • UI-visible date  : DD/MM/YYYY  (Western digits 0-9)
//    • form/API value   : YYYY-MM-DD  (date-only, matches the native <input type=date>
//                          value the whole app already stores — no timezone component)
//
//  ALL conversions here are PURE STRING operations. They NEVER build a `Date` for the
//  value path and NEVER call `toISOString()`, so a date-only business date can never
//  shift by a day across a timezone (Kuwait is UTC+3). `Date` is used only as a last
//  resort inside `normalizeDateOnly`, and then via LOCAL getters, never UTC.
// ─────────────────────────────────────────────────────────────────────────────

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const EASTERN_ARABIC = '۰۱۲۳۴۵۶۷۸۹';

/** Normalize Arabic-Indic / Eastern-Arabic digits to Western 0-9. Other chars pass through. */
export function toWesternDigits(input: string): string {
  let out = '';
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch);
    if (ai !== -1) { out += String(ai); continue; }
    const ea = EASTERN_ARABIC.indexOf(ch);
    if (ea !== -1) { out += String(ea); continue; }
    out += ch;
  }
  return out;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Calendar days in a 1-based month, leap-aware. Returns 0 for an out-of-range month. */
export function daysInMonth(year: number, month: number): number {
  const table = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return table[month - 1] ?? 0;
}

/** True only for a real calendar date (rejects 31/02, 29/02 on a common year, month 0/13…). */
export function isRealYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) return false;
  if (!Number.isInteger(month) || month < 1 || month > 12) return false;
  if (!Number.isInteger(day) || day < 1) return false;
  return day <= daysInMonth(year, month);
}

// Accepts a bare 'YYYY-MM-DD' or an ISO datetime whose date portion is a valid calendar date.
const ISO_PREFIX_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]|$)/;
const DISPLAY_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

/**
 * 'YYYY-MM-DD' (or an ISO datetime) → 'DD/MM/YYYY'. Returns '' when the input is not a
 * valid date-only value. Pure string — no Date, no timezone conversion.
 */
export function isoToDisplay(value: unknown): string {
  if (typeof value !== 'string') return '';
  const m = ISO_PREFIX_RE.exec(value.trim());
  if (!m) return '';
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (!isRealYmd(year, month, day)) return '';
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * 'DD/MM/YYYY' → 'YYYY-MM-DD', or null when the text is not a real calendar date.
 * Leap-aware; never uses Date rollover (31/02 → null, not 03/03). Normalizes Arabic digits.
 */
export function displayToIso(display: unknown): string | null {
  if (typeof display !== 'string') return null;
  const m = DISPLAY_RE.exec(toWesternDigits(display).trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (!isRealYmd(year, month, day)) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** True when `display` is a complete, valid DD/MM/YYYY calendar date. */
export function isValidDisplayDate(display: unknown): boolean {
  return displayToIso(display) !== null;
}

/**
 * Rehydrate any stored value into the 'YYYY-MM-DD' date-only contract WITHOUT a timezone
 * shift. Empty/nullish → ''. A string carrying a 'YYYY-MM-DD' prefix returns that prefix
 * verbatim (no Date). Anything else falls back to LOCAL calendar getters (never toISOString).
 */
export function normalizeDateOnly(value: unknown): string {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = ISO_PREFIX_RE.exec(value.trim());
    if (m) {
      const year = Number(m[1]);
      const month = Number(m[2]);
      const day = Number(m[3]);
      return isRealYmd(year, month, day) ? `${m[1]}-${m[2]}-${m[3]}` : '';
    }
  }
  const d = value instanceof Date ? value : new Date(value as string);
  if (isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Range check for date-only ISO strings. Because 'YYYY-MM-DD' sorts lexicographically the
 * same as chronologically, a plain string comparison is correct (and timezone-free).
 */
export function isWithinRange(iso: string, min?: string, max?: string): boolean {
  if (min && iso < min) return false;
  if (max && iso > max) return false;
  return true;
}

/** Keep only digits and slashes while typing (normalizing Arabic digits first), capped at DD/MM/YYYY length. */
export function sanitizeDateTyping(input: string): string {
  return toWesternDigits(input).replace(/[^\d/]/g, '').slice(0, 10);
}
