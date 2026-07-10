import { AsyncLocalStorage } from 'node:async_hooks';
import { NextFunction, Request, Response } from 'express';

/**
 * حامل سياق الطلب عبر سلسلة الاستدعاءات غير المتزامنة.
 *
 * لماذا AsyncLocalStorage؟
 * حارس قفل الفترة يعمل داخل `createBalancedJournal` — وهي دالة GL منخفضة المستوى
 * تستقبل عميل معاملة فقط ولا تعرف شيئًا عن الطلب. تمرير المستخدم والصلاحيات
 * عبر كل مسار ترحيل (فواتير/مصروفات/رواتب/مخزون) كان سيتطلب تغيير عشرات التواقيع.
 * ALS يعطي الحارس المركزي وصولًا للفاعل دون لمس أي توقيع.
 *
 * نُخزّن كائن الطلب نفسه لا نسخة منه: `authenticate` يضع `req.user`/`req.permissions`
 * بعد تشغيل هذا الـ middleware، والقراءة تتم لاحقًا وقت استدعاء الحارس.
 *
 * ── حدود مثبتة تجريبيًا (لا تتجاوزها دون مراجعة مستقلة) ──
 *
 * 1. **مستمعات EventEmitter لا تحمل السياق.** السياق يتبع سلسلة `await`/الوعود.
 *    مستمع يُسجَّل داخل الطلب لكنه يُطلَق لاحقًا خارجه (مثل `prisma.$on('query')`،
 *    أو مُنبعث حدث مخزَّن) يرى `getRequestActor() === null`. لا تعتمد على ALS
 *    داخل أي callback من هذا النوع.
 *
 * 2. **غياب الفاعل ليس آلية تجاوز للقفل.** خارج دورة HTTP يعود `null`، و`assertPeriodOpen`
 *    يمرّ حينها لأن المسارات غير الطلبية (seed، السكربتات) لا تُرحّل GL أصلًا.
 *    هذا سلوك «لا فاعل بشري» لا «فاعل مُصرَّح له بالتجاوز» — التجاوز الرسمي يمرّ
 *    عبر صلاحية `financial.overrideLock` ويُسجَّل في Audit.
 *
 * 3. **أي مهمة خلفية أو سكربت مالي مستقبلي** يجب أن يُغلَّف صراحةً بـ
 *    `runWithRequestActor(req, fn)` بفاعل نظامي، وإلا خضعت كتاباته للقفل بلا هوية.
 *
 * 4. **مستهلك واحد فقط** (`periodLock.service`). لا توسّع ALS لأغراض أخرى دون مراجعة.
 *
 * العزل بين الطلبات المتزامنة مضمون ومُغطّى باختبار في `periodLock.service.test.ts`.
 */
const storage = new AsyncLocalStorage<{ req: Request }>();

/** الفاعل الذي ينفّذ العملية الحالية — مصدره الطلب الجاري. */
export interface RequestActor {
  userId?: number;
  roleName?: string;
  permissions: string[];
  ip: string | null;
}

/**
 * يفتح سياقًا للطلب. يُركّب مبكرًا في `app.ts` قبل كل الراوترات.
 */
export function requestContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  storage.run({ req }, () => next());
}

/**
 * الفاعل الحالي، أو `null` خارج دورة الطلب (المجدولات، seed، الاختبارات).
 * المستدعي هو من يقرر معنى الغياب — انظر `periodLock.service.ts`.
 */
export function getRequestActor(): RequestActor | null {
  const store = storage.getStore();
  if (!store) return null;
  const { req } = store;
  return {
    userId: req.user?.userId,
    roleName: req.user?.roleName,
    permissions: req.permissions ?? [],
    ip: req.ip ?? null,
  };
}

/** يشغّل دالة داخل سياق طلب محدد — للاختبارات ولأي تنفيذ خارج Express. */
export function runWithRequestActor<T>(req: Request, fn: () => T): T {
  return storage.run({ req }, fn);
}
