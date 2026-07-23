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
          throw new Error(`فشل بعد ${attempt} محاولات: ${message}`);
        }
        throw err;
      }
      const delayMs = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      opts.onRetry?.(attempt, err, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
