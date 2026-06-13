import { Request } from 'express';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import type { CreatePriceInput, UpdatePriceInput } from './prices.schema';

export async function listPrices(params: {
  page: number;
  pageSize: number;
  search?: string;
  asphaltPlant?: string;
  companyName?: string;
  contractUnit?: string;
}) {
  const { page, pageSize, search, asphaltPlant, companyName, contractUnit } = params;
  const skip = (page - 1) * pageSize;

  const where = {
    isArchived: false,
    ...(asphaltPlant ? { asphaltPlant: { contains: asphaltPlant } } : {}),
    ...(companyName ? { companyName: { contains: companyName } } : {}),
    ...(contractUnit ? { contractUnit } : {}),
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
    prisma.projectPrice.findMany({ where, skip, take: pageSize, orderBy: { createdAt: 'desc' } }),
    prisma.projectPrice.count({ where }),
  ]);

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function createPrice(input: CreatePriceInput) {
  return prisma.projectPrice.create({ data: input });
}

export async function updatePrice(id: number, input: UpdatePriceInput) {
  return prisma.projectPrice.update({ where: { id }, data: input });
}

export async function deletePrice(id: number) {
  return prisma.projectPrice.update({ where: { id }, data: { isArchived: true } });
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
