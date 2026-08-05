/**
 * Production Hardening Pack v1 — P0-7 / P0-10
 * قواعد اتخاذ قرار المزامنة — طبقة نقية بالكامل.
 *
 * ── لماذا استُخرجت ─────────────────────────────────────────────────────────────
 *
 * `decide()` في `syncEngine.service.ts` هي أخطر ~40 سطرًا في النظام: هي التي تقرّر
 * «ارفع» أم «نزّل» أم «تعارض». وكانت غير مغطّاة بأي اختبار إطلاقًا، لأنها كانت
 * مشتبكة مع نداءات Drive وقراءة القرص و`electron`.
 *
 * هنا فُصلت **القواعد** عن **الإدخال/الإخراج**: هذه الوحدة لا تقرأ ملفًا ولا تنادي
 * شبكة ولا تستورد `electron` — تستقبل حقائق مُجهَّزة وتُعيد قرارًا. المحرّك يبقى
 * مسؤولًا عن جمع الحقائق (بصمة الملف، ملف Drive، وسم البذرة) وعن تنفيذ القرار.
 * نصوص الأسباب مطابقة حرفيًا للسابق حتى لا ينكسر سجلّ المزامنة التاريخي.
 */

export type SyncActionKind = 'UPLOAD' | 'DOWNLOAD' | 'NONE' | 'CONFLICT';

/** لقطة ملف Drive البعيد كما تُقرأ من `files.list` — بلا أي اعتماد على نوع Google. */
export interface RemoteSnapshot {
  id: string;
  sha256: string | null;
  modifiedTime: string;
  size: number;
  version: number | null;
  deviceId: string | null;
  deviceName: string | null;
}

/** الحقول الوحيدة من `sync-metadata.json` التي يحتاجها القرار. */
export interface DecisionMetadata {
  /** بصمة **البايتات** التي رُفعت/نُزِّلت آخر مرة — هوية النسخة السحابية. */
  lastSyncedHash: string | null;
  /**
   * بصمة **الملف المحلي** لحظة آخر مزامنة ناجحة. تختلف عن السابقة منذ صارت اللقطة
   * تمرّ بـ`VACUUM INTO`. `undefined`/`null` في البيانات القديمة ⇒ نعود إلى
   * `lastSyncedHash` (سلوك ما قبل التغيير حرفيًا).
   */
  lastSyncedLocalHash?: string | null;
}

export interface DecisionInput {
  /** بصمة قاعدة البيانات المحلية، أو `null` إن لم يكن الملف موجودًا. */
  localHash: string | null;
  /** ملف Drive البعيد، أو `null` إن لم توجد نسخة سحابية بعد. */
  remote: RemoteSnapshot | null;
  metadata: DecisionMetadata;
  /**
   * هل القاعدة المحلية ما زالت **بذرة القالب المُضمَّنة كما نُسخت حرفيًا**؟
   * يُحسب في `dbBootstrapState.isPristineSeed` (وسم صريح + تطابق بصمة).
   */
  isPristineSeed: boolean;
}

export interface DecisionResult {
  action: SyncActionKind;
  reason: string;
}

/**
 * القرار الأساسي. ترتيب القواعد **مقصود وحسّاس**، وأي إعادة ترتيب تُنتج فقدان
 * بيانات — لذلك هو موثّق قاعدةً قاعدة ومُغطّى باختبارات في
 * `__tests__/syncDecision.pure.test.ts`.
 */
export function decideSyncAction(input: DecisionInput): DecisionResult {
  const { localHash, remote, metadata, isPristineSeed } = input;

  // (1) لا نسخة سحابية بعد.
  if (!remote) {
    return localHash
      ? { action: 'UPLOAD', reason: 'لا توجد نسخة سحابية بعد' }
      : { action: 'NONE', reason: 'لا توجد بيانات محلية أو سحابية' };
  }

  // (2) تطابق تامّ بين البصمتين ⇒ لا شيء يُفعل. يسبق كل شيء آخر لأنه أرخص وأيقن.
  if (remote.sha256 && remote.sha256 === localHash) {
    return { action: 'NONE', reason: 'محدّث بالفعل' };
  }

  // (3) لا قاعدة محلية إطلاقًا وتوجد نسخة سحابية ⇒ تنزيل حصرًا. لا يمكن أن يكون
  //     هذا «تغييرًا محليًا» بأي معنى، ولا يجوز أن يصل إلى مقارنات التغيير أدناه
  //     حيث `localChanged` سيكون `false` فيُنتج «محدّث بالفعل» وهو خطأ صريح.
  if (localHash === null) {
    return { action: 'DOWNLOAD', reason: 'لا توجد قاعدة بيانات محلية — سيتم جلب النسخة السحابية' };
  }

  // (4) حارس بذرة أول تشغيل — يسبق كل مقارنات التغيير عمدًا.
  //     القالب المُضمَّن ليس «تغييرًا محليًا»: لا مستخدم كتب فيه شيئًا. تصنيفه كذلك
  //     كان يُنتج CONFLICT ويعرض خيار «المحلي» الذي يرفع القالب الفارغ فوق بيانات
  //     Drive الحقيقية. القرار هنا **تنزيل حصرًا** — لا تعارض ولا خيار رفع أصلًا.
  if (isPristineSeed) {
    return {
      action: 'DOWNLOAD',
      reason: 'أول تشغيل: تهيئة القاعدة من النسخة السحابية (القالب المحلي بذرة لا بيانات مستخدم)',
    };
  }

  const remoteChanged = remote.sha256 !== null && remote.sha256 !== metadata.lastSyncedHash;
  // الهوية المحلية تُقارَن ببصمة الملف المحلي وقت آخر مزامنة، لا ببصمة البايتات
  // المرفوعة — فهما مختلفتان منذ صارت اللقطة تمرّ بـ`VACUUM INTO`.
  const localBaseline = metadata.lastSyncedLocalHash ?? metadata.lastSyncedHash;
  const localChanged = localHash !== localBaseline;

  // (5) تغيّر الطرفان ⇒ تعارض. لا حلّ تلقائي إطلاقًا: القرار للمستخدم.
  if (remoteChanged && localChanged) {
    return {
      action: 'CONFLICT',
      reason: 'تعارض: توجد تغييرات محلية وتغييرات على Google Drive منذ آخر مزامنة',
    };
  }
  if (remoteChanged) return { action: 'DOWNLOAD', reason: 'توجد نسخة أحدث على Google Drive' };
  if (localChanged) return { action: 'UPLOAD', reason: 'توجد تغييرات محلية غير مرفوعة' };
  return { action: 'NONE', reason: 'محدّث بالفعل' };
}

// ── سياسة المزامنة التلقائية (بدء التشغيل / الإغلاق) ─────────────────────────

/**
 * مزامنة بدء التشغيل **تنزّل فقط**.
 *
 * الرفع عند البدء ممنوع عمدًا: القاعدة المحلية لم يفتحها الخادم الخلفي بعد ولم يرها
 * المستخدم، ورفعها تلقائيًا قد يدفع حالة قديمة فوق نسخة سحابية أحدث دون أن يطلب
 * أحد ذلك. والتعارض يُسجَّل ويُعرض فقط — لا يُحسم تلقائيًا أبدًا.
 */
export function startupSyncActsOn(action: SyncActionKind): boolean {
  return action === 'DOWNLOAD';
}

/**
 * مزامنة الإغلاق **ترفع فقط**.
 *
 * التنزيل عند الإغلاق ممنوع عمدًا: استبدال قاعدة البيانات والتطبيق في طريقه للخروج
 * يعني إعادة تشغيل الخادم الخلفي في اللحظة الأخيرة بلا داعٍ، وأي انقطاع في تلك
 * اللحظة يترك الاستبدال في وضع غير محسوم. التغييرات السحابية تُجلب عند البدء التالي.
 */
export function shutdownSyncActsOn(action: SyncActionKind): boolean {
  return action === 'UPLOAD';
}

// ── P0-7 · حماية فقدان التحديث (Optimistic Concurrency) ──────────────────────

/**
 * هل تغيّر ملف Drive البعيد بين قراءتين؟
 *
 * تُستدعى مباشرة **قبل** الكتابة: نقرأ الملف البعيد مرة أخرى ونقارنه باللقطة التي
 * بُني عليها قرار الرفع. أي اختلاف يعني أن جهازًا آخر رفع في هذه النافذة، والكتابة
 * فوقه ستكون **فقدان تحديث صامتًا** — فيُحوَّل الأمر إلى تعارض يقرّره المستخدم.
 *
 * المقارنة على أربعة حقول لأن أيًّا منها وحده قد يغيب:
 *   • `id`           — ملف جديد كليًا (حُذف القديم وأُنشئ آخر).
 *   • `sha256`       — أدقّ إشارة، لكنها غائبة إن رُفع بنسخة أقدم من الأداة.
 *   • `version`      — العدّاد التصاعدي الذي نكتبه نحن.
 *   • `modifiedTime` — شبكة الأمان الأخيرة حين تغيب الاثنتان أعلاه.
 *
 * ملاحظة صريحة على الحدود: هذا تضييق للنافذة إلى أجزاء من الثانية، وليس قفلًا
 * ذرّيًا على مستوى Drive (واجهة Drive v3 لا تقدّم شرطًا مسبقًا على الكتابة لملفات
 * `appDataFolder`). الرفع المتزامن في نفس الملّي ثانية يبقى ممكنًا نظريًا — لكنه
 * لم يعد الحالة **الافتراضية** كما كان.
 */
export function remoteChangedSince(baseline: RemoteSnapshot | null, fresh: RemoteSnapshot | null): boolean {
  // كلاهما غائب ⇒ لا تغيير (أول رفع، وما زال لا يوجد ملف بعيد).
  if (baseline === null && fresh === null) return false;
  // ظهر ملف لم يكن موجودًا، أو اختفى ملف كان موجودًا ⇒ تغيّر.
  if (baseline === null || fresh === null) return true;

  if (baseline.id !== fresh.id) return true;
  if (baseline.sha256 !== fresh.sha256) return true;
  if (baseline.version !== fresh.version) return true;
  if (baseline.modifiedTime !== fresh.modifiedTime) return true;
  return false;
}
