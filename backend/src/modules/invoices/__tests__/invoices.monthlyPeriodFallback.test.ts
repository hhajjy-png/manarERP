import { describe, it, expect } from 'vitest';
import { resolveInvoicePeriod } from '../invoices.service';

/**
 * Financial Accuracy Hotfix Pack v1 — البند 5.
 *
 * التقرير الشهري كان يجمّع على `billingYear/billingMonth` وحدهما. الحقلان اختياريان
 * ولا تحملهما الفواتير المستورَدة تاريخيًا (70 من 113 في بيانات التطوير، تحمل 65.4%
 * من قيمة الفواتير)، فكانت كلها تتجمّع في صفٍّ واحد بلا فترة يبتلع أغلب القيمة.
 */

describe('resolveInvoicePeriod — الرجوع إلى تاريخ الإصدار', () => {
  it('يستخدم شهر/سنة الحساب حين يكونان محفوظين', () => {
    expect(resolveInvoicePeriod({
      billingMonth: 3, billingYear: 2026,
      issueDate: new Date(2026, 6, 31),
    })).toEqual({ year: 2026, month: 3 });
  });

  it('يرجع إلى شهر/سنة تاريخ الإصدار حين يغيب شهر الحساب (الانحدار المُصلَح)', () => {
    expect(resolveInvoicePeriod({
      billingMonth: null, billingYear: null,
      issueDate: new Date(2026, 1, 28), // فبراير 2026
    })).toEqual({ year: 2026, month: 2 });
  });

  it('يرجع إلى تاريخ الإصدار حين يوجد أحد الحقلين دون الآخر', () => {
    expect(resolveInvoicePeriod({
      billingMonth: 5, billingYear: null, issueDate: new Date(2026, 0, 15),
    })).toEqual({ year: 2026, month: 1 });

    expect(resolveInvoicePeriod({
      billingMonth: null, billingYear: 2026, issueDate: new Date(2026, 0, 15),
    })).toEqual({ year: 2026, month: 1 });
  });

  it('يستخدم التقويم المحلي فلا تنزلق فاتورة أول الشهر إلى الشهر السابق', () => {
    // منتصف ليل محلي في أول أغسطس — بتوقيت الكويت (UTC+3) يقابله 31 يوليو بـUTC.
    expect(resolveInvoicePeriod({
      billingMonth: null, billingYear: null, issueDate: new Date(2026, 7, 1, 0, 0, 0),
    })).toEqual({ year: 2026, month: 8 });
  });

  it('يُرجع فترة فارغة فقط حين يغيب كل مصدر للتاريخ', () => {
    expect(resolveInvoicePeriod({ billingMonth: null, billingYear: null, issueDate: null }))
      .toEqual({ year: null, month: null });
  });

  it('لا فاتورة من بيانات التطوير تسقط في مجموعة «بلا فترة» بعد الإصلاح', () => {
    // عيّنة تمثّل الحالتين الحقيقيتين: مستورَدة بلا شهر حساب، ومُنشأة به.
    const sample = [
      { billingMonth: null, billingYear: null, issueDate: new Date(2025, 8, 30) },
      { billingMonth: null, billingYear: null, issueDate: new Date(2025, 11, 31) },
      { billingMonth: 7,    billingYear: 2026, issueDate: new Date(2026, 6, 31) },
    ];
    const periods = sample.map(resolveInvoicePeriod);
    expect(periods.every((p) => p.year !== null && p.month !== null)).toBe(true);
    expect(periods).toEqual([
      { year: 2025, month: 9 },
      { year: 2025, month: 12 },
      { year: 2026, month: 7 },
    ]);
  });
});
