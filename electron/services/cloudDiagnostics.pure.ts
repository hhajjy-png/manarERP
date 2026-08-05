/**
 * Production UX & Diagnostics Pack v1 — مركز تشخيص الاتصال السحابي (الطبقة النقية).
 *
 * ── ما هذه الوحدة ─────────────────────────────────────────────────────────────
 *
 * تستقبل **لقطة حقائق** جاهزة عن حالة النظام وتُنتج ثلاثة أشياء:
 *   1. قائمة عناصر التشخيص (رمز حالة + نبرة لون + أيقونة) — لا نصوصًا.
 *   2. مؤشر صحة عام (0-100 + تصنيف).
 *   3. تقرير نصّي جاهز للنسخ وإرساله للدعم الفني.
 *
 * لا تستورد `electron` ولا `fs` ولا تنادي شبكة، ولا تقرأ الوقت من تلقاء نفسها
 * (`nowIso` يُحقن) — فكل حساب هنا حتمي وقابل للاختبار بالكامل.
 *
 * ── قاعدة أمنية بنيوية ────────────────────────────────────────────────────────
 *
 * `DiagnosticsSnapshot` **لا يحتوي حقلًا واحدًا لأي سرّ**: لا access token، ولا
 * refresh token، ولا client secret، ولا client id. الوحدة لا تستطيع تسريب ما لا
 * تملكه أصلًا — وهذا أقوى من الاعتماد على انضباط من يكتب التقرير. صلاحية رمز
 * الوصول تُمثَّل بتاريخ انتهاء فقط، لا بقيمته.
 *
 * ── قاعدة لغوية ──────────────────────────────────────────────────────────────
 *
 * العناصر تُعيد **رموزًا** (`connected` / `expired` …) لا نصوصًا معروضة. الواجهة
 * تترجمها عبر i18n، فتبقى الشاشة عربية بالكامل. أما `buildDiagnosticReport` فيُنتج
 * إنجليزية متعمَّدة: هو مُخرَج تقني للدعم الفني، لا نصّ يقرأه المستخدم النهائي.
 */

export type DiagnosticTone = 'green' | 'orange' | 'red' | 'blue' | 'neutral';

export type HealthGrade = 'EXCELLENT' | 'GOOD' | 'WARNING' | 'CRITICAL';

export type DiagnosticKey =
  | 'account'
  | 'email'
  | 'grant'
  | 'refreshToken'
  | 'accessToken'
  | 'drive'
  | 'internet'
  | 'lastSync'
  | 'lastUpload'
  | 'lastDownload'
  | 'localVersion'
  | 'cloudVersion'
  | 'lastConflictCheck'
  | 'mutex'
  | 'systemStatus'
  | 'driveStorage';

export interface DiagnosticItem {
  key: DiagnosticKey;
  /** رمز الحالة — تترجمه الواجهة عبر `diag.status.<code>`. */
  status: string;
  tone: DiagnosticTone;
  /** اسم أيقونة Material Symbols — من نفس مجموعة الأيقونات المستخدمة في ExplorerKit. */
  icon: string;
  /** قيمة حرفية للعرض بجانب الحالة (بريد، تاريخ، رقم نسخة)، أو `null`. */
  value: string | null;
}

/** حالة تُعرف فقط بعد اختبار اتصال صريح — `unknown` ليست فشلًا، بل «لم يُفحص بعد». */
export type ProbeState = 'ok' | 'fail' | 'unknown';

/**
 * Production Polish Pack v1 — §6 · بطاقة تعريف محرّك المزامنة.
 *
 * حقائق ثابتة تصف **كيف** يعمل النظام، لا حالته. غرضها الوحيد أن يعرف الدعم الفني
 * أي محرّك وأي نموذج OAuth وأي واجهة Drive يتعامل معها قبل أن يبدأ التشخيص أصلًا.
 * تعيش هنا لا في الواجهة حتى تكون **مصدرًا واحدًا** يظهر في الشاشة وفي التقرير
 * وفي ملف Excel بنفس القيم بالضبط.
 */
export interface SyncEngineInfo {
  engineVersion: string;
  engineUpdatedAt: string;
  oauthModel: string;
  driveApi: string;
  localStorage: string;
  tokenStorage: string;
  /** هل تشفير نظام التشغيل متاح فعليًا على هذا الجهاز؟ قيمة **وقت التشغيل** لا ثابت. */
  encryptionAvailable: boolean;
}

/** نقطة في تاريخ مؤشر الصحة — تُسجَّل عند **تغيّر** النتيجة فقط، لا دوريًا. */
export interface HealthPoint {
  at: string;
  score: number;
  grade: HealthGrade;
}

export interface DiagnosticsSnapshot {
  appVersion: string;
  platform: string;
  deviceName: string;
  engine: SyncEngineInfo;
  /** أحدث أولًا. */
  healthHistory: HealthPoint[];

  configured: boolean;
  authenticated: boolean;
  accountEmail: string | null;

  /** المنحة ميتة (P0-1) — أخطر حالة ممكنة، تُسقط التصنيف إلى Critical مباشرة. */
  grantDead: boolean;
  grantDeadCode: string | null;
  clientBinding: 'MATCH' | 'MISMATCH' | 'UNKNOWN';

  refreshTokenPresent: boolean;
  /** تاريخ انتهاء رمز الوصول المخزَّن — **التاريخ فقط، لا الرمز**. */
  accessTokenExpiresAt: string | null;

  internet: ProbeState;
  drive: ProbeState;
  driveStorage: { usedBytes: number; limitBytes: number | null } | null;

  lastSyncAt: string | null;
  lastUploadAt: string | null;
  lastDownloadAt: string | null;
  lastConflictCheckAt: string | null;
  lastConnectionTestAt: string | null;

  localDb: { exists: boolean; sizeBytes: number; modifiedAt: string | null };
  /** رقم النسخة (revision) الذي اتفق عليه آخر مزامنة ناجحة. */
  localVersion: number | null;
  /** رقم نسخة ملف Drive كما رُصد آخر مرة — بلا أي استعلام جديد. */
  cloudVersion: number | null;
  cloudObservedAt: string | null;

  conflictPending: boolean;
  /** آخر خطأ — رسالة عربية مُترجَمة مسبقًا (لا نصّ خام من Google). */
  lastError: string | null;
  /** حالة المحرّك الحالية (`SyncStatus`). */
  status: string;
  /** العملية التي تمسك قفل المزامنة الآن، أو `null` (P0-4). */
  activeOperation: string | null;

  /** يُحقن ليبقى الحساب حتميًا وقابلًا للاختبار. */
  nowIso: string;
}

// ── عتبات زمنية ──────────────────────────────────────────────────────────────

const HOUR_MS = 60 * 60 * 1000;
/** مزامنة خلال يوم = صحية. النظام يزامن عند كل بدء وإغلاق، فاليوم عتبة سخية أصلًا. */
const SYNC_FRESH_MS = 24 * HOUR_MS;
/** أقدم من أسبوع = خطر حقيقي على استمرارية النسخة السحابية. */
const SYNC_STALE_MS = 7 * 24 * HOUR_MS;
/** رمز الوصول يُعدّ «على وشك الانتهاء» قبلها بدقائق — المكتبة تجدّده تلقائيًا حينها. */
const ACCESS_TOKEN_SOON_MS = 5 * 60 * 1000;

function ageMs(nowIso: string, iso: string | null): number | null {
  if (!iso) return null;
  const then = Date.parse(iso);
  const now = Date.parse(nowIso);
  if (!Number.isFinite(then) || !Number.isFinite(now)) return null;
  return now - then;
}

/** تصنيف حداثة طابع زمني: أخضر/برتقالي/أحمر — مستخدم في آخر مزامنة/رفع/تنزيل. */
function freshnessTone(nowIso: string, iso: string | null): DiagnosticTone {
  const age = ageMs(nowIso, iso);
  if (age === null) return 'neutral';
  if (age <= SYNC_FRESH_MS) return 'green';
  if (age <= SYNC_STALE_MS) return 'orange';
  return 'red';
}

// ── عناصر التشخيص ────────────────────────────────────────────────────────────

function accountItem(s: DiagnosticsSnapshot): DiagnosticItem {
  if (!s.configured) return { key: 'account', status: 'not_configured', tone: 'neutral', icon: 'settings', value: null };
  if (s.grantDead || !s.authenticated) {
    return { key: 'account', status: 'disconnected', tone: 'red', icon: 'link_off', value: null };
  }
  return { key: 'account', status: 'connected', tone: 'green', icon: 'link', value: null };
}

function grantItem(s: DiagnosticsSnapshot): DiagnosticItem {
  if (s.grantDead) return { key: 'grant', status: 'expired', tone: 'red', icon: 'gpp_bad', value: null };
  if (!s.authenticated) return { key: 'grant', status: 'absent', tone: 'neutral', icon: 'gpp_maybe', value: null };
  if (s.clientBinding === 'MISMATCH') return { key: 'grant', status: 'mismatch', tone: 'red', icon: 'gpp_bad', value: null };
  // ربط غير معروف = توكن محفوظ قبل حزمة التحصين. سليم، لكنه غير مُثبت الهوية بعد.
  if (s.clientBinding === 'UNKNOWN') return { key: 'grant', status: 'legacy', tone: 'orange', icon: 'gpp_maybe', value: null };
  return { key: 'grant', status: 'healthy', tone: 'green', icon: 'gpp_good', value: null };
}

function accessTokenItem(s: DiagnosticsSnapshot): DiagnosticItem {
  if (!s.authenticated) return { key: 'accessToken', status: 'absent', tone: 'neutral', icon: 'key_off', value: null };
  const remaining = s.accessTokenExpiresAt ? -1 * (ageMs(s.nowIso, s.accessTokenExpiresAt) ?? 0) : null;
  if (remaining === null) return { key: 'accessToken', status: 'unknown', tone: 'neutral', icon: 'key', value: null };
  // انتهاء رمز الوصول **ليس خطأً**: المكتبة تجدّده تلقائيًا من رمز التحديث. لذلك
  // نبرته زرقاء لا حمراء — عرض معلومة، لا إنذار. الإنذار الحقيقي هو موت المنحة.
  if (remaining <= 0) return { key: 'accessToken', status: 'renews_on_demand', tone: 'blue', icon: 'autorenew', value: null };
  if (remaining <= ACCESS_TOKEN_SOON_MS) return { key: 'accessToken', status: 'expiring', tone: 'blue', icon: 'autorenew', value: s.accessTokenExpiresAt };
  return { key: 'accessToken', status: 'valid', tone: 'green', icon: 'key', value: s.accessTokenExpiresAt };
}

function probeItem(key: DiagnosticKey, state: ProbeState, icons: [string, string, string]): DiagnosticItem {
  if (state === 'ok') return { key, status: 'ok', tone: 'green', icon: icons[0], value: null };
  if (state === 'fail') return { key, status: 'fail', tone: 'red', icon: icons[1], value: null };
  return { key, status: 'untested', tone: 'neutral', icon: icons[2], value: null };
}

function storageItem(s: DiagnosticsSnapshot): DiagnosticItem {
  if (!s.driveStorage) return { key: 'driveStorage', status: 'unavailable', tone: 'neutral', icon: 'cloud', value: null };
  const { usedBytes, limitBytes } = s.driveStorage;
  if (limitBytes === null || limitBytes <= 0) {
    return { key: 'driveStorage', status: 'unlimited', tone: 'green', icon: 'cloud_done', value: String(usedBytes) };
  }
  const ratio = usedBytes / limitBytes;
  const tone: DiagnosticTone = ratio >= 0.95 ? 'red' : ratio >= 0.85 ? 'orange' : 'green';
  return { key: 'driveStorage', status: 'measured', tone, icon: 'cloud', value: `${usedBytes}/${limitBytes}` };
}

/**
 * يبني قائمة عناصر التشخيص بالترتيب المعروض. الترتيب مقصود: هوية الحساب أولًا،
 * ثم سلسلة الثقة (منحة ← رمز تحديث ← رمز وصول)، ثم الوصول الفعلي (إنترنت ← Drive)،
 * ثم آثار المزامنة، ثم حالة النظام. هذا هو نفس ترتيب استبعاد الأسباب الذي يتبعه
 * الدعم الفني عمليًا حين يشخّص عطلًا.
 */
export function buildDiagnosticItems(s: DiagnosticsSnapshot): DiagnosticItem[] {
  return [
    accountItem(s),
    {
      key: 'email',
      status: s.accountEmail ? 'known' : 'unknown',
      tone: s.accountEmail ? 'green' : 'neutral',
      icon: 'mail',
      value: s.accountEmail,
    },
    grantItem(s),
    {
      key: 'refreshToken',
      status: s.refreshTokenPresent ? (s.grantDead ? 'revoked' : 'valid') : 'absent',
      tone: s.refreshTokenPresent ? (s.grantDead ? 'red' : 'green') : s.grantDead ? 'red' : 'neutral',
      icon: s.refreshTokenPresent && !s.grantDead ? 'vpn_key' : 'key_off',
      value: null,
    },
    accessTokenItem(s),
    probeItem('internet', s.internet, ['wifi', 'wifi_off', 'wifi_find']),
    probeItem('drive', s.drive, ['cloud_done', 'cloud_off', 'cloud_sync']),
    storageItem(s),
    { key: 'lastSync', status: s.lastSyncAt ? 'at' : 'never', tone: freshnessTone(s.nowIso, s.lastSyncAt), icon: 'sync', value: s.lastSyncAt },
    { key: 'lastUpload', status: s.lastUploadAt ? 'at' : 'never', tone: freshnessTone(s.nowIso, s.lastUploadAt), icon: 'cloud_upload', value: s.lastUploadAt },
    { key: 'lastDownload', status: s.lastDownloadAt ? 'at' : 'never', tone: freshnessTone(s.nowIso, s.lastDownloadAt), icon: 'cloud_download', value: s.lastDownloadAt },
    {
      key: 'localVersion',
      status: s.localDb.exists ? (s.localVersion === null ? 'unsynced' : 'known') : 'missing',
      tone: s.localDb.exists ? (s.localVersion === null ? 'orange' : 'green') : 'red',
      icon: 'database',
      value: s.localVersion === null ? null : String(s.localVersion),
    },
    {
      key: 'cloudVersion',
      status: s.cloudVersion === null ? (s.cloudObservedAt ? 'none' : 'untested') : 'known',
      tone: s.cloudVersion === null ? 'neutral' : 'green',
      icon: 'cloud',
      value: s.cloudVersion === null ? null : String(s.cloudVersion),
    },
    {
      key: 'lastConflictCheck',
      status: s.conflictPending ? 'conflict' : s.lastConflictCheckAt ? 'clear' : 'never',
      tone: s.conflictPending ? 'red' : s.lastConflictCheckAt ? 'green' : 'neutral',
      icon: s.conflictPending ? 'error' : 'rule',
      value: s.lastConflictCheckAt,
    },
    {
      key: 'mutex',
      status: s.activeOperation ? 'busy' : 'idle',
      tone: s.activeOperation ? 'blue' : 'green',
      icon: s.activeOperation ? 'sync' : 'lock_open',
      value: s.activeOperation,
    },
    {
      key: 'systemStatus',
      status: s.status.toLowerCase(),
      tone: systemStatusTone(s.status),
      icon: 'monitor_heart',
      value: null,
    },
  ];
}

function systemStatusTone(status: string): DiagnosticTone {
  switch (status) {
    case 'COMPLETED':
    case 'READY':
      return 'green';
    case 'FAILED':
    case 'GRANT_DEAD':
    case 'CONFLICT':
      return 'red';
    case 'OFFLINE':
      return 'orange';
    default:
      return 'blue';
  }
}

// ── مؤشر الصحة ───────────────────────────────────────────────────────────────

export interface CloudHealth {
  score: number;
  grade: HealthGrade;
  /** رموز أسباب الخصم — تترجمها الواجهة عبر `diag.reason.<code>`. */
  reasons: string[];
}

/**
 * أوزان مؤشر الصحة. مجموعها 100، وتوزيعها يعكس **الضرر الفعلي** لا عدد العناصر:
 * صلاحية المنحة أثقل بند لأن موتها يوقف المزامنة كليًا، بينما وجود خطأ سابق
 * أخفّ بند لأنه قد يكون عابرًا وقد عولج فعلًا.
 */
const WEIGHTS = {
  grant: 25,
  refreshToken: 15,
  internet: 15,
  drive: 15,
  syncFreshness: 15,
  noConflict: 10,
  noError: 5,
} as const;

/**
 * يحسب صحة الاتصال السحابي.
 *
 * ── مبدأ «غير مفحوص ≠ فاشل» ───────────────────────────────────────────────────
 *
 * الإنترنت وDrive لا يُفحصان تلقائيًا (منع الاستعلامات المتكررة — §9). قبل أول
 * اختبار صريح تكون حالتهما `unknown`، فتُمنح **نصف الوزن**: خصمٌ يدفع المستخدم
 * لتشغيل الاختبار، لكنه ليس اتهامًا بعطل لم يُثبت.
 *
 * ── تجاوزات قاطعة ────────────────────────────────────────────────────────────
 *
 * النتيجة الرقمية وحدها تُضلّل في حالتين، فتُفرض عليهما قواعد صريحة:
 *   • **منحة ميتة** ⇒ `CRITICAL` مهما بلغت النقاط. المزامنة متوقفة تمامًا، وإظهار
 *     «Good» حينها كذب مباشر على المستخدم.
 *   • **تعارض قائم** ⇒ لا يتجاوز `WARNING`. النظام سليم تقنيًا لكنه **ينتظر قرارًا
 *     بشريًا**، ولا يجوز أن يُقدَّم كأنه بخير.
 *   • **غير مهيّأ أو غير مرتبط** ⇒ `neutral`: الحالة ليست عطلًا، بل ميزة لم تُفعَّل بعد.
 */
export function computeCloudHealth(s: DiagnosticsSnapshot): CloudHealth {
  const reasons: string[] = [];

  // ميزة غير مفعّلة — لا تُقاس صحتها أصلًا.
  if (!s.configured) return { score: 0, grade: 'WARNING', reasons: ['not_configured'] };
  if (!s.authenticated && !s.grantDead) return { score: 0, grade: 'WARNING', reasons: ['not_connected'] };

  let score = 0;

  // (1) المنحة
  if (s.grantDead) reasons.push('grant_dead');
  else if (s.clientBinding === 'MISMATCH') reasons.push('client_mismatch');
  else if (s.clientBinding === 'UNKNOWN') { score += WEIGHTS.grant / 2; reasons.push('grant_unverified'); }
  else score += WEIGHTS.grant;

  // (2) رمز التحديث
  if (s.refreshTokenPresent && !s.grantDead) score += WEIGHTS.refreshToken;
  else reasons.push('refresh_token_missing');

  // (3) الإنترنت
  if (s.internet === 'ok') score += WEIGHTS.internet;
  else if (s.internet === 'unknown') { score += WEIGHTS.internet / 2; reasons.push('internet_untested'); }
  else reasons.push('internet_offline');

  // (4) Drive
  if (s.drive === 'ok') score += WEIGHTS.drive;
  else if (s.drive === 'unknown') { score += WEIGHTS.drive / 2; reasons.push('drive_untested'); }
  else reasons.push('drive_unreachable');

  // (5) حداثة آخر مزامنة
  const syncAge = ageMs(s.nowIso, s.lastSyncAt);
  if (syncAge === null) reasons.push('never_synced');
  else if (syncAge <= SYNC_FRESH_MS) score += WEIGHTS.syncFreshness;
  else if (syncAge <= SYNC_STALE_MS) { score += WEIGHTS.syncFreshness / 2; reasons.push('sync_aging'); }
  else reasons.push('sync_stale');

  // (6) التعارض
  if (s.conflictPending) reasons.push('conflict_pending');
  else score += WEIGHTS.noConflict;

  // (7) آخر خطأ
  if (s.lastError) reasons.push('last_error');
  else score += WEIGHTS.noError;

  score = Math.max(0, Math.min(100, Math.round(score)));

  let grade: HealthGrade;
  if (score >= 90) grade = 'EXCELLENT';
  else if (score >= 70) grade = 'GOOD';
  else if (score >= 40) grade = 'WARNING';
  else grade = 'CRITICAL';

  if (s.grantDead) grade = 'CRITICAL';
  else if (s.conflictPending && (grade === 'EXCELLENT' || grade === 'GOOD')) grade = 'WARNING';

  return { score, grade, reasons };
}

// ── التقرير النصّي ────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return 'Never';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtBytes(bytes: number | null): string {
  if (bytes === null) return 'Unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function probeText(state: ProbeState, okWord: string, failWord: string): string {
  if (state === 'ok') return okWord;
  if (state === 'fail') return failWord;
  return 'Not tested';
}

function grantText(s: DiagnosticsSnapshot): string {
  if (s.grantDead) return `Expired / revoked${s.grantDeadCode ? ` (${s.grantDeadCode})` : ''}`;
  if (!s.authenticated) return 'Not linked';
  if (s.clientBinding === 'MISMATCH') return 'Invalid — issued for a different OAuth client';
  if (s.clientBinding === 'UNKNOWN') return 'Healthy (client binding not yet verified)';
  return 'Healthy';
}

/**
 * تقرير تشخيصي جاهز للنسخ وإرساله للدعم الفني.
 *
 * إنجليزي عمدًا: هذا مُخرَج تقني يُلصق في تذكرة دعم أو رسالة، لا نصّ يُعرض في
 * الواجهة. الواجهة تبقى عربية بالكامل — الزرّ وحده هو ما يُنتج هذا النصّ.
 *
 * **لا يحتوي أي سرّ**، وهي ضمانة بنيوية لا انضباطية: `DiagnosticsSnapshot` لا يحمل
 * أصلًا حقلًا لأي رمز أو مفتاح، فلا يمكن لهذه الدالة طباعة ما لا تراه.
 */
export function buildDiagnosticReport(s: DiagnosticsSnapshot): string {
  const health = computeCloudHealth(s);
  const trend = summarizeHealthTrend(s.healthHistory);
  const storage = s.driveStorage
    ? s.driveStorage.limitBytes
      ? `${fmtBytes(s.driveStorage.usedBytes)} / ${fmtBytes(s.driveStorage.limitBytes)}`
      : `${fmtBytes(s.driveStorage.usedBytes)} (no quota limit)`
    : 'Unavailable';

  const lines = [
    'Cloud Diagnostics Report',
    '========================',
    `Generated:            ${fmtTime(s.nowIso)}`,
    `App Version:          ${s.appVersion}`,
    `Platform:             ${s.platform}`,
    `Device:               ${s.deviceName}`,
    '',
    `Cloud Health:         ${health.grade} (${health.score}%)`,
    `System Status:        ${s.status}`,
    `Active Operation:     ${s.activeOperation ?? 'Idle'}`,
    '',
    '--- Account & Authorization ---',
    `Cloud Sync Setup:     ${s.configured ? 'Configured' : 'Not configured'}`,
    `Google Account:       ${s.authenticated ? 'Connected' : 'Disconnected'}`,
    `Account Email:        ${s.accountEmail ?? 'Unknown'}`,
    `OAuth Grant:          ${grantText(s)}`,
    `OAuth Client Binding: ${s.clientBinding}`,
    `Refresh Token:        ${s.refreshTokenPresent ? (s.grantDead ? 'Present but rejected' : 'Valid') : 'Absent'}`,
    `Access Token Expiry:  ${s.accessTokenExpiresAt ? fmtTime(s.accessTokenExpiresAt) : 'Unknown'}`,
    '',
    '--- Connectivity ---',
    `Internet:             ${probeText(s.internet, 'Connected', 'Disconnected')}`,
    `Google Drive:         ${probeText(s.drive, 'Reachable', 'Unreachable')}`,
    `Drive Storage:        ${storage}`,
    `Last Connection Test: ${fmtTime(s.lastConnectionTestAt)}`,
    '',
    '--- Sync History ---',
    `Last Sync:            ${fmtTime(s.lastSyncAt)}`,
    `Last Upload:          ${fmtTime(s.lastUploadAt)}`,
    `Last Download:        ${fmtTime(s.lastDownloadAt)}`,
    `Last Conflict Check:  ${fmtTime(s.lastConflictCheckAt)}`,
    `Conflict:             ${s.conflictPending ? 'PENDING — user decision required' : 'None'}`,
    '',
    '--- Database ---',
    `Local Database:       ${s.localDb.exists ? 'Present' : 'MISSING'}`,
    `Local Size:           ${s.localDb.exists ? fmtBytes(s.localDb.sizeBytes) : '—'}`,
    `Local Modified:       ${fmtTime(s.localDb.modifiedAt)}`,
    `Local Revision:       ${s.localVersion ?? 'Not synced yet'}`,
    `Cloud Revision:       ${s.cloudVersion ?? (s.cloudObservedAt ? 'No cloud copy' : 'Not checked')}`,
    `Cloud Observed At:    ${fmtTime(s.cloudObservedAt)}`,
    '',
    '--- Engine ---',
    `Sync Engine:          ${s.engine.engineVersion} (updated ${s.engine.engineUpdatedAt})`,
    `OAuth Model:          ${s.engine.oauthModel}`,
    `Drive API:            ${s.engine.driveApi}`,
    `Local Storage:        ${s.engine.localStorage}`,
    `Token Storage:        ${s.engine.tokenStorage}`,
    `OS Encryption:        ${s.engine.encryptionAvailable ? 'Available' : 'NOT AVAILABLE — tokens stored unencrypted'}`,
    '',
    '--- Health Trend ---',
    `Last Change:          ${fmtTime(trend.lastChangeAt)}${trend.previousScore === null ? '' : ` (was ${trend.previousScore}%)`}`,
    `Last Drop:            ${trend.lastDropAt ? `${fmtTime(trend.lastDropAt)} (-${trend.lastDropDelta} pts)` : 'None recorded'}`,
    '',
    '--- Last Error ---',
    s.lastError ?? 'None',
    '',
    `Health Findings:      ${health.reasons.length ? health.reasons.join(', ') : 'none'}`,
  ];

  return lines.join('\n');
}

/**
 * كتلة دعم فني **مختصرة** — ما يحتاجه المسؤول في أول 10 ثوانٍ من قراءة التذكرة.
 *
 * ليست تكرارًا للتقرير الكامل: التقرير يشرح الحالة كاملةً للتحليل، وهذه تُلصق في
 * محادثة أو تذكرة سريعة. نفس الضمانة الأمنية تسري: لا رمز ولا مفتاح ولا سرّ —
 * بنيويًا، لأن المصدر لا يحمل أيًّا منها.
 */
export function buildSupportInfo(s: DiagnosticsSnapshot): string {
  const health = computeCloudHealth(s);
  return [
    `manarERP Support Info — ${fmtTime(s.nowIso)}`,
    `App: ${s.appVersion} (${s.platform}) · Device: ${s.deviceName}`,
    `Health: ${health.grade} ${health.score}% · Status: ${s.status}`,
    `Account: ${s.authenticated ? 'Connected' : 'Disconnected'} · Grant: ${grantText(s)}`,
    `Internet: ${probeText(s.internet, 'OK', 'FAIL')} · Drive: ${probeText(s.drive, 'OK', 'FAIL')}`,
    `Last Sync: ${fmtTime(s.lastSyncAt)} · Up: ${fmtTime(s.lastUploadAt)} · Down: ${fmtTime(s.lastDownloadAt)}`,
    `DB: ${s.localDb.exists ? fmtBytes(s.localDb.sizeBytes) : 'MISSING'} · Local rev ${s.localVersion ?? '—'} / Cloud rev ${s.cloudVersion ?? '—'}`,
    `Conflict: ${s.conflictPending ? 'PENDING' : 'None'}`,
    `Last Error: ${s.lastError ?? 'None'}`,
    `Engine: ${s.engine.engineVersion} · Drive ${s.engine.driveApi} · Encryption ${s.engine.encryptionAvailable ? 'ON' : 'OFF'}`,
    `Findings: ${health.reasons.length ? health.reasons.join(', ') : 'none'}`,
  ].join('\n');
}


// ═══════════════════════════════════════════════════════════════════════════════
//  Production Polish Pack v1 — طبقات نقية إضافية
// ═══════════════════════════════════════════════════════════════════════════════

/** إدخال سجلّ المزامنة كما يُخزَّن — نسخة نقية من نوع المحرّك، بلا اعتماد عليه. */
export interface SyncLogRecord {
  at: string;
  action: string;
  result: string;
  message: string;
  deviceName?: string;
  conflictResolved?: boolean;
  resolutionSelected?: 'LOCAL' | 'REMOTE';
  /** Production Polish Pack v1 — لحظة بدء العملية ومدّتها الفعلية. */
  startedAt?: string;
  durationMs?: number;
}

// ── §2 · الإجراء المقترح لكل عملية ────────────────────────────────────────────

/**
 * رمز الإجراء الذي يُقترح على المستخدم بعد قراءة تفاصيل عملية.
 * الواجهة تترجمه وتربطه بالزرّ المناسب — القرار هنا، لا في JSX.
 */
export type SuggestedAction = 'NONE' | 'RECONNECT' | 'RETRY' | 'RESOLVE_CONFLICT' | 'CHECK_BACKUPS' | 'CHECK_NETWORK';

/**
 * يستنتج الإجراء المُجدي من إدخال السجلّ نفسه.
 *
 * القاعدة الحاكمة: **لا نقترح إجراءً لا يفيد**. إعادة المحاولة على منحة ميتة إهدار
 * لوقت المستخدم، والاقتراح الصحيح حينها إعادة الربط. ونجاح العملية لا يستحق اقتراحًا
 * أصلًا — الاقتراح الفارغ أصدق من اقتراح مصطنع.
 */
export function suggestActionFor(entry: SyncLogRecord): SuggestedAction {
  if (entry.result === 'SUCCESS' || entry.result === 'RETRY') return 'NONE';

  if (entry.action === 'CONFLICT') return 'RESOLVE_CONFLICT';
  if (entry.action === 'RESCUE_BACKUP') return 'CHECK_BACKUPS';

  const text = entry.message.toLowerCase();
  // موت المنحة يُكتشف من الرسالة العربية الجاهزة التي كتبها `googleAuthErrors.pure`
  // (لا من رمز Google الخام — فذاك لا يصل السجلّ أصلًا بعد حزمة التحصين).
  if (entry.action === 'AUTH' || entry.message.includes('إعادة ربط')) return 'RECONNECT';
  if (entry.message.includes('الاتصال بالإنترنت') || entry.message.includes('المهلة الزمنية') || text.includes('offline')) {
    return 'CHECK_NETWORK';
  }
  return 'RETRY';
}

// ── §3 · سجلّ التشخيص المختصر ─────────────────────────────────────────────────

export type DiagnosticsHistoryKey =
  | 'connectionTest'
  | 'reconnect'
  | 'conflict'
  | 'retry'
  | 'restore'
  | 'backup';

export interface DiagnosticsHistoryEntry {
  key: DiagnosticsHistoryKey;
  /** `null` ⇒ لم يحدث قط. الواجهة تعرضه «لم يحدث بعد» لا فراغًا. */
  at: string | null;
  icon: string;
  tone: DiagnosticTone;
}

/** أحدث إدخال يطابق الشرط، أو `null`. السجلّ مرتّب أحدثًا أولًا. */
function latest(log: SyncLogRecord[], match: (e: SyncLogRecord) => boolean): string | null {
  return log.find(match)?.at ?? null;
}

/**
 * §3 — «متى حدث كلٌّ من هذه آخر مرة؟».
 *
 * يُشتق بالكامل من السجلّ القائم وملف الحالة — **بلا أي مصدر بيانات جديد ولا
 * استعلام**. ست حقائق يسألها الدعم الفني أولًا في كل مكالمة تقريبًا.
 */
export function buildDiagnosticsHistory(
  log: SyncLogRecord[],
  meta: { lastConnectionTestAt: string | null },
): DiagnosticsHistoryEntry[] {
  return [
    { key: 'connectionTest', at: meta.lastConnectionTestAt, icon: 'network_check', tone: 'blue' },
    { key: 'reconnect', at: latest(log, (e) => e.action === 'AUTH' && e.result === 'SUCCESS'), icon: 'link', tone: 'green' },
    { key: 'conflict', at: latest(log, (e) => e.action === 'CONFLICT'), icon: 'error', tone: 'orange' },
    { key: 'retry', at: latest(log, (e) => e.result === 'RETRY'), icon: 'refresh', tone: 'orange' },
    { key: 'restore', at: latest(log, (e) => e.action === 'DOWNLOAD' && e.result === 'SUCCESS'), icon: 'cloud_download', tone: 'green' },
    { key: 'backup', at: latest(log, (e) => (e.action === 'UPLOAD' || e.action === 'RESCUE_BACKUP') && e.result === 'SUCCESS'), icon: 'cloud_upload', tone: 'green' },
  ];
}

// ── §5 · تاريخ مؤشر الصحة ─────────────────────────────────────────────────────

export interface HealthTrend {
  /** متى تغيّرت النتيجة آخر مرة (أي تغيّر، صعودًا أو هبوطًا). */
  lastChangeAt: string | null;
  /** النتيجة قبل ذلك التغيّر — تُظهر «من كم إلى كم». */
  previousScore: number | null;
  /** متى **انخفضت** الصحة آخر مرة — السؤال الذي يهمّ فعلًا في التشخيص. */
  lastDropAt: string | null;
  /** مقدار آخر انخفاض بالنقاط. */
  lastDropDelta: number | null;
}

/**
 * §5 — «الرقم الحالي وحده لا يكفي».
 *
 * 70% مستقرّة منذ شهر حالة مختلفة تمامًا عن 70% هبطت من 100% قبل ساعة: الأولى وضع
 * قائم، والثانية **حادثة وقعت للتوّ**. هذه الدالة تستخرج الفرق من التاريخ المسجَّل.
 *
 * التاريخ يُسجَّل عند **تغيّر النتيجة فقط** لا دوريًا — فلا ينمو الملف بلا داعٍ،
 * ويبقى كل إدخال فيه حدثًا حقيقيًا يستحق القراءة.
 */
export function summarizeHealthTrend(history: HealthPoint[]): HealthTrend {
  if (history.length < 2) {
    return { lastChangeAt: null, previousScore: null, lastDropAt: null, lastDropDelta: null };
  }
  const [current, previous] = history;
  let lastDropAt: string | null = null;
  let lastDropDelta: number | null = null;
  for (let i = 0; i < history.length - 1; i++) {
    if (history[i].score < history[i + 1].score) {
      lastDropAt = history[i].at;
      lastDropDelta = history[i + 1].score - history[i].score;
      break;
    }
  }
  return { lastChangeAt: current.at, previousScore: previous.score, lastDropAt, lastDropDelta };
}

/**
 * يُلحق نقطة جديدة **فقط عند تغيّر النتيجة**، ويقصّ التاريخ عند الحدّ.
 * دالة نقية: تُعيد تاريخًا جديدًا ولا تُعدّل المُدخَل (نفس انضباط بقية النظام).
 */
export function appendHealthPoint(
  history: HealthPoint[],
  point: HealthPoint,
  maxEntries = 20,
): HealthPoint[] {
  if (history.length > 0 && history[0].score === point.score && history[0].grade === point.grade) {
    return history;
  }
  return [point, ...history].slice(0, maxEntries);
}
