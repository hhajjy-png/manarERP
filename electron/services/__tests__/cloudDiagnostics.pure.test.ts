import { describe, it, expect } from 'vitest';
import {
  appendHealthPoint,
  buildDiagnosticItems,
  buildDiagnosticReport,
  buildDiagnosticsHistory,
  buildSupportInfo,
  computeCloudHealth,
  suggestActionFor,
  summarizeHealthTrend,
  type DiagnosticsSnapshot,
  type HealthPoint,
  type SyncLogRecord,
} from '../cloudDiagnostics.pure';

/**
 * Production UX & Diagnostics Pack v1 — تغطية مركز التشخيص.
 *
 * ثلاث ضمانات تُختبَر هنا:
 *   1. **مؤشر الصحة لا يكذب** — لا يُظهر «جيد» بينما المزامنة متوقفة فعليًا.
 *   2. **«غير مفحوص» ليس «فاشل»** — لا نتّهم بعطل لم يُثبت.
 *   3. **التقرير لا يحمل سرًّا** — لا رمز ولا مفتاح، مهما كانت الحالة.
 */

const NOW = '2026-08-05T12:00:00.000Z';
const HOURS = (n: number) => new Date(Date.parse(NOW) - n * 3600_000).toISOString();

/** لقطة نظام صحيّ تمامًا — كل اختبار يغيّر منها ما يخصّه فقط. */
function healthy(overrides: Partial<DiagnosticsSnapshot> = {}): DiagnosticsSnapshot {
  return {
    appVersion: '1.4.0',
    platform: 'win32',
    deviceName: 'MANAR-PC',
    engine: {
      engineVersion: 'v1.3 — Production Polish Pack v1',
      engineUpdatedAt: '2026-08-05',
      oauthModel: 'OAuth 2.0 — Desktop / Installed App (loopback redirect, system browser)',
      driveApi: 'Google Drive API v3 — appDataFolder scope only',
      localStorage: 'SQLite (manar.db) + JSON state files under userData/data',
      tokenStorage: 'Electron safeStorage (OS keychain / DPAPI), 0600, atomic write',
      encryptionAvailable: true,
    },
    healthHistory: [],
    configured: true,
    authenticated: true,
    accountEmail: 'owner@example.com',
    grantDead: false,
    grantDeadCode: null,
    clientBinding: 'MATCH',
    refreshTokenPresent: true,
    accessTokenExpiresAt: new Date(Date.parse(NOW) + 3600_000).toISOString(),
    internet: 'ok',
    drive: 'ok',
    driveStorage: { usedBytes: 5_000_000_000, limitBytes: 16_000_000_000 },
    lastSyncAt: HOURS(2),
    lastUploadAt: HOURS(2),
    lastDownloadAt: HOURS(30),
    lastConflictCheckAt: HOURS(2),
    lastConnectionTestAt: HOURS(1),
    localDb: { exists: true, sizeBytes: 2_097_152, modifiedAt: HOURS(1) },
    localVersion: 12,
    cloudVersion: 12,
    cloudObservedAt: HOURS(2),
    conflictPending: false,
    lastError: null,
    status: 'COMPLETED',
    activeOperation: null,
    nowIso: NOW,
    ...overrides,
  };
}

const item = (s: DiagnosticsSnapshot, key: string) => buildDiagnosticItems(s).find((i) => i.key === key)!;

describe('computeCloudHealth — النظام السليم', () => {
  it('نظام سليم بالكامل ⇒ 100% و Excellent', () => {
    const health = computeCloudHealth(healthy());
    expect(health.score).toBe(100);
    expect(health.grade).toBe('EXCELLENT');
    expect(health.reasons).toEqual([]);
  });
});

describe('computeCloudHealth — التجاوزات القاطعة', () => {
  it('🔴 منحة ميتة ⇒ Critical مهما بلغت بقية النقاط', () => {
    const health = computeCloudHealth(healthy({ grantDead: true, authenticated: false }));
    expect(health.grade).toBe('CRITICAL');
    expect(health.reasons).toContain('grant_dead');
  });

  it('🔴 تعارض قائم لا يتجاوز Warning مهما كان الباقي مثاليًا', () => {
    const health = computeCloudHealth(healthy({ conflictPending: true }));
    expect(health.grade).toBe('WARNING');
    expect(health.reasons).toContain('conflict_pending');
  });

  it('عدم تطابق عميل OAuth يُصنَّف خصمًا كاملًا على بند المنحة', () => {
    const health = computeCloudHealth(healthy({ clientBinding: 'MISMATCH' }));
    expect(health.reasons).toContain('client_mismatch');
    expect(health.score).toBe(75);
  });
});

describe('computeCloudHealth — «غير مفحوص» ليس «فاشل»', () => {
  it('الإنترنت وDrive غير مفحوصَين ⇒ نصف الوزن لكلٍّ، لا صفر', () => {
    const health = computeCloudHealth(healthy({ internet: 'unknown', drive: 'unknown' }));
    expect(health.score).toBe(85);
    expect(health.reasons).toEqual(expect.arrayContaining(['internet_untested', 'drive_untested']));
    expect(health.grade).toBe('GOOD');
  });

  it('عطل مُثبت أشدّ خصمًا من عدم الفحص', () => {
    const untested = computeCloudHealth(healthy({ internet: 'unknown', drive: 'unknown' })).score;
    const failing = computeCloudHealth(healthy({ internet: 'fail', drive: 'fail' })).score;
    expect(failing).toBeLessThan(untested);
  });
});

describe('computeCloudHealth — حداثة المزامنة', () => {
  it('مزامنة خلال 24 ساعة ⇒ لا خصم', () => {
    expect(computeCloudHealth(healthy({ lastSyncAt: HOURS(20) })).reasons).not.toContain('sync_aging');
  });

  it('مزامنة أقدم من يوم وأحدث من أسبوع ⇒ نصف الوزن', () => {
    const health = computeCloudHealth(healthy({ lastSyncAt: HOURS(72) }));
    expect(health.reasons).toContain('sync_aging');
    expect(health.score).toBe(93); // 100 - 15/2 مقرَّبًا
  });

  it('مزامنة أقدم من أسبوع ⇒ خصم كامل', () => {
    expect(computeCloudHealth(healthy({ lastSyncAt: HOURS(24 * 30) })).reasons).toContain('sync_stale');
  });

  it('لم تحدث مزامنة قط ⇒ سبب صريح لا مجرّد صفر صامت', () => {
    expect(computeCloudHealth(healthy({ lastSyncAt: null })).reasons).toContain('never_synced');
  });
});

describe('computeCloudHealth — حالات «ليست عطلًا»', () => {
  it('ميزة غير مُعدّة أصلًا ⇒ Warning بسبب واضح لا Critical', () => {
    const health = computeCloudHealth(healthy({ configured: false }));
    expect(health.grade).toBe('WARNING');
    expect(health.reasons).toEqual(['not_configured']);
  });

  it('حساب غير مرتبط (بلا موت منحة) ⇒ Warning لا Critical', () => {
    const health = computeCloudHealth(healthy({ authenticated: false, refreshTokenPresent: false }));
    expect(health.grade).toBe('WARNING');
    expect(health.reasons).toEqual(['not_connected']);
  });
});

describe('buildDiagnosticItems — العناصر المطلوبة كاملة', () => {
  it('يعرض العناصر الستة عشر بالترتيب المقصود', () => {
    const keys = buildDiagnosticItems(healthy()).map((i) => i.key);
    expect(keys).toEqual([
      'account', 'email', 'grant', 'refreshToken', 'accessToken',
      'internet', 'drive', 'driveStorage',
      'lastSync', 'lastUpload', 'lastDownload',
      'localVersion', 'cloudVersion', 'lastConflictCheck', 'mutex', 'systemStatus',
    ]);
  });

  it('لا يُعيد أي عنصر نصًّا معروضًا — رموز فقط تترجمها الواجهة', () => {
    for (const it of buildDiagnosticItems(healthy())) {
      expect(it.status).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe('buildDiagnosticItems — الحالات الحرجة', () => {
  it('منحة ميتة ⇒ الحساب ومنحة OAuth ورمز التحديث كلها حمراء', () => {
    const s = healthy({ grantDead: true, authenticated: false, grantDeadCode: 'invalid_grant' });
    expect(item(s, 'account')).toMatchObject({ status: 'disconnected', tone: 'red' });
    expect(item(s, 'grant')).toMatchObject({ status: 'expired', tone: 'red' });
    expect(item(s, 'refreshToken')).toMatchObject({ status: 'revoked', tone: 'red' });
  });

  it('🔴 انتهاء رمز الوصول ليس عطلًا — نبرة معلومات لا إنذار', () => {
    // المكتبة تجدّده تلقائيًا من رمز التحديث؛ تلوينه أحمر كان سيُفزع المستخدم بلا سبب.
    const s = healthy({ accessTokenExpiresAt: HOURS(1) });
    expect(item(s, 'accessToken')).toMatchObject({ status: 'renews_on_demand', tone: 'blue' });
  });

  it('ربط عميل غير موثّق (توكن ما قبل التحصين) ⇒ تنبيه لا خطأ', () => {
    expect(item(healthy({ clientBinding: 'UNKNOWN' }), 'grant')).toMatchObject({ status: 'legacy', tone: 'orange' });
  });

  it('قاعدة بيانات محلية مفقودة ⇒ أحمر', () => {
    const s = healthy({ localDb: { exists: false, sizeBytes: 0, modifiedAt: null } });
    expect(item(s, 'localVersion')).toMatchObject({ status: 'missing', tone: 'red' });
  });

  it('مساحة Drive شبه ممتلئة ⇒ تدرّج أخضر ← برتقالي ← أحمر', () => {
    const at = (used: number) => item(healthy({ driveStorage: { usedBytes: used, limitBytes: 100 } }), 'driveStorage').tone;
    expect(at(50)).toBe('green');
    expect(at(88)).toBe('orange');
    expect(at(97)).toBe('red');
  });

  it('مساحة بلا حدّ لا تُعرض كخطر', () => {
    const s = healthy({ driveStorage: { usedBytes: 1_000, limitBytes: null } });
    expect(item(s, 'driveStorage')).toMatchObject({ status: 'unlimited', tone: 'green' });
  });

  it('قفل المزامنة مشغول ⇒ حالة busy باسم العملية', () => {
    const s = healthy({ activeOperation: 'UPLOAD' });
    expect(item(s, 'mutex')).toMatchObject({ status: 'busy', tone: 'blue', value: 'UPLOAD' });
  });

  it('يميّز «لا يوجد تعارض» عن «لم يُفحص بعد»', () => {
    expect(item(healthy(), 'lastConflictCheck').status).toBe('clear');
    expect(item(healthy({ lastConflictCheckAt: null }), 'lastConflictCheck').status).toBe('never');
    expect(item(healthy({ conflictPending: true }), 'lastConflictCheck')).toMatchObject({ status: 'conflict', tone: 'red' });
  });

  it('يميّز «لا نسخة سحابية» عن «لم يُستعلم عنها بعد»', () => {
    expect(item(healthy({ cloudVersion: null, cloudObservedAt: HOURS(1) }), 'cloudVersion').status).toBe('none');
    expect(item(healthy({ cloudVersion: null, cloudObservedAt: null }), 'cloudVersion').status).toBe('untested');
  });
});

describe('buildDiagnosticReport — تقرير الدعم الفني', () => {
  it('يحتوي كل الأقسام التي يحتاجها الدعم', () => {
    const report = buildDiagnosticReport(healthy());
    for (const section of [
      'Cloud Diagnostics Report', 'Account & Authorization', 'Connectivity',
      'Sync History', 'Database', 'Last Error',
    ]) {
      expect(report).toContain(section);
    }
  });

  it('يعرض الصحة والحالة والإصدار', () => {
    const report = buildDiagnosticReport(healthy());
    expect(report).toContain('EXCELLENT (100%)');
    expect(report).toContain('1.4.0');
    expect(report).toContain('owner@example.com');
  });

  it('🔴 لا يحتوي أي سرّ — ضمانة بنيوية لا انضباطية', () => {
    // `DiagnosticsSnapshot` لا يحمل حقلًا لأي رمز أصلًا، فالتقرير لا يستطيع طباعة
    // ما لا يراه. هذا الاختبار يحرس العقد ضد أي إضافة مستقبلية لحقل سرّي.
    const report = buildDiagnosticReport(healthy({ grantDead: true, lastError: 'انتهت صلاحية ربط حساب Google' }));
    const support = buildSupportInfo(healthy({ grantDead: true }));
    // علامات القيم السرّية نفسها — لا أسماء الحقول (فـ`refresh_token_missing` رمز
    // تشخيصي مشروع، بينما `ya29.` بادئة رمز وصول حقيقي من Google).
    for (const secret of ['client_secret', 'clientSecret', 'ya29.', 'Bearer ', '1//0', 'GOCSPX-']) {
      expect(report).not.toContain(secret);
      expect(support).not.toContain(secret);
    }
    // ولا أي سلسلة مبهمة طويلة تشبه رمزًا (التقرير كله قيم قصيرة وتواريخ).
    const allLines = [...report.split(/\n/), ...support.split(/\n/)];
    for (const line of allLines) {
      expect(line).not.toMatch(/[A-Za-z0-9_-]{40,}/);
    }
  });

  it('يعرض تاريخ انتهاء رمز الوصول لا قيمته', () => {
    const report = buildDiagnosticReport(healthy());
    expect(report).toContain('Access Token Expiry:');
    expect(report).not.toMatch(/Access Token:\s+\S{20,}/);
  });

  it('يُظهر التعارض القائم كسطر صريح لا يُخطئه الدعم', () => {
    expect(buildDiagnosticReport(healthy({ conflictPending: true }))).toContain('PENDING — user decision required');
  });

  it('يُظهر «Never» لا فراغًا حين لا توجد مزامنة سابقة', () => {
    expect(buildDiagnosticReport(healthy({ lastSyncAt: null }))).toContain('Last Sync:            Never');
  });

  it('يمرّر رسالة الخطأ العربية كما هي — هي أصلًا مُترجَمة للمستخدم', () => {
    const report = buildDiagnosticReport(healthy({ lastError: 'تعذّر الاتصال بـ Google Drive' }));
    expect(report).toContain('تعذّر الاتصال بـ Google Drive');
  });
});

describe('buildSupportInfo — الكتلة المختصرة', () => {
  it('سطور قليلة تحمل ما يحتاجه المسؤول فورًا', () => {
    const support = buildSupportInfo(healthy());
    expect(support.split('\n').length).toBeLessThanOrEqual(12);
    expect(support).toContain('manarERP Support Info');
    expect(support).toContain('Health: EXCELLENT 100%');
    expect(support).toContain('1.4.0');
  });

  it('يُظهر حالة المنحة الميتة برمزها التقني للدعم', () => {
    const support = buildSupportInfo(healthy({ grantDead: true, grantDeadCode: 'invalid_grant', authenticated: false }));
    expect(support).toContain('invalid_grant');
  });
});

describe('حتمية الحساب', () => {
  it('لا يقرأ الوقت من تلقاء نفسه — نفس اللقطة تُنتج نفس النتيجة دائمًا', () => {
    const a = buildDiagnosticReport(healthy());
    const b = buildDiagnosticReport(healthy());
    expect(a).toBe(b);
    expect(computeCloudHealth(healthy())).toEqual(computeCloudHealth(healthy()));
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
//  Production Polish Pack v1
// ═══════════════════════════════════════════════════════════════════════════════

function logEntry(over: Partial<SyncLogRecord> = {}): SyncLogRecord {
  return { at: NOW, action: 'UPLOAD', result: 'SUCCESS', message: 'تم الرفع', ...over };
}

describe('suggestActionFor — §2 · الإجراء المقترح', () => {
  it('العملية الناجحة لا تستحق اقتراحًا مصطنعًا', () => {
    expect(suggestActionFor(logEntry())).toBe('NONE');
    expect(suggestActionFor(logEntry({ action: 'DOWNLOAD' }))).toBe('NONE');
  });

  it('إعادة المحاولة الجارية ليست حالة تستدعي إجراءً من المستخدم', () => {
    expect(suggestActionFor(logEntry({ result: 'RETRY', message: 'محاولة 2 فشلت مؤقتًا' }))).toBe('NONE');
  });

  it('🔴 موت المنحة يقترح إعادة الربط لا إعادة المحاولة', () => {
    // إعادة المحاولة على منحة ميتة إهدار لوقت المستخدم — الاقتراح يجب أن يكون مُجديًا.
    const entry = logEntry({
      action: 'UPLOAD',
      result: 'FAILED',
      message: 'انتهت صلاحية ربط حساب Google أو أُلغي. بياناتك المحلية سليمة — يكفي إعادة ربط الحساب.',
    });
    expect(suggestActionFor(entry)).toBe('RECONNECT');
  });

  it('فشل المصادقة يقترح إعادة الربط', () => {
    expect(suggestActionFor(logEntry({ action: 'AUTH', result: 'FAILED', message: 'فشل' }))).toBe('RECONNECT');
  });

  it('انقطاع الشبكة يقترح فحص الاتصال لا إعادة الربط', () => {
    const offline = logEntry({ result: 'FAILED', message: 'تعذّر الاتصال بـ Google Drive. تحقّق من الاتصال بالإنترنت' });
    expect(suggestActionFor(offline)).toBe('CHECK_NETWORK');
    const timeout = logEntry({ result: 'FAILED', message: 'انتهت المهلة الزمنية للاتصال بـ Google Drive' });
    expect(suggestActionFor(timeout)).toBe('CHECK_NETWORK');
  });

  it('التعارض يقترح اختيار النسخة لا إعادة المحاولة', () => {
    expect(suggestActionFor(logEntry({ action: 'CONFLICT', result: 'SKIPPED', message: 'تعارض' }))).toBe('RESOLVE_CONFLICT');
  });

  it('فشل نسخة الإنقاذ يوجّه إلى مركز النسخ لا إلى السحابة', () => {
    expect(suggestActionFor(logEntry({ action: 'RESCUE_BACKUP', result: 'FAILED', message: 'تعذّر' }))).toBe('CHECK_BACKUPS');
  });

  it('الفشل العابر غير المصنَّف يقترح إعادة المحاولة', () => {
    expect(suggestActionFor(logEntry({ result: 'FAILED', message: 'خدمة Google Drive غير متاحة مؤقتًا' }))).toBe('RETRY');
  });
});

describe('buildDiagnosticsHistory — §3 · آخر مرة حدث فيها كل شيء', () => {
  const log: SyncLogRecord[] = [
    logEntry({ at: HOURS(1), action: 'UPLOAD', result: 'SUCCESS' }),
    logEntry({ at: HOURS(2), action: 'UPLOAD', result: 'FAILED' }),
    logEntry({ at: HOURS(3), action: 'CONFLICT', result: 'SKIPPED' }),
    logEntry({ at: HOURS(4), result: 'RETRY' }),
    logEntry({ at: HOURS(5), action: 'DOWNLOAD', result: 'SUCCESS' }),
    logEntry({ at: HOURS(6), action: 'AUTH', result: 'SUCCESS' }),
  ];

  it('يُعيد الأنواع الستة دائمًا بنفس الترتيب', () => {
    const keys = buildDiagnosticsHistory(log, { lastConnectionTestAt: HOURS(1) }).map((h) => h.key);
    expect(keys).toEqual(['connectionTest', 'reconnect', 'conflict', 'retry', 'restore', 'backup']);
  });

  it('يلتقط أحدث حدث من كل نوع', () => {
    const history = buildDiagnosticsHistory(log, { lastConnectionTestAt: HOURS(1) });
    const at = (key: string) => history.find((h) => h.key === key)!.at;
    expect(at('reconnect')).toBe(HOURS(6));
    expect(at('conflict')).toBe(HOURS(3));
    expect(at('retry')).toBe(HOURS(4));
    expect(at('restore')).toBe(HOURS(5));
    expect(at('backup')).toBe(HOURS(1));
  });

  it('🔴 لا يخلط الفشل بالنجاح — «آخر نسخة» تعني آخر نسخة نجحت', () => {
    const failedOnly: SyncLogRecord[] = [logEntry({ at: HOURS(1), action: 'UPLOAD', result: 'FAILED' })];
    const history = buildDiagnosticsHistory(failedOnly, { lastConnectionTestAt: null });
    expect(history.find((h) => h.key === 'backup')!.at).toBeNull();
  });

  it('السجلّ الفارغ يُعيد null لكل نوع — «لم يحدث بعد» لا فراغ', () => {
    const history = buildDiagnosticsHistory([], { lastConnectionTestAt: null });
    expect(history.every((h) => h.at === null)).toBe(true);
    expect(history).toHaveLength(6);
  });

  it('نسخة الإنقاذ تُحتسب نسخة احتياطية أيضًا', () => {
    const rescue: SyncLogRecord[] = [logEntry({ at: HOURS(2), action: 'RESCUE_BACKUP', result: 'SUCCESS' })];
    expect(buildDiagnosticsHistory(rescue, { lastConnectionTestAt: null }).find((h) => h.key === 'backup')!.at).toBe(HOURS(2));
  });
});

describe('summarizeHealthTrend — §5 · تاريخ الصحة', () => {
  const point = (at: string, score: number, grade: HealthPoint['grade'] = 'GOOD'): HealthPoint => ({ at, score, grade });

  it('تاريخ بنقطة واحدة أو بلا نقاط ⇒ لا ادّعاء بتغيّر', () => {
    expect(summarizeHealthTrend([])).toEqual({ lastChangeAt: null, previousScore: null, lastDropAt: null, lastDropDelta: null });
    expect(summarizeHealthTrend([point(NOW, 100, 'EXCELLENT')]).lastChangeAt).toBeNull();
  });

  it('يُظهر «من كم إلى كم» ومتى', () => {
    const trend = summarizeHealthTrend([point(HOURS(1), 70), point(HOURS(5), 100, 'EXCELLENT')]);
    expect(trend.lastChangeAt).toBe(HOURS(1));
    expect(trend.previousScore).toBe(100);
  });

  it('🔴 يميّز الانخفاض عن مجرّد التغيّر — وهو السؤال الذي يهمّ فعلًا', () => {
    // 70% مستقرّة منذ شهر ليست 70% هبطت من 100% قبل ساعة.
    const trend = summarizeHealthTrend([point(HOURS(1), 70), point(HOURS(5), 100, 'EXCELLENT')]);
    expect(trend.lastDropAt).toBe(HOURS(1));
    expect(trend.lastDropDelta).toBe(30);
  });

  it('الصعود المتواصل لا يُسجَّل كانخفاض', () => {
    const trend = summarizeHealthTrend([point(HOURS(1), 100, 'EXCELLENT'), point(HOURS(5), 70)]);
    expect(trend.lastDropAt).toBeNull();
    expect(trend.lastDropDelta).toBeNull();
  });

  it('يجد آخر انخفاض حتى لو تلاه تعافٍ', () => {
    const trend = summarizeHealthTrend([point(HOURS(1), 90), point(HOURS(2), 40), point(HOURS(3), 100, 'EXCELLENT')]);
    expect(trend.lastDropAt).toBe(HOURS(2));
    expect(trend.lastDropDelta).toBe(60);
  });
});

describe('appendHealthPoint — §5 · التسجيل عند التغيّر فقط', () => {
  const point = (at: string, score: number, grade: HealthPoint['grade'] = 'GOOD'): HealthPoint => ({ at, score, grade });

  it('🔴 نتيجة غير متغيّرة ⇒ نفس المرجع بالضبط، فلا يُكتب الملف أصلًا', () => {
    const history = [point(HOURS(5), 100, 'EXCELLENT')];
    expect(appendHealthPoint(history, point(NOW, 100, 'EXCELLENT'))).toBe(history);
  });

  it('تغيّر النتيجة يُضيف نقطة في المقدّمة', () => {
    const history = [point(HOURS(5), 100, 'EXCELLENT')];
    const next = appendHealthPoint(history, point(NOW, 70));
    expect(next).toHaveLength(2);
    expect(next[0].score).toBe(70);
  });

  it('تغيّر التصنيف وحده (بنفس النتيجة) يُسجَّل أيضًا', () => {
    const history = [point(HOURS(5), 70, 'GOOD')];
    expect(appendHealthPoint(history, point(NOW, 70, 'WARNING'))).toHaveLength(2);
  });

  it('لا يُعدّل المصفوفة الأصلية — دالة نقية', () => {
    const history = [point(HOURS(5), 100, 'EXCELLENT')];
    appendHealthPoint(history, point(NOW, 50));
    expect(history).toHaveLength(1);
  });

  it('يحترم الحدّ الأقصى فلا ينمو التاريخ بلا نهاية', () => {
    let history: HealthPoint[] = [];
    for (let i = 0; i < 40; i++) history = appendHealthPoint(history, point(HOURS(i), i), 20);
    expect(history).toHaveLength(20);
  });
});

describe('تقرير التشخيص — أقسام Polish Pack', () => {
  it('يحمل قسم المحرّك بمعلوماته السبع', () => {
    const report = buildDiagnosticReport(healthy());
    expect(report).toContain('--- Engine ---');
    expect(report).toContain('Drive API:');
    expect(report).toContain('OS Encryption:        Available');
  });

  it('🔴 يُبرز غياب التشفير صراحةً لا يُخفيه', () => {
    const report = buildDiagnosticReport(healthy({ engine: { ...healthy().engine, encryptionAvailable: false } }));
    expect(report).toContain('NOT AVAILABLE');
  });

  it('يحمل قسم اتجاه الصحة', () => {
    const report = buildDiagnosticReport(healthy({
      healthHistory: [
        { at: HOURS(1), score: 70, grade: 'GOOD' },
        { at: HOURS(5), score: 100, grade: 'EXCELLENT' },
      ],
    }));
    expect(report).toContain('--- Health Trend ---');
    expect(report).toContain('(was 100%)');
    expect(report).toContain('(-30 pts)');
  });

  it('كتلة الدعم المختصرة تذكر المحرّك وحالة التشفير', () => {
    expect(buildSupportInfo(healthy())).toContain('Encryption ON');
  });
});
