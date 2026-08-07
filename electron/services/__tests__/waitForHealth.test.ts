import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { waitForHealth, BackendStartupError, readBackendErrorLogTail } from '../backendReadiness.pure';

/**
 * Production Startup Pack v1 — كشف جاهزية الخدمة الخلفية.
 *
 * ── العطل الذي أدّى إلى هذه الوحدة ─────────────────────────────────────────────
 *
 * النسخة السابقة كانت حلقة ثابتة: 50 محاولة × 300ms ≈ 15 ثانية، ثم رمي رسالة
 * عامة. سلوكان خاطئان فيها:
 *
 *   1. **بطء مشروع يُعامَل كعطل.** أول تشغيل بعد التثبيت (ملفات باردة، مكافح
 *      فيروسات) تجاوز 15 ثانية ⇒ أُغلق التطبيق رغم أن الخدمة كانت تُقلع سليمة
 *      وتربط المنفذ بعد ثانية واحدة من انتهاء المهلة.
 *   2. **عطل فوري يُعامَل كبطء.** انهيار الخدمة في الثانية الأولى كان يُنتظَر
 *      15 ثانية كاملة ثم يُبلَّغ عنه كـ«مهلة» — بلا رمز خروج ولا سبب.
 *
 * الاختبارات أدناه تُثبّت السلوكين المعاكسين: الموت يُكتشف فورًا، والبطء يُنتظَر.
 */

const okResponse = { ok: true } as Response;
const failResponse = { ok: false } as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** يُشغّل وعدًا مع تقديم الزمن الوهمي حتى يستقر. */
async function settle<T>(promise: Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: Error }> {
  const wrapped = promise.then(
    (value) => ({ ok: true as const, value }),
    (error: Error) => ({ ok: false as const, error }),
  );
  // تقديم الزمن تدريجيًا ليتقدّم كل من مؤقّت الاستطلاع ومهلة الانتظار.
  for (let i = 0; i < 2000; i++) {
    await vi.advanceTimersByTimeAsync(250);
  }
  return wrapped;
}

describe('waitForHealth — النجاح', () => {
  it('يعود فور استجابة نقطة الفحص', async () => {
    fetchMock.mockResolvedValue(okResponse);
    const result = await settle(waitForHealth());
    expect(result.ok).toBe(true);
  });

  it('يحتمل رفض الاتصال في البداية ثم ينجح — الإقلاع البطيء ليس عطلًا', async () => {
    fetchMock
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(okResponse);

    const result = await settle(waitForHealth({ isChildAlive: () => true }));
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('لا يعتبر ردًّا غير ناجح (HTTP 503) جاهزية', async () => {
    fetchMock.mockResolvedValueOnce(failResponse).mockResolvedValue(okResponse);
    const result = await settle(waitForHealth({ isChildAlive: () => true }));
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('waitForHealth — الفشل السريع عند موت العملية', () => {
  it('يرمي فورًا حين تموت العملية بدل استنفاد المهلة', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    let alive = true;
    // تموت بعد أول محاولة.
    const isChildAlive = vi.fn(() => {
      const wasAlive = alive;
      alive = false;
      return wasAlive;
    });

    const result = await settle(waitForHealth({ isChildAlive, timeoutMs: 180_000 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('توقفت عملية الخدمة الخلفية');
    // الدليل الحاسم: لم تُستنفد 180 ثانية من المحاولات.
    expect(fetchMock.mock.calls.length).toBeLessThan(5);
  });

  it('لا ينتظر إطلاقًا حين تكون العملية ميتة قبل أول محاولة', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await settle(waitForHealth({ isChildAlive: () => false }));

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('waitForHealth — المهلة القصوى كشبكة أمان', () => {
  it('يرمي رسالة تذكر المدة بالثواني بعد تجاوز المهلة', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await settle(waitForHealth({ isChildAlive: () => true, timeoutMs: 3_000 }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toContain('3 ثانية');
  });

  it('المهلة الافتراضية أوسع بكثير من 15 ثانية التي كانت تُسقط أول تشغيل', async () => {
    // انحدار مباشر على العطل المُقاس: الجاهزية عند ~15.6 ثانية كانت تفشل.
    fetchMock.mockImplementation(() => Promise.reject(new Error('ECONNREFUSED')));
    let elapsed = 0;
    const now = () => {
      elapsed += 250;
      return elapsed;
    };
    // عند 20 ثانية يجب أن تكون ما زالت تنتظر، لا أن تكون رمت.
    const promise = waitForHealth({ isChildAlive: () => true, now });
    let rejected = false;
    promise.catch(() => { rejected = true; });
    for (let i = 0; i < 80; i++) await vi.advanceTimersByTimeAsync(250);
    expect(rejected).toBe(false);
    promise.catch(() => undefined);
  });
});

describe('BackendStartupError — السبب الحقيقي قابل للعرض', () => {
  it('يضمّ رمز الخروج وآخر أسطر الخطأ ومسار السجلّ', () => {
    const err = new BackendStartupError('توقفت الخدمة الخلفية أثناء بدء التشغيل.', {
      exitCode: 1,
      signal: null,
      stderrTail: ['Error: SQLITE_CANTOPEN', '    at Database.open'],
      dataDir: 'C:\\data',
    });

    const text = err.describe();
    expect(text).toContain('رمز الخروج: 1');
    expect(text).toContain('SQLITE_CANTOPEN');
    expect(text).toContain('error.log');
  });

  it('يبقى مفيدًا حين لا يوجد رمز خروج ولا stderr — لا نص فارغ', () => {
    const err = new BackendStartupError('تعذّر تشغيل عملية الخدمة الخلفية.', {
      exitCode: null,
      signal: null,
      stderrTail: [],
      dataDir: 'C:\\data',
    });

    expect(err.describe()).toContain('error.log');
  });

  it('يُقدّم سجلّ الخطأ على stderr — هو المصدر الحقيقي في الإنتاج', () => {
    // انحدار مباشر: في الإنتاج منقل الطرفية معطَّل، فـstderr يكون فارغًا في أكثر
    // الأعطال شيوعًا (EADDRINUSE مثلًا) ولا يبقى إلا «رمز الخروج: 1».
    const err = new BackendStartupError('توقفت الخدمة الخلفية أثناء بدء التشغيل.', {
      exitCode: 1,
      signal: null,
      stderrTail: [],
      logTail: ['[Backend] خطأ قاتل غير متوقع (EADDRINUSE — المنفذ 48211 مستخدم مسبقًا)'],
      dataDir: 'C:\\data',
    });

    const text = err.describe();
    expect(text).toContain('EADDRINUSE');
    expect(text).toContain('المنفذ 48211 مستخدم مسبقًا');
  });
});

describe('readBackendErrorLogTail — استخراج السبب من سجلّ winston', () => {
  it('يستخرج حقل message من أسطر JSON بدل عرضها خامًا', () => {
    const raw = [
      JSON.stringify({ level: 'error', message: 'خطأ قديم' }),
      JSON.stringify({ level: 'error', message: 'EADDRINUSE — المنفذ مستخدم', stack: 'Error: ...' }),
    ].join('\n');

    expect(readBackendErrorLogTail('C:\\data', () => raw, 1)).toEqual(['EADDRINUSE — المنفذ مستخدم']);
  });

  it('يرجع إلى السطر الخام حين لا يكون JSON صالحًا', () => {
    expect(readBackendErrorLogTail('C:\\data', () => 'سطر غير JSON', 1)).toEqual(['سطر غير JSON']);
  });

  it('يُعيد قائمة فارغة ولا يرمي حين لا يوجد سجلّ — الفشل يجب أن يُعرَض لا أن يُستبدل بفشل آخر', () => {
    expect(
      readBackendErrorLogTail('C:\\data', () => {
        throw new Error('ENOENT');
      }),
    ).toEqual([]);
  });
});
