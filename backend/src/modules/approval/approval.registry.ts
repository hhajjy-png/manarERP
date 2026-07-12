import { approvalEngine } from '@shared/services/approval.service';
import type { Prisma } from '@prisma/client';

/**
 * Runtime registration of the approval engine.
 *
 * Until now nothing ever called `register()`, so `hasModule()` was false for every entity
 * type and `GET /api/approval-history/:entityType/:id` answered 400 to **every** request —
 * a finished, tested feature that was unreachable. This file is the wiring that was missing.
 *
 * WHAT A REGISTRATION MEANS HERE — and what it deliberately does not mean.
 *
 * The engine is registered as a **registry and a history trail**, not as an executor. The
 * approval itself stays where it already lives: `expenses.approve()`, `invoices.approve()`
 * and `payroll.approve()` keep their own guards, their own status writes, their own GL
 * posting and their own `recordAudit`. Each of them now *reports* what it did through
 * `approvalEngine.recordTransition()`, on its own transaction client.
 *
 * That boundary is not a preference — it is forced by the code:
 *   • the engine writes its own `AuditLog` row, and every domain method writes one too, so
 *     executing through `transition()` would double-audit every approval;
 *   • every domain method opens its own `$transaction`, and SQLite is single-writer, so
 *     calling one from inside the engine's transaction would deadlock;
 *   • `invoices.approve()` has no status transition at all — it posts to the GL
 *     idempotently and leaves `invoice.status` untouched. Registering it in a state machine
 *     would mean inventing a status, i.e. a schema and behaviour change.
 *
 * So `updateStatus` below throws on purpose: if someone later routes an approval through
 * `transition()`, they get a loud error instead of a second, competing status write.
 */

type StatusRow = { status: string };

/** The engine does not own status writes for these modules — the domain services do. */
function domainOwnsStatus(module: string) {
  return async (): Promise<never> => {
    throw new Error(
      `ApprovalEngine: '${module}' status transitions belong to its own service. ` +
        'The engine is registered for history and permission metadata only — ' +
        'call the domain service, not engine.transition().',
    );
  };
}

/**
 * مُتماثلة عمدًا: `createApp()` يُستدعى مرة لكل تطبيق اختباري، و`register()` يرمي عند
 * تكرار النوع. التسجيل إعداد لا حدث، فتكراره يجب أن يكون بلا أثر.
 */
export function registerApprovalModules(): void {
  if (approvalEngine.hasModule('expense')) return;

  // ── المصروفات ────────────────────────────────────────────────────────────
  // آلة حالات حقيقية: PENDING → APPROVED / REJECTED / CANCELLED، والمعتمَد يُعكس أو يُعدَّل.
  approvalEngine.register<StatusRow>({
    entityType:       'expense',
    statusField:      'status',
    allowedStatuses:  ['PENDING', 'APPROVED', 'REJECTED', 'REVERSED', 'CANCELLED'],
    transitions: [
      { action: 'approve', from: 'PENDING',  to: 'APPROVED' },
      { action: 'reject',  from: 'PENDING',  to: 'REJECTED' },
      { action: 'cancel',  from: 'PENDING',  to: 'CANCELLED' },
      { action: 'reverse', from: 'APPROVED', to: 'REVERSED' },
      { action: 'amend',   from: 'APPROVED', to: 'PENDING' },
    ],
    permissions: {
      approve: 'expenses.approve',
      reject:  'expenses.approve',
      reverse: 'expenses.approve',
      amend:   'expenses.approve',
      cancel:  'expenses.update',
    },
    getEntity: (id: number, tx: Prisma.TransactionClient) =>
      tx.expense.findUniqueOrThrow({ where: { id }, select: { status: true } }),
    updateStatus:     domainOwnsStatus('expense'),
    auditModule:      'expenses',
    historyPermission: 'expenses.read',
  });

  // ── الفواتير ─────────────────────────────────────────────────────────────
  // «الاعتماد» هنا ترحيل محاسبي مُتماثل (idempotent) لفاتورة مشتريات — **لا ينقل الحالة**.
  // ولهذا لا انتقالات: تسجيله في آلة حالات كان سيتطلّب اختراع حالة جديدة. السجلّ يوثّق
  // الفعل كما هو (fromStatus === toStatus)، وهو الغرض.
  approvalEngine.register<StatusRow>({
    entityType:       'invoice',
    statusField:      'status',
    allowedStatuses:  ['DRAFT', 'UNPAID', 'PARTIAL', 'PAID', 'CANCELLED'],
    transitions:      [],
    permissions:      { approve: 'invoices.approve' },
    getEntity: (id: number, tx: Prisma.TransactionClient) =>
      tx.invoice.findUniqueOrThrow({ where: { id }, select: { status: true } }),
    updateStatus:     domainOwnsStatus('invoice'),
    auditModule:      'invoices',
    historyPermission: 'invoices.read',
  });

  // ── الرواتب ──────────────────────────────────────────────────────────────
  // DRAFT → APPROVED (بلا ترحيل)، ثم APPROVED → PAID (هنا يقع الترحيل المحاسبي).
  approvalEngine.register<StatusRow>({
    entityType:       'payroll',
    statusField:      'status',
    allowedStatuses:  ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'],
    transitions: [
      { action: 'approve', from: 'DRAFT',                 to: 'APPROVED' },
      { action: 'pay',     from: 'APPROVED',              to: 'PAID' },
      { action: 'cancel',  from: ['DRAFT', 'APPROVED'],   to: 'CANCELLED' },
    ],
    permissions: {
      approve: 'payroll.approve',
      pay:     'payroll.pay',
      cancel:  'payroll.update',
    },
    getEntity: (id: number, tx: Prisma.TransactionClient) =>
      tx.payroll.findUniqueOrThrow({ where: { id }, select: { status: true } }),
    updateStatus:     domainOwnsStatus('payroll'),
    auditModule:      'payroll',
    historyPermission: 'payroll.read',
  });
}
