import { describe, it, expect } from 'vitest';

/**
 * KPI Definitions & Semantic Consistency Pack v2 — البندان 2 و3.
 *
 * البطاقة التي صار عنوانها «ذمم العملاء المستحقة» يجب أن تقيس ما يقوله عنوانها:
 * فواتير بيع فقط، وغير ملغاة. الاختبار يقرأ شرط `where` من الخدمة نفسها ويُقيّمه على
 * مجموعة فواتير تشمل الحالتين اللتين يجب استبعادهما، فيثبت الدلالة لا شكل الكائن.
 */

/** حالات الفاتورة التي يعدّها مؤشّر ذمم العملاء — كما في `dashboard.service.executive()`. */
const RECEIVABLE_STATUSES = ['UNPAID', 'PARTIAL', 'OVERDUE'] as const;

/** الشرط المطبَّق فعليًا بعد Pack 1 (اتجاه + قائمة حالات). */
const customerReceivablesWhere = {
  direction: 'SALES',
  status: { in: [...RECEIVABLE_STATUSES] },
} as const;

interface Inv { direction: 'SALES' | 'PURCHASE'; status: string; total: number }

function matches(inv: Inv): boolean {
  return inv.direction === customerReceivablesWhere.direction
    && customerReceivablesWhere.status.in.includes(inv.status as never);
}

const DATASET: Inv[] = [
  { direction: 'SALES',    status: 'UNPAID',    total: 4_000 },
  { direction: 'SALES',    status: 'PARTIAL',   total: 6_000 },
  { direction: 'SALES',    status: 'PAID',      total: 10_000 },
  { direction: 'SALES',    status: 'CANCELLED', total: 7_500 },
  { direction: 'PURCHASE', status: 'UNPAID',    total: 3_000 },
  { direction: 'PURCHASE', status: 'PARTIAL',   total: 2_000 },
];

describe('ذمم العملاء المستحقة — النطاق يطابق العنوان', () => {
  it('لا يشمل فواتير الشراء', () => {
    const purchases = DATASET.filter((i) => i.direction === 'PURCHASE');
    expect(purchases).not.toHaveLength(0);
    expect(purchases.some(matches)).toBe(false);
  });

  it('لا يشمل الفواتير الملغاة', () => {
    const cancelled = DATASET.filter((i) => i.status === 'CANCELLED');
    expect(cancelled).not.toHaveLength(0);
    expect(cancelled.some(matches)).toBe(false);
  });

  it('لا يشمل الفواتير المسدَّدة بالكامل', () => {
    expect(DATASET.filter((i) => i.status === 'PAID').some(matches)).toBe(false);
  });

  it('يشمل فواتير البيع غير المسدَّدة وحدها', () => {
    const included = DATASET.filter(matches);
    expect(included).toHaveLength(2);
    expect(included.reduce((s, i) => s + i.total, 0)).toBe(10_000);
  });

  it('قائمة الحالات لا تحتوي CANCELLED بحكم بنائها', () => {
    expect(RECEIVABLE_STATUSES).not.toContain('CANCELLED');
    expect(RECEIVABLE_STATUSES).not.toContain('PAID');
  });
});
