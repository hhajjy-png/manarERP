import { describe, it, expect } from 'vitest';
import {
  decideSyncAction,
  remoteChangedSince,
  startupSyncActsOn,
  shutdownSyncActsOn,
  type DecisionInput,
  type RemoteSnapshot,
} from '../syncDecision.pure';

/**
 * Production Hardening Pack v1 — P0-10
 * تغطية كاملة لمحرّك اتخاذ القرار.
 *
 * هذه أخطر قواعد في النظام: هي التي تقرّر أي نسخة تعيش وأي نسخة تُستبدل. كانت قبل
 * هذه الحزمة غير مغطّاة بأي اختبار إطلاقًا. كل حالة هنا مكتوبة من زاوية **الضرر
 * الذي تمنعه** لا من زاوية «تغطية سطر».
 */

const HASH_A = 'a'.repeat(64);
const HASH_B = 'b'.repeat(64);
const HASH_SEED = 'c'.repeat(64);
const SNAPSHOT_A = 'd'.repeat(64); // بصمة اللقطة المرفوعة — تختلف عن بصمة الملف المحلي

function remote(overrides: Partial<RemoteSnapshot> = {}): RemoteSnapshot {
  return {
    id: 'file-1',
    sha256: HASH_A,
    modifiedTime: '2026-08-01T10:00:00.000Z',
    size: 2_097_152,
    version: 5,
    deviceId: 'device-remote',
    deviceName: 'جهاز المحاسبة',
    ...overrides,
  };
}

function input(overrides: Partial<DecisionInput> = {}): DecisionInput {
  return {
    localHash: HASH_A,
    remote: remote(),
    metadata: { lastSyncedHash: HASH_A, lastSyncedLocalHash: HASH_A },
    isPristineSeed: false,
    // Data Safety Pack v2 — F-03. الافتراضي `false` هو **قيمة السقوط الآمن**: كل
    // الحالات السابقة تبقى معبَّرة عن السلوك نفسه حرفيًا، فأي تغيّر في نتائجها كان
    // سيكون انحدارًا حقيقيًا لا مجرّد تعديل توقيع.
    goldenNewerThanRemote: false,
    ...overrides,
  };
}

describe('decideSyncAction — لا نسخة سحابية (Missing Remote)', () => {
  it('يرفع حين توجد قاعدة محلية ولا يوجد ملف على Drive', () => {
    const result = decideSyncAction(input({ remote: null, localHash: HASH_A }));
    expect(result.action).toBe('UPLOAD');
    expect(result.reason).toContain('لا توجد نسخة سحابية');
  });

  it('لا يفعل شيئًا حين لا توجد بيانات محلية ولا سحابية', () => {
    const result = decideSyncAction(input({ remote: null, localHash: null }));
    expect(result.action).toBe('NONE');
  });

  it('يرفع حتى لو كانت البذرة سليمة — لا شيء سحابي يُهدَّد بالاستبدال', () => {
    // الحارس ضدّ رفع البذرة معنيّ بحماية نسخة سحابية قائمة. لا نسخة ⇒ لا خطر،
    // والقالب يصير القاعدة الحقيقية للمستخدم كما هو التصميم.
    const result = decideSyncAction(input({ remote: null, localHash: HASH_SEED, isPristineSeed: true }));
    expect(result.action).toBe('UPLOAD');
  });
});

describe('decideSyncAction — لا قاعدة محلية (Missing Local)', () => {
  it('ينزّل حين لا يوجد ملف قاعدة بيانات محلي وتوجد نسخة سحابية', () => {
    const result = decideSyncAction(input({ localHash: null }));
    expect(result.action).toBe('DOWNLOAD');
  });

  it('لا ينتج «محدّث بالفعل» بالخطأ حين تتطابق البصمات المرجعية والملف مفقود', () => {
    // فخّ حقيقي: `localChanged` يُحسب `false` حين تكون البصمة المرجعية `null`
    // والملف مفقود — فكان القرار سيصبح NONE ويُترك المستخدم بلا قاعدة بيانات.
    const result = decideSyncAction(
      input({ localHash: null, metadata: { lastSyncedHash: null, lastSyncedLocalHash: null } }),
    );
    expect(result.action).toBe('DOWNLOAD');
  });
});

describe('decideSyncAction — تطابق البصمة (Same Hash)', () => {
  it('لا يفعل شيئًا حين تطابق بصمة الملف المحلي بصمة النسخة السحابية', () => {
    const result = decideSyncAction(input({ localHash: HASH_A, remote: remote({ sha256: HASH_A }) }));
    expect(result.action).toBe('NONE');
    expect(result.reason).toBe('محدّث بالفعل');
  });

  it('التطابق يسبق حارس البذرة — لا تنزيل بلا داعٍ لملف مطابق بايتًا ببايت', () => {
    const result = decideSyncAction(
      input({ localHash: HASH_SEED, remote: remote({ sha256: HASH_SEED }), isPristineSeed: true }),
    );
    expect(result.action).toBe('NONE');
  });

  it('لا يفعل شيئًا حين لم يتغيّر أي طرف عن آخر مزامنة (بصمتان مختلفتان للقطة والملف)', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_A,
        remote: remote({ sha256: SNAPSHOT_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('NONE');
  });
});

describe('decideSyncAction — تغيّر محلي (Local newer)', () => {
  it('يرفع حين تغيّر المحلي وحده', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: SNAPSHOT_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('UPLOAD');
    expect(result.reason).toContain('تغييرات محلية');
  });

  it('يقارن المحلي ببصمة الملف المحلي لا ببصمة اللقطة المرفوعة', () => {
    // انحدار تاريخي: مقارنة الملف المحلي بـ`lastSyncedHash` (بصمة لقطة VACUUM)
    // كانت تجعل `localChanged` صحيحًا أبدًا ⇒ رفع في كل إغلاق، وتعارض كاذب حين
    // يتغيّر السحابي من جهاز آخر.
    const result = decideSyncAction(
      input({
        localHash: HASH_A,
        remote: remote({ sha256: SNAPSHOT_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('NONE');
  });

  it('يعود إلى lastSyncedHash حين تغيب البصمة المحلية (بيانات ما قبل الترقية)', () => {
    const result = decideSyncAction(
      input({ localHash: HASH_A, remote: remote({ sha256: HASH_B }), metadata: { lastSyncedHash: HASH_A } }),
    );
    // المحلي مطابق للمرجع القديم ⇒ لم يتغيّر؛ والسحابي تغيّر ⇒ تنزيل.
    expect(result.action).toBe('DOWNLOAD');
  });
});

describe('decideSyncAction — تغيّر سحابي (Remote newer)', () => {
  it('ينزّل حين تغيّر السحابي وحده', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_A,
        remote: remote({ sha256: HASH_B }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('DOWNLOAD');
    expect(result.reason).toContain('أحدث على Google Drive');
  });

  it('لا يعتبر السحابي متغيّرًا حين لا يحمل بصمة إطلاقًا (رُفع بأداة أقدم)', () => {
    // غياب البصمة ليس دليل تغيير. اعتباره كذلك كان سيُنتج تعارضات كاذبة مع كل
    // ملف رُفع بنسخة أقدم من الأداة لا تكتب `appProperties.sha256`.
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: null }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('UPLOAD');
  });
});

describe('decideSyncAction — تعارض (Conflict)', () => {
  it('يُنتج تعارضًا حين تغيّر الطرفان معًا منذ آخر مزامنة', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: 'e'.repeat(64) }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toContain('تعارض');
  });

  it('لا يحسم التعارض تلقائيًا في أي اتجاه', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: 'e'.repeat(64) }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(result.action).not.toBe('UPLOAD');
    expect(result.action).not.toBe('DOWNLOAD');
  });

  it('أول ربط بلا بيانات مزامنة سابقة على قاعدة حقيقية ⇒ تعارض لا رفع صامت', () => {
    // قاعدة مستخدم حقيقية (ليست بذرة) + نسخة سحابية قائمة + لا سجلّ مزامنة.
    // الرفع التلقائي هنا كان سيدهس بيانات Drive بلا سؤال.
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: HASH_A }),
        metadata: { lastSyncedHash: null, lastSyncedLocalHash: null },
        isPristineSeed: false,
      }),
    );
    expect(result.action).toBe('CONFLICT');
  });
});

describe('decideSyncAction — بذرة القالب (Seed Database)', () => {
  it('ينزّل ولا يُنتج تعارضًا حين تكون القاعدة المحلية بذرة قالب وتوجد نسخة سحابية', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_SEED,
        remote: remote({ sha256: HASH_A }),
        metadata: { lastSyncedHash: null, lastSyncedLocalHash: null },
        isPristineSeed: true,
      }),
    );
    expect(result.action).toBe('DOWNLOAD');
    expect(result.reason).toContain('بذرة');
  });

  it('لا يتيح مطلقًا رفع البذرة فوق نسخة سحابية قائمة', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_SEED,
        remote: remote({ sha256: HASH_A }),
        metadata: { lastSyncedHash: null, lastSyncedLocalHash: null },
        isPristineSeed: true,
      }),
    );
    expect(result.action).not.toBe('UPLOAD');
    expect(result.action).not.toBe('CONFLICT');
  });

  it('حارس البذرة يسبق مقارنات التغيير حتى مع وجود سجلّ مزامنة سابق', () => {
    const result = decideSyncAction(
      input({
        localHash: HASH_SEED,
        remote: remote({ sha256: HASH_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_B },
        isPristineSeed: true,
      }),
    );
    expect(result.action).toBe('DOWNLOAD');
  });
});

describe('decideSyncAction — قاعدة فارغة (Empty Database)', () => {
  it('ملف قاعدة مفقود تمامًا بلا نسخة سحابية ⇒ لا شيء يُفعل', () => {
    expect(decideSyncAction(input({ localHash: null, remote: null })).action).toBe('NONE');
  });

  it('ملف فارغ (بصمة الفراغ) يُعامل كأي قاعدة أخرى — لا حالة خاصة تُخفي بيانات', () => {
    const emptyHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
    const result = decideSyncAction(
      input({
        localHash: emptyHash,
        remote: remote({ sha256: HASH_A }),
        metadata: { lastSyncedHash: HASH_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    // المحلي تغيّر (صار فارغًا) والسحابي لم يتغيّر ⇒ رفع. القرار لا يخترع
    // استثناءً للفراغ: تفسير «الفارغ = تالف» ليس من مسؤولية محرّك القرار،
    // بل من مسؤولية فحص السلامة الذي يسبق أي رفع فعلي.
    expect(result.action).toBe('UPLOAD');
  });
});

describe('سياسة المزامنة التلقائية — بدء التشغيل والإغلاق', () => {
  it('مزامنة بدء التشغيل تنفّذ التنزيل فقط', () => {
    expect(startupSyncActsOn('DOWNLOAD')).toBe(true);
    expect(startupSyncActsOn('UPLOAD')).toBe(false);
    expect(startupSyncActsOn('CONFLICT')).toBe(false);
    expect(startupSyncActsOn('NONE')).toBe(false);
  });

  it('مزامنة الإغلاق تنفّذ الرفع فقط', () => {
    expect(shutdownSyncActsOn('UPLOAD')).toBe(true);
    expect(shutdownSyncActsOn('DOWNLOAD')).toBe(false);
    expect(shutdownSyncActsOn('CONFLICT')).toBe(false);
    expect(shutdownSyncActsOn('NONE')).toBe(false);
  });

  it('بدء التشغيل: بذرة + نسخة سحابية ⇒ تنزيل يُنفَّذ فعلًا', () => {
    const decision = decideSyncAction(
      input({ localHash: HASH_SEED, remote: remote(), metadata: { lastSyncedHash: null }, isPristineSeed: true }),
    );
    expect(startupSyncActsOn(decision.action)).toBe(true);
  });

  it('بدء التشغيل: تغييرات محلية غير مرفوعة ⇒ لا يُنفَّذ شيء (لا رفع تلقائي عند البدء)', () => {
    const decision = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: SNAPSHOT_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(decision.action).toBe('UPLOAD');
    expect(startupSyncActsOn(decision.action)).toBe(false);
  });

  it('الإغلاق: تغييرات محلية غير مرفوعة ⇒ رفع يُنفَّذ فعلًا', () => {
    const decision = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: SNAPSHOT_A }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(shutdownSyncActsOn(decision.action)).toBe(true);
  });

  it('الإغلاق: نسخة سحابية أحدث ⇒ لا يُنفَّذ شيء (لا استبدال للقاعدة لحظة الخروج)', () => {
    const decision = decideSyncAction(
      input({
        localHash: HASH_A,
        remote: remote({ sha256: HASH_B }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(decision.action).toBe('DOWNLOAD');
    expect(shutdownSyncActsOn(decision.action)).toBe(false);
  });

  it('التعارض لا يُنفَّذ تلقائيًا في أيٍّ من المسارين', () => {
    const decision = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: 'e'.repeat(64) }),
        metadata: { lastSyncedHash: SNAPSHOT_A, lastSyncedLocalHash: HASH_A },
      }),
    );
    expect(decision.action).toBe('CONFLICT');
    expect(startupSyncActsOn(decision.action)).toBe(false);
    expect(shutdownSyncActsOn(decision.action)).toBe(false);
  });
});

describe('remoteChangedSince — حماية فقدان التحديث (P0-7)', () => {
  it('لا تغيير حين تكون اللقطتان متطابقتين', () => {
    expect(remoteChangedSince(remote(), remote())).toBe(false);
  });

  it('لا تغيير حين لا يوجد ملف بعيد في الحالتين', () => {
    expect(remoteChangedSince(null, null)).toBe(false);
  });

  it('يكتشف ظهور ملف بعيد لم يكن موجودًا (جهاز آخر رفع أولًا)', () => {
    expect(remoteChangedSince(null, remote())).toBe(true);
  });

  it('يكتشف اختفاء الملف البعيد (حُذف من Drive أثناء العملية)', () => {
    expect(remoteChangedSince(remote(), null)).toBe(true);
  });

  it('يكتشف تغيّر البصمة', () => {
    expect(remoteChangedSince(remote(), remote({ sha256: HASH_B }))).toBe(true);
  });

  it('يكتشف تغيّر رقم النسخة', () => {
    expect(remoteChangedSince(remote(), remote({ version: 6 }))).toBe(true);
  });

  it('يكتشف تغيّر وقت التعديل حتى مع تطابق باقي الحقول', () => {
    expect(remoteChangedSince(remote(), remote({ modifiedTime: '2026-08-01T11:00:00.000Z' }))).toBe(true);
  });

  it('يكتشف استبدال الملف بملف آخر بنفس الاسم (معرّف مختلف)', () => {
    expect(remoteChangedSince(remote(), remote({ id: 'file-2' }))).toBe(true);
  });

  it('يكتشف التغيير حتى حين تغيب البصمة من الطرفين ويبقى الوقت وحده مختلفًا', () => {
    const base = remote({ sha256: null, version: null });
    expect(remoteChangedSince(base, { ...base, modifiedTime: '2026-08-02T00:00:00.000Z' })).toBe(true);
  });
});

// ─── Data Safety Pack v2 · F-03 — حماية القالب الذهبي ────────────────────────

describe('decideSyncAction — القالب الذهبي أحدث من النسخة السحابية (F-03)', () => {
  it('لا يُنزّل فوق بذرة يُثبت البيان أنها أحدث — بل يُحوّلها تعارضًا يقرّره المستخدم', () => {
    const result = decideSyncAction(
      input({ localHash: HASH_SEED, isPristineSeed: true, goldenNewerThanRemote: true }),
    );
    expect(result.action).toBe('CONFLICT');
    expect(result.reason).toContain('أحدث من النسخة الموجودة على Google Drive');
  });

  it('يُنزّل كالسابق حين لا يُثبت البيان أحدثية القالب — السقوط الآمن', () => {
    const result = decideSyncAction(
      input({ localHash: HASH_SEED, isPristineSeed: true, goldenNewerThanRemote: false }),
    );
    expect(result.action).toBe('DOWNLOAD');
    expect(result.reason).toContain('أول تشغيل');
  });

  it('حارس الأحدثية لا يُفعَّل على قاعدة مستخدم حقيقية مهما كانت قيمة العلَم', () => {
    // `goldenNewerThanRemote` لا يُقرأ خارج فرع البذرة إطلاقًا. لو تسرّب إلى مقارنات
    // التغيير لكان قادرًا على قلب قرار قاعدة حقيقية — وهذا ما يمنعه هذا الاختبار.
    const result = decideSyncAction(
      input({
        localHash: HASH_B,
        remote: remote({ sha256: 'e'.repeat(64) }), // السحابي تغيّر عن آخر مزامنة
        isPristineSeed: false,
        goldenNewerThanRemote: true,
        metadata: { lastSyncedHash: HASH_A, lastSyncedLocalHash: HASH_B }, // المحلي لم يتغيّر
      }),
    );
    expect(result.action).toBe('DOWNLOAD');
    expect(result.reason).toContain('أحدث على Google Drive');
  });

  it('التطابق التامّ يسبق حارس الأحدثية — لا تعارض لملف مطابق بايتًا ببايت', () => {
    // القاعدة (2) تسبق القاعدة (4). بلا هذا الترتيب كان جهاز رفع قالبه للتوّ يرى
    // تعارضًا مع نسخته هو.
    const result = decideSyncAction(
      input({
        localHash: HASH_A,
        remote: remote({ sha256: HASH_A }),
        isPristineSeed: true,
        goldenNewerThanRemote: true,
      }),
    );
    expect(result.action).toBe('NONE');
  });

  it('بذرة أحدث بلا نسخة سحابية ⇒ رفع لا تعارض — لا شيء يُهدَّد بالاستبدال', () => {
    const result = decideSyncAction(
      input({ remote: null, localHash: HASH_SEED, isPristineSeed: true, goldenNewerThanRemote: true }),
    );
    expect(result.action).toBe('UPLOAD');
  });

  it('غياب القاعدة المحلية يسبق حارس الأحدثية — تنزيل حصرًا', () => {
    const result = decideSyncAction(
      input({ localHash: null, isPristineSeed: true, goldenNewerThanRemote: true }),
    );
    expect(result.action).toBe('DOWNLOAD');
    expect(result.reason).toContain('لا توجد قاعدة بيانات محلية');
  });
});
