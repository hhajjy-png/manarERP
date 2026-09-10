/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';

/* ════════════════════════════════════════════════════════════════════════════
   «قيمة الشيك الأصلية» في تقرير المقبوضات.

   قاعدة البيانات هنا جدول تحصيلات في الذاكرة، والوهم يميّز الاستعلامين:
     • استعلام صفوف التقرير (`listAll`) ⇒ يعيد `reportRows` — ما تُبقيه الفلاتر.
     • استعلام أجزاء الشيكات (`reference: { in }`) ⇒ يطبّق شرطه على **الجدول كله**.
   فاختلاف ما يراه التقرير عمّا في القاعدة هو بالضبط ما تختبره حالتا الفلترة والترقيم.
   ════════════════════════════════════════════════════════════════════════════ */

vi.mock('../../../config/database', () => ({
  prisma: {
    payment: { findMany: vi.fn(), count: vi.fn(), aggregate: vi.fn(), groupBy: vi.fn() },
    customer: { findUnique: vi.fn() },
  },
}));

import ExcelJS from 'exceljs';
import { prisma } from '../../../config/database';
import { buildReportHtml } from '../../../shared/services/reportEngine/html.service';
import { buildExcel } from '../../../shared/services/reportEngine/excel.service';
import { buildReceiptsReport } from '../receiptsReport';
import {
  chequeGroupKey,
  loadChequeTotals,
  originalChequeAmountOf,
  sumChequeParts,
} from '../receiptsChequeAmounts';

const mp = prisma as any;

/* ── جدول التحصيلات الوهمي ──────────────────────────────────────────────── */

const SEP_7 = new Date(2026, 8, 7);
const SEP_8 = new Date(2026, 8, 8);

interface Row {
  id: number;
  amount: number;
  method: string;
  reference: string | null;
  date: Date;
  customerId: number;
  direction?: string;
  invoiceStatus?: string;
}

function raw(r: Row) {
  return {
    id: r.id,
    date: r.date,
    amount: r.amount,
    method: r.method,
    reference: r.reference,
    notes: r.method === 'CASH' ? 'مستلم' : null,
    createdAt: r.date,
    invoice: {
      id: 100 + r.id,
      invoiceNumber: `MN-INV-2026-${100 + r.id}`,
      number: null,
      issueDate: r.date,
      total: r.amount,
      paidAmount: r.amount,
      status: r.invoiceStatus ?? 'PAID',
      direction: r.direction ?? 'SALES',
      customerId: r.customerId,
      customer: { id: r.customerId, name: `عميل ${r.customerId}` },
      contractId: null,
      contract: null,
    },
  };
}

/** الشيك 001474 للعميل 3 بتاريخ 07/09 موزَّعًا على أربع فواتير — 5,050.000. */
const CHEQUE_001474 = [
  { id: 1, amount: 1135, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3 },
  { id: 2, amount: 2080, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3, invoiceStatus: 'PARTIAL' },
  { id: 3, amount: 405, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3 },
  { id: 4, amount: 1430, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3 },
];

let db: Row[] = [];
let reportRows: Row[] = [];

/** مُقيِّم مصغَّر لشرط استعلام أجزاء الشيكات — يطبّقه على الجدول كله. */
function matchesChequeLookup(r: Row, where: Record<string, any>): boolean {
  if (where.method && r.method !== where.method) return false;
  if (where.reference?.in && !where.reference.in.includes(r.reference)) return false;
  const inv = where.invoice ?? {};
  if (inv.direction && (r.direction ?? 'SALES') !== inv.direction) return false;
  if (inv.status?.not && (r.invoiceStatus ?? 'PAID') === inv.status.not) return false;
  return true;
}

function lookupCalls() {
  return mp.payment.findMany.mock.calls.filter((c: any[]) => c[0]?.where?.reference?.in);
}

beforeEach(() => {
  vi.clearAllMocks();
  db = [];
  reportRows = [];
  mp.payment.findMany.mockImplementation(async (args: Record<string, any>) => {
    if (args.where?.reference?.in) return db.filter((r) => matchesChequeLookup(r, args.where)).map(raw);
    if (args.take === 1) return reportRows.length ? [raw(reportRows[0])] : [];
    return reportRows.map(raw);
  });
  mp.payment.count.mockImplementation(async () => reportRows.length);
  mp.payment.aggregate.mockImplementation(async () => ({
    _sum: { amount: reportRows.reduce((s, r) => s + r.amount, 0) },
    _count: { _all: reportRows.length },
  }));
  mp.payment.groupBy.mockResolvedValue([]);
});

/** يبني التقرير ويعيد عمود «قيمة الشيك الأصلية» بترتيب الصفوف. */
async function originalColumn(query: Record<string, string> = {}) {
  const report = await buildReceiptsReport(query);
  return report.rows.map((r) => r.originalChequeAmount);
}

/* ── A–E: قواعد المفتاح والمجموع ────────────────────────────────────────── */

describe('قيمة الشيك الأصلية — قواعد التجميع', () => {
  it('A) شيك بتحصيل واحد ⇒ القيمة الأصلية = مبلغه (100)', async () => {
    db = reportRows = [{ id: 1, amount: 100, method: 'CHEQUE', reference: '000100', date: SEP_7, customerId: 3 }];
    expect(await originalColumn()).toEqual([100]);
  });

  it('B) نفس المرجع + نفس العميل + نفس التاريخ: 100 + 200 + 300 ⇒ كل الصفوف 600', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CHEQUE', reference: '000200', date: SEP_7, customerId: 3 },
      { id: 2, amount: 200, method: 'CHEQUE', reference: '000200', date: SEP_7, customerId: 3 },
      { id: 3, amount: 300, method: 'CHEQUE', reference: '000200', date: SEP_7, customerId: 3 },
    ];
    expect(await originalColumn()).toEqual([600, 600, 600]);
  });

  it('مثال الحزمة: الشيك 001474 (1,135 + 2,080 + 405 + 1,430) ⇒ 5,050.000 على كل سطر', async () => {
    db = reportRows = CHEQUE_001474;
    expect(await originalColumn()).toEqual([5050, 5050, 5050, 5050]);
  });

  it('C) نفس المرجع لعميل مختلف ⇒ لا دمج', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CHEQUE', reference: '000300', date: SEP_7, customerId: 3 },
      { id: 2, amount: 200, method: 'CHEQUE', reference: '000300', date: SEP_7, customerId: 4 },
    ];
    expect(await originalColumn()).toEqual([100, 200]);
  });

  it('D) نفس المرجع ونفس العميل بتاريخ مختلف ⇒ لا دمج', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CHEQUE', reference: '000400', date: SEP_7, customerId: 3 },
      { id: 2, amount: 200, method: 'CHEQUE', reference: '000400', date: SEP_8, customerId: 3 },
    ];
    expect(await originalColumn()).toEqual([100, 200]);
  });

  it('D) التاريخ يُقارَن باليوم — ساعتان مختلفتان في اليوم نفسه جزءان من شيك واحد', () => {
    const totals = sumChequeParts([
      { amount: 100, method: 'CHEQUE', reference: '000500', customerId: 3, date: new Date(2026, 8, 7, 0, 0) },
      { amount: 250, method: 'CHEQUE', reference: '000500', customerId: 3, date: new Date(2026, 8, 7, 15, 30) },
    ]);
    expect([...totals.values()]).toEqual([350]);
  });

  it('E) CASH / BANK / TRANSFER ⇒ «—» ولا تُقرأ قاعدة البيانات لأجلها', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CASH', reference: '000600', date: SEP_7, customerId: 3 },
      { id: 2, amount: 200, method: 'BANK', reference: '000600', date: SEP_7, customerId: 3 },
      { id: 3, amount: 300, method: 'TRANSFER', reference: '000600', date: SEP_7, customerId: 3 },
    ];
    expect(await originalColumn()).toEqual(['—', '—', '—']);
    expect(lookupCalls()).toHaveLength(0);
  });

  it('E) غير الشيك ⇒ `null` على مستوى البيانات', () => {
    const row = { amount: 100, method: 'TRANSFER', reference: 'TR1', customerId: 3, date: SEP_7 };
    expect(originalChequeAmountOf(row, new Map())).toBeNull();
  });

  it('وسيلة مختلفة بنفس المفتاح لا تُضاف إلى الشيك', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CHEQUE', reference: '000700', date: SEP_7, customerId: 3 },
      { id: 2, amount: 900, method: 'TRANSFER', reference: '000700', date: SEP_7, customerId: 3 },
    ];
    expect(await originalColumn()).toEqual([100, '—']);
  });

  it('شيك بلا رقم مرجع ⇒ لا يُجمَّع مع غيره، وقيمته مبلغه', async () => {
    db = reportRows = [
      { id: 1, amount: 100, method: 'CHEQUE', reference: null, date: SEP_7, customerId: 3 },
      { id: 2, amount: 200, method: 'CHEQUE', reference: '  ', date: SEP_7, customerId: 3 },
    ];
    expect(await originalColumn()).toEqual([100, 200]);
    expect(lookupCalls()).toHaveLength(0);
    expect(chequeGroupKey({ method: 'CHEQUE', reference: null, customerId: 3, date: SEP_7 })).toBeNull();
  });

  it('الجمع بدقّة الدينار — لا بقايا عائمة', () => {
    const totals = sumChequeParts([
      { amount: 0.1, method: 'CHEQUE', reference: 'R', customerId: 1, date: SEP_7 },
      { amount: 0.2, method: 'CHEQUE', reference: 'R', customerId: 1, date: SEP_7 },
    ]);
    expect([...totals.values()]).toEqual([0.3]);
  });
});

/* ── F–G: المجموع من قاعدة البيانات لا من الصفوف الظاهرة ───────────────── */

describe('قيمة الشيك الأصلية — من كامل القاعدة لا من الصفوف الظاهرة', () => {
  it('F) أجزاء الشيك موزَّعة بين صفحات ⇒ كل صفحة ترى القيمة الكاملة', async () => {
    db = CHEQUE_001474;
    const page1 = CHEQUE_001474.slice(0, 2);
    const page2 = CHEQUE_001474.slice(2);

    const totals1 = await loadChequeTotals(page1);
    const totals2 = await loadChequeTotals(page2);

    expect(page1.map((r) => originalChequeAmountOf(r, totals1))).toEqual([5050, 5050]);
    expect(page2.map((r) => originalChequeAmountOf(r, totals2))).toEqual([5050, 5050]);
  });

  it('G) فلتر يُبقي تحصيلًا واحدًا من شيك بأربعة ⇒ الصفّ يعرض إجمالي الشيك كاملًا', async () => {
    db = CHEQUE_001474;
    reportRows = [CHEQUE_001474[1]]; // فلتر «عليها رصيد» يُبقي الجزء 2,080 وحده
    const report = await buildReceiptsReport({ status: 'PARTIAL' });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0].amount).toBe(2080);
    expect(report.rows[0].originalChequeAmount).toBe(5050);
    // الإجمالي يبقى مجموع الصفوف الظاهرة وحدها — القيمة الأصلية لا تتسرّب إليه.
    expect(report.totalsRow!.amount).toBe(2080);
  });

  it('استعلام الأجزاء يتجاهل فلاتر التقرير ويبقى داخل عالم المقبوضات', async () => {
    db = CHEQUE_001474;
    reportRows = [CHEQUE_001474[0]];
    await buildReceiptsReport({
      from: '2026-09-01', to: '2026-09-30', status: 'PAID', minAmount: '1000', maxAmount: '2000', search: 'MN', customerId: '3', method: 'CHEQUE',
    });

    const where = lookupCalls()[0][0].where;
    expect(where).toEqual({
      method: 'CHEQUE',
      reference: { in: ['001474'] },
      invoice: { direction: 'SALES', status: { not: 'CANCELLED' } },
    });
  });

  it('أجزاء على فاتورة ملغاة أو فاتورة شراء لا تُحتسب', async () => {
    db = [
      ...CHEQUE_001474,
      { id: 5, amount: 999, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3, invoiceStatus: 'CANCELLED' },
      { id: 6, amount: 888, method: 'CHEQUE', reference: '001474', date: SEP_7, customerId: 3, direction: 'PURCHASE' },
    ];
    reportRows = [CHEQUE_001474[0]];
    expect(await originalColumn()).toEqual([5050]);
  });
});

/* ── I: الطباعة / PDF / HTML / Excel ────────────────────────────────────── */

describe('I) الطباعة وPDF وHTML وExcel بعد الإزالة والإضافة', () => {
  const MIXED: Row[] = [
    ...CHEQUE_001474,
    { id: 9, amount: 750, method: 'CASH', reference: null, date: SEP_8, customerId: 4 },
  ];

  it('HTML/PDF (A4 أفقي): العمود الجديد بقيمه، و«—» لغير الشيك، وبلا توزيع ولا متوسط', async () => {
    db = reportRows = MIXED;
    const html = buildReportHtml(await buildReceiptsReport({}), { profile: 'a4-landscape' });

    expect(html).toContain('قيمة الشيك الأصلية (KWD)');
    expect(html.match(/5,050\.000/g)).toHaveLength(4);
    expect(html).not.toContain('التوزيع حسب وسيلة القبض');
    expect(html).not.toContain('متوسط قيمة العملية');
    expect(html).not.toContain('<section class="report-analysis">');
    // صفّ غير الشيك: الخليّة الأخيرة «—».
    const cashRow = html.split('<tr').find((tr) => tr.includes('>نقدي</td>'))!;
    expect(cashRow.trim().endsWith('<td class="num">—</td></tr>')).toBe(true);
  });

  it('Excel: ورقة التقرير تحمل العمود بقيم رقمية منسَّقة، ولا ورقة للتوزيع', async () => {
    db = reportRows = MIXED;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await buildExcel(await buildReceiptsReport({})) as unknown as ArrayBuffer);

    expect(wb.worksheets.map((ws) => ws.name)).not.toContain('التوزيع حسب الوسيلة');
    expect(wb.worksheets).toHaveLength(2); // التقرير + المؤشرات التنفيذية

    const ws = wb.worksheets[0];
    let headerRow = 0;
    ws.eachRow((row, i) => { if (row.values && (row.values as unknown[]).includes('قيمة الشيك الأصلية')) headerRow = i; });
    expect(headerRow).toBeGreaterThan(0);
    const col = (ws.getRow(headerRow).values as unknown[]).indexOf('قيمة الشيك الأصلية');

    const values = [1, 2, 3, 4, 5].map((n) => ws.getRow(headerRow + n).getCell(col));
    expect(values.slice(0, 4).map((c) => c.value)).toEqual([5050, 5050, 5050, 5050]);
    expect(values[0].numFmt).toContain('0.000');
    expect(values[4].value).toBe('—');

    const kpiLabels: unknown[] = [];
    wb.worksheets[1].eachRow((row) => kpiLabels.push(row.getCell(1).value));
    expect(kpiLabels).not.toContain('متوسط قيمة العملية');
    expect(kpiLabels).toContain('الشيكات');
  });
});

/* ── الأداء: لا N+1 ─────────────────────────────────────────────────────── */

describe('قيمة الشيك الأصلية — استعلام مُجمَّع لا استعلام لكل صفّ', () => {
  it('عشرات الصفوف والشيكات ⇒ استعلام أجزاء واحد', async () => {
    db = reportRows = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1, amount: 10, method: 'CHEQUE', reference: `R${i % 20}`, date: SEP_7, customerId: 3,
    }));
    const column = await originalColumn();
    expect(lookupCalls()).toHaveLength(1);
    expect(column.every((v) => v === 30)).toBe(true); // كل شيك من 20 = ثلاثة أجزاء × 10
  });

  it('أرقام الشيكات تُمرَّر مرّة واحدة لكل رقم', async () => {
    db = reportRows = CHEQUE_001474;
    await buildReceiptsReport({});
    expect(lookupCalls()[0][0].where.reference.in).toEqual(['001474']);
  });

  it('أكثر من 500 رقم شيك ⇒ دفعتان لا أكثر', async () => {
    const rows = Array.from({ length: 750 }, (_, i) => ({
      id: i + 1, amount: 1, method: 'CHEQUE', reference: `C${i}`, date: SEP_7, customerId: 3,
    }));
    db = rows;
    const totals = await loadChequeTotals(rows);
    const calls = lookupCalls();
    expect(calls).toHaveLength(2);
    expect(calls[0][0].where.reference.in).toHaveLength(500);
    expect(calls[1][0].where.reference.in).toHaveLength(250);
    expect(totals.size).toBe(750);
  });

  it('لا كتابة إطلاقًا — القراءة وحدها', async () => {
    db = reportRows = CHEQUE_001474;
    await buildReceiptsReport({});
    const methods = Object.keys(mp.payment);
    expect(methods.sort()).toEqual(['aggregate', 'count', 'findMany', 'groupBy']);
  });
});
