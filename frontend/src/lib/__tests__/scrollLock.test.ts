// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import {
  lockScroll,
  unlockScroll,
  activeScrollLocks,
  __resetScrollLockForTests,
} from '../scrollLock';

beforeEach(() => {
  __resetScrollLockForTests();
  document.body.style.overflow = '';
});

describe('scrollLock — العدّاد المرجعي', () => {
  it('قفل واحد يضع hidden، وفكّه يعيد الحالة الأصلية', () => {
    // Arrange
    expect(document.body.style.overflow).toBe('');

    // Act
    lockScroll();

    // Assert
    expect(document.body.style.overflow).toBe('hidden');
    expect(activeScrollLocks()).toBe(1);

    unlockScroll();
    expect(document.body.style.overflow).toBe('');
    expect(activeScrollLocks()).toBe(0);
  });

  it('قفلان متداخلان: فكّ أحدهما لا يفتح التمرير', () => {
    lockScroll();
    lockScroll();
    expect(activeScrollLocks()).toBe(2);
    expect(document.body.style.overflow).toBe('hidden');

    unlockScroll();

    // ما زال سطح واحد مفتوحًا ⇒ القفل باقٍ.
    expect(activeScrollLocks()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('فكّ آخر قفل يستعيد قيمة overflow الأصلية غير الفارغة', () => {
    // قيمة أصلية حقيقية (لا سلسلة فارغة) — تُثبت أننا نستعيد لا نمسح.
    document.body.style.overflow = 'auto';

    lockScroll();
    lockScroll();
    expect(document.body.style.overflow).toBe('hidden');

    unlockScroll();
    expect(document.body.style.overflow).toBe('hidden');

    unlockScroll();
    expect(document.body.style.overflow).toBe('auto');
    expect(activeScrollLocks()).toBe(0);
  });

  it('ترتيب الفكّ لا يهم — نفس النتيجة عند العكس أو التشابك', () => {
    document.body.style.overflow = 'auto';

    lockScroll();  // A
    lockScroll();  // B
    lockScroll();  // C
    unlockScroll(); // A قبل C — ترتيب معكوس عمدًا
    unlockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll();

    expect(document.body.style.overflow).toBe('auto');
    expect(activeScrollLocks()).toBe(0);
  });

  it('فكّ غير متوازن يُتجاهَل ولا يدفع العدّاد إلى السالب', () => {
    unlockScroll();
    unlockScroll();
    expect(activeScrollLocks()).toBe(0);

    // القفل التالي يجب أن يعمل من أول نداء.
    lockScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.body.style.overflow).toBe('');
  });

  it('دورة StrictMode (تشغيل/تنظيف/تشغيل) لا تلتقط hidden كقيمة أصلية', () => {
    document.body.style.overflow = 'auto';

    lockScroll();   // التشغيل الأول
    unlockScroll(); // تنظيف StrictMode
    lockScroll();   // إعادة التشغيل

    expect(document.body.style.overflow).toBe('hidden');
    unlockScroll();
    expect(document.body.style.overflow).toBe('auto');
  });
});
