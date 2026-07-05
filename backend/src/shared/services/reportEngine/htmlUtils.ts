/** Shared HTML utilities for the report engine template system. */
import { formatCurrency } from '../../utils/currency';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtCell(value: unknown, col?: { format?: 'currency' }): string {
  if (value === null || value === undefined || value === '') return '';
  if (col?.format === 'currency') return formatCurrency(value);
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  return esc(value);
}
