import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * توحيد Aging التاريخي — كل مسارات "المستحق كما في تاريخ" تحسب من الدفعات حتى
 * التاريخ المرجعي (`payments where date<=asOf`)، لا من `Invoice.paidAmount` (لقطة الحاضر)،
 * ولا تستبعد PAID (فاتورة سُدِّدت لاحقًا كانت مستحقة في التاريخ المرجعي).
 *
 * هذا الاختبار يحرس تطابق الآلية عبر نقطتَي النهاية الرئيسيتين:
 *   - reports.service: receivables-aging (from/to → asOf)
 *   - financial.service: getArAging (asOfDate)
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findMany: vi.fn(), aggregate: vi.fn() },
    customer: { findMany: vi.fn() },
    supplier: { findMany: vi.fn() },
    payment: { findMany: vi.fn() },
    transaction: { aggregate: vi.fn() },
    contract: { findMany: vi.fn().mockResolvedValue([]) },
    expense: { findMany: vi.fn().mockResolvedValue([]) },
    equipment: { findMany: vi.fn().mockResolvedValue([]) },
    employee: { findMany: vi.fn().mockResolvedValue([]) },
    payroll: { findMany: vi.fn().mockResolvedValue([]) },
    attendance: { findMany: vi.fn().mockResolvedValue([]) },
    projectPrice: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';
import { FinancialService } from '../../financial/financial.service';

const mp = prisma as any;

beforeEach(() => vi.clearAllMocks());

describe('Aging consistency — payments-by-date, never paidAmount', () => {
  it('reports.receivables-aging: selects payments<=asOf and does NOT select paidAmount', async () => {
    mp.invoice.findMany.mockResolvedValue([]);
    await reportsService.build('receivables-aging', { to: '2024-12-31' });

    const call = mp.invoice.findMany.mock.calls[0][0];
    expect(call.include.payments.where.date.lte).toBeInstanceOf(Date);
    expect(call.include.payments.select.amount).toBe(true);
    // لا يُختار paidAmount في include (النمط الجديد).
    expect(JSON.stringify(call.include)).not.toContain('paidAmount');
    expect(call.where.status).toEqual({ not: 'CANCELLED' }); // لا يستبعد PAID
  });

  it('financial.getArAging: selects payments<=asOf and does NOT select paidAmount', async () => {
    mp.customer.findMany.mockResolvedValue([]);
    await new FinancialService().getArAging({ asOfDate: '2024-12-31' });

    const call = mp.customer.findMany.mock.calls[0][0];
    const invRel = call.select.invoices;
    expect(invRel.select.payments.where.date.lte).toBeInstanceOf(Date);
    expect(invRel.select.payments.select.amount).toBe(true);
    expect(invRel.select).not.toHaveProperty('paidAmount');
    expect(invRel.where.status).toEqual({ not: 'CANCELLED' });
  });

  it('both endpoints agree on the same invoice: full outstanding when paid after asOf', async () => {
    // نفس السيناريو: فاتورة 2024 بـ 1000، دفعة يناير 2025 (تُستبعَد بالفلتر → payments فارغة).
    const asOf = '2024-12-31';

    mp.invoice.findMany.mockResolvedValue([
      { id: 1, invoiceNumber: 'MN-INV-2024-1', issueDate: new Date('2024-12-15'), dueDate: new Date('2024-12-20'),
        total: 1000, status: 'PAID', direction: 'SALES', customerId: 1,
        customer: { id: 1, name: 'عميل' }, payments: [] },
    ]);
    const rep = await reportsService.build('receivables-aging', { to: asOf });

    mp.customer.findMany.mockResolvedValue([
      { id: 1, code: 'C1', name: 'عميل', invoices: [
        { id: 1, dueDate: new Date('2024-12-20'), issueDate: new Date('2024-12-15'), total: 1000, payments: [] },
      ] },
    ]);
    const fin = await new FinancialService().getArAging({ asOfDate: asOf });

    expect(rep.totalsRow?.['totalOutstanding']).toBeCloseTo(1000, 3);
    expect(fin.summary.totalOutstanding).toBeCloseTo(1000, 3);
  });
});
