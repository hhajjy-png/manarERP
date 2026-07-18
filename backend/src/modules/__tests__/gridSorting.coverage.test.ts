import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Enterprise Data Grid Foundation — تغطية التوسعة الشاملة: كل قائمة مرقّمة
 * خادميًا انضمّت في حزمة اكتمال التغطية تُثبت هنا أنّها (1) تحافظ على ترتيبها
 * الافتراضي التاريخي بلا معطيات فرز، (2) تفرز عبر القائمة البيضاء مع كاسر
 * تعادل ثابت، (3) ترفض المفاتيح غير المُدرجة.
 */

vi.mock('../../config/database', () => ({
  prisma: {
    invoice: { findMany: vi.fn(), count: vi.fn() },
    cheque: { findMany: vi.fn(), count: vi.fn() },
    salaryPayment: { findMany: vi.fn(), count: vi.fn() },
    attendance: { findMany: vi.fn(), groupBy: vi.fn() },
    material: { findMany: vi.fn(), count: vi.fn() },
    purchaseOrder: { findMany: vi.fn(), count: vi.fn() },
    goodsReceipt: { findMany: vi.fn(), count: vi.fn() },
    materialIssue: { findMany: vi.fn(), count: vi.fn() },
    account: { findMany: vi.fn(), count: vi.fn() },
    journalEntry: { findMany: vi.fn(), count: vi.fn() },
    payment: { findMany: vi.fn(), count: vi.fn() },
    projectPrice: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../config/database';
import { invoicesService } from '../invoices/invoices.service';
import { chequesService } from '../cheques/cheques.service';
import { salariesService } from '../salaries/salaries.service';
import { EmployeesService } from '../employees/employees.service';
import { MaterialsService, PurchaseOrdersService, GoodsReceiptsService, MaterialIssuesService } from '../inventory/inventory.service';
import { accountingService } from '../accounting/accounting.service';
import { listPrices } from '../prices/prices.service';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mp = prisma as any;

beforeEach(() => {
  vi.resetAllMocks();
  for (const model of Object.values(mp) as Record<string, ReturnType<typeof vi.fn>>[]) {
    model.findMany?.mockResolvedValue([]);
    model.count?.mockResolvedValue(0);
    model.groupBy?.mockResolvedValue([]);
  }
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function orderByOf(model: any) {
  return model.findMany.mock.calls[0][0].orderBy;
}

describe('invoices — grid sorting', () => {
  it('default preserved (issueDate desc + id) / whitelisted asc / rejected key', async () => {
    await invoicesService.list({});
    expect(orderByOf(mp.invoice)).toEqual([{ issueDate: 'desc' }, { id: 'desc' }]);
    mp.invoice.findMany.mockClear();
    await invoicesService.list({ sortBy: 'total', sortDir: 'asc' });
    expect(orderByOf(mp.invoice)).toEqual([{ total: 'asc' }, { id: 'desc' }]);
    mp.invoice.findMany.mockClear();
    await invoicesService.list({ sortBy: 'customerId', sortDir: 'asc' });
    expect(orderByOf(mp.invoice)).toEqual([{ issueDate: 'desc' }, { id: 'desc' }]);
  });
});

describe('cheques — grid sorting', () => {
  it('default (createdAt desc) / amount desc / rejected key', async () => {
    await chequesService.list({});
    expect(orderByOf(mp.cheque)).toEqual([{ createdAt: 'desc' }]);
    mp.cheque.findMany.mockClear();
    await chequesService.list({ sortBy: 'amount', sortDir: 'desc' });
    expect(orderByOf(mp.cheque)).toEqual([{ amount: 'desc' }, { id: 'desc' }]);
    mp.cheque.findMany.mockClear();
    await chequesService.list({ sortBy: 'notes' });
    expect(orderByOf(mp.cheque)).toEqual([{ createdAt: 'desc' }]);
  });
});

describe('salaries payments — grid sorting', () => {
  it('default stabilized / nullable paymentDate sorts nulls-last', async () => {
    await salariesService.list({});
    expect(orderByOf(mp.salaryPayment)).toEqual([{ paymentDate: 'desc' }, { id: 'desc' }]);
    mp.salaryPayment.findMany.mockClear();
    await salariesService.list({ sortBy: 'paymentDate', sortDir: 'asc' });
    expect(orderByOf(mp.salaryPayment)).toEqual([
      { paymentDate: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });
});

describe('attendance — grid sorting', () => {
  it('default (date desc) / employee relation sort / search-filter untouched', async () => {
    const service = new EmployeesService();
    await service.listAttendance({});
    expect(orderByOf(mp.attendance)).toEqual([{ date: 'desc' }]);
    mp.attendance.findMany.mockClear();
    mp.attendance.groupBy.mockResolvedValue([]);
    await service.listAttendance({ sortBy: 'employee', sortDir: 'asc' });
    expect(orderByOf(mp.attendance)).toEqual([{ employee: { fullName: 'asc' } }, { id: 'desc' }]);
  });
});

describe('inventory — four paginated grids', () => {
  it('materials: default name asc / category relation sort', async () => {
    const s = new MaterialsService();
    await s.list({});
    expect(orderByOf(mp.material)).toEqual([{ name: 'asc' }]);
    mp.material.findMany.mockClear();
    await s.list({ sortBy: 'category', sortDir: 'desc' });
    expect(orderByOf(mp.material)).toEqual([{ category: { name: 'desc' } }, { id: 'desc' }]);
  });

  it('purchase orders: nullable expectedDate nulls-last', async () => {
    const s = new PurchaseOrdersService();
    await s.list({ sortBy: 'expectedDate', sortDir: 'asc' });
    expect(orderByOf(mp.purchaseOrder)).toEqual([
      { expectedDate: { sort: 'asc', nulls: 'last' } },
      { id: 'desc' },
    ]);
  });

  it('goods receipts: purchaseOrder relation sort; rejected key falls back', async () => {
    const s = new GoodsReceiptsService();
    await s.list({ sortBy: 'purchaseOrder', sortDir: 'asc' });
    expect(orderByOf(mp.goodsReceipt)).toEqual([{ purchaseOrder: { number: 'asc' } }, { id: 'desc' }]);
    mp.goodsReceipt.findMany.mockClear();
    await s.list({ sortBy: 'accountingPostedAt' });
    expect(orderByOf(mp.goodsReceipt)).toEqual([{ date: 'desc' }]);
  });

  it('material issues: contract relation sort', async () => {
    const s = new MaterialIssuesService();
    await s.list({ sortBy: 'contract', sortDir: 'desc' });
    expect(orderByOf(mp.materialIssue)).toEqual([{ contract: { code: 'desc' } }, { id: 'desc' }]);
  });
});

describe('accounting — three paginated grids', () => {
  it('accounts: default code asc preserved / name sort', async () => {
    await accountingService.listAccounts({});
    expect(orderByOf(mp.account)).toEqual([{ code: 'asc' }]);
    mp.account.findMany.mockClear();
    await accountingService.listAccounts({ sortBy: 'name', sortDir: 'asc' });
    expect(orderByOf(mp.account)).toEqual([{ name: 'asc' }, { id: 'desc' }]);
  });

  it('journal: entryNumber sort; computed totals key rejected', async () => {
    await accountingService.listJournalEntries({ sortBy: 'entryNumber', sortDir: 'asc' });
    expect(orderByOf(mp.journalEntry)).toEqual([{ entryNumber: 'asc' }, { id: 'desc' }]);
    mp.journalEntry.findMany.mockClear();
    await accountingService.listJournalEntries({ sortBy: 'totalDebit' });
    expect(orderByOf(mp.journalEntry)).toEqual([{ date: 'desc' }]);
  });

  it('payments: invoice relation sort', async () => {
    await accountingService.listPayments({ sortBy: 'invoice', sortDir: 'desc' });
    expect(orderByOf(mp.payment)).toEqual([{ invoice: { invoiceNumber: 'desc' } }, { id: 'desc' }]);
  });
});

describe('prices — grid sorting', () => {
  it('default createdAt desc / customer relation sort / archived filter intact', async () => {
    await listPrices({ page: 1, pageSize: 20 });
    expect(orderByOf(mp.projectPrice)).toEqual([{ createdAt: 'desc' }]);
    mp.projectPrice.findMany.mockClear();
    await listPrices({ page: 1, pageSize: 20, sortBy: 'customer', sortDir: 'asc' });
    const args = mp.projectPrice.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual([{ customer: { name: 'asc' } }, { id: 'desc' }]);
    expect(args.where.isArchived).toBe(false);
  });
});
