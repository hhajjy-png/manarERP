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
  const TOLERANCE = 0.001;

  const [prices, items] = await Promise.all([
    prisma.projectPrice.findMany({
      where: { isArchived: false },
      include: { customer: customerSelect },
      orderBy: { asphaltPlant: 'asc' },
    }),
    prisma.invoiceItem.findMany({
      select: { unit: true, unitPrice: true, quantity: true, total: true },
    }),
  ]);

  const report = prices.map((price) => {
    const matches = items.filter(
      (item) =>
        item.unit === price.contractUnit &&
        Math.abs(item.unitPrice - price.unitPrice) < TOLERANCE,
    );
    return {
      id: price.id,
      asphaltPlant: price.asphaltPlant,
      companyName: price.companyName,
      contractLocation: price.contractLocation,
      contractUnit: price.contractUnit,
      unitPrice: price.unitPrice,
      customer: price.customer,
      usageCount: matches.length,
      totalQuantity: matches.reduce((s, m) => s + m.quantity, 0),
      totalAmount: matches.reduce((s, m) => s + m.total, 0),
    };
  });

  return {
    report,
    hasDirectTracking: false,
    note: 'الاستخدام محسوب بالتطابق التقريبي (وحدة + سعر). لا يوجد FK مباشر من بنود الفاتورة إلى الاتفاقيات.',
    phase2Requirement: 'لقياس الاستخدام بدقة في Phase 2 يجب إضافة حقل priceId في جدول invoice_items.',
  };
}

export async function forceRemovePreview(id: number) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');
  return {
    price,
    childCounts: {},
    totalChildRecords: 0,
    willBeDeleted: ['projectPrice'],
    willBeNullified: [],
  };
}

export async function forceRemove(id: number, req: Request) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');

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
      childCounts: {},
      totalChildRecords: 0,
      willBeDeleted: ['projectPrice'],
      willBeNullified: [],
    },
  });

  return { deleted: true, impact: { childCounts: {}, totalChildRecords: 0 } };
}
