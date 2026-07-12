import { act } from '@testing-library/react';

/**
 * يُفرغ التحديثات غير المتزامنة التي تُصدرها المكوّنات **بعد** أن يعود الاستدعاء
 * المتزامن للاختبار — وهي مصدر تحذيرات `act(...)` في هذا المشروع:
 *
 *  • `<iframe srcDoc>` يُطلق `load` **بعد** انتهاء `render` (jsdom يؤجّله)، فيُحدِّث
 *    `PrintPreviewDialog` عدد الصفحات خارج نطاق `act`.
 *  • `requestAnimationFrame` داخل `doPrint`: الحوار يُغلق أولًا ثم يفوّض للطباعة في
 *    الإطار التالي — وهي ضرورة معمارية (وإلا طُبعت نافذة المعاينة نفسها).
 *  • تأثيرات التركيب غير المتزامنة في `ChequeCalibrator` و`FormQRCode`.
 *
 * الحل هو **انتظار ما ينتظره المكوّن فعلًا**، لا كتم التحذير ولا تأخير ثابت: نُفرغ
 * الـ microtasks ثم إطار الرسم التالي، داخل `act` — فتُلتقط كل التحديثات الناتجة.
 *
 * سلوك الإنتاج لم يُمسّ: لا نُحوّل شيئًا إلى متزامن، ولا نُبدّل `requestAnimationFrame`.
 */
export async function flushAsyncUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}
