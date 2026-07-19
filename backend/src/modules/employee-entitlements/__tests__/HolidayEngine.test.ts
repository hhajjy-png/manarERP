import { describe, it, expect } from 'vitest';
import { HolidayEngine } from '../engines/HolidayEngine';
import { computeEffectiveAnnualLeaveDays } from '../../employees/entitlements.calc';

describe('HolidayEngine — holiday/weekend/working-day detection', () => {
  const holidays = [new Date('2026-02-25T00:00:00Z'), new Date('2026-02-26T00:00:00Z')];
  const engine = HolidayEngine.fromHolidays(holidays);

  it('detects a registered holiday', () => {
    expect(engine.isHoliday(new Date('2026-02-25T00:00:00Z'))).toBe(true);
  });

  it('does not flag a non-holiday date', () => {
    expect(engine.isHoliday(new Date('2026-02-27T00:00:00Z'))).toBe(false);
  });

  it('detects Friday/Saturday as weekend by default (Kuwait work week)', () => {
    // 2026-02-27 is a Friday, 2026-02-28 a Saturday.
    expect(engine.isWeekend(new Date('2026-02-27T00:00:00Z'))).toBe(true);
    expect(engine.isWeekend(new Date('2026-02-28T00:00:00Z'))).toBe(true);
    expect(engine.isWeekend(new Date('2026-03-01T00:00:00Z'))).toBe(false); // Sunday
  });

  it('honors a custom weekendDays override', () => {
    const custom = HolidayEngine.fromHolidays([], { weekendDays: [0, 6] }); // Sun+Sat weekend
    expect(custom.isWeekend(new Date('2026-03-01T00:00:00Z'))).toBe(true); // Sunday
    expect(custom.isWeekend(new Date('2026-02-27T00:00:00Z'))).toBe(false); // Friday now a workday
  });

  it('a working day is neither a weekend nor a registered holiday', () => {
    expect(engine.isWorkingDay(new Date('2026-02-25T00:00:00Z'))).toBe(false); // holiday (Wed)
    expect(engine.isWorkingDay(new Date('2026-02-28T00:00:00Z'))).toBe(false); // weekend (Sat)
    expect(engine.isWorkingDay(new Date('2026-03-01T00:00:00Z'))).toBe(true); // Sunday, no holiday
  });

  it('counts working days across a range, excluding weekends and holidays', () => {
    // 2026-02-22 (Sun) .. 2026-02-28 (Sat): 22 Sun,23 Mon,24 Tue,25 Wed(holiday),26 Thu(holiday),27 Fri(weekend),28 Sat(weekend)
    // Working days: Sun, Mon, Tue = 3.
    const count = engine.countWorkingDays({ start: new Date('2026-02-22T00:00:00Z'), end: new Date('2026-02-28T00:00:00Z') });
    expect(count).toBe(3);
  });

  it('countWorkingDays is order-independent (start/end may be swapped)', () => {
    const a = engine.countWorkingDays({ start: new Date('2026-02-22T00:00:00Z'), end: new Date('2026-02-28T00:00:00Z') });
    const b = engine.countWorkingDays({ start: new Date('2026-02-28T00:00:00Z'), end: new Date('2026-02-22T00:00:00Z') });
    expect(a).toBe(b);
  });
});

describe('HolidayEngine.computeExcludedLeaveDays — delegates to the legal calculation engine', () => {
  it('produces the exact same result as calling computeEffectiveAnnualLeaveDays directly (no duplicated logic)', () => {
    const holidays = [new Date('2026-01-05T00:00:00Z')];
    const sick = [{ start: new Date('2026-01-03T00:00:00Z'), end: new Date('2026-01-04T00:00:00Z') }];
    const leave = { start: new Date('2026-01-01T00:00:00Z'), end: new Date('2026-01-10T00:00:00Z') };

    const engine = HolidayEngine.fromHolidays(holidays);
    const viaEngine = engine.computeExcludedLeaveDays(leave, sick);
    const viaDirectCall = computeEffectiveAnnualLeaveDays(leave, holidays, sick);

    expect(viaEngine).toBe(viaDirectCall);
    expect(viaEngine).toBe(7); // 10 days − 1 holiday − 2 sick days
  });
});
