import { useCallback, useLayoutEffect, useRef } from 'react';

/* ════════════════════════════════════════════════════════════════════════════
   تصغير الخطّ حتى تتّسع القيمة — «طباعة متجاوبة» لبطاقات المؤشّرات.

   ═══ لماذا لا يكفي CSS وحده ═══
   المبلغ المالي رمز واحد غير قابل للكسر: لا مسافة داخل `9,999,999,999.999`،
   فلا يجد المتصفّح موضع التفاف ويرسمه بعرضه الطبيعي مهما ضاقت البطاقة. و`ch`
   أو `cqw` لا تعرف **طول النصّ**، فأي صيغة CSS خالصة تبقى تخمينًا. القياس
   الفعلي (`scrollWidth` مقابل `clientWidth`) هو الشيء الوحيد الذي يضمن الوعد:
   الرقم يُصغَّر ولا يُقصّ أبدًا.

   ═══ العقد ═══
   • لا يُقصّ رقم ولا يُستبدل بنقاط — التصغير وحده.
   • لا يُكبَّر شيء فوق حجم ورقة الأنماط: الحجم يعود إلى `''` قبل كل قياس، فيبقى
     المظهر مطابقًا تمامًا لما كان عليه حين تتّسع القيمة أصلًا (وهي الحالة الغالبة).
   • بلا تخطيط (jsdom، عنصر مخفي، بطاقة بعرض صفر) لا يفعل شيئًا — فلا يكسر اختبارًا.
   ════════════════════════════════════════════════════════════════════════════ */

/**
 * أصغر حجم خطّ مسموح للقيمة.
 *
 * ثمانية بكسل ليست اختيارًا جماليًا بل حدًّا **مشتقًّا من أسوأ حالة مطلوبة**:
 * `999,999,999,999.999 KWD` (٢٣ محرفًا) داخل أضيق بطاقة ممكنة — عمود الشبكة
 * الأدنى 200px، يبقى منه ~116px بعد الأيقونة (40) والفجوة (12) والحشو (32).
 * بخطّ ثقيل بأرقام جدولية يحتاج ذلك ~253px عند 19px، أي معامل 0.46 ⇒ ~8.7px.
 * وضع الحدّ عند 9 كان يترك الرقم يتجاوز المتاح بأربعة بكسلات فيُقصّ — أي ينكسر
 * الوعد بالضبط في الحالة التي وُضع لأجلها.
 *
 * هذا الحدّ لا يُبلَغ في بيانات حقيقية (تريليون دينار في أضيق عمود ممكن)؛
 * وجوده هو ما يجعل «لا قصّ أبدًا» ضمانًا لا تقريبًا.
 */
export const FIT_MIN_FONT_PX = 8;

/** خطوة التصحيح بعد القفزة النسبية — نصف بكسل يكفي ولا يُطيل الحلقة. */
const CORRECTION_STEP_PX = 0.5;

/** سقف تكرارات التصحيح — حارس ضدّ أي حلقة لا تنتهي مهما كانت القياسات شاذّة. */
const CORRECTION_GUARD = 24;

/**
 * الحجم المُقدَّر الذي تتّسع عنده القيمة — قفزة نسبية واحدة.
 *
 * دالّة نقيّة بلا DOM كي تُختبر مباشرةً: العرض المطلوب يتناسب طرديًا مع حجم
 * الخطّ، فنسبة (المتاح ÷ المطلوب) تعطي المعامل. التقريب لأسفل بمنزلة عشرية
 * واحدة يمنع فائضًا ناتجًا عن كسر عشري.
 */
export function computeFittedFontSize(
  baseSize: number,
  available: number,
  needed: number,
  min = FIT_MIN_FONT_PX,
): number {
  if (!(needed > 0) || !(available > 0) || !(baseSize > 0)) return baseSize;
  if (needed <= available) return baseSize;
  return Math.max(min, Math.floor(((baseSize * available) / needed) * 10) / 10);
}

/**
 * يربط عنصرًا نصّيًا بآلية التصغير.
 *
 * يعيد `ref` يُوضع على العنصر الذي يجب ألّا يفيض. يُعاد القياس بعد **كل رسم**
 * (النصّ نفسه قد يتغيّر بلا تغيّر أي مقاس — تبديل وضع الخصوصية مثلًا) وعند كل
 * تغيّر في **عرض** العنصر.
 */
export function useFitText<T extends HTMLElement>() {
  const ref = useRef<T>(null);

  const fit = useCallback((): void => {
    const el = ref.current;
    if (!el) return;

    // العودة إلى حجم ورقة الأنماط أولًا: بدونها يبقى الرقمُ القصيرُ التالي
    // محتفظًا بالحجم المصغَّر الذي فُرض لأجل رقم طويل سبقه.
    el.style.fontSize = '';

    const available = el.clientWidth;
    if (!available) return; // لم يُرسَم بعد (jsdom / عنصر مخفي) — لا قياس ممكن
    const needed = el.scrollWidth;
    if (needed <= available) return; // يتّسع بحجمه الكامل — لا تدخّل

    const base = Number.parseFloat(window.getComputedStyle(el).fontSize);
    if (!Number.isFinite(base) || base <= 0) return;

    let size = computeFittedFontSize(base, available, needed);
    el.style.fontSize = `${size}px`;

    // القفزة النسبية لا تحسب `letter-spacing` ولا تقريب المحارف، فقد يبقى فائض
    // ضئيل. التصحيح هنا خطوة أو خطوتان عمليًا، وهو ما يجعل الضمان قياسًا لا تقديرًا.
    let guard = CORRECTION_GUARD;
    while (size > FIT_MIN_FONT_PX && el.scrollWidth > el.clientWidth && guard > 0) {
      size = Math.max(FIT_MIN_FONT_PX, size - CORRECTION_STEP_PX);
      el.style.fontSize = `${size}px`;
      guard -= 1;
    }
  }, []);

  // بعد كل رسم — بلا مصفوفة اعتماديات: تغيّر النصّ وحده لا يغيّر أي مقاس، فلا
  // يلتقطه مراقب الأحجام.
  useLayoutEffect(fit);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    /**
     * **العرض وحده** يُعيد القياس.
     *
     * التصغير يغيّر ارتفاع العنصر حتمًا؛ ولو تفاعل المراقب مع الارتفاع لأصبحت
     * كل عملية ضبط سببًا لعملية ضبط تالية — حلقة لا تنتهي. العرض هو المتغيّر
     * الوحيد الذي يستدعي إعادة الحساب فعلًا.
     */
    let lastWidth = -1;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? -1;
      if (width === lastWidth) return;
      lastWidth = width;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  return ref;
}
