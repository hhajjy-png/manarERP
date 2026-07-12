import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { ROLES } from '@config/constants';
import type { Prisma } from '@prisma/client';
import type {
  ApprovalModuleConfig,
  TransitionInput,
  TransitionResult,
  RecordedTransitionInput,
  ApprovalTransitionEvent,
  ApprovalTransitionListener,
} from './approval.types';

/**
 * تحذير بلا تبعية.
 *
 * `logger` (Winston) **يُنشئ مجلد السجلات ويفتح ملفاته وقت الاستيراد** — أثرٌ جانبي عند
 * الاستيراد لا عند الاستخدام. وهذه خدمة مشتركة تستوردها الوحدات المجالية، فسحبُ الـ logger
 * إليها يجعل كل اختبار يحاكي `fs` ينهار قبل أن يبدأ. التحذير هنا نادر وتشخيصي، فلا يستحق
 * تلك التبعية.
 */
function warn(message: string): void {
  console.warn(`[approval] ${message}`);
}

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

  hasModule(entityType: string): boolean {
    return this.configs.has(entityType);
  }

  getHistoryPermission(entityType: string): string | undefined {
    return this.configs.get(entityType)?.historyPermission;
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

  // ── History Recording (domain-owned transitions) ───────────────────────

  /**
   * Records a transition that a DOMAIN SERVICE has already performed, into
   * `ApprovalHistory` — and does nothing else.
   *
   * This is the activation path. `transition()` above owns the whole act: it writes the
   * status, the history AND an AuditLog row, in a transaction it opens itself. The three
   * domain services (expenses / invoices / payroll) already do all of that — each with its
   * own guards, its own GL posting and its own `recordAudit` (which captures the request
   * IP; the engine cannot). Routing them through `transition()` would therefore mean:
   *   • a second AuditLog row per action (the engine writes one unconditionally), and
   *   • a nested `$transaction` on SQLite — a single-writer database — i.e. a deadlock.
   *
   * So the domain stays the single source of truth and simply *reports* what it did. This
   * writes ONE row: no status write, no audit, no permission re-check, no side effects.
   * It runs on the caller's transaction client, so it rolls back with the business change.
   *
   * A failure here must never destroy a completed approval, and an unregistered entity
   * type is a wiring bug, not a user error — both are logged, never thrown.
   */
  async recordTransition(
    input: RecordedTransitionInput,
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    if (!this.configs.has(input.entityType)) {
      warn(
        `ApprovalEngine: '${input.entityType}' is not registered — history not recorded. ` +
          'Add it to approval.registry.ts.',
      );
      return;
    }
    try {
      await tx.approvalHistory.create({
        data: {
          entityType:   input.entityType,
          entityId:     input.entityId,
          action:       input.action,
          fromStatus:   input.fromStatus,
          toStatus:     input.toStatus,
          userId:       input.userId ?? null,
          comment:      input.comment ?? null,
          reason:       input.reason ?? null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        },
      });
    } catch (err) {
      warn(`ApprovalEngine: failed to record ${input.action} history — ${String(err)}`);
    }
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

    if (!user || !user.role) throw AppError.forbidden('المستخدم غير موجود أو ليس له دور محدد');
    if (user.role.name === ROLES.SYSTEM_ADMIN) return;

    const keys = user.role.rolePermissions.map((rp) => rp.permission.key);
    if (!keys.includes(permissionKey)) {
      throw AppError.forbidden(`ليس لديك صلاحية تنفيذ هذا الإجراء (${permissionKey}).`);
    }
  }
}

/** Singleton — import this everywhere instead of instantiating. */
export const approvalEngine = new ApprovalEngine();

