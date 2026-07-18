import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { buildPaginatedResult, getPagination } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';

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

/** عرض سجل التدقيق مع تصفية بالوحدة/الإجراء/المستخدم/التاريخ/البحث. */
router.get(
  '/',
  requirePermission('audit.read'),
  asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string>;
    const pagination = getPagination(q);
    const where: Prisma.AuditLogWhereInput = {};

    if (q.module) where.module = q.module;
    if (q.action) where.action = q.action;
    if (q.userId) where.userId = Number(q.userId);
    if (q.from || q.to) {
      where.createdAt = {};
      if (q.from) where.createdAt.gte = new Date(q.from);
      if (q.to) where.createdAt.lte = new Date(q.to);
    }
    if (q.search) {
      where.OR = [
        { entityId: { contains: q.search } },
        { user: { username: { contains: q.search } } },
        { user: { fullName: { contains: q.search } } },
      ];
    }

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
