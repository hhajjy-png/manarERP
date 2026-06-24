import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the approval engine
vi.mock('@shared/services/approval.service', () => ({
  approvalEngine: {
    hasModule: vi.fn(),
    getHistoryPermission: vi.fn(),
    getHistory: vi.fn(),
  },
}));

import { approvalController } from '../approval.controller';
import { approvalEngine } from '@shared/services/approval.service';

const mockEngine = approvalEngine as unknown as {
  hasModule: ReturnType<typeof vi.fn>;
  getHistoryPermission: ReturnType<typeof vi.fn>;
  getHistory: ReturnType<typeof vi.fn>;
};

/**
 * req.user is TokenPayload: { userId, username, roleId, roleName }
 * req.permissions is a separate string[] set by auth.middleware
 */
function makeReq(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    params: { entityType: 'expense', entityId: '1' },
    user: { userId: 1, username: 'test', roleId: 2, roleName: 'ACCOUNTANT' },
    permissions: ['expenses.view'],
    ...overrides,
  };
}

function makeRes() {
  const res: Record<string, unknown> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEngine.getHistory.mockResolvedValue([]);
});

describe('approvalController.getHistory', () => {
  it('returns 400 for unregistered entityType', async () => {
    mockEngine.hasModule.mockReturnValue(false);
    const req = makeReq();
    const res = makeRes();
    await approvalController.getHistory(req as never, res as never);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(400);
    expect((res.json as ReturnType<typeof vi.fn>).mock.calls[0][0].error).toMatch('غير معروف');
  });

  it('allows authenticated user when registered and no historyPermission', async () => {
    mockEngine.hasModule.mockReturnValue(true);
    mockEngine.getHistoryPermission.mockReturnValue(undefined);
    const req = makeReq({
      user: { userId: 2, username: 'viewer', roleId: 3, roleName: 'VIEWER' },
      permissions: [],
    });
    const res = makeRes();
    await approvalController.getHistory(req as never, res as never);
    expect(mockEngine.getHistory).toHaveBeenCalledWith('expense', 1);
  });

  it('returns 403 when historyPermission declared and user lacks it', async () => {
    mockEngine.hasModule.mockReturnValue(true);
    mockEngine.getHistoryPermission.mockReturnValue('expenses.view');
    const req = makeReq({
      user: { userId: 3, username: 'viewer', roleId: 3, roleName: 'VIEWER' },
      permissions: [],
    });
    const res = makeRes();
    await approvalController.getHistory(req as never, res as never);
    expect((res.status as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(403);
    expect(mockEngine.getHistory).not.toHaveBeenCalled();
  });

  it('allows user with required permission', async () => {
    mockEngine.hasModule.mockReturnValue(true);
    mockEngine.getHistoryPermission.mockReturnValue('expenses.view');
    const req = makeReq({
      user: { userId: 4, username: 'accountant', roleId: 2, roleName: 'ACCOUNTANT' },
      permissions: ['expenses.view'],
    });
    const res = makeRes();
    await approvalController.getHistory(req as never, res as never);
    expect(mockEngine.getHistory).toHaveBeenCalledWith('expense', 1);
  });

  it('SYSTEM_ADMIN bypasses historyPermission', async () => {
    mockEngine.hasModule.mockReturnValue(true);
    mockEngine.getHistoryPermission.mockReturnValue('expenses.view');
    const req = makeReq({
      user: { userId: 5, username: 'admin', roleId: 1, roleName: 'SYSTEM_ADMIN' },
      permissions: [],
    });
    const res = makeRes();
    await approvalController.getHistory(req as never, res as never);
    expect(mockEngine.getHistory).toHaveBeenCalledWith('expense', 1);
  });
});
