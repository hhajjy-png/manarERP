import { describe, it, expect } from 'vitest';
import { assessHistoricalDate } from '../historicalDate';

const NOW = new Date(2026, 6, 10);

describe('assessHistoricalDate', () => {
  it('current-year date → no notice', () => {
    const a = assessHistoricalDate('2026-03-15', { now: NOW });
    expect(a.severity).toBe('none');
    expect(a.isHistorical).toBe(false);
  });

  it('previous-year date → historical', () => {
    const a = assessHistoricalDate('2024-12-15', { now: NOW });
    expect(a.severity).toBe('historical');
    expect(a.year).toBe(2024);
    expect(a.isHistorical).toBe(true);
    expect(a.isBlocked).toBe(false);
  });

  it('empty / malformed → none', () => {
    expect(assessHistoricalDate('', { now: NOW }).severity).toBe('none');
    expect(assessHistoricalDate(undefined, { now: NOW }).severity).toBe('none');
    expect(assessHistoricalDate('nonsense', { now: NOW }).severity).toBe('none');
  });

  it('locked period, no override → blocked (locked severity wins over historical)', () => {
    const a = assessHistoricalDate('2024-05-01', { now: NOW, lockBeforeDate: '2025-01-01', canOverride: false });
    expect(a.severity).toBe('locked');
    expect(a.isBlocked).toBe(true);
    expect(a.isOverridable).toBe(false);
  });

  it('locked period WITH override → overridable', () => {
    const a = assessHistoricalDate('2024-05-01', { now: NOW, lockBeforeDate: '2025-01-01', canOverride: true });
    expect(a.severity).toBe('locked');
    expect(a.isBlocked).toBe(false);
    expect(a.isOverridable).toBe(true);
  });

  it('date on/after lock date → not locked', () => {
    // نفس يوم القفل مسموح (القفل يمنع ما قبله فقط).
    expect(assessHistoricalDate('2025-01-01', { now: NOW, lockBeforeDate: '2025-01-01' }).severity)
      .not.toBe('locked');
  });

  it('current-year date under an earlier lock → none', () => {
    const a = assessHistoricalDate('2026-06-01', { now: NOW, lockBeforeDate: '2025-01-01' });
    expect(a.severity).toBe('none');
  });
});
