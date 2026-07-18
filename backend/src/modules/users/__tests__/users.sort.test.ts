import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation v1 — المستخدمون: فرز عمود علاقة الدور
 * (role → role.displayName) مع بقاء SAFE_SELECT (إخفاء passwordHash) كما هو —
 * الفرز لا يوسّع الحقول المعادة إطلاقًا.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    user: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { usersService } from '../users.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  mp.user.findMany.mockResolvedValue([]);
  mp.user.count.mockResolvedValue(0);
});

function findManyArgs() {
  return mp.user.findMany.mock.calls[0][0];
}

describe('users.list — server-side sorting', () => {
  it('no sort params → historical default (id desc)', async () => {
    await usersService.list({});
    expect(findManyArgs().orderBy).toEqual([{ id: 'desc' }]);
  });

  it('relation column role → orderBy on role.displayName', async () => {
    await usersService.list({ sortBy: 'role', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ role: { displayName: 'asc' } }, { id: 'desc' }]);
  });

  it('scalar sort (username asc)', async () => {
    await usersService.list({ sortBy: 'username', sortDir: 'asc' });
    expect(findManyArgs().orderBy).toEqual([{ username: 'asc' }, { id: 'desc' }]);
  });

  it('SECURITY: passwordHash is not sortable and SAFE_SELECT is preserved under sorting', async () => {
    await usersService.list({ sortBy: 'passwordHash', sortDir: 'asc' });
    const args = findManyArgs();
    expect(args.orderBy).toEqual([{ id: 'desc' }]); // مفتاح مرفوض → الافتراضي
    expect(args.select.passwordHash).toBeUndefined(); // الحقل الحسّاس ليس ضمن select
    expect(args.select.username).toBe(true); // SAFE_SELECT كما هو
  });
});
