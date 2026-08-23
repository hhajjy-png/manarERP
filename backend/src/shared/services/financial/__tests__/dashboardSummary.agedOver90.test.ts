import { describe, it, expect } from 'vitest';
import { agedOver90Where } from '../dashboard-summary.service';

/**
 * Financial Accuracy Hotfix Pack v1 — البند 1.
 *
 * بطاقتا «حرج +90 يوم» كانتا تفلتران على `dueDate < cutoff` وحده. تاريخ الاستحقاق
 * اختياري، وكل الفواتير المستورَدة تاريخيًا تحمل `dueDate = NULL`، و Prisma لا يطابق
 * NULL بمعامل `lt` — فكانت البطاقة تعرض 0.000 د.ك بينما ذمم متقادمة فعليًا قائمة.
 *
 * الاختبار يعمل على شرط `where` مباشرةً (بلا قاعدة بيانات) ويُحاكي دلالة Prisma
 * بمُقيِّم صغير، فيُثبت السلوك لا شكل الكائن وحده.
 */

const CUTOFF = new Date('2026-05-24T00:00:00.000Z'); // 90 يومًا قبل 2026-08-22

interface Inv { dueDate: Date | null; issueDate: Date; status: string; direction: string }

/** مُقيِّم مصغَّر لدلالة الشرط الذي تبنيه `agedOver90Where` (بما فيها سلوك NULL). */
function matches(where: ReturnType<typeof agedOver90Where>, inv: Inv): boolean {
  if (inv.direction !== where.direction) return false;
  if (where.status.notIn.includes(inv.status)) return false;
  return where.OR.some((branch) => {
    if ('dueDate' in branch && branch.dueDate && typeof branch.dueDate === 'object' && 'lt' in branch.dueDate) {
      // Prisma: `lt` لا يطابق NULL إطلاقًا.
      return inv.dueDate != null && inv.dueDate < branch.dueDate.lt;
    }
    // الفرع الثاني: dueDate IS NULL AND issueDate < cutoff
    const b = branch as { dueDate: null; issueDate: { lt: Date } };
    return inv.dueDate === null && inv.issueDate < b.issueDate.lt;
  });
}

const salesWhere = agedOver90Where('SALES', CUTOFF);

describe('agedOver90Where — رجوع تاريخ الاستحقاق إلى تاريخ الإصدار', () => {
  it('يحتسب فاتورة بلا تاريخ استحقاق تجاوز إصدارها 90 يومًا (الانحدار المُصلَح)', () => {
    // MN-INV-2026-0148 في بيانات التطوير: dueDate=NULL، أُصدرت 2026-02-28 (175 يومًا).
    const inv: Inv = {
      dueDate: null,
      issueDate: new Date('2026-02-28T00:00:00.000Z'),
      status: 'UNPAID',
      direction: 'SALES',
    };
    expect(matches(salesWhere, inv)).toBe(true);
  });

  it('لا يحتسب فاتورة بلا تاريخ استحقاق أُصدرت داخل التسعين يومًا', () => {
    const inv: Inv = {
      dueDate: null,
      issueDate: new Date('2026-07-31T00:00:00.000Z'),
      status: 'UNPAID',
      direction: 'SALES',
    };
    expect(matches(salesWhere, inv)).toBe(false);
  });

  it('يحتسب فاتورة تجاوز تاريخ استحقاقها 90 يومًا (السلوك القديم محفوظ)', () => {
    const inv: Inv = {
      dueDate: new Date('2026-01-15T00:00:00.000Z'),
      issueDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'PARTIAL',
      direction: 'SALES',
    };
    expect(matches(salesWhere, inv)).toBe(true);
  });

  it('تاريخ الاستحقاق يسبق تاريخ الإصدار في الأولوية — إصدار قديم واستحقاق حديث لا يُحتسب', () => {
    const inv: Inv = {
      dueDate: new Date('2026-08-01T00:00:00.000Z'),
      issueDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'UNPAID',
      direction: 'SALES',
    };
    expect(matches(salesWhere, inv)).toBe(false);
  });

  it('يستبعد المسدَّدة والملغاة مهما تقادمت', () => {
    for (const status of ['PAID', 'CANCELLED']) {
      const inv: Inv = {
        dueDate: null,
        issueDate: new Date('2025-01-01T00:00:00.000Z'),
        status,
        direction: 'SALES',
      };
      expect(matches(salesWhere, inv)).toBe(false);
    }
  });

  it('يفصل ذمم العملاء عن ذمم الموردين', () => {
    const purchase: Inv = {
      dueDate: null,
      issueDate: new Date('2026-01-01T00:00:00.000Z'),
      status: 'UNPAID',
      direction: 'PURCHASE',
    };
    expect(matches(salesWhere, purchase)).toBe(false);
    expect(matches(agedOver90Where('PURCHASE', CUTOFF), purchase)).toBe(true);
  });
});
