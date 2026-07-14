/** Shared HTML utilities for the report engine template system. */
import { formatMoneyCell } from '../../utils/currency';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function fmtCell(value: unknown, col?: { format?: 'currency' }): string {
  if (value === null || value === undefined || value === '') return '';
  // الرمز في **عنوان العمود** مرّة واحدة، لا في كل خليّة (المعيار المعتمد).
  if (col?.format === 'currency') return formatMoneyCell(value);
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  return esc(value);
}
