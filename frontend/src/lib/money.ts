// Canonical monetary rounding for the frontend — mirrors backend's
// `shared/utils/money.ts` (`roundMoney`). Half-away-from-zero, 3 decimals, with an
// EPSILON correction so `1.0005` rounds up to `1.001` instead of falling short due to
// binary floating-point representation (`1.0005 * 1000 === 1000.4999999999999`).
//
// The frontend and backend are separate TypeScript projects with no shared package
// boundary, so this is a deliberate, minimal mirror — not a duplicate invented
// independently. Kept intentionally small: this project's monetary values are
// computed and stored on the backend; the frontend only needs this for the rare
// case of rounding a value before display-side derivation (e.g. amount-in-words)
// ahead of the value being persisted.

/** Rounds a KWD amount to 3 decimals, half away from zero. `-0` normalizes to `0`. */
export function roundMoney(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const rounded = (sign * Math.round((Math.abs(value) + Number.EPSILON) * 1000)) / 1000;
  return rounded === 0 ? 0 : rounded;
}
