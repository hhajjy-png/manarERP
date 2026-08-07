import path from 'path';

/**
 * Production Startup Pack v1 — كشف جاهزية الخدمة الخلفية · طبقة سياسة نقية.
 *
 * لا تستورد `electron` إطلاقًا، فتعمل تحت `vitest.electron.config.ts` بلا بيئة
 * Electron — نفس نمط `syncDecision.pure.ts` و`googleDriveClientConfig.pure.ts`.
 * التنسيق (إطلاق العملية، الأحداث، الحوارات) يبقى في `backendLauncher.ts`.
 *
 * ── العطل الذي أوجب إعادة التصميم ─────────────────────────────────────────────
 *
 * النسخة السابقة: حلقة ثابتة 50 محاولة × 300ms ≈ 15 ثانية ثم رسالة عامة. كانت
 * تخلط بين حالتين متعاكستين تمامًا:
 *
 *   • **بطء مشروع** — أول تشغيل بعد التثبيت (ملفات باردة، مكافح فيروسات يفحص
 *     آلاف الملفات). قياس فعلي: الجاهزية عند ~15.6 ثانية ⇒ تجاوزت المهلة بثانية
 *     واحدة ⇒ أُغلق التطبيق رغم أن كل شيء كان يعمل.
 *   • **عطل فوري** — انهيار في الثانية الأولى كان يُنتظَر 15 ثانية كاملة ثم
 *     يُبلَّغ عنه كـ«مهلة»، بلا رمز خروج ولا سبب.
 *
 * الآن: الموت يُكتشف عبر حالة العملية فيُرمى فورًا بسببه الحقيقي، والبطء يُنتظَر
 * مع تقدّم مرئي. المهلة القصوى شبكة أمان لا آلية أساسية.
 */

/** عدد أسطر stderr المحتفظ بها من الخدمة الخلفية لأغراض التشخيص. */
export const BACKEND_STDERR_TAIL_LINES = 12;

/**
 * مهلة الأمان القصوى لجاهزية الخدمة.
 *
 * سخيّة عمدًا: بعد إزالة الكلفة الكبيرة من مسار الإقلاع (لا تُشغَّل أداة الترحيل
 * ما لم يوجد ترحيل معلَّق) وبعد اكتشاف الانهيار فورًا، لم يعد تجاوز هذه القيمة
 * يعني «بطئًا» بل عطلًا فعليًا يستحق الإبلاغ.
 */
export const BACKEND_READY_TIMEOUT_MS = 180_000;

export const HEALTH_POLL_INTERVAL_MS = 250;
export const HEALTH_URL = 'http://127.0.0.1:48211/api/health';

/** تفاصيل فشل بدء الخدمة — سبب حقيقي قابل للعرض، لا رسالة عامة. */
export interface BackendStartupFailure {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stderrTail: string[];
  dataDir: string;
  /**
   * آخر رسائل `error.log` — **المصدر الحقيقي للسبب في الإنتاج**.
   *
   * الخدمة الخلفية تُسجّل أخطاءها القاتلة عبر winston، ومنقل الطرفية معطَّل في
   * الإنتاج (`server.ts`: `if (env.NODE_ENV !== 'production')`). فـ`stderrTail`
   * يكون فارغًا في أكثر الأعطال شيوعًا — بما فيها EADDRINUSE — ولا يبقى للمستخدم
   * إلا «رمز الخروج: 1». قراءة السجلّ تُحوّل ذلك إلى سبب مقروء فعلًا.
   */
  logTail?: string[];
}

export class BackendStartupError extends Error {
  readonly failure: BackendStartupFailure;

  constructor(message: string, failure: BackendStartupFailure) {
    super(message);
    this.name = 'BackendStartupError';
    this.failure = failure;
  }

  /** نص تشخيصي جاهز للعرض — كل سطر منه حقيقة مُلتقَطة، لا نص مُصطنع. */
  describe(): string {
    const parts: string[] = [];
    if (this.failure.exitCode !== null) parts.push(`رمز الخروج: ${this.failure.exitCode}`);
    if (this.failure.signal) parts.push(`الإشارة: ${this.failure.signal}`);

    const logTail = this.failure.logTail ?? [];
    if (logTail.length > 0) {
      parts.push('', 'سبب التوقف كما سجّلته الخدمة الخلفية:', ...logTail);
    } else if (this.failure.stderrTail.length > 0) {
      parts.push('', 'آخر ما سجّلته الخدمة الخلفية:', ...this.failure.stderrTail);
    }

    parts.push('', `سجلّ التشخيص الكامل: ${path.join(this.failure.dataDir, 'logs', 'error.log')}`);
    return parts.join('\n');
  }
}

/**
 * يستخرج آخر رسائل خطأ من `error.log` بصيغة مقروءة.
 *
 * winston يكتب JSON سطرًا لكل حدث؛ عرضه خامًا للمستخدم النهائي عديم الفائدة —
 * نستخرج حقل `message` وحده، ونرجع إلى السطر الخام إن تعذّر التحليل. لا يرمي
 * أبدًا: هذه مسار تشخيص فشل، ولا يجوز أن يُفشل عرضَ الخطأ خطأٌ آخر.
 */
export function readBackendErrorLogTail(
  dataDir: string,
  readFile: (p: string) => string,
  limit = 3,
): string[] {
  try {
    const raw = readFile(path.join(dataDir, 'logs', 'error.log'));
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    return lines.slice(-limit).map((line) => {
      try {
        const parsed = JSON.parse(line) as { message?: unknown };
        return typeof parsed.message === 'string' ? parsed.message : line;
      } catch {
        return line;
      }
    });
  } catch {
    return [];
  }
}

/** يحتفظ بآخر N سطرًا غير فارغ — مخزن دائري بسيط لمخرجات stderr. */
export function appendStderrTail(tail: string[], chunk: string, limit = BACKEND_STDERR_TAIL_LINES): void {
  for (const line of chunk.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    tail.push(trimmed);
    if (tail.length > limit) tail.shift();
  }
}

export interface WaitForHealthOptions {
  /** يُستعلم قبل كل محاولة — عملية ميتة تُنهي الانتظار فورًا بدل استنفاد المهلة. */
  isChildAlive?: () => boolean;
  /** يُستدعى مرّة لكل ثانية منقضية — يُغذّي عدّاد نافذة بدء التشغيل. */
  onProgress?: (elapsedSeconds: number) => void;
  timeoutMs?: number;
  now?: () => number;
}

/**
 * ينتظر جاهزية `/api/health`.
 *
 * ثلاثة مخارج فقط: جاهزة ⇒ يعود · العملية ماتت ⇒ يرمي فورًا · تجاوز المهلة
 * القصوى ⇒ يرمي. لا مخرج رابع صامت.
 */
export async function waitForHealth(options: WaitForHealthOptions = {}): Promise<void> {
  const {
    isChildAlive,
    onProgress,
    timeoutMs = BACKEND_READY_TIMEOUT_MS,
    now = () => Date.now(),
  } = options;

  const startedAt = now();
  let lastReportedSecond = -1;

  for (;;) {
    if (isChildAlive && !isChildAlive()) {
      throw new Error('توقفت عملية الخدمة الخلفية قبل أن تصبح جاهزة');
    }

    try {
      const res = await fetch(HEALTH_URL, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch {
      // لم تجهز بعد — الاتصال مرفوض ما دامت لم تبدأ الاستماع.
    }

    const elapsedMs = now() - startedAt;
    if (elapsedMs >= timeoutMs) {
      throw new Error(`تعذّر تشغيل الخدمة الخلفية خلال ${Math.round(timeoutMs / 1000)} ثانية`);
    }

    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    if (onProgress && elapsedSeconds > lastReportedSecond) {
      lastReportedSecond = elapsedSeconds;
      onProgress(elapsedSeconds);
    }

    await new Promise((r) => setTimeout(r, HEALTH_POLL_INTERVAL_MS));
  }
}
