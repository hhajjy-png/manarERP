import { describe, it, expect } from 'vitest';
import { formatDisplayDate, formatDisplayDateTime } from '../dateDisplay';
import { DATE_FORMAT } from '../../services/reportEngine/excelStyle';
import { buildSubtitle, formatDate } from '../../services/financial/summary.utils';
import { toAgingReportInput } from '../../services/financial/export/aging.export.adapter';
import { toTrialBalanceReportInput } from '../../services/financial/export/trial.export.adapter';
import { dateOnlySchema } from '../../../core/utils/dateOnly';

/**
 * Project-Wide Date Display, Export & Import Consistency Pack v1 — الطرف الخلفي.
 *
 * الفصل الذي تحرسه هذه الاختبارات:
 *   • `DD/MM/YYYY` = صيغة **عرض/تصدير** للمستخدم.
 *   • `YYYY-MM-DD` = الصيغة **القانونية** الداخلية (API/تخزين) — لا تتغيّر.
 *
 * كل ما يلي كان يخلط بين الاثنين: خلايا Excel بتنسيق `yyyy-mm-dd`، وعناوين فرعية
 * تعرض الصيغة السلكية كما هي، وأعمدة تاريخ مبنية بـ`toISOString().slice(0,10)`.
 */

describe('formatDisplayDate — عقد العرض DD/MM/YYYY', () => {
  it('A) 2026-08-02 → 02/08/2026', () => {
    expect(formatDisplayDate('2026-08-02')).toBe('02/08/2026');
  });

  it('B) 2026-02-08 → 08/02/2026 — لا انقلاب شهر/يوم', () => {
    expect(formatDisplayDate('2026-02-08')).toBe('08/02/2026');
  });

  it('C) 2025-03-31 → 31/03/2025', () => {
    expect(formatDisplayDate('2025-03-31')).toBe('31/03/2025');
  });

  it('D) يوم كبيس 2028-02-29 → 29/02/2028', () => {
    expect(formatDisplayDate('2028-02-29')).toBe('29/02/2028');
  });

  it('E) الزوج المتقابل لا ينقلب — 02/08 و08/02 يبقيان متمايزين', () => {
    expect([formatDisplayDate('2026-08-02'), formatDisplayDate('2026-02-08')])
      .toEqual(['02/08/2026', '08/02/2026']);
  });

  it('F) نص `YYYY-MM-DD` لا يمرّ عبر `Date` إطلاقًا — لا انزلاق يوم مهما كانت المنطقة الزمنية', () => {
    // إعادة ترتيب نصية بحتة: الرقم المعروض هو نفسه المكتوب، بلا تفسير زمني.
    for (const iso of ['2026-01-01', '2026-12-31', '2026-06-15']) {
      const [y, m, d] = iso.split('-');
      expect(formatDisplayDate(iso)).toBe(`${d}/${m}/${y}`);
    }
  });

  it('أرقام غربية فقط — لا أرقام هندية شرقية ولا علامات اتجاه مضمّنة', () => {
    const out = formatDisplayDate('2026-08-02');
    expect(out).toMatch(/^[0-9/]+$/);            // لا محارف خارج الأرقام الغربية والشرطة المائلة
    expect(out).not.toMatch(/[٠-٩]/);  // ٠-٩ العربية-الهندية
    expect(out).not.toMatch(/[‎‏]/);   // LRM/RLM اللذان تحقنهما toLocaleDateString
  });

  it('الفارغ/غير الصالح → —', () => {
    expect(formatDisplayDate(null)).toBe('—');
    expect(formatDisplayDate('')).toBe('—');
    expect(formatDisplayDate('not-a-date')).toBe('—');
  });
});

describe('G/H) Excel — تنسيق التاريخ عرضٌ DD/MM/YYYY على خلية تاريخ حقيقية', () => {
  it('DATE_FORMAT صار dd/mm/yyyy بدل yyyy-mm-dd', () => {
    expect(DATE_FORMAT).toBe('dd/mm/yyyy');
  });

  it('يبقى تنسيق تاريخ Excel صالحًا (لا نص) — فتظلّ الخلية قابلة للفرز والحساب', () => {
    // لا اقتباسات ولا محارف نصية: رموز تاريخ Excel فقط. تحويل العمود إلى نص كان
    // سيُفقد الفرز الزمني وهو ما تمنعه هذه القاعدة.
    expect(DATE_FORMAT).toMatch(/^[dmy/]+$/);
    expect(DATE_FORMAT).not.toContain('"');
  });
});

describe('I) عناوين وأعمدة التقارير — لا صيغة قانونية تصل إلى المستخدم', () => {
  it('buildSubtitle يعرض حدود الفترة بصيغة العرض لا بالصيغة السلكية', () => {
    expect(buildSubtitle('2026-08-02', '2026-08-31')).toBe('من 02/08/2026 إلى 31/08/2026');
    expect(buildSubtitle('2026-02-08')).toBe('من 08/02/2026');
    expect(buildSubtitle(undefined, '2026-02-08')).toBe('حتى 08/02/2026');
    expect(buildSubtitle()).toBe('كل الفترات');
  });

  it('summary.utils.formatDate (عمود التاريخ في كشف الحساب/الأستاذ/اليومية) صار DD/MM/YYYY', () => {
    expect(formatDate('2026-08-02')).toBe('02/08/2026');
    expect(formatDate('2026-02-08')).toBe('08/02/2026');
  });

  it('F) formatDate لا ينزلق يومًا لقيد مُخزَّن عند منتصف الليل **المحلي**', () => {
    // كانت toISOString().slice(0,10) تقرأ يوم UTC: منتصف ليل 2 أغسطس محليًا في
    // الكويت (UTC+03:00) هو 21:00 من 1 أغسطس بتوقيت UTC — فيُعرض اليوم السابق.
    const localMidnight = new Date(2026, 7, 2, 0, 0, 0, 0);
    expect(formatDate(localMidnight)).toBe('02/08/2026');
  });

  it('العنوان الفرعي لأعمار الديون بصيغة العرض', () => {
    const input = toAgingReportInput(
      { rows: [], summary: {}, metadata: { asOfDate: '2026-08-02' } } as never,
      'ar',
    );
    expect(input.subtitle).toBe('حتى تاريخ 02/08/2026');
  });

  it('العنوان الفرعي لميزان المراجعة بصيغة العرض', () => {
    const input = toTrialBalanceReportInput(
      { rows: [], summary: {}, metadata: { mode: 'as-of', asOfDate: '2026-02-08' } } as never,
    );
    expect(input.subtitle).toBe('حتى تاريخ 08/02/2026');
  });
});

describe('N/O) الصيغة القانونية والطوابع الزمنية لم تتأثر', () => {
  it('N) dateOnlySchema ما يزال يقبل YYYY-MM-DD ويرفض DD/MM/YYYY — عقد الـAPI بلا تغيير', () => {
    const ok = dateOnlySchema.safeParse('2026-08-02');
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.toISOString()).toBe('2026-08-02T00:00:00.000Z');

    // صيغة العرض ليست صيغة إدخال — لا يجوز أن يقبلها الـAPI بعد هذه الحزمة أيضًا.
    expect(dateOnlySchema.safeParse('02/08/2026').success).toBe(false);
  });

  it('O) الطابع الزمني الحقيقي يحتفظ بوقته — لا يُقصَّ إلى تاريخ فقط', () => {
    const ts = new Date(2026, 7, 2, 14, 35, 0, 0);
    expect(formatDisplayDateTime(ts)).toBe('02/08/2026 14:35');
  });
});
