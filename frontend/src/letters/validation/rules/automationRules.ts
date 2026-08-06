/**
 * Letter Engine — automation rules (Professional Document Automation v1).
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  AN UNRESOLVED VARIABLE MUST NOT REACH PAPER. THAT IS THE WHOLE POINT.
 * ══════════════════════════════════════════════════════════════════════════
 * A variables engine without E18 is worse than no variables engine at all: it turns a
 * feature that saves typing into a mechanism for posting an official letter that reads
 * "المحترم {{Employee}}". The token is visible on screen precisely so the author can
 * see the question; the blocking rule is what guarantees the question is answered
 * before the letter is issued.
 *
 * The severities are chosen along one line — CAN THE ENGINE TELL THIS IS WRONG?
 *
 *   · blocking — an unresolved variable, an unknown variable. The engine knows for
 *     certain the output is broken, and no author intends it.
 *   · warning  — a missing recipient, a missing signature. Both are legitimate: an
 *     internal notice may name no addressee, and an official letter is often issued
 *     for wet-ink signature. The engine must not decide these for the author.
 *
 * That line is why "missing signature" is NOT blocking here, even though the spec's
 * Smart Validation list mentions it: `W4_signatureAssetMissing` already reports an
 * UNRESOLVABLE selection as a warning, and refusing to print an unsigned letter would
 * break a workflow the module was built to support.
 */

import { documentVariableNames } from '../../editor/blockCommands';
import { validateCondition } from '../../variables/conditions';
import { unknownTokenNames } from '../../variables/variableSyntax';
import { blockText } from '../../editor/blockCommands';
import { findVariable } from '../../variables/variableCatalog';
import { type ValidationFinding, type ValidationRuleImplementation } from '../framework';

/**
 * E18 — every variable the document uses must have a value.
 *
 * Reads `resolvedVariables` from the context rather than resolving here, so the rule
 * judges EXACTLY the map the renderer painted with. A rule that resolved
 * independently could pass a letter the page had rendered with a hole in it, which is
 * the class of divergence the single-renderer discipline exists to prevent.
 */
export const unresolvedVariableRule: ValidationRuleImplementation = {
  ruleId: 'E18_unresolvedVariable',
  dependsOn: ['content', 'status'],
  evaluate: (context) => {
    const resolved = context.resolvedVariables ?? {};
    const used = documentVariableNames(context.content);
    const findings: ValidationFinding[] = [];

    for (const name of used) {
      const descriptor = findVariable(name);
      // An unknown name is E19's business, not this rule's — reporting it twice would
      // make one mistake look like two.
      if (!descriptor) continue;

      const value = resolved[name];
      if (value !== undefined && value !== null && value !== '') continue;

      const because =
        descriptor.requires === 'none'
          ? 'لا توجد قيمة له في إعدادات النظام أو في بيانات الخطاب.'
          : `يحتاج ربط الخطاب بـ${descriptor.requires === 'employee' ? 'موظف' : descriptor.requires === 'contract' ? 'عقد' : 'مشروع'}.`;

      findings.push({
        ruleId: 'E18_unresolvedVariable',
        message: `المتغيّر «${descriptor.labelAr}» ({{${name}}}) مستخدَم في الخطاب بلا قيمة — ${because}`,
        suggestion:
          descriptor.requires === 'none'
            ? 'أكمل البيانات الناقصة، أو احذف المتغيّر من نص الخطاب.'
            : 'اختر السجل المرتبط من لوحة المتغيّرات، أو احذف المتغيّر من نص الخطاب.',
        location: { sectionKind: 'content' },
      });
    }

    return findings;
  },
};

/**
 * E19 — a token naming a variable the catalogue does not declare.
 *
 * Separate from E18 because the fix is different: an unresolved variable needs data, an
 * unknown one needs the text corrected. Reporting both as "unresolved" would send the
 * author looking for a record that was never the problem.
 *
 * Scans the raw text rather than the resolved map, because an unknown name never
 * enters the map at all.
 */
export const unknownVariableRule: ValidationRuleImplementation = {
  ruleId: 'E19_unknownVariable',
  dependsOn: ['content'],
  evaluate: (context) => {
    const seen = new Set<string>();
    const findings: ValidationFinding[] = [];

    const scan = (text: string, blockId?: string) => {
      for (const name of unknownTokenNames(text)) {
        if (seen.has(name)) continue;
        seen.add(name);
        findings.push({
          ruleId: 'E19_unknownVariable',
          message: `النص يحتوي على «{{${name}}}» وهو ليس متغيّرًا معروفًا — سيُطبع كما هو.`,
          suggestion: 'اختر متغيّرًا من لوحة المتغيّرات، أو صحّح الاسم، أو احذف الأقواس.',
          location: blockId ? { blockId, sectionKind: 'content' } : { sectionKind: 'subject' },
        });
      }
    };

    for (const block of context.content.blocks) scan(blockText(block), block.id);
    scan(context.subject);
    scan(context.recipient.name);
    scan(context.recipient.title);
    scan(context.recipient.organisation);

    for (const object of context.content.layout?.objects ?? []) {
      if (object.payload.kind === 'textBlock') scan(object.payload.text.text);
      if (object.payload.kind === 'table') object.payload.table.cells.forEach((cell) => scan(cell));
    }

    return findings;
  },
};

/**
 * E20 — a condition that cannot be evaluated.
 *
 * Blocking, unlike the two above, for a reason worth stating: a broken condition
 * renders its content (see `variables/conditions` — every failure path is permissive),
 * so the letter LOOKS right while the rule the author wrote is being ignored. A silent
 * wrong answer is more dangerous than a visible hole, which is why this one refuses
 * the print even though nothing appears to be missing.
 */
export const brokenConditionRule: ValidationRuleImplementation = {
  ruleId: 'E20_brokenCondition',
  dependsOn: ['content'],
  evaluate: (context) => {
    const findings: ValidationFinding[] = [];

    context.content.blocks.forEach((block, index) => {
      for (const problem of validateCondition(block.attributes.condition, `شرط الفقرة ${index + 1}`)) {
        findings.push({
          ruleId: 'E20_brokenCondition',
          message: problem,
          suggestion: 'صحّح الشرط من محرّر الشروط، أو احذفه ليظهر المحتوى دائمًا.',
          location: { blockId: block.id, sectionKind: 'content' },
        });
      }
    });

    return findings;
  },
};

/**
 * W11 — no addressee.
 *
 * ADVISORY, deliberately. An internal notice, a circular and a general announcement
 * are all legitimately unaddressed, and the recipient section is declared
 * `required: false` in the template's own section specs. Blocking here would refuse to
 * print a document the template says is complete — the engine contradicting its own
 * registry.
 */
export const missingRecipientRule: ValidationRuleImplementation = {
  ruleId: 'W11_recipientMissing',
  dependsOn: ['recipient'],
  evaluate: (context) => {
    const named = [context.recipient.name, context.recipient.title, context.recipient.organisation]
      .some((field) => field.trim().length > 0);
    if (named) return [];

    return [
      {
        ruleId: 'W11_recipientMissing',
        message: 'لم تُحدَّد الجهة المرسل إليها.',
        suggestion: 'أضف الاسم أو الجهة، أو تجاهل هذا التنبيه إن كان الخطاب تعميمًا.',
        location: { sectionKind: 'recipient' },
      },
    ];
  },
};

/**
 * W12 — a variable binding that no longer resolves to a record.
 *
 * The letter names employee 42 and employee 42 has been deleted. Advisory rather than
 * blocking because E18 already refuses the print for every variable that consequently
 * has no value — this exists to name the CAUSE, so the author fixes the binding once
 * instead of chasing six unresolved variables.
 */
export const brokenBindingRule: ValidationRuleImplementation = {
  ruleId: 'W12_bindingUnresolved',
  dependsOn: ['content', 'status'],
  evaluate: (context) => {
    const bindings = context.content.bindings;
    if (!bindings) return [];

    const findings: ValidationFinding[] = [];
    const unresolved = context.unresolvedBindings ?? [];

    for (const kind of unresolved) {
      const label = kind === 'employee' ? 'الموظف' : kind === 'contract' ? 'العقد' : 'المشروع';
      findings.push({
        ruleId: 'W12_bindingUnresolved',
        message: `الخطاب مرتبط بسجل ${label} لم يعد موجودًا أو تعذّر تحميله.`,
        suggestion: 'أعد اختيار السجل من لوحة المتغيّرات.',
      });
    }

    return findings;
  },
};

export const AUTOMATION_RULES: readonly ValidationRuleImplementation[] = [
  unresolvedVariableRule,
  unknownVariableRule,
  brokenConditionRule,
  missingRecipientRule,
  brokenBindingRule,
];
