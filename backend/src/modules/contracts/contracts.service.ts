import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { contractsRepository } from './contracts.repository';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { CreateContractInput, UpdateContractInput } from './contracts.schema';

interface ContractQuery extends PaginationQuery {
  status?: string;
  customerId?: string;
}

interface ChildCounts {
  invoices: number;
  expenses: number;
  materialIssues: number;
  contractDocuments: number;
}

export class ContractsService {
  async list(query: ContractQuery) {
    const pagination = getPagination(query);
    const where: Prisma.ContractWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.customerId) where.customerId = Number(query.customerId);
    if (query.search) {
      where.OR = [
        { code: { contains: query.search } },
        { asphaltPlant: { contains: query.search } },
        { location: { contains: query.search } },
      ];
    }

    const [data, total] = await contractsRepository.listWithRelations(where, pagination.skip, pagination.take);
    return buildPaginatedResult(data, total, pagination);
  }

  /** ملخص قيمة النقل الشهري للعقود السارية (للوحة التحكم). */
  async monthlyTransportSummary() {
    const [activeAgg, all] = await Promise.all([
      prisma.contract.aggregate({ where: { status: 'ACTIVE' }, _sum: { monthlyTransportValue: true }, _count: { _all: true } }),
      prisma.contract.count(),
    ]);
    return {
      totalContracts: all,
      activeContracts: activeAgg._count._all,
      monthlyTransportTotal: activeAgg._sum.monthlyTransportValue ?? 0,
    };
  }

  /** تفاصيل العقد + تحليل الربحية. */
  async getById(id: number) {
    const contract = await contractsRepository.findFull(id);
    if (!contract) throw AppError.notFound('العقد غير موجود');
    const financials = await contractsRepository.financials(id);
    return { ...contract, financials };
  }

  private async assertCustomerExists(customerId?: number) {
    if (!customerId) return;
    const exists = await prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!exists) throw AppError.badRequest('العميل المحدد غير موجود');
  }

  async create(input: CreateContractInput, req: Request) {
    if (await contractsRepository.exists({ code: input.code })) {
      throw AppError.conflict('رقم العقد مُستخدم من قبل');
    }
    await this.assertCustomerExists(input.customerId);

    const contract = await contractsRepository.create(input);
    await recordAudit({ req, action: 'CREATE', module: 'contracts', entityId: contract.id, newValue: input });
    return contract;
  }

  async update(id: number, input: UpdateContractInput, req: Request) {
    const current = await contractsRepository.findById(id);
    if (!current) throw AppError.notFound('العقد غير موجود');
    await this.assertCustomerExists(input.customerId);

    const contract = await contractsRepository.update(id, input);
    await recordAudit({ req, action: 'UPDATE', module: 'contracts', entityId: id, oldValue: current, newValue: input });
    return contract;
  }

  async remove(id: number, req: Request) {
    const contract = await contractsRepository.findFull(id);
    if (!contract) throw AppError.notFound('العقد غير موجود');
    if (contract._count.invoices > 0 || contract._count.expenses > 0) {
      throw AppError.conflict('لا يمكن حذف عقد مرتبط بفواتير أو مصروفات');
    }
    await contractsRepository.delete(id);
    await recordAudit({ req, action: 'DELETE', module: 'contracts', entityId: id, oldValue: contract });
    return { deleted: true };
  }

  private async getChildCounts(id: number): Promise<ChildCounts> {
    const [invoices, expenses, materialIssues, contractDocuments] = await Promise.all([
      prisma.invoice.count({ where: { contractId: id } }),
      prisma.expense.count({ where: { contractId: id } }),
      prisma.materialIssue.count({ where: { contractId: id } }),
      prisma.contractDocument.count({ where: { contractId: id } }),
    ]);
    return { invoices, expenses, materialIssues, contractDocuments };
  }

  async forceRemovePreview(id: number) {
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract) throw AppError.notFound('العقد غير موجود');

    const childCounts = await this.getChildCounts(id);
    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);

    const willBeDeleted = ['contract'];
    if (childCounts.contractDocuments > 0) willBeDeleted.push('contractDocuments');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.contractId');
    if (childCounts.materialIssues > 0) willBeNullified.push('materialIssues.contractId');

    let blockedReason: string | undefined;
    if (childCounts.invoices > 0) {
      blockedReason = `لا يمكن حذف عقد لديه فواتير مسجلة (${childCounts.invoices} ${childCounts.invoices === 1 ? 'فاتورة' : 'فواتير'}) — عدّل حالة العقد بدلاً من ذلك`;
    }

    return {
      contract,
      childCounts,
      totalChildRecords,
      willBeDeleted,
      willBeNullified,
      ...(blockedReason ? { blockedReason } : {}),
    };
  }

  async forceRemove(id: number, req: Request) {
    const contract = await prisma.contract.findUnique({ where: { id } });
    if (!contract) throw AppError.notFound('العقد غير موجود');

    const childCounts = await this.getChildCounts(id);

    if (childCounts.invoices > 0) {
      throw AppError.conflict('لا يمكن حذف عقد لديه فواتير مسجلة — عدّل حالة العقد بدلاً من ذلك');
    }

    const totalChildRecords = Object.values(childCounts).reduce((a, b) => a + b, 0);

    const willBeDeleted = ['contract'];
    if (childCounts.contractDocuments > 0) willBeDeleted.push('contractDocuments');

    const willBeNullified: string[] = [];
    if (childCounts.expenses > 0) willBeNullified.push('expenses.contractId');
    if (childCounts.materialIssues > 0) willBeNullified.push('materialIssues.contractId');

    await prisma.$transaction(async (tx) => {
      if (childCounts.expenses > 0) {
        await tx.expense.updateMany({ where: { contractId: id }, data: { contractId: null } });
      }
      if (childCounts.materialIssues > 0) {
        await tx.materialIssue.updateMany({ where: { contractId: id }, data: { contractId: null } });
      }
      await tx.contract.delete({ where: { id } });
    });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'contracts',
      entityId: id,
      oldValue: {
        forceDelete: true,
        deletedEntity: { id: contract.id, code: contract.code, asphaltPlant: contract.asphaltPlant, status: contract.status },
        childCounts,
        totalChildRecords,
        willBeDeleted,
        willBeNullified,
      },
    });

    return { deleted: true, impact: { childCounts, totalChildRecords } };
  }
}

export const contractsService = new ContractsService();
