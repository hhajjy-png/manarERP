import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { authenticate } from '../../core/middleware/auth.middleware';
import { requirePermission } from '../../core/middleware/rbac.middleware';
import { asyncHandler } from '../../core/utils/asyncHandler';
import { ok } from '../../core/utils/response';
import { buildPaginatedResult, getPagination } from '../../core/utils/pagination';

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

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { username: true, fullName: true } } },
      }),
      prisma.auditLog.count({ where }),
    ]);
    ok(res, buildPaginatedResult(data, total, pagination));
  }),
);

export default router;
