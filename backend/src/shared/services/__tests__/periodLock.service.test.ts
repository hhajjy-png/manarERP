import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request } from 'express';

vi.mock('../../../config/database', () => ({
  prisma: { setting: { findUnique: vi.fn() }, auditLog: { create: vi.fn() } },
}));

import {
  assertPeriodOpen,
  invalidatePeriodLockCache,
  isBeforeLock,
  OVERRIDE_PERMISSION,
  OVERRIDE_AUDIT_ACTION,
  LOCK_SETTING_KEY,
} from '../periodLock.service';
import { runWithRequestActor } from '../../../core/context/requestContext';
import { AppError } from '../../../core/errors/AppError';

/** عميل Prisma وهمي — يمثّل عميل المعاملة الممرَّر للحارس. */
function makeClient(lockValue: string | null) {
  return {
    setting: { findUnique: vi.fn().mockResolvedValue(lockValue ? { value: lockValue } : null) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: 1 }) },
  };
}

/** طلب وهمي يحمل الفاعل كما يضعه `authenticate`. */
function fakeReq(user: { userId: number; roleName: string } | null, permissions: string[] = []): Request {
  return { user: user ?? undefined, permissions, ip: '127.0.0.1' } as unknown as Request;
}

const OP = { operation: 'ترحيل قيد محاسبي', module: 'accounting' };
const IN_2024 = new Date(2024, 11, 15);
const IN_2026 = new Date(2026, 5, 10);

beforeEach(() => {
  vi.clearAllMocks();
  invalidatePeriodLockCache();
});

describe('isBeforeLock', () => {
  it('compares at day granularity, not by timestamp', () => {
    const lock = new Date(2025, 0, 1);
    expect(isBeforeLock(new Date(2024, 11, 31, 23, 59), lock)).toBe(true);
    // نفس يوم القفل مسموح: القفل يمنع ما قبله لا ما فيه.
    expect(isBeforeLock(new Date(2025, 0, 1, 0, 0), lock)).toBe(false);
    expect(isBeforeLock(new Date(2025, 0, 1, 23, 59), lock)).toBe(false);
  });
});

describe('assertPeriodOpen — outside an HTTP request', () => {
  it('passes without ever reading the lock setting', async () => {
    const client = makeClient('2025-01-01');
    await expect(assertPeriodOpen(client as never, IN_2024, OP)).resolves.toBeUndefined();
    // الفحص المسبق للفاعل يوفّر استعلامًا في كل ترحيل داخلي/اختباري.
    expect(client.setting.findUnique).not.toHaveBeenCalled();
  });
});

describe('assertPeriodOpen — no lock configured', () => {
  it('passes for any date when the setting is absent', async () => {
    const client = makeClient(null);
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'ACCOUNTANT' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, OP)).resolves.toBeUndefined();
    });
    expect(client.setting.findUnique).toHaveBeenCalledWith({ where: { key: LOCK_SETTING_KEY } });
  });

  it('treats an empty setting value as "no lock"', async () => {
    const client = makeClient('   ');
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'ACCOUNTANT' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, OP)).resolves.toBeUndefined();
    });
  });
});

describe('assertPeriodOpen — lock active', () => {
  it('blocks a 2024 posting for a user without override permission', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 7, roleName: 'ACCOUNTANT' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, OP)).rejects.toThrow(AppError);
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it('surfaces the lock date and the transaction date in the error message', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 7, roleName: 'ACCOUNTANT' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, OP)).rejects.toThrow(/2025-01-01/);
    });
  });

  it('allows a current-period posting while the lock is active', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 7, roleName: 'ACCOUNTANT' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2026, OP)).resolves.toBeUndefined();
    });
    expect(client.auditLog.create).not.toHaveBeenCalled();
  });

  it('lets a permitted user override, and records the override in the audit log', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 9, roleName: 'ACCOUNTANT' }, [OVERRIDE_PERMISSION]), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, { ...OP, entityId: 'EXPENSE#3' })).resolves.toBeUndefined();
    });

    expect(client.auditLog.create).toHaveBeenCalledTimes(1);
    const row = client.auditLog.create.mock.calls[0][0].data;
    expect(row.action).toBe(OVERRIDE_AUDIT_ACTION);
    expect(row.userId).toBe(9);
    expect(row.entityId).toBe('EXPENSE#3');

    const payload = JSON.parse(row.newValue);
    expect(payload).toMatchObject({
      transactionDate: '2024-12-15',
      lockBeforeDate: '2025-01-01',
      overriddenBy: 9,
    });
  });

  it('lets SYSTEM_ADMIN override without an explicit permission key', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), async () => {
      await expect(assertPeriodOpen(client as never, IN_2024, OP)).resolves.toBeUndefined();
    });
    expect(client.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('writes the override audit row through the caller-supplied client', async () => {
    // ذرّية: يجب أن يُكتب سجل التجاوز داخل نفس المعاملة، فإن فشل الترحيل تراجَع معه.
    const txClient = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), async () => {
      await assertPeriodOpen(txClient as never, IN_2024, OP);
    });
    expect(txClient.auditLog.create).toHaveBeenCalledTimes(1);
  });
});

describe('lock setting cache', () => {
  it('reads the setting once across repeated guard calls', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), async () => {
      await assertPeriodOpen(client as never, IN_2026, OP);
      await assertPeriodOpen(client as never, IN_2026, OP);
      await assertPeriodOpen(client as never, IN_2026, OP);
    });
    expect(client.setting.findUnique).toHaveBeenCalledTimes(1);
  });

  it('re-reads after invalidation, so a settings update takes effect immediately', async () => {
    const client = makeClient('2025-01-01');
    await runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), async () => {
      await assertPeriodOpen(client as never, IN_2026, OP);
      invalidatePeriodLockCache();
      await assertPeriodOpen(client as never, IN_2026, OP);
    });
    expect(client.setting.findUnique).toHaveBeenCalledTimes(2);
  });
});

describe('request context isolation', () => {
  it('does not leak an actor between concurrent requests', async () => {
    const client = makeClient('2025-01-01');
    const admin = runWithRequestActor(fakeReq({ userId: 1, roleName: 'SYSTEM_ADMIN' }), () =>
      assertPeriodOpen(client as never, IN_2024, OP).then(() => 'allowed'),
    );
    const clerk = runWithRequestActor(fakeReq({ userId: 2, roleName: 'ACCOUNTANT' }), () =>
      assertPeriodOpen(client as never, IN_2024, OP).then(() => 'allowed').catch(() => 'blocked'),
    );
    expect(await Promise.all([admin, clerk])).toEqual(['allowed', 'blocked']);
  });
});
