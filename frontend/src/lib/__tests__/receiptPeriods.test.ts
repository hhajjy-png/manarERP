import { describe, it, expect } from 'vitest';
import { matchPreset, presetRange, RECEIPT_PRESETS } from '../receiptPeriods';

/* ════════════════════════════════════════════════════════════════════════════
   اختصارات الفترة — دوالّ خالصة تستقبل اللحظة كوسيط، فلا اختبار هنا يعتمد على
   ساعة الجهاز ولا ينكسر عند منتصف الليل أو عند تغيّر الشهر.

   الخميس 10 سبتمبر 2026 هو المرجع الزمني في أغلب الحالات (يوم عمل في منتصف
   الشهر والأسبوع معًا).
   ════════════════════════════════════════════════════════════════════════════ */

const THU_10_SEP_2026 = new Date(2026, 8, 10, 14, 30);

describe('presetRange', () => {
  it('اليوم: طرفان متساويان', () => {
    expect(presetRange('today', THU_10_SEP_2026)).toEqual({ from: '2026-09-10', to: '2026-09-10' });
  });

  it('أمس: اليوم السابق في الطرفين', () => {
    expect(presetRange('yesterday', THU_10_SEP_2026)).toEqual({ from: '2026-09-09', to: '2026-09-09' });
  });

  it('أمس يعبر حدّ الشهر والسنة بلا حساب يدوي', () => {
    expect(presetRange('yesterday', new Date(2026, 0, 1)).from).toBe('2025-12-31');
  });

  it('هذا الأسبوع يبدأ من **السبت** — أسبوع العمل في الكويت لا الأحد', () => {
    // 10/09/2026 خميس؛ السبت الذي يسبقه هو 05/09.
    expect(presetRange('this-week', THU_10_SEP_2026)).toEqual({ from: '2026-09-05', to: '2026-09-10' });
  });

  it('يوم السبت نفسه يبدأ أسبوعه (لا يُرحَّل إلى الأسبوع الماضي)', () => {
    const sat = new Date(2026, 8, 5);
    expect(sat.getDay()).toBe(6);
    expect(presetRange('this-week', sat)).toEqual({ from: '2026-09-05', to: '2026-09-05' });
  });

  it('الأحد يقع في أسبوع السبت الذي يسبقه مباشرةً', () => {
    const sun = new Date(2026, 8, 6);
    expect(sun.getDay()).toBe(0);
    expect(presetRange('this-week', sun).from).toBe('2026-09-05');
  });

  it('هذا الشهر: من أول الشهر حتى **اليوم** لا حتى نهاية الشهر', () => {
    // الطرف الأعلى اليوم كي لا تضمّ النافذة قبضًا بتاريخ مستقبلي (شيك آجل).
    expect(presetRange('this-month', THU_10_SEP_2026)).toEqual({ from: '2026-09-01', to: '2026-09-10' });
  });

  it('الشهر السابق: شهر تقويمي كامل', () => {
    expect(presetRange('previous-month', THU_10_SEP_2026)).toEqual({ from: '2026-08-01', to: '2026-08-31' });
  });

  it('الشهر السابق في يناير يتدحرج إلى ديسمبر من السنة الماضية', () => {
    expect(presetRange('previous-month', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' });
  });

  it('الشهر السابق يحترم طول فبراير الحقيقي', () => {
    expect(presetRange('previous-month', new Date(2024, 2, 10)).to).toBe('2024-02-29');
    expect(presetRange('previous-month', new Date(2026, 2, 10)).to).toBe('2026-02-28');
  });

  it('آخر 30 يوم: ثلاثون يومًا **شاملة اليوم** (الفارق 29)', () => {
    expect(presetRange('last-30', THU_10_SEP_2026)).toEqual({ from: '2026-08-12', to: '2026-09-10' });
  });

  it('هذه السنة: من أول يناير حتى اليوم', () => {
    expect(presetRange('this-year', THU_10_SEP_2026)).toEqual({ from: '2026-01-01', to: '2026-09-10' });
  });

  it('كل اختصار يُخرج تاريخين بصيغة YYYY-MM-DD صالحة، ومن ≤ إلى', () => {
    for (const { key } of RECEIPT_PRESETS) {
      const r = presetRange(key, THU_10_SEP_2026);
      expect(r.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.from <= r.to).toBe(true);
    }
  });

  it('التواريخ محلية لا UTC — لا انزياح يوم في الكويت (UTC+3)', () => {
    // منتصف ليل محليًا: `toISOString().slice(0,10)` كان سيعطي اليوم السابق.
    expect(presetRange('today', new Date(2026, 8, 10, 0, 0, 0)).from).toBe('2026-09-10');
    // آخر لحظة في اليوم محليًا.
    expect(presetRange('today', new Date(2026, 8, 10, 23, 59, 59)).from).toBe('2026-09-10');
  });
});

describe('matchPreset', () => {
  it('يتعرّف على النطاق المطابق لاختصار', () => {
    expect(matchPreset(presetRange('this-month', THU_10_SEP_2026), THU_10_SEP_2026)).toBe('this-month');
    expect(matchPreset(presetRange('last-30', THU_10_SEP_2026), THU_10_SEP_2026)).toBe('last-30');
    expect(matchPreset(presetRange('today', THU_10_SEP_2026), THU_10_SEP_2026)).toBe('today');
  });

  it('نطاق لا يطابق أي اختصار يُصنَّف «مخصص»', () => {
    expect(matchPreset({ from: '2026-03-07', to: '2026-05-19' }, THU_10_SEP_2026)).toBe('custom');
  });

  it('نطاق فارغ يُصنَّف «مخصص» لا يرمي', () => {
    expect(matchPreset({ from: '', to: '' }, THU_10_SEP_2026)).toBe('custom');
  });
});
