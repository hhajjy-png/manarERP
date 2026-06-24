import { prisma } from '@config/database';
import type {
  StatementInput,
  StatementResult,
  StatementEntry,
  StatementFilters,
  StatementEntityType,
} from './statement.types';

export async function buildStatement(input: StatementInput): Promise<StatementResult> {
  const { entityType, entityId, filters } = input;
  if (entityType === 'CUSTOMER') return buildCustomerStatement(entityId, filters);
  if (entityType === 'SUPPLIER') return buildSupplierStatement(entityId, filters);
  throw new Error(`Unsupported entity type: ${entityType}`);
}

// ─── Customer Statement ───────────────────────────────────────────────────────

async function buildCustomerStatement(
  entityId: number,
  filters: StatementFilters,
): Promise<StatementResult> {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true, code: true },
  });

  const openingBalance = filters.fromDate
    ? await calcCustomerOpeningBalance(entityId, filters.fromDate)
    : 0;

  const dateWhere = buildDateWhere(filters.fromDate, filters.toDate);

  // Sales invoices in range (debit — customer owes us)
  const invoices = await prisma.invoice.findMany({
    where: {
      customerId: entityId,
      direction: 'SALES',
      status: { not: 'CANCELLED' },
      issueDate: dateWhere,
    },
    orderBy: { issueDate: 'asc' },
  });

  // Payments on sales invoices in range (credit — customer paid us)
  const payments = await prisma.payment.findMany({
    where: {
      invoice: { customerId: entityId, direction: 'SALES' },
      date: dateWhere,
    },
    include: { invoice: { select: { invoiceNumber: true } } },
    orderBy: { date: 'asc' },
  });

  type RawEntry = Omit<StatementEntry, 'runningBalance'>;

  const invoiceEntries: RawEntry[] = invoices.map((inv) => ({
    id: `INVOICE-${inv.id}`,
    date: inv.issueDate,
    reference: inv.invoiceNumber,
    referenceType: 'INVOICE' as const,
    referenceId: inv.id,
    description: `فاتورة مبيعات${inv.notes ? ` — ${inv.notes}` : ''}`,
    debit: Number(inv.total),
    credit: 0,
    status: inv.status,
    entityName: customer.name,
    entityCode: customer.code,
  }));

  const paymentEntries: RawEntry[] = payments.map((pmt) => ({
    id: `PAYMENT-${pmt.id}`,
    date: pmt.date,
    reference: pmt.reference ?? `PMNT-${pmt.id}`,
    referenceType: 'PAYMENT' as const,
    referenceId: pmt.id,
    description: `دفعة على ${pmt.invoice.invoiceNumber}${pmt.notes ? ` — ${pmt.notes}` : ''}`,
    debit: 0,
    credit: Number(pmt.amount),
    status: 'PAID',
    entityName: customer.name,
    entityCode: customer.code,
  }));

  const rawEntries: RawEntry[] = [...invoiceEntries, ...paymentEntries];

  return assembleResult({
    entityId,
    entityType: 'CUSTOMER',
    entityName: customer.name,
    entityCode: customer.code,
    filters,
    openingBalance,
    rawEntries,
  });
}

async function calcCustomerOpeningBalance(entityId: number, before: Date): Promise<number> {
  const [invAgg, pmtAgg] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        customerId: entityId,
        direction: 'SALES',
        status: { not: 'CANCELLED' },
        issueDate: { lt: before },
      },
      _sum: { total: true },
    }),
    prisma.payment.aggregate({
      where: {
        invoice: { customerId: entityId, direction: 'SALES' },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
  ]);
  return Number(invAgg._sum.total ?? 0) - Number(pmtAgg._sum.amount ?? 0);
}

// ─── Supplier Statement ───────────────────────────────────────────────────────

async function buildSupplierStatement(
  entityId: number,
  filters: StatementFilters,
): Promise<StatementResult> {
  const supplier = await prisma.supplier.findUniqueOrThrow({
    where: { id: entityId },
    select: { name: true, code: true },
  });

  const openingBalance = filters.fromDate
    ? await calcSupplierOpeningBalance(entityId, filters.fromDate)
    : 0;

  const dateWhere = buildDateWhere(filters.fromDate, filters.toDate);

  // Purchase invoices in range (credit — we owe supplier)
  const purchaseInvoices = await prisma.invoice.findMany({
    where: {
      supplierId: entityId,
      direction: 'PURCHASE',
      status: { not: 'CANCELLED' },
      issueDate: dateWhere,
    },
    orderBy: { issueDate: 'asc' },
  });

  // Expenses for this supplier in range (credit — we owe supplier)
  const expenses = await prisma.expense.findMany({
    where: {
      supplierId: entityId,
      status: { notIn: ['CANCELLED', 'REVERSED'] },
      date: dateWhere,
    },
    orderBy: { date: 'asc' },
  });

  // Payments on purchase invoices in range (debit — we paid supplier)
  const payments = await prisma.payment.findMany({
    where: {
      invoice: { supplierId: entityId, direction: 'PURCHASE' },
      date: dateWhere,
    },
    include: { invoice: { select: { invoiceNumber: true } } },
    orderBy: { date: 'asc' },
  });

  type RawEntry = Omit<StatementEntry, 'runningBalance'>;

  const purchaseInvoiceEntries: RawEntry[] = purchaseInvoices.map((inv) => ({
    id: `INVOICE-${inv.id}`,
    date: inv.issueDate,
    reference: inv.invoiceNumber,
    referenceType: 'INVOICE' as const,
    referenceId: inv.id,
    description: `فاتورة مشتريات${inv.notes ? ` — ${inv.notes}` : ''}`,
    debit: 0,
    credit: Number(inv.total),
    status: inv.status,
    entityName: supplier.name,
    entityCode: supplier.code,
  }));

  const expenseEntries: RawEntry[] = expenses.map((exp) => ({
    id: `EXPENSE-${exp.id}`,
    date: exp.date,
    reference: exp.code,
    referenceType: 'EXPENSE' as const,
    referenceId: exp.id,
    description: exp.description,
    debit: 0,
    credit: Number(exp.amount),
    status: exp.status,
    entityName: supplier.name,
    entityCode: supplier.code,
  }));

  const supplierPaymentEntries: RawEntry[] = payments.map((pmt) => ({
    id: `PAYMENT-${pmt.id}`,
    date: pmt.date,
    reference: pmt.reference ?? `PMNT-${pmt.id}`,
    referenceType: 'PAYMENT' as const,
    referenceId: pmt.id,
    description: `دفعة على ${pmt.invoice.invoiceNumber}${pmt.notes ? ` — ${pmt.notes}` : ''}`,
    debit: Number(pmt.amount),
    credit: 0,
    status: 'PAID',
    entityName: supplier.name,
    entityCode: supplier.code,
  }));

  const rawEntries: RawEntry[] = [...purchaseInvoiceEntries, ...expenseEntries, ...supplierPaymentEntries];

  return assembleResult({
    entityId,
    entityType: 'SUPPLIER',
    entityName: supplier.name,
    entityCode: supplier.code,
    filters,
    openingBalance,
    rawEntries,
  });
}

async function calcSupplierOpeningBalance(entityId: number, before: Date): Promise<number> {
  const [invAgg, expAgg, pmtAgg] = await Promise.all([
    prisma.invoice.aggregate({
      where: {
        supplierId: entityId,
        direction: 'PURCHASE',
        status: { not: 'CANCELLED' },
        issueDate: { lt: before },
      },
      _sum: { total: true },
    }),
    prisma.expense.aggregate({
      where: {
        supplierId: entityId,
        status: { notIn: ['CANCELLED', 'REVERSED'] },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        invoice: { supplierId: entityId, direction: 'PURCHASE' },
        date: { lt: before },
      },
      _sum: { amount: true },
    }),
  ]);
  return (
    Number(invAgg._sum.total ?? 0) +
    Number(expAgg._sum.amount ?? 0) -
    Number(pmtAgg._sum.amount ?? 0)
  );
}

// ─── Shared Assembly ──────────────────────────────────────────────────────────

interface AssembleInput {
  entityId: number;
  entityType: StatementEntityType;
  entityName: string;
  entityCode: string;
  filters: StatementFilters;
  openingBalance: number;
  rawEntries: Omit<StatementEntry, 'runningBalance'>[];
}

function assembleResult(input: AssembleInput): StatementResult {
  const { entityId, entityType, entityName, entityCode, filters, openingBalance, rawEntries } =
    input;

  // Sort chronologically for running balance
  const sorted = [...rawEntries].sort((a, b) => a.date.getTime() - b.date.getTime());

  // Apply filters
  let filtered = sorted;
  if (filters.referenceType) {
    filtered = filtered.filter((e) => e.referenceType === filters.referenceType);
  }
  if (filters.status) {
    filtered = filtered.filter((e) => e.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    filtered = filtered.filter(
      (e) => e.reference.toLowerCase().includes(q) || e.description.toLowerCase().includes(q),
    );
  }

  // Compute running balance after filtering
  let balance = openingBalance;
  const entries: StatementEntry[] = filtered.map((e) => {
    balance = balance + e.debit - e.credit;
    return { ...e, runningBalance: balance };
  });

  const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
  const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
  const closingBalance = openingBalance + totalDebit - totalCredit;

  return {
    entityId,
    entityType,
    entityName,
    entityCode,
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    openingBalance,
    entries,
    summary: {
      openingBalance,
      totalDebit,
      totalCredit,
      closingBalance,
      transactionCount: entries.length,
    },
  };
}

function buildDateWhere(from?: Date, to?: Date): { gte?: Date; lte?: Date } | undefined {
  if (!from && !to) return undefined;
  const w: { gte?: Date; lte?: Date } = {};
  if (from) w.gte = from;
  if (to) w.lte = to;
  return w;
}
