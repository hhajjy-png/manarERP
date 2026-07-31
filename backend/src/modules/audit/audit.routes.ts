import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { buildPaginatedResult, getPagination } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import { localDateRange } from '../../core/utils/dateWindows';

// القائمة البيضاء للفرز (Enterprise Data Grid Foundation) — سجل التدقيق.
// «المستخدم» عمود علاقة؛ «الملخص» مشتق في الواجهة → غير قابل للفرز عمدًا.
const AUDIT_SORTABLE: SortWhitelist = {
  createdAt: 'createdAt',
  module: 'module',
  action: 'action',
  entityId: { field: 'entityId', nullable: true },
  user: (dir) => ({ user: { fullName: dir } }),
};

const router = Router();
router.use(authenticate);

/**
 * يبني شرط تصفية سجل التدقيق. مُصدَّر ليُختبَر مباشرةً — نفس نمط
 * `buildAttendanceWhere` / `buildChequeFilterWhere` / `buildTimelineWhere`.
 *
 * `createdAt` طابع زمني حقيقي، بينما `from`/`to` مدى تقويمي يختاره المستخدم.
 * قبل توحيد حدود التاريخ كان `to` يُترجَم إلى منتصف الليل بلا تمديد، فكان
 * «حتى اليوم» يُخفي سجلّات اليوم نفسه بأكملها — أخطر أثر في وحدة يُفترض أنها
 * تُثبِت ما جرى للتوّ.
 */
export function buildAuditWhere(q: Record<string, string>): Prisma.AuditLogWhereInput {
  const where: Prisma.AuditLogWhereInput = {};

  if (q.module) where.module = q.module;
  if (q.action) where.action = q.action;
  if (q.userId) where.userId = Number(q.userId);
  const dateRange = localDateRange(q.from, q.to);
  if (dateRange) where.createdAt = dateRange;
  if (q.search) {
    where.OR = [
      { entityId: { contains: q.search } },
      { user: { username: { contains: q.search } } },
      { user: { fullName: { contains: q.search } } },
    ];
  }

  return where;
}

/** عرض سجل التدقيق مع تصفية بالوحدة/الإجراء/المستخدم/التاريخ/البحث. */
router.get(
  '/',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const pagination = getPagination(q);
    const where = buildAuditWhere(q);

    const orderBy = buildOrderBy(q, AUDIT_SORTABLE, [{ createdAt: 'desc' }], [{ id: 'desc' }]) as Prisma.AuditLogOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: { user: { select: { username: true, fullName: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, buildPaginatedResult(data, total, pagination));
  }),
);

export default router;
