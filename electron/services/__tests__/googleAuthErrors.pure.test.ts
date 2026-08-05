import { describe, it, expect } from 'vitest';
import {
  classifyGoogleAuthError,
  isGrantDeadError,
  toUserFacingSyncError,
  GrantDeadError,
} from '../googleAuthErrors.pure';

/**
 * Production Hardening Pack v1 — P0-1 / P0-3
 *
 * ما تُثبته هذه الاختبارات:
 *   1. الرموز الثلاثة التي تعني «منحة ميتة» تُكتشف مهما كان الشكل الذي يصل به الخطأ
 *      من `google-auth-library` (رسالة، جسم استجابة، حقل مباشر).
 *   2. لا يخرج نصّ إنجليزي خام من Google إلى المستخدم النهائي أبدًا.
 *   3. لا إفراط في التصنيف: خطأ شبكة أو خطأ Drive عادي لا يُقتل معه ربط الحساب.
 */

/** يحاكي شكل `GaxiosError` الذي تنتجه المكتبة فعليًا. */
function gaxiosLike(error: string, description?: string): Error {
  const err = new Error('Request failed with status code 400') as Error & {
    response?: { data: unknown };
  };
  err.response = { data: { error, error_description: description ?? '' } };
  return err;
}

describe('classifyGoogleAuthError — اكتشاف موت المنحة', () => {
  it('يكتشف invalid_grant من نصّ الرسالة المباشر', () => {
    const result = classifyGoogleAuthError(new Error('invalid_grant'));
    expect(result?.code).toBe('invalid_grant');
    expect(result?.grantDead).toBe(true);
    expect(result?.requiresReauth).toBe(true);
  });

  it('يكتشف invalid_grant من جسم استجابة Google', () => {
    const result = classifyGoogleAuthError(gaxiosLike('invalid_grant', 'Token has been expired or revoked.'));
    expect(result?.grantDead).toBe(true);
  });

  it('يكتشف unauthorized_client كمنحة ميتة', () => {
    expect(classifyGoogleAuthError(gaxiosLike('unauthorized_client'))?.grantDead).toBe(true);
  });

  it('يكتشف access_denied كمنحة ميتة', () => {
    expect(classifyGoogleAuthError(new Error('فشل تفويض Google Drive: access_denied'))?.grantDead).toBe(true);
  });

  it('يكتشف الرمز حتى بعد لفّ الخطأ برسالة إعادة المحاولة العربية', () => {
    // `withRetry` يلفّ الخطأ الأصلي: «فشل بعد 3 محاولات: <الأصلي>».
    const wrapped = new Error('فشل بعد 3 محاولات: invalid_grant');
    expect(isGrantDeadError(wrapped)).toBe(true);
  });

  it('يصنّف GrantDeadError المُنشأ داخليًا (عدم تطابق عميل OAuth) كمنحة ميتة', () => {
    const err = new GrantDeadError('unauthorized_client', 'ربط الحساب أُنشئ بإعدادات مختلفة');
    expect(isGrantDeadError(err)).toBe(true);
  });
});

describe('classifyGoogleAuthError — ما لا يجوز اعتباره موت منحة', () => {
  it('invalid_client خطأ في حزمة التثبيت لا في الحساب — لا يقتل الربط', () => {
    const result = classifyGoogleAuthError(gaxiosLike('invalid_client'));
    expect(result?.code).toBe('invalid_client');
    expect(result?.grantDead).toBe(false);
    expect(result?.requiresReauth).toBe(false);
  });

  it('invalid_scope يطلب إعادة ربط لكنه ليس موت منحة', () => {
    const result = classifyGoogleAuthError(gaxiosLike('invalid_scope'));
    expect(result?.grantDead).toBe(false);
    expect(result?.requiresReauth).toBe(true);
  });

  it('خطأ الشبكة ليس خطأ مصادقة إطلاقًا', () => {
    const err = new Error('fetch failed');
    expect(classifyGoogleAuthError(err)).toBeNull();
    expect(isGrantDeadError(err)).toBe(false);
  });

  it('لا يُطابق الرمز كجزء من كلمة أطول', () => {
    // حماية من إيجابية كاذبة تقتل ربطًا سليمًا بلا سبب.
    expect(classifyGoogleAuthError(new Error('the request was not_invalid_granted anywhere'))).toBeNull();
  });

  it('القيم الفارغة لا تُصنَّف', () => {
    expect(classifyGoogleAuthError(null)).toBeNull();
    expect(classifyGoogleAuthError(undefined)).toBeNull();
    expect(classifyGoogleAuthError('')).toBeNull();
  });

  it('عند اجتماع رمزين يفوز الأخطر (موت المنحة)', () => {
    const err = gaxiosLike('invalid_request', 'invalid_grant: token revoked');
    expect(classifyGoogleAuthError(err)?.code).toBe('invalid_grant');
  });
});

describe('toUserFacingSyncError — لا رسائل خام للمستخدم', () => {
  it('يترجم invalid_grant إلى رسالة عربية تطمئن على البيانات المحلية', () => {
    const message = toUserFacingSyncError(gaxiosLike('invalid_grant'));
    expect(message).toContain('إعادة ربط');
    expect(message).toContain('بياناتك المحلية سليمة');
    expect(message).not.toContain('invalid_grant');
  });

  it('لا يُسرّب أي نصّ إنجليزي من Google في أي مسار خطأ مصادقة', () => {
    for (const code of ['invalid_grant', 'unauthorized_client', 'access_denied', 'invalid_client', 'invalid_scope']) {
      const message = toUserFacingSyncError(gaxiosLike(code, 'Some raw English detail from Google'));
      expect(message).not.toContain(code);
      expect(message).not.toContain('Some raw English detail');
    }
  });

  it('يترجم امتلاء مساحة Drive إلى رسالة إجراء واضحة', () => {
    const err = Object.assign(new Error('فشل رفع محتوى قاعدة البيانات: 403 {"reason":"storageQuotaExceeded"}'), {
      status: 403,
    });
    expect(toUserFacingSyncError(err)).toContain('مساحة Google Drive ممتلئة');
  });

  it('يميّز حدّ المعدّل (403) عن نقص الإذن (403)', () => {
    const rateLimited = Object.assign(new Error('403 {"reason":"userRateLimitExceeded"}'), { status: 403 });
    const forbidden = Object.assign(new Error('403 {"reason":"insufficientFilePermissions"}'), { status: 403 });
    expect(toUserFacingSyncError(rateLimited)).toContain('الحد المسموح');
    expect(toUserFacingSyncError(forbidden)).toContain('الإذن');
  });

  it('يترجم انتهاء المهلة إلى رسالة اتصال', () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    expect(toUserFacingSyncError(err)).toContain('المهلة الزمنية');
  });

  it('يترجم انقطاع الشبكة', () => {
    const err = new Error('fetch failed');
    expect(toUserFacingSyncError(err)).toContain('تعذّر الاتصال');
  });

  it('يمرّر رسائلنا العربية كما هي — هي أصلًا مكتوبة للمستخدم', () => {
    const message = 'فشل فحص سلامة الملف المُنزَّل: قاعدة تالفة';
    expect(toUserFacingSyncError(new Error(message))).toBe(message);
  });

  it('يُعيد رسالة عامة آمنة لأي خطأ إنجليزي غير معروف بدل عرضه', () => {
    const message = toUserFacingSyncError(new Error('ENOSPC: no space left on device, write'));
    expect(message).not.toContain('ENOSPC');
    expect(message).toContain('بياناتك المحلية سليمة');
  });

  it('يترجم 5xx إلى «الخدمة غير متاحة مؤقتًا»', () => {
    const err = Object.assign(new Error('503 backend error'), { status: 503 });
    expect(toUserFacingSyncError(err)).toContain('غير متاحة مؤقتًا');
  });
});
