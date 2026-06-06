import { Request } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../utils/logger';

interface AuditInput {
  req: Request;
  action: string; // CREATE | UPDATE | DELETE | LOGIN | LOGOUT | APPROVE | RESTORE...
  module: string;
  entityId?: string | number;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * تسجيل عملية في سجل التدقيق (Audit Log).
 * تُستدعى من داخل الـ Services بعد العمليات الحساسة.
 * لا ترمي خطأ يوقف العملية الأساسية — تكتفي بتسجيل الفشل.
 */
export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.req.user?.userId ?? null,
        action: input.action,
        module: input.module,
        entityId: input.entityId != null ? String(input.entityId) : null,
        oldValue: input.oldValue ? JSON.stringify(input.oldValue) : null,
        newValue: input.newValue ? JSON.stringify(input.newValue) : null,
        ipAddress: input.req.ip ?? null,
      },
    });
  } catch (err) {
    logger.error('فشل تسجيل عملية التدقيق', { error: err });
  }
}
