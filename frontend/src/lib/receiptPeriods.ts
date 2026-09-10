import { toLocalDateOnly } from './date';

/* ════════════════════════════════════════════════════════════════════════════
   اختصارات الفترة الزمنية لصفحة المقبوضات — دوالّ خالصة.

   كل نطاق يُبنى من **مكوّنات التقويم المحلي** (`new Date(y, m, d)`) ثم يُحوَّل
   إلى `YYYY-MM-DD` بـ`toLocalDateOnly`. لا `toISOString()` في أي خطوة: التوقيت
   المحلي للكويت هو UTC+03:00، فمنتصف ليل اليوم محليًا يصبح **أمس** بتوقيت UTC —
   والفرق يوم كامل في اسم الاختصار وفي النتيجة معًا.

   `now` وسيط دائمًا فلا تعتمد الاختبارات على ساعة الجهاز.
   ════════════════════════════════════════════════════════════════════════════ */

export type ReceiptPreset =
  | 'today'
  | 'yesterday'
  | 'this-week'
  | 'this-month'
  | 'previous-month'
  | 'last-30'
  | 'this-year'
  | 'custom';

export interface PresetRange {
  from: string;
  to: string;
}

/** الاختصارات بترتيب العرض. `custom` ليست منها — تُفعَّل بتحرير الحقلين. */
export const RECEIPT_PRESETS: { key: Exclude<ReceiptPreset, 'custom'>; labelKey: string }[] = [
  { key: 'today',          labelKey: 'rcp.preset.today' },
  { key: 'yesterday',      labelKey: 'rcp.preset.yesterday' },
  { key: 'this-week',      labelKey: 'rcp.preset.this_week' },
  { key: 'this-month',     labelKey: 'rcp.preset.this_month' },
  { key: 'previous-month', labelKey: 'rcp.preset.previous_month' },
  { key: 'last-30',        labelKey: 'rcp.preset.last_30' },
  { key: 'this-year',      labelKey: 'rcp.preset.this_year' },
];

const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * بداية الأسبوع = **السبت**.
 *
 * أسبوع العمل في الكويت يبدأ السبت وينتهي الخميس، فبداية الأحد (افتراضي
 * JavaScript) كانت ستضع مقبوضات السبت في «الأسبوع الماضي» — وهو يوم عمل كامل.
 * `getDay()`: الأحد=0 … السبت=6، فالمسافة إلى السبت الأخير هي `(day + 1) % 7`.
 */
function startOfWeek(now: Date): Date {
  const d = day(now);
  d.setDate(d.getDate() - ((now.getDay() + 1) % 7));
  return d;
}

/**
 * حدود الاختصار. الطرف الأعلى هو **اليوم** لا نهاية الشهر/السنة: الصفحة تشغيلية،
 * و«هذا الشهر» يعني ما قُبض حتى الآن — لا نافذة تمتدّ إلى المستقبل فتضمّ شيكًا
 * آجلًا سُجّل بتاريخ لم يحلّ بعد.
 */
export function presetRange(preset: Exclude<ReceiptPreset, 'custom'>, now: Date = new Date()): PresetRange {
  const today = day(now);
  const iso = toLocalDateOnly;

  switch (preset) {
    case 'today':
      return { from: iso(today), to: iso(today) };

    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(y) };
    }

    case 'this-week':
      return { from: iso(startOfWeek(now)), to: iso(today) };

    case 'this-month':
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(today) };

    case 'previous-month':
      // `new Date(y, m - 1, 1)` يتدحرج إلى ديسمبر من السنة الماضية عند يناير،
      // و`new Date(y, m, 0)` يعطي آخر يوم في الشهر السابق مهما كان طوله.
      return {
        from: iso(new Date(now.getFullYear(), now.getMonth() - 1, 1)),
        to: iso(new Date(now.getFullYear(), now.getMonth(), 0)),
      };

    case 'last-30': {
      // ثلاثون يومًا **شاملة اليوم** — فالفارق 29 لا 30.
      const start = new Date(today);
      start.setDate(start.getDate() - 29);
      return { from: iso(start), to: iso(today) };
    }

    case 'this-year':
      return { from: iso(new Date(now.getFullYear(), 0, 1)), to: iso(today) };
  }
}

/**
 * الاختصار المطابق لنطاق مُعطى، أو `'custom'`.
 *
 * يجعل الاختصار المحدَّد يبقى مضيئًا بعد إعادة تحميل الصفحة (النطاق وحده هو
 * المحفوظ، لا اسم الاختصار — فالنطاق هو الحقيقة والاسم مشتقّ منه).
 */
export function matchPreset(range: PresetRange, now: Date = new Date()): ReceiptPreset {
  for (const { key } of RECEIPT_PRESETS) {
    const r = presetRange(key, now);
    if (r.from === range.from && r.to === range.to) return key;
  }
  return 'custom';
}
