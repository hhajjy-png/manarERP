/**
 * المعاينة الدقيقة (True Chromium WYSIWYG) — الجسر المشترك لبقية النماذج.
 *
 * **إضافة فقط.** لا يستبدل معاينة، ولا يحذف مسارًا، ولا يبني محرّك طباعة. يعطي النموذج
 * شيئين ويكتفي:
 *
 *   button  → زر «📄 معاينة دقيقة» يوضع بجوار الأزرار القائمة (لا يزيح شيئًا).
 *   dialog  → حوار المعاينة نفسه الذي تستخدمه الفاتورة (`WysiwygPreviewPocDialog`).
 *
 * **مصدر المستند هو نفسه لا نسخة منه.** نُركّب من **العقدة المطبوعة ذاتها** عبر
 * `composeStyledFromNode` — نفس المُركِّب ونفس `PageSpec` اللذين تستخدمهما المعاينة
 * القديمة (`useLegacyFormPreview`). لا HTML بديل، ولا قالب معاينة، ولا إعادة كتابة
 * للنموذج في React، ولا تكرار لمنطق الإجماليات، ولا CSS مختلف.
 *
 * **الطباعة لا تُمسّ.** زر «طباعة» داخل الحوار يغلقه ثم يستدعي `onPrint` — وهو **نفس**
 * دالة الطباعة القديمة التي يملكها النموذج (`FormLayout.doPrint` أو `printCurrentView`)،
 * تُمرَّر بمرجعها بلا تغليف ولا إعادة تنفيذ. لا محرّك جديد، ولا طباعة مزدوجة، ولا تغيير
 * في معاملات الطابعة أو الهوامش أو الاتجاه أو حجم الورق.
 *
 * **العلم مطفأ ⇒ لا شيء إطلاقًا.** لا زر يُصيَّر، ولا حوار يُركَّب، ولا استماع. النموذج
 * يعود إلى حالته السابقة حرفًا بحرف.
 *
 * **فشل المعاينة لا يمنع الطباعة**: الحوار يعرض خطأ ويُغلق، والنموذج وزر طباعته سليمان.
 */

import { ReactNode, useCallback, useState } from 'react';
import WysiwygPreviewPocDialog from './components/WysiwygPreviewPocDialog';
import { composeStyledFromNode } from './composeDocument';
import { getPageSpec } from './pageSpec';
import type { PageSpecId } from './types';

export interface AccurateFormPreviewOptions {
  /** `isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1)` — يقرّره النموذج. */
  enabled: boolean;
  /** العقدة المطبوعة **نفسها** التي يطبعها المسار القديم. تُقرأ لحظة الفتح. */
  getNode?: () => HTMLElement | null;
  /**
   * مُركِّب المستند **الجاهز** للنموذج، إن كان يملك واحدًا (عرض السعر، سند القبض).
   * يُعاد استخدامه كما هو — بمقاس صفحته ومُركِّبه — فيبقى مصدر المستند واحدًا لا نسخة
   * منه. حين يُمرَّر، يُتجاهل `getNode` تمامًا.
   */
  compose?: () => string;
  /**
   * دالة الطباعة القديمة للنموذج — تُمرَّر بمرجعها. الحوار يستدعيها كما هي.
   * إن أُغفلت، لا يُعرض زر طباعة داخل الحوار (معاينة فقط).
   */
  onPrint?: () => void;
  /** عنوان المستند المُركَّب (لا يُطبع). */
  title: string;
  /** ما يظهر في شريط حالة المعاينة. */
  documentLabel?: string;
  lang?: 'ar' | 'en';
  /** مقاس الصفحة — نفس المقاس الذي يستخدمه المسار القديم للنموذج. */
  pageSpecId?: PageSpecId;
  /** فتح المعاينة القديمة عند فشل التوليد — إن كانت للنموذج معاينة قديمة. */
  onFallback?: () => void;
}

export interface AccurateFormPreview {
  /** يُوضع في شريط الأدوات بجوار الأزرار القائمة. `null` حين يكون العلم مطفأً. */
  button: ReactNode;
  /** يُصيَّر **خارج** الـ printable root، فلا يدخل المستند المُركَّب أبدًا. */
  dialog: ReactNode;
}

export function useAccurateFormPreview({
  enabled,
  getNode,
  compose: composeProvided,
  onPrint,
  title,
  documentLabel,
  lang = 'ar',
  pageSpecId = 'a4-portrait',
  onFallback,
}: AccurateFormPreviewOptions): AccurateFormPreview {
  const [open, setOpen] = useState(false);

  /**
   * نفس مُركِّب المعاينة القديمة، على نفس العقدة، بنفس `PageSpec` و`stripSelectors`.
   * فما يُعرض هو ما يُطبع — لا تقريب، ولا محاكاة فواصل صفحات (Chromium يقرّرها).
   */
  const composeDefault = useCallback((): string => {
    const node = getNode?.() ?? null;
    if (!node) throw new Error('تعذّر تجهيز النموذج للمعاينة.');
    return composeStyledFromNode({
      node,
      pageSpec: getPageSpec(pageSpecId),
      title,
      lang,
      stripSelectors: ['.no-print'],
    });
  }, [getNode, title, lang, pageSpecId]);

  // مُركِّب النموذج الجاهز يفوز دائمًا — هو مصدر المستند الذي يطبعه المسار القديم.
  const compose = composeProvided ?? composeDefault;

  if (!enabled) {
    return { button: null, dialog: null };
  }

  return {
    button: (
      <button
        type="button"
        className="btn secondary"
        onClick={() => setOpen(true)}
        title="معاينة دقيقة — الصفحات وفواصلها كما ستخرج من الطابعة تمامًا. الطباعة تبقى على المسار الأصلي."
      >
        📄 معاينة دقيقة
      </button>
    ),
    dialog: (
      <WysiwygPreviewPocDialog
        open={open}
        onClose={() => setOpen(false)}
        compose={compose}
        onPrint={() => onPrint?.()}
        onFallback={onFallback}
        documentLabel={documentLabel ?? title}
      />
    ),
  };
}
