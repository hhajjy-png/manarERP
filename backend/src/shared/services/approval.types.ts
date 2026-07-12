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

  /** Optional permission key required to view this module's approval history.
   *  If absent, any authenticated user may read history (Phase A fallback).
   *  Set in Phase B when modules register (e.g. 'expenses.view').
   */
  historyPermission?: string;
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

/**
 * A transition the DOMAIN SERVICE already performed and is now reporting, for the history
 * trail. Unlike `TransitionInput`, the statuses are stated rather than derived: the engine
 * is recording a fact here, not deciding one — so it needs no state machine and no
 * permission check (the route already enforced one).
 *
 * `fromStatus === toStatus` is legitimate: an invoice approval posts to the GL without
 * moving the invoice's status at all.
 */
export interface RecordedTransitionInput {
  entityType: string;
  entityId: number;
  action: string;
  fromStatus: string;
  toStatus: string;
  userId: number | null;
  comment?: string;
  reason?: string;
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
