import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '../../../core/errors/AppError';

// ── Mocks ──────────────────────────────────────────────────────────────

vi.mock('../../../config/database', () => ({
  prisma: {
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn(mockTx)),
    approvalHistory: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('../../../config/constants', () => ({
  ROLES: { SYSTEM_ADMIN: 'SYSTEM_ADMIN' },
}));

// Shared mock transaction client — reset in beforeEach
const mockTx = {
  user: { findUnique: vi.fn() },
  approvalHistory: { create: vi.fn() },
  auditLog: { create: vi.fn() },
};

// ── Helpers ────────────────────────────────────────────────────────────

function makeConfig(overrides: Partial<import('../approval.types').ApprovalModuleConfig> = {}): import('../approval.types').ApprovalModuleConfig {
  return {
    entityType: 'testEntity',
    statusField: 'status',
    allowedStatuses: ['PENDING', 'APPROVED', 'REJECTED'],
    transitions: [
      { action: 'approve', from: 'PENDING', to: 'APPROVED' },
      { action: 'reject',  from: 'PENDING', to: 'REJECTED', requireComment: true },
      { action: 'reopen',  from: ['REJECTED'], to: 'PENDING' },
    ],
    permissions: {},
    getEntity: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
    updateStatus: vi.fn().mockImplementation((_id, toStatus) =>
      Promise.resolve({ id: 1, status: toStatus })
    ),
    auditModule: 'testEntity',
    ...overrides,
  };
}

// ── Tests ──────────────────────────────────────────────────────────────

describe('ApprovalEngine.register', () => {
  let approvalEngine: import('../approval.service').ApprovalEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    // Re-import a fresh engine instance per test to avoid registry state leaking
    vi.resetModules();
    const mod = await import('../approval.service');
    approvalEngine = new mod.ApprovalEngine();
  });

  it('registers a module config without error', () => {
    expect(() => approvalEngine.register(makeConfig())).not.toThrow();
  });

  it('throws when the same entityType is registered twice', () => {
    approvalEngine.register(makeConfig());
    expect(() => approvalEngine.register(makeConfig())).toThrow(
      "ApprovalEngine: entityType 'testEntity' is already registered."
    );
  });
});

describe('ApprovalEngine.transition — state machine validation', () => {
  let approvalEngine: import('../approval.service').ApprovalEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../approval.service');
    approvalEngine = new mod.ApprovalEngine();
    approvalEngine.register(makeConfig());

    // Default: user has no relevant permissions (empty role), not SYSTEM_ADMIN
    mockTx.user.findUnique.mockResolvedValue({
      role: { name: 'ACCOUNTANT', rolePermissions: [] },
    });
    mockTx.approvalHistory.create.mockResolvedValue({
      id: 1, entityType: 'testEntity', entityId: 1,
      action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED',
      userId: 42, comment: null, reason: null, createdAt: new Date(),
    });
    mockTx.auditLog.create.mockResolvedValue({});
  });

  it('throws when entityType is not registered', async () => {
    await expect(
      approvalEngine.transition({ entityType: 'unknown', entityId: 1, action: 'approve', userId: 42 }, mockTx as never)
    ).rejects.toThrow("no config registered for entityType 'unknown'");
  });

  it('throws when action does not match current entity status', async () => {
    // Entity is APPROVED, but we try to approve again (no APPROVED→anything transition)
    const config = makeConfig({
      getEntity: vi.fn().mockResolvedValue({ id: 1, status: 'APPROVED' }),
    });
    const mod = await import('../approval.service');
    const engine = new mod.ApprovalEngine();
    engine.register(config);

    await expect(
      engine.transition({ entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42 }, mockTx as never)
    ).rejects.toThrow("لا يمكن تنفيذ الإجراء");
  });

  it('throws when requireComment is true but comment is missing', async () => {
    await expect(
      approvalEngine.transition({ entityType: 'testEntity', entityId: 1, action: 'reject', userId: 42 }, mockTx as never)
    ).rejects.toThrow("يجب توفير ملاحظة");
  });

  it('throws when requireComment is true but comment is whitespace only', async () => {
    await expect(
      approvalEngine.transition({ entityType: 'testEntity', entityId: 1, action: 'reject', userId: 42, comment: '   ' }, mockTx as never)
    ).rejects.toThrow("يجب توفير ملاحظة");
  });

  it('accepts a transition when requireComment is true and comment is provided', async () => {
    const result = await approvalEngine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'reject', userId: 42, comment: 'غير مطابق' },
      mockTx as never
    );
    expect(result.entity).toMatchObject({ status: 'REJECTED' });
  });

  it('accepts a transition from an array-form `from` field', async () => {
    const config = makeConfig({
      getEntity: vi.fn().mockResolvedValue({ id: 1, status: 'REJECTED' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
    });
    const mod = await import('../approval.service');
    const engine = new mod.ApprovalEngine();
    engine.register(config);
    mockTx.approvalHistory.create.mockResolvedValue({
      id: 2, entityType: 'testEntity', entityId: 1,
      action: 'reopen', fromStatus: 'REJECTED', toStatus: 'PENDING',
      userId: 42, comment: null, reason: null, createdAt: new Date(),
    });

    const result = await engine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'reopen', userId: 42 },
      mockTx as never
    );
    expect(result.entity).toMatchObject({ status: 'PENDING' });
  });
});

describe('ApprovalEngine.transition — side effects and history', () => {
  let approvalEngine: import('../approval.service').ApprovalEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import('../approval.service');
    approvalEngine = new mod.ApprovalEngine();

    mockTx.user.findUnique.mockResolvedValue({
      role: { name: 'ACCOUNTANT', rolePermissions: [] },
    });
    mockTx.approvalHistory.create.mockResolvedValue({
      id: 1, entityType: 'testEntity', entityId: 1,
      action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED',
      userId: 42, comment: null, reason: null, createdAt: new Date(),
    });
    mockTx.auditLog.create.mockResolvedValue({});
  });

  it('calls updateStatus with the correct target status', async () => {
    const updateStatus = vi.fn().mockResolvedValue({ id: 1, status: 'APPROVED' });
    approvalEngine.register(makeConfig({ updateStatus }));

    await approvalEngine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42 },
      mockTx as never
    );

    expect(updateStatus).toHaveBeenCalledWith(
      1,
      'APPROVED',
      expect.objectContaining({ action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED', userId: 42 }),
      mockTx
    );
  });

  it('writes an ApprovalHistory record with correct fields', async () => {
    approvalEngine.register(makeConfig());

    await approvalEngine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42, comment: 'جيد' },
      mockTx as never
    );

    expect(mockTx.approvalHistory.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'testEntity',
          entityId: 1,
          action: 'approve',
          fromStatus: 'PENDING',
          toStatus: 'APPROVED',
          userId: 42,
          comment: 'جيد',
        }),
      })
    );
  });

  it('calls side-effect hook when defined for the action', async () => {
    const sideEffectFn = vi.fn().mockResolvedValue(undefined);
    approvalEngine.register(makeConfig({ sideEffects: { approve: sideEffectFn } }));

    await approvalEngine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42 },
      mockTx as never
    );

    expect(sideEffectFn).toHaveBeenCalledOnce();
    expect(sideEffectFn).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'APPROVED' }),
      expect.objectContaining({ action: 'approve' }),
      mockTx
    );
  });

  it('does NOT call side-effect hook when action has no registered hook', async () => {
    const approveHook = vi.fn().mockResolvedValue(undefined);
    approvalEngine.register(makeConfig({ sideEffects: { approve: approveHook } }));

    // reopen has no hook
    const config = makeConfig({
      getEntity: vi.fn().mockResolvedValue({ id: 1, status: 'REJECTED' }),
      updateStatus: vi.fn().mockResolvedValue({ id: 1, status: 'PENDING' }),
      sideEffects: { approve: approveHook },
    });
    const mod = await import('../approval.service');
    const engine = new mod.ApprovalEngine();
    engine.register(config);
    mockTx.approvalHistory.create.mockResolvedValue({
      id: 2, entityType: 'testEntity', entityId: 1,
      action: 'reopen', fromStatus: 'REJECTED', toStatus: 'PENDING',
      userId: 42, comment: null, reason: null, createdAt: new Date(),
    });

    await engine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'reopen', userId: 42 },
      mockTx as never
    );

    expect(approveHook).not.toHaveBeenCalled();
  });

  it('propagates side-effect hook errors (ensures rollback would occur)', async () => {
    const failingHook = vi.fn().mockRejectedValue(new Error('GL posting failed'));
    approvalEngine.register(makeConfig({ sideEffects: { approve: failingHook } }));

    await expect(
      approvalEngine.transition(
        { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42 },
        mockTx as never
      )
    ).rejects.toThrow('GL posting failed');
  });

  it('returns the updated entity and historyEntry in TransitionResult', async () => {
    approvalEngine.register(makeConfig());

    const result = await approvalEngine.transition(
      { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 42 },
      mockTx as never
    );

    expect(result).toMatchObject({
      entity: { id: 1, status: 'APPROVED' },
      historyEntry: expect.objectContaining({ action: 'approve', toStatus: 'APPROVED' }),
    });
  });
});

describe('ApprovalEngine.transition — permission check', () => {
  it('bypasses permission check for SYSTEM_ADMIN', async () => {
    vi.resetModules();
    const mod = await import('../approval.service');
    const engine = new mod.ApprovalEngine();

    engine.register(makeConfig({
      permissions: { approve: 'testEntity.approve' },
    }));

    mockTx.user.findUnique.mockResolvedValue({
      role: { name: 'SYSTEM_ADMIN', rolePermissions: [] }, // no permissions, but SYSTEM_ADMIN
    });
    mockTx.approvalHistory.create.mockResolvedValue({
      id: 1, entityType: 'testEntity', entityId: 1,
      action: 'approve', fromStatus: 'PENDING', toStatus: 'APPROVED',
      userId: 1, comment: null, reason: null, createdAt: new Date(),
    });
    mockTx.auditLog.create.mockResolvedValue({});

    await expect(
      engine.transition(
        { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 1 },
        mockTx as never
      )
    ).resolves.toBeDefined();
  });

  it('throws forbidden when user lacks required permission', async () => {
    vi.resetModules();
    const mod = await import('../approval.service');
    const engine = new mod.ApprovalEngine();

    engine.register(makeConfig({
      permissions: { approve: 'testEntity.approve' },
    }));

    mockTx.user.findUnique.mockResolvedValue({
      role: {
        name: 'ACCOUNTANT',
        rolePermissions: [
          { permission: { key: 'testEntity.read' } }, // has read but not approve
        ],
      },
    });

    await expect(
      engine.transition(
        { entityType: 'testEntity', entityId: 1, action: 'approve', userId: 99 },
        mockTx as never
      )
    ).rejects.toThrow('ليس لديك صلاحية');
  });
});

describe('ApprovalEngine.getHistory', () => {
  it('queries prisma.approvalHistory.findMany with correct args', async () => {
    vi.resetModules();
    const { prisma } = await import('../../../config/database') as never as { prisma: { approvalHistory: { findMany: ReturnType<typeof vi.fn> } } };
    const { approvalEngine } = await import('../approval.service');

    (prisma.approvalHistory.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);

    const result = await approvalEngine.getHistory('expense', 7);

    expect(prisma.approvalHistory.findMany).toHaveBeenCalledWith({
      where: { entityType: 'expense', entityId: 7 },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
    expect(result).toEqual([]);
  });
});
