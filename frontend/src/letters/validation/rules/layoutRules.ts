/**
 * Letter Engine — rules derived from the page layout.
 *
 * Everything here reads the paginator's own result rather than re-deriving a layout.
 * That is deliberate: a rule that computed its own page breaks could disagree with the
 * pages the user is looking at, and a validation panel that describes a different
 * document than the screen is worse than no panel.
 */

import { usableBandMm } from '../../registry/geometryRegistry';
import { pageIndexOfItem } from '../../pagination/paginate';
import { blockText } from '../../editor/blockCommands';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';

function mm(value: number): string {
  return `${Math.round(value * 10) / 10} مم`;
}

/** A short, recognisable excerpt so the user can find the paragraph being described. */
function excerpt(text: string, limit = 40): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `${trimmed.slice(0, limit)}…`;
}

/**
 * E14 — a single paragraph taller than one page's printable area.
 *
 * NEVER SPLIT, NEVER AUTO-CORRECTED. The paginator places such an item anyway (there is
 * nowhere it fits, and refusing would loop forever) and reports it; this rule turns
 * that report into a blocking finding the user must resolve by editing the text.
 */
export const oversizedParagraphRule: ValidationRuleImplementation = {
  ruleId: 'E14_oversizedParagraph',
  dependsOn: ['pagination', 'content', 'geometry'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    for (const itemId of context.pagination.overflowingItemIds) {
      const pageIndex = Math.max(0, pageIndexOfItem(context.pagination, itemId));
      const band = usableBandMm(context.geometry, pageIndex);
      const height = context.itemHeightsMm[itemId] ?? 0;
      const block = context.content.blocks.find((b) => b.id === itemId);

      findings.push({
        ruleId: 'E14_oversizedParagraph',
        message: block
          ? `الفقرة «${excerpt(blockText(block))}» أطول من منطقة الكتابة في صفحة كاملة (${mm(height)} مقابل ${mm(band)} متاحة).`
          : `أحد عناصر المستند أطول من منطقة الكتابة في صفحة كاملة (${mm(height)} مقابل ${mm(band)} متاحة).`,
        // No auto-fix is offered, and that is the point: the engine does not decide
        // where an official letter's sentence should break.
        suggestion: 'قسّم الفقرة إلى فقرتين أو أكثر — لا يقسّمها المحرّك تلقائيًا.',
        location: { pageIndex, blockId: block?.id, sectionKind: 'content' },
      });
    }
    return findings;
  },
};

/**
 * E5 — the signature block must not be stranded.
 *
 * A final page carrying nothing but a signature reads as a separate document. The
 * threshold is a template parameter rather than a constant here, so a future document
 * type can require more or fewer lines beside its signature.
 */
export const signatureOrphanRule: ValidationRuleImplementation = {
  ruleId: 'E5_signatureBlockOrphan',
  dependsOn: ['pagination', 'content'],
  evaluate: (context, params) => {
    const minimum = params.minContentLinesWithSignature ?? 0;
    const lastPage = context.pagination.pages[context.pagination.pages.length - 1];
    if (!lastPage || context.pagination.pages.length < 2) return [];

    const contentIds = new Set(context.content.blocks.map((b) => b.id));
    const contentOnLastPage = lastPage.itemIds.filter((id) => contentIds.has(id)).length;
    if (contentOnLastPage >= minimum) return [];

    return [
      {
        ruleId: 'E5_signatureBlockOrphan',
        message: `الصفحة الأخيرة تحمل ${contentOnLastPage} فقرة فقط مع كتلة التوقيع، والحد الأدنى ${minimum}.`,
        suggestion: 'أضِف أو انقل فقرة إلى الصفحة الأخيرة حتى لا تُطبع كتلة التوقيع وحدها.',
        location: { pageIndex: lastPage.pageIndex, sectionKind: 'signature' },
      },
    ];
  },
};

/**
 * E15 — the signature and barcode belong together on the final page.
 *
 * They authorise the document as a whole; on an earlier page they would authorise a
 * fragment of it. Placement only — nothing here renders either of them.
 */
export const reservedElementPlacementRule: ValidationRuleImplementation = {
  ruleId: 'E15_reservedElementPlacement',
  dependsOn: ['pagination'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    const lastIndex = context.pagination.pages.length - 1;

    for (const itemId of ['signature', 'barcode'] as const) {
      const pageIndex = pageIndexOfItem(context.pagination, itemId);
      if (pageIndex === -1) {
        findings.push({
          ruleId: 'E15_reservedElementPlacement',
          message: itemId === 'signature'
            ? 'كتلة التوقيع غير موجودة في تخطيط المستند.'
            : 'كتلة الباركود غير موجودة في تخطيط المستند.',
          suggestion: 'أعِد فتح الخطاب؛ يبدو أن تخطيط المستند غير مكتمل.',
          location: { sectionKind: itemId },
        });
        continue;
      }
      if (pageIndex !== lastIndex) {
        findings.push({
          ruleId: 'E15_reservedElementPlacement',
          message: `${itemId === 'signature' ? 'كتلة التوقيع' : 'كتلة الباركود'} في الصفحة ${pageIndex + 1} بينما يجب أن تكون في الصفحة الأخيرة (${lastIndex + 1}).`,
          suggestion: 'قصِّر المحتوى أو أعِد ترتيبه حتى تعود العناصر المحجوزة إلى الصفحة الأخيرة.',
          location: { pageIndex, sectionKind: itemId },
        });
      }
    }

    // Order matters as much as page: the barcode sits after the signature.
    const signaturePage = pageIndexOfItem(context.pagination, 'signature');
    const barcodePage = pageIndexOfItem(context.pagination, 'barcode');
    if (signaturePage !== -1 && barcodePage !== -1 && barcodePage < signaturePage) {
      findings.push({
        ruleId: 'E15_reservedElementPlacement',
        message: 'الباركود يسبق التوقيع في ترتيب المستند.',
        suggestion: 'يجب أن يلي الباركودُ التوقيعَ في نهاية الخطاب.',
        location: { pageIndex: barcodePage, sectionKind: 'barcode' },
      });
    }
    return findings;
  },
};

/** E10 — the document must not exceed the template's hard page cap. */
export const pageCapRule: ValidationRuleImplementation = {
  ruleId: 'E10_pageCapExceeded',
  dependsOn: ['pagination'],
  evaluate: (context, params) => {
    const cap = params.maxPages ?? Number.POSITIVE_INFINITY;
    if (context.pagination.pageCount <= cap) return [];
    return [
      {
        ruleId: 'E10_pageCapExceeded',
        message: `الخطاب يقع في ${context.pagination.pageCount} صفحة، والحد الأقصى لهذا النوع ${cap}.`,
        suggestion: 'قصِّر المحتوى أو وزّعه على أكثر من خطاب.',
        location: { pageIndex: context.pagination.pageCount - 1 },
      },
    ];
  },
};

/** W1 — an advisory when a letter grows long. Never a defect. */
export const pageCountAdvisoryRule: ValidationRuleImplementation = {
  ruleId: 'W1_pageCountAdvisory',
  dependsOn: ['pagination'],
  evaluate: (context, params) => {
    const advisory = params.advisoryPageCount ?? Number.POSITIVE_INFINITY;
    if (context.pagination.pageCount <= advisory) return [];
    return [
      {
        ruleId: 'W1_pageCountAdvisory',
        message: `الخطاب يقع في ${context.pagination.pageCount} صفحات.`,
        suggestion: 'الخطابات الرسمية عادةً أقصر؛ راجع إن كان بالإمكان اختصاره.',
      },
    ];
  },
};

/**
 * W8 — the last page is nearly full.
 *
 * Worth saying because it is fragile: a small font-rendering difference on another
 * machine could tip it past the band, turning a clean letter into an overlap.
 */
export const lastPageNearlyFullRule: ValidationRuleImplementation = {
  ruleId: 'W8_lastPageNearlyFull',
  dependsOn: ['pagination', 'geometry'],
  evaluate: (context, params) => {
    const threshold = params.nearlyFullPercent ?? 100;
    const lastPage = context.pagination.pages[context.pagination.pages.length - 1];
    if (!lastPage) return [];

    const available = usableBandMm(context.geometry, lastPage.pageIndex);
    if (available <= 0) return [];
    const percent = (lastPage.usedMm / available) * 100;
    if (percent < threshold || percent > 100) return [];

    return [
      {
        ruleId: 'W8_lastPageNearlyFull',
        message: `الصفحة الأخيرة ممتلئة بنسبة ${Math.round(percent)}% من منطقة الكتابة.`,
        suggestion: 'فرق بسيط في تصيير الخط على جهاز آخر قد يدفع المحتوى خارج الحدود — يُفضَّل ترك هامش.',
        location: { pageIndex: lastPage.pageIndex },
      },
    ];
  },
};

/** I1 — how many sheets the letter occupies. A fact, never a problem. */
export const documentPageCountRule: ValidationRuleImplementation = {
  ruleId: 'I1_documentPageCount',
  dependsOn: ['pagination'],
  evaluate: (context) => [
    {
      ruleId: 'I1_documentPageCount',
      message:
        context.pagination.pageCount === 1
          ? 'الخطاب يقع في صفحة واحدة.'
          : `الخطاب يقع في ${context.pagination.pageCount} صفحات.`,
    },
  ],
};
