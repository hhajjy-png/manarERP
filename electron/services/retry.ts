/**
 * مساعد إعادة محاولة عام بتراجع أُسّي (exponential backoff) — لا يعرف شيئًا عن
 * Google Drive أو المزامنة تحديدًا؛ يُستخدم من `syncEngine.service.ts` حول أي
 * عملية شبكية قابلة لإعادة المحاولة.
 */

export interface RetryOptions {
  /** الحد الأقصى لعدد المحاولات (شاملة المحاولة الأولى). افتراضيًا 4. */
  maxAttempts?: number;
  /** التأخير الأساسي بالمللي ثانية قبل المضاعفة الأُسّية. افتراضيًا 1000. */
  baseDelayMs?: number;
  /** سقف التأخير بين المحاولات. افتراضيًا 15000. */
  maxDelayMs?: number;
  /** يُحدّد إن كان الخطأ مؤقتًا (قابل لإعادة المحاولة) — الافتراضي يعيد المحاولة دائمًا. */
  isRetryable?: (err: unknown) => boolean;
  /**
   * يسمح للخطأ نفسه بتحديد زمن الانتظار بدل التراجع الأُسّي المحسوب.
   *
   * سببه الوحيد اليوم هو ترويسة `Retry-After` من Google (P0-9): حين يقول الخادم
   * صراحةً «أعد بعد N ثانية»، تجاهُل ذلك ومعاودة المحاولة أبكر يُطيل الحظر بدل
   * أن يُنهيه. الافتراضي (غياب الدالة) يُبقي السلوك السابق حرفيًا.
   */
  getRetryDelayMs?: (err: unknown, defaultDelayMs: number) => number;
  /** يُستدعى قبل كل محاولة إعادة — لتسجيل المحاولة في سجلّ المزامنة. */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const maxAttempts = opts.maxAttempts ?? 4;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const maxDelayMs = opts.maxDelayMs ?? 15000;
  const isRetryable = opts.isRetryable ?? (() => true);

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const canRetry = attempt < maxAttempts && isRetryable(err);
      if (!canRetry) {
        if (attempt > 1) {
          const message = err instanceof Error ? err.message : String(err);
          // Data Safety Pack v2 — F-02: `cause` يحفظ **نوع** الخطأ الأصلي عبر اللفّ.
          // بدونه كان إلغاءُ عمليةٍ في المحاولة الثانية فما فوق يخرج من هنا كـ`Error`
          // عامّ، فيفقد المحرّك القدرة على تمييز «أُلغيت العملية» عن «فشلت» — ويعامل
          // الإلغاء المتعمَّد فشلًا سحابيًا كاملًا. النصّ الأصلي يبقى داخل الرسالة كما
          // كان، فتصنيف `classifyGoogleAuthError` لا يتأثر إطلاقًا.
          // `cause` يُسنَد يدويًا لا عبر `new Error(msg, { cause })`: خيار المُنشئ
          // يتطلّب `lib: ES2022`، وترقية هدف الترجمة لأجل سطر واحد تغيير أوسع من
          // نطاق هذه الحزمة. الأثر وقت التشغيل متطابق.
          const wrapped = new Error(`فشل بعد ${attempt} محاولات: ${message}`);
          (wrapped as Error & { cause?: unknown }).cause = err;
          throw wrapped;
        }
        throw err;
      }
      const backoffMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const delayMs = opts.getRetryDelayMs?.(err, backoffMs) ?? backoffMs;
      opts.onRetry?.(attempt, err, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
