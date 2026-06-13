// Pure inventory financial calculation functions — no Prisma, no side-effects.

/**
 * Round to 6 decimal places for WAC cost precision.
 * WAC unit costs are stored at 6dp so that repeated weighted-average operations
 * do not accumulate rounding error before display (which rounds to 3dp for KWD).
 */
export function roundCost(n: number): number {
  return Math.round((n + Number.EPSILON) * 1_000_000) / 1_000_000;
}

/**
 * Compute the new Weighted Average Cost (WAC) after a goods receipt.
 *
 * Formula: newUnitCost = (currentStock × currentUnitCost + incomingQty × incomingUnitCost)
 *                        / (currentStock + incomingQty)
 *
 * Edge cases:
 * - currentStock < 0 is treated as 0 (negative stock guard, matches production behaviour).
 * - incomingQty = 0 with currentStock > 0: returns currentUnitCost unchanged (no new goods).
 * - incomingQty = 0 with currentStock = 0: newQty would be 0 (division-by-zero).
 *   Guard: returns incomingUnitCost to avoid NaN. This preserves the intent that the
 *   "most recent cost" applies when there is no existing stock to weight against.
 */
export function calcWAC(
  currentStock: number,
  currentUnitCost: number,
  incomingQty: number,
  incomingUnitCost: number,
): number {
  const safeCurrentStock = Math.max(0, currentStock);
  const newQty = safeCurrentStock + incomingQty;
  if (newQty === 0) return incomingUnitCost;
  return roundCost(
    (safeCurrentStock * currentUnitCost + incomingQty * incomingUnitCost) / newQty,
  );
}

/** Returns true when there is enough stock to fulfil the requested quantity. */
export function sufficientStock(currentStock: number, requestedQty: number): boolean {
  return currentStock >= requestedQty;
}
