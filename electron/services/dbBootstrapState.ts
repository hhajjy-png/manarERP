import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

/** بصمة ملف متزامنة — تُستخدم على القالب فقط، وعند فقد الوسم الصريح وحده. */
export function sha256FileSync(filePath: string): string {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

/**
 * حالة تهيئة قاعدة البيانات — حماية «بذرة القالب» في أول تشغيل للنسخة المُعبَّأة.
 *
 * ── الخطر ──────────────────────────────────────────────────────────────────────
 *
 * في الإنتاج، `getUserDataPaths()` تنسخ قاعدة القالب المُضمَّنة إلى
 * `userData/data/manar.db` عند أول تشغيل. القالب ملف مبني مع المثبّت وقد يكون
 * قديمًا بأشهر. ثم تعمل مزامنة البدء فترى:
 *   • hash محلي ≠ lastSyncedHash (لا metadata بعد) ⇒ «تغيير محلي»
 *   • hash سحابي ≠ lastSyncedHash                  ⇒ «تغيير سحابي»
 *   ⇒ CONFLICT — واختيار المستخدم «المحلي» يرفع **القالب القديم فوق بيانات Drive**.
 *
 * ── العقد ──────────────────────────────────────────────────────────────────────
 *
 * القالب في أول تشغيل **بذرة تهيئة (Seed)** لا قاعدة مستخدم. لا يجوز أن ينافس
 * نسخة Drive قائمة، ولا أن يُرفع فوقها.
 *
 * ── لماذا لا يكفي «غياب sync-metadata» ────────────────────────────────────────
 *
 * غياب الـmetadata يحدث أيضًا لمستخدم حقيقي حذف ملف الحالة، أو ربط حسابًا لأول
 * مرة بعد شهور عمل. تصنيف قاعدته الحقيقية كـ«بذرة» كارثة معاكسة. لذلك التصنيف
 * هنا يقوم على **دليلين معًا**، ولا يكفي أحدهما:
 *
 *   1. **هوية صريحة:** ملف حالة يُكتب **في نفس اللحظة** التي تُنسخ فيها البذرة —
 *      لا استنتاج ولا تخمين.
 *   2. **تحقّق بالبصمة:** الملف يحمل `seedSha256` للبذرة كما نُسخت. والقاعدة لا
 *      تُعدّ بذرة إلا إذا كانت بصمتها الحالية **مطابقة حرفيًا**. أول كتابة حقيقية
 *      من المستخدم تُغيّر البصمة ⇒ تصير قاعدة حقيقية تلقائيًا وإلى الأبد.
 *
 * فلا يمكن لقاعدة مستخدم حقيقية أن تُصنَّف بذرة إلا إن كانت **مطابقة بايتًا ببايت**
 * للبذرة المُسجَّلة — وعندها هي البذرة فعلًا.
 *
 * لا نستخدم تاريخ الملف ولا عدد السجلات إطلاقًا (ممنوع صراحةً في العقد).
 * ولا يحذف هذا الملف أي قاعدة ولا يستبدلها — يصنّف فقط.
 */

export const BOOTSTRAP_STATE_FILE = 'db-bootstrap-state.json';

export type BootstrapState = 'SEED' | 'REAL';

export interface BootstrapStateFile {
  state: BootstrapState;
  /** بصمة البذرة كما نُسخت — شرط التحقق الثاني. */
  seedSha256?: string;
  seededAt?: string;
  /** مسار القالب المصدر — تشخيصي فقط. */
  templateSource?: string;
  /** متى صارت قاعدة حقيقية (تنزيل bootstrap ناجح أو أول تعديل). */
  promotedAt?: string;
}

function statePath(dataDir: string): string {
  return path.join(dataDir, BOOTSTRAP_STATE_FILE);
}

export function readBootstrapState(dataDir: string): BootstrapStateFile | null {
  try {
    const raw = fs.readFileSync(statePath(dataDir), 'utf8');
    const v = JSON.parse(raw) as Partial<BootstrapStateFile> | null;
    if (!v || (v.state !== 'SEED' && v.state !== 'REAL')) return null;
    return v as BootstrapStateFile;
  } catch {
    return null; // غائب أو تالف ⇒ لا ادّعاء بذرة (fail-safe: نعامله كقاعدة حقيقية)
  }
}

function write(dataDir: string, value: BootstrapStateFile): void {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(statePath(dataDir), JSON.stringify(value, null, 2), 'utf8');
  } catch {
    // أفضل جهد. فشل الكتابة يعني فقط أن الحماية لن تُفعَّل — وهو السلوك السابق
    // بالضبط، لا تدهور عنه. لا يجوز أن يمنع فشلُ الوسم بدءَ التطبيق.
  }
}

/** يُوسم فور نسخ القالب — الدليل الصريح الوحيد على أن هذه بذرة. */
export function markSeeded(dataDir: string, seedSha256: string, templateSource: string, now: Date = new Date()): void {
  write(dataDir, { state: 'SEED', seedSha256, templateSource, seededAt: now.toISOString() });
}

/**
 * ترقية إلى «قاعدة حقيقية» — تُستدعى بعد تنزيل bootstrap ناجح.
 * تُكتب فقط إن كان هناك ملف حالة أصلًا؛ لا نُنشئ حالة لقواعد لم تُبذَر.
 */
export function markBootstrapComplete(dataDir: string, now: Date = new Date()): void {
  const existing = readBootstrapState(dataDir);
  if (!existing || existing.state === 'REAL') return;
  write(dataDir, { ...existing, state: 'REAL', seedSha256: undefined, promotedAt: now.toISOString() });
}

/**
 * هل القاعدة المحلية ما زالت **بذرة قالب لم تُمسّ**؟
 *
 * ── مساران مستقلان للإثبات ─────────────────────────────────────────────────────
 *
 * **1) الوسم الصريح** — الطريق السريع: حالة `SEED` + تطابق البصمة المُسجَّلة.
 *
 * **2) بصمة القالب المشحون** — شبكة أمان: إن كانت القاعدة المحلية **مطابقة
 *    بايتًا ببايت** للقالب المُرفَق مع المثبّت، فهي بذرة بالتعريف — لا يمكن
 *    لقاعدة أُدخلت فيها بيانات أن تطابقه. هذا المسار يُغلق الفجوة الذرّية بين
 *    `copyFileSync` و`markSeeded`: لو تعطّل التطبيق بينهما، أو فشلت كتابة ملف
 *    الحالة (قرص/صلاحيات)، تبقى البذرة مكتشَفة.
 *
 * الحالة `REAL` تحسم دائمًا وتُغلق المسار الثاني: قاعدة رُقّيت بعد bootstrap ناجح
 * ليست بذرة مهما كانت بصمتها.
 *
 * ── ما لا يُستخدم إطلاقًا ───────────────────────────────────────────────────────
 * تاريخ الملف · عدد السجلات · اسم البيئة · غياب `sync-metadata`. الإثبات
 * تشفيري بحت.
 *
 * @param templatePath مسار القالب المشحون، أو `null` حين لا ينطبق. **يجب أن
 *   يكون `null` في بيئة التطوير**: هناك `dataDir` هو نفسه مجلد القالب، فالملفان
 *   نفس الملف وتطابق البصمة حتمي — وكان سيُصنّف قاعدة المطوّر الحقيقية بذرةً.
 *   انظر `getSeedTemplatePath()` في `backendLauncher.ts`.
 */
export function isPristineSeed(
  dataDir: string,
  currentSha256: string | null,
  templatePath: string | null = null,
): boolean {
  if (!currentSha256) return false;

  const s = readBootstrapState(dataDir);
  if (s?.state === 'REAL') return false;
  if (s?.state === 'SEED' && s.seedSha256) return s.seedSha256 === currentSha256;

  // لا وسم صالح (غائب/تالف/بلا بصمة) → المقارنة المباشرة بالقالب المشحون.
  if (!templatePath) return false;
  try {
    return sha256FileSync(templatePath) === currentSha256;
  } catch {
    return false; // تعذّر قراءة القالب ⇒ لا ادّعاء بذرة (fail-safe)
  }
}
