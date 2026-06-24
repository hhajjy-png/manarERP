import { buildStatement }              from '@shared/services/statement.service';
import { buildExcel }                  from '@shared/services/reportEngine/excel.service';
import { buildPdf }                    from '@shared/services/reportEngine/pdf.service';
import { wrapFinancialResponse }       from '@shared/services/financial/financial.response';
import { buildDrillDownRef }           from '@shared/services/financial/drilldown.utils';
import type { DrillDownRef }           from '@shared/services/financial/drilldown.utils';
import { normalizeMoney, calculateRunningBalances, calculateClosingBalance, sumDebitCredit } from '@shared/services/financial/balance.utils';
import { sanitizeFilters }             from '@shared/services/financial/summary.utils';
import { calculateAgingBuckets, DEFAULT_AGING_BUCKETS } from '@shared/services/financial/aging.utils';
import { toStatementReportInput }      from '@shared/services/financial/export/statement.export.adapter';
import { toAgingReportInput }          from '@shared/services/financial/export/aging.export.adapter';
import { toGlStatementReportInput, toGlReportInput } from '@shared/services/financial/export/gl.export.adapter';
import { toTrialBalanceReportInput }   from '@shared/services/financial/export/trial.export.adapter';
import { toJournalBookReportInput }    from '@shared/services/financial/export/journal.export.adapter';
import { AccountingService }           from '@modules/accounting/accounting.service';
import { prisma }                      from '@config/database';
import type {
  FinancialResponse, StatementRow, ArAgingRow, ApAgingRow,
  GlStatementRow, GlReportAccount, GlReportResponse,
  TrialBalanceAsOfRow, TrialBalancePeriodRow, JournalBookRow,
} from '@shared/services/financial/financial.types';

const accountingService = new AccountingService();

export class FinancialService {

  // ─── Statement ─────────────────────────────────────────────────────────────

  async getStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string; status?: string }
  ): Promise<FinancialResponse<StatementRow>> {

    const result = await buildStatement({
      entityType: entityType.toUpperCase() as 'CUSTOMER' | 'SUPPLIER',
      entityId,
      filters: {
        fromDate:      filters.fromDate  ? new Date(filters.fromDate)  : undefined,
        toDate:        filters.toDate    ? new Date(filters.toDate)    : undefined,
        search:        filters.search,
        referenceType: filters.referenceType as 'INVOICE' | 'PAYMENT' | 'EXPENSE' | undefined,
        status:        filters.status,
      },
    });

    const rows: StatementRow[] = result.entries.map(entry => ({
      // M4 FIX: timestamp fallback prevents 'STMT-INVOICE-undefined' for entries without referenceId
      id: `STMT-${entry.referenceType}-${entry.referenceId ?? new Date(entry.date).getTime()}`,
      date:           entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
      reference:      entry.reference,
      referenceType:  entry.referenceType,
      referenceId:    entry.referenceId,
      description:    entry.description,
      debit:          normalizeMoney(entry.debit),
      credit:         normalizeMoney(entry.credit),
      runningBalance: normalizeMoney(entry.runningBalance),
      status:         entry.status,
      drillDown: entry.referenceId
        ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
        : undefined,
    }));

    return wrapFinancialResponse<StatementRow>({
      reportType: 'statement',
      summary: {
        openingBalance:   normalizeMoney(result.summary.openingBalance),
        totalDebit:       normalizeMoney(result.summary.totalDebit),
        totalCredit:      normalizeMoney(result.summary.totalCredit),
        closingBalance:   normalizeMoney(result.summary.closingBalance),
        transactionCount: rows.length,
      },
      metadata: {
        entityType:  result.entityType,
        entityName:  result.entityName,
        entityCode:  result.entityCode,
        fromDate:    filters.fromDate,
        toDate:      filters.toDate,
      },
      filters: sanitizeFilters(filters as Record<string, unknown>),
      rows,
      totals: {
        id:             'TOTALS',
        description:    'الإجمالي',
        debit:          normalizeMoney(result.summary.totalDebit),
        credit:         normalizeMoney(result.summary.totalCredit),
        runningBalance: normalizeMoney(result.summary.closingBalance),
      } as Partial<StatementRow>,
    });
  }

  async exportStatement(
    entityType: string,
    entityId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string },
    format: 'pdf' | 'excel'
  ): Promise<Buffer> {
    const data       = await this.getStatement(entityType, entityId, filters);
    const entityName = String(data.metadata?.entityName ?? '');
    const input      = toStatementReportInput(data, entityName);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── AR Aging ─────────────────────────────────────────────────────────────

  async getArAging(filters: {
    asOfDate?:    string;
    search?:      string;
    customerType?: string;
    hideZero?:    boolean;
  }): Promise<FinancialResponse<ArAgingRow>> {
    const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

    const customers = await prisma.customer.findMany({
      where: {
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search } },
            { code: { contains: filters.search } },
          ],
        }),
        ...(filters.customerType && { type: filters.customerType as 'GOVERNMENT' | 'PRIVATE' }),
      },
      select: {
        id: true, code: true, name: true,
        invoices: {
          where: {
            direction: 'SALES',
            status:    { notIn: ['PAID', 'CANCELLED'] },
          },
          select: {
            id: true, dueDate: true, issueDate: true,
            total: true, paidAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const validRows: ArAgingRow[] = [];

    for (const customer of customers) {
      const outstanding = customer.invoices
        .map(inv => ({
          dueDate:           inv.dueDate ?? inv.issueDate,
          outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
        }))
        .filter(o => o.outstandingAmount > 0);

      const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

      if (filters.hideZero && buckets.total === 0) continue;

      const lastInvoiceDate = customer.invoices
        .map(inv => inv.issueDate)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      validRows.push({
        id:              `AR-${customer.id}`,
        customerId:      customer.id,
        customerCode:    customer.code,
        customerName:    customer.name,
        current:         buckets['current']  ?? 0,
        '0_30':          buckets['0_30']     ?? 0,
        '31_60':         buckets['31_60']    ?? 0,
        '61_90':         buckets['61_90']    ?? 0,
        '91_120':        buckets['91_120']   ?? 0,
        over_120:        buckets['over_120'] ?? 0,
        total:           buckets.total,
        lastInvoiceDate: lastInvoiceDate?.toISOString(),
        invoiceCount:    customer.invoices.length,
        drillDown:       buildDrillDownRef('CUSTOMER', customer.id, customer.name),
      });
    }

    const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
    const criticalOver90   = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

    return wrapFinancialResponse<ArAgingRow>({
      reportType: 'ar-aging',
      summary:    { totalOutstanding, criticalOver90, entityCount: validRows.length },
      metadata:   { asOfDate: asOfDate.toISOString() },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows:       validRows,
    });
  }

  async exportArAging(
    filters: { asOfDate?: string; search?: string; customerType?: string; hideZero?: boolean },
    format:  'pdf' | 'excel'
  ): Promise<Buffer> {
    const data  = await this.getArAging(filters);
    const input = toAgingReportInput(data, 'ar');
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── AP Aging ─────────────────────────────────────────────────────────────

  async getApAging(filters: {
    asOfDate?: string;
    search?:   string;
    hideZero?: boolean;
  }): Promise<FinancialResponse<ApAgingRow>> {
    const asOfDate = filters.asOfDate ? new Date(filters.asOfDate) : new Date();

    const suppliers = await prisma.supplier.findMany({
      where: {
        ...(filters.search && {
          OR: [
            { name: { contains: filters.search } },
            { code: { contains: filters.search } },
          ],
        }),
      },
      select: {
        id: true, code: true, name: true,
        invoices: {
          where: {
            direction: 'PURCHASE',
            status:    { notIn: ['PAID', 'CANCELLED'] },
          },
          select: {
            id: true, dueDate: true, issueDate: true,
            total: true, paidAmount: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    const validRows: ApAgingRow[] = [];

    for (const supplier of suppliers) {
      const outstanding = supplier.invoices
        .map(inv => ({
          dueDate:           inv.dueDate ?? inv.issueDate,
          outstandingAmount: normalizeMoney(inv.total - inv.paidAmount),
        }))
        .filter(o => o.outstandingAmount > 0);

      const buckets = calculateAgingBuckets(outstanding, asOfDate, DEFAULT_AGING_BUCKETS);

      if (filters.hideZero && buckets.total === 0) continue;

      const lastInvoiceDate = supplier.invoices
        .map(inv => inv.issueDate)
        .sort((a, b) => b.getTime() - a.getTime())[0];

      validRows.push({
        id:              `AP-${supplier.id}`,
        supplierId:      supplier.id,
        supplierCode:    supplier.code,
        supplierName:    supplier.name,
        current:         buckets['current']  ?? 0,
        '0_30':          buckets['0_30']     ?? 0,
        '31_60':         buckets['31_60']    ?? 0,
        '61_90':         buckets['61_90']    ?? 0,
        '91_120':        buckets['91_120']   ?? 0,
        over_120:        buckets['over_120'] ?? 0,
        total:           buckets.total,
        lastInvoiceDate: lastInvoiceDate?.toISOString(),
        invoiceCount:    supplier.invoices.length,
        drillDown:       buildDrillDownRef('SUPPLIER', supplier.id, supplier.name),
      });
    }

    const totalOutstanding = normalizeMoney(validRows.reduce((s, r) => s + r.total, 0));
    const criticalOver90   = normalizeMoney(validRows.reduce((s, r) => s + r.over_120 + r['91_120'], 0));

    return wrapFinancialResponse<ApAgingRow>({
      reportType: 'ap-aging',
      summary:    { totalOutstanding, criticalOver90, entityCount: validRows.length },
      metadata:   { asOfDate: asOfDate.toISOString() },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows:       validRows,
    });
  }

  async exportApAging(
    filters: { asOfDate?: string; search?: string; hideZero?: boolean },
    format:  'pdf' | 'excel'
  ): Promise<Buffer> {
    const data  = await this.getApAging(filters);
    const input = toAgingReportInput(data, 'ap');
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── GL Statement ──────────────────────────────────────────────────────────

  async getGlStatement(
    accountId: number,
    filters: { fromDate?: string; toDate?: string; search?: string; status?: string; page?: number; pageSize?: number }
  ): Promise<FinancialResponse<GlStatementRow>> {

    const account = await prisma.account.findUniqueOrThrow({
      where:   { id: accountId },
      include: { parent: { select: { code: true, name: true } } },
    });

    const openingAgg = await prisma.journalEntryLine.aggregate({
      where: {
        accountId,
        journalEntry: {
          status: 'POSTED',
          ...(filters.fromDate && { date: { lt: new Date(filters.fromDate) } }),
        },
      },
      _sum: { debit: true, credit: true },
    });
    const openingBalance = normalizeMoney(
      (openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0)
    );

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        journalEntry: {
          status: filters.status ? filters.status : { not: 'CANCELLED' },
          ...(filters.fromDate && { date: { gte: new Date(filters.fromDate) } }),
          ...(filters.toDate   && { date: { lte: new Date(filters.toDate)   } }),
          ...(filters.search && {
            OR: [
              { entryNumber: { contains: filters.search } },
              { description: { contains: filters.search } },
            ],
          }),
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true, entryNumber: true, date: true, description: true,
            referenceType: true, referenceId: true, status: true,
          },
        },
      },
      orderBy: { journalEntry: { date: 'asc' } },
      ...(filters.page && filters.pageSize && {
        skip: (filters.page - 1) * filters.pageSize,
        take: filters.pageSize,
      }),
    });

    const flatLines = lines.map(l => ({
      id:             `JEL-${l.id}`,
      date:           l.journalEntry.date.toISOString(),
      journalNumber:  l.journalEntry.entryNumber,
      journalEntryId: l.journalEntry.id,
      referenceType:  l.journalEntry.referenceType ?? 'MANUAL',
      referenceId:    l.journalEntry.referenceId ?? undefined,
      description:    l.description ?? l.journalEntry.description,
      debit:          normalizeMoney(l.debit),
      credit:         normalizeMoney(l.credit),
      status:         l.journalEntry.status,
    }));

    const rowsWithBalance = calculateRunningBalances(openingBalance, flatLines);
    const { totalDebit, totalCredit } = sumDebitCredit(flatLines);
    const closingBalance = calculateClosingBalance(openingBalance, totalDebit, totalCredit);

    const rows: GlStatementRow[] = rowsWithBalance.map(r => ({
      ...r,
      drillDown: r.referenceType !== 'MANUAL' && r.referenceId
        ? buildDrillDownRef(r.referenceType as DrillDownRef['entityType'], r.referenceId)
        : buildDrillDownRef('JOURNAL_ENTRY', r.journalEntryId, `قيد ${r.journalNumber}`),
    }));

    return wrapFinancialResponse<GlStatementRow>({
      reportType: 'gl-statement',
      summary:    { openingBalance, totalDebit, totalCredit, closingBalance, transactionCount: rows.length },
      metadata: {
        accountId,
        accountCode:   account.code,
        accountName:   account.name,
        accountType:   account.type,
        normalBalance: account.normalBalance ?? 'DEBIT',
        fromDate:      filters.fromDate,
        toDate:        filters.toDate,
      },
      filters: sanitizeFilters(filters as Record<string, unknown>),
      rows,
      totals: {
        id:             'TOTALS',
        description:    'الإجمالي',
        debit:          totalDebit,
        credit:         totalCredit,
        runningBalance: closingBalance,
      } as Partial<GlStatementRow>,
    });
  }

  async exportGlStatement(accountId: number, filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
    const data  = await this.getGlStatement(accountId, filters as Parameters<typeof this.getGlStatement>[1]);
    const input = toGlStatementReportInput(data);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── GL Report ─────────────────────────────────────────────────────────────

  async getGlReport(filters: {
    fromDate?:    string;
    toDate?:      string;
    accountType?: string;
    page?:        number;
    pageSize?:    number;
  }): Promise<GlReportResponse> {
    const page     = filters.page     ?? 1;
    const pageSize = filters.pageSize ?? 20;

    const allAccounts = await prisma.account.findMany({
      where:   { isActive: true, ...(filters.accountType && { type: filters.accountType }) },
      orderBy: { code: 'asc' },
    });

    const total             = allAccounts.length;
    const paginatedAccounts = allAccounts.slice((page - 1) * pageSize, page * pageSize);

    const accounts: GlReportAccount[] = await Promise.all(
      paginatedAccounts.map(async account => {
        const [openingAgg, periodAgg] = await Promise.all([
          prisma.journalEntryLine.aggregate({
            where: {
              accountId: account.id,
              journalEntry: {
                status: 'POSTED',
                ...(filters.fromDate && { date: { lt: new Date(filters.fromDate) } }),
              },
            },
            _sum: { debit: true, credit: true },
          }),
          prisma.journalEntryLine.aggregate({
            where: {
              accountId: account.id,
              journalEntry: {
                status: 'POSTED',
                ...(filters.fromDate && { date: { gte: new Date(filters.fromDate) } }),
                ...(filters.toDate   && { date: { lte: new Date(filters.toDate)   } }),
              },
            },
            _sum: { debit: true, credit: true },
          }),
        ]);

        const openingBalance = normalizeMoney((openingAgg._sum.debit ?? 0) - (openingAgg._sum.credit ?? 0));
        const totalDebit     = normalizeMoney(periodAgg._sum.debit  ?? 0);
        const totalCredit    = normalizeMoney(periodAgg._sum.credit ?? 0);

        return {
          accountId:     account.id,
          accountCode:   account.code,
          accountName:   account.name,
          accountType:   account.type,
          normalBalance: (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
          openingBalance,
          totalDebit,
          totalCredit,
          closingBalance: calculateClosingBalance(openingBalance, totalDebit, totalCredit),
          rows: [],
        };
      })
    );

    return {
      generatedAt: new Date().toISOString(),
      filters:     sanitizeFilters(filters as Record<string, unknown>),
      accounts,
      summary:    { totalAccounts: total, fromDate: filters.fromDate, toDate: filters.toDate },
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    };
  }

  async exportGlReport(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
    const data  = await this.getGlReport(filters as Parameters<typeof this.getGlReport>[0]);
    const input = toGlReportInput(data);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── Trial Balance ─────────────────────────────────────────────────────────

  async getTrialBalance(filters: {
    mode:              'as-of' | 'period';
    asOfDate?:         string;
    fromDate?:         string;
    toDate?:           string;
    showZeroBalances?: boolean;
    accountType?:      string;
  }): Promise<FinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>> {
    const { mode, asOfDate, fromDate, toDate, showZeroBalances, accountType } = filters;

    if (mode === 'as-of') {
      const effectiveDate = asOfDate ? new Date(asOfDate) : new Date();

      const [grouped, allAccounts] = await Promise.all([
        prisma.journalEntryLine.groupBy({
          by:    ['accountId'],
          where: { journalEntry: { status: 'POSTED', date: { lte: effectiveDate } } },
          _sum:  { debit: true, credit: true },
        }),
        prisma.account.findMany({
          where:   { isActive: true, ...(accountType && { type: accountType }) },
          orderBy: { code: 'asc' },
        }),
      ]);

      const groupedIds      = new Set(grouped.map(g => g.accountId));
      const relevantAccounts = showZeroBalances
        ? allAccounts
        : allAccounts.filter(a => groupedIds.has(a.id));

      const rows: TrialBalanceAsOfRow[] = relevantAccounts.map(account => {
        const agg         = grouped.find(g => g.accountId === account.id);
        const totalDebit  = normalizeMoney(agg?._sum.debit  ?? 0);
        const totalCredit = normalizeMoney(agg?._sum.credit ?? 0);
        const balance     = normalizeMoney(totalDebit - totalCredit);
        return {
          id:            `TB-${account.id}`,
          accountId:     account.id,
          accountCode:   account.code,
          accountName:   account.name,
          accountType:   account.type,
          normalBalance: (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
          totalDebit,
          totalCredit,
          balance,
          balanceType:   balance >= 0 ? 'DEBIT' : 'CREDIT',
          drillDown:     buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
        };
      });

      const totalD     = normalizeMoney(rows.reduce((s, r) => s + r.totalDebit,  0));
      const totalC     = normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0));
      const difference = normalizeMoney(Math.abs(totalD - totalC));
      const isBalanced = difference < 0.001;

      return wrapFinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>({
        reportType: 'trial-balance',
        summary:    { totalDebit: totalD, totalCredit: totalC },
        metadata:   { mode: 'as-of', asOfDate: effectiveDate.toISOString(), isBalanced, difference },
        filters:    sanitizeFilters(filters as Record<string, unknown>),
        rows,
        totals: {
          id:          'TOTALS',
          accountName: 'الإجمالي',
          totalDebit:  totalD,
          totalCredit: totalC,
        } as Partial<TrialBalanceAsOfRow>,
      });
    }

    // Period mode
    if (!fromDate || !toDate) throw new Error('fromDate and toDate are required for period mode');

    const [openingGrouped, periodGrouped, allAccounts] = await Promise.all([
      prisma.journalEntryLine.groupBy({
        by:    ['accountId'],
        where: { journalEntry: { status: 'POSTED', date: { lt: new Date(fromDate) } } },
        _sum:  { debit: true, credit: true },
      }),
      prisma.journalEntryLine.groupBy({
        by:    ['accountId'],
        where: { journalEntry: { status: 'POSTED', date: { gte: new Date(fromDate), lte: new Date(toDate) } } },
        _sum:  { debit: true, credit: true },
      }),
      prisma.account.findMany({
        where:   { isActive: true, ...(accountType && { type: accountType }) },
        orderBy: { code: 'asc' },
      }),
    ]);

    const activeIds       = new Set([...openingGrouped.map(g => g.accountId), ...periodGrouped.map(g => g.accountId)]);
    const relevantAccounts = showZeroBalances ? allAccounts : allAccounts.filter(a => activeIds.has(a.id));

    const rows: TrialBalancePeriodRow[] = relevantAccounts.map(account => {
      const openD = openingGrouped.find(g => g.accountId === account.id)?._sum.debit  ?? 0;
      const openC = openingGrouped.find(g => g.accountId === account.id)?._sum.credit ?? 0;
      const perD  = periodGrouped.find(g  => g.accountId === account.id)?._sum.debit  ?? 0;
      const perC  = periodGrouped.find(g  => g.accountId === account.id)?._sum.credit ?? 0;
      const openingBalance = normalizeMoney(openD - openC);
      const periodDebit    = normalizeMoney(perD);
      const periodCredit   = normalizeMoney(perC);
      return {
        id:             `TB-${account.id}`,
        accountId:      account.id,
        accountCode:    account.code,
        accountName:    account.name,
        accountType:    account.type,
        normalBalance:  (account.normalBalance ?? 'DEBIT') as 'DEBIT' | 'CREDIT',
        openingBalance,
        periodDebit,
        periodCredit,
        closingBalance: calculateClosingBalance(openingBalance, periodDebit, periodCredit),
        drillDown:      buildDrillDownRef('GL_ACCOUNT', account.id, account.name),
      };
    });

    const totalPD    = normalizeMoney(rows.reduce((s, r) => s + r.periodDebit,  0));
    const totalPC    = normalizeMoney(rows.reduce((s, r) => s + r.periodCredit, 0));
    const difference = normalizeMoney(Math.abs(totalPD - totalPC));
    const isBalanced = difference < 0.001;

    return wrapFinancialResponse<TrialBalanceAsOfRow | TrialBalancePeriodRow>({
      reportType: 'trial-balance',
      summary:    { totalDebit: totalPD, totalCredit: totalPC },
      metadata:   { mode: 'period', fromDate, toDate, isBalanced, difference },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows,
      totals: {
        id:           'TOTALS',
        accountName:  'الإجمالي',
        periodDebit:  totalPD,
        periodCredit: totalPC,
      } as Partial<TrialBalancePeriodRow>,
    });
  }

  async exportTrialBalance(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
    const data  = await this.getTrialBalance(filters as Parameters<typeof this.getTrialBalance>[0]);
    const input = toTrialBalanceReportInput(data);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }

  // ─── Journal Book ──────────────────────────────────────────────────────────

  async getJournalBook(filters: {
    fromDate?:      string;
    toDate?:        string;
    status?:        string;
    referenceType?: string;
    search?:        string;
    page?:          number;
    pageSize?:      number;
  }): Promise<FinancialResponse<JournalBookRow>> {
    const page     = filters.page     ?? 1;
    const pageSize = filters.pageSize ?? 50;

    // Orchestrator pattern — delegates to existing accountingService
    // Note: listJournalEntries uses `from`/`to` for dates, not `fromDate`/`toDate`
    const result = await accountingService.listJournalEntries({
      page,
      pageSize,
      status: filters.status,
      search: filters.search,
      from:   filters.fromDate,
      to:     filters.toDate,
    });

    const entries = result.data;
    const total   = result.meta.total;

    type JournalLine = { account: { code: string; name: string }; description?: string | null; debit: number; credit: number };
    type JournalEntry = {
      id: number; entryNumber: string; date: Date | string;
      description: string; referenceType?: string | null; referenceId?: number | null;
      status: string; lines: JournalLine[];
    };

    const rows: JournalBookRow[] = (entries as JournalEntry[]).map(entry => ({
      id:            `JE-${entry.id}`,
      entryNumber:   entry.entryNumber,
      date:          entry.date instanceof Date ? entry.date.toISOString() : String(entry.date),
      description:   entry.description,
      referenceType: entry.referenceType ?? 'MANUAL',
      referenceId:   entry.referenceId   ?? undefined,
      status:        entry.status,
      totalDebit:    normalizeMoney(entry.lines.reduce((s, l) => s + l.debit,  0)),
      totalCredit:   normalizeMoney(entry.lines.reduce((s, l) => s + l.credit, 0)),
      lineCount:     entry.lines.length,
      lines:         entry.lines.map(l => ({
        accountCode: l.account.code,
        accountName: l.account.name,
        description: l.description ?? undefined,
        debit:       normalizeMoney(l.debit),
        credit:      normalizeMoney(l.credit),
      })),
      drillDown: entry.referenceType && entry.referenceId
        ? buildDrillDownRef(entry.referenceType as DrillDownRef['entityType'], entry.referenceId)
        : undefined,
    }));

    return wrapFinancialResponse<JournalBookRow>({
      reportType: 'journal-book',
      summary: {
        totalDebit:       normalizeMoney(rows.reduce((s, r) => s + r.totalDebit,  0)),
        totalCredit:      normalizeMoney(rows.reduce((s, r) => s + r.totalCredit, 0)),
        transactionCount: total,
      },
      metadata:   { fromDate: filters.fromDate, toDate: filters.toDate },
      filters:    sanitizeFilters(filters as Record<string, unknown>),
      rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) || 1 },
    });
  }

  async exportJournalBook(filters: object, format: 'pdf' | 'excel'): Promise<Buffer> {
    const f     = filters as Parameters<typeof this.getJournalBook>[0];
    const data  = await this.getJournalBook({ ...f, pageSize: 500, page: 1 });
    const input = toJournalBookReportInput(data);
    return format === 'pdf' ? buildPdf(input) : buildExcel(input);
  }
}

export const financialService = new FinancialService();
