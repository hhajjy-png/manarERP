import { describe, it, expect } from 'vitest';
import { buildEntitlementTimeline } from '../timeline/buildEntitlementTimeline';
import type { LeavePeriod } from '../models/LeavePeriod';
import type { LeaveAdvance } from '../models/LeaveAdvance';
import type { Settlement } from '../models/Settlement';

const leave: LeavePeriod = {
  id: 1, employeeId: 1, type: 'ANNUAL', status: 'APPROVED',
  startDate: new Date('2026-01-10T00:00:00Z'), endDate: new Date('2026-01-15T00:00:00Z'), days: 5,
};
const advance: LeaveAdvance = {
  id: 1, employeeId: 1, advanceDate: new Date('2026-02-01T00:00:00Z'),
  leaveDaysAdvanced: 3, amount: 150, paymentMethod: 'CASH', notes: null,
};
const settlement: Settlement = {
  id: 1, employeeId: 1, entryType: 'LEAVE_ALLOWANCE', entryDate: new Date('2026-03-01T00:00:00Z'),
  description: null, leaveDays: 2, leaveBalanceSnapshot: 10, amount: 100, paymentMethod: 'CASH', notes: null,
};

describe('buildEntitlementTimeline', () => {
  it('merges leave/advance/settlement records into one array with the correct discriminants', () => {
    const timeline = buildEntitlementTimeline([leave], [advance], [settlement]);
    expect(timeline).toHaveLength(3);
    expect(timeline.map((e) => e.kind).sort()).toEqual(['ADVANCE', 'LEAVE', 'SETTLEMENT']);
  });

  it('sorts events newest-first by date', () => {
    const timeline = buildEntitlementTimeline([leave], [advance], [settlement]);
    expect(timeline[0].kind).toBe('SETTLEMENT'); // March
    expect(timeline[1].kind).toBe('ADVANCE'); // February
    expect(timeline[2].kind).toBe('LEAVE'); // January
  });

  it('returns an empty array when there is no data at all', () => {
    expect(buildEntitlementTimeline([], [], [])).toEqual([]);
  });

  it('preserves the underlying values without transformation (no new data invented)', () => {
    const timeline = buildEntitlementTimeline([leave], [], []);
    const event = timeline[0];
    if (event.kind === 'LEAVE') {
      expect(event.days).toBe(5);
      expect(event.leaveType).toBe('ANNUAL');
      expect(event.status).toBe('APPROVED');
    } else {
      throw new Error('expected a LEAVE event');
    }
  });
});
