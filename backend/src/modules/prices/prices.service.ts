import { Request } from 'express';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import type { CreatePriceInput, UpdatePriceInput } from './prices.schema';

const customerSelect = { select: { id: true, name: true } } as const;

export async function listPrices(params: {
  page: number;
  pageSize: number;
  search?: string;
  asphaltPlant?: string;
  companyName?: string;
  contractUnit?: string;
  customerId?: number;
}) {
  const { page, pageSize, search, asphaltPlant, companyName, contractUnit, customerId } = params;
  const skip = (page - 1) * pageSize;

  const where = {
    isArchived: false,
    ...(asphaltPlant ? { asphaltPlant: { contains: asphaltPlant } } : {}),
    ...(companyName ? { companyName: { contains: companyName } } : {}),
    ...(contractUnit ? { contractUnit } : {}),
    ...(customerId ? { OR: [{ customerId }, { customerId: null }] } : {}),
    ...(search
      ? {
          OR: [
            { asphaltPlant: { contains: search } },
            { companyName: { contains: search } },
            { contractLocation: { contains: search } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.projectPrice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { customer: customerSelect },
    }),
    prisma.projectPrice.count({ where }),
  ]);

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function createPrice(input: CreatePriceInput) {
  return prisma.projectPrice.create({
    data: input,
    include: { customer: customerSelect },
  });
}

export async function updatePrice(id: number, input: UpdatePriceInput) {
  return prisma.projectPrice.update({
    where: { id },
    data: input,
    include: { customer: customerSelect },
  });
}

export async function deletePrice(id: number) {
  return prisma.projectPrice.update({ where: { id }, data: { isArchived: true } });
}

export async function getPricesStats() {
  const [count, groupedCustomers, latest] = await Promise.all([
    prisma.projectPrice.count({ where: { isArchived: false } }),
    prisma.projectPrice.groupBy({
      by: ['customerId'],
      where: { isArchived: false, customerId: { not: null } },
    }),
    prisma.projectPrice.findFirst({
      where: { isArchived: false },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true },
    }),
  ]);
  return {
    count,
    customerCount: groupedCustomers.length,
    lastUpdatedAt: latest?.updatedAt ?? null,
  };
}

export async function getPricesUsageReport() {
  const [prices, items] = await Promise.all([
    prisma.projectPrice.findMany({
      where: { isArchived: false },
      include: { customer: customerSelect },
      orderBy: { asphaltPlant: 'asc' },
    }),
    prisma.invoiceItem.findMany({
      where: { priceId: { not: null } },
      select: { priceId: true, quantity: true, total: true },
    }),
  ]);

  const byPriceId = new Map<number, { count: number; totalQty: number; totalAmt: number }>();
  for (const item of items) {
    if (item.priceId == null) continue;
    const g = byPriceId.get(item.priceId) ?? { count: 0, totalQty: 0, totalAmt: 0 };
    g.count++;
    g.totalQty += item.quantity;
    g.totalAmt += item.total;
    byPriceId.set(item.priceId, g);
  }

  const report = prices.map((price) => {
    const g = byPriceId.get(price.id) ?? { count: 0, totalQty: 0, totalAmt: 0 };
    return {
      id: price.id,
      asphaltPlant: price.asphaltPlant,
      companyName: price.companyName,
      contractLocation: price.contractLocation,
      contractUnit: price.contractUnit,
      unitPrice: price.unitPrice,
      customer: price.customer,
      usageCount: g.count,
      totalQuantity: g.totalQty,
      totalAmount: g.totalAmt,
    };
  });

  return {
    report,
    hasDirectTracking: true,
    note: 'الاستخدام مبني على priceId المخزون مباشرةً في بند الفاتورة. الفواتير القديمة (priceId = null) غير مشمولة في الأرقام.',
  };
}

export async function getPricesUsageByCompany() {
  const items = await prisma.invoiceItem.findMany({
    where: { priceId: { not: null } },
    select: {
      priceId: true,
      quantity: true,
      total: true,
      price: { select: { companyName: true } },
    },
  });

  const byCompany = new Map<
    string,
    { priceIds: Set<number>; usageCount: number; totalQty: number; totalAmt: number }
  >();

  for (const item of items) {
    if (!item.price || item.priceId == null) continue;
    const company = item.price.companyName;
    const g = byCompany.get(company) ?? { priceIds: new Set(), usageCount: 0, totalQty: 0, totalAmt: 0 };
    g.priceIds.add(item.priceId);
    g.usageCount++;
    g.totalQty += item.quantity;
    g.totalAmt += item.total;
    byCompany.set(company, g);
  }

  return Array.from(byCompany.entries())
    .map(([companyName, g]) => ({
      companyName,
      agreementCount: g.priceIds.size,
      usageCount: g.usageCount,
      totalQuantity: g.totalQty,
      totalAmount: g.totalAmt,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function forceRemovePreview(id: number) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');

  const invoiceItemCount = await prisma.invoiceItem.count({ where: { priceId: id } });

  return {
    price,
    childCounts: { invoiceItems: invoiceItemCount },
    totalChildRecords: invoiceItemCount,
    willBeDeleted: ['projectPrice'],
    willBeNullified: [],
    blocked: invoiceItemCount > 0,
    blockReason: invoiceItemCount > 0
      ? `لا يمكن حذف هذا السعر — مرتبط بـ ${invoiceItemCount} بند فاتورة. أرشف السعر بدلاً من الحذف.`
      : null,
  };
}

export async function forceRemove(id: number, req: Request) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');

  const invoiceItemCount = await prisma.invoiceItem.count({ where: { priceId: id } });
  if (invoiceItemCount > 0) {
    throw AppError.conflict(
      `لا يمكن حذف هذا السعر — مرتبط بـ ${invoiceItemCount} بند فاتورة. أرشف السعر بدلاً من الحذف.`,
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.projectPrice.delete({ where: { id } });
  });

  await recordAudit({
    req,
    action: 'DELETE',
    module: 'prices',
    entityId: id,
    oldValue: {
      forceDelete: true,
      deletedEntity: {
        id: price.id,
        asphaltPlant: price.asphaltPlant,
        companyName: price.companyName,
        contractLocation: price.contractLocation,
        contractUnit: price.contractUnit,
        unitPrice: price.unitPrice,
        isArchived: price.isArchived,
      },
      childCounts: { invoiceItems: 0 },
      totalChildRecords: 0,
      willBeDeleted: ['projectPrice'],
      willBeNullified: [],
    },
  });

  return { deleted: true, impact: { childCounts: { invoiceItems: 0 }, totalChildRecords: 0 } };
}
