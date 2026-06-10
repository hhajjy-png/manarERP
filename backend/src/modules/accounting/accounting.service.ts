import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../config/database';
import { recordAudit } from '../../core/middleware/audit';
import { buildPaginatedResult, getPagination, PaginationQuery } from '../../core/utils/pagination';
import { validateJournalBalance } from './accounting.utils';

export interface AccountInput {
  code: string;
  name: string;
  type: string;
  normalBalance?: string;
  isActive?: boolean;
  parentId?: number | null;
  notes?: string;
}

export interface JournalEntryInput {
  date?: Date;
  description: string;
  referenceType?: string;
  referenceId?: number;
  lines: { accountId: number; description?: string; debit?: number; credit?: number }[];
}

// ─── Accounts ────────────────────────────────────────────────────────────────

export class AccountingService {
  async generateJournalNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `JRN-${year}-`;
    const count = await prisma.journalEntry.count({ where: { entryNumber: { startsWith: prefix } } });
    return `${prefix}${String(count + 1).padStart(5, '0')}`;
  }

  // Chart of Accounts
  async listAccounts(query: PaginationQuery & { type?: string; isActive?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.AccountWhereInput = {};
    if (query.type) where.type = query.type;
    if (query.isActive !== undefined) where.isActive = query.isActive !== 'false';
    if (query.search) where.name = { contains: query.search };

    const [data, total] = await Promise.all([
      prisma.account.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { code: 'asc' },
        include: { parent: { select: { code: true, name: true } } },
      }),
      prisma.account.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async createAccount(input: AccountInput, req: Request) {
    const account = await prisma.account.create({ data: { ...input, normalBalance: input.normalBalance ?? 'DEBIT' } });
    await recordAudit({ req, action: 'CREATE', module: 'accounting', entityId: account.id, newValue: input });
    return account;
  }

  async updateAccount(id: number, input: Partial<AccountInput>, req: Request) {
    const old = await prisma.account.findUniqueOrThrow({ where: { id } });
    const account = await prisma.account.update({ where: { id }, data: input });
    await recordAudit({ req, action: 'UPDATE', module: 'accounting', entityId: id, oldValue: old, newValue: input });
    return account;
  }

  async deleteAccount(id: number, req: Request) {
    const used = await prisma.journalEntryLine.count({ where: { accountId: id } });
    if (used > 0) throw new Error('لا يمكن حذف حساب مرتبط بقيود محاسبية');
    const account = await prisma.account.delete({ where: { id } });
    await recordAudit({ req, action: 'DELETE', module: 'accounting', entityId: id, oldValue: account });
    return account;
  }

  // Journal Entries
  async listJournalEntries(query: PaginationQuery & { from?: string; to?: string; status?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.JournalEntryWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.search) where.description = { contains: query.search };
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { date: 'desc' },
        include: { lines: { include: { account: { select: { code: true, name: true } } } } },
      }),
      prisma.journalEntry.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  async createJournalEntry(input: JournalEntryInput, req: Request) {
    validateJournalBalance(input.lines);

    const entryNumber = await this.generateJournalNumber();
    const entry = await prisma.journalEntry.create({
      data: {
        entryNumber,
        date: input.date ?? new Date(),
        description: input.description,
        referenceType: input.referenceType ?? 'MANUAL',
        referenceId: input.referenceId ?? null,
        status: 'POSTED',
        lines: {
          create: input.lines.map((l) => ({
            accountId: l.accountId,
            description: l.description ?? null,
            debit: l.debit ?? 0,
            credit: l.credit ?? 0,
          })),
        },
      },
      include: { lines: { include: { account: true } } },
    });
    await recordAudit({ req, action: 'CREATE', module: 'accounting', entityId: entry.id, newValue: input });
    return entry;
  }

  async cancelJournalEntry(id: number, req: Request) {
    const entry = await prisma.journalEntry.findUniqueOrThrow({ where: { id } });
    if (entry.status === 'CANCELLED') throw new Error('القيد ملغى بالفعل');
    if (entry.referenceType !== 'MANUAL') throw new Error('لا يمكن إلغاء قيد مرتبط بمستند');
    const updated = await prisma.journalEntry.update({ where: { id }, data: { status: 'CANCELLED' } });
    await recordAudit({ req, action: 'UPDATE', module: 'accounting', entityId: id, oldValue: entry, newValue: { status: 'CANCELLED' } });
    return updated;
  }

  // Payments list (from existing Payment model tied to invoices)
  async listPayments(query: PaginationQuery & { method?: string; from?: string; to?: string }) {
    const pagination = getPagination(query);
    const where: Prisma.PaymentWhereInput = {};
    if (query.method) where.method = query.method;
    if (query.from || query.to) {
      where.date = {};
      if (query.from) where.date.gte = new Date(query.from);
      if (query.to) where.date.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      prisma.payment.findMany({
        where,
        skip: pagination.skip,
        take: pagination.take,
        orderBy: { date: 'desc' },
        include: { invoice: { select: { invoiceNumber: true, direction: true } } },
      }),
      prisma.payment.count({ where }),
    ]);
    return buildPaginatedResult(data, total, pagination);
  }

  // Financial Summary
  async financialSummary(from?: string, to?: string) {
    const dateFilter: Prisma.DateTimeFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const hasDateFilter = from || to;

    const [invoiceRevenue, expenseTotal, paymentTotal, journalTotals] = await Promise.all([
      prisma.invoice.aggregate({
        where: { direction: 'SALES', status: { not: 'CANCELLED' }, ...(hasDateFilter ? { issueDate: dateFilter } : {}) },
        _sum: { total: true, paidAmount: true },
      }),
      prisma.expense.aggregate({
        where: { status: 'APPROVED', ...(hasDateFilter ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      prisma.payment.aggregate({
        where: { ...(hasDateFilter ? { date: dateFilter } : {}) },
        _sum: { amount: true },
      }),
      prisma.journalEntry.findMany({
        where: { status: 'POSTED', ...(hasDateFilter ? { date: dateFilter } : {}) },
        include: { lines: { select: { debit: true, credit: true } } },
      }),
    ]);

    const totalJournalDebit = journalTotals.reduce((s, e) => s + e.lines.reduce((ls, l) => ls + l.debit, 0), 0);
    const totalJournalCredit = journalTotals.reduce((s, e) => s + e.lines.reduce((ls, l) => ls + l.credit, 0), 0);

    return {
      totalRevenue: invoiceRevenue._sum.total ?? 0,
      totalCollected: invoiceRevenue._sum.paidAmount ?? 0,
      totalExpenses: expenseTotal._sum.amount ?? 0,
      totalPaymentsRecorded: paymentTotal._sum.amount ?? 0,
      journalEntryCount: journalTotals.length,
      totalJournalDebit,
      totalJournalCredit,
      netProfit: (invoiceRevenue._sum.paidAmount ?? 0) - (expenseTotal._sum.amount ?? 0),
    };
  }
}

export const accountingService = new AccountingService();
