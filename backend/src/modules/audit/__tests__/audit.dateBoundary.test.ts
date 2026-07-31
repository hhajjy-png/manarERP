import { describe, it, expect, vi } from 'vitest';

/**
 * Backend Date-Boundary Unification Pack v1 — سجل التدقيق.
 *
 * `createdAt` هنا طابع زمني حقيقي (لحظة وقوع الحدث)، لا تاريخ عمل مجرَّد. لذلك
 * كان غياب `endOfDay` أخطر في هذه الوحدة تحديدًا: فلتر «حتى اليوم» كان يُترجَم
 * إلى `lte = منتصف ليل اليوم`، فيُخفي **كل** ما جرى منذ الفجر — بينما الغرض من
 * الشاشة أصلًا هو إظهار ما جرى للتوّ.
 */

vi.mock('../../../config/database', () => ({ prisma: { auditLog: {} } }));
vi.mock('../../../core/middleware/auth.middleware', () => ({ authenticate: vi.fn() }));
vi.mock('../../../core/middleware/rbac.middleware', () => ({ requirePermission: () => vi.fn() }));

import { buildAuditWhere } from '../audit.routes';
import { toLocalDateString } from '../../../core/utils/dateWindows';
import { expectLocalRange, expectLocalEndOfDay } from '../../../core/utils/__tests__/localDayMatchers';

describe('buildAuditWhere — date boundary', () => {
  it('`to = today` covers events logged throughout today, right up to 23:59:59.999', () => {
    const today = toLocalDateString(new Date());
    const where = buildAuditWhere({ to: today });

    const lte = (where.createdAt as { lte?: Date }).lte!;
    expectLocalEndOfDay(lte, today);

    // حدث وقع قبل لحظة (أو في أي وقت اليوم) يجب أن يقع داخل الفلتر.
    expect(new Date() <= lte).toBe(true);
    const noonToday = new Date();
    noonToday.setHours(12, 0, 0, 0);
    expect(noonToday <= lte).toBe(true);
  });

  it('from/to covers the full inclusive local span', () => {
    const where = buildAuditWhere({ from: '2026-08-01', to: '2026-08-31' });
    expectLocalRange(where.createdAt, '2026-08-01', '2026-08-31');
  });

  it('single-day filter covers that whole day', () => {
    const where = buildAuditWhere({ from: '2026-08-02', to: '2026-08-02' });
    expectLocalRange(where.createdAt, '2026-08-02', '2026-08-02');

    const { gte, lte } = where.createdAt as { gte: Date; lte: Date };
    const lateEvent = new Date(2026, 7, 2, 23, 59, 59, 999);
    const earlyEvent = new Date(2026, 7, 2, 0, 0, 0, 0);
    expect(earlyEvent >= gte && earlyEvent <= lte).toBe(true);
    expect(lateEvent >= gte && lateEvent <= lte).toBe(true);
  });

  it('no date bounds → no createdAt filter (all history)', () => {
    expect(buildAuditWhere({}).createdAt).toBeUndefined();
  });

  it('leaves the non-date filters untouched', () => {
    const where = buildAuditWhere({
      module: 'invoices', action: 'UPDATE', userId: '7', search: 'abc', to: '2026-08-31',
    });
    expect(where.module).toBe('invoices');
    expect(where.action).toBe('UPDATE');
    expect(where.userId).toBe(7);
    expect(where.OR).toHaveLength(3);
    expectLocalEndOfDay((where.createdAt as { lte?: Date }).lte, '2026-08-31');
  });
});
