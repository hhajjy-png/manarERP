/**
 * تفضيلات المستخدم المحفوظة في قاعدة البيانات — Zero Data Loss Certification Pack v1.
 *
 * ── المشكلة التي يغلقها هذا الملف ─────────────────────────────────────────────
 * وحدة النسخ الاحتياطي والمزامنة في هذا المشروع هي ملف `manar.db` وحده. كل ما
 * يعيش في `localStorage` خارجها تمامًا: لا يدخل نسخة احتياطية، ولا يُرفع إلى
 * Google Drive، ولا ينتقل إلى جهاز جديد، ويُمحى فعليًا عند تغيير `productName`
 * أو `appId` لأن Chromium يقسّم `localStorage` حسب مسار `userData`.
 *
 * ليست هذه مخاطرة نظرية: قوالب مصمّم الشيكات ضاعت بهذه الطريقة بالضبط، واحتاجت
 * حزمة إنقاذ كاملة (`Cheque Template Persistence & Legacy Recovery Pack v1`) تمسح
 * مجلدات LevelDB القديمة لاستعادتها. هذا الملف يمنع تكرار ذلك لبقية ما يبنيه
 * المستخدم بيده: ملفات تعيين أعمدة الاستيراد، ملفات الطباعة لكل نموذج، مفضّلات
 * التقارير والخطابات، عناصر القائمة المخفية.
 *
 * ── لماذا لم تُنقل القراءة إلى الخادم ──────────────────────────────────────────
 * كل مواضع الاستدعاء الحالية **متزامنة** (`useState(() => read(key))`، دوال محمّلات
 * عادية). جعل القراءة غير متزامنة كان سيفرض إعادة كتابة عشرات المكوّنات ويُدخل
 * وميض حالة أولية في كل شاشة — أي تغيير سلوك واسع مقابل صفر مكسب في حماية البيانات.
 *
 * البنية المختارة: `localStorage` يبقى **مخبأ القراءة المتزامن**، وقاعدة البيانات
 * هي **مصدر الحقيقة الدائم**. الكتابة تذهب إلى الاثنين (محليًا فورًا، وإلى الخادم
 * بدفعة مؤجّلة)، والمزامنة عند الدخول تُنزّل نسخة الخادم إلى المخبأ. النتيجة: سلوك
 * المستخدم لم يتغيّر حرفًا، والبيانات صارت داخل `manar.db`.
 */

/**
 * عميل الـAPI يُحمَّل **عند الحاجة فقط** لا في أعلى الملف.
 *
 * `persistPreference` تُستدعى من `usePersistedState` ومن `uiStore` — وهما في مسار
 * الاستيراد لكل شاشة تقريبًا. استيراد `api/client` ثابتًا هنا كان سيُدخل axios
 * ومُعترِضاته في الرسم البياني للاستيراد لكل وحدة تحفظ حالة، بما فيها ملفات نقية
 * تُختبر بلا متصفح. التحميل الكسول يُبقي مسار الكتابة المحلي المتزامن خفيفًا تمامًا.
 */
async function apiClient() {
  return (await import('../api/client')).api;
}

/** مفاتيح كاملة تُزامَن كما هي. */
const SYNCED_KEYS: readonly string[] = [
  // ملفات تعيين أعمدة الاستيراد — عمل يدوي حقيقي يبنيه المستخدم لكل شكل ملف.
  'manar.import.mapping_profiles',
  // مفضّلات ومؤخرات مركز التقارير.
  'rc_favorites_v1',
  'rc_recent_v1',
  // مفضّلات ومؤخرات محرك الخطابات.
  'manarERP.letters.favourites',
  'manarERP.letters.recents',
  // ذكاء المواقع الكويتية المُتعلَّم من إدخال المستخدم.
  'manarERP.locationUsageCounts',
  'manarERP.recentInvoiceLocations',
  // إدارة ظهور الشريط الجانبي (أُصدرت كميزة كاملة — إعداد لا حالة عابرة).
  'manarERP.sidebar.mode',
  'manarERP.sidebar.hiddenItems',
  // ظهور لوحة الاتفاقيات في صفحة الأسعار.
  'manarERP.prices.agreementsBoard',
];

/**
 * بادئات مفاتيح تُزامَن — لكل عائلة عدد مفتوح من المفاتيح (نوع نموذج، فئة قالب).
 * تعدادها واحدًا واحدًا كان سيتقادم مع أول نموذج جديد.
 */
const SYNCED_PREFIXES: readonly string[] = [
  'manar.printProfile.',   // ملف الطباعة المحفوظ لكل نوع نموذج
  'manar.copies.',         // عدد النسخ المحفوظ لكل نوع نموذج
  'manar:print-profile:',  // ملف طباعة استوديو القوالب لكل فئة
];

/** هل هذا المفتاح من التفضيلات التي تُحفَظ في قاعدة البيانات؟ */
export function isSyncedPreference(key: string): boolean {
  return SYNCED_KEYS.includes(key) || SYNCED_PREFIXES.some((p) => key.startsWith(p));
}

/** كل مفاتيح التفضيلات الموجودة حاليًا في المخبأ المحلي. */
function localSyncedKeys(): string[] {
  try {
    return Object.keys(localStorage).filter(isSyncedPreference);
  } catch {
    return [];
  }
}

// ── دفع مؤجّل إلى الخادم ──────────────────────────────────────────────────────
//
// التفضيلات تُكتب في سياقات متكرّرة (كل تبديل مفضّلة، كل تغيير ملف طباعة). إرسال
// طلب لكل كتابة كان سيُنتج عشرات النداءات في ثوانٍ. التجميع في دفعة واحدة كل
// نصف ثانية يُبقي عدد الطلبات في حدوده الطبيعية بلا أي تأخير محسوس.

const pending = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

/** الفترة التي تُجمَّع خلالها الكتابات قبل إرسالها دفعةً واحدة. */
const FLUSH_DELAY_MS = 500;

/**
 * يرسل ما تجمّع إلى الخادم. الفشل **صامت عمدًا**: النسخة المحلية كُتبت بالفعل ولم
 * يفقد المستخدم شيئًا، ومزامنة الدخول التالية سترفع ما لم يصل. إظهار خطأ لأن حفظ
 * تفضيل تأخّر كان سيقاطع المستخدم بلا فائدة.
 */
async function flush(): Promise<void> {
  flushTimer = null;
  if (pending.size === 0) return;

  const batch = [...pending].map(([key, value]) => ({ key, value }));
  pending.clear();

  try {
    const api = await apiClient();
    await api.put('/settings/preferences', { preferences: batch });
  } catch {
    /* المخبأ المحلي سليم — تُعاد المحاولة عند الدخول التالي */
  }
}

function queuePush(key: string, value: string): void {
  pending.set(key, value);
  if (flushTimer === null) flushTimer = setTimeout(() => { void flush(); }, FLUSH_DELAY_MS);
}

/**
 * يكتب قيمة خامّة (نفس ما كان يُمرَّر إلى `localStorage.setItem`) إلى المخبأ المحلي،
 * ويرفعها إلى قاعدة البيانات إن كانت من التفضيلات المسجّلة.
 *
 * آمن للاستدعاء من أي مكان: مفتاح غير مسجَّل يسلك سلوك `localStorage.setItem`
 * القديم حرفيًا، فلا يحتاج أي مستدعٍ إلى معرفة السجلّ.
 */
export function persistPreference(key: string, rawValue: string): void {
  try {
    localStorage.setItem(key, rawValue);
  } catch {
    /* التخزين ممتلئ أو غير متاح */
  }
  if (isSyncedPreference(key)) queuePush(key, rawValue);
}

/** يحذف تفضيلًا محليًا؛ الحذف من الخادم يتم بكتابة قيمة فارغة صراحةً. */
export function removePreference(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* التخزين غير متاح */
  }
  if (isSyncedPreference(key)) queuePush(key, '');
}

/**
 * يوائم المخبأ المحلي مع قاعدة البيانات بعد المصادقة.
 *
 * قاعدة الحسم: **الخادم يفوز عند وجود المفتاح لديه.** هي القاعدة الوحيدة التي
 * تجعل «جهاز جديد» يعمل: مخبأه المحلي فارغ أو يحمل قيمًا افتراضية، والقيم الحقيقية
 * كلها في القاعدة التي وصلت مع النسخة الاحتياطية أو المزامنة.
 *
 * وما وُجد محليًا فقط يُرفع — وهي هجرة أول تشغيل بعد الترقية: تفضيلات المستخدم
 * المتراكمة في `localStorage` منذ ما قبل هذه الحزمة تنتقل إلى القاعدة تلقائيًا
 * دون أن يفعل شيئًا ودون أن يفقد شيئًا.
 *
 * لا يرمي أبدًا: تعذّر الوصول إلى الخادم يعني أن التفضيلات تبقى محلية هذه الجلسة
 * — وهو سلوك ما قبل الحزمة بالضبط، لا تراجع عنه.
 */
export async function hydrateSyncedPreferences(): Promise<void> {
  let remote: Record<string, string> = {};
  try {
    const res = await (await apiClient()).get('/settings/preferences');
    const data = res.data?.data;
    if (data && typeof data === 'object') remote = data as Record<string, string>;
  } catch {
    return; // بلا خادم: يبقى المخبأ المحلي كما هو
  }

  // 1) الخادم ← المخبأ المحلي.
  for (const [key, value] of Object.entries(remote)) {
    if (!isSyncedPreference(key)) continue; // مفتاح أُلغي تسجيله في نسخة أحدث
    try {
      if (value === '') localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch {
      /* التخزين غير متاح */
    }
  }

  // 2) ما هو محلي فقط ← الخادم (هجرة لمرة واحدة).
  const onlyLocal = localSyncedKeys().filter((k) => !(k in remote));
  if (onlyLocal.length === 0) return;

  const batch = onlyLocal
    .map((key) => ({ key, value: (() => { try { return localStorage.getItem(key); } catch { return null; } })() }))
    .filter((e): e is { key: string; value: string } => e.value !== null);

  if (batch.length === 0) return;
  try {
    await (await apiClient()).put('/settings/preferences', { preferences: batch });
  } catch {
    /* تُعاد المحاولة عند الدخول التالي */
  }
}

/**
 * يمسح المخبأ المحلي للتفضيلات عند تسجيل الخروج.
 *
 * ضروري لأن التفضيلات صارت **لكل مستخدم** في القاعدة بينما `localStorage` لكل
 * جهاز: بدون المسح كان المستخدم التالي على الجهاز نفسه يرى تفضيلات سابقه في
 * اللحظة بين تسجيل دخوله واكتمال المزامنة. نفس منطق `clearPersistedUIState`.
 */
export function clearSyncedPreferenceCache(): void {
  pending.clear();
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const key of localSyncedKeys()) {
    try { localStorage.removeItem(key); } catch { /* التخزين غير متاح */ }
  }
}

/** يدفع ما تجمّع فورًا — يُستخدم قبل تسجيل الخروج حتى لا تضيع آخر كتابة. */
export async function flushPreferenceWrites(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  await flush();
}
