/**
 * Legacy Print Preview Overlay — الجسر المشترك لنماذج `FormLayout`.
 *
 * نفس النمط المُصدَر في Quotation Legacy Preview Bridge v1، مستخرَجًا مرة واحدة بدل
 * تكراره في عشرة ملفات. **طبقة عرض فوق الطباعة القديمة، لا بديل عنها:**
 *
 *   زر الطباعة (يملكه FormLayout)
 *     → printIntercept({ proceed: doPrint, node })   ← يسلّمنا FormLayout مساره كقيمة
 *     → compose من **نفس العقدة التي تُطبع** (`.form-page`)
 *     → PrintPreviewDialog                            ← عرض فقط: لا IPC، لا نسخ، لا PrintJob
 *     → زر «طباعة» بداخله → إغلاق → proceed()
 *     → doPrint() القديم بحذافيره → … → webContents.print
 *
 * الاعتراض يقرّر **متى** تُنفَّذ الطباعة، لا **ماذا** تفعل. `proceed` هو `doPrint` نفسه —
 * نفس المرجع الدالّي، بلا تغليف ولا إعادة تنفيذ — فالجاهزية وعدد النسخ و`PrintJob`
 * والبوابة والطابعة كلها تبقى ملك `FormLayout` وحده.
 *
 * العلم مُطفأ ⇒ `printIntercept` يعود `undefined` والحوار لا يُصيَّر أصلًا، فيبقى الزر
 * على `onClick={doPrint}` كما كان تمامًا.
 */

import { ReactNode, useCallback, useRef, useState } from 'react';
import PrintPreviewDialog from './components/PrintPreviewDialog';
import { composeStyledFromNode } from './composeDocument';
import { getPageSpec } from './pageSpec';

export interface LegacyFormPreviewOptions {
  /** `isLegacyFormsPreviewEnabled(group)` — الرئيسي ومجموعة النموذج معًا. */
  enabled: boolean;
  /** عنوان المستند المُركَّب (لا يُطبع — عنوان الوثيقة فقط). */
  title: string;
  /** ما يظهر في شريط حالة المعاينة (اسم النموذج ورقمه). */
  documentLabel: string;
  lang?: 'ar' | 'en';
}

export interface LegacyFormPreview {
  /** يُمرَّر إلى `FormLayout`. `undefined` حين يكون العلم مطفأً — أي بلا وسيط إطلاقًا. */
  printIntercept?: (ctx: { proceed: () => void; node: HTMLElement | null }) => void;
  /** يُصيَّر **خارج** الـ printable root، فلا يدخل المستند المُركَّب أبدًا. */
  dialog: ReactNode;
}

export function useLegacyFormPreview({
  enabled,
  title,
  documentLabel,
  lang = 'ar',
}: LegacyFormPreviewOptions): LegacyFormPreview {
  const [open, setOpen] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);

  /**
   * مسار الطباعة القديم كما سلّمه `FormLayout` في هذه النقرة بالذات.
   * يُكتب فوقه في كل اعتراض جديد، فلا يبقى نداء قديم من فتحة سابقة.
   */
  const proceedRef = useRef<(() => void) | null>(null);

  const printIntercept = useCallback(
    ({ proceed, node: printedNode }: { proceed: () => void; node: HTMLElement | null }) => {
      proceedRef.current = proceed;
      setNode(printedNode);
      setOpen(true); // فتح فقط — لا طباعة هنا
    },
    [],
  );

  /**
   * مُركِّب واحد لكل النماذج: هي متجانسة فعلًا (`FormLayout` واحد، `.form-page` واحدة،
   * نفس ملفات الأنماط). لا مُركِّب لكل نموذج، ولا إعادة بناء للمستند من البيانات —
   * العقدة المطبوعة نفسها هي المصدر، فتعكس المعاينة الحالة الحالية على الشاشة (اللغة،
   * القالب، الورق الرسمي، البيانات، البنود، الملاحظات، التوقيع والختم).
   */
  const compose = useCallback((): string => {
    if (!node) throw new Error('تعذّر تجهيز النموذج للمعاينة.');
    return composeStyledFromNode({
      node,
      pageSpec: getPageSpec('a4-portrait'),
      title,
      lang,
      stripSelectors: ['.no-print'],
    });
  }, [node, title, lang]);

  /**
   * لا نمسح `proceedRef` عند الإغلاق: الحوار يغلق **ثم** يستدعي `onPrint` في الإطار
   * التالي (وإلا طُبعت نافذة المعاينة نفسها). مسحه هنا كان سيبتلع الطباعة.
   */
  const onPrint = useCallback(() => {
    proceedRef.current?.();
  }, []);

  return {
    printIntercept: enabled ? printIntercept : undefined,
    dialog: enabled ? (
      <PrintPreviewDialog
        open={open}
        onClose={() => setOpen(false)}
        compose={compose}
        onPrint={onPrint}
        documentLabel={documentLabel}
        lang={lang}
      />
    ) : null,
  };
}
