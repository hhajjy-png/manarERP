/**
 * Letter Engine — rules about the document's own content.
 *
 * Subject, body, typography and dates. Nothing here reads geometry or layout: these
 * findings are true regardless of how the letter happens to paginate, and keeping them
 * separate is what lets the runner skip the geometry rules when someone types in the
 * subject.
 */

import { findFont } from '../../../styles/fontRegistry';
import { blockText, isDocumentEmpty } from '../../editor/blockCommands';
import { getTypographyPresetSet } from '../../registry/typographyPresets';
import { getLetterFontPool } from '../../fonts/fontIntegration';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';

/** E1 — a letter cannot be issued without a subject. */
export const subjectRequiredRule: ValidationRuleImplementation = {
  ruleId: 'E1_subjectRequired',
  dependsOn: ['subject'],
  evaluate: (context) => {
    if (context.subject.trim().length > 0) return [];
    return [
      {
        ruleId: 'E1_subjectRequired',
        message: 'لا يمكن إصدار خطاب بلا موضوع.',
        suggestion: 'اكتب موضوع الخطاب في قسم «الموضوع».',
        location: { sectionKind: 'subject' },
      },
    ];
  },
};

/** E2 — nor without content. */
export const contentRequiredRule: ValidationRuleImplementation = {
  ruleId: 'E2_contentRequired',
  dependsOn: ['content'],
  evaluate: (context) => {
    if (!isDocumentEmpty(context.content)) return [];
    return [
      {
        ruleId: 'E2_contentRequired',
        message: 'لا يمكن إصدار خطاب بلا محتوى.',
        suggestion: 'اكتب نص الخطاب في قسم «المحتوى».',
        location: { sectionKind: 'content' },
      },
    ];
  },
};

/**
 * E3 — output requires a reference number.
 *
 * A draft is legitimately unnumbered, so this reports the state rather than scolding:
 * it tells the user what still stands between this letter and the press.
 */
export const referenceRequiredRule: ValidationRuleImplementation = {
  ruleId: 'E3_referenceRequiredForOutput',
  dependsOn: ['status'],
  evaluate: (context) => {
    if (context.reference) return [];
    return [
      {
        ruleId: 'E3_referenceRequiredForOutput',
        message: 'لم يُخصَّص رقم مرجعي بعد — لا يمكن طباعة خطاب غير مُسجَّل.',
        suggestion: 'أكمل الخطاب ثم سجّله لإصدار رقم مرجعي دائم.',
      },
    ];
  },
};

/**
 * E6 — every paragraph must name a font the registry resolves.
 *
 * A stored document can outlive a font: this catches the case where a letter written
 * under an older build references type this build no longer has.
 */
export const unknownFontRule: ValidationRuleImplementation = {
  ruleId: 'E6_unknownFontId',
  dependsOn: ['content', 'typography'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];
    for (const block of context.content.blocks) {
      if (findFont(block.attributes.fontId)) continue;
      findings.push({
        ruleId: 'E6_unknownFontId',
        message: `فقرة تستخدم خطًا غير معروف («${String(block.attributes.fontId)}») لا يملكه هذا الإصدار.`,
        suggestion: 'اختر خطًا من قائمة الخطوط الرسمية لهذه الفقرة.',
        location: { blockId: block.id, sectionKind: 'content' },
      });
    }
    return findings;
  },
};

/** E8 — the subject must stay within the template's line allowance. */
export const subjectLineCountRule: ValidationRuleImplementation = {
  ruleId: 'E8_subjectLineCount',
  dependsOn: ['subject'],
  evaluate: (context, params) => {
    const maximum = params.maxSubjectLines ?? Number.POSITIVE_INFINITY;
    const findings: ValidationFinding[] = [];

    if (context.subject.includes('\n')) {
      findings.push({
        ruleId: 'E8_subjectLineCount',
        message: 'الموضوع يحتوي على فاصل أسطر — يجب أن يكون نصًّا متصلًا.',
        suggestion: 'احذف فواصل الأسطر من الموضوع.',
        location: { sectionKind: 'subject' },
      });
    }
    if (context.subjectLineCount > maximum) {
      findings.push({
        ruleId: 'E8_subjectLineCount',
        message: `الموضوع يشغل ${context.subjectLineCount} أسطر، والحد الأقصى ${maximum}.`,
        suggestion: 'اختصر الموضوع.',
        location: { sectionKind: 'subject' },
      });
    }
    return findings;
  },
};

/** W2 — a subject long enough that the barcode payload would truncate it. */
export const subjectLengthAdvisoryRule: ValidationRuleImplementation = {
  ruleId: 'W2_subjectLengthAdvisory',
  dependsOn: ['subject'],
  evaluate: (context, params) => {
    const advisory = params.advisorySubjectChars ?? Number.POSITIVE_INFINITY;
    if (context.subject.length <= advisory) return [];
    return [
      {
        ruleId: 'W2_subjectLengthAdvisory',
        message: `الموضوع طويل (${context.subject.length} حرفًا).`,
        suggestion: 'الموضوعات الطويلة تُختصر داخل الباركود؛ يُفضَّل اختصاره.',
        location: { sectionKind: 'subject' },
      },
    ];
  },
};

/**
 * W3 — a paragraph set in a font outside the letter pool.
 *
 * Advisory rather than blocking: the letter will print, it will simply not look like
 * the rest of the company's correspondence.
 */
export const nonOfficialFontRule: ValidationRuleImplementation = {
  ruleId: 'W3_nonOfficialFontUsed',
  dependsOn: ['content', 'typography'],
  evaluate: (context) => {
    const pool = new Set(getLetterFontPool().map((font) => font.id));
    const offenders = context.content.blocks.filter(
      (block) => findFont(block.attributes.fontId) && !pool.has(block.attributes.fontId),
    );
    if (offenders.length === 0) return [];

    return offenders.map((block) => ({
      ruleId: 'W3_nonOfficialFontUsed' as const,
      message: `فقرة «${blockText(block).trim().slice(0, 30) || '(فارغة)'}» تستخدم خطًا خارج مجموعة الخطوط الرسمية.`,
      suggestion: 'استخدم أحد الخطوط الرسمية للحفاظ على اتساق المراسلات.',
      location: { blockId: block.id, sectionKind: 'content' },
    }));
  },
};

/**
 * W5 — a paragraph whose type deviates from the template's body preset.
 *
 * One finding for the document rather than one per paragraph: a letter deliberately
 * set in a larger face would otherwise produce a wall of identical warnings.
 */
export const typographyDeviationRule: ValidationRuleImplementation = {
  ruleId: 'W5_typographyDeviation',
  dependsOn: ['content', 'typography'],
  evaluate: (context) => {
    const body = getTypographyPresetSet(context.template.typographyPresetSetId).body;
    const deviating = context.content.blocks.filter(
      (block) => block.attributes.sizePt !== body.sizePt || block.attributes.fontId !== body.fontId,
    );
    if (deviating.length === 0) return [];

    return [
      {
        ruleId: 'W5_typographyDeviation',
        message: `${deviating.length} فقرة تختلف عن التنسيق الافتراضي للقالب (${body.sizePt} نقطة).`,
        suggestion: 'استخدم «إزالة التنسيق» لإعادة الفقرات إلى تنسيق القالب إن لم يكن الاختلاف مقصودًا.',
        location: { blockId: deviating[0].id, sectionKind: 'content' },
      },
    ];
  },
};

/** W6 — a date far in the past, or any date in the future. */
export const issueDateRangeRule: ValidationRuleImplementation = {
  ruleId: 'W6_issueDateOutOfRange',
  dependsOn: ['issueDate'],
  evaluate: (context, params) => {
    const backdateDays = params.backdateWarnDays ?? Number.POSITIVE_INFINITY;
    if (!context.issueDate) return [];

    const issued = new Date(context.issueDate);
    if (Number.isNaN(issued.getTime())) {
      return [
        {
          ruleId: 'W6_issueDateOutOfRange',
          message: 'تاريخ الخطاب غير صالح.',
          suggestion: 'اختر تاريخًا صحيحًا.',
          location: { sectionKind: 'date' },
        },
      ];
    }

    const days = Math.floor((context.now.getTime() - issued.getTime()) / 86_400_000);
    if (days < 0) {
      return [
        {
          ruleId: 'W6_issueDateOutOfRange',
          message: 'تاريخ الخطاب في المستقبل.',
          // Deliberate post-dating is legitimate; the point is that it be deliberate.
          suggestion: 'تأكّد من أن التأريخ المستقبلي مقصود.',
          location: { sectionKind: 'date' },
        },
      ];
    }
    if (days > backdateDays) {
      return [
        {
          ruleId: 'W6_issueDateOutOfRange',
          message: `تاريخ الخطاب أقدم من اليوم بـ ${days} يومًا.`,
          suggestion: 'التأريخ الرجعي مشروع، لكن يُفضَّل أن يكون مقصودًا.',
          location: { sectionKind: 'date' },
        },
      ];
    }
    return [];
  },
};

/** Every content rule, for registration. */
export const DOCUMENT_RULES: readonly ValidationRuleImplementation[] = [
  subjectRequiredRule,
  contentRequiredRule,
  referenceRequiredRule,
  unknownFontRule,
  subjectLineCountRule,
  subjectLengthAdvisoryRule,
  nonOfficialFontRule,
  typographyDeviationRule,
  issueDateRangeRule,
];
