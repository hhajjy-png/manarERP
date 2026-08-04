/* ════════════════════════════════════════════════════════════════════════════
   تسليم الفلاتر من مركز التحليل المالي إلى مستعرض الوحدة.

   صفحتا «الفواتير» و«المصروفات» تحفظان فلاترهما عبر `usePersistedState` وتقرآنهما
   **عند التركيب**. فلكي يفتح المستعرض على نفس تصفية الخليّة المضغوط عليها، نكتب
   تلك المفاتيح قبل التنقّل مباشرةً ثم ننتقل — الصفحة تُركَّب بعدها فتقرأ القيم
   الجديدة.

   لماذا وحدة مستقلة؟ لأن أسماء المفاتيح تفصيلٌ داخلي لتلك الصفحات. حصرها هنا
   يجعل نقطة الاقتران **واحدة معروفة وموثّقة** بدل انتشارها في مكوّنات العرض،
   ويمنع أي تعديل في صفحات الوحدات (لا سطر واحد تغيّر فيها).

   النطاق الزمني **لا يُمرَّر هنا**: كلتا الصفحتين تتبعان الفترة المالية العامة
   التي يقودها فلتر مركز التحليل أصلًا، فهو مطبَّق هناك تلقائيًا.
   ════════════════════════════════════════════════════════════════════════════ */

import { EXPENSE_OPERATIONAL_STATUS } from '../config/analysisPolicy';

export interface HandoffInput {
  kind: 'revenue' | 'expenses' | 'collections';
  category?: string;
  customerId?: number;
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* التخزين غير متاح (وضع خاص/حصّة ممتلئة) — التنقّل يتم بلا تصفية مسبقة. */
  }
}

export function handoffToModule(input: HandoffInput): void {
  if (input.kind === 'expenses') {
    write('exp:page', 1);
    write('exp:search', '');
    write('exp:supplier', '');
    // مركز التحليل يحتسب المصروفات المعتمدة فقط — نفس الحالة تُطبَّق في المستعرض.
    write('exp:status', EXPENSE_OPERATIONAL_STATUS);
    write('exp:category', input.category ?? '');
    return;
  }

  // الإيراد والتحصيل كلاهما يعيش في مستعرض الفواتير (الدفعات تُسجَّل داخل الفاتورة).
  write('inv:page', 1);
  write('inv:search', '');
  write('inv:status', '');
  write('inv:direction', 'SALES');
  write('inv:customer', input.customerId != null ? String(input.customerId) : '');
}
