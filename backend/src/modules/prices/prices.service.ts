import { prisma } from '@config/database';
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
