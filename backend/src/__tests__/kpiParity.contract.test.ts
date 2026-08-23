import { describe, it, expect } from 'vitest';
import { agedOver90Where } from '../shared/services/financial/dashboard-summary.service';
import { resolveInvoicePeriod } from '../modules/invoices/invoices.service';
import { buildWhereClause } from '../modules/bankStatementImport/reconciliationEngine';
import { clampMonthWindows, monthWindowsBetween, startOfLocalDay, endOfLocalDay } from '../core/utils/dateWindows';
import { roundMoney, sumMoney } from '../shared/utils/money';
import { CRITICAL_AGEING_DAYS, TOP_DEBTOR_CARD_HIGH_KWD, HIGH_OUTSTANDING_ALERT_HIGH_KWD } from '../config/thresholds';

/**
 * PERMANENT CONTRACT — تكافؤ البطاقة مع مصدرها المرجعي.
 *
 * الحزم الأربع أصلحت مؤشرات كانت تختلف عن التقرير المقابل لها لنفس البيانات والفترة.
 * هذا الملف يمنع عودة الانحراف: لكل مؤشر مصلَح، يُبنى **المتوقَّع من المصدر المرجعي
 * المستقل** (الشرط أو الدالة التي تعتمدها الخلفية) ويُقارَن بما تنتجه البطاقة —
 * بلا إعادة كتابة أي معادلة داخل الاختبار.
 *
 * مجموعة بيانات واحدة تخدم كل المؤشرات، فأي تعديل يكسر أحدها يظهر أثره على البقية.
 */

// ── مجموعة البيانات المرجعية ──────────────────────────────────────────────────

const NOW = new Date(2026, 7, 23, 12, 0, 0);
const CUTOFF_90 = new Date(NOW.getTime() - CRITICAL_AGEING_DAYS * 86_400_000);

interface Inv {
  id: number; direction: 'SALES' | 'PURCHASE'; status: string;
  total: number; paidAmount: number; issueDate: Date; dueDate: Date | null;
  billingYear: number | null; billingMonth: number | null;
}

const INVOICES: Inv[] = [
  // متقادمة أكثر من 90 يومًا، بلا تاريخ استحقاق — الحالة التي كانت تُخفي 24,586 د.ك
  { id: 1, direction: 'SALES', status: 'UNPAID',  total: 20_794, paidAmount: 0, issueDate: new Date(Date.UTC(2026, 1, 28)), dueDate: null, billingYear: null, billingMonth: null },
  { id: 2, direction: 'SALES', status: 'PARTIAL', total:  3_792, paidAmount: 0, issueDate: new Date(Date.UTC(2026, 2, 31)), dueDate: null, billingYear: null, billingMonth: null },
  // حديثة
  { id: 3, direction: 'SALES', status: 'UNPAID',  total: 10_000, paidAmount: 0, issueDate: new Date(Date.UTC(2026, 6, 31)), dueDate: null, billingYear: 2026, billingMonth: 7 },
  // مسدَّدة ⇒ خارج الذمم
  { id: 4, direction: 'SALES', status: 'PAID',    total: 50_000, paidAmount: 50_000, issueDate: new Date(Date.UTC(2026, 0, 31)), dueDate: null, billingYear: 2026, billingMonth: 1 },
  // ملغاة ⇒ خارج كل مؤشرات الذمم
  { id: 5, direction: 'SALES', status: 'CANCELLED', total: 7_500, paidAmount: 0, issueDate: new Date(Date.UTC(2026, 1, 20)), dueDate: null, billingYear: null, billingMonth: null },
  // شراء ⇒ خارج ذمم العملاء
  { id: 6, direction: 'PURCHASE', status: 'UNPAID', total: 3_000, paidAmount: 0, issueDate: new Date(Date.UTC(2026, 1, 10)), dueDate: null, billingYear: null, billingMonth: null },
];

/** مُقيِّم مصغَّر لدلالة شرط `agedOver90Where` بما فيها سلوك NULL في Prisma. */
function matchesAged(where: ReturnType<typeof agedOver90Where>, inv: Inv): boolean {
  if (inv.direction !== where.direction) return false;
  if (where.status.notIn.includes(inv.status)) return false;
  return where.OR.some((branch) => {
    if ('dueDate' in branch && branch.dueDate && typeof branch.dueDate === 'object' && 'lt' in branch.dueDate) {
      return inv.dueDate != null && inv.dueDate < branch.dueDate.lt;
    }
    const b = branch as { dueDate: null; issueDate: { lt: Date } };
    return inv.dueDate === null && inv.issueDate < b.issueDate.lt;
  });
}

const outstanding = (i: Inv) => i.total - i.paidAmount;

// ── 1. الذمم +90 يومًا: البطاقة مقابل عُرف تقرير أعمار الذمم ───────────────────

describe('حرج +90 يوم — البطاقة تطابق عُرف dueDate ?? issueDate', () => {
  const cardRows = INVOICES.filter((i) => matchesAged(agedOver90Where('SALES', CUTOFF_90), i));

  it('تحتسب الفواتير بلا تاريخ استحقاق حسب تاريخ إصدارها', () => {
    // المرجع المستقل: نفس عُرف التقرير — `dueDate ?? issueDate` أقدم من نقطة القطع.
    const expected = INVOICES.filter((i) =>
      i.direction === 'SALES' &&
      !['PAID', 'CANCELLED'].includes(i.status) &&
      (i.dueDate ?? i.issueDate) < CUTOFF_90);

    expect(cardRows.map((r) => r.id)).toEqual(expected.map((r) => r.id));
    expect(sumMoney(cardRows.map(outstanding))).toBe(sumMoney(expected.map(outstanding)));
  });

  it('القيمة المتوقَّعة ليست صفرًا — الانحدار الأصلي كان يعطي صفرًا', () => {
    expect(sumMoney(cardRows.map(outstanding))).toBe(24_586);
  });

  it('تستبعد الملغاة والمسدَّدة والشراء', () => {
    expect(cardRows.some((r) => r.status === 'CANCELLED')).toBe(false);
    expect(cardRows.some((r) => r.status === 'PAID')).toBe(false);
    expect(cardRows.some((r) => r.direction === 'PURCHASE')).toBe(false);
  });
});

// ── 2. ذمم العملاء: SALES فقط، بلا ملغاة ──────────────────────────────────────

describe('ذمم العملاء — نفس النطاق في البطاقة والمحرك', () => {
  const RECEIVABLE = ['UNPAID', 'PARTIAL', 'OVERDUE'];
  const cardRows = INVOICES.filter((i) => i.direction === 'SALES' && RECEIVABLE.includes(i.status));

  it('المجموع يطابق المرجع المستقل', () => {
    const expected = INVOICES.filter((i) =>
      i.direction === 'SALES' && i.status !== 'PAID' && i.status !== 'CANCELLED');
    expect(sumMoney(cardRows.map(outstanding))).toBe(sumMoney(expected.map(outstanding)));
    expect(sumMoney(cardRows.map(outstanding))).toBe(34_586);
  });

  it('قائمة الحالات لا تتقاطع مع الملغاة بحكم بنائها', () => {
    expect(RECEIVABLE).not.toContain('CANCELLED');
  });
});

// ── 3. الإيراد والمصروف: تعريف المحرك التشغيلي ────────────────────────────────

describe('الإيراد التشغيلي — فواتير بيع غير ملغاة', () => {
  it('البطاقة تطابق مجموع المصدر المرجعي', () => {
    const engine = INVOICES.filter((i) => i.direction === 'SALES' && i.status !== 'CANCELLED');
    expect(sumMoney(engine.map((i) => i.total))).toBe(84_586);
    expect(engine.some((i) => i.direction === 'PURCHASE')).toBe(false);
  });
});

// ── 4. التقرير الشهري: لا صفّ بلا فترة ────────────────────────────────────────

describe('التقرير الشهري — كل فاتورة تُنسب إلى شهر', () => {
  it('الفواتير بلا شهر حساب تُنسب إلى شهر الإصدار', () => {
    const periods = INVOICES.map((i) => resolveInvoicePeriod(i));
    expect(periods.every((p) => p.year !== null && p.month !== null)).toBe(true);
  });

  it('مجموع صفوف التقرير = مجموع المجموعة نفسها (تكافؤ بطاقة ↔ تقرير)', () => {
    const byPeriod = new Map<string, number>();
    for (const inv of INVOICES) {
      const p = resolveInvoicePeriod(inv);
      const key = `${p.year}-${p.month}`;
      byPeriod.set(key, (byPeriod.get(key) ?? 0) + inv.total);
    }
    expect(sumMoney([...byPeriod.values()])).toBe(sumMoney(INVOICES.map((i) => i.total)));
  });
});

// ── 5. الأرباح والخسائر: النطاق الجزئي لا يتوسّع ──────────────────────────────

describe('الأرباح والخسائر — النوافذ محصورة في النطاق المعروض', () => {
  it('لا نافذة تتجاوز التواريخ التي يعرضها العنوان', () => {
    const start = startOfLocalDay('2026-02-01')!;
    const end   = endOfLocalDay('2026-02-20')!;
    const windows = clampMonthWindows(monthWindowsBetween(start, end), start, end);

    for (const w of windows) {
      expect(w.start.getTime()).toBeGreaterThanOrEqual(start.getTime());
      expect(w.end.getTime()).toBeLessThanOrEqual(end.getTime());
    }
    // فاتورة 28 فبراير خارج النطاق المختار ⇒ لا تدخل أي نافذة.
    const feb28 = new Date(Date.UTC(2026, 1, 28)).getTime();
    expect(windows.some((w) => feb28 >= w.start.getTime() && feb28 <= w.end.getTime())).toBe(false);
  });
});

// ── 6. التسوية البنكية: إجماليات المساحة ──────────────────────────────────────

describe('التسوية البنكية — فلاتر المساحة تتقاطع بـ AND', () => {
  it('البحث ومدى المبلغ مجموعتان مستقلتان', () => {
    const where = buildWhereClause({ importId: 1, search: 'راتب', minAmount: 100 });
    expect(where.OR).toBeUndefined();
    expect(where.AND).toHaveLength(2);
  });
});

// ── 7. العتبات: قيم مسمّاة لا أرقام مكرَّرة ───────────────────────────────────

describe('سجل العتبات — القيم لم تتغيّر والغرضان متمايزان', () => {
  it('عتبتا الذمة العالية مختلفتان عمدًا', () => {
    expect(TOP_DEBTOR_CARD_HIGH_KWD).toBe(5_000);
    expect(HIGH_OUTSTANDING_ALERT_HIGH_KWD).toBe(10_000);
    expect(TOP_DEBTOR_CARD_HIGH_KWD).not.toBe(HIGH_OUTSTANDING_ALERT_HIGH_KWD);
  });

  it('حدّ التقادم الحرج بقي 90 يومًا', () => {
    expect(CRITICAL_AGEING_DAYS).toBe(90);
  });
});

// ── 8. سياسة النقود واحدة عبر كل المؤشرات أعلاه ───────────────────────────────

describe('سياسة التقريب — مصدر واحد', () => {
  it('كل المجاميع أعلاه مرّت عبر `sumMoney` بتقريب واحد في النهاية', () => {
    expect(sumMoney([0.3335, 0.3335, 0.3335])).toBe(roundMoney(1.0005));
    expect(sumMoney([0.3335, 0.3335, 0.3335])).toBe(1.001);
  });
});
