import type { FinancialResponse, FinancialRow, FinancialSummary, FinancialPagination } from './financial.types';

export function wrapFinancialResponse<T extends FinancialRow>(input: {
  reportType: string;
  summary: FinancialSummary;
  metadata?: Record<string, unknown>;
  filters: Record<string, unknown>;
  rows: T[];
  totals?: Partial<T>;
  pagination?: FinancialPagination;
}): FinancialResponse<T> {
  return {
    ...input,
    generatedAt: new Date().toISOString(),
  };
}
