/**
 * Summary card section — used for reports that present KPI cards
 * in addition to (or instead of) a full data table.
 * Future: integrate with charting when canvas/SVG support is added.
 */
import { esc } from './htmlUtils';

export type CardColor = 'default' | 'green' | 'red' | 'blue';

export interface SummaryCard {
  label: string;
  value: string;
  /** سطر ثانوي اختياري تحت القيمة (مثل مبلغ الشهر الأعلى إنفاقًا). */
  hint?: string;
  color?: CardColor;
}

export function buildSummaryCards(cards: SummaryCard[]): string {
  if (cards.length === 0) return '';
  return `
    <div class="summary-cards">
      ${cards
        .map(
          (c) => `
        <div class="summary-card ${c.color ?? 'default'}">
          <div class="card-label">${esc(c.label)}</div>
          <div class="card-value">${esc(c.value)}</div>
          ${c.hint ? `<div class="card-hint">${esc(c.hint)}</div>` : ''}
        </div>`,
        )
        .join('')}
    </div>
  `;
}
