import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { customersRepository } from './customers.repository';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { buildOrderBy, SortWhitelist } from '../../core/utils/sort';
import { CreateCustomerInput, UpdateCustomerInput } from './customers.schema';

interface CustomerQuery extends PaginationQuery {
  type?: string;
  archived?: string;
}

// القائمة البيضاء للفرز — المفاتيح مطابقة لمفاتيح أعمدة الواجهة (modules.tsx).
const SORTABLE: SortWhitelist = {
  code: 'code',
  name: 'name',
  type: 'type',
  phone: { field: 'phone', nullable: true },
  contactName: { field: 'contactName', nullable: true },
};
const DEFAULT_ORDER = [{ id: 'desc' as const }];

interface ChildCounts {
  contracts: number;
  directInvoices: number;
  contractInvoices: number;
  expenses: number;
  contractDocuments: number;
  materialIssues: number;
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

    const orderBy = buildOrderBy(query, SORTABLE, DEFAULT_ORDER);
    const { data, total } = await customersRepository.findMany({ where, pagination, orderBy });
    return buildPaginatedResult(data, total, pagination);
  }

  async getById(id: number) {
    const customer = await customersRepository.findWithRelations(id);
    if (!customer) throw AppError.notFound('العميل غير موجود');
    return customer;
  }

  async create(input: CreateCustomerInput, req: Request) {
    const conflict = await prisma.customer.findUnique({ where: { code: input.code } });
    if (conflict) throw AppError.conflict(`رقم العميل «${input.code}» مستخدم بالفعل للعميل: ${conflict.name}`);

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
      const conflict = await prisma.customer.findUnique({ where: { code: input.code } });
      if (conflict) throw AppError.conflict(`رقم العميل «${input.code}» مستخدم بالفعل للعميل: ${conflict.name}`);
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

    const contractCount = customer._count.contracts;
    const invoiceCount = customer._count.invoices;

    if (contractCount > 0 || invoiceCount > 0) {
      const firstCode = customer.contracts[0]?.code ?? null;
      const parts: string[] = [];

      if (contractCount === 1 && firstCode) {
        parts.push(`العقد ${firstCode}`);
      } else if (contractCount > 1 && firstCode) {
        parts.push(`العقد ${firstCode}، و${contractCount - 1} عقود أخرى`);
      } else if (contractCount > 0) {
        parts.push(`${contractCount} عقد`);
      }

      if (invoiceCount === 1) {
        parts.push('فاتورة واحدة');
      } else if (invoiceCount > 1) {
        parts.push(`${invoiceCount} فواتير`);
      }

      throw AppError.conflict(
        `لا يمكن حذف هذا العميل لأنه مستخدم في ${parts.join('، و')} — يمكنك أرشفته بدلاً من ذلك`,
      );
    }

    await customersRepository.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'customers', entityId: id, oldValue: customer });
    return { deleted: true };
  }

  private async getChildCounts(id: number): Promise<ChildCounts & { contractIds: number[] }> {
    const contractRows = await prisma.contract.findMany({
      where: { customerId: id },
      select: { id: true },
    });
    const contractIds = contractRows.map((c) => c.id);

    const [contracts, directInvoices, contractInvoices, expenses, contractDocuments, materialIssues] =
      await Promise.all([
        prisma.contract.count({ where: { customerId: id } }),
        prisma.invoice.count({ where: { customerId: id } }),
        contractIds.length > 0
          ? prisma.invoice.count({ where: { contractId: { in: contractIds } } })
          : Promise.resolve(0),
        contractIds.length > 0
          ? prisma.expense.count({ where: { contractId: { in: contractIds } } })
          : Promise.resolve(0),
        contractIds.length > 0
          ? prisma.contractDocument.count({ where: { contractId: { in: contractIds } } })
          : Promise.resolve(0),
        contractIds.length > 0
          ? prisma.materialIssue.count({ where: { contractId: { in: contractIds } } })
          : Promise.resolve(0),
      ]);

    return { contracts, directInvoices, contractInvoices, expenses, contractDocuments, materialIssues, contractIds };
  }

  async forceRemovePreview(id: number) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw AppError.notFound('العميل غير موجود');
    const { contractIds: _contractIds, ...childCounts } = await this.getChildCounts(id);
    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);
    const invoiceTotal = childCounts.directInvoices + childCounts.contractInvoices;

    const willBeDeleted = ['customer'];
    if (childCounts.contracts > 0) willBeDeleted.push('contracts');
    if (childCounts.contractDocuments > 0) willBeDeleted.push('contractDocuments');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.contractId');
    if (childCounts.materialIssues > 0) willBeNullified.push('materialIssues.contractId');

    return {
      customer,
      childCounts,
      totalChildRecords,
      willBeDeleted,
      willBeNullified,
      ...(invoiceTotal > 0
        ? { blockedReason: `لا يمكن حذف عميل لديه فواتير مسجلة (${invoiceTotal} فاتورة). استخدم الأرشفة بدلاً من ذلك.` }
        : {}),
    };
  }

  async forceRemove(id: number, req: Request) {
    const customer = await prisma.customer.findUnique({ where: { id } });
    if (!customer) throw AppError.notFound('العميل غير موجود');

    const { contractIds, ...childCounts } = await this.getChildCounts(id);
    const invoiceTotal = childCounts.directInvoices + childCounts.contractInvoices;
    if (invoiceTotal > 0) {
      throw AppError.conflict('لا يمكن حذف عميل لديه فواتير مسجلة — استخدم الأرشفة بدلاً من ذلك');
    }

    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);

    const willBeDeleted = ['customer'];
    if (childCounts.contracts > 0) willBeDeleted.push('contracts');
    if (childCounts.contractDocuments > 0) willBeDeleted.push('contractDocuments');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.contractId');
    if (childCounts.materialIssues > 0) willBeNullified.push('materialIssues.contractId');

    await prisma.$transaction(async (tx) => {
      if (contractIds.length > 0) {
        await tx.expense.updateMany({ where: { contractId: { in: contractIds } }, data: { contractId: null } });
        await tx.materialIssue.updateMany({ where: { contractId: { in: contractIds } }, data: { contractId: null } });
        await tx.contract.deleteMany({ where: { customerId: id } });
      }
      await tx.customer.delete({ where: { id } });
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'customers',
      entityId: id,
      oldValue: {
        forceDelete: true,
        deletedEntity: {
          id: customer.id,
          code: customer.code,
          name: customer.name,
        },
        childCounts,
        totalChildRecords,
        willBeDeleted,
        willBeNullified,
      },
    });

    return { deleted: true, impact: { childCounts, totalChildRecords } };
  }
}

export const customersService = new CustomersService();
