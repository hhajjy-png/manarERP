const PREFIXES: Record<string, string> = {
  'salary-certificate': 'SAL',
  'to-whom-it-may-concern': 'TWM',
  'leave-request': 'LV',
  'return-to-work': 'RTW',
  'salary-advance': 'ADV',
  resignation: 'RES',
  'employee-warning': 'WRN',
  'performance-evaluation': 'EVA',
  'employment-contract': 'EMP',
  quotation: 'QTN',
  'purchase-request': 'PR',
  'payment-voucher': 'PV',
};

export function generateFormNumber(formType: string): string {
  const prefix = PREFIXES[formType] ?? 'FRM';
  const year = new Date().getFullYear();
  const seq = String((Math.floor(Date.now() / 100) % 9000) + 1000);
  return `${prefix}-${year}-${seq}`;
}

/** A run of digits at the very END of the string, with whatever precedes it. */
const TRAILING_DIGITS = /^(.*?)(\d+)$/;

/**
 * The reference that FOLLOWS `last` — its trailing number plus one, same width.
 *
 * This is a SUGGESTION, not a counter: it derives a value from the one the operator last
 * saved and hands it to an editable field. Nothing is reserved, nothing is stored beside
 * the reference itself, and two people opening the dialog get the same proposal — which
 * is exactly why the field stays editable rather than being filled in and locked.
 *
 * NOT INCREMENTED — returned verbatim — when there is no digit run at the end
 * (`'قرار إداري'`, `'MN-2026-A'`, `''`). Guessing where a number lives inside arbitrary
 * text is how a reference silently becomes the wrong one, so the rule is deliberately
 * narrow: the tail, or nothing.
 *
 * WIDTH IS PRESERVED by padding back to the original run's length, so `00125 → 00126`
 * and `0009 → 0010` keep their leading zeros. A run that overflows its width simply
 * grows (`999 → 1000`), which is the only sensible reading of "one more".
 *
 * `BigInt` rather than `Number`: a long enough digit run (>15 digits) exceeds the safe
 * integer range and would come back rounded — a wrong reference is worse than no
 * suggestion, and BigInt makes the arithmetic exact at any length.
 */
export function nextReferenceNumber(last: string): string {
  const match = TRAILING_DIGITS.exec(last);
  if (!match) return last;
  const [, head, digits] = match;
  return head + (BigInt(digits) + 1n).toString().padStart(digits.length, '0');
}
