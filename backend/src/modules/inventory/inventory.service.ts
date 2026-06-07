import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '@core/utils/pagination';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateMaterialInput,
  UpdateMaterialInput,
} from './inventory.schema';

// ── تصنيفات المواد ────────────────────────────────────────────────────────

export class CategoriesService {
  async list(query: PaginationQuery & { active?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.MaterialCategoryWhereInput = {};
    if (query.active === 'true') where.isActive = true;
    if (query.active === 'false') where.isActive = false;
    if (query.search) {
      where.name = { contains: query.search };
    }
    const [data, total] = await Promise.all([
      prisma.materialCategory.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
        include: { _count: { select: { materials: true } } },
      }),
      prisma.materialCategory.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const category = await prisma.materialCategory.findUnique({
      where: { id },
      include: { _count: { select: { materials: true } } },
    });
    if (!category) throw AppError.notFound('التصنيف غير موجود');
    return category;
  }

  async create(input: CreateCategoryInput, req: Request) {
    const existing = await prisma.materialCategory.findUnique({ where: { name: input.name } });
    if (existing) throw AppError.conflict('اسم التصنيف مُستخدم من قبل');
    const category = await prisma.materialCategory.create({ data: input });
    await recordAudit({ req, action: 'CREATE', module: 'inventory', entityId: String(category.id), newValue: input });
    return category;
  }

  async update(id: number, input: UpdateCategoryInput, req: Request) {
    const current = await this.getById(id);
    if (input.name && input.name !== current.name) {
      const existing = await prisma.materialCategory.findUnique({ where: { name: input.name } });
      if (existing) throw AppError.conflict('اسم التصنيف مُستخدم من قبل');
    }
    const category = await prisma.materialCategory.update({ where: { id }, data: input });
    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), oldValue: current, newValue: input });
    return category;
  }

  async remove(id: number, req: Request) {
    const category = await prisma.materialCategory.findUnique({
      where: { id },
      include: { _count: { select: { materials: true } } },
    });
    if (!category) throw AppError.notFound('التصنيف غير موجود');
    if (category._count.materials > 0) {
      throw AppError.conflict('لا يمكن حذف تصنيف مرتبط بمواد — عطّله بدلاً من حذفه');
    }
    await prisma.materialCategory.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'inventory', entityId: String(id) });
    return { deleted: true };
  }
}

export const categoriesService = new CategoriesService();

// ── المواد ────────────────────────────────────────────────────────────────

export class MaterialsService {
  async list(query: PaginationQuery & { categoryId?: string; active?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.MaterialWhereInput = {};
    if (query.active === 'true') where.isActive = true;
    if (query.active === 'false') where.isActive = false;
    if (query.categoryId) where.categoryId = Number(query.categoryId);
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { name: 'asc' },
        include: { category: { select: { id: true, name: true } } },
      }),
      prisma.material.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const material = await prisma.material.findUnique({
      where: { id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!material) throw AppError.notFound('المادة غير موجودة');
    return material;
  }

  async create(input: CreateMaterialInput, req: Request) {
    const existing = await prisma.material.findUnique({ where: { code: input.code } });
    if (existing) throw AppError.conflict('رمز المادة مُستخدم من قبل');
    await categoriesService.getById(input.categoryId);
    const material = await prisma.material.create({ data: input });
    await recordAudit({ req, action: 'CREATE', module: 'inventory', entityId: String(material.id), newValue: input });
    return material;
  }

  async update(id: number, input: UpdateMaterialInput, req: Request) {
    const current = await this.getById(id);
    if (input.code && input.code !== current.code) {
      const existing = await prisma.material.findUnique({ where: { code: input.code } });
      if (existing) throw AppError.conflict('رمز المادة مُستخدم من قبل');
    }
    if (input.categoryId) await categoriesService.getById(input.categoryId);
    const material = await prisma.material.update({ where: { id }, data: input });
    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), oldValue: current, newValue: input });
    return material;
  }

  async remove(id: number, req: Request) {
    const material = await prisma.material.findUnique({ where: { id } });
    if (!material) throw AppError.notFound('المادة غير موجودة');
    await prisma.material.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'inventory', entityId: String(id) });
    return { deleted: true };
  }
}

export const materialsService = new MaterialsService();
