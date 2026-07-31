import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Backend Date-Boundary Unification Pack v1 — الثابت (A) على مستوى الخدمات.
 *
 * الاختبار الحاسم: نفس `from`/`to` القادمَين من PeriodControl يمرّان عبر أربع
 * خدمات مختلفة، كلٌّ على عمود تاريخ مختلف (issueDate / date / chequeDate)،
 * ومن خلال مُنشئَي شروط مختلفَين (شرط الوحدة نفسها، و`dateWhere` العام في
 * التقارير). يجب أن تخرج **لحظة واحدة** بعينها من الجميع.
 *
 * قبل التوحيد كان تقرير الفواتير يبني حدّه الأدنى بمنتصف ليل UTC بينما شاشة
 * الفواتير تبنيه بمنتصف ليل محلي: نفس الفترة، وجدولان لا يتطابقان.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    invoice: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
    expense: { findMany: vi.fn(), count: vi.fn() },
    cheque:  { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn() },
  },
}));
vi.mock('../../expenses/expenses.accounting', () => ({
  repostExpenseToGL: vi.fn(), reverseExpenseFromGL: vi.fn(),
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';
import { invoicesService } from '../../invoices/invoices.service';
import { ExpensesService } from '../../expenses/expenses.service';
import { chequesService } from '../../cheques/cheques.service';
import { expectLocalRange } from '../../../core/utils/__tests__/localDayMatchers';

const mp = prisma as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

const FROM = '2026-08-01';
const TO = '2026-08-31';

/** اللحظتان كأرقام — الشكل لا يهم، اللحظة هي العقد. */
function instants(range: unknown): { gte: number; lte: number } {
  const r = range as { gte: Date; lte: Date };
  return { gte: r.gte.getTime(), lte: r.lte.getTime() };
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const model of ['invoice', 'expense', 'cheque']) {
    mp[model].findMany?.mockResolvedValue([]);
    mp[model].count?.mockResolvedValue(0);
    mp[model].aggregate?.mockResolvedValue({ _sum: { total: null, paidAmount: null, amount: 0 } });
  }
});

describe('الثابت A — تطابق الحدود عبر Invoices / Expenses / Cheques / Reports', () => {
  it('الخدمات الأربع تشتقّ نفس لحظتَي البداية والنهاية لنفس الفترة', async () => {
    await invoicesService.list({ from: FROM, to: TO } as never);
    const invoices = instants(mp.invoice.findMany.mock.calls[0][0].where.issueDate);

    await new ExpensesService().list({ from: FROM, to: TO });
    const expenses = instants(mp.expense.findMany.mock.calls[0][0].where.date);

    await chequesService.list({ from: FROM, to: TO } as never);
    const cheques = instants(mp.cheque.findMany.mock.calls[0][0].where.chequeDate);

    // تقرير الفواتير يمرّ عبر `dateWhere` العام — المُنشئ الذي كان ينحرف.
    vi.clearAllMocks();
    mp.invoice.findMany.mockResolvedValue([]);
    await reportsService.build('invoices', { from: FROM, to: TO });
    const report = instants(mp.invoice.findMany.mock.calls[0][0].where.issueDate);

    expect(expenses).toEqual(invoices);
    expect(cheques).toEqual(invoices);
    expect(report).toEqual(invoices);
  });

  it('وكل واحدة منها هي المدى التقويمي المحلي الكامل شامل الطرفين', async () => {
    await invoicesService.list({ from: FROM, to: TO } as never);
    expectLocalRange(mp.invoice.findMany.mock.calls[0][0].where.issueDate, FROM, TO);

    await new ExpensesService().list({ from: FROM, to: TO });
    expectLocalRange(mp.expense.findMany.mock.calls[0][0].where.date, FROM, TO);

    await chequesService.list({ from: FROM, to: TO } as never);
    expectLocalRange(mp.cheque.findMany.mock.calls[0][0].where.chequeDate, FROM, TO);

    vi.clearAllMocks();
    mp.invoice.findMany.mockResolvedValue([]);
    await reportsService.build('invoices', { from: FROM, to: TO });
    expectLocalRange(mp.invoice.findMany.mock.calls[0][0].where.issueDate, FROM, TO);
  });

  it('تقرير المصروفات العام يطابق شاشة المصروفات على العمود نفسه', async () => {
    await new ExpensesService().list({ from: FROM, to: TO });
    const screen = instants(mp.expense.findMany.mock.calls[0][0].where.date);

    vi.clearAllMocks();
    mp.expense.findMany.mockResolvedValue([]);
    await reportsService.build('expenses', { from: FROM, to: TO });
    const report = instants(mp.expense.findMany.mock.calls[0][0].where.date);

    expect(report).toEqual(screen);
  });

  it('يوم واحد: التقرير والشاشة يغطّيان اليوم بأكمله', async () => {
    const D = '2026-08-02';
    await invoicesService.list({ from: D, to: D } as never);
    expectLocalRange(mp.invoice.findMany.mock.calls[0][0].where.issueDate, D, D);

    vi.clearAllMocks();
    mp.invoice.findMany.mockResolvedValue([]);
    await reportsService.build('invoices', { from: D, to: D });
    expectLocalRange(mp.invoice.findMany.mock.calls[0][0].where.issueDate, D, D);
  });

  it('بلا فترة: لا قيد زمني في أيٍّ منها (كل الفترات)', async () => {
    await invoicesService.list({} as never);
    expect(mp.invoice.findMany.mock.calls[0][0].where.issueDate).toBeUndefined();

    vi.clearAllMocks();
    mp.invoice.findMany.mockResolvedValue([]);
    await reportsService.build('invoices', {});
    expect(mp.invoice.findMany.mock.calls[0][0].where.issueDate).toBeUndefined();
  });
});
