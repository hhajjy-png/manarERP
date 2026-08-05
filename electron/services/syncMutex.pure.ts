/**
 * Production Hardening Pack v1 — P0-4
 * قفل تسلسل عمليات المزامنة (Cloud Sync Mutex).
 *
 * ── المشكلة التي يغلقها ────────────────────────────────────────────────────────
 *
 * محرّك المزامنة يحمل حالة عامة (`currentStatus`) ويكتب ملف `sync-metadata.json`
 * بنمط read-modify-write غير ذرّي. ولا شيء في طبقة IPC كان يمنع تراكب عمليتين:
 *   • نقرة مزدوجة على «مزامنة الآن»
 *   • «رفع» أثناء مزامنة بدء تشغيل لم تنتهِ بعد
 *   • الفحص السلبي للتعارض عند فتح اللوحة أثناء رفع جارٍ
 *   • مزامنة الإغلاق بينما رفع يدوي ما زال قيد التنفيذ
 * كانت النتيجة: آخر كاتب يفوز على الحالة، وإدخالات سجلّ تضيع، ورفعان متنافسان
 * على ملف Drive نفسه.
 *
 * ── السياسة: رفض لا انتظار ─────────────────────────────────────────────────────
 *
 * لا يوجد طابور. أي عملية تصل والقفل مشغول **تُرفض فورًا برسالة عربية واضحة**.
 * الانتظار كان سيعني تكديس عمليات قد تصبح قراراتها قديمة وقت تنفيذها (قرار «ارفع»
 * مبني على حالة سابقة لتنزيل نُفّذ للتوّ) — وهو أخطر من الرفض الصريح.
 *
 * ── إعادة الدخول ───────────────────────────────────────────────────────────────
 *
 * القفل يُؤخذ عند **مداخل الاستدعاء العامة فقط** (`performSyncNow`, `performUpload`,
 * `performDownload`, `resolveConflict`, `checkForConflict`, مزامنتا البدء والإغلاق).
 * التنفيذ الداخلي (`uploadInternal`/`downloadInternal`) لا يأخذ القفل إطلاقًا، وإلا
 * لرفضت `performSyncNow` نفسها حين تستدعي التنزيل داخليًا.
 *
 * لا يستورد هذا الملف `electron` ولا `fs` — طبقة سياسة نقية قابلة للاختبار.
 */

export type SyncOperation =
  | 'SYNC_NOW'
  | 'UPLOAD'
  | 'DOWNLOAD'
  | 'RESOLVE_CONFLICT'
  | 'CONFLICT_CHECK'
  | 'STARTUP_SYNC'
  | 'SHUTDOWN_SYNC';

/** أسماء عربية للعمليات — تُستخدم في رسالة الرفض حتى يعرف المستخدم ما الجاري فعلًا. */
const OPERATION_LABELS: Record<SyncOperation, string> = {
  SYNC_NOW: 'مزامنة كاملة',
  UPLOAD: 'رفع قاعدة البيانات',
  DOWNLOAD: 'تنزيل قاعدة البيانات',
  RESOLVE_CONFLICT: 'حلّ تعارض المزامنة',
  CONFLICT_CHECK: 'فحص التعارض',
  STARTUP_SYNC: 'مزامنة بدء التشغيل',
  SHUTDOWN_SYNC: 'مزامنة الإغلاق',
};

export interface MutexBusy {
  ok: false;
  /** العملية التي تمسك القفل حاليًا. */
  holder: SyncOperation;
  /** رسالة عربية جاهزة للعرض. */
  message: string;
}

export type MutexOutcome<T> = { ok: true; value: T } | MutexBusy;

export interface SyncMutex {
  /** ينفّذ `fn` إن كان القفل حرًّا، وإلا يرفض فورًا بلا تنفيذ وبلا انتظار. */
  run<T>(operation: SyncOperation, fn: () => Promise<T>): Promise<MutexOutcome<T>>;
  isBusy(): boolean;
  /** العملية الجارية حاليًا، أو `null`. */
  current(): SyncOperation | null;
}

export function buildBusyMessage(holder: SyncOperation): string {
  return `توجد عملية مزامنة جارية بالفعل (${OPERATION_LABELS[holder]}). يرجى الانتظار حتى تنتهي ثم إعادة المحاولة.`;
}

export function createSyncMutex(): SyncMutex {
  let holder: SyncOperation | null = null;

  return {
    async run<T>(operation: SyncOperation, fn: () => Promise<T>): Promise<MutexOutcome<T>> {
      if (holder !== null) {
        return { ok: false, holder, message: buildBusyMessage(holder) };
      }
      holder = operation;
      try {
        return { ok: true, value: await fn() };
      } finally {
        // التحرير في `finally` غير مشروط: أي استثناء غير متوقّع لا يجوز أن يترك
        // القفل مأخوذًا للأبد فيُعطّل كل مزامنة لاحقة حتى إعادة تشغيل التطبيق.
        holder = null;
      }
    },
    isBusy: () => holder !== null,
    current: () => holder,
  };
}
