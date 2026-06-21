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

function safePct(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 100 * 1000) / 1000;
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
    const conflictContract = await prisma.contract.findUnique({ where: { code: input.code }, select: { asphaltPlant: true } });
    if (conflictContract) {
      throw AppError.conflict(`رقم العقد «${input.code}» مستخدم بالفعل (مصنع الأسفلت: ${conflictContract.asphaltPlant})`);
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

  async getFinancialSummary(contractId: number) {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { customer: { select: { id: true, name: true, type: true } } },
    });
    if (!contract) throw AppError.notFound('العقد غير موجود');

    const [invoices, expenses] = await Promise.all([
      prisma.invoice.findMany({
        where: { contractId, direction: 'SALES', status: { not: 'CANCELLED' } },
        select: {
          id: true, total: true, paidAmount: true, issueDate: true, status: true,
          payments: { select: { id: true, amount: true, date: true } },
        },
        orderBy: { issueDate: 'asc' },
      }),
      prisma.expense.findMany({
        where: { contractId, status: { notIn: ['REJECTED', 'CANCELLED'] } },
        select: { id: true, amount: true, date: true },
        orderBy: { date: 'asc' },
      }),
    ]);

    const n = (v: unknown) => Number(v ?? 0);
    const r3 = (v: number) => Math.round(v * 1000) / 1000;

    // Revenue
    const totalInvoiced = r3(invoices.reduce((s, i) => s + n(i.total), 0));
    const invoiceCount = invoices.length;
    const avgInvoice = invoiceCount > 0 ? r3(totalInvoiced / invoiceCount) : 0;
    const lastInvoiceDateRaw = invoices.length > 0 ? invoices[invoices.length - 1].issueDate : null;

    const monthlyValue = contract.monthlyTransportValue ? n(contract.monthlyTransportValue) : null;
    let contractDurationMonths: number | null = null;
    if (contract.startDate && contract.endDate) {
      const diffMs = new Date(contract.endDate).getTime() - new Date(contract.startDate).getTime();
      contractDurationMonths = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44)));
    }
    const estimatedContractValue =
      monthlyValue && contractDurationMonths ? r3(monthlyValue * contractDurationMonths) : null;
    const remainingToInvoice =
      estimatedContractValue !== null ? r3(estimatedContractValue - totalInvoiced) : null;

    // Collections
    const totalCollected = r3(invoices.reduce((s, i) => s + n(i.paidAmount), 0));
    const outstanding = r3(totalInvoiced - totalCollected);
    const collectionRate = safePct(totalCollected, totalInvoiced);

    let lastPaymentDate: Date | null = null;
    let totalCollectionDays = 0;
    let collectionCount = 0;
    for (const inv of invoices) {
      for (const p of inv.payments) {
        const pd = new Date(p.date);
        if (!lastPaymentDate || pd > lastPaymentDate) lastPaymentDate = pd;
        const diffDays = Math.floor((pd.getTime() - new Date(inv.issueDate).getTime()) / 86_400_000);
        if (diffDays >= 0) { totalCollectionDays += diffDays; collectionCount++; }
      }
    }
    const avgCollectionDays = collectionCount > 0 ? Math.round(totalCollectionDays / collectionCount) : null;

    // Expenses
    const totalExpenses = r3(expenses.reduce((s, e) => s + n(e.amount), 0));
    const expenseCount = expenses.length;
    const lastExpenseDateRaw = expenses.length > 0 ? expenses[expenses.length - 1].date : null;

    // Profitability
    const profit = r3(totalInvoiced - totalExpenses);
    const profitMargin = safePct(profit, totalInvoiced);
    const profitStatus: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED' =
      profit < 0 ? 'RED'
      : profitMargin === null ? 'ORANGE'
      : profitMargin >= 25 ? 'GREEN'
      : profitMargin >= 10 ? 'YELLOW'
      : 'ORANGE';

    // Progress
    const billingProgress = safePct(totalInvoiced, estimatedContractValue ?? 0);
    const collectionProgress = safePct(totalCollected, totalInvoiced);
    const expenseRatio = safePct(totalExpenses, totalInvoiced);

    // Monthly chart data
    const monthlyMap = new Map<string, { invoiced: number; collected: number; expenses: number }>();
    const getM = (key: string) => {
      if (!monthlyMap.has(key)) monthlyMap.set(key, { invoiced: 0, collected: 0, expenses: 0 });
      return monthlyMap.get(key)!;
    };
    for (const inv of invoices) {
      const d = new Date(inv.issueDate);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      getM(k).invoiced = r3(getM(k).invoiced + n(inv.total));
      for (const p of inv.payments) {
        const pd = new Date(p.date);
        const pk = `${pd.getFullYear()}-${String(pd.getMonth() + 1).padStart(2, '0')}`;
        getM(pk).collected = r3(getM(pk).collected + n(p.amount));
      }
    }
    for (const exp of expenses) {
      const d = new Date(exp.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      getM(k).expenses = r3(getM(k).expenses + n(exp.amount));
    }
    const monthlyData = [...monthlyMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, ...data }));

    return {
      contract: {
        id: contract.id,
        code: contract.code,
        asphaltPlant: contract.asphaltPlant,
        location: contract.location,
        status: contract.status,
        startDate: contract.startDate,
        endDate: contract.endDate,
        monthlyTransportValue: monthlyValue,
        price: contract.price ? n(contract.price) : null,
        unitName: contract.unitName,
        companyName: contract.companyName,
        customer: contract.customer,
        contractDurationMonths,
      },
      revenue: { totalInvoiced, invoiceCount, avgInvoice, lastInvoiceDate: lastInvoiceDateRaw, estimatedContractValue, remainingToInvoice },
      collections: { totalCollected, outstanding, collectionRate, lastPaymentDate, avgCollectionDays },
      expenses: { totalExpenses, expenseCount, lastExpenseDate: lastExpenseDateRaw },
      profitability: { profit, profitMargin, profitMarginBasis: 'INVOICED_REVENUE' as const, profitStatus, revenue: totalInvoiced, expenses: totalExpenses },
      progress: { billingProgress, collectionProgress, expenseRatio },
      monthlyData,
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
