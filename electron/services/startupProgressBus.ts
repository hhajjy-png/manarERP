import { EventEmitter } from 'events';

/**
 * ناقل أحداث تقدّم الإقلاع — يفصل **من يعرف ما يجري** (تسلسل الإقلاع في
 * `main.ts`) عن **من يعرضه** (نافذة البدء). نفس نمط `syncProgressBus`.
 *
 * لا يقرر شيئًا ولا ينتظر شيئًا: يبثّ فقط. لو لم تكن هناك نافذة مستمعة، لا يتأثر
 * الإقلاع إطلاقًا — العرض طبقة إضافية بحتة فوق تسلسل يعمل بدونها.
 */

/** مراحل الإقلاع بالترتيب الفعلي لتنفيذها في `main.ts`. */
export type StartupPhase =
  | 'ENVIRONMENT'   // حارس التقاطع + قفل التشغيل
  | 'DATA_DIR'      // تهيئة مجلد البيانات وبذر أول تشغيل
  | 'CLOUD_SYNC'    // مزامنة بدء التشغيل (اختيارية)
  | 'BACKEND'       // تشغيل الخدمة الخلفية وانتظار جاهزيتها
  | 'READY'         // اكتمل — تُفتح النافذة الرئيسية
  | 'FAILED';       // فشل حقيقي — تُعرض الرسالة ولا يُغلق التطبيق صامتًا

export interface StartupProgressEvent {
  phase: StartupPhase;
  /** نص عربي يراه المستخدم. */
  message: string;
  /**
   * تفاصيل تشخيصية تُعرض **عند الفشل فقط** (سبب حقيقي، لا نص مُصطنع):
   * رمز خروج الخدمة، آخر أسطر خطئها، مسار ملف السجلّ.
   */
  detail?: string;
  /** ثوانٍ منقضية في المرحلة الحالية — تُحدَّث دوريًا أثناء انتظار الخدمة الخلفية. */
  elapsedSeconds?: number;
}

class StartupProgressBus extends EventEmitter {
  emitProgress(event: StartupProgressEvent): void {
    this.emit('progress', event);
  }
}

export const startupProgressBus = new StartupProgressBus();

/** مساعد مختصر — يبقي مواقع النداء في `main.ts` سطرًا واحدًا لكل مرحلة. */
export function reportStartup(
  phase: StartupPhase,
  message: string,
  extra: Omit<StartupProgressEvent, 'phase' | 'message'> = {},
): void {
  startupProgressBus.emitProgress({ phase, message, ...extra });
}
