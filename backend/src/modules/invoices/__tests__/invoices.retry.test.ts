import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import { isEntryNumberCollision } from '../invoices.service';

// بناء خطأ P2002 حقيقي (PrismaClientKnownRequestError) بالحقل المطلوب.
// يستخدم الـ constructor الفعلي لاجتياز فحص instanceof.
function makeP2002(target: string[] | string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError(
    'Unique constraint failed on the fields',
    { code: 'P2002', clientVersion: '5.18.0', meta: { target } },
  );
}

// ─── اختبارات isEntryNumberCollision ─────────────────────────────────────────

describe('isEntryNumberCollision — تمييز تعارض entryNumber عن باقي الأخطاء', () => {
  it('يُرجع true عند P2002 على حقل entryNumber (مصفوفة)', () => {
    expect(isEntryNumberCollision(makeP2002(['entryNumber']))).toBe(true);
  });

  it('يُرجع true عند P2002 على اسم قيد يحتوي entryNumber (نص)', () => {
    expect(isEntryNumberCollision(makeP2002('journal_entries_entryNumber_key'))).toBe(true);
  });

  it('يُرجع false عند P2002 على invoiceNumber — لا يُعاد المحاولة', () => {
    expect(isEntryNumberCollision(makeP2002(['invoiceNumber']))).toBe(false);
  });

  it('يُرجع false عند P2002 على number', () => {
    expect(isEntryNumberCollision(makeP2002(['number']))).toBe(false);
  });

  it('يُرجع false عند P2002 على [referenceType, referenceId]', () => {
    expect(isEntryNumberCollision(makeP2002(['referenceType', 'referenceId']))).toBe(false);
  });

  it('يُرجع false عند P2002 على transactions_entryNumber_key (نظام قديم — لا retry)', () => {
    // السبب الجذري للخلل الإنتاجي: transactions_entryNumber_key يحتوي "entryNumber"
    // لكنه من جدول transactions وليس journal_entries → يجب ألا يُعيد retry.
    expect(isEntryNumberCollision(makeP2002('transactions_entryNumber_key'))).toBe(false);
  });

  it('يُرجع true عند P2002 على journal_entries_entryNumber_key (النظام الجديد — يستحق retry)', () => {
    expect(isEntryNumberCollision(makeP2002('journal_entries_entryNumber_key'))).toBe(true);
  });

  it('يُرجع false عند خطأ P2025 (ليس P2002)', () => {
    const err = new Prisma.PrismaClientKnownRequestError(
      'Record not found',
      { code: 'P2025', clientVersion: '5.18.0', meta: { target: ['entryNumber'] } },
    );
    expect(isEntryNumberCollision(err)).toBe(false);
  });

  it('يُرجع false عند خطأ Error عادي (ليس Prisma)', () => {
    expect(isEntryNumberCollision(new Error('Some generic error'))).toBe(false);
  });

  it('يُرجع false عند null', () => {
    expect(isEntryNumberCollision(null)).toBe(false);
  });
});

// ─── اختبارات منطق retry ──────────────────────────────────────────────────────
// نختبر منطق الـ retry المنعزل بدلاً من الخدمة بالكامل (التي تتطلب mock لـ Prisma).
// هذا يثبت أن isEntryNumberCollision تُتكامل صحيحاً مع حلقة المحاولة.

describe('منطق retry — entryNumber collision مقابل invoiceNumber conflict', () => {
  async function runWithRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<{ result: T; attempts: number }> {
    let lastErr: unknown;
    let attempts = 0;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      attempts++;
      try {
        const result = await fn();
        return { result, attempts };
      } catch (err) {
        if (attempt < maxAttempts - 1 && isEntryNumberCollision(err)) {
          lastErr = err;
          continue;
        }
        throw err;
      }
    }
    throw lastErr!;
  }

  it('ينجح في المحاولة الثانية عند تعارض entryNumber في الأولى', async () => {
    let callCount = 0;
    const { result, attempts } = await runWithRetry(async () => {
      callCount++;
      if (callCount === 1) throw makeP2002(['entryNumber']);
      return { id: 42, invoiceNumber: 'MN-INV-2026-0001' };
    });

    expect(attempts).toBe(2);
    expect(result).toEqual({ id: 42, invoiceNumber: 'MN-INV-2026-0001' });
  });

  it('لا يُعيد المحاولة عند تعارض invoiceNumber — يُرمى فوراً', async () => {
    let callCount = 0;
    await expect(
      runWithRetry(async () => {
        callCount++;
        throw makeP2002(['invoiceNumber']);
      }),
    ).rejects.toSatisfy((e: unknown) =>
      e instanceof Error && e.message.includes('Unique constraint'),
    );
    expect(callCount).toBe(1); // محاولة واحدة فقط — لا retry
  });

  it('يستنفد المحاولات الثلاث ويُرمى الخطأ إذا استمر تعارض entryNumber', async () => {
    let callCount = 0;
    await expect(
      runWithRetry(async () => {
        callCount++;
        throw makeP2002(['entryNumber']);
      }, 3),
    ).rejects.toBeDefined();
    expect(callCount).toBe(3); // محاولة أصلية + محاولتا إعادة
  });

  it('لا يُعيد المحاولة على AppError (خطأ تحقق من البيانات)', async () => {
    let callCount = 0;
    const appError = new Error('رقم الفاتورة مُستخدم من قبل');
    await expect(
      runWithRetry(async () => {
        callCount++;
        throw appError;
      }),
    ).rejects.toBe(appError);
    expect(callCount).toBe(1);
  });
});
