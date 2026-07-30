import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * قفل التشغيل على مستوى **الجهاز والمستخدم** — حماية Dev/Packaged Split-Brain.
 *
 * ── لماذا لا يكفي `app.requestSingleInstanceLock()` ─────────────────────────────
 *
 * قفل Electron المدمج مُفهرَس بمسار `userData` الخاص بالتطبيق. بيئة التطوير
 * (`electron .`) وبيئة النسخة المُعبَّأة تحملان اسمَي تطبيق مختلفَين ⇒ **مسارَي
 * `userData` مختلفَين** ⇒ **قفلَين مستقلَّين تمامًا**. فكلٌّ منهما يظن أنه الوحيد،
 * ويمكن تشغيلهما معًا.
 *
 * والأخطر أن `dataDir` يتفرّع معهما أيضًا (`backend/data` مقابل `userData/data`)،
 * فتصير لدينا **قاعدتا بيانات محليتان مستقلتان** — وكلتاهما تزامن **ملف Google
 * Drive نفسه**. هذا هو التقاطع الفعلي الذي كشفه تدقيق مصدر البيانات: رفعان
 * متنافسان من قاعدتين متباعدتين على نفس الملف البعيد.
 *
 * ── لماذا لا يكفي القفل على `dataDir` ──────────────────────────────────────────
 *
 * قفل داخل `dataDir` يعاني نفس العلّة بالضبط: البيئتان لهما `dataDir` مختلف، فلن
 * يريا قفل بعضهما أبدًا. القفل يجب أن يكون على مورد **مشترك بين البيئتين**.
 *
 * ── المورد المشترك المختار ─────────────────────────────────────────────────────
 *
 * المورد المتنازَع عليه حقيقةً هو حساب Google Drive الخاص بالمستخدم على هذا
 * الجهاز. لذلك القفل يعيش في مسار ثابت **مشتق من المجلد الشخصي للمستخدم وحده**:
 *
 *     ~/.manarERP/runtime.lock
 *
 * وهو مسار **متطابق حرفيًا** في dev وفي النسخة المُعبَّأة — لا يعتمد على
 * `userData` ولا على `dataDir` ولا على اسم التطبيق ولا على مسار المستودع. وهذا
 * ما يجعله يمنع التقاطع فعليًا لا شكليًا.
 *
 * ── دلالات القفل ───────────────────────────────────────────────────────────────
 *
 * الملف يحمل `pid` + `dataDir` + `startedAt`. عند البدء:
 *   • لا ملف            → نأخذ القفل.
 *   • ملف بـpid ميت      → قفل يتيم (إغلاق قسري/انقطاع كهرباء) → نستحوذ عليه بصمت.
 *   • ملف بـpid حيّ      → **نرفض التشغيل** ونُبلغ المستخدم بالبيئة المالكة.
 *
 * لا حذف ولا دمج ولا نسخ لأي قاعدة بيانات — الرفض فقط. القرار للمستخدم.
 *
 * لا يستورد هذا الملف `electron` إطلاقًا، فيبقى قابلًا للاختبار كطبقة سياسة نقية.
 */

export interface RuntimeLockInfo {
  /** معرّف عملية Electron الرئيسية المالكة للقفل. */
  pid: number;
  /** مجلد بيانات تلك العملية — يُميّز dev عن packaged في رسالة الخطأ. */
  dataDir: string;
  /** طابع زمني ISO لوقت الاستحواذ. */
  startedAt: string;
}

/**
 * نتيجة محاولة الاستحواذ — تُميّز صراحةً بين حالتَي فشل مختلفتَين جذريًا:
 *
 *   • `HELD`        بيئة أخرى حيّة تمسك القفل. الحماية **تعمل** وقررت الرفض.
 *   • `UNAVAILABLE` تعذّر إنشاء قفل الأمان أصلًا (صلاحيات/قرص/قراءة فاشلة).
 *                   الحماية **معطّلة**، ولا نعرف إن كانت بيئة أخرى تعمل أم لا.
 *
 * الحالتان تمنعان التشغيل، لكن التمييز ضروري: رسالة المستخدم مختلفة تمامًا،
 * ولا يجوز أن يتحوّل خطأ بنية تحتية إلى تشغيل صامت بلا حماية في حزمة غرضها
 * منع الـsplit-brain. القفل التالف أو اليتيم ليس `UNAVAILABLE` — فذاك يُسترَدّ
 * بأمان ويُعيد `ok: true`.
 */
export type AcquireResult =
  | { ok: true; tookOverStaleLock: boolean }
  | { ok: false; reason: 'HELD'; holder: RuntimeLockInfo }
  | { ok: false; reason: 'UNAVAILABLE'; error: string };

/** المسار الثابت للقفل — متطابق في dev والنسخة المُعبَّأة. */
export function runtimeLockPath(homeDir: string = os.homedir()): string {
  return path.join(homeDir, '.manarERP', 'runtime.lock');
}

/** هل العملية حيّة؟ `signal 0` لا يُرسل شيئًا — يستعلم عن الوجود فقط. */
function defaultIsProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH = لا وجود لها. EPERM = موجودة لكن لعملية/مستخدم آخر ⇒ حيّة.
    return (err as NodeJS.ErrnoException)?.code === 'EPERM';
  }
}

function parseLock(raw: string): RuntimeLockInfo | null {
  try {
    const v = JSON.parse(raw) as Partial<RuntimeLockInfo> | null;
    if (!v || !Number.isInteger(v.pid) || typeof v.dataDir !== 'string') return null;
    return { pid: v.pid as number, dataDir: v.dataDir, startedAt: String(v.startedAt ?? '') };
  } catch {
    return null;
  }
}

const errText = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * يحاول الاستحواذ على قفل التشغيل. **لا يرمي أبدًا** — كل فشل يُصنَّف ويُعاد.
 *
 * محتوى تالف أو غير قابل للتحليل يُعامَل كقفل يتيم فيُسترَدّ (لا يُقعِد التطبيق).
 * أما **تعذّر** إنشاء/قراءة/كتابة القفل (صلاحيات، قرص ممتلئ، مسار للقراءة فقط)
 * فيُعاد كـ`UNAVAILABLE` ليُوقف المستدعي التشغيل — لا نُكمل بلا حماية.
 *
 * `deps` للاختبار فقط؛ الإنتاج يستخدم الافتراضيات.
 */
export function acquireRuntimeLock(
  dataDir: string,
  deps: {
    lockPath?: string;
    pid?: number;
    now?: Date;
    isProcessAlive?: (pid: number) => boolean;
  } = {},
): AcquireResult {
  const lockPath = deps.lockPath ?? runtimeLockPath();
  const pid = deps.pid ?? process.pid;
  const now = deps.now ?? new Date();
  const isAlive = deps.isProcessAlive ?? defaultIsProcessAlive;

  const payload = JSON.stringify({ pid, dataDir, startedAt: now.toISOString() } satisfies RuntimeLockInfo);

  try {
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  } catch (err) {
    return { ok: false, reason: 'UNAVAILABLE', error: `تعذّر إنشاء مجلد القفل: ${errText(err)}` };
  }

  // `wx` = إنشاء حصري ذرّي: ينجح فقط إن لم يكن الملف موجودًا. يمنع سباق
  // بيئتين تبدآن في نفس اللحظة (فحص-ثم-كتابة غير ذرّي كان سيسمح للاثنتين).
  try {
    fs.writeFileSync(lockPath, payload, { flag: 'wx' });
    return { ok: true, tookOverStaleLock: false };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'EEXIST') {
      // ليس «الملف موجود» ⇒ عجز فعلي عن إنشاء القفل.
      return { ok: false, reason: 'UNAVAILABLE', error: `تعذّر إنشاء ملف القفل: ${errText(err)}` };
    }
  }

  // الملف موجود — من يملكه؟ فشل القراءة يعني أننا **لا نعرف**، وهو ليس يُتمًا:
  // الافتراض بأنه يتيم هنا كان سيسمح بالاستحواذ على قفل بيئة حيّة.
  let raw: string;
  try {
    raw = fs.readFileSync(lockPath, 'utf8');
  } catch (err) {
    return { ok: false, reason: 'UNAVAILABLE', error: `تعذّر قراءة ملف القفل: ${errText(err)}` };
  }

  const existing = parseLock(raw);

  // نفس العملية تُعيد الاستحواذ (إعادة دخول) — ليست تقاطعًا.
  if (existing && existing.pid === pid) return { ok: true, tookOverStaleLock: false };

  if (existing && isAlive(existing.pid)) {
    return { ok: false, reason: 'HELD', holder: existing };
  }

  // يتيم (pid ميت) أو تالف المحتوى → استحواذ آمن.
  try {
    fs.writeFileSync(lockPath, payload);
  } catch (err) {
    return { ok: false, reason: 'UNAVAILABLE', error: `تعذّر استرداد القفل اليتيم: ${errText(err)}` };
  }
  return { ok: true, tookOverStaleLock: true };
}

/**
 * يحرّر القفل — فقط إن كنّا نحن مالكه.
 *
 * شرط الملكية ضروري: لو استحوذت بيئة أخرى على قفل ظنّته يتيمًا، يجب ألّا يحذف
 * خروجُنا المتأخر قفلَها الحيّ.
 */
export function releaseRuntimeLock(
  deps: { lockPath?: string; pid?: number } = {},
): void {
  const lockPath = deps.lockPath ?? runtimeLockPath();
  const pid = deps.pid ?? process.pid;
  try {
    if (!fs.existsSync(lockPath)) return;
    const existing = parseLock(fs.readFileSync(lockPath, 'utf8'));
    if (existing && existing.pid !== pid) return; // ليس قفلنا
    fs.unlinkSync(lockPath);
  } catch {
    // أفضل جهد — الخروج يجب ألّا يتعطّل بسبب فشل تحرير القفل؛
    // البقايا ستُعامَل كقفل يتيم في التشغيل التالي.
  }
}

/** رسالة عربية تشرح للمستخدم أي بيئة تمسك القفل وماذا يفعل. لا حذف ولا دمج تلقائي. */
export function describeLockConflict(holder: RuntimeLockInfo, ourDataDir: string): string {
  const sameEnv = path.resolve(holder.dataDir) === path.resolve(ourDataDir);
  const head = sameEnv
    ? 'نسخة أخرى من نظام المنار تعمل بالفعل على هذا الجهاز.'
    : 'نسخة أخرى من نظام المنار تعمل بالفعل على هذا الجهاز، وتستخدم قاعدة بيانات مختلفة.';
  const detail = sameEnv
    ? ''
    : '\n\nتشغيل بيئتين معًا (نسخة التطوير ونسخة التثبيت مثلًا) يعني قاعدتَي بيانات منفصلتين ' +
      'تُزامنان ملف Google Drive نفسه — وهو ما قد يؤدي إلى فقدان بيانات.';
  return (
    `${head}${detail}\n\n` +
    `مجلد بيانات النسخة العاملة: ${holder.dataDir}\n` +
    `مجلد بيانات هذه النسخة: ${ourDataDir}\n` +
    `معرّف العملية العاملة: ${holder.pid}\n\n` +
    'أغلق النسخة العاملة أولًا ثم أعد المحاولة. لم يُغيَّر أي ملف ولم تُنفَّذ أي مزامنة.'
  );
}
