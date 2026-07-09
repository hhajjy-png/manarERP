// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KpiStat, KpiStatGrid } from '../components/KpiStat';
import { formatMoneyParts } from '../lib/format';

afterEach(cleanup);

describe('KpiStat — Bank Account Explorer baseline card', () => {
  it('renders the standardized card structure (matches the baseline class names)', () => {
    const { container } = render(
      <KpiStatGrid>
        <KpiStat icon="task_alt" tone="green" label="المحصّل" value="1,000.000" unit="KWD" sub="12 فاتورة" />
      </KpiStatGrid>,
    );
    expect(container.querySelector('.kpistat-grid')).toBeInTheDocument();
    expect(container.querySelector('.kpistat-card')).toBeInTheDocument();
    expect(container.querySelector('.kpistat-card--green')).toBeInTheDocument();
    expect(container.querySelector('.kpistat-icon')).toBeInTheDocument();
    expect(container.querySelector('.kpistat-value')).toBeInTheDocument();
    expect(container.querySelector('.kpistat-sub')).toBeInTheDocument();
  });

  it('renders the currency label INLINE beside the amount (same value element, not stacked)', () => {
    const { container } = render(
      <KpiStat icon="task_alt" tone="green" label="المحصّل" value="17,097.620" unit="KWD" />,
    );
    const valueEl = container.querySelector('.kpistat-value')!;
    // Both the amount and the currency label live inside the single value element → inline.
    expect(valueEl.textContent).toBe('17,097.620KWD');
    const unit = valueEl.querySelector('.kpistat-unit')!;
    expect(unit).toBeInTheDocument();
    expect(unit.textContent).toBe('KWD');
  });

  it('renders no unit element when unit is omitted (count cards)', () => {
    const { container } = render(<KpiStat icon="tag" tone="indigo" label="العدد" value="42" />);
    expect(container.querySelector('.kpistat-unit')).toBeNull();
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  it('splits a real monetary value into an inline number + currency label (via formatMoneyParts)', () => {
    const p = formatMoneyParts(17097.62, { language: 'english' });
    expect(p).toEqual({ number: '17,097.620', currency: 'KWD' });
    const { container } = render(
      <KpiStat icon="functions" tone="blue" label="المتوسط" value={p.number} unit={p.currency} />,
    );
    expect(container.querySelector('.kpistat-value')!.textContent).toBe('17,097.620KWD');
  });
});
