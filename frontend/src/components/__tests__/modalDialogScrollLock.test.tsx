// @vitest-environment jsdom
/**
 * انحدار: تسريب قفل التمرير عند تكديس `Dialog` فوق `Modal`.
 *
 * السيناريو الحقيقي (`pages/CreateInvoice.tsx`): نافذة «فاتورة جديدة» (`Modal`)
 * وفوقها حوار التأكيد (`Dialog` بـ`elevated`). عند نجاح الحفظ يُستدعى
 * `setConfirming(false)` و`onClose()` في نفس الـtick، فيُفرَّغ الأب كله ويُنظَّف
 * الشقيقان في نفس دورة الالتزام بترتيب المستند:
 *
 *     Modal.cleanup  → كان يكتب ''         ← يفكّ القفل
 *     Dialog.cleanup → كان يعيد لقطته 'hidden'  ← يُعيد قفله. آخر كاتب يفوز.
 *
 * فتبقى `body.style.overflow = 'hidden'` بلا نافذة على الشاشة، ولا شيء في النظام
 * يعيد ضبطها ⇒ أسفل كل صفحة يصبح غير قابل للوصول حتى إعادة تحميل التطبيق.
 *
 * هذه الاختبارات تُشغّل المكوّنين الحقيقيين (لا محاكاة) بنفس التكديس والتفريغ.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StrictMode, useState } from 'react';
import { render, act } from '@testing-library/react';
import { readFileSync } from 'fs';
import Modal from '../Modal';
import { Dialog } from '../explorer/ExplorerKit';
import { activeScrollLocks, __resetScrollLockForTests } from '../../lib/scrollLock';

beforeEach(() => {
  __resetScrollLockForTests();
  document.body.style.overflow = '';
});

const noop = () => {};

/** نفس شكل `CreateInvoice`: `Modal` وشقيقه `Dialog` المشروط داخل Fragment واحد. */
function InvoiceLikeForm({ open, confirming }: { open: boolean; confirming: boolean }) {
  if (!open) return null;
  return (
    <>
      <Modal title="فاتورة جديدة" onClose={noop}>
        <p>حقول الفاتورة</p>
      </Modal>
      {confirming && (
        <Dialog title="تأكيد الفاتورة" onClose={noop} elevated>
          <p>مراجعة</p>
        </Dialog>
      )}
    </>
  );
}

describe('تكديس Modal + Dialog — قفل التمرير', () => {
  it('إغلاق الطبقتين معًا بعد نجاح الحفظ لا يترك overflow=hidden', () => {
    // Arrange — النافذة مفتوحة وحوار التأكيد فوقها (لحظة الضغط على «حفظ»).
    const { rerender } = render(<InvoiceLikeForm open confirming />);
    expect(document.body.style.overflow).toBe('hidden');
    expect(activeScrollLocks()).toBe(2);

    // Act — نجاح الحفظ: setConfirming(false) + onClose() في نفس الـtick.
    act(() => {
      rerender(<InvoiceLikeForm open={false} confirming={false} />);
    });

    // Assert — لا قفل متبقٍّ، والتمرير عاد فعليًا.
    expect(activeScrollLocks()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('إغلاق حوار التأكيد وحده (إلغاء) يُبقي القفل ما دامت النافذة مفتوحة', () => {
    const { rerender } = render(<InvoiceLikeForm open confirming />);
    expect(activeScrollLocks()).toBe(2);

    // إلغاء التأكيد — النافذة تبقى مفتوحة.
    act(() => {
      rerender(<InvoiceLikeForm open confirming={false} />);
    });

    expect(activeScrollLocks()).toBe(1);
    expect(document.body.style.overflow).toBe('hidden');

    // ثم إغلاق النافذة نفسها.
    act(() => {
      rerender(<InvoiceLikeForm open={false} confirming={false} />);
    });
    expect(activeScrollLocks()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('يستعيد قيمة overflow الأصلية غير الفارغة بعد إغلاق الطبقتين', () => {
    document.body.style.overflow = 'auto';

    const { rerender } = render(<InvoiceLikeForm open confirming />);
    expect(document.body.style.overflow).toBe('hidden');

    act(() => {
      rerender(<InvoiceLikeForm open={false} confirming={false} />);
    });

    expect(document.body.style.overflow).toBe('auto');
  });

  it('تفريغ الشجرة كاملةً (unmount) لا يترك قفلًا', () => {
    const { unmount } = render(<InvoiceLikeForm open confirming />);
    expect(activeScrollLocks()).toBe(2);

    act(() => { unmount(); });

    expect(activeScrollLocks()).toBe(0);
    expect(document.body.style.overflow).toBe('');
  });

  it('تحت StrictMode (تشغيل مزدوج للتأثيرات) النتيجة نفسها', () => {
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <>
          {/* testid — لا نص: أيقونة إغلاق `Dialog` تُصيّر النص "close" أيضًا. */}
          <button data-testid="close-form" onClick={() => setOpen(false)}>إغلاق النموذج</button>
          <InvoiceLikeForm open={open} confirming={open} />
        </>
      );
    }

    const { getByTestId, unmount } = render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    expect(document.body.style.overflow).toBe('hidden');

    act(() => { getByTestId('close-form').click(); });

    expect(activeScrollLocks()).toBe(0);
    expect(document.body.style.overflow).toBe('');

    act(() => { unmount(); });
    expect(document.body.style.overflow).toBe('');
  });
});

describe('حراسة البنية — المصدر', () => {
  it('CreateInvoice ما زال يُكدّس Dialog فوق Modal (يُبقي هذا الانحدار ذا معنى)', () => {
    const src = readFileSync('src/pages/CreateInvoice.tsx', 'utf8');
    expect(src).toContain('<Modal');
    expect(src).toContain('<Dialog');
    expect(src).toContain('elevated');
  });

  it('لا سطح حاجب يكتب body.style.overflow مباشرة بعد الآن', () => {
    for (const file of [
      'src/components/Modal.tsx',
      'src/components/explorer/ExplorerKit.tsx',
      'src/printing/components/PrintPreviewDialog.tsx',
    ]) {
      const src = readFileSync(file, 'utf8');
      // الإشارة الوحيدة المسموح بها هي داخل تعليق يشرح سبب الانتقال.
      const codeOnly = src
        .split('\n')
        .filter((l) => !l.trimStart().startsWith('//') && !l.trimStart().startsWith('*'))
        .join('\n');
      expect(codeOnly).not.toContain('document.body.style.overflow');
      expect(codeOnly).toContain('lockScroll');
      expect(codeOnly).toContain('unlockScroll');
    }
  });
});
