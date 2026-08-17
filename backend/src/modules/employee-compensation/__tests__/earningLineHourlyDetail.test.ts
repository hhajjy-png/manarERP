import { describe, it, expect } from 'vitest';
import { computeCompensation } from '../engine';

/**
 * تفصيل الساعة على سطر الاستحقاق — `hours` و`rate`.
 *
 * ما تُثبته هذه الاختبارات تحديدًا: أن الحقلين **يشرحان مبلغًا** ولا يصنعان واقعة عمل.
 * فهما يُفحصان حسابيًا (الساعات × السعر = المبلغ)، ويُرفضان منفردين، ولا يظهر لهما أثر
 * واحد في أي عدّاد قانوني ولا في أي سطر عمل إضافي.
 */

const SALARY = 416; // أجر ساعة نظيف: 416 ÷ 208 = 2.000

const base = {
  basicSalary: SALARY,
  overtime: [] as never[],
  deductions: [] as never[],
};

describe('تفصيل الساعة — القبول', () => {
  it('يحفظ الساعات والسعر كما وردا حين يُنتج حاصلُ ضربهما المبلغ', () => {
    const r = computeCompensation({
      ...base,
      earnings: [{ type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7, rate: 4 }],
    });
    expect(r.earningLines[0].hours).toBe(7);
    expect(r.earningLines[0].rate).toBe(4);
    expect(r.earningLines[0].amount).toBe(28);
    expect(r.totalOtherEarnings).toBe(28);
  });

  it('يقبل بندًا ماليًا بحتًا بلا ساعة ولا سعر — كلاهما null لا صفر', () => {
    const r = computeCompensation({
      ...base,
      earnings: [{ type: 'CUSTOM', label: 'مصروفات', amount: 42 }],
    });
    expect(r.earningLines[0].hours).toBeNull();
    expect(r.earningLines[0].rate).toBeNull();
  });

  it('يقبل `null` الصريحة كما يقبل الإغفال', () => {
    const r = computeCompensation({
      ...base,
      earnings: [{ type: 'CUSTOM', label: 'مكافأة', amount: 20, hours: null, rate: null }],
    });
    expect(r.earningLines[0].hours).toBeNull();
    expect(r.earningLines[0].rate).toBeNull();
  });

  it('يقبل حاصل ضرب يحتاج تقريبًا إلى ثلاث خانات — لا يرفضه رفضًا كاذبًا', () => {
    // 3 × 4.335 = 13.005 بالضبط؛ والقيد يقارن الطرفين بعد تقريب الدينار الثلاثي.
    const r = computeCompensation({
      ...base,
      earnings: [{ type: 'CUSTOM', label: 'إضافي عادي', amount: 13.005, hours: 3, rate: 4.335 }],
    });
    expect(r.earningLines[0].amount).toBe(13.005);
  });

  it('يقبل أسعار التخطيط الثلاثة المستخدمة في الدفعة التاريخية', () => {
    const r = computeCompensation({
      ...base,
      earnings: [
        { type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7, rate: 4 },
        { type: 'CUSTOM', label: 'راحة أسبوعية', amount: 24, hours: 4, rate: 6 },
        { type: 'CUSTOM', label: 'عطلة رسمية', amount: 32, hours: 4, rate: 8 },
        { type: 'CUSTOM', label: 'مصروفات', amount: 42 },
        { type: 'CUSTOM', label: 'مكافأة', amount: 20 },
      ],
    });
    expect(r.totalOtherEarnings).toBe(146);
    expect(r.earningLines.map((l) => l.hours)).toEqual([7, 4, 4, null, null]);
    expect(r.earningLines.map((l) => l.rate)).toEqual([4, 6, 8, null, null]);
  });
});

describe('تفصيل الساعة — الرفض', () => {
  const bad = (earnings: unknown) => () => computeCompensation({ ...base, earnings: earnings as never });

  it('يرفض ساعات بلا سعر', () => {
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7 }])).toThrow(/معًا/);
  });

  it('يرفض سعرًا بلا ساعات', () => {
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 28, rate: 4 }])).toThrow(/معًا/);
  });

  it('يرفض حاصل ضرب لا يساوي المبلغ — رقمان يكذّبان الثالث لا يُطبعان', () => {
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 30, hours: 7, rate: 4 }])).toThrow(/28\.000/);
  });

  it('يرفض صفر ساعة — غيابُ التفصيل يُخزَّن null لا صفرًا', () => {
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 0, hours: 0, rate: 4 }])).toThrow(/أكبر من صفر/);
  });

  it('يرفض سعرًا صفريًا أو سالبًا', () => {
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 0, hours: 7, rate: 0 }])).toThrow(/أكبر من صفر/);
    expect(bad([{ type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7, rate: -4 }])).toThrow(/أكبر من صفر/);
  });
});

describe('تفصيل الساعة لا يصنع عملًا إضافيًا', () => {
  it('لا يُنشئ سطر عمل إضافي ولا يحرّك إجمالي الإضافي', () => {
    const r = computeCompensation({
      ...base,
      earnings: [
        { type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7, rate: 4 },
        { type: 'CUSTOM', label: 'عطلة رسمية', amount: 32, hours: 4, rate: 8 },
      ],
    });
    expect(r.overtimeLines).toHaveLength(0);
    expect(r.totalOvertimeAmount).toBe(0);
    // المبلغ كله «استحقاقات أخرى»، لا فلس منه في خانة العمل الإضافي.
    expect(r.totalOtherEarnings).toBe(60);
    expect(r.grossEntitlements).toBe(SALARY + 60);
  });

  it('لا يولّد تحذير تجاوز حدّ ساعات الإضافي مهما بلغت ساعات البنود', () => {
    // ٢٠٠ ساعة على سطر مالي تفوق أي حدّ شهري للإضافي؛ ومع ذلك لا حدّ يُفحص أصلًا
    // لأن هذه ليست ساعات عمل مؤرَّخة — وهذا هو جوهر الفصل بين الدفترين.
    const r = computeCompensation({
      ...base,
      earnings: [{ type: 'CUSTOM', label: 'إضافي عادي', amount: 800, hours: 200, rate: 4 }],
    });
    expect(r.warnings).toHaveLength(0);
    expect(r.overtimeLines).toHaveLength(0);
  });

  it('لا يخلط ساعات البنود بساعات الإضافي الحقيقية في الشهر نفسه', () => {
    const r = computeCompensation({
      ...base,
      overtime: [{ overtimeType: 'REGULAR', hours: 5 }] as never,
      earnings: [{ type: 'CUSTOM', label: 'إضافي عادي', amount: 28, hours: 7, rate: 4 }],
    });
    // سطر الإضافي الحقيقي وحده هو ما يظهر في دفتر الإضافي، بساعاته هو لا بمجموعهما.
    expect(r.overtimeLines).toHaveLength(1);
    expect(r.overtimeLines[0].hours).toBe(5);
    expect(r.earningLines[0].hours).toBe(7);
  });
});
