# Approval Workflow Pack v1 — Phase A: Universal Approval Engine Foundation

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the shared approval infrastructure (DB table, registry engine, reusable UI components, history endpoint) that all future module-level approval workflows will plug into — with zero change to existing Expense, Payroll, or Invoice behavior.

**Architecture:** A singleton `approvalEngine` holds a registry of per-module configs. Modules register once at startup. At runtime, calling `approvalEngine.transition(input, tx?)` validates the state machine, writes `ApprovalHistory`, writes `AuditLog`, runs side-effect hooks — all inside a single Prisma transaction. Four reusable frontend components (badge, actions, timeline, panel) are built but not wired into any module page.

**Tech Stack:** Prisma 5 (SQLite), Express 4, TypeScript 5.5, Vitest 2, React 18, Vite 5, Axios 1.7. Path aliases: `@shared/*` → `backend/src/shared/*`, `@config/*` → `backend/src/config/*`, `@core/*` → `backend/src/core/*`.

## Global Constraints

- Do NOT modify any existing module service, controller, or route (expenses, payroll, invoices, etc.)
- Do NOT change any existing module status values or transition logic
- All existing tests must still pass after every task
- All TypeScript must pass `tsc --noEmit` with zero errors before any commit
- All backend responses use `ok(res, data)` from `backend/src/core/utils/response.ts` — never `res.json()` directly
- Currency is KWD (Kuwaiti Dinar) — not relevant for this feature but noted for future side-effect hooks
- Route prefix for the history endpoint: `/api/approval-history`
- History endpoint uses `authenticate` middleware only (no `requirePermission`) per spec
- Side-effect hooks run **inside** the same Prisma `$transaction` — throwing rolls back everything
- `AuditLog` write inside engine uses `client.auditLog.create()` directly (no `recordAudit()`) because the engine has no `req` object; `ipAddress` is not captured for engine-driven events
- Frontend components live in `frontend/src/components/approval/` — not imported by any page yet
- No module registers with the engine in Phase A

---

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `backend/src/shared/services/approval.types.ts` | All TS interfaces: `ApprovalModuleConfig`, `ApprovalTransition`, `TransitionInput`, `TransitionResult`, `ApprovalMeta`, `ApprovalSideEffect`, `ApprovalTransitionEvent`, `ApprovalTransitionListener` |
| `backend/src/shared/services/approval.service.ts` | `ApprovalEngine` class + `approvalEngine` singleton export |
| `backend/src/shared/services/__tests__/approval.service.test.ts` | Unit tests for `register()`, `transition()`, `getHistory()` |
| `backend/src/modules/approval/approval.controller.ts` | Single handler: `getHistory(req, res)` |
| `backend/src/modules/approval/approval.routes.ts` | `GET /:entityType/:entityId` wired to controller |
| `frontend/src/api/approvalHistory.ts` | Axios helper: `approvalHistoryApi.getHistory()` |
| `frontend/src/components/approval/ApprovalBadge.tsx` | Status chip with color map |
| `frontend/src/components/approval/ApprovalTimeline.tsx` | Ordered list of `ApprovalHistory` entries |
| `frontend/src/components/approval/ApprovalActions.tsx` | Action buttons with optional comment prompt |
| `frontend/src/components/approval/ApprovalHistoryPanel.tsx` | Composite: fetches history + renders Timeline + optional Actions |
| `frontend/src/components/approval/index.ts` | Barrel export for all four components + types |

### Modified Files

| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `ApprovalHistory` model; add `approvalHistories` relation on `User` |
| `backend/src/config/constants.ts` | Add `'submit'` and `'reopen'` to `ACTIONS` array |
| `backend/src/app.ts` | Import and register approval router at `/api/approval-history` |

### Generated Files (not manually edited)

| File | How |
|------|-----|
| `backend/prisma/migrations/YYYYMMDD_add_approval_history/migration.sql` | `prisma migrate dev --name add_approval_history` |

---

## Task 1: Schema — ApprovalHistory Table + Migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Generated: new migration file under `backend/prisma/migrations/`

**Interfaces:**
- Produces: `ApprovalHistory` Prisma model — consumed by `approval.service.ts` (Task 3) and `approval.controller.ts` (Task 4)

- [ ] **Step 1: Add `ApprovalHistory` model to schema.prisma**

Open `backend/prisma/schema.prisma`. After the `AuditLog` model (around line 739), add:

```prisma
// ─────────────────────────────────────────────────────────────────────────
//  سجل الاعتماد (Approval History) — تاريخ حالات الموافقة عبر الوحدات
// ─────────────────────────────────────────────────────────────────────────

model ApprovalHistory {
  id           Int      @id @default(autoincrement())
  entityType   String   // 'expense' | 'payroll' | 'invoice' | future modules
  entityId     Int
  action       String   // 'approve' | 'reject' | 'submit' | 'cancel' | 'reopen' | 'pay'
  fromStatus   String
  toStatus     String
  userId       Int?     // null for system-initiated transitions
  comment      String?
  reason       String?
  metadataJson String?  // JSON blob for future extensibility

  user User? @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("approval_history")
}
```

- [ ] **Step 2: Add `approvalHistories` relation to the `User` model**

In the `User` model block, after the `backups Backup[]` line, add:

```prisma
  approvalHistories ApprovalHistory[]
```

- [ ] **Step 3: Validate the schema**

```bash
cd backend && npx prisma validate
```

Expected output: `The schema at .../schema.prisma is valid 🚀`

- [ ] **Step 4: Run the migration**

```bash
cd backend && npx prisma migrate dev --name add_approval_history
```

Expected: Migration applied. A new folder appears under `backend/prisma/migrations/` containing `migration.sql`.

- [ ] **Step 5: Review the generated SQL**

Open the generated `migration.sql` and verify it contains exactly:

```sql
CREATE TABLE "approval_history" (
    "id"           INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "entityType"   TEXT NOT NULL,
    "entityId"     INTEGER NOT NULL,
    "action"       TEXT NOT NULL,
    "fromStatus"   TEXT NOT NULL,
    "toStatus"     TEXT NOT NULL,
    "userId"       INTEGER,
    "comment"      TEXT,
    "reason"       TEXT,
    "metadataJson" TEXT,
    "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- foreign key, indexes (exact syntax varies by Prisma version)
```

If the SQL looks correct, continue. If there are unexpected DROP or ALTER statements, stop and investigate.

- [ ] **Step 6: Regenerate the Prisma client**

```bash
cd backend && npm run db:generate
```

Expected: `Generated Prisma Client (v5.x.x)` with no errors.

- [ ] **Step 7: Verify TypeScript picks up new model**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors. The `ApprovalHistory` type is now available in `@prisma/client`.

- [ ] **Step 8: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "feat(db): add ApprovalHistory table for universal approval engine"
```

---

## Task 2: Backend — Add `submit` and `reopen` to ACTIONS constant

**Files:**
- Modify: `backend/src/config/constants.ts`

**Interfaces:**
- Produces: `ActionName` union type now includes `'submit'` and `'reopen'` — consumed by module configs registered in Phase B+

- [ ] **Step 1: Add the two new action values**

Open `backend/src/config/constants.ts`. Find the `ACTIONS` array (around line 60). Change it from:

```typescript
export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'pay',
  'generate',
  'payslip',
  'adjust',
  'cancel',
  'print',
] as const;
```

To:

```typescript
export const ACTIONS = [
  'read',
  'create',
  'update',
  'delete',
  'approve',
  'export',
  'pay',
  'generate',
  'payslip',
  'adjust',
  'cancel',
  'print',
  'submit',   // Draft → Pending submission step (used by future module configs)
  'reopen',   // Rejected → Pending reopen step (used by future module configs)
] as const;
```

- [ ] **Step 2: Verify no type breakage**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors. `ActionName` now includes `'submit' | 'reopen'`.

- [ ] **Step 3: Run existing tests**

```bash
cd backend && npm test
```

Expected: All existing tests pass. No test uses `ACTIONS` as a runtime value that would break.

- [ ] **Step 4: Commit**

```bash
git add backend/src/config/constants.ts
git commit -m "feat(config): add submit and reopen to ACTIONS constant"
```

---

## Task 3: Backend — `approval.types.ts` (all interfaces)

**Files:**
- Create: `backend/src/shared/services/approval.types.ts`

**Interfaces:**
- Produces: All TypeScript types consumed by `approval.service.ts` (Task 4) and future module configs

- [ ] **Step 1: Create the types file**

Create `backend/src/shared/services/approval.types.ts` with the following content:

```typescript
import type { Prisma } from '@prisma/client';

// ── Module Config ────────────────────────────────────────────────────────

/** One valid state transition within a module's state machine. */
export interface ApprovalTransition {
  /** Logical action name, e.g. 'approve', 'reject', 'submit', 'cancel', 'reopen'. */
  action: string;
  /** Status value(s) the entity must currently be in for this transition to apply. */
  from: string | string[];
  /** Status value the entity moves to on success. */
  to: string;
  /** When true, the caller must supply a non-empty `comment`. Defaults to false. */
  requireComment?: boolean;
}

/** Passed to `updateStatus` and `sideEffect` hooks. */
export interface ApprovalMeta {
  action: string;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  comment?: string;
  reason?: string;
}

/** Side-effect function that runs inside the same Prisma transaction as the status update. */
export type ApprovalSideEffect<TEntity = unknown> = (
  entity: TEntity,
  meta: ApprovalMeta,
  tx: Prisma.TransactionClient
) => Promise<void>;

/**
 * Configuration object registered per module. TEntity is the Prisma model shape
 * (e.g. the full Expense row including relations if needed by side effects).
 */
export interface ApprovalModuleConfig<TEntity = Record<string, unknown>> {
  /** Unique identifier for this entity type, e.g. 'expense', 'payroll'. */
  entityType: string;

  /** Name of the status field on TEntity, e.g. 'status'. */
  statusField: keyof TEntity & string;

  /** All valid status values for this module. Used for documentation / future assertions. */
  allowedStatuses: readonly string[];

  /** All valid state transitions for this module. */
  transitions: readonly ApprovalTransition[];

  /**
   * Maps action name → permission key string (e.g. { approve: 'expenses.approve' }).
   * The engine validates this against the requesting user's effective permissions.
   * An action with no entry in this map skips the permission check.
   * SYSTEM_ADMIN role bypasses all checks.
   */
  permissions: Record<string, string>;

  /**
   * Fetch the entity by id within the transaction.
   * Must throw AppError.notFound() if the entity does not exist.
   */
  getEntity: (id: number, tx: Prisma.TransactionClient) => Promise<TEntity>;

  /**
   * Persist the new status (and any related fields like approvedById) within the transaction.
   * Returns the updated entity.
   */
  updateStatus: (
    id: number,
    toStatus: string,
    meta: ApprovalMeta,
    tx: Prisma.TransactionClient
  ) => Promise<TEntity>;

  /**
   * Optional side-effect functions keyed by action name.
   * Each hook runs inside the transaction after the status update and history write.
   * Throwing inside a hook rolls back the entire transition.
   */
  sideEffects?: Partial<Record<string, ApprovalSideEffect<TEntity>>>;

  /** Module name used when writing AuditLog records (e.g. 'expenses'). */
  auditModule: string;

  /**
   * Arabic labels for actions, written as the AuditLog `action` field.
   * Merged with defaults: approve→اعتماد, reject→رفض, submit→إرسال للاعتماد,
   * cancel→إلغاء, reopen→إعادة فتح, pay→صرف.
   */
  auditLabels?: Partial<Record<string, string>>;
}

// ── Engine Input / Output ────────────────────────────────────────────────

export interface TransitionInput {
  entityType: string;
  entityId: number;
  action: string;
  /** ID of the User record requesting the transition — used for permission checks and history. */
  userId: number;
  comment?: string;
  reason?: string;
  /** Optional snapshot or future fields (delegation, signature). Stored as JSON in history. */
  metadata?: Record<string, unknown>;
}

export interface ApprovalHistoryEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  comment: string | null;
  reason: string | null;
  createdAt: Date;
}

export interface TransitionResult<TEntity = unknown> {
  /** The entity after its status was updated. */
  entity: TEntity;
  /** The ApprovalHistory record created by this transition. */
  historyEntry: ApprovalHistoryEntry;
}

// ── Notification Extension ───────────────────────────────────────────────

/** Emitted after a successful transition, outside the transaction. */
export interface ApprovalTransitionEvent {
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  timestamp: Date;
}

export type ApprovalTransitionListener = (event: ApprovalTransitionEvent) => void;
```

- [ ] **Step 2: Validate types compile cleanly**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add backend/src/shared/services/approval.types.ts
git commit -m "feat(approval): add shared approval engine type definitions"
```

---

## Task 4: Backend — `approval.service.ts` (engine) + unit tests

**Files:**
- Create: `backend/src/shared/services/approval.service.ts`
- Create: `backend/src/shared/services/__tests__/approval.service.test.ts`

**Interfaces:**
- Consumes: All types from `approval.types.ts` (Task 3); `prisma` from `@config/database`; `AppError` from `@core/errors/AppError`; `ROLES` from `@config/constants`
- Produces: `approvalEngine` singleton — consumed by `approval.controller.ts` (Task 5) and future module service configs

- [ ] **Step 1: Write the failing tests first**

Create `backend/src/shared/services/__tests__/approval.service.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests and verify they all fail**

```bash
cd backend && npm test -- approval.service.test.ts
```

Expected: All tests FAIL with "Cannot find module '../approval.service'" or similar. This confirms the test suite is wired correctly.

- [ ] **Step 3: Write the engine implementation**

Create `backend/src/shared/services/approval.service.ts`:

```typescript
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { ROLES } from '@config/constants';
import type { Prisma } from '@prisma/client';
import type {
  ApprovalModuleConfig,
  TransitionInput,
  TransitionResult,
  ApprovalTransitionEvent,
  ApprovalTransitionListener,
} from './approval.types';

const DEFAULT_AUDIT_LABELS: Record<string, string> = {
  approve: 'اعتماد',
  reject:  'رفض',
  submit:  'إرسال للاعتماد',
  cancel:  'إلغاء',
  reopen:  'إعادة فتح',
  pay:     'صرف',
};

export class ApprovalEngine {
  private readonly configs = new Map<string, ApprovalModuleConfig<unknown>>();
  private readonly listeners: ApprovalTransitionListener[] = [];

  // ── Registration ──────────────────────────────────────────────────────

  register<TEntity>(config: ApprovalModuleConfig<TEntity>): void {
    if (this.configs.has(config.entityType)) {
      throw new Error(`ApprovalEngine: entityType '${config.entityType}' is already registered.`);
    }
    this.configs.set(config.entityType, config as ApprovalModuleConfig<unknown>);
  }

  onTransition(listener: ApprovalTransitionListener): void {
    this.listeners.push(listener);
  }

  // ── Core Transition ───────────────────────────────────────────────────

  async transition<TEntity = unknown>(
    input: TransitionInput,
    tx?: Prisma.TransactionClient
  ): Promise<TransitionResult<TEntity>> {
    const config = this.configs.get(input.entityType) as ApprovalModuleConfig<TEntity> | undefined;
    if (!config) {
      throw AppError.badRequest(
        `Approval engine: no config registered for entityType '${input.entityType}'.`
      );
    }

    const run = async (client: Prisma.TransactionClient): Promise<TransitionResult<TEntity>> => {
      // 1. Fetch entity
      const entity = await config.getEntity(input.entityId, client);

      // 2. Resolve current status
      const currentStatus = String((entity as Record<string, unknown>)[config.statusField]);

      // 3. Find matching transition
      const transition = config.transitions.find(
        (t) =>
          t.action === input.action &&
          (Array.isArray(t.from)
            ? t.from.includes(currentStatus)
            : t.from === currentStatus)
      );
      if (!transition) {
        throw AppError.badRequest(
          `لا يمكن تنفيذ الإجراء '${input.action}' على الحالة الحالية '${currentStatus}'.`
        );
      }

      // 4. Comment requirement
      if (transition.requireComment && !input.comment?.trim()) {
        throw AppError.badRequest(
          `يجب توفير ملاحظة عند تنفيذ إجراء '${input.action}'.`
        );
      }

      // 5. Permission check (SYSTEM_ADMIN bypasses)
      const permissionKey = config.permissions[input.action];
      if (permissionKey) {
        await this.assertPermission(input.userId, permissionKey, client);
      }

      const meta = {
        action:     input.action,
        fromStatus: currentStatus,
        toStatus:   transition.to,
        userId:     input.userId,
        comment:    input.comment,
        reason:     input.reason,
      };

      // 6. Update entity status
      const updatedEntity = await config.updateStatus(input.entityId, transition.to, meta, client);

      // 7. Write ApprovalHistory
      const historyEntry = await client.approvalHistory.create({
        data: {
          entityType:   input.entityType,
          entityId:     input.entityId,
          action:       input.action,
          fromStatus:   currentStatus,
          toStatus:     transition.to,
          userId:       input.userId ?? null,
          comment:      input.comment ?? null,
          reason:       input.reason ?? null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        },
        select: {
          id: true, entityType: true, entityId: true, action: true,
          fromStatus: true, toStatus: true, userId: true,
          comment: true, reason: true, createdAt: true,
        },
      });

      // 8. Write AuditLog — never blocks on failure
      // Note: uses client.auditLog.create() directly (not recordAudit()) because
      // the engine has no Express `req`; ipAddress is not captured for engine events.
      void client.auditLog.create({
        data: {
          userId:   input.userId ?? null,
          action:   input.action.toUpperCase(),
          module:   config.auditModule,
          entityId: String(input.entityId),
          oldValue: JSON.stringify({ status: currentStatus }),
          newValue: JSON.stringify({ status: transition.to, comment: input.comment }),
        },
      }).catch(() => {
        // Audit failure must never roll back a real business transition
      });

      // 9. Side-effect hook
      const hook = config.sideEffects?.[input.action];
      if (hook) {
        await hook(updatedEntity, meta, client);
      }

      return { entity: updatedEntity, historyEntry };
    };

    const result = tx
      ? await run(tx)
      : await prisma.$transaction(run);

    // Emit notification event outside the transaction — best-effort, non-fatal
    const event: ApprovalTransitionEvent = {
      entityType: input.entityType,
      entityId:   input.entityId,
      action:     input.action,
      fromStatus: result.historyEntry.fromStatus,
      toStatus:   result.historyEntry.toStatus,
      userId:     input.userId,
      timestamp:  result.historyEntry.createdAt,
    };
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* non-fatal */ }
    }

    return result;
  }

  // ── History Query ─────────────────────────────────────────────────────

  async getHistory(entityType: string, entityId: number) {
    return prisma.approvalHistory.findMany({
      where: { entityType, entityId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, fullName: true } } },
    });
  }

  // ── Internal ──────────────────────────────────────────────────────────

  private async assertPermission(
    userId: number,
    permissionKey: string,
    tx: Prisma.TransactionClient
  ): Promise<void> {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: {
        role: {
          select: {
            name: true,
            rolePermissions: { select: { permission: { select: { key: true } } } },
          },
        },
      },
    });

    if (!user) throw AppError.unauthorized('المستخدم غير موجود');
    if (user.role.name === ROLES.SYSTEM_ADMIN) return;

    const keys = user.role.rolePermissions.map((rp) => rp.permission.key);
    if (!keys.includes(permissionKey)) {
      throw AppError.forbidden(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionKey}).`);
    }
  }
}

/** Singleton — import this everywhere instead of instantiating. */
export const approvalEngine = new ApprovalEngine();
```

- [ ] **Step 4: Run the tests and verify they all pass**

```bash
cd backend && npm test -- approval.service.test.ts
```

Expected: All tests PASS. Zero failures.

- [ ] **Step 5: Run all backend tests to verify no regressions**

```bash
cd backend && npm test
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: TypeScript validation**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 7: Commit**

```bash
git add backend/src/shared/services/approval.service.ts \
        backend/src/shared/services/__tests__/approval.service.test.ts
git commit -m "feat(approval): implement ApprovalEngine singleton with registry, transition, and history"
```

---

## Task 5: Backend — Approval module routes, controller, and `app.ts` registration

**Files:**
- Create: `backend/src/modules/approval/approval.controller.ts`
- Create: `backend/src/modules/approval/approval.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `approvalEngine` from `@shared/services/approval.service`; `ok` from `@core/utils/response`; `authenticate` from `@core/middleware/auth.middleware`
- Produces: `GET /api/approval-history/:entityType/:entityId` endpoint returning `ApprovalHistory[]`

- [ ] **Step 1: Create `approval.controller.ts`**

Create `backend/src/modules/approval/approval.controller.ts`:

```typescript
import type { Request, Response } from 'express';
import { approvalEngine } from '@shared/services/approval.service';
import { ok } from '@core/utils/response';

export const approvalController = {
  async getHistory(req: Request, res: Response): Promise<void> {
    const { entityType, entityId } = req.params;
    const id = Number(entityId);
    if (!entityType || !id || Number.isNaN(id)) {
      res.status(400).json({ success: false, error: 'entityType و entityId مطلوبان' });
      return;
    }
    const history = await approvalEngine.getHistory(entityType, id);
    ok(res, history);
  },
};
```

- [ ] **Step 2: Create `approval.routes.ts`**

Create `backend/src/modules/approval/approval.routes.ts`:

```typescript
import { Router } from 'express';
import { authenticate } from '@core/middleware/auth.middleware';
import { asyncHandler } from '@core/utils/asyncHandler';
import { approvalController } from './approval.controller';

const router = Router();
router.use(authenticate);

router.get('/:entityType/:entityId', asyncHandler(approvalController.getHistory));

export default router;
```

- [ ] **Step 3: Register the router in `app.ts`**

Open `backend/src/app.ts`. After the last `import` line (around line 33, after `executiveRoutes`), add:

```typescript
import approvalHistoryRoutes from './modules/approval/approval.routes';
```

Then, after the last `app.use('/api/executive', executiveRoutes)` line (around line 102), add:

```typescript
  app.use('/api/approval-history', approvalHistoryRoutes);
```

- [ ] **Step 4: TypeScript validation**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 5: Build validation**

```bash
npm run build:back
```

Expected: Build succeeds with no errors.

- [ ] **Step 6: Manual smoke test**

Start the backend (or full dev server) and verify:

```bash
# With the dev server running, call the endpoint with a valid JWT:
# GET http://127.0.0.1:48211/api/approval-history/expense/1
# Expected: { success: true, data: [] }   (empty array — no history yet)
```

- [ ] **Step 7: Run all backend tests**

```bash
cd backend && npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/approval/approval.controller.ts \
        backend/src/modules/approval/approval.routes.ts \
        backend/src/app.ts
git commit -m "feat(approval): add history endpoint GET /api/approval-history/:entityType/:entityId"
```

---

## Task 6: Frontend — `approvalHistory.ts` API helper

**Files:**
- Create: `frontend/src/api/approvalHistory.ts`

**Interfaces:**
- Consumes: `api` (Axios instance) from `frontend/src/api/client.ts`
- Produces: `approvalHistoryApi.getHistory(entityType, entityId)` and `ApprovalHistoryEntry` type — consumed by `ApprovalHistoryPanel` (Task 9)

- [ ] **Step 1: Create the API helper**

Create `frontend/src/api/approvalHistory.ts`:

```typescript
import { api } from './client';

export interface ApprovalHistoryEntry {
  id: number;
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  user: { id: number; fullName: string } | null;
  comment: string | null;
  reason: string | null;
  createdAt: string;
}

export const approvalHistoryApi = {
  getHistory: (entityType: string, entityId: number): Promise<ApprovalHistoryEntry[]> =>
    api
      .get<{ data: ApprovalHistoryEntry[] }>(`/approval-history/${entityType}/${entityId}`)
      .then((r) => r.data.data),
};
```

- [ ] **Step 2: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/api/approvalHistory.ts
git commit -m "feat(approval): add approvalHistoryApi helper"
```

---

## Task 7: Frontend — `ApprovalBadge` component

**Files:**
- Create: `frontend/src/components/approval/ApprovalBadge.tsx`

**Interfaces:**
- Produces: `<ApprovalBadge status="PENDING" />` — consumed by `ApprovalTimeline` (Task 8) and `ApprovalHistoryPanel` (Task 9); re-exported via barrel (Task 10)

- [ ] **Step 1: Create `ApprovalBadge.tsx`**

Create `frontend/src/components/approval/ApprovalBadge.tsx`:

```tsx
interface StatusConfig {
  label: string;
  color: string;
  bg: string;
}

const DEFAULT_STATUS_MAP: Record<string, StatusConfig> = {
  DRAFT:     { label: 'مسودة',         color: '#6b7280', bg: '#f3f4f6' },
  PENDING:   { label: 'معلق',          color: '#d97706', bg: '#fffbeb' },
  SUBMITTED: { label: 'مُرسل للاعتماد', color: '#2563eb', bg: '#eff6ff' },
  APPROVED:  { label: 'معتمد',         color: '#16a34a', bg: '#f0fdf4' },
  REJECTED:  { label: 'مرفوض',         color: '#dc2626', bg: '#fef2f2' },
  CANCELLED: { label: 'ملغى',          color: '#6b7280', bg: '#f3f4f6' },
  REVERSED:  { label: 'معكوس',         color: '#dc2626', bg: '#fef2f2' },
  PAID:      { label: 'مدفوع',         color: '#0891b2', bg: '#ecfeff' },
  UNPAID:    { label: 'غير مدفوع',     color: '#d97706', bg: '#fffbeb' },
  PARTIAL:   { label: 'مدفوع جزئياً',  color: '#7c3aed', bg: '#f5f3ff' },
  OVERDUE:   { label: 'متأخر',         color: '#dc2626', bg: '#fef2f2' },
};

interface Props {
  status: string;
  statusMap?: Record<string, StatusConfig>;
}

export default function ApprovalBadge({ status, statusMap }: Props) {
  const map = statusMap ?? DEFAULT_STATUS_MAP;
  const cfg = map[status] ?? { label: status, color: '#6b7280', bg: '#f3f4f6' };

  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: '12px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: cfg.color,
        background: cfg.bg,
        border: `1px solid ${cfg.color}22`,
        whiteSpace: 'nowrap',
      }}
    >
      {cfg.label}
    </span>
  );
}
```

- [ ] **Step 2: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/approval/ApprovalBadge.tsx
git commit -m "feat(approval): add ApprovalBadge status chip component"
```

---

## Task 8: Frontend — `ApprovalTimeline` component

**Files:**
- Create: `frontend/src/components/approval/ApprovalTimeline.tsx`

**Interfaces:**
- Consumes: `ApprovalHistoryEntry` from `frontend/src/api/approvalHistory.ts` (Task 6); `ApprovalBadge` from Task 7
- Produces: `<ApprovalTimeline history={[...]} />` — consumed by `ApprovalHistoryPanel` (Task 9)

- [ ] **Step 1: Create `ApprovalTimeline.tsx`**

Create `frontend/src/components/approval/ApprovalTimeline.tsx`:

```tsx
import type { ApprovalHistoryEntry } from '../../api/approvalHistory';
import ApprovalBadge from './ApprovalBadge';

const ACTION_ICONS: Record<string, string> = {
  approve: '✓',
  reject:  '✗',
  submit:  '→',
  cancel:  '○',
  reopen:  '↺',
  pay:     '＄',
};

const ACTION_LABELS: Record<string, string> = {
  approve: 'اعتماد',
  reject:  'رفض',
  submit:  'إرسال للاعتماد',
  cancel:  'إلغاء',
  reopen:  'إعادة فتح',
  pay:     'صرف',
};

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 1)  return 'الآن';
  if (mins < 60) return `قبل ${mins} دقيقة`;
  if (hours < 24) return `قبل ${hours} ساعة`;
  return `قبل ${days} يوم`;
}

interface Props {
  history: ApprovalHistoryEntry[];
}

export default function ApprovalTimeline({ history }: Props) {
  if (history.length === 0) {
    return (
      <div style={{ color: '#9ca3af', fontSize: '0.85rem', padding: '12px 0', textAlign: 'center' }}>
        لا توجد سجلات اعتماد بعد
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {history.map((entry) => (
        <div key={entry.id} style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          {/* Icon dot */}
          <div
            style={{
              width: 28, height: 28, borderRadius: '50%',
              background: entry.action === 'approve' || entry.action === 'pay' ? '#dcfce7'
                        : entry.action === 'reject'  ? '#fee2e2'
                        : '#f3f4f6',
              color: entry.action === 'approve' || entry.action === 'pay' ? '#16a34a'
                   : entry.action === 'reject'  ? '#dc2626'
                   : '#6b7280',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.75rem', fontWeight: 700, flexShrink: 0, marginTop: 2,
            }}
          >
            {ACTION_ICONS[entry.action] ?? '•'}
          </div>

          {/* Content */}
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                {entry.user?.fullName ?? 'النظام'}
              </span>
              <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
              <ApprovalBadge status={entry.fromStatus} />
              <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>←</span>
              <ApprovalBadge status={entry.toStatus} />
              <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginRight: 'auto' }}>
                {formatRelativeTime(entry.createdAt)}
              </span>
            </div>

            {entry.comment && (
              <div style={{ marginTop: 4, fontSize: '0.8rem', color: '#4b5563', paddingRight: 4 }}>
                "{entry.comment}"
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/approval/ApprovalTimeline.tsx
git commit -m "feat(approval): add ApprovalTimeline history list component"
```

---

## Task 9: Frontend — `ApprovalActions` component

**Files:**
- Create: `frontend/src/components/approval/ApprovalActions.tsx`

**Interfaces:**
- Produces: `<ApprovalActions availableTransitions={[...]} onAction={fn} />` — consumed by `ApprovalHistoryPanel` (Task 10) when `showActions=true`

- [ ] **Step 1: Create `ApprovalActions.tsx`**

Create `frontend/src/components/approval/ApprovalActions.tsx`:

```tsx
import { useState } from 'react';

export interface ApprovalTransitionDef {
  action: string;
  label: string;
  variant?: 'primary' | 'danger' | 'secondary';
  requireComment?: boolean;
}

interface Props {
  availableTransitions: ApprovalTransitionDef[];
  onAction: (action: string, comment?: string) => Promise<void>;
  busy?: boolean;
}

export default function ApprovalActions({ availableTransitions, onAction, busy = false }: Props) {
  const [pendingAction, setPendingAction] = useState<ApprovalTransitionDef | null>(null);
  const [comment, setComment] = useState('');
  const [localBusy, setLocalBusy] = useState(false);

  if (availableTransitions.length === 0) return null;

  async function execute(action: string, commentText?: string) {
    setLocalBusy(true);
    try {
      await onAction(action, commentText);
      setPendingAction(null);
      setComment('');
    } finally {
      setLocalBusy(false);
    }
  }

  const isBusy = busy || localBusy;

  if (pendingAction) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {pendingAction.requireComment && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="أضف ملاحظة (مطلوبة) …"
            rows={2}
            disabled={isBusy}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical' }}
          />
        )}
        {!pendingAction.requireComment && (
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="أضف ملاحظة اختيارية …"
            rows={2}
            disabled={isBusy}
            style={{ width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: '0.85rem', resize: 'vertical' }}
          />
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            disabled={isBusy || (pendingAction.requireComment && !comment.trim())}
            onClick={() => execute(pendingAction.action, comment.trim() || undefined)}
            style={{
              padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: pendingAction.variant === 'danger' ? '#dc2626' : '#2563eb',
              color: '#fff', fontWeight: 600, fontSize: '0.85rem',
              opacity: isBusy ? 0.7 : 1,
            }}
          >
            {isBusy ? '…' : `تأكيد: ${pendingAction.label}`}
          </button>
          <button
            type="button"
            disabled={isBusy}
            onClick={() => { setPendingAction(null); setComment(''); }}
            style={{ padding: '6px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: '0.85rem' }}
          >
            إلغاء
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
      {availableTransitions.map((t) => (
        <button
          key={t.action}
          type="button"
          disabled={isBusy}
          onClick={() => setPendingAction(t)}
          style={{
            padding: '6px 16px', borderRadius: 6, border: 'none', cursor: 'pointer',
            background: t.variant === 'danger'    ? '#fef2f2'
                      : t.variant === 'primary'   ? '#eff6ff'
                      : '#f3f4f6',
            color: t.variant === 'danger'   ? '#dc2626'
                 : t.variant === 'primary'  ? '#2563eb'
                 : '#374151',
            fontWeight: 600, fontSize: '0.85rem',
            border: t.variant === 'danger'  ? '1px solid #fca5a5'
                  : t.variant === 'primary' ? '1px solid #93c5fd'
                  : '1px solid #e5e7eb',
            opacity: isBusy ? 0.7 : 1,
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/approval/ApprovalActions.tsx
git commit -m "feat(approval): add ApprovalActions button group component"
```

---

## Task 10: Frontend — `ApprovalHistoryPanel` + barrel export `index.ts`

**Files:**
- Create: `frontend/src/components/approval/ApprovalHistoryPanel.tsx`
- Create: `frontend/src/components/approval/index.ts`

**Interfaces:**
- Consumes: `approvalHistoryApi` from Task 6; `ApprovalTimeline` from Task 8; `ApprovalActions` and `ApprovalTransitionDef` from Task 9
- Produces: `<ApprovalHistoryPanel entityType="expense" entityId={3} />` — not imported by any page in Phase A

- [ ] **Step 1: Create `ApprovalHistoryPanel.tsx`**

Create `frontend/src/components/approval/ApprovalHistoryPanel.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { approvalHistoryApi, type ApprovalHistoryEntry } from '../../api/approvalHistory';
import ApprovalTimeline from './ApprovalTimeline';
import ApprovalActions, { type ApprovalTransitionDef } from './ApprovalActions';

interface Props {
  entityType: string;
  entityId: number;
  /** When true, renders ApprovalActions below the timeline. Default: false. */
  showActions?: boolean;
  availableTransitions?: ApprovalTransitionDef[];
  onAction?: (action: string, comment?: string) => Promise<void>;
  actionBusy?: boolean;
  /** Optional title override. Default: "سجل الاعتماد". */
  title?: string;
}

export default function ApprovalHistoryPanel({
  entityType,
  entityId,
  showActions = false,
  availableTransitions = [],
  onAction,
  actionBusy,
  title = 'سجل الاعتماد',
}: Props) {
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    approvalHistoryApi
      .getHistory(entityType, entityId)
      .then((data) => { if (!cancelled) setHistory(data); })
      .catch(() => { if (!cancelled) setError('تعذّر تحميل سجل الاعتماد'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  return (
    <div style={{ padding: '16px 0' }}>
      {title && (
        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#374151', marginBottom: 12 }}>
          {title}
        </div>
      )}

      {loading && (
        <div style={{ color: '#9ca3af', fontSize: '0.85rem', textAlign: 'center', padding: '12px 0' }}>
          جارٍ التحميل…
        </div>
      )}

      {!loading && error && (
        <div style={{ color: '#dc2626', fontSize: '0.85rem' }}>{error}</div>
      )}

      {!loading && !error && <ApprovalTimeline history={history} />}

      {showActions && onAction && (
        <ApprovalActions
          availableTransitions={availableTransitions}
          onAction={async (action, comment) => {
            await onAction(action, comment);
            // Refresh history after action
            setLoading(true);
            approvalHistoryApi
              .getHistory(entityType, entityId)
              .then(setHistory)
              .finally(() => setLoading(false));
          }}
          busy={actionBusy}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create `index.ts` barrel export**

Create `frontend/src/components/approval/index.ts`:

```typescript
export { default as ApprovalBadge } from './ApprovalBadge';
export { default as ApprovalTimeline } from './ApprovalTimeline';
export { default as ApprovalActions } from './ApprovalActions';
export type { ApprovalTransitionDef } from './ApprovalActions';
export { default as ApprovalHistoryPanel } from './ApprovalHistoryPanel';
export type { ApprovalHistoryEntry } from '../../api/approvalHistory';
```

- [ ] **Step 3: TypeScript validation**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 4: Build validation**

```bash
npm run build:front
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/approval/ApprovalHistoryPanel.tsx \
        frontend/src/components/approval/index.ts
git commit -m "feat(approval): add ApprovalHistoryPanel composite component and barrel export"
```

---

## Task 11: Full Validation Pass

**Files:** None modified — validation only.

**Goal:** Confirm the entire Phase A implementation is clean across all TypeScript targets and all build outputs, with all existing tests passing.

- [ ] **Step 1: Prisma validation**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at .../schema.prisma is valid 🚀`

- [ ] **Step 2: Backend TypeScript**

```bash
cd backend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 3: Frontend TypeScript**

```bash
cd frontend && npx tsc --noEmit
```

Expected: Zero errors.

- [ ] **Step 4: Electron TypeScript**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: Zero errors.

- [ ] **Step 5: Backend tests**

```bash
cd backend && npm test
```

Expected: All tests pass. The `approval.service.test.ts` suite should show all assertions green.

- [ ] **Step 6: Backend build**

```bash
npm run build:back
```

Expected: Compiles to `backend/dist/` with no errors.

- [ ] **Step 7: Frontend build**

```bash
npm run build:front
```

Expected: Vite builds `frontend/dist/` with no errors or unexpected warnings.

- [ ] **Step 8: Electron build**

```bash
npm run electron:build
```

Expected: Compiles to `electron-dist/` with no errors.

- [ ] **Step 9: Verify existing module behavior unchanged**

Start the dev server and verify:

1. `GET /api/expenses` — returns expense list as before
2. `PATCH /api/expenses/:id/approve` — still approves and posts to GL as before
3. `PATCH /api/expenses/:id/reject` — still rejects as before
4. `GET /api/payroll` — returns payroll records as before
5. `PATCH /api/payroll/:id/approve` — still approves payroll as before

No module has registered with the engine. Existing approval endpoints call their own service methods directly and are entirely unaffected.

- [ ] **Step 10: Verify the new endpoint works**

```bash
# With dev server running and a valid JWT token (from browser localStorage or login endpoint):
# GET http://127.0.0.1:48211/api/approval-history/expense/1
# Expected: { success: true, data: [] }

# GET http://127.0.0.1:48211/api/approval-history/payroll/1
# Expected: { success: true, data: [] }

# Without a valid JWT:
# GET http://127.0.0.1:48211/api/approval-history/expense/1
# Expected: 401 Unauthorized
```

- [ ] **Step 11: Final commit**

```bash
git add .
git commit -m "chore(approval): Phase A full validation complete — all builds and tests passing"
```

---

## Summary: Task Order and Dependencies

```
Task 1  (Schema migration)         → no dependencies
Task 2  (constants.ts ACTIONS)     → no dependencies, parallel with Task 1
Task 3  (approval.types.ts)        → no dependencies, parallel with Task 1+2
Task 4  (approval.service.ts)      → requires Task 1 (Prisma types), Task 3 (interfaces)
Task 5  (routes + controller)      → requires Task 4 (approvalEngine)
Task 6  (frontend API helper)      → no backend dependency (just an Axios call)
Task 7  (ApprovalBadge)            → no dependencies
Task 8  (ApprovalTimeline)         → requires Task 6 (types), Task 7 (ApprovalBadge)
Task 9  (ApprovalActions)          → no dependencies
Task 10 (ApprovalHistoryPanel + barrel) → requires Tasks 6, 8, 9
Task 11 (Full validation)          → requires all prior tasks
```

Safe parallel starts: Tasks 1+2+3 can be done in any order. Tasks 6+7+9 can be done in any order after Task 3. Task 4 must follow Tasks 1 and 3.
