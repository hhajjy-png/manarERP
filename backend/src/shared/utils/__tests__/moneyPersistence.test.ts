import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { roundMoney } from '../money';

/**
 * تطبيع حدود التخزين.
 *
 * أربعة مسارات كانت تكتب النقود **خامًا** كما وصلت من المستخدم أو من حساب داخلي:
 *
 *   • `Payment.amount`         — بينما `invoice.paidAmount` يُخزَّن مقرَّبًا ⇒ مصدران
 *                                بدقّتين مختلفتين لنفس الحقيقة (الأعمار والكشوف تقرأ
 *                                الأول، والفاتورة تقرأ الثاني).
 *   • القيد اليدوي debit/credit — قيم دون-الفلس تدخل الأستاذ العام مباشرةً.
 *   • `Cheque.amount`          — والمبلغ يُطبَع على **ورقة بنكية**.
 *   • مجاميع المخزون الداخلة إلى GL — محسوبة بستّ خانات ثم تُرحَّل كما هي.
 *
 * الخادم هو المرجع: تقريب الواجهة ليس حجّة، وقد لا تمرّ الكتابة عبر الواجهة أصلًا.
 * الاختبار بنيويّ (يقرأ الكود) لأن هذه حدود كتابة، لا دوال نقية.
 */

const code = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');

describe('السياسة على القيم التي كانت تُخزَّن خامًا', () => {
  it.each([
    [1.2344, 1.234],
    [1.2345, 1.235],
    [-1.2345, -1.235],
    [0.1 + 0.2, 0.3],
    [0, 0],
    [-0.0001, 0],       // لا -0
    [9_999_999.9994, 9_999_999.999],
  ])('roundMoney(%s) → %s', (input, expected) => {
    expect(Object.is(roundMoney(input), expected)).toBe(true);
  });
});

describe('حدود التخزين مطبَّعة فعلًا', () => {
  it('Payment.amount يُخزَّن مطبَّعًا — ومن نفس القيمة التي تُحدّث paidAmount', () => {
    const src = code('src/modules/invoices/invoices.service.ts');
    expect(src).toContain('const paymentAmount = roundMoney(input.amount);');
    expect(src).toContain('amount: paymentAmount,');
    // لا مصدرين: المجموع الجديد يُحسب من المبلغ المطبَّع نفسه لا من الخام.
    expect(src).toContain('round3(current.paidAmount + paymentAmount)');
    expect(src).not.toContain('amount: input.amount,');
    // ...ومن قراءة **داخل** المعاملة: القراءة قبلها كانت تسمح بتحديث مفقود يجعل
    // `Σ payments.amount` ينحرف عن `invoice.paidAmount` عند إرسالين متزامنين.
    expect(src).toContain('const current = await tx.invoice.findUnique({ where: { id } });');
  });

  it('القيد اليدوي: debit/credit يُطبَّعان قبل الكتابة', () => {
    const src = code('src/modules/accounting/accounting.service.ts');
    expect(src).toContain('debit: roundMoney(l.debit ?? 0)');
    expect(src).toContain('credit: roundMoney(l.credit ?? 0)');
    expect(src).not.toContain('debit: l.debit ?? 0,');
  });

  it('مبلغ الشيك يُطبَّع — إنشاءً وتعديلًا', () => {
    const src = code('src/modules/cheques/cheques.service.ts');
    expect(src).toContain('amount: roundMoney(input.amount)');
    expect(src).toContain('roundMoney(input.amount)');
    expect(src).not.toContain('amount: input.amount,');
  });

  it('مجاميع المخزون تُطبَّع **عند حدّ الترحيل** لا قبله', () => {
    const src = code('src/modules/inventory/inventory.service.ts');
    expect(src).toContain('debit: roundMoney(receipt.totalCost)');
    expect(src).toContain('debit: roundMoney(totalCost)');
  });

  it('تكلفة الوحدة تبقى بستّ خانات — التقييم الداخلي لم يُقرَّب إلى الفلس', () => {
    const calc = code('src/modules/inventory/inventory.calc.ts'); // بلا تعليقات: التعليق يشرح السياسة ويذكر الاسم
    expect(calc).toContain('1_000_000');   // ستّ خانات كما هي
    expect(calc).not.toContain('roundMoney'); // ولا تطبيع نقدي داخل حساب التقييم نفسه
  });

  it('الكميات لا تُقرَّب إطلاقًا — ليست نقودًا', () => {
    const calc = code('src/modules/inventory/inventory.calc.ts');
    // calcWAC يقرّب **الناتج** (تكلفة) ولا يمسّ newQty ولا الكميات الداخلة.
    expect(calc).not.toMatch(/round\w*\(\s*newQty/);
    expect(calc).not.toMatch(/round\w*\(\s*incomingQty/);
  });
});

describe('توحيد العائلات — لا تعريف تقريب ثانٍ في الخلفية', () => {
  const FILES = [
    'src/shared/services/gl.service.ts',
    'src/modules/invoices/invoices.calc.ts',
    'src/modules/payroll/payroll.calc.ts',
    'src/shared/services/financial/balance.utils.ts',
    'src/modules/bankStatementImport/normalizer.ts',
    'src/modules/statements/statements.controller.ts',
    'src/modules/dashboard/dashboard.service.ts',
    'src/modules/executive/executive.service.ts',
    'src/modules/executive/financial-exec.service.ts',
    'src/modules/contracts/contracts.service.ts',
    'src/shared/services/financial/export/summary.export.adapter.ts',
  ];

  it.each(FILES)('%s لا يعرّف تقريبًا نقديًا خاصًا به', (file) => {
    const src = code(file);
    expect(src).not.toMatch(/Math\.round\([^)]*\* 1000\)/); // لا مقياس ١٠٠٠ يدوي
    expect(src).not.toMatch(/toFixed\(3\)/);                 // ولا عائلة toFixed
  });

  it('وحدة النقود هي المصدر الوحيد — والجميع يستوردها', () => {
    for (const file of FILES) {
      expect(readFileSync(file, 'utf8')).toMatch(/utils\/money/);
    }
  });
});
