import type { FutureConfig } from 'react-router-dom';

/**
 * أعلام مستقبل React Router المُفعَّلة في الاختبارات — **مطابقة للإنتاج** (`App.tsx`).
 *
 * الغرض ليس إسكات تحذير، بل أن يعمل `MemoryRouter` بنفس دلالات `HashRouter` الحقيقي؛
 * فاختبارٌ يعمل بأعلام مختلفة عن التطبيق يختبر تطبيقًا آخر.
 *
 * `v7_startTransition` مُفعَّل هنا **كما في الإنتاج**: يجعل تحديثات التوجيه غير عاجلة،
 * فقد لا يظهر أثر التنقّل في نفس دورة الرسم. الاختبارات تنتظر النتيجة النهائية
 * (`findBy…` / `waitFor`) بدل الاعتماد على لقطة زمنية — وهو ما يفعله المستخدم أصلًا.
 */
export const ROUTER_FUTURE: Partial<FutureConfig> = {
  v7_relativeSplatPath: true,
  v7_startTransition: true,
};
