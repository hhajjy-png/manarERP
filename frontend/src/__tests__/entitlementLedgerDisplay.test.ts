import { describe, it, expect } from 'vitest';
import { dayKey, hasMatchingSettlement } from '../components/employee/entitlementLedgerDisplay';

/**
 * اختبارات مساعد عرض شارة «مرتبط بتسوية الإجازة» — مؤشّر بصري بحت.
 * يثبت أن الشارة تظهر فقط عند وجود تسوية بنفس اليوم، ولا علاقة له بأي احتساب.
 */
describe('entitlement ledger display — visual settlement badge', () => {
  it('extracts the day key (YYYY-MM-DD) from an ISO date', () => {
    expect(dayKey('2026-07-15T00:00:00.000Z')).toBe('2026-07-15');
    expect(dayKey('2026-07-15')).toBe('2026-07-15');
    expect(dayKey(null)).toBe('');
    expect(dayKey(undefined)).toBe('');
  });

  it('shows the badge only when a settlement exists on the same day', () => {
    const settlements = new Set(['2026-07-15', '2025-03-01']);
    expect(hasMatchingSettlement('2026-07-15T00:00:00.000Z', settlements)).toBe(true);
    expect(hasMatchingSettlement('2025-03-01T12:34:56.000Z', settlements)).toBe(true);
  });

  it('does not show the badge when there is no matching settlement', () => {
    const settlements = new Set(['2026-07-15']);
    expect(hasMatchingSettlement('2026-07-16T00:00:00.000Z', settlements)).toBe(false);
    expect(hasMatchingSettlement('2026-07-15T00:00:00.000Z', new Set<string>())).toBe(false);
    expect(hasMatchingSettlement('', settlements)).toBe(false);
  });
});
