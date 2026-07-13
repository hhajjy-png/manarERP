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

// ── Phase 2 — per-document migration flags ──────────────────────────────────────
//
// FLAG HIERARCHY: a document uses the Print Center only when the MASTER flag AND its
// own flag are both on (`isPhase2Enabled`). The master is the single kill switch; the
// per-document flags let each migration be rolled out — and rolled back — on its own
// physical-print verification, which is exactly the strangler discipline this repo
// already follows for every release.
//
// DEFAULTS: a per-document flag turns ON only after that document's physical print
// gate passes — the flag is never flipped on a hope. All supported documents have now
// passed theirs, so all are ON; the flags remain as the per-document rollback lever.
export const PRINT_CENTER_PHASE2 = 'PRINT_CENTER_PHASE2' as const;
export const PRINT_CENTER_PHASE2_RECEIPT_VOUCHER = 'PRINT_CENTER_PHASE2_RECEIPT_VOUCHER' as const;
// Phase 2B — independent per-document flags: each can be rolled back on its own, and a
// failed or uncertain style capture must never auto-enable one.
export const PRINT_CENTER_PHASE2_INVOICE = 'PRINT_CENTER_PHASE2_INVOICE' as const;
export const PRINT_CENTER_PHASE2_QUOTATION = 'PRINT_CENTER_PHASE2_QUOTATION' as const;

/**
 * Legacy Print Preview Overlay — Phase 1 rollout across the FormLayout forms.
 *
 * Three flags, not thirteen: one master kill switch and two cohesive groups, so a
 * rollout (or a rollback) is one decision per group rather than one per form. The
 * master enables nothing by itself — a form previews only when the master AND its
 * group are on, exactly like the Phase 2 document flags.
 *
 * كلها ON بعد اكتمال الفحص اليدوي لكل مجموعة. وحين يُطفأ أيٌّ منها — بالافتراض أو
 * بـ override — يُربط زر الطباعة بـ `doPrint` مباشرة بلا معترِض بينهما: نفس السلوك
 * القديم حرفًا بحرف. الإطفاء هو رافعة التراجع، بلا إصدار جديد.
 */
export const PRINT_PREVIEW_LEGACY_FORMS_V1 = 'PRINT_PREVIEW_LEGACY_FORMS_V1' as const;
/** سند الصرف · طلب الشراء */
export const PRINT_PREVIEW_LEGACY_FORMS_FINANCE = 'PRINT_PREVIEW_LEGACY_FORMS_FINANCE' as const;
/** خطابات ونماذج الموارد البشرية الثمانية */
export const PRINT_PREVIEW_LEGACY_FORMS_HR = 'PRINT_PREVIEW_LEGACY_FORMS_HR' as const;
/**
 * Phase 2 — النماذج ذات المسار الخاص (لا تستخدم FormLayout): عقد العمل · قسيمة الراتب.
 * علم واحد لهما: كلاهما يُربط بنفس المِحوَل الصغير، وسبب الرجوع فيهما واحد.
 * سند القبض **ليس هنا** — له بوابته المستقلة (PRINT_CENTER_PHASE2_RECEIPT_VOUCHER)،
 * وإضافته هنا كانت ستُنتج علمين يتحكّمان في السلوك نفسه.
 */
export const PRINT_PREVIEW_LEGACY_FORMS_SPECIAL = 'PRINT_PREVIEW_LEGACY_FORMS_SPECIAL' as const;

/**
 * معاينة ورقة اختبار المعايرة (استوديو معايرة الشيكات) — علم **مستقل تمامًا**.
 *
 * ليس تابعًا لـ PRINT_PREVIEW_LEGACY_FORMS_V1 ولا لـ PRINT_CENTER_PHASE2: تلك تحكم
 * مستندات الأعمال (فواتير، عروض أسعار، نماذج). ورقة المعايرة **أداة قياس فيزيائي**، لا
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

export type FlagName =
  | typeof PRINT_CENTER_FOUNDATION_V1
  | typeof PRINT_CENTER_PHASE2
  | typeof PRINT_CENTER_PHASE2_RECEIPT_VOUCHER
  | typeof PRINT_CENTER_PHASE2_INVOICE
  | typeof PRINT_CENTER_PHASE2_QUOTATION
  | typeof PRINT_PREVIEW_LEGACY_FORMS_V1
  | typeof PRINT_PREVIEW_LEGACY_FORMS_FINANCE
  | typeof PRINT_PREVIEW_LEGACY_FORMS_HR
  | typeof PRINT_PREVIEW_LEGACY_FORMS_SPECIAL
  | typeof CHEQUE_CALIBRATION_TEST_PREVIEW_V1
  | typeof TRUE_CHROMIUM_WYSIWYG_PREVIEW_POC;

/** A document is on the Print Center only when master AND its own flag are enabled. */
export function isPhase2Enabled(documentFlag: FlagName): boolean {
  return isFlagEnabled(PRINT_CENTER_PHASE2) && isFlagEnabled(documentFlag);
}

/** نموذج يعاين قبل الطباعة فقط حين يكون العلم الرئيسي **ومجموعته** مفعّلين. */
export function isLegacyFormsPreviewEnabled(groupFlag: FlagName): boolean {
  return isFlagEnabled(PRINT_PREVIEW_LEGACY_FORMS_V1) && isFlagEnabled(groupFlag);
}

/**
 * Default ON: the pilot routes through the gateway, which in this phase delegates to
 * exactly the same Electron print call the page used before (see printService).
 * Physical output is therefore unchanged — the flag exists so it can be turned OFF
 * instantly if a printer disagrees.
 */
const DEFAULTS: Record<FlagName, boolean> = {
  PRINT_CENTER_FOUNDATION_V1: true,
  // Master kill switch: on. It enables nothing by itself.
  PRINT_CENTER_PHASE2: true,

  // ── Full Controlled Enablement — كل المستندات المدعومة ON ──────────────────
  // اكتمل الفحص اليدوي لكل مجموعة على حدة قبل تفعيلها هنا: Phase A (الفاتورة · عرض
  // السعر · عقد العمل · قسيمة الراتب)، ثم B (نماذج الموارد البشرية الثمانية)، ثم C
  // (سند الصرف · طلب الشراء)، ثم D (سند القبض — مساره الخاص). لم يُفعَّل علم قبل أن
  // تُقارَن ورقته الفعلية بورقة الطباعة القديمة.
  //
  // التفعيل **لا يغيّر الطباعة**: المعاينة طبقة عرض تفوّض إلى دالة الطباعة القديمة نفسها
  // (`printCurrentView` / `doPrint` / `handlePrint` — نفس المرجع، بلا نسخ ولا تغليف)،
  // وزر الطباعة المباشر يبقى متاحًا دائمًا. ما يتغيّر هو أن **خطوة عرض اختيارية** صارت
  // ظاهرة افتراضيًا.
  //
  // التراجع فوري وبلا إصدار: `readOverride() ?? DEFAULTS` — أي أن
  // `localStorage['manar:flag:PRINT_CENTER_PHASE2'] = 'off'` (أو
  // `PRINT_PREVIEW_LEGACY_FORMS_V1 = 'off'`) **يتقدّم على هذه القيم** ويُطفئ المجموعة
  // كاملة، ويبقى تعطيل أي علم فرعي وحده ممكنًا. المفتاحان الرئيسيان هما الـ kill switch.
  PRINT_CENTER_PHASE2_INVOICE: true,
  PRINT_CENTER_PHASE2_QUOTATION: true,
  PRINT_CENTER_PHASE2_RECEIPT_VOUCHER: true,  // سند القبض — مسار Phase 2 الخاص به
  PRINT_PREVIEW_LEGACY_FORMS_V1: true,
  PRINT_PREVIEW_LEGACY_FORMS_SPECIAL: true,   // عقد العمل · قسيمة الراتب
  PRINT_PREVIEW_LEGACY_FORMS_HR: true,        // النماذج الثمانية
  PRINT_PREVIEW_LEGACY_FORMS_FINANCE: true,   // سند الصرف · طلب الشراء

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
