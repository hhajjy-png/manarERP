import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { customersRepository } from './customers.repository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { CreateCustomerInput, UpdateCustomerInput } from './customers.schema';

interface CustomerQuery extends PaginationQuery {
  type?: string;
  archived?: string;
}

export class CustomersService {
  async list(query: CustomerQuery) {
    const pagination = getPagination(query);
    const where: Prisma.CustomerWhereInput = {};

    // افتراضيًا نخفي المؤرشفين ما لم يُطلبوا صراحة
    where.isArchived = query.archived === 'true' ? true : query.archived === 'all' ? undefined : false;
    if (query.type) where.type = query.type;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { code: { contains: query.search } },
        { phone: { contains: query.search } },
        { contactName: { contains: query.search } },
      ];
    }

    const { data, total } = await customersRepository.findMany({ where, pagination });
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const customer = await customersRepository.findWithRelations(id);
    if (!customer) throw AppError.notFound('العميل غير موجود');
    return customer;
  }

  async create(input: CreateCustomerInput, req: Request) {
    const exists = await customersRepository.exists({ code: input.code });
    if (exists) throw AppError.conflict('رقم العميل مُستخدم من قبل');

    const customer = await customersRepository.create({
      ...input,
      email: input.email || null,
    });
    await recordAudit({ req, action: 'CREATE', module: 'customers', entityId: customer.id, newValue: input });
    return customer;
  }

  async update(id: number, input: UpdateCustomerInput, req: Request) {
    const current = await customersRepository.findById(id);
    if (!current) throw AppError.notFound('العميل غير موجود');

    if (input.code && input.code !== (current as { code: string }).code) {
      const dup = await customersRepository.exists({ code: input.code });
      if (dup) throw AppError.conflict('رقم العميل مُستخدم من قبل');
    }

    const data = { ...input };
    if (input.email !== undefined) (data as Record<string, unknown>).email = input.email || null;

    const customer = await customersRepository.update(id, data);
    await recordAudit({ req, action: 'UPDATE', module: 'customers', entityId: id, oldValue: current, newValue: input });
    return customer;
  }

  /** أرشفة/إلغاء أرشفة بدل الحذف النهائي. */
  async setArchived(id: number, archived: boolean, req: Request) {
    await this.getById(id);
    const customer = await customersRepository.update(id, { isArchived: archived });
    await recordAudit({ req, action: archived ? 'ARCHIVE' : 'UNARCHIVE', module: 'customers', entityId: id });
    return customer;
  }

  /** حذف نهائي — يُمنع إذا كان للعميل مشاريع أو فواتير. */
  async remove(id: number, req: Request) {
    const customer = await customersRepository.findWithRelations(id);
    if (!customer) throw AppError.notFound('العميل غير موجود');
    if (customer._count.contracts > 0 || customer._count.invoices > 0) {
      throw AppError.conflict('لا يمكن حذف عميل مرتبط بعقود أو فواتير — يمكنك أرشفته بدلًا من ذلك');
    }
    await customersRepository.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'customers', entityId: id, oldValue: customer });
    return { deleted: true };
  }
}

export const customersService = new CustomersService();
