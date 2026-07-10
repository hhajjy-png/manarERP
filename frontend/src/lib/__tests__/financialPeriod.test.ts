import { describe, it, expect } from 'vitest';
import {
  computePeriod,
  defaultPeriod,
  displayDate,
  periodToRangeParams,
  periodToReportParams,
  toLocalDateString,
} from '../financialPeriod';

// مرجع زمني ثابت للاختبارات: 10 يوليو 2026 (محليًا).
const NOW = new Date(2026, 6, 10, 14, 30);

describe('defaultPeriod', () => {
  it('الافتراضي = السنة الحالية حتى اليوم (لا كل الفترات)', () => {
    const p = defaultPeriod(NOW);
    expect(p.preset).toBe('year-to-date');
    expect(p.fromDate).toBe('2026-01-01');
    expect(p.toDate).toBe('2026-07-10');
    expect(p.isAllPeriods).toBe(false);
    expect(p.isHistorical).toBe(false);
  });
});

describe('computePeriod — presets', () => {
  it('السنة الحالية → 01/01 حتى 31/12', () => {
    const p = computePeriod({ preset: 'current-year' }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2026-01-01', '2026-12-31']);
  });

  it('السنة السابقة → حدود 2025 الصحيحة', () => {
    const p = computePeriod({ preset: 'previous-year' }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2025-01-01', '2025-12-31']);
    expect(p.isHistorical).toBe(true);
  });

  it('الشهر الحالي → 01/07 حتى 31/07', () => {
    const p = computePeriod({ preset: 'current-month' }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2026-07-01', '2026-07-31']);
  });

  it('الشهر السابق → يونيو 2026', () => {
    const p = computePeriod({ preset: 'previous-month' }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2026-06-01', '2026-06-30']);
  });

  it('الشهر السابق ينتقل من يناير إلى ديسمبر السنة السابقة', () => {
    const jan = new Date(2026, 0, 15);
    const p = computePeriod({ preset: 'previous-month' }, jan);
    expect([p.fromDate, p.toDate]).toEqual(['2025-12-01', '2025-12-31']);
  });

  it('سنة محددة (2024) → حدود السنة كاملة + وسم', () => {
    const p = computePeriod({ preset: 'year', selectedYear: 2024 }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2024-01-01', '2024-12-31']);
    expect(p.selectedYear).toBe(2024);
    expect(p.label).toBe('السنة المالية: 2024');
    expect(p.isHistorical).toBe(true);
  });

  it('نطاق مخصص يمرّ كما هو', () => {
    const p = computePeriod({ preset: 'custom', fromDate: '2024-03-05', toDate: '2024-09-20' }, NOW);
    expect([p.fromDate, p.toDate]).toEqual(['2024-03-05', '2024-09-20']);
    expect(p.isHistorical).toBe(true);
  });

  it('كل الفترات → لا حدود، وسم صريح', () => {
    const p = computePeriod({ preset: 'all' }, NOW);
    expect(p.fromDate).toBeUndefined();
    expect(p.toDate).toBeUndefined();
    expect(p.asOfDate).toBeUndefined();
    expect(p.isAllPeriods).toBe(true);
    expect(p.label).toBe('كل الفترات');
  });
});

describe('asOfDate = نهاية النطاق', () => {
  it('asOfDate يساوي toDate للتقارير اللحظية', () => {
    const p = computePeriod({ preset: 'year', selectedYear: 2024 }, NOW);
    expect(p.asOfDate).toBe('2024-12-31');
  });
});

describe('backend params translation', () => {
  it('عائلة financial: fromDate/toDate/asOfDate', () => {
    const p = computePeriod({ preset: 'year', selectedYear: 2024 }, NOW);
    expect(periodToRangeParams(p)).toEqual({ fromDate: '2024-01-01', toDate: '2024-12-31', asOfDate: '2024-12-31' });
  });

  it('عائلة reports/expenses: from/to', () => {
    const p = computePeriod({ preset: 'current-month' }, NOW);
    expect(periodToReportParams(p)).toEqual({ from: '2026-07-01', to: '2026-07-31' });
  });

  it('all periods → لا معاملات (استعلام كل الفترات صراحةً)', () => {
    const p = computePeriod({ preset: 'all' }, NOW);
    expect(periodToRangeParams(p)).toEqual({});
    expect(periodToReportParams(p)).toEqual({});
  });
});

describe('local date correctness (no UTC slip)', () => {
  it('toLocalDateString يستخدم مكوّنات محلية لا UTC', () => {
    // منتصف ليل محلي 31/12/2024 — toISOString كان سيعطي 2024-12-30 بتوقيت +03:00.
    const midnightLocal = new Date(2024, 11, 31, 0, 0, 0);
    expect(toLocalDateString(midnightLocal)).toBe('2024-12-31');
  });

  it('displayDate يحوّل YYYY-MM-DD إلى DD/MM/YYYY', () => {
    expect(displayDate('2024-03-05')).toBe('05/03/2024');
    expect(displayDate(undefined)).toBe('');
  });

  it('حدود الفترة لا تنزلق يومًا عند نهاية السنة', () => {
    const p = computePeriod({ preset: 'previous-year' }, new Date(2025, 0, 1, 2, 0));
    // نهاية 2024 يجب أن تبقى 2024-12-31 لا 2024-12-30.
    expect(p.toDate).toBe('2024-12-31');
  });
});
