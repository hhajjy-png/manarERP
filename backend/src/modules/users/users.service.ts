import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { usersRepository } from './users.repository';
import { AppError } from '../../core/errors/AppError';
import { hashPassword } from '../../core/utils/password';
import { recordAudit } from '../../core/middleware/audit';
import { getPagination, buildPaginatedResult, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import { CreateUserInput, UpdateUserInput } from './users.schema';

// القائمة البيضاء للفرز — المفاتيح مطابقة لمفاتيح أعمدة الواجهة (modules.tsx).
// `role` عمود علاقة → فرز على الاسم المعروض للدور. SAFE_SELECT في المستودع يبقى
// كما هو: الفرز لا يوسّع الحقول المعادة إطلاقًا.
const SORTABLE: SortWhitelist = {
  username: 'username',
  fullName: 'fullName',
  isActive: 'isActive',
  role: (dir) => ({ role: { displayName: dir } }),
};
const DEFAULT_ORDER = [{ id: 'desc' as const }];

export class UsersService {
  async list(query: PaginationQuery & { isActive?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.UserWhereInput = {};
    if (query.search) {
      where.OR = [
        { username: { contains: query.search } },
        { fullName: { contains: query.search } },
        { email: { contains: query.search } },
      ];
    }
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;

    const orderBy = buildOrderBy(query, SORTABLE, DEFAULT_ORDER) as Prisma.UserOrderByWithRelationInput[];
    const { data, total } = await usersRepository.list(where, pagination.skip, pagination.take, orderBy);
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const user = await usersRepository.findSafeById(id);
    if (!user) throw AppError.notFound('المستخدم غير موجود');
    return user;
  }

  async create(input: CreateUserInput, req: Request) {
    const exists = await usersRepository.findByUsername(input.username);
    if (exists) throw AppError.conflict('اسم المستخدم مُستخدم من قبل');

    const { password, email, ...rest } = input;
    const user = await usersRepository.createSafe({
      ...rest,
      email: email || null,
      passwordHash: await hashPassword(password),
    });

    await recordAudit({ req, action: 'CREATE', module: 'users', entityId: user.id, newValue: { username: input.username, roleId: input.roleId } });
    return user;
  }

  async update(id: number, input: UpdateUserInput, req: Request) {
    await this.getById(id);
    const { password, email, ...rest } = input;
    const data: Record<string, unknown> = { ...rest };
    if (email !== undefined) data.email = email || null;
    if (password) data.passwordHash = await hashPassword(password);

    const user = await usersRepository.updateSafe(id, data);
    await recordAudit({ req, action: 'UPDATE', module: 'users', entityId: id, newValue: rest });
    return user;
  }

  async remove(id: number, req: Request) {
    await this.getById(id);
    // لا نحذف فعليًا — نعطّل الحساب حفاظًا على سجل التدقيق المرتبط
    const user = await usersRepository.updateSafe(id, { isActive: false });
    await recordAudit({ req, action: 'DELETE', module: 'users', entityId: id });
    return user;
  }
}

export const usersService = new UsersService();
