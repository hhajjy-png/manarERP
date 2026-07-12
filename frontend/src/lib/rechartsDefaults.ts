/**
 * الأبعاد الابتدائية لحاويات Recharts.
 *
 * `ResponsiveContainer` يبدأ بحالة `{ width: -1, height: -1 }` — وهي **قيمة حارسة
 * (sentinel) تكتبها المكتبة بنفسها**، لا قياسًا فاشلًا للـ DOM. في الرسمة الأولى (قبل أن
 * يعمل `useEffect` ويقيس `ResizeObserver`) تُحسب أبعاد المخطط منها:
 *
 *   calculatedWidth  = isPercent(width)  ? containerWidth  : Number(width)   // -1
 *   calculatedHeight = isPercent(height) ? containerHeight : Number(height)  // -1
 *   warn(calculatedWidth > 0 || calculatedHeight > 0, 'The width(-1) and height(-1)…')
 *
 * فالتحذير لا يقع إلا حين يكون **كلا** البُعدين ≤ 0 — أي في الحاويات التي تمرّر
 * `width="100%" height="100%"` وحدها. (الحاويات ذات الارتفاع الرقمي لا تُحذّر أبدًا،
 * لأن `calculatedHeight` عندها رقم موجب — ولذلك لم تُمسّ.)
 *
 * `initialDimension` **prop رسمية** في Recharts 3.8.1 (`@default {width:-1,height:-1}`)،
 * فتمريرها بقيمة موجبة يعالج السبب في مكانه: لا يعود البُعد الابتدائي سالبًا.
 *
 * **لماذا 1×1 لا أكبر:** القيمة أوّلية بحتة — يستبدلها القياس الحقيقي فور تركيب المكوّن،
 * ولا تُستخدم في تخطيط الحاوية نفسها (الـ div الخارجي يبقى على `width/height` النسبيَّين).
 * فأصغر قيمة موجبة آمنة هي الأقلّ أثرًا: لا تدّعي مقاسًا، ولا تُنتج وميض مربّع كبير قبل
 * القياس. **لا تُنقل هنا أي ارتفاعات من CSS** — الارتفاعات تبقى حيث هي، في أنماط الآباء.
 */
export const CHART_INITIAL_DIMENSION = { width: 1, height: 1 } as const;
