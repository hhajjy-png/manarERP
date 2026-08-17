// @vitest-environment jsdom
/**
 * سند الصرف النقدي — ما يُطبع وما لا يُطبع.
 *
 * ═══ ما تحرسه هذه الاختبارات ═══
 * السند ورقةٌ يوقّع عليها الموظف باستلام **نقد في يده**. فالمبلغ المفقَّط والمطبوع
 * يجب أن يكون الصافي النقدي وحده — لا الصافي المخزَّن الذي يضمّ راتبًا حُوّل إلى
 * البنك — ورمز التحقق يجب أن يبقى **حتميًا**: سندٌ يُعاد طبعه بمحتوى رمز مختلف يفقد
 * قيمته كإثبات. وسندُ صفرٍ لا يُطبع أصلًا.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from '@testing-library/react';
import CashPaymentVoucherTemplate, {
  buildVoucherQrLines,
  lineDetail,
  voucherDescription,
  voucherPeriod,
} from '../employee-compensation/CashPaymentVoucherTemplate';
import { voucherReference } from '../pages/EmployeeCompensationVoucher';
import { amountToWordsKWD } from '../lib/tafqeet';
import type { StatementData } from '../employee-compensation/types';

const plain = (s: string | null | undefined) => (s ?? '').replace(/[⁦-⁩‎‏]/g, '').replace(/\s+/g, ' ').trim();

function statement(over: Partial<StatementData> = {}): StatementData {
  return {
    id: 7, year: 2026, month: 7, status: 'DRAFT',
    approvedAt: null, approvedByName: null, preparedByName: null,
    employee: { code: 'E-002', fullName: 'موظف تجريبي', jobTitle: 'سائق شاحنة', department: null, nationality: null, civilId: null },
    basicSalary: 150,
    overtime: [],
    earnings: [
      { label: 'إضافي عادي', type: 'CUSTOM', amount: 28, hours: 7, rate: 4 },
      { label: 'راحة أسبوعية', type: 'CUSTOM', amount: 24, hours: 4, rate: 6 },
      { label: 'مصروفات', type: 'CUSTOM', amount: 48, hours: null, rate: null },
    ],
    deductions: [],
    totals: { totalOvertimeAmount: 0, totalOtherEarnings: 100, grossEntitlements: 250, totalDeductions: 0, netAmount: 250 },
    notes: null,
    ...over,
  } as StatementData;
}

const ref = (d: StatementData) => voucherReference(d);
const renderVoucher = (d: StatementData) => render(<CashPaymentVoucherTemplate data={d} reference={ref(d)} />);

// ─── مبلغ السند ───────────────────────────────────────────────────────────────

describe('مبلغ السند = netAmount − basicSalarySnapshot', () => {
  it('راتب 150 · صافي مخزَّن 250 ⇒ نقدًا 100.000', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).toContain('100.000 KD');
    // الصافي المخزَّن لا يظهر على سندٍ يوقَّع باستلام نقد.
    expect(text).not.toContain('250.000');
  });

  it('سليمان — راتب 450 · صافي مخزَّن 570 ⇒ نقدًا 120.000', () => {
    const d = statement({
      basicSalary: 450,
      earnings: [
        { label: 'إضافي عادي', type: 'CUSTOM', amount: 36, hours: 9, rate: 4 },
        { label: 'عطلة رسمية', type: 'CUSTOM', amount: 32, hours: 4, rate: 8 },
        { label: 'مصروفات', type: 'CUSTOM', amount: 52, hours: null, rate: null },
      ],
      totals: { totalOvertimeAmount: 0, totalOtherEarnings: 120, grossEntitlements: 570, totalDeductions: 0, netAmount: 570 },
    });
    const text = plain(renderVoucher(d).container.textContent);
    expect(text).toContain('450.000 KD');
    expect(text).toContain('120.000 KD');
    expect(text).not.toContain('570.000');
  });

  it('مع خصم 20 ⇒ نقدًا 80.000 — الأساسي لا يُطرح مرتين', () => {
    const d = statement({
      deductions: [{ label: 'سلفة', type: 'ADVANCE', amount: 20 }],
      totals: { totalOvertimeAmount: 0, totalOtherEarnings: 100, grossEntitlements: 250, totalDeductions: 20, netAmount: 230 },
    });
    const text = plain(renderVoucher(d).container.textContent);
    expect(text).toContain('100.000 KD'); // إجمالي المستحقات الإضافية
    expect(text).toContain('(20.000 KD)'); // الاستقطاعات بين قوسين
    expect(text).toContain('80.000 KD'); // صافي المصروف نقدًا
    expect(text).not.toContain('230.000');
  });

  it('الراتب الأساسي معروض للمعلومية ومعه مساره البنكي', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).toContain('الراتب الأساسي');
    expect(text).toContain('150.000 KD');
    expect(text).toContain('تم تحويله إلى البنك');
    expect(text).toContain('Transferred to Bank');
  });
});

// ─── التفقيط ──────────────────────────────────────────────────────────────────

describe('التفقيط — المبلغ النقدي وحده، بالمُساعد الإداري القائم', () => {
  it('العربي والإنجليزي مأخوذان من `amountToWordsKWD` للصافي النقدي', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).toContain(amountToWordsKWD(100, 'ar'));
    expect(text).toContain(amountToWordsKWD(100, 'en'));
  });

  it('لا يفقّط الصافي المخزَّن ولا الراتب الأساسي', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).not.toContain(amountToWordsKWD(250, 'ar')); // الصافي المخزَّن
    expect(text).not.toContain(amountToWordsKWD(150, 'en')); // الراتب الأساسي
  });

  it('يفقّط الصافي النقدي مع وجود خصم — 80 لا 100 ولا 230', () => {
    const d = statement({
      deductions: [{ label: 'سلفة', type: 'ADVANCE', amount: 20 }],
      totals: { totalOvertimeAmount: 0, totalOtherEarnings: 100, grossEntitlements: 250, totalDeductions: 20, netAmount: 230 },
    });
    const text = plain(renderVoucher(d).container.textContent);
    expect(text).toContain(amountToWordsKWD(80, 'en'));
    expect(text).not.toContain(amountToWordsKWD(230, 'en'));
  });
});

// ─── البنود والوحدات ──────────────────────────────────────────────────────────

describe('تفاصيل البنود — من hours/rate لا من الملاحظات', () => {
  it('يعرض «7 hour × 4.000 KD» للبند المسعّر بالساعة', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).toContain('7 hour × 4.000 KD');
    expect(text).toContain('4 hour × 6.000 KD');
  });

  it('يعرض «—» للبند المالي البحت', () => {
    expect(lineDetail(null, null)).toBe('—');
    expect(lineDetail(7, 4)).toBe('7 hour × 4.000 KD');
  });

  it('يستخدم المسميات الحالية بلا أثر لأي وسم تخطيطي', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).toContain('إضافي عادي');
    expect(text).toContain('راحة أسبوعية');
    expect(text).toContain('مصروفات');
    for (const banned of ['توزيع تخطيطي', 'تخطيطي', 'PLANNING_ONLY']) {
      expect(text).not.toContain(banned);
    }
  });

  it('لا يعرض الملاحظات ولا أي بيانات وصفية', () => {
    const d = statement({ notes: 'ملاحظة داخلية يجب ألا تظهر' });
    const text = plain(renderVoucher(d).container.textContent);
    expect(text).not.toContain('ملاحظة داخلية');
  });

  it('العملة KD والزمن hour — لا د.ك ولا KWD ولا «ساعة»', () => {
    const text = plain(renderVoucher(statement()).container.textContent);
    expect(text).not.toContain('د.ك');
    expect(text).not.toContain('KWD');
    expect(text).not.toMatch(/\d\s*ساعات?\b/);
  });
});

// ─── رمز التحقق ───────────────────────────────────────────────────────────────

describe('رمز التحقق — حتمي بلا تاريخ أو وقت طباعة', () => {
  const d = statement();

  it('ينتج المحتوى نفسه في كل استدعاء', () => {
    expect(buildVoucherQrLines(d, ref(d))).toEqual(buildVoucherQrLines(d, ref(d)));
  });

  it('لا يحمل تاريخ طباعة ولا وقتها ولا أي قيمة متغيّرة', () => {
    const payload = buildVoucherQrLines(d, ref(d)).join('\n');
    for (const banned of ['printDate', 'printedAt', 'timestamp', 'generatedAt', 'تاريخ الطباعة', 'Printed']) {
      expect(payload).not.toContain(banned);
    }
    // لا سنة/تاريخ إلا فترة الحسبة نفسها — لا نمط تاريخ كامل ولا وقت.
    expect(payload).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(payload).not.toMatch(/\d{2}:\d{2}/);
  });

  it('يحمل المرجع والاسم والرقم والفترة والمبلغ النقدي', () => {
    const lines = buildVoucherQrLines(d, ref(d));
    expect(lines[0]).toContain('ECV-2026-07-E-002');
    expect(lines[1]).toContain('موظف تجريبي');
    expect(lines[2]).toContain('E-002');
    expect(lines[3]).toContain(voucherPeriod(2026, 7));
    expect(lines[4]).toContain('100.000 KD');
    expect(lines[4]).not.toContain('250.000');
  });
});

// ─── المرجع · البيان · الفترة ─────────────────────────────────────────────────

describe('المرجع والبيان', () => {
  it('المرجع مشتقّ من سجل الحسبة وحده — مستقر لإعادة الطباعة', () => {
    expect(voucherReference(statement())).toBe('ECV-2026-07-E-002');
    expect(voucherReference(statement())).toBe(voucherReference(statement()));
  });

  it('البيان جملة عربية واحدة بالشهر والسنة', () => {
    expect(voucherDescription(2026, 7)).toBe('صرف المستحقات النقدية للموظف عن شهر يوليو 2026');
  });
});

// ─── لا مبلغ نقدي ─────────────────────────────────────────────────────────────

describe('منع الطباعة عند انعدام المبلغ النقدي', () => {
  const src = readFileSync('src/pages/EmployeeCompensationVoucher.tsx', 'utf8');

  it('الصفحة تحجب السند بنيويًا عند cashNet <= 0', () => {
    expect(src).toContain('cash.cashNet <= 0');
    expect(src).toContain('لا يوجد مبلغ نقدي مستحق للصرف لهذا الشهر.');
    expect(src).toContain('There is no cash entitlement to pay for this month.');
    // الحجب يسبق `FormLayout` — لا مسار طباعة يُركَّب أصلًا.
    expect(src.indexOf('cash.cashNet <= 0')).toBeLessThan(src.indexOf('<FormLayout'));
  });

  it('زر السند في شاشة الشهر معطَّل عند انعدام المبلغ', () => {
    const month = readFileSync('src/pages/EmployeeCompensationMonth.tsx', 'utf8');
    expect(month).toContain('const cashNet = saved ? Number((saved.netAmount - saved.basicSalarySnapshot).toFixed(3)) : 0;');
    expect(month).toContain('disabled={!saved || cashNet <= 0}');
  });
});

// ─── الطباعة: ورقة واحدة · لا ترويسة/تذييل · لا تاريخ طباعة ───────────────────

describe('عقد الطباعة', () => {
  const page = readFileSync('src/pages/EmployeeCompensationVoucher.tsx', 'utf8');
  const tpl = readFileSync('src/employee-compensation/CashPaymentVoucherTemplate.tsx', 'utf8');

  it('A4 عبر ملف تعريف ورق الشركة الرسمي — ٤٠مم أعلى و٢٠مم أسفل', () => {
    expect(page).toContain("'letterhead'");
    // لا فاصل علوي إضافي: هوامش الملف التعريفي هي المواصفة نفسها.
    expect(page).not.toContain('contentTopOffset="');
  });

  it('لا ترويسة ولا تذييل إلكترونيَّين ولا خطّ زخرفي', () => {
    expect(page).toContain('hideApprovalSection');
    expect(page).toContain('hideFormNumber');
    expect(page).toContain('hideTitleRule');
  });

  it('لا تاريخ ولا وقت طباعة في القالب — لا ساعة جهاز إطلاقًا', () => {
    const code = tpl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const banned of ['new Date(', 'Date.now(', 'toLocaleDateString', 'issueDateStr']) {
      expect(code, `القالب يقرأ ساعة الجهاز: ${banned}`).not.toContain(banned);
    }
  });

  it('لا يعيد كتابة منطق المبلغ — يستدعي الاشتقاق المشترك', () => {
    expect(tpl).toContain('deriveCashEntitlement');
    const code = tpl.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toContain('netAmount -');
    expect(code).not.toContain('grossEntitlements -');
  });

  it('يستعمل مُفقِّط النظام القائم لا نسخة جديدة', () => {
    expect(tpl).toContain("from '../lib/tafqeet'");
    expect(tpl).toContain('amountToWordsKWD');
  });

  it('عقدة طباعة واحدة — القالب لا ينشئ `.form-page` ثانية', () => {
    const { container } = renderVoucher(statement());
    expect(container.querySelectorAll('.form-page')).toHaveLength(0);
  });
});

// ─── سند الصرف الإداري لم يتغيّر ──────────────────────────────────────────────

describe('سند الصرف الإداري مرجع لا ضحيّة', () => {
  it('لم يُعدَّل قالبه ولم تُضف إليه أعلام شرطية جديدة', () => {
    const admin = readFileSync('src/forms/PaymentVoucherTemplate.tsx', 'utf8');
    expect(admin).toContain('سند صرف / PAYMENT VOUCHER');
    expect(admin).not.toContain('cashNet');
    expect(admin).not.toContain('deriveCashEntitlement');
  });

  it('صفحته لا تفعّل `hideTitleRule` فيبقى مخرجها كما هو', () => {
    const adminPage = readFileSync('src/pages/AdminPaymentVoucher.tsx', 'utf8');
    expect(adminPage).toContain('title=""');
    expect(adminPage).not.toContain('hideTitleRule');
  });

  it('`hideTitleRule` مُعطَّل افتراضيًا في `FormLayout`', () => {
    const layout = readFileSync('src/forms/shared/FormLayout.tsx', 'utf8');
    expect(layout).toContain('hideTitleRule = false');
  });
});
