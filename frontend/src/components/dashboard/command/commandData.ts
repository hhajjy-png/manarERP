import type { MonthFin, RevenueSlice } from './types';

const round3 = (v: number): number => Math.round((Number(v || 0) + Number.EPSILON) * 1000) / 1000;

/**
 * Real net cash flow for the current month = collections − expenses.
 * Both operands are real fields from financialSummary.thisMonth — no synthetic data.
 */
export function computeCashFlow(thisMonth: Partial<MonthFin> | null | undefined): number {
  const collections = Number(thisMonth?.collections ?? 0);
  const expenses = Number(thisMonth?.expenses ?? 0);
  return round3(collections - expenses);
}

/**
 * Real revenue distribution by customer. Keeps the top `maxSlices` earners and
 * aggregates the remainder into a single "أخرى" slice. Zero/negative rows are dropped.
 */
export function buildRevenueDistribution(
  top: { name: string; revenue: number }[],
  maxSlices = 5,
): RevenueSlice[] {
  const positive = (top ?? []).filter((r) => Number(r.revenue) > 0);
  if (positive.length === 0) return [];
  const head: RevenueSlice[] = positive
    .slice(0, maxSlices)
    .map((r) => ({ name: r.name, value: Number(r.revenue) }));
  const rest = positive.slice(maxSlices).reduce((s, r) => s + Number(r.revenue), 0);
  if (rest > 0) head.push({ name: 'أخرى', value: round3(rest) });
  return head;
}
