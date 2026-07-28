/**
 * Print Center — feature flags.
 *
 * PRINT_CENTER_FOUNDATION_V1 gates the new gateway. When OFF (the default in this
 * phase for anything that has not been physically verified), every caller keeps the
 * exact legacy code path it had before. This is the rollback lever: flip it off and
 * the Print Center becomes inert without a revert.
 *
 * Resolution order (first hit wins):
 *   1. `localStorage['manar:flag:PRINT_CENTER_FOUNDATION_V1']` — 'on' | 'off'.
 *      Lets an operator or QA toggle the pilot on a machine without a rebuild, and
 *      lets us turn it OFF in the field if the physical print regresses.
 *   2. Vite env `VITE_PRINT_CENTER_FOUNDATION_V1` — build-time default.
 *   3. DEFAULTS below.
 *
 * The flag is read through a function (never captured in a module-level const) so a
 * toggle takes effect on the next print without a reload.
 */

export const PRINT_CENTER_FOUNDATION_V1 = 'PRINT_CENTER_FOUNDATION_V1' as const;

/**
 * معاينة ورقة اختبار المعايرة (استوديو معايرة الشيكات) — علم **مستقل تمامًا**.
 *
 * مستقل عن أعلام معاينة مستندات الأعمال (فواتير، عروض أسعار، نماذج). ورقة المعايرة
 * **أداة قياس فيزيائي**، لا
 * مستند عمل، وسببُ التراجع فيها مختلف كليًا (دقة مليمترية على ورق حقيقي). ربطها بعلم
 * مشترك كان سيجعل إطفاء الفواتير يُطفئ المعايرة، والعكس — وهو اقتران بلا مبرر.
 *
 * مطفأ ⇒ زر «اختبار المعايرة» يستدعي `printCurrentView()` مباشرة، بلا معترِض ولا حوار:
 * نفس السلوك القديم حرفًا بحرف. هذا هو رافع التراجع الفوري في الميدان، بلا إصدار جديد.
 */
export const CHEQUE_CALIBRATION_TEST_PREVIEW_V1 = 'CHEQUE_CALIBRATION_TEST_PREVIEW_V1' as const;

/**
 * True Chromium WYSIWYG Preview — Proof of Concept. OFF افتراضيًا.
 *
 * تجربة معزولة على مستند الفاتورة فقط: نفس مستند المعاينة المُركّب يُرسل إلى نافذة
 * Chromium مخفية وتعود صفحاته الحقيقية (printToPDF) للعرض. **لا يطبع شيئًا** —
 * زر «طباعة» يبقى على المسار القديم حرفيًا. المعاينة المتصلة الحالية تبقى الافتراضي،
 * وتبقى متاحة كمسار تراجع داخل التجربة نفسها عند أي فشل توليد.
 */
export const TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC = 'TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC' as const;

/**
 * تعميم «المعاينة الدقيقة» على بقية النماذج — علم **مستقل تمامًا** عن علم الفاتورة.
 *
 * إضافي بالكامل: إطفاؤه يُخفي زر المعاينة الدقيقة الجديد **فقط**. تبقى المعاينة القديمة
 * وزر الطباعة ومسار الطباعة وكل الوظائف الحالية كما هي حرفًا بحرف.
 * ولا يمسّ سلوك الفاتورة إطلاقًا (لها علمها `TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC`).
 *
 * ON بعد اكتمال المراجعة البصرية اليدوية لكل نموذج والمراجعة المستقلة والاختبارات.
 * التراجع/التفعيل بلا إصدار:
 *   localStorage.setItem('manar:flag:UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1', 'off' | 'on')
 */
export const UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 = 'UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1' as const;

export type FlagName =
  | typeof PRINT_CENTER_FOUNDATION_V1
  | typeof CHEQUE_CALIBRATION_TEST_PREVIEW_V1
  | typeof TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC
  | typeof UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1;

/**
 * Default ON: the pilot routes through the gateway, which in this phase delegates to
 * exactly the same Electron print call the page used before (see printService).
 * Physical output is therefore unchanged — the flag exists so it can be turned OFF
 * instantly if a printer disagrees.
 */
const DEFAULTS: Record<FlagName, boolean> = {
  PRINT_CENTER_FOUNDATION_V1: true,

  // ── معاينة ورقة اختبار المعايرة ────────────────────────────────────────────
  // ON: المعاينة **لا تطبع**. زر «طباعة» بداخلها يغلقها ثم يستدعي `printCurrentView()`
  // — نفس المرجع الدالّي الذي كان الزرّ يستدعيه مباشرة — فمسار الطباعة الفيزيائي
  // (webContents.print · @page المشتقّ من الهندسة · هامش صفر · مقياس 100%) لم يُمسّ.
  // ما أُضيف خطوة عرض قبل الطباعة، لا مسار طباعة ثانٍ.
  CHEQUE_CALIBRATION_TEST_PREVIEW_V1: true,

  // ── معاينة WYSIWYG للفاتورة — ON: التفعيل الرسمي في الإنتاج ────────────────
  // اكتمل الفحص: شريط PDFium مخفيّ (‎#toolbar=0‎)، ولا Ctrl+P ولا Ctrl+S يفتحان حوارًا
  // أصليًا حتى والتركيز داخل الـ PDF (فُحص بمفاتيح نظام حقيقية)، والنقر بالزر الأيمن لا
  // يُظهر قائمة. الطباعة تبقى على المسار القديم وحده.
  //
  // التراجع فوري وبلا إصدار: localStorage['manar:flag:TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC'] = 'off'
  TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC: true,

  // ── تعميم المعاينة الدقيقة على النماذج الأربعة عشر — ON: التفعيل الرسمي ──────
  // اكتملت المراجعة البصرية اليدوية لكل نموذج، والمراجعة المستقلة، والاختبارات.
  //
  // التفعيل **لا يغيّر الطباعة**: كل نموذج يحتفظ بزر طباعته ومساره كما هو حرفًا بحرف.
  // المعاينة العادية القديمة أُزيلت من كل النماذج؛ المعاينة الدقيقة هي مسار المعاينة
  // الوحيد المتبقي، متاحة عبر زرها الخاص.
  //
  // التراجع فوري وبلا إصدار:
  //   localStorage['manar:flag:UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1'] = 'off'
  // ⇒ يختفي زر «المعاينة الدقيقة» وحده، ولا شيء غيره.
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1: true,
};

function readOverride(name: FlagName): boolean | null {
  try {
    const raw = localStorage.getItem(`manar:flag:${name}`);
    if (raw === 'on') return true;
    if (raw === 'off') return false;
  } catch {
    /* storage unavailable — fall through */
  }
  try {
    const env = import.meta.env?.[`VITE_${name}`];
    if (env === 'true' || env === '1') return true;
    if (env === 'false' || env === '0') return false;
  } catch {
    /* no env — fall through */
  }
  return null;
}

export function isFlagEnabled(name: FlagName): boolean {
  return readOverride(name) ?? DEFAULTS[name];
}

/** Operator/QA escape hatch — used by no UI in this phase; call from the console. */
export function setFlagOverride(name: FlagName, value: boolean | null): void {
  try {
    if (value === null) localStorage.removeItem(`manar:flag:${name}`);
    else localStorage.setItem(`manar:flag:${name}`, value ? 'on' : 'off');
  } catch {
    /* ignore */
  }
}
