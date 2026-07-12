import type { FutureConfig } from 'react-router-dom';

/**
 * أعلام مستقبل React Router المُفعَّلة في الاختبارات — **مطابقة للإنتاج** (`App.tsx`).
 *
 * الغرض ليس إسكات تحذير، بل أن يعمل `MemoryRouter` بنفس دلالات `HashRouter` الحقيقي؛
 * فاختبارٌ يعمل بأعلام مختلفة عن التطبيق يختبر تطبيقًا آخر.
 *
 * `v7_startTransition` **غائب عمدًا هنا كما في الإنتاج**: تفعيله يؤجّل إظهار
 * `<Suspense fallback>` عند التنقّل إلى الصفحات الكسولة — تغيير مرئي له حزمته وفحصه.
 */
export const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_relativeSplatPath: true,
};
