/**
 * Document Template Registry — integrity.
 *
 * Carries two invariants directly:
 *
 *  · INV-10 — "Official Letter remains the only implemented template during Version 1.
 *    Support for future templates is architectural only." Enforced below as an exact
 *    count, not an inequality: `enabled` templates must be EXACTLY one.
 *
 *  · The toolbar prohibition list. TypeScript already prevents a prohibited command
 *    entering a template's allow-list, because prohibited ids are deliberately kept
 *    out of the `ToolbarCommandId` union. The runtime assertion here is the second
 *    lock, against a future cast or a JSON-sourced template.
 *
 * The remaining assertions are cross-registry agreement: every id a template names —
 * section kind, toolbar command, validation rule, typography set, print profile,
 * version — must resolve in the registry that owns it. Metadata that names something
 * nonexistent is the characteristic failure of a data-driven design, and it fails
 * silently at render time unless something like this catches it at build time.
 */
import { describe, it, expect } from 'vitest';
import {
  TEMPLATES,
  TEMPLATE_KEYS,
  RESERVED_REFERENCE_PREFIXES,
  findTemplate,
  isTemplateKey,
  getAllTemplates,
  getEnabledTemplates,
  getTemplate,
  getTemplateSectionKinds,
  getUnusedSectionKinds,
  isReservedReferencePrefix,
  templateAllowsCommand,
} from '../../letters/registry/templateRegistry';
import { isSectionKind, isSectionPageScope } from '../../letters/model/sectionTypes';
import {
  isToolbarCommandId,
  isProhibitedToolbarCommand,
  PROHIBITED_TOOLBAR_COMMANDS,
} from '../../letters/registry/toolbarCommands';
import {
  isValidationRuleId,
  getValidationRule,
  selectionParamsMatchShape,
} from '../../letters/registry/validationRuleCatalog';
import { findTypographyPresetSet } from '../../letters/registry/typographyPresets';
import { isPrintProfileId } from '../../letters/registry/geometryRegistry';
import { findPrintProfile } from '../../letters/registry/printProfileRegistry';
import { isKnownVersion } from '../../letters/versioning/versions';
import { findBarcodePayloadSpec } from '../../letters/registry/barcodeSpecs';

const ALL = getAllTemplates();

describe('Template registry — structure', () => {
  it('the record key equals each template’s own key', () => {
    for (const key of TEMPLATE_KEYS) {
      expect(TEMPLATES[key].key).toBe(key);
    }
  });

  it('INV-10 — exactly ONE template is enabled in v1', () => {
    const enabled = getEnabledTemplates();
    expect(enabled).toHaveLength(1);
    expect(enabled[0].key).toBe('officialLetter');
  });

  it('INV-10 — the five future types are reservations, not templates', () => {
    // A reservation holds a reference prefix and nothing else. Nothing can be created
    // under it, and it is absent from the template registry entirely.
    const reservedFor = RESERVED_REFERENCE_PREFIXES.map((r) => r.prefix);
    expect(reservedFor).toEqual(['CIR', 'AD', 'AUTH', 'NOT', 'GOV']);
    expect(TEMPLATE_KEYS).toEqual(['officialLetter']);
  });

  it('reference prefixes are unique across templates AND reservations', () => {
    // The check that stops two document types issuing overlapping reference numbers —
    // a defect that is unfixable once numbers are on paper.
    const all = [...ALL.map((t) => t.referencePrefix), ...RESERVED_REFERENCE_PREFIXES.map((r) => r.prefix)];
    expect(new Set(all).size).toBe(all.length);
  });

  it('`isReservedReferencePrefix` distinguishes reservations from live prefixes', () => {
    expect(isReservedReferencePrefix('CIR')).toBe(true);
    expect(isReservedReferencePrefix('OL')).toBe(false);
    expect(isReservedReferencePrefix('ZZZ')).toBe(false);
  });
});

describe('Template registry — lookup safety', () => {
  it('resolves a declared key', () => {
    expect(findTemplate('officialLetter')?.key).toBe('officialLetter');
    expect(isTemplateKey('officialLetter')).toBe(true);
    expect(getTemplate('officialLetter').displayNameAr).toBe('خطاب رسمي');
  });

  it('returns undefined for unknown, empty and prototype-chain keys', () => {
    // A stored document naming `"constructor"` would otherwise reach the prototype
    // chain and return a FUNCTION that survives an `undefined` check before failing
    // on first property access.
    expect(findTemplate('nope')).toBeUndefined();
    expect(findTemplate('')).toBeUndefined();
    expect(findTemplate(null)).toBeUndefined();
    expect(findTemplate(undefined)).toBeUndefined();
    expect(findTemplate('constructor')).toBeUndefined();
    expect(findTemplate('toString')).toBeUndefined();
    expect(findTemplate('__proto__')).toBeUndefined();
    expect(isTemplateKey('constructor')).toBe(false);
  });
});

describe.each(ALL.map((t) => [t.key, t] as const))('Template "%s" — cross-registry agreement', (_key, template) => {
  it('declares only known section kinds, once each, in a valid page scope', () => {
    const kinds = getTemplateSectionKinds(template);
    expect(new Set(kinds).size).toBe(kinds.length);
    for (const spec of template.sections) {
      expect(isSectionKind(spec.kind), `unknown section kind "${spec.kind}"`).toBe(true);
      expect(isSectionPageScope(spec.pageScope)).toBe(true);
    }
  });

  it('declares exactly content, signature and barcode — Form Editor UX Rebuild v2 removed the fixed identity sections', () => {
    // `date`, `recipient` and `subject` remain valid `SectionKind`s the engine knows
    // about (see `sectionTypes.ts`), but no shipped template declares them any more —
    // the document is generic now, and none of the three is assumed.
    expect(getTemplateSectionKinds(template)).toEqual(['content', 'signature', 'barcode']);
    expect(getUnusedSectionKinds(template)).toEqual(['date', 'recipient', 'subject']);
  });

  it('places sections in the approved page scopes', () => {
    const scope = (kind: string) => template.sections.find((s) => s.kind === kind)?.pageScope;
    // Only the body flows; signature and barcode authorise the document as a whole
    // and therefore sit on the last page only.
    expect(scope('content')).toBe('flow');
    expect(scope('signature')).toBe('lastPage');
    expect(scope('barcode')).toBe('lastPage');
  });

  it('marks signature and barcode as NOT editable', () => {
    // Both are composed by the engine — the signature from the existing branding
    // system, the barcode from the registration snapshot — and are never inserted
    // into the editor by hand.
    const spec = (kind: string) => template.sections.find((s) => s.kind === kind);
    expect(spec('signature')?.editable).toBe(false);
    expect(spec('barcode')?.editable).toBe(false);
    expect(spec('content')?.editable).toBe(true);
  });

  it('names only catalogued toolbar commands, without repetition', () => {
    for (const id of template.toolbarCommands) {
      expect(isToolbarCommandId(id), `unknown toolbar command "${id}"`).toBe(true);
    }
    expect(new Set(template.toolbarCommands).size).toBe(template.toolbarCommands.length);
  });

  it('names NO prohibited toolbar command', () => {
    for (const id of template.toolbarCommands) {
      expect(isProhibitedToolbarCommand(id), `prohibited command "${id}" in allow-list`).toBe(false);
    }
    for (const prohibited of PROHIBITED_TOOLBAR_COMMANDS) {
      expect(
        (template.toolbarCommands as readonly string[]).includes(prohibited.id),
        `"${prohibited.id}" must never be permitted — ${prohibited.reason}`,
      ).toBe(false);
    }
  });

  it('permits neither italic nor any colour tool', () => {
    // Called out separately because these are the two most likely to be re-added by
    // someone who has not read why they are absent.
    const allowed = template.toolbarCommands as readonly string[];
    expect(allowed).not.toContain('italic');
    expect(allowed).not.toContain('textColor');
    // `highlight` is NO LONGER on this list. It was lifted in Document Studio
    // Foundation v1 and is rendered as a neutral grey wash carrying no hue, so the
    // black-on-pre-printed-stock rule that prohibited it is untouched. `textColor`
    // itself — the tool that would actually introduce a hue — remains prohibited above.
    // See `LIFTED_TOOLBAR_PROHIBITIONS` for the full record.
    expect(allowed).not.toContain('insertImage');
    expect(allowed).not.toContain('insertTable');
    expect(templateAllowsCommand(template, 'bold')).toBe(true);
    expect(templateAllowsCommand(template, 'underline')).toBe(true);
  });

  it('names a typography preset set that resolves', () => {
    expect(findTypographyPresetSet(template.typographyPresetSetId)).toBeDefined();
  });

  it('names print profiles that exist, and permits its own default', () => {
    expect(isPrintProfileId(template.defaultPrintProfileId)).toBe(true);
    expect(findPrintProfile(template.defaultPrintProfileId)?.enabled).toBe(true);
    expect(template.allowedPrintProfileIds).toContain(template.defaultPrintProfileId);
    for (const id of template.allowedPrintProfileIds) {
      expect(isPrintProfileId(id), `unknown print profile "${id}"`).toBe(true);
    }
  });

  it('names versions this build declares, and a barcode spec that exists', () => {
    expect(isKnownVersion('template', template.templateVersion)).toBe(true);
    expect(isKnownVersion('layout', template.defaultLayoutVersion)).toBe(true);
    expect(isKnownVersion('barcode', template.defaultBarcodeVersion)).toBe(true);
    expect(findBarcodePayloadSpec(template.defaultBarcodeVersion)).toBeDefined();
  });

  it('selects only catalogued validation rules, once each, with matching parameters', () => {
    const ids = template.validationRules.map((r) => r.ruleId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const selection of template.validationRules) {
      expect(isValidationRuleId(selection.ruleId), `unknown rule "${selection.ruleId}"`).toBe(true);
      expect(
        selectionParamsMatchShape(selection),
        `rule "${selection.ruleId}" parameters do not match its declared shape ` +
          `(expected ${getValidationRule(selection.ruleId).paramNames.join(', ') || 'none'})`,
      ).toBe(true);
    }
  });

  it('selects the two reserved-zone rules — the one restriction the editor keeps', () => {
    // Form Editor UX Rebuild v2 deselected every other blocking rule: the editor
    // assists rather than refuses, and the author decides whether a document is fit to
    // send. What a template still may NOT do is opt out of protecting the pre-printed
    // paper, because that is the only thing an author cannot see going wrong.
    //
    // A template chooses thresholds and membership, never severity — so these two stay
    // blocking wherever they are selected.
    const selected = new Set(template.validationRules.map((r) => r.ruleId));
    for (const id of ['E4_reservedZoneOverlap', 'E16_objectInReservedZone']) {
      expect(selected.has(id as never), `reserved-zone rule "${id}" is not selected`).toBe(true);
    }
  });

  it('selects no rule that would refuse an ordinary editing action', () => {
    // The rebuild's promise, asserted against the shipped metadata rather than against
    // a screen: nothing outside the reserved-zone pair and the geometry stability guard
    // may carry a severity that stops an output.
    const stoppers = template.validationRules
      .map((r) => r.ruleId)
      .filter((id) => getValidationRule(id).severity === 'blocking')
      .filter((id) => !['E4_reservedZoneOverlap', 'E16_objectInReservedZone', 'E13_impossibleGeometry'].includes(id));
    expect(stoppers).toEqual([]);
  });

  it('declares signature slots without owning any asset (INV-12)', () => {
    // Slots only. The engine names them; the EXISTING company branding system fills
    // them. Both default to hidden because printing for wet-ink signature is a
    // legitimate workflow.
    expect(template.signatureSlots.hasSignature).toBe(true);
    expect(template.signatureSlots.hasStamp).toBe(true);
    expect(template.signatureSlots.signatureShownByDefault).toBe(false);
    expect(template.signatureSlots.stampShownByDefault).toBe(false);
    expect(Object.keys(template.signatureSlots)).toEqual([
      'hasSignature',
      'hasStamp',
      'signatureShownByDefault',
      'stampShownByDefault',
    ]);
  });
});

describe('Official Letter — approved specifics', () => {
  const template = getTemplate('officialLetter');

  it('uses the OL reference prefix and the official Arabic typography', () => {
    expect(template.referencePrefix).toBe('OL');
    expect(template.typographyPresetSetId).toBe('officialArabic');
  });

  it('has no approval gate', () => {
    expect(template.requiresApproval).toBe(false);
  });
});
