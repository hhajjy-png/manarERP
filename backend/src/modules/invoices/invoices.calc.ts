// Pure financial calculation functions for invoices — no Prisma, no side-effects.

export type InvoiceItemInput = {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceId?: number | null;
};

export function round3(n: number): number {
  return Math.round((n + Number.EPSILON) * 1000) / 1000;
}

/** Compute subtotal, tax amount, and total from line items, tax rate, and discount. */
export function computeTotals(items: InvoiceItemInput[], taxRate: number, discount: number) {
  const lines = items.map((it) => ({ ...it, total: round3(it.quantity * it.unitPrice) }));
  const subtotal = round3(lines.reduce((s, l) => s + l.total, 0));
  const taxable = Math.max(0, subtotal - discount);
  const taxAmount = round3((taxable * taxRate) / 100);
  const total = round3(taxable + taxAmount);
  return { lines, subtotal, taxAmount, total };
}

/** Derive payment status from invoice total and amount already paid. */
export function nextStatus(total: number, paid: number): string {
  if (paid <= 0) return 'UNPAID';
  if (paid >= total) return 'PAID';
  return 'PARTIAL';
}

/**
 * Returns true if a new payment would exceed the invoice total beyond the 0.001 KWD tolerance.
 * The +0.001 tolerance absorbs floating-point drift at 3dp precision.
 */
export function overpaymentExceeds(total: number, newPaid: number): boolean {
  return newPaid > total + 0.001;
}
