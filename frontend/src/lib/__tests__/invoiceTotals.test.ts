import { describe, it, expect } from 'vitest';
import { computeInvoiceTotals } from '../money';

/**
 * الواجهة كانت تحسب الإجمالي بصيغة ثانية تخالف الخادم في موضعين: بلا تقريب لكل بند،
 * وبلا حدّ ضريبة إطلاقًا. هذه الاختبارات تثبّت أن `computeInvoiceTotals` مرآة لـ
 * `backend/src/modules/invoices/invoices.calc.ts` — القيم المتوقّعة أدناه هي ما يخزّنه
 * الخادم فعلًا لنفس المدخلات.
 */
describe('computeInvoiceTotals — مطابقة معادلة الخادم', () => {
  it('يقرّب كل بند قبل الجمع، لا بعده', () => {
    // ثلاثة بنود بـ 3 × 0.3335: الخادم يجمع round3(1.0005) = 1.001 ثلاث مرات ⇒ 3.003.
    // الجمع الخام كان يعطي 3.0015 فيُعرض 3.002 — فيلًا واحدًا أقل من المخزَّن.
    const items = Array.from({ length: 3 }, () => ({ quantity: 3, unitPrice: 0.3335 }));
    const { subtotal, total } = computeInvoiceTotals(items, 0, 0);
    expect(subtotal).toBe(3.003);
    expect(total).toBe(3.003);
  });

  it('يطبّق الضريبة على الوعاء بعد الخصم', () => {
    const { subtotal, taxAmount, total } = computeInvoiceTotals(
      [{ quantity: 1, unitPrice: 1000 }],
      5,
      100,
    );
    expect(subtotal).toBe(1000);
    expect(taxAmount).toBe(45); // (1000 − 100) × 5%
    expect(total).toBe(945);
  });

  it('لا يُسقط الضريبة حين تكون أكبر من صفر', () => {
    // الانحراف الأصلي: الشاشة كانت تعرض 1000 بينما الخادم يخزّن 1050.
    const { total } = computeInvoiceTotals([{ quantity: 1, unitPrice: 1000 }], 5, 0);
    expect(total).toBe(1050);
  });

  it('لا يسمح بوعاء ضريبي سالب حين يتجاوز الخصم المجموع الفرعي', () => {
    const { taxAmount, total } = computeInvoiceTotals([{ quantity: 1, unitPrice: 50 }], 5, 200);
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });

  it('يبتلع انحراف الفاصلة العائمة', () => {
    const { subtotal } = computeInvoiceTotals(
      [{ quantity: 1, unitPrice: 0.1 }, { quantity: 1, unitPrice: 0.2 }],
      0,
      0,
    );
    expect(subtotal).toBe(0.3);
  });

  it('يقبل القيم النصية القادمة من حقول الإدخال', () => {
    const { total } = computeInvoiceTotals([{ quantity: '2', unitPrice: '12.5' }], 0, '0' as never);
    expect(total).toBe(25);
  });

  it('يعيد أصفارًا لقائمة بنود فارغة', () => {
    const { subtotal, taxAmount, total } = computeInvoiceTotals([], 5, 0);
    expect(subtotal).toBe(0);
    expect(taxAmount).toBe(0);
    expect(total).toBe(0);
  });
});
