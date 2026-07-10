import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Prisma before importing service
vi.mock('../../../config/database', () => ({
  prisma: {
    customer: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
  },
}));

import { FinancialService } from '../financial.service';
import { prisma } from '../../../config/database';

const mockPrisma = prisma as unknown as {
  customer: { findMany: ReturnType<typeof vi.fn> };
  supplier: { findMany: ReturnType<typeof vi.fn> };
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
//
// `paidAmount` كان لقطة للحاضر؛ الخدمة الآن تجمع الدفعات المفلترة بـ `date <= asOfDate`
// في استعلام Prisma. المُثبّتات تعكس ذلك: `paidAmount` هنا هو ما دُفع **حتى تاريخ
// التقرير**، ويُقدَّم للخدمة كصف دفعة واحد — تمامًا كما يفعل Prisma.

interface FixtureInvoice {
  dueDate?: Date;
  issueDate?: Date;
  total: number;
  /** المدفوع حتى تاريخ التقرير (ما بعده لا تُرجعه Prisma أصلًا). */
  paidAmount: number;
}

function toInvoiceRow(inv: FixtureInvoice, i: number) {
  return {
    id: i + 1,
    dueDate:   inv.dueDate ?? null,
    issueDate: inv.issueDate ?? new Date('2025-01-01'),
    total:     inv.total,
    payments:  inv.paidAmount > 0 ? [{ amount: inv.paidAmount }] : [],
  };
}

function makeCustomer(id: number, invoices: FixtureInvoice[]) {
  return { id, code: `C00${id}`, name: `Customer ${id}`, invoices: invoices.map(toInvoiceRow) };
}

function makeSupplier(id: number, invoices: FixtureInvoice[]) {
  return { id, code: `S00${id}`, name: `Supplier ${id}`, invoices: invoices.map(toInvoiceRow) };
}

describe('FinancialService.getArAging', () => {
  let service: FinancialService;

  beforeEach(() => {
    service = new FinancialService();
    vi.clearAllMocks();
  });

  it('returns reportType ar-aging', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.reportType).toBe('ar-aging');
  });

  it('assigns 0-30 day overdue invoice to 0_30 bucket', async () => {
    // Due May 20 → 12 days overdue on June 1 → 0_30
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-05-20'), total: 300, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['0_30']).toBe(300);
    expect(result.rows[0].total).toBe(300);
  });

  it('assigns over-120-day invoice to over_120 bucket', async () => {
    // Due Jan 1 → 151 days overdue on June 1 → over_120
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-01-01'), total: 1000, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].over_120).toBe(1000);
  });

  it('uses issueDate as fallback when dueDate is null', async () => {
    // issueDate April 1 → 61 days overdue on June 1 → 61_90
    const customer = makeCustomer(1, [{ dueDate: undefined, issueDate: new Date('2025-04-01'), total: 200, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['61_90']).toBe(200);
  });

  it('excludes fully paid invoices from buckets', async () => {
    const customer = makeCustomer(1, [
      { dueDate: new Date('2025-05-01'), total: 500, paidAmount: 500 }, // fully paid
      { dueDate: new Date('2025-05-01'), total: 300, paidAmount: 0 },   // unpaid
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].total).toBe(300); // only unpaid
  });

  it('excludes partially paid amount from outstanding', async () => {
    const customer = makeCustomer(1, [{ dueDate: new Date('2025-05-20'), total: 500, paidAmount: 200 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['0_30']).toBe(300); // 500 - 200
  });

  it('hides customers with zero outstanding when hideZero is true', async () => {
    const c1 = makeCustomer(1, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 100 }]); // paid
    const c2 = makeCustomer(2, [{ dueDate: new Date('2025-05-01'), total: 200, paidAmount: 0 }]);   // unpaid
    mockPrisma.customer.findMany.mockResolvedValue([c1, c2]);
    const result = await service.getArAging({ asOfDate: '2025-06-01', hideZero: true });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].customerId).toBe(2);
  });

  it('keeps zero-total customers when hideZero is false', async () => {
    const c1 = makeCustomer(1, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 100 }]);
    mockPrisma.customer.findMany.mockResolvedValue([c1]);
    const result = await service.getArAging({ asOfDate: '2025-06-01', hideZero: false });
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].total).toBe(0);
  });

  it('computes criticalOver90 as sum of 91_120 + over_120', async () => {
    const customer = makeCustomer(1, [
      { dueDate: new Date('2024-12-01'), total: 500, paidAmount: 0 }, // over 120
      { dueDate: new Date('2025-01-20'), total: 200, paidAmount: 0 }, // 91-120
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.summary.criticalOver90).toBe(result.rows[0].over_120 + result.rows[0]['91_120']);
  });

  it('builds correct row id and entity fields', async () => {
    const customer = makeCustomer(5, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 0 }]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].id).toBe('AR-5');
    expect(result.rows[0].customerCode).toBe('C005');
    expect(result.rows[0].customerId).toBe(5);
  });

  // ─── Historical as-of correctness ───────────────────────────────────────────
  // انحدارات تحرس الإصلاح: كان التقرير يستخدم `invoice.paidAmount` (لقطة للحاضر)
  // فيطرح تحصيلات وقعت بعد تاريخ التقرير، ويستبعد الفواتير التي سُدِّدت لاحقًا.

  it('bounds invoice selection and payments by asOfDate in the Prisma query', async () => {
    mockPrisma.customer.findMany.mockResolvedValue([]);
    await service.getArAging({ asOfDate: '2024-12-31' });

    const arg = mockPrisma.customer.findMany.mock.calls[0][0];
    const invoiceRel = arg.select.invoices;

    // نهاية اليوم لا منتصف الليل — وإلا سقط كل ما جرى في 31/12 نفسه.
    const asOf: Date = invoiceRel.where.issueDate.lte;
    expect(asOf.getFullYear()).toBe(2024);
    expect(asOf.getMonth()).toBe(11);
    expect(asOf.getDate()).toBe(31);
    expect(asOf.getHours()).toBe(23);

    // الدفعات محدودة بنفس التاريخ داخل الاستعلام لا في الذاكرة.
    expect(invoiceRel.select.payments.where.date.lte).toEqual(asOf);

    // الحالة الحالية ليست معيارًا تاريخيًا — فقط الملغاة تُستبعد.
    expect(invoiceRel.where.status).toEqual({ not: 'CANCELLED' });
    expect(invoiceRel.select).not.toHaveProperty('paidAmount');
  });

  it('ignores a 2025 collection when aging as of 31/12/2024', async () => {
    // فاتورة 2024 بـ 1000، دُفع منها 400 حتى 31/12/2024 (Prisma لا تُرجع دفعة 2025).
    const customer = makeCustomer(1, [
      { issueDate: new Date('2024-12-15'), dueDate: new Date('2024-12-20'), total: 1000, paidAmount: 400 },
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2024-12-31' });

    // 600 لا 0 — ولو استُخدم paidAmount الحالي (1000 بعد سداد 2025) لكان الصف صفرًا.
    expect(result.rows[0].total).toBe(600);
  });

  it('still counts an invoice that was fully paid after asOfDate', async () => {
    // سُدِّدت بالكامل في 2025 ⇒ status='PAID' اليوم، لكنها كانت قائمة في 31/12/2024.
    const customer = makeCustomer(1, [
      { issueDate: new Date('2024-11-01'), dueDate: new Date('2024-11-30'), total: 750, paidAmount: 0 },
    ]);
    mockPrisma.customer.findMany.mockResolvedValue([customer]);
    const result = await service.getArAging({ asOfDate: '2024-12-31' });
    expect(result.rows[0].total).toBe(750);
  });
});

describe('FinancialService.getApAging', () => {
  let service: FinancialService;

  beforeEach(() => {
    service = new FinancialService();
    vi.clearAllMocks();
  });

  it('returns reportType ap-aging', async () => {
    mockPrisma.supplier.findMany.mockResolvedValue([]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.reportType).toBe('ap-aging');
  });

  it('assigns overdue AP invoice to correct bucket', async () => {
    // Due March 1 → 92 days overdue on June 1 → 91_120
    const supplier = makeSupplier(1, [{ dueDate: new Date('2025-03-01'), total: 400, paidAmount: 0 }]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0]['91_120']).toBe(400);
  });

  it('excludes fully paid purchase invoices', async () => {
    const supplier = makeSupplier(1, [
      { dueDate: new Date('2025-05-01'), total: 800, paidAmount: 800 },
    ]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01', hideZero: true });
    expect(result.rows).toHaveLength(0);
  });

  it('builds correct row id and supplier fields', async () => {
    const supplier = makeSupplier(3, [{ dueDate: new Date('2025-05-01'), total: 100, paidAmount: 0 }]);
    mockPrisma.supplier.findMany.mockResolvedValue([supplier]);
    const result = await service.getApAging({ asOfDate: '2025-06-01' });
    expect(result.rows[0].id).toBe('AP-3');
    expect(result.rows[0].supplierCode).toBe('S003');
    expect(result.rows[0].supplierId).toBe(3);
  });

  it('passes search filter through to Prisma query', async () => {
    mockPrisma.supplier.findMany.mockResolvedValue([]);
    await service.getApAging({ search: 'طرق' });
    const callArg = mockPrisma.supplier.findMany.mock.calls[0][0];
    expect(callArg.where.OR).toBeDefined();
    expect(callArg.where.OR[0].name.contains).toBe('طرق');
  });
});
