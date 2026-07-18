import { Prisma } from '@prisma/client';
import { BaseRepository } from '../../shared/repositories/BaseRepository';
import { prisma } from '../../config/database';

// نخفي passwordHash من كل النتائج المعادة للواجهة
const SAFE_SELECT = {
  id: true,
  username: true,
  fullName: true,
  email: true,
  phone: true,
  isActive: true,
  lastLoginAt: true,
  roleId: true,
  employeeId: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, displayName: true } },
} as const;

class UsersRepository extends BaseRepository<{ id: number }> {
  protected readonly model = 'user';

  findByUsername(username: string) {
    return prisma.user.findUnique({ where: { username } });
  }

  findSafeById(id: number) {
    return prisma.user.findUnique({ where: { id }, select: SAFE_SELECT });
  }

  async list(
    where: object,
    skip: number,
    take: number,
    orderBy: Prisma.UserOrderByWithRelationInput[] = [{ id: 'desc' }],
  ) {
    const [data, total] = await Promise.all([
      prisma.user.findMany({ where, select: SAFE_SELECT, skip, take, orderBy }),
      prisma.user.count({ where }),
    ]);
    return { data, total };
  }

  createSafe(data: object) {
    return prisma.user.create({ data: data as never, select: SAFE_SELECT });
  }

  updateSafe(id: number, data: object) {
    return prisma.user.update({ where: { id }, data: data as never, select: SAFE_SELECT });
  }
}

export const usersRepository = new UsersRepository();
