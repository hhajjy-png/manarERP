# Approval Workflow Pack v1 — Phase A: Universal Approval Engine Foundation

**Date:** 2026-06-24
**Branch target:** `feature/approval-workflow-pack-v1-phase-a`
**Baseline:** `stable-invoice-expenses-operations-pack-v1` (HEAD 439eafd)
**Status:** Awaiting user approval before implementation

---

## Executive Summary

Phase A builds the shared **approval infrastructure** that all future module-level approval workflows will plug into. It introduces no behavioral change to existing modules. Expenses, Payroll, and Invoices continue to work exactly as they do today.

Deliverables:
1. `ApprovalHistory` Prisma model + migration
2. `approval.types.ts` — shared TypeScript interfaces
3. `approval.service.ts` — singleton registry + `transition()` engine
4. Four reusable frontend components (`ApprovalBadge`, `ApprovalActions`, `ApprovalTimeline`, `ApprovalHistoryPanel`)
5. Shared history API endpoint (`GET /api/approval-history/:entityType/:entityId`)
6. Notification extension interface (no-op in Phase A)

---

## Confirmed Architectural Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | State machine scope | Flexible per-module — no forced canonical states in Phase A |
| 2 | History storage | Dedicated polymorphic `ApprovalHistory` table; `AuditLog` retained for compliance |
| 3 | Service pattern | Registry + composition singleton; no abstract base classes |
| 4 | Side-effect hooks | Run inside the same Prisma transaction as status update |

---

## Approaches Considered

### Approach A — Registry/Composition Singleton ✅ **Selected**

A singleton `approvalEngine` holds a map of `entityType → ApprovalModuleConfig`. Modules call `approvalEngine.register(config)` once at app startup. At runtime any module calls `approvalEngine.transition(input, tx?)`. The engine handles all shared concerns — validation, history, audit, hooks — without the module caring about the implementation.

**Pros:** Composition over inheritance; engine is independently testable; adding a new module requires zero changes to the engine; matches existing codebase patterns.
**Cons:** Module must write a config object; slightly more upfront ceremony per integration.

### Approach B — Abstract Base Class (Not chosen)

Module services extend `ApprovableService<T>`. Base class provides `protected transition()`.

**Rejected because:** Violates the "prefer composition over inheritance" rule from CLAUDE.md; forces all module services to restructure; harder to test the shared logic in isolation.

### Approach C — Express Middleware Pipeline (Not chosen)

Each transition is composed as a middleware chain.

**Rejected because:** More complex mental model; doesn't integrate cleanly with Prisma transactions; overkill for Phase A scope.

---

## Data Model

### `ApprovalHistory` Prisma Model

Add to `backend/prisma/schema.prisma` after the `AuditLog` model:

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
  comment      String?  // free-text note from approver/rejector
  reason       String?  // structured reason code or label
  metadataJson String?  // JSON blob: snapshot data, delegation info, future fields

  user User? @relation(fields: [userId], references: [id])

  createdAt DateTime @default(now())

  @@index([entityType, entityId])
  @@index([userId])
  @@index([createdAt])
  @@map("approval_history")
}
```

Add to the `User` model (after the `backups` relation line):

```prisma
  approvalHistories ApprovalHistory[]
```

### Migration

After schema edit, run:

```bash
cd backend && npx prisma migrate dev --name add_approval_history
```

Review the generated SQL in `backend/prisma/migrations/` before applying. Expected SQL:

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
  "createdAt"    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "approval_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "approval_history_entityType_entityId_idx" ON "approval_history"("entityType", "entityId");
CREATE INDEX "approval_history_userId_idx"               ON "approval_history"("userId");
CREATE INDEX "approval_history_createdAt_idx"            ON "approval_history"("createdAt");
```

Run `npm run db:generate` after migration to regenerate the Prisma client.

---

## Backend Architecture

### File Locations

```
backend/src/shared/services/
  approval.types.ts       ← interfaces only, no imports from Prisma
  approval.service.ts     ← singleton engine
backend/src/modules/approval/
  approval.routes.ts      ← GET /api/approval-history/:entityType/:entityId
  approval.controller.ts  ← imports approvalEngine directly from shared/services
```

> The route module is named `approval` to follow the existing module pattern. No `approval.service.ts` wrapper is needed in the module folder — `approval.controller.ts` imports `approvalEngine` directly from `../../shared/services/approval.service`. No Zod schema file is needed for Phase A (the only endpoint is a parameterized GET with no request body).

---

### `approval.types.ts`

```typescript
import type { Prisma } from '@prisma/client';

// ── Module Config ────────────────────────────────────────────────────────

/** Describes a single valid transition within a module's state machine. */
export interface ApprovalTransition {
  /** Logical action name, e.g. 'approve', 'reject', 'submit', 'cancel', 'reopen', 'pay'. */
  action: string;
  /** Status value(s) the entity must be in for this transition to be valid. */
  from: string | string[];
  /** Status value the entity transitions to on success. */
  to: string;
  /** If true, the caller MUST supply a non-empty `comment`. Defaults to false. */
  requireComment?: boolean;
}

/** Metadata passed to updateStatus and sideEffect hooks. */
export interface ApprovalMeta {
  action: string;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  comment?: string;
  reason?: string;
}

/** Side-effect function that runs inside the same Prisma transaction. */
export type ApprovalSideEffect<TEntity = unknown> = (
  entity: TEntity,
  meta: ApprovalMeta,
  tx: Prisma.TransactionClient
) => Promise<void>;

/**
 * Configuration object a module registers with the approval engine.
 *
 * TEntity is the shape of the entity returned by Prisma (e.g. the full Expense row).
 */
export interface ApprovalModuleConfig<TEntity = Record<string, unknown>> {
  /** Unique string key that identifies this entity type, e.g. 'expense', 'payroll'. */
  entityType: string;

  /** Name of the status field on the entity, e.g. 'status'. */
  statusField: keyof TEntity & string;

  /** All status values considered valid for this module. Used for validation assertions. */
  allowedStatuses: readonly string[];

  /** All valid state transitions for this module. */
  transitions: readonly ApprovalTransition[];

  /**
   * Maps action name → permission key (e.g. { approve: 'expenses.approve' }).
   * The engine checks this against the requesting user's effective permissions.
   * SYSTEM_ADMIN bypasses all checks.
   */
  permissions: Record<string, string>;

  /**
   * Fetch the entity by id. Runs inside the transaction.
   * Must throw AppError.notFound() if the entity does not exist.
   */
  getEntity: (id: number, tx: Prisma.TransactionClient) => Promise<TEntity>;

  /**
   * Persist the new status to the entity. Runs inside the transaction.
   * May also update approvedById, approvedAt, etc. as needed for the module.
   * Returns the updated entity.
   */
  updateStatus: (
    id: number,
    toStatus: string,
    meta: ApprovalMeta,
    tx: Prisma.TransactionClient
  ) => Promise<TEntity>;

  /**
   * Optional side-effect hooks, keyed by action name.
   * Each hook runs inside the transaction, after status update and history write.
   * Throwing inside a hook rolls back the entire transition.
   */
  sideEffects?: Partial<Record<string, ApprovalSideEffect<TEntity>>>;

  /** Module name written to AuditLog (e.g. 'expenses'). */
  auditModule: string;

  /**
   * Human-readable Arabic labels for actions, written to AuditLog.
   * Defaults: { approve: 'اعتماد', reject: 'رفض', submit: 'إرسال للاعتماد',
   *              cancel: 'إلغاء', reopen: 'إعادة فتح', pay: 'صرف' }
   */
  auditLabels?: Partial<Record<string, string>>;
}

// ── Engine Input / Output ────────────────────────────────────────────────

export interface TransitionInput {
  entityType: string;
  entityId: number;
  action: string;
  /** ID of the user requesting the transition. Required for permission checks. */
  userId: number;
  comment?: string;
  reason?: string;
  /**
   * Optional snapshot data or future fields (delegation, digital signature, etc.)
   * Stored as JSON in ApprovalHistory.metadataJson.
   */
  metadata?: Record<string, unknown>;
}

export interface TransitionResult<TEntity = unknown> {
  /** Updated entity after status change. */
  entity: TEntity;
  /** The ApprovalHistory record just created. */
  historyEntry: {
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
  };
}

// ── Notification Extension ───────────────────────────────────────────────

/** Emitted after a successful transition (outside the transaction). */
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

---

### `approval.service.ts`

```typescript
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { ROLES } from '../../config/constants';
import type { Prisma } from '@prisma/client';
import type {
  ApprovalModuleConfig,
  TransitionInput,
  TransitionResult,
  ApprovalTransitionEvent,
  ApprovalTransitionListener,
} from './approval.types';

const DEFAULT_AUDIT_LABELS: Record<string, string> = {
  approve:  'اعتماد',
  reject:   'رفض',
  submit:   'إرسال للاعتماد',
  cancel:   'إلغاء',
  reopen:   'إعادة فتح',
  pay:      'صرف',
};

class ApprovalEngine {
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

  /**
   * Execute an approval transition for a registered entity type.
   *
   * If `tx` is provided, all DB work runs inside the caller's transaction.
   * If `tx` is omitted, the engine opens its own $transaction.
   *
   * Execution order (all inside the transaction):
   *   1. Load module config
   *   2. Fetch entity via config.getEntity()
   *   3. Resolve current status from config.statusField
   *   4. Validate requested transition exists and 'from' matches current status
   *   5. Validate comment requirement
   *   6. Validate requesting user's permissions (SYSTEM_ADMIN bypasses)
   *   7. Call config.updateStatus()
   *   8. Write ApprovalHistory record
   *   9. Write AuditLog record
   *  10. Call config.sideEffects[action]() if defined
   *
   * After the transaction commits, emit notification event (best-effort).
   */
  async transition<TEntity = unknown>(
    input: TransitionInput,
    tx?: Prisma.TransactionClient
  ): Promise<TransitionResult<TEntity>> {
    const config = this.configs.get(input.entityType) as ApprovalModuleConfig<TEntity> | undefined;
    if (!config) {
      throw AppError.badRequest(`Approval engine: no config registered for entityType '${input.entityType}'.`);
    }

    const run = async (client: Prisma.TransactionClient): Promise<TransitionResult<TEntity>> => {
      // Step 2: Fetch entity
      const entity = await config.getEntity(input.entityId, client);

      // Step 3: Resolve current status
      const currentStatus = String((entity as Record<string, unknown>)[config.statusField]);

      // Step 4: Find matching transition
      const transition = config.transitions.find(
        (t) =>
          t.action === input.action &&
          (Array.isArray(t.from) ? t.from.includes(currentStatus) : t.from === currentStatus)
      );
      if (!transition) {
        throw AppError.badRequest(
          `لا يمكن تنفيذ الإجراء '${input.action}' على الحالة الحالية '${currentStatus}'.`
        );
      }

      // Step 5: Comment requirement
      if (transition.requireComment && !input.comment?.trim()) {
        throw AppError.badRequest(`يجب توفير ملاحظة عند تنفيذ إجراء '${input.action}'.`);
      }

      // Step 6: Permission check
      const permissionKey = config.permissions[input.action];
      if (permissionKey) {
        await this.assertPermission(input.userId, permissionKey, client);
      }

      const meta = {
        action: input.action,
        fromStatus: currentStatus,
        toStatus: transition.to,
        userId: input.userId,
        comment: input.comment,
        reason: input.reason,
      };

      // Step 7: Update entity status
      const updatedEntity = await config.updateStatus(input.entityId, transition.to, meta, client);

      // Step 8: Write ApprovalHistory
      const historyEntry = await client.approvalHistory.create({
        data: {
          entityType: input.entityType,
          entityId:   input.entityId,
          action:     input.action,
          fromStatus: currentStatus,
          toStatus:   transition.to,
          userId:     input.userId ?? null,
          comment:    input.comment ?? null,
          reason:     input.reason ?? null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        },
        select: {
          id: true, entityType: true, entityId: true, action: true,
          fromStatus: true, toStatus: true, userId: true,
          comment: true, reason: true, createdAt: true,
        },
      });

      // Step 9: Write AuditLog (fire-and-forget — never blocks the transaction)
      // Note: the engine calls auditLog.create() directly (not via recordAudit()) because
      // it has no access to Express `req`. ipAddress is not captured for engine-driven events;
      // module routes that call transition() via their own service continue to log ipAddress
      // via their own recordAudit() calls when appropriate.
      try {
        await client.auditLog.create({
          data: {
            userId:   input.userId ?? null,
            action:   input.action.toUpperCase(),
            module:   config.auditModule,
            entityId: String(input.entityId),
            oldValue: JSON.stringify({ status: currentStatus }),
            newValue: JSON.stringify({ status: transition.to, comment: input.comment }),
          },
        });
      } catch {
        // Audit write failure must NOT roll back the transition.
        // In SQLite this is unlikely, but we protect the caller.
      }

      // Step 10: Side-effect hook
      const hook = config.sideEffects?.[input.action];
      if (hook) {
        await hook(updatedEntity, meta, client);
      }

      return { entity: updatedEntity, historyEntry };
    };

    // Run inside caller's transaction or create a new one
    const result = tx ? await run(tx) : await (prisma.$transaction(run) as Promise<TransitionResult<TEntity>>);

    // Emit notification event outside the transaction (best-effort)
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

  // ── Internal Helpers ─────────────────────────────────────────────────

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
    if (user.role.name === ROLES.SYSTEM_ADMIN) return; // SYSTEM_ADMIN bypasses all checks

    const keys = user.role.rolePermissions.map((rp) => rp.permission.key);
    if (!keys.includes(permissionKey)) {
      throw AppError.forbidden(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionKey}).`);
    }
  }
}

/** Singleton export — import this everywhere instead of instantiating. */
export const approvalEngine = new ApprovalEngine();
```

---

### Per-Module Config Shape (Reference)

When a module integrates with the engine (Phase B+), it registers a config like:

```typescript
// Example: expenses module config (NOT implemented in Phase A)
approvalEngine.register<Expense>({
  entityType:      'expense',
  statusField:     'status',
  allowedStatuses: ENUMS.expenseStatus,
  transitions: [
    { action: 'approve', from: 'PENDING', to: 'APPROVED' },
    { action: 'reject',  from: 'PENDING', to: 'REJECTED' },
    { action: 'cancel',  from: 'PENDING', to: 'CANCELLED' },
    { action: 'reopen',  from: 'REJECTED', to: 'PENDING' },
    { action: 'reverse', from: 'APPROVED', to: 'REVERSED', requireComment: true },
  ],
  permissions: {
    approve: 'expenses.approve',
    reject:  'expenses.approve',
    cancel:  'expenses.update',
    reopen:  'expenses.approve',
    reverse: 'expenses.approve',
  },
  getEntity: async (id, tx) => {
    const e = await tx.expense.findUnique({ where: { id } });
    if (!e) throw AppError.notFound('المصروف غير موجود');
    return e;
  },
  updateStatus: async (id, toStatus, meta, tx) =>
    tx.expense.update({
      where: { id },
      data: {
        status:       toStatus,
        approvedById: meta.action === 'approve' ? meta.userId : undefined,
        approvedAt:   meta.action === 'approve' ? new Date() : undefined,
      },
    }),
  sideEffects: {
    approve: async (expense, _meta, tx) => {
      // GL posting lives here in Phase B
      await postExpenseToGL(tx, expense.id);
    },
    reverse: async (expense, _meta, tx) => {
      await reverseExpenseFromGL(tx, expense.id);
    },
  },
  auditModule: 'expenses',
});
```

This example is illustrative only. **No modules register in Phase A.** The configs live in each module folder and will be written in Phase B/C.

---

### Shared History API Endpoint

**Route:** `backend/src/modules/approval/approval.routes.ts`

```
GET /api/approval-history/:entityType/:entityId
→ authenticate only (no requirePermission)
→ returns: ApprovalHistory[] ordered by createdAt ASC, with user.fullName
```

**Permission model for Phase A:** The history endpoint is protected by `authenticate` only. This is intentional and safe for Phase A because:

1. This is a local desktop app with no external network access (port 48211 is localhost-only).
2. The `ApprovalHistoryPanel` component is only ever embedded inside pages that are already behind their own module's `requirePermission('{module}.read')` check on the frontend.
3. Direct API access requires a valid JWT token.

In a future phase, a `requirePermission('approval-history.read')` middleware — or a dynamic `{entityType}.read` check — can be added to the route without breaking the engine.

```typescript
// approval.controller.ts (sketch)
async function getHistory(req, res) {
  const { entityType, entityId } = req.params;
  const history = await approvalEngine.getHistory(entityType, Number(entityId));
  return successResponse(res, history);
}
```

---

### Notification Extension Points

Phase A installs the event interface only. No email, no push, no WebSocket.

```typescript
// Example listener registration (future notification center):
approvalEngine.onTransition((event) => {
  notificationCenter.emit({
    type: 'APPROVAL_TRANSITION',
    entityType: event.entityType,
    entityId:   event.entityId,
    action:     event.action,
    toStatus:   event.toStatus,
    actor:      event.userId,
    timestamp:  event.timestamp,
  });
});
```

In Phase A, **no listener is registered**. The engine emits events to an empty array — zero overhead, zero side effects.

For dashboard pending-count badges, the query pattern is:

```typescript
// Future: count pending approvals per module
prisma.expense.count({ where: { status: 'PENDING' } })
// This remains module-specific in Phase A. A unified pending-count endpoint is a Phase B concern.
```

---

## Frontend Architecture

### Component Locations

```
frontend/src/components/approval/
  index.ts              ← barrel export
  ApprovalBadge.tsx
  ApprovalActions.tsx
  ApprovalTimeline.tsx
  ApprovalHistoryPanel.tsx
frontend/src/api/approvalHistory.ts  ← Axios helper
```

---

### `ApprovalBadge`

Renders a colored status chip. Accepts a `status` string and optional `statusMap` override.

```
Props:
  status: string
  statusMap?: Record<string, { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'gray' }>

Default status map covers the union of all known module statuses:
  DRAFT → gray / مسودة
  PENDING → amber / معلق
  APPROVED → green / معتمد
  REJECTED → red / مرفوض
  CANCELLED → gray / ملغى
  REVERSED → red / معكوس
  PAID → blue / مدفوع
```

Renders as a `<span className="badge {color}">`. Reuses the existing badge CSS already present in the project.

---

### `ApprovalActions`

Renders action buttons (approve / reject / cancel / reopen / etc.) for the current entity.

```
Props:
  entityType: string
  entityId: number
  currentStatus: string
  availableTransitions: ApprovalTransitionDef[]   ← derived by caller from module config
  onAction: (action: string, comment?: string) => Promise<void>
  busy?: boolean

Behavior:
  - Renders one button per available transition for the current status.
  - Transitions with requireComment open an inline comment prompt before confirming.
  - Disabled while busy=true.
  - Does NOT call the API itself — delegates to onAction prop.
```

This component has no knowledge of which module it's used in — it only renders buttons.

---

### `ApprovalTimeline`

Renders an ordered list of `ApprovalHistory` entries.

```
Props:
  history: ApprovalHistoryEntry[]   ← result of GET /api/approval-history/:entityType/:entityId

ApprovalHistoryEntry shape:
  id, entityType, entityId, action, fromStatus, toStatus,
  user: { id, fullName } | null,
  comment, reason, createdAt

Renders per entry:
  - Icon/dot keyed to action (approve = ✓ green, reject = ✗ red, etc.)
  - "User performed action on date"
  - fromStatus → toStatus arrow
  - comment (if present, indented below)
  - Relative timestamp (e.g. "قبل 3 ساعات")
```

---

### `ApprovalHistoryPanel`

Composite panel combining `ApprovalTimeline` + optional `ApprovalActions`.

```
Props:
  entityType: string
  entityId: number
  currentStatus: string
  availableTransitions?: ApprovalTransitionDef[]
  onAction?: (action: string, comment?: string) => Promise<void>
  showActions?: boolean   ← default false in Phase A

Behavior:
  - Calls GET /api/approval-history/:entityType/:entityId on mount.
  - Renders ApprovalTimeline with loaded history.
  - If showActions=true AND availableTransitions provided, renders ApprovalActions below.
  - Renders a loading skeleton while fetching.
  - Renders an empty state ("لا توجد سجلات اعتماد بعد") when history is empty.
```

In Phase A, `showActions` defaults to false and no module page uses this component yet. Components are built but not wired.

---

### `frontend/src/api/approvalHistory.ts`

```typescript
import api from './client';

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
  getHistory: (entityType: string, entityId: number) =>
    api.get<{ data: ApprovalHistoryEntry[] }>(
      `/approval-history/${entityType}/${entityId}`
    ).then((r) => r.data.data),
};
```

---

## RBAC Pattern

### New Permission Keys (to add to `constants.ts` in Phase B+)

Phase A does not add permission keys, because no module integrates yet. The pattern for future phases:

```typescript
// Pattern: {module}.{action}
// submit, reopen — new action types, added to ACTIONS array in the integration phase
'expenses.submit'
'expenses.reopen'
'payroll.submit'
// etc.
```

Phase A adds `'submit'` and `'reopen'` to the `ACTIONS` array in `constants.ts` as preparation.

### Permission Check Flow

```
HTTP Request
  → authenticate middleware      (loads req.user + role + permissions)
  → requirePermission('x.y')     (primary gate — throws 403 if missing)
  → Controller → Service
      → approvalEngine.transition()
          → assertPermission()   (defense-in-depth: re-validates from DB inside tx)
          → SYSTEM_ADMIN bypasses assertPermission()
```

---

## Transaction & Hook Execution Order

```
approvalEngine.transition(input, tx?)
│
├─ [tx?] caller's transaction OR prisma.$transaction()
│   │
│   ├─ 1. config.getEntity(id, tx)            ← throws notFound if missing
│   ├─ 2. resolve currentStatus from entity
│   ├─ 3. find matching ApprovalTransition     ← throws if no match
│   ├─ 4. check requireComment                 ← throws if missing
│   ├─ 5. assertPermission(userId, key, tx)    ← throws if denied
│   ├─ 6. config.updateStatus(id, to, meta, tx) ← writes new status to DB
│   ├─ 7. approvalHistory.create(...)          ← writes history record
│   ├─ 8. auditLog.create(...) [try/catch]     ← never throws; failure is logged
│   └─ 9. config.sideEffects[action]?()        ← GL posting, stock updates, etc.
│
└─ [outside tx] emit ApprovalTransitionEvent to listeners (best-effort, never throws)
```

**Rollback trigger:** Any throw in steps 1–9 causes the entire transaction to roll back. The entity status, ApprovalHistory, AuditLog, and side effects are all-or-nothing.

**AuditLog exception:** Step 8 is wrapped in `try/catch` so a transient audit failure never kills a real business transition. In SQLite this is exceptionally rare.

---

## `constants.ts` Changes (Phase A)

Add `'submit'` and `'reopen'` to the `ACTIONS` array:

```typescript
export const ACTIONS = [
  'read', 'create', 'update', 'delete',
  'approve', 'export', 'pay', 'generate',
  'payslip', 'adjust', 'cancel', 'print',
  'submit',  // new — for Draft→Pending transitions
  'reopen',  // new — for Rejected→Pending transitions
] as const;
```

No new permission keys are seeded yet. That happens per-module in Phase B+.

---

## Future Compatibility

The design explicitly prepares these extension points without implementing them:

| Future Feature | Extension Point |
|---|---|
| Digital Signature | `metadataJson` field on `ApprovalHistory` stores signature data |
| QR Verification | `metadataJson` encodes entity reference + transition hash |
| Signed PDF | `sideEffects.approve` hook generates and stores the PDF |
| Delegation | `metadataJson: { delegatedByUserId }` + optional `delegatedByUserId` column (Phase D+) |
| Multi-Level Approval | Multiple `ApprovalHistory` records per entity; `action: 'approve_level_1'`, `'approve_level_2'` |
| Approval Matrix | `ApprovalModuleConfig.transitions` can carry `requiredRole` or `minAmount` conditions |
| Notification Center | `approvalEngine.onTransition()` listener already exists; center plugs in at app init |
| Pending Badges | `ApprovalHistory` + entity status queries; dashboard counts remain module-specific until Phase E |
| Contracts approval | `approvalEngine.register({ entityType: 'contract', ... })` |
| Purchase Orders | `approvalEngine.register({ entityType: 'purchaseOrder', ... })` |

---

## Files Changed

### New Files
| File | Purpose |
|------|---------|
| `backend/src/shared/services/approval.types.ts` | All TypeScript interfaces for the engine |
| `backend/src/shared/services/approval.service.ts` | Singleton `approvalEngine` implementation |
| `backend/src/modules/approval/approval.routes.ts` | `GET /api/approval-history/:entityType/:entityId` |
| `backend/src/modules/approval/approval.controller.ts` | Thin handler; imports `approvalEngine` from shared/services directly |
| `frontend/src/components/approval/index.ts` | Barrel export |
| `frontend/src/components/approval/ApprovalBadge.tsx` | Status chip component |
| `frontend/src/components/approval/ApprovalActions.tsx` | Action buttons component |
| `frontend/src/components/approval/ApprovalTimeline.tsx` | Timeline list component |
| `frontend/src/components/approval/ApprovalHistoryPanel.tsx` | Composite panel |
| `frontend/src/api/approvalHistory.ts` | Axios helper for history endpoint |

### Modified Files
| File | Change |
|------|--------|
| `backend/prisma/schema.prisma` | Add `ApprovalHistory` model; add `approvalHistories` relation to `User` |
| `backend/src/config/constants.ts` | Add `'submit'`, `'reopen'` to `ACTIONS` array |
| `backend/src/app.ts` | Register `approval` router at `/api/approval-history` |
| New Prisma migration file | Auto-generated by `prisma migrate dev` |

### Not Modified
- All existing module services, controllers, routes
- `expenses.service.ts`, `payroll.service.ts`, `invoices.service.ts`
- `schema.prisma` models other than `User` (relation addition only)
- `PROJECT_STATE.md`

---

## Validation Plan

```bash
# 1. Prisma validation
cd backend && npx prisma validate

# 2. Migration and client regeneration
cd backend && npx prisma migrate dev --name add_approval_history
cd backend && npm run db:generate

# 3. TypeScript validation
cd backend && npx tsc --noEmit
cd frontend && npx tsc --noEmit
tsc -p electron/tsconfig.json --noEmit

# 4. Build validation
npm run build:back
npm run build:front
npm run electron:build

# 5. Unit tests
cd backend && npm test

# 6. Manual smoke test
#    - Start dev server
#    - Verify GET /api/approval-history/expense/1 returns [] (empty, no error)
#    - Verify ApprovalBadge renders for each known status
#    - Verify ApprovalHistoryPanel renders empty state
#    - Verify existing Expenses approve/reject workflow unchanged
#    - Verify existing Payroll approve workflow unchanged
```

---

## Rollback Risks

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Migration runs on production SQLite and adds `approval_history` table | Low | Additive-only migration; no existing tables modified; SQLite handles ADD TABLE safely |
| `User` model gains new relation field — affects Prisma-generated types | Low | Additive only; existing queries that select specific fields are unaffected |
| `ACTIONS` array gains two new values — could affect Zod validation if ACTIONS is used as a Zod enum elsewhere | Medium | Grep for `z.enum(ACTIONS)` before implementation; add values rather than replace |
| Route collision if `/api/approval-history` path conflicts with existing routes | Low | Confirm `app.ts` route order; this is a new path |
| AuditLog writes inside `$transaction` in Phase A are new; existing audit calls use `prisma` directly | None | Existing audit writes remain unchanged; only new `approvalEngine` calls use the tx-aware path |
| Frontend components not yet wired — unused code | None | Dead code only; no runtime impact; components are exported but not imported anywhere yet |

---

## Open Questions (Resolved Before Implementation)

All design questions were resolved during brainstorming. No open questions remain.

The following are **deferred to later phases** by design, not by ambiguity:

- Which specific modules integrate first (Phase B spec will decide)
- Whether Expenses gains a `DRAFT` state before `PENDING` (Phase B decision)
- Whether Payroll gains a `PENDING` submission step (Phase C+ decision)
- Dashboard pending-count badge queries (Phase E)
- Notification center implementation (Phase E)
