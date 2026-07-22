import { Request } from 'express';
import { roundMoney } from '../../shared/utils/money';
import { Prisma } from '@prisma/client';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '@core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '@core/utils/sort';
import { transactionsService } from '@modules/transactions/transactions.service';
import {
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateMaterialInput,
  UpdateMaterialInput,
  CreatePurchaseOrderInput,
  UpdatePurchaseOrderInput,
  CreateGoodsReceiptInput,
  CreateMaterialIssueInput,
  UpdateMaterialIssueInput,
} from './inventory.schema';
import { roundCost, calcWAC, sufficientStock } from './inventory.calc';

type DbClient = typeof prisma | Prisma.TransactionClient;

// القوائم البيضاء للفرز (Enterprise Data Grid Foundation) — أربع قوائم مخزون
// مرقّمة خادميًا. المفاتيح مطابقة لأعمدة واجهة Inventory.tsx.
const MATERIALS_SORTABLE: SortWhitelist = {
  code: 'code',
  name: 'name',
  category: (dir) => ({ category: { name: dir } }),
  unit: 'unit',
  currentStock: 'currentStock',
  unitCost: 'unitCost',
  isActive: 'isActive',
};
const PO_SORTABLE: SortWhitelist = {
  number: 'number',
  supplier: (dir) => ({ supplier: { name: dir } }),
  date: 'date',
  expectedDate: { field: 'expectedDate', nullable: true },
  status: 'status',
  totalAmount: 'totalAmount',
};
const GR_SORTABLE: SortWhitelist = {
  number: 'number',
  supplier: (dir) => ({ supplier: { name: dir } }),
  purchaseOrder: (dir) => ({ purchaseOrder: { number: dir } }),
  date: 'date',
  status: 'status',
  totalCost: 'totalCost',
};
const MI_SORTABLE: SortWhitelist = {
  number: 'number',
  contract: (dir) => ({ contract: { code: dir } }),
  date: 'date',
  status: 'status',
  totalCost: 'totalCost',
};

// ── تصنيفات المواد ────────────────────────────────────────────────────────

export class CategoriesService {
  async list(query: PaginationQuery & { active?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.MaterialCategoryWhereInput = {};
    if (query.active === 'true') where.isActive = true;
    if (query.active === 'false') where.isActive = false;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { nameEn: { contains: query.search } },
      ];
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
        { nameEn: { contains: query.search } },
        { code: { contains: query.search } },
      ];
    }

    const orderBy = buildOrderBy(query, MATERIALS_SORTABLE, [{ name: 'asc' }], [{ id: 'desc' }]) as Prisma.MaterialOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.material.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
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

// ── أوامر الشراء ──────────────────────────────────────────────────────────

const PO_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

export class PurchaseOrdersService {
  private async generateNumber(client: DbClient = prisma): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const count = await client.purchaseOrder.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async list(query: PaginationQuery & { supplierId?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.PurchaseOrderWhereInput = {};
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.status) where.status = query.status;
    if (query.search) where.number = { contains: query.search };
    const orderBy = buildOrderBy(query, PO_SORTABLE, [{ date: 'desc' }], [{ id: 'desc' }]) as Prisma.PurchaseOrderOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, receipts: true } },
        },
      }),
      prisma.purchaseOrder.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id },
      include: { ...PO_INCLUDE, _count: { select: { receipts: true } } },
    });
    if (!po) throw AppError.notFound('أمر الشراء غير موجود');
    return po;
  }

  async create(input: CreatePurchaseOrderInput, req: Request) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw AppError.notFound('المورد غير موجود');
    if (supplier.isArchived) throw AppError.badRequest('المورد مؤرشف');

    const materialIds = [...new Set(input.items.map((i) => i.materialId))];
    const materials = await prisma.material.findMany({ where: { id: { in: materialIds } } });
    if (materials.length !== materialIds.length) throw AppError.badRequest('بعض المواد غير موجودة');

    const totalAmount = input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const po = await prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.purchaseOrder.create({
        data: {
          number,
          supplierId: input.supplierId,
          date: input.date ? new Date(input.date) : new Date(),
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : null,
          notes: input.notes ?? null,
          totalAmount,
          items: {
            create: input.items.map((i) => ({
              materialId: i.materialId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              totalCost: i.quantity * i.unitCost,
            })),
          },
        },
        include: PO_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'CREATE', module: 'inventory', entityId: String(po.id), newValue: { number: po.number, totalAmount } });
    return po;
  }

  async update(id: number, input: UpdatePurchaseOrderInput, req: Request) {
    const current = await this.getById(id);
    if (current.status !== 'DRAFT') throw AppError.badRequest('لا يمكن تعديل أمر شراء غير مسوّد');

    if (input.supplierId && input.supplierId !== current.supplierId) {
      const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw AppError.notFound('المورد غير موجود');
    }

    const updated = await prisma.$transaction(async (tx) => {
      const newTotalAmount = input.items
        ? input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0)
        : current.totalAmount;

      if (input.items) {
        const materialIds = [...new Set(input.items.map((i) => i.materialId))];
        const mats = await tx.material.findMany({ where: { id: { in: materialIds } } });
        if (mats.length !== materialIds.length) throw AppError.badRequest('بعض المواد غير موجودة');

        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        await tx.purchaseOrderItem.createMany({
          data: input.items.map((i) => ({
            purchaseOrderId: id,
            materialId: i.materialId,
            quantity: i.quantity,
            unitCost: i.unitCost,
            totalCost: i.quantity * i.unitCost,
          })),
        });
      }

      return tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: input.supplierId ?? current.supplierId,
          date: input.date ? new Date(input.date) : current.date,
          expectedDate: input.expectedDate ? new Date(input.expectedDate) : current.expectedDate,
          notes: input.notes !== undefined ? input.notes : current.notes,
          totalAmount: newTotalAmount,
        },
        include: PO_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), oldValue: { totalAmount: current.totalAmount }, newValue: input });
    return updated;
  }

  async submit(id: number, req: Request) {
    const current = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('أمر الشراء غير موجود');
    if (current.status !== 'DRAFT') throw AppError.badRequest('لا يمكن إرسال أمر شراء غير مسوّد');
    const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'SUBMITTED' } });
    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), newValue: { status: 'SUBMITTED' } });
    return updated;
  }

  async cancel(id: number, req: Request) {
    const current = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('أمر الشراء غير موجود');
    if (!['DRAFT', 'SUBMITTED'].includes(current.status)) throw AppError.badRequest('لا يمكن إلغاء هذا الأمر');
    const updated = await prisma.purchaseOrder.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), newValue: { status: 'CANCELLED' } });
    return updated;
  }

  async remove(id: number, req: Request) {
    const current = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!current) throw AppError.notFound('أمر الشراء غير موجود');
    if (current.status !== 'DRAFT') throw AppError.conflict('لا يمكن حذف أمر شراء مُرسل — ألغِه أولًا');
    await prisma.purchaseOrder.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'inventory', entityId: String(id) });
    return { deleted: true };
  }
}

export const purchaseOrdersService = new PurchaseOrdersService();

// ── سندات الاستلام ────────────────────────────────────────────────────────

const GR_INCLUDE = {
  supplier: { select: { id: true, name: true } },
  purchaseOrder: { select: { id: true, number: true } },
  items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

export class GoodsReceiptsService {
  private async generateNumber(client: DbClient = prisma): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `GR-${year}-`;
    const count = await client.goodsReceipt.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async list(query: PaginationQuery & { supplierId?: string; status?: string; purchaseOrderId?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.GoodsReceiptWhereInput = {};
    if (query.supplierId) where.supplierId = Number(query.supplierId);
    if (query.status) where.status = query.status;
    if (query.purchaseOrderId) where.purchaseOrderId = Number(query.purchaseOrderId);
    if (query.search) where.number = { contains: query.search };
    const orderBy = buildOrderBy(query, GR_SORTABLE, [{ date: 'desc' }], [{ id: 'desc' }]) as Prisma.GoodsReceiptOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: {
          supplier: { select: { id: true, name: true } },
          purchaseOrder: { select: { id: true, number: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.goodsReceipt.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const gr = await prisma.goodsReceipt.findUnique({ where: { id }, include: GR_INCLUDE });
    if (!gr) throw AppError.notFound('سند الاستلام غير موجود');
    return gr;
  }

  async create(input: CreateGoodsReceiptInput, req: Request) {
    const supplier = await prisma.supplier.findUnique({ where: { id: input.supplierId } });
    if (!supplier) throw AppError.notFound('المورد غير موجود');
    if (supplier.isArchived) throw AppError.badRequest('المورد مؤرشف');

    if (input.purchaseOrderId) {
      const po = await prisma.purchaseOrder.findUnique({ where: { id: input.purchaseOrderId } });
      if (!po) throw AppError.notFound('أمر الشراء غير موجود');
      if (po.status === 'CANCELLED') throw AppError.badRequest('أمر الشراء ملغي');
    }

    const materialIds = [...new Set(input.items.map((i) => i.materialId))];
    const materials = await prisma.material.findMany({ where: { id: { in: materialIds } } });
    if (materials.length !== materialIds.length) throw AppError.badRequest('بعض المواد غير موجودة');

    const totalCost = input.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);

    const receipt = await prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.goodsReceipt.create({
        data: {
          number,
          supplierId: input.supplierId,
          purchaseOrderId: input.purchaseOrderId ?? null,
          date: input.date ? new Date(input.date) : new Date(),
          notes: input.notes ?? null,
          totalCost,
          status: 'DRAFT',
          items: {
            create: input.items.map((i) => ({
              materialId: i.materialId,
              quantity: i.quantity,
              unitCost: i.unitCost,
              totalCost: i.quantity * i.unitCost,
            })),
          },
        },
        include: GR_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'CREATE', module: 'inventory', entityId: String(receipt.id), newValue: { number: receipt.number, totalCost } });
    return receipt;
  }

  /**
   * ترحيل سند الاستلام: تحديث المخزون بطريقة المتوسط المرجح (WAC)
   * + ترحيل قيد محاسبي. محمي من الترحيل المزدوج بفحص accountingTransactionId.
   */
  async post(id: number, req: Request) {
    const receipt = await prisma.goodsReceipt.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!receipt) throw AppError.notFound('سند الاستلام غير موجود');
    if (receipt.status === 'POSTED') throw AppError.conflict('سند الاستلام مُرحَّل بالفعل');
    if (receipt.accountingTransactionId) throw AppError.conflict('تم ترحيل القيد المحاسبي مسبقًا');

    const updated = await prisma.$transaction(async (tx) => {
      // 1. WAC + stock update for each line item
      for (const item of receipt.items) {
        const material = await tx.material.findUnique({ where: { id: item.materialId } });
        if (!material) throw AppError.notFound(`المادة ${item.materialId} غير موجودة`);

        const safeCurrentStock = Math.max(0, material.currentStock);
        const newQty = safeCurrentStock + item.quantity;
        const newUnitCost = calcWAC(material.currentStock, material.unitCost, item.quantity, item.unitCost);

        await tx.material.update({
          where: { id: item.materialId },
          data: { currentStock: newQty, unitCost: newUnitCost },
        });
      }

      // 2. Post accounting entry: debit Inventory (asset acquisition, NOT an operating expense).
      // استلام المخزون هو حركة أصول (شراء مخزون)، وليس مصروفًا تشغيليًا — يُصرف لاحقًا عند
      // الصرف (MATERIAL_ISSUE). تصنيفه EXPENSE كان يُحتسبه مصروفًا مرتين في لوحة القيادة:
      // مرة عند الاستلام ومرة عند الصرف (خطأ C4). النوع TRANSFER يُبقيه في الدفتر كحركة
      // ميزانية لا تدخل في مجاميع الأرباح/الخسائر (REVENUE/EXPENSE فقط).
      const entry = await transactionsService.postEntry(
        {
          date: receipt.date,
          description: `استلام بضاعة ${receipt.number}`,
          type: 'TRANSFER',
          // حدّ الترحيل: التقييم الداخلي بستّ خانات، والدفتر بثلاث. التطبيع هنا وحده.
          debit: roundMoney(receipt.totalCost),
          account: 'مخزون - مواد',
          referenceType: 'GOODS_RECEIPT',
          referenceId: receipt.id,
        },
        tx,
      );

      // 3. Mark linked PO as received if applicable (updateMany silently skips if already received)
      if (receipt.purchaseOrderId) {
        await tx.purchaseOrder.updateMany({
          where: { id: receipt.purchaseOrderId, status: { not: 'RECEIVED' } },
          data: { status: 'RECEIVED' },
        });
      }

      // 4. Mark receipt as posted with accounting reference
      return tx.goodsReceipt.update({
        where: { id },
        data: {
          status: 'POSTED',
          accountingTransactionId: entry.id,
          accountingPostedAt: new Date(),
        },
        include: GR_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'APPROVE', module: 'inventory', entityId: String(id), newValue: { status: 'POSTED', totalCost: receipt.totalCost } });
    return updated;
  }

  async remove(id: number, req: Request) {
    const receipt = await prisma.goodsReceipt.findUnique({ where: { id } });
    if (!receipt) throw AppError.notFound('سند الاستلام غير موجود');
    if (receipt.status === 'POSTED') throw AppError.conflict('لا يمكن حذف سند استلام مُرحَّل — يؤثر على المخزون والمحاسبة');
    await prisma.goodsReceipt.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'inventory', entityId: String(id) });
    return { deleted: true };
  }
}

export const goodsReceiptsService = new GoodsReceiptsService();

// ── سندات الصرف ───────────────────────────────────────────────────────────

const MI_INCLUDE = {
  contract: { select: { id: true, code: true, asphaltPlant: true } },
  items: { include: { material: { select: { id: true, code: true, name: true, unit: true } } } },
} as const;

export class MaterialIssuesService {
  private async generateNumber(client: DbClient = prisma): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `MI-${year}-`;
    const count = await client.materialIssue.count({ where: { number: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  async list(query: PaginationQuery & { contractId?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.MaterialIssueWhereInput = {};
    if (query.contractId) where.contractId = Number(query.contractId);
    if (query.status) where.status = query.status;
    if (query.search) where.number = { contains: query.search };
    const orderBy = buildOrderBy(query, MI_SORTABLE, [{ date: 'desc' }], [{ id: 'desc' }]) as Prisma.MaterialIssueOrderByWithRelationInput[];
    const [data, total] = await Promise.all([
      prisma.materialIssue.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy,
        include: {
          contract: { select: { id: true, code: true, asphaltPlant: true } },
          _count: { select: { items: true } },
        },
      }),
      prisma.materialIssue.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const issue = await prisma.materialIssue.findUnique({ where: { id }, include: MI_INCLUDE });
    if (!issue) throw AppError.notFound('سند الصرف غير موجود');
    return issue;
  }

  async create(input: CreateMaterialIssueInput, req: Request) {
    if (input.contractId) {
      const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
      if (!contract) throw AppError.notFound('العقد غير موجود');
    }

    const materialIds = [...new Set(input.items.map((i) => i.materialId))];
    const materials = await prisma.material.findMany({ where: { id: { in: materialIds } } });
    if (materials.length !== materialIds.length) throw AppError.badRequest('بعض المواد غير موجودة');

    const matMap = new Map(materials.map((m) => [m.id, m]));
    const totalCost = input.items.reduce((sum, i) => sum + i.quantity * matMap.get(i.materialId)!.unitCost, 0);

    const issue = await prisma.$transaction(async (tx) => {
      const number = await this.generateNumber(tx);
      return tx.materialIssue.create({
        data: {
          number,
          contractId: input.contractId ?? null,
          date: input.date ? new Date(input.date) : new Date(),
          notes: input.notes ?? null,
          totalCost,
          status: 'DRAFT',
          items: {
            create: input.items.map((i) => {
              const mat = matMap.get(i.materialId)!;
              return { materialId: i.materialId, quantity: i.quantity, unitCostSnapshot: mat.unitCost, totalCost: i.quantity * mat.unitCost };
            }),
          },
        },
        include: MI_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'CREATE', module: 'inventory', entityId: String(issue.id), newValue: { number: issue.number, totalCost } });
    return issue;
  }

  async update(id: number, input: UpdateMaterialIssueInput, req: Request) {
    const current = await this.getById(id);
    if (current.status !== 'DRAFT') throw AppError.badRequest('لا يمكن تعديل سند صرف غير مسوّد');

    if (input.contractId) {
      const contract = await prisma.contract.findUnique({ where: { id: input.contractId } });
      if (!contract) throw AppError.notFound('العقد غير موجود');
    }

    const updated = await prisma.$transaction(async (tx) => {
      let newTotalCost = current.totalCost;

      if (input.items) {
        const materialIds = [...new Set(input.items.map((i) => i.materialId))];
        const materials = await tx.material.findMany({ where: { id: { in: materialIds } } });
        if (materials.length !== materialIds.length) throw AppError.badRequest('بعض المواد غير موجودة');

        const matMap = new Map(materials.map((m) => [m.id, m]));
        newTotalCost = input.items.reduce((sum, i) => sum + i.quantity * matMap.get(i.materialId)!.unitCost, 0);

        await tx.materialIssueItem.deleteMany({ where: { materialIssueId: id } });
        await tx.materialIssueItem.createMany({
          data: input.items.map((i) => {
            const mat = matMap.get(i.materialId)!;
            return { materialIssueId: id, materialId: i.materialId, quantity: i.quantity, unitCostSnapshot: mat.unitCost, totalCost: i.quantity * mat.unitCost };
          }),
        });
      }

      return tx.materialIssue.update({
        where: { id },
        data: {
          contractId: input.contractId !== undefined ? input.contractId : current.contractId,
          date: input.date ? new Date(input.date) : current.date,
          notes: input.notes !== undefined ? input.notes : current.notes,
          totalCost: newTotalCost,
        },
        include: MI_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), oldValue: { totalCost: current.totalCost }, newValue: input });
    return updated;
  }

  /**
   * ترحيل سند الصرف: خصم المخزون + تثبيت سعر WAC + ترحيل قيد محاسبي.
   * محمي من الترحيل المزدوج بفحص accountingTransactionId.
   * يرفض الترحيل إذا كان المخزون غير كافٍ لأي مادة.
   */
  async post(id: number, req: Request) {
    const issue = await prisma.materialIssue.findUnique({
      where: { id },
      include: { items: true, contract: { select: { code: true } } },
    });
    if (!issue) throw AppError.notFound('سند الصرف غير موجود');
    if (issue.status === 'POSTED') throw AppError.conflict('سند الصرف مُرحَّل بالفعل');
    if (issue.status === 'CANCELLED') throw AppError.conflict('سند الصرف ملغي');
    if (issue.accountingTransactionId) throw AppError.conflict('تم ترحيل القيد المحاسبي مسبقًا');
    if (issue.items.length === 0) throw AppError.badRequest('سند الصرف لا يحتوي على بنود');

    const updated = await prisma.$transaction(async (tx) => {
      let totalCost = 0;

      // 1. Snapshot current WAC, validate stock, deduct per item
      for (const item of issue.items) {
        const material = await tx.material.findUnique({ where: { id: item.materialId } });
        if (!material) throw AppError.notFound(`المادة ${item.materialId} غير موجودة`);
        if (!sufficientStock(material.currentStock, item.quantity)) {
          throw AppError.badRequest(
            `المخزون غير كافٍ للمادة: ${material.name} (متوفر: ${material.currentStock}، مطلوب: ${item.quantity})`,
          );
        }

        const itemCost = roundCost(item.quantity * material.unitCost);
        totalCost += itemCost;

        await tx.materialIssueItem.update({
          where: { id: item.id },
          data: { unitCostSnapshot: material.unitCost, totalCost: itemCost },
        });
        await tx.material.update({
          where: { id: item.materialId },
          data: { currentStock: { decrement: item.quantity } },
        });
      }

      // 2. Post accounting entry
      const description = issue.contract
        ? `صرف مواد ${issue.number} — عقد ${issue.contract.code}`
        : `صرف مواد ${issue.number}`;
      const entry = await transactionsService.postEntry(
        // حدّ الترحيل: يُطبَّع إلى دقّة الدينار قبل دخول الأستاذ العام.
        { date: issue.date, description, type: 'EXPENSE', debit: roundMoney(totalCost), account: 'مصروفات مواد', referenceType: 'MATERIAL_ISSUE', referenceId: issue.id },
        tx,
      );

      // 3. Mark as posted
      return tx.materialIssue.update({
        where: { id },
        data: { status: 'POSTED', totalCost, accountingTransactionId: entry.id, accountingPostedAt: new Date() },
        include: MI_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'APPROVE', module: 'inventory', entityId: String(id), newValue: { status: 'POSTED', totalCost: updated.totalCost } });
    return updated;
  }

  /**
   * إلغاء سند الصرف: استعادة المخزون + حذف القيد المحاسبي.
   * يُسمح فقط للسندات المُرحَّلة (POSTED).
   */
  async cancel(id: number, req: Request) {
    const issue = await prisma.materialIssue.findUnique({ where: { id }, include: { items: true } });
    if (!issue) throw AppError.notFound('سند الصرف غير موجود');
    if (issue.status !== 'POSTED') throw AppError.badRequest('لا يمكن إلغاء إلا سندات الصرف المُرحَّلة');

    const cancelled = await prisma.$transaction(async (tx) => {
      // 1. Restore stock for each item
      for (const item of issue.items) {
        await tx.material.update({
          where: { id: item.materialId },
          data: { currentStock: { increment: item.quantity } },
        });
      }

      // 2. Remove accounting entry
      await transactionsService.clearByReference('MATERIAL_ISSUE', id, tx);

      // 3. Mark as cancelled
      return tx.materialIssue.update({
        where: { id },
        data: { status: 'CANCELLED', accountingTransactionId: null, accountingPostedAt: null },
        include: MI_INCLUDE,
      });
    });

    await recordAudit({ req, action: 'UPDATE', module: 'inventory', entityId: String(id), newValue: { status: 'CANCELLED' } });
    return cancelled;
  }

  async remove(id: number, req: Request) {
    const issue = await prisma.materialIssue.findUnique({ where: { id } });
    if (!issue) throw AppError.notFound('سند الصرف غير موجود');
    if (issue.status !== 'DRAFT') throw AppError.conflict('لا يمكن حذف سند صرف غير مسوّد — ألغِه أولًا');
    await prisma.materialIssue.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'inventory', entityId: String(id) });
    return { deleted: true };
  }
}

export const materialIssuesService = new MaterialIssuesService();
