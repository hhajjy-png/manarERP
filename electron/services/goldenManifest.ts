import fs from 'fs';

/**
 * Google Drive Data Safety Pack v2 — F-03 · بيان القالب الذهبي (Golden Manifest).
 *
 * ── الخطر الذي يغلقه ───────────────────────────────────────────────────────────
 *
 * القاعدة (4) في `syncDecision.pure.ts` كانت تُنزّل النسخة السحابية فوق بذرة القالب
 * **بلا أي مقارنة أحدثية**. افتراضها الضمني: «البذرة أقدم من Drive دائمًا» — وهو صحيح
 * حين يكون القالب فارغًا، وخاطئ تمامًا في نموذج Golden Database حيث القالب المشحون
 * هو **آخر لقطة إنتاجية**. النتيجة كانت: قالب أحدث يُستبدل تلقائيًا بنسخة سحابية أقدم.
 *
 * ── لماذا بيان مستقلّ لا `mtime` ───────────────────────────────────────────────
 *
 * `mtime` لملف القالب المشحون ليس دليلًا موثوقًا: النسخ والأرشفة وأدوات المزامنة
 * وفكّ ضغط المثبّت — كلها قد تُعيد ضبطه، فيُنتج ادّعاء أحدثية كاذبًا في الاتجاهين.
 * البيان يُكتب **مرّة واحدة على جهاز البناء** (حيث الملف مرجعي وطازج) ويُجمَّد داخل
 * الحزمة، فلا يتأثر بأي شيء يجري للملف بعد ذلك.
 *
 * ── لماذا البصمة شرط لا تزيين ──────────────────────────────────────────────────
 *
 * `sha256` في البيان ليست معلومة تشخيصية: هي **شرط الثقة**. البيان لا يُقبل إلا إذا
 * طابقت بصمته بصمة القاعدة المحلية الفعلية — فبيانٌ لا يستطيع أن يشهد لقاعدة لا
 * يصفها. بدون هذا الشرط كان بيانٌ قديم بقي في `resources` بعد تحديث ناقص قادرًا على
 * منح قاعدة مختلفة تمامًا ادّعاء أحدثية لا تملكه.
 *
 * ── السقوط الآمن ───────────────────────────────────────────────────────────────
 *
 * كل مسار فشل هنا يُعيد `null`/`false` — أي **السلوك السابق حرفيًا** (تنزيل البذرة
 * من السحابة). بيان مفقود، أو تالف، أو ناقص الحقول، أو غير مطابق البصمة، أو تاريخ
 * غير صالح: لا شيء منها يُنتج سلوكًا جديدًا غير معروف. الحماية إضافية بحتة.
 */

/** اسم ملف البيان داخل `resources/seed-data/` — يجب أن يطابق `scripts/prepare-seed-data.js`. */
export const GOLDEN_MANIFEST_FILENAME = 'golden-manifest.json';

export interface GoldenManifest {
  /** بصمة القالب كما شُحن — شرط قبول البيان. */
  sha256: string;
  sizeBytes: number;
  /**
   * آخر كتابة بيانات فعلية في القاعدة، مُلتقطة لحظة التغليف على جهاز البناء.
   *
   * هذا هو الحقل الذي تُبنى عليه المقارنة — لا `packagedAt`. الفرق جوهري: إعادة
   * بناء مثبّت من قاعدة قديمة تُنتج `packagedAt` جديدًا بينما البيانات نفسها لم
   * تتغيّر، فالمقارنة به كانت ستمنح القالب أحدثية لا يستحقها.
   */
  dataModifiedAt: string;
  /** وقت التغليف — تشخيصي بحت، لا يشارك في أي قرار. */
  packagedAt?: string;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/** يحوّل نصّ JSON إلى بيان صالح، أو `null` إن كان تالفًا أو ناقص أي حقل حاسم. */
export function parseGoldenManifest(raw: string): GoldenManifest | null {
  try {
    const value = JSON.parse(raw) as Partial<GoldenManifest> | null;
    if (!value || typeof value !== 'object') return null;
    if (!isNonEmptyString(value.sha256)) return null;
    if (!isNonEmptyString(value.dataModifiedAt)) return null;
    if (typeof value.sizeBytes !== 'number' || !Number.isFinite(value.sizeBytes)) return null;
    if (!Number.isFinite(Date.parse(value.dataModifiedAt))) return null;
    return {
      sha256: value.sha256,
      sizeBytes: value.sizeBytes,
      dataModifiedAt: value.dataModifiedAt,
      packagedAt: isNonEmptyString(value.packagedAt) ? value.packagedAt : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * يقرأ البيان من مساره المشحون. `null` في كل حالة غير مثالية — لا رمي، ولا تعطيل
 * لأي مسار: غياب البيان حالة **طبيعية** (بيئة التطوير، ومثبّتات ما قبل هذه الحزمة).
 */
export function readGoldenManifest(manifestPath: string | null): GoldenManifest | null {
  if (!manifestPath) return null;
  try {
    return parseGoldenManifest(fs.readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * هل القالب الذهبي **أحدث بيانات** من النسخة الموجودة على Drive؟
 *
 * دالة نقية بالكامل (لا قرص ولا شبكة) — تستقبل حقائق مُجهَّزة وتُعيد حكمًا، فهي
 * مغطّاة بالاختبارات مباشرة كما `decideSyncAction`.
 *
 * تُعيد `true` فقط عند اجتماع **ثلاثة** شروط، وأي إخفاق في أيٍّ منها ⇒ `false`:
 *   1. بيان موجود وصالح.
 *   2. بصمة البيان = بصمة القاعدة المحلية الحالية (البيان يصف هذا الملف بعينه).
 *   3. تاريخ بيانات القالب **بعد** وقت تعديل ملف Drive، وكلاهما تاريخ صالح.
 *
 * التساوي التامّ في التاريخ يُعيد `false` عمدًا: لا أحدثية تُدّعى بلا فارق موجب.
 */
export function isGoldenNewerThanRemote(
  manifest: GoldenManifest | null,
  localSha256: string | null,
  remoteModifiedTime: string | null,
): boolean {
  if (!manifest || !localSha256 || !remoteModifiedTime) return false;
  if (manifest.sha256 !== localSha256) return false;

  const goldenMs = Date.parse(manifest.dataModifiedAt);
  const remoteMs = Date.parse(remoteModifiedTime);
  if (!Number.isFinite(goldenMs) || !Number.isFinite(remoteMs)) return false;

  return goldenMs > remoteMs;
}
