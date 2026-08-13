import fs from 'fs';
import path from 'path';

/**
 * Google Drive Data Safety Pack v2 — F-05 · علامة «قيد المراجعة» بعد الاستعادة.
 *
 * ── الخطر الذي تغلقه ───────────────────────────────────────────────────────────
 *
 * المزامنة تقيس **الاختلاف** لا **الأحدثية**. فبعد استعادة نسخة احتياطية قديمة:
 *   • `localChanged = true`  (الملف تغيّر فعلًا)
 *   • `remoteChanged = false` (لم يرفع أحد شيئًا على Drive منذ آخر مزامنة)
 *   ⇒ القرار `UPLOAD` ⇒ مزامنة الإغلاق ترفع قاعدة عمرها أسبوع فوق النسخة السحابية
 *      الحالية، **بلا حوار ولا تحذير**.
 *
 * والاتجاه المعاكس خطر بالمثل: إعادة تشغيل التطبيق بعد الاستعادة كانت مزامنة البدء
 * فيها تُنزّل النسخة السحابية الأحدث ⇒ **تُلغي الاستعادة التي طلبها المستخدم للتوّ**.
 *
 * لذلك العلامة تُوقف **كلا الاتجاهين التلقائيين**. «قيد المراجعة» تعني حرفيًا: لا
 * يقرّر النظام نيابةً عن المستخدم في أي اتجاه حتى يقرّر هو.
 *
 * ── لماذا ملف مستقلّ لا حقل في `sync-metadata.json` ────────────────────────────
 *
 * قُيّم الخياران، ورجّح الملفَ المستقلّ سببان هندسيان لا تفضيل شكلي:
 *
 *   1. **اتجاه الفشل عند التلف.** `loadMetadata` يبتلع أي خطأ ويُعيد الافتراضيات.
 *      فحقلٌ داخل ذلك الملف **يختفي** عند أي تلف ⇒ تستأنف المزامنة التلقائية ⇒ وهو
 *      الاتجاه غير الآمن بالضبط. هنا الدلالة هي **وجود الملف** لا محتواه: ملف مبتور
 *      أو غير قابل للتحليل يبقى موجودًا ⇒ العلامة قائمة ⇒ الاتجاه الآمن.
 *
 *   2. **كاتبان في عمليتين.** الاستعادة لها مساران حيّان في الواجهة: `backup:restore`
 *      في عملية Electron، و`POST /backups/:id/restore` في الخدمة الخلفية. كتابة
 *      الخادم الخلفي داخل `sync-metadata.json` كانت تعني إمّا تكرار منطق الكتابة
 *      الذرّية في عملية ثانية، أو الكتابة غير الذرّية فوق ملف يملكه محرّك آخر ويكتبه
 *      عشرات المرات في الجلسة — أي **إعادة إدخال ثغرة P0-6** التي أُغلقت سابقًا.
 *      ملف صغير ذو غرض واحد لا يحتاج كتابة ذرّية أصلًا، لأن الوجود هو الإشارة.
 *
 * ── حدود ───────────────────────────────────────────────────────────────────────
 *
 * الاسم لا يطابق أي نمط يمسحه `syncTempCleanup` (`sync-tmp-*.db`)، فلا يُحذف تلقائيًا
 * أبدًا. ولا يُنسخ مع المثبّت. ولا يحمل أي سرّ.
 */

/** اسم ملف العلامة داخل مجلد البيانات. يجب أن يطابق نظيره في الخدمة الخلفية. */
export const PENDING_REVIEW_FILENAME = 'sync-pending-review.json';

/** مصدر الوسم. `RESTORE` هو الوحيد اليوم — النوع صريح ليبقى التوسّع مقصودًا لا عرضيًا. */
export type PendingReviewSource = 'RESTORE';

export interface PendingReviewMark {
  /** متى وُسمت الحالة (ISO). */
  since: string;
  source: PendingReviewSource;
  /** وصف بشري — اسم ملف النسخة المستعادة مثلًا. تشخيصي بحت. */
  detail?: string;
}

export function pendingReviewPath(dataDir: string): string {
  return path.join(dataDir, PENDING_REVIEW_FILENAME);
}

/**
 * يضع العلامة. يُعيد `false` عند الفشل بدل الرمي — المُستدعي (مسار استعادة نجح
 * فعلًا) يجب أن يُسجّل التحذير ويُكمل، لا أن ينهار بعد أن استُبدلت القاعدة بالفعل.
 */
export function markPendingReview(dataDir: string, mark: Omit<PendingReviewMark, 'since'>): boolean {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const payload: PendingReviewMark = { since: new Date().toISOString(), ...mark };
    fs.writeFileSync(pendingReviewPath(dataDir), JSON.stringify(payload, null, 2), {
      mode: 0o600,
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * هل القاعدة قيد المراجعة؟ — **الوجود وحده**، بلا قراءة ولا تحليل.
 *
 * هذا هو جوهر التصميم: لا يمكن لتلف المحتوى أن يُسقط العلامة.
 */
export function isPendingReview(dataDir: string): boolean {
  try {
    return fs.existsSync(pendingReviewPath(dataDir));
  } catch {
    return false;
  }
}

/**
 * تفاصيل العلامة للعرض والتسجيل — **أفضل جهد**. تُعيد `null` إن تعذّر التحليل،
 * بينما `isPendingReview` تبقى `true`. الفصل مقصود: القرار يقوم على الوجود،
 * والتفاصيل زينة لا شرط.
 */
export function readPendingReview(dataDir: string): PendingReviewMark | null {
  try {
    const raw = JSON.parse(fs.readFileSync(pendingReviewPath(dataDir), 'utf8')) as Partial<PendingReviewMark>;
    if (typeof raw?.since !== 'string' || raw.source !== 'RESTORE') return null;
    return { since: raw.since, source: 'RESTORE', detail: typeof raw.detail === 'string' ? raw.detail : undefined };
  } catch {
    return null;
  }
}

/**
 * يرفع العلامة. يُستدعى **حصريًا** من عملية يبدأها المستخدم صراحةً (مزامنة الآن،
 * رفع، تنزيل، حلّ تعارض) — الضغط على الزرّ **هو** المراجعة. لا يُستدعى من أي مسار
 * تلقائي إطلاقًا، وإلا لأسقط النظام العلامة عن نفسه.
 */
export function clearPendingReview(dataDir: string): void {
  try {
    const file = pendingReviewPath(dataDir);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    // أفضل جهد — فشل الرفع يعني بقاء العلامة، وهو الاتجاه الآمن.
  }
}
