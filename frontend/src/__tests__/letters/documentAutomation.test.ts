/**
 * @vitest-environment jsdom
 *
 * Professional Document Automation v1 — the pure layers.
 *
 * The DOM environment is needed for ONE section: favourites and recents read
 * `localStorage`. Everything else here is genuinely pure and would run under `node`.
 *
 * (original header follows)
 *
 * Variables, conditions, the library model, favourites, and the five validation rules.
 *
 * ══════════════════════════════════════════════════════════════════════════
 *  TWO PROPERTIES CARRY THE WHOLE FEATURE, AND BOTH ARE ASSERTED BELOW.
 * ══════════════════════════════════════════════════════════════════════════
 *
 *  1. THE TOKEN IS STORED, THE VALUE IS ONLY RENDERED. If substitution ever reached
 *     storage the letter would stop being re-resolvable and there would be no inverse —
 *     «أحمد محمد» in a document cannot be told from a name that was typed.
 *
 *  2. A REGISTERED LETTER RESOLVES FROM ITS SNAPSHOT, NEVER FROM LIVE DATA. Without
 *     that, a pay rise silently rewrites a letter that was issued and handed over.
 */

import { describe, it, expect, beforeEach } from 'vitest';

import {
  CONTENT_MODEL_VERSION,
  createBlock,
  createSpan,
  type BlockAttributes,
  type BlockDocument,
} from '../../letters/model/blockTypes';
import {
  documentVariableNames,
  parseDocument,
  serialiseDocument,
  setBlockCondition,
  setDocumentBindings,
  visibleBlocks,
} from '../../letters/editor/blockCommands';
import {
  findTokens,
  hasTokens,
  insertTokenAt,
  resolveTokens,
  toToken,
  tokenNames,
  unknownTokenNames,
} from '../../letters/variables/variableSyntax';
import {
  findVariable,
  getAllVariables,
  insertableVariables,
  isVariableAvailable,
  isVariableName,
  requiredBindings,
  searchVariables,
  VARIABLE_NAMES,
} from '../../letters/variables/variableCatalog';
import {
  freezeUsedVariables,
  resolveForStatus,
  resolveVariables,
  unresolvedNames,
  type VariableSources,
} from '../../letters/variables/variableResolver';
import {
  createGroup,
  createLeaf,
  describeCondition,
  evaluateCondition,
  conditionVariables,
  validateCondition,
} from '../../letters/variables/conditions';
import {
  categoriesOf,
  isAssetRecord,
  isTemplateRecord,
  parseLibraryList,
  searchEntries,
  type LetterTemplateEntry,
} from '../../letters/library/libraryTypes';
import {
  getFavourites,
  getRecents,
  orderByPreference,
  recordRecent,
  toggleFavourite,
  RECENT_LIMIT,
} from '../../letters/library/favourites';
import { createLetterValidationRegistry } from '../../letters/validation/rules';
import { runValidation } from '../../letters/validation/framework';
import { getTemplate } from '../../letters/registry/templateRegistry';
import { getPageGeometry } from '../../letters/registry/geometryRegistry';
import { paginate } from '../../letters/pagination/paginate';

/* ── Fixtures ───────────────────────────────────────────────────────────── */

const BODY: BlockAttributes = { fontId: 'traditionalArabic', sizePt: 16, alignment: 'justify', indentLevel: 0 };

function doc(...texts: string[]): BlockDocument {
  return {
    contentModelVersion: CONTENT_MODEL_VERSION,
    blocks: texts.map((text, i) => createBlock(`b${i}`, 'paragraph', [createSpan(text)], BODY)),
  };
}

const SOURCES: VariableSources = {
  company: { name: 'شركة المنار', address: 'الشويخ' },
  employee: {
    name: 'أحمد محمد',
    jobTitle: 'مهندس',
    department: 'الهندسة',
    nationality: 'كويتي',
    civilId: '290010112345',
    phone: '99887766',
    email: 'a@example.com',
    salary: 1250,
  },
  contract: { reference: 'CT-2026-018' },
  project: null,
  currentUser: 'مدير النظام',
  reference: 'OL-2026-000001',
  issueDate: '2026-08-01',
  now: new Date('2026-08-06T14:35:00'),
};

/* ══ Catalogue ═════════════════════════════════════════════════════════════ */

describe('The variable catalogue', () => {
  it('declares eighteen variables, each with a description and a sample', () => {
    expect(VARIABLE_NAMES).toHaveLength(18);
    for (const variable of getAllVariables()) {
      expect(variable.descriptionAr.length, `${variable.name} has no description`).toBeGreaterThan(10);
      expect(variable.sampleAr.length, `${variable.name} has no sample`).toBeGreaterThan(0);
    }
  });

  it('marks the two with NO data source in this ERP, and explains why', () => {
    // `Employee` carries no manager field and there is no `Project` model. Offering
    // them anyway would let an author insert a token that can never resolve, which E18
    // would then block the print over — a trap with no way out.
    const unavailable = getAllVariables().filter((v) => !isVariableAvailable(v));
    expect(unavailable.map((v) => v.name).sort()).toEqual(['Manager', 'Project']);
    for (const variable of unavailable) {
      expect(variable.unavailableReasonAr!.length).toBeGreaterThan(30);
    }
  });

  it('offers only the resolvable ones for insertion', () => {
    expect(insertableVariables()).toHaveLength(16);
    expect(insertableVariables().some((v) => v.name === 'Manager')).toBe(false);
  });

  it('guards an untrusted name against the prototype chain', () => {
    // A stored `"constructor"` would otherwise return a function that survives an
    // `undefined` check before failing on first property access.
    expect(findVariable('constructor')).toBeUndefined();
    expect(findVariable('toString')).toBeUndefined();
    expect(isVariableName('Employee')).toBe(true);
    expect(isVariableName('Nope')).toBe(false);
  });

  it('searches name, label AND description', () => {
    expect(searchVariables('CivilId').map((v) => v.name)).toContain('CivilId');
    expect(searchVariables('الرقم المدني').map((v) => v.name)).toContain('CivilId');
    expect(searchVariables('تاريخ').length).toBeGreaterThanOrEqual(2);
  });

  it('reports which bindings a set of variables needs', () => {
    expect(requiredBindings(['Company', 'Today']).sort()).toEqual([]);
    expect(requiredBindings(['Employee', 'Contract']).sort()).toEqual(['contract', 'employee']);
  });
});

/* ══ Syntax ════════════════════════════════════════════════════════════════ */

describe('Token syntax', () => {
  it('finds tokens with their offsets, marking unknown names', () => {
    const tokens = findTokens('السيد {{Employee}} — {{Nope}}');
    expect(tokens).toHaveLength(2);
    expect(tokens[0].name).toBe('Employee');
    expect(tokens[0].known).toBe(true);
    expect(tokens[1].known).toBe(false);
    expect('السيد {{Employee}} — {{Nope}}'.slice(tokens[0].start, tokens[0].end)).toBe('{{Employee}}');
  });

  it('does not treat ordinary braces or Arabic prose as tokens', () => {
    expect(findTokens('نص عادي بلا أقواس')).toEqual([]);
    expect(findTokens('{{ }}')).toEqual([]);
    expect(findTokens('{{مرحبا}}'), 'Arabic between braces is prose, not a token').toEqual([]);
  });

  it('returns the same result twice — no shared regex lastIndex', () => {
    // A module-level global regex carries `lastIndex` between calls, which is the
    // classic way a "find all" silently returns different results on its second run.
    const text = '{{Employee}} {{Salary}}';
    expect(tokenNames(text)).toEqual(tokenNames(text));
    expect(hasTokens(text)).toBe(hasTokens(text));
  });

  it('substitutes values, keeping an unresolved token VISIBLE by default', () => {
    const text = '{{Employee}} — {{Phone}}';
    expect(resolveTokens(text, { Employee: 'أحمد' })).toBe('أحمد — {{Phone}}');
    expect(resolveTokens(text, { Employee: 'أحمد' }, 'blank')).toBe('أحمد — ');
  });

  it('treats absent, null and empty as the same "no value"', () => {
    // "No binding yet" and "bound to an employee with no phone" are both "there is no
    // value"; making the author distinguish them would be asking them to care.
    expect(resolveTokens('{{Phone}}', {})).toBe('{{Phone}}');
    expect(resolveTokens('{{Phone}}', { Phone: null })).toBe('{{Phone}}');
    expect(resolveTokens('{{Phone}}', { Phone: '' })).toBe('{{Phone}}');
  });

  it('inserts at the caret and returns where the caret should land', () => {
    const { text, caret } = insertTokenAt('السيد ', 6, 6, 'Employee');
    expect(text).toBe('السيد {{Employee}}');
    expect(text.slice(0, caret)).toBe(text);
  });

  it('replaces a selection rather than appending to it', () => {
    const { text } = insertTokenAt('السيد فلان', 6, 10, 'Employee');
    expect(text).toBe('السيد {{Employee}}');
  });

  it('reports unknown names separately from known ones', () => {
    expect(unknownTokenNames('{{Employee}} {{Bogus}}')).toEqual(['Bogus']);
    expect(toToken('Salary')).toBe('{{Salary}}');
  });
});

/* ══ Resolution ════════════════════════════════════════════════════════════ */

describe('Variable resolution', () => {
  it('resolves every catalogued name, null where there is none', () => {
    const resolved = resolveVariables(SOURCES);
    expect(Object.keys(resolved).sort()).toEqual([...VARIABLE_NAMES].sort());
    expect(resolved.Employee).toBe('أحمد محمد');
    expect(resolved.Company).toBe('شركة المنار');
    expect(resolved.Contract).toBe('CT-2026-018');
    expect(resolved.Manager, 'no manager field exists in this ERP').toBeNull();
    expect(resolved.Project, 'no project model exists in this ERP').toBeNull();
  });

  it('formats salary as Kuwaiti Dinar with three decimals', () => {
    expect(resolveVariables(SOURCES).Salary).toBe('1,250.000 د.ك');
    expect(resolveVariables({ ...SOURCES, employee: { salary: null } }).Salary).toBeNull();
  });

  it('reads the clock from the ARGUMENT, never from `new Date()`', () => {
    // What makes this file testable without freezing time globally.
    const resolved = resolveVariables(SOURCES);
    expect(resolved.Today).toBe('2026-08-06');
    expect(resolved.CurrentTime).toBe('14:35');
  });

  it('distinguishes the LETTER’s date from today’s', () => {
    // The most common variable bug in every engine that offers both: a letter dated
    // last week says last week.
    const resolved = resolveVariables(SOURCES);
    expect(resolved.CurrentDate).toBe('2026-08-01');
    expect(resolved.Today).toBe('2026-08-06');
    expect(resolved.CurrentDate).not.toBe(resolved.Today);
  });

  it('resolves a DRAFT live', () => {
    expect(resolveForStatus('DRAFT', SOURCES, null).Salary).toBe('1,250.000 د.ك');
  });

  it('resolves a REGISTERED letter from its snapshot, ignoring live data entirely', () => {
    // THE test for the whole feature: a pay rise must never rewrite a letter that has
    // already been issued and handed over.
    const frozen = { Salary: '900.000 د.ك', Employee: 'أحمد محمد' };
    const resolved = resolveForStatus('REGISTERED', SOURCES, frozen);
    expect(resolved.Salary).toBe('900.000 د.ك');
    expect(resolved.Company, 'live sources are not consulted at all').toBeUndefined();
  });

  it('a registered letter with no frozen map resolves to NOTHING, not to today', () => {
    // The honest answer: the engine does not know what that letter said, and guessing
    // would be worse than a visible gap.
    expect(resolveForStatus('REGISTERED', SOURCES, null)).toEqual({});
  });

  it('freezes only the variables the document MENTIONS', () => {
    // Freezing all eighteen would put a salary into the snapshot of a letter that
    // never asked for one.
    const frozen = freezeUsedVariables(['Employee', 'Bogus'], resolveVariables(SOURCES));
    expect(Object.keys(frozen)).toEqual(['Employee']);
    expect(frozen.Employee).toBe('أحمد محمد');
  });

  it('lists the used-but-unresolved names', () => {
    const resolved = resolveVariables({ ...SOURCES, employee: null });
    expect(unresolvedNames(['Employee', 'Company'], resolved)).toEqual(['Employee']);
  });
});

/* ══ Document integration ══════════════════════════════════════════════════ */

describe('Variables in a document', () => {
  it('collects names from block text, conditions and layout objects', () => {
    const withCondition = setBlockCondition(
      doc('السيد {{Employee}}', 'نص'),
      'b1',
      createLeaf('Salary'),
    );
    expect(documentVariableNames(withCondition).sort()).toEqual(['Employee', 'Salary']);
  });

  it('stores the TOKEN, never the value — the round trip is lossless', () => {
    // If substitution ever reached storage the letter would stop being re-resolvable,
    // and there is no inverse from a rendered name back to the question.
    const original = doc('السيد {{Employee}}');
    const stored = serialiseDocument(original);
    expect(stored).toContain('{{Employee}}');
    expect(stored).not.toContain('أحمد');
    expect(parseDocument(stored)).toEqual(original);
  });

  it('drops empty bindings so a letter that binds nothing is byte-identical', () => {
    const bound = setDocumentBindings(doc('x'), { employeeId: 7 });
    expect(bound.bindings?.employeeId).toBe(7);
    expect(setDocumentBindings(bound, {}).bindings).toBeUndefined();
  });

  it('a version-3 document migrates and carries no bindings', () => {
    const storedV3 = JSON.stringify({
      contentModelVersion: 3,
      blocks: [{ id: 'b1', kind: 'paragraph', spans: [{ text: 'قديم', marks: [] }], attributes: BODY }],
    });
    const parsed = parseDocument(storedV3)!;
    expect(parsed.contentModelVersion).toBe(CONTENT_MODEL_VERSION);
    expect(parsed.bindings).toBeUndefined();
  });
});

/* ══ Conditions ════════════════════════════════════════════════════════════ */

describe('Conditional content', () => {
  const resolved = resolveVariables(SOURCES);
  const none = resolveVariables({ ...SOURCES, employee: null });

  it('evaluates existence, equality and containment', () => {
    expect(evaluateCondition({ kind: 'leaf', variable: 'Employee', operator: 'exists' }, resolved)).toBe(true);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Employee', operator: 'exists' }, none)).toBe(false);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Department', operator: 'equals', value: 'الهندسة' }, resolved)).toBe(true);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Department', operator: 'contains', value: 'هند' }, resolved)).toBe(true);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Department', operator: 'notEquals', value: 'المالية' }, resolved)).toBe(true);
  });

  it('compares a FORMATTED salary numerically, not as text', () => {
    // `{{Salary}}` resolves to "1,250.000 د.ك" — a naive `>` would compare strings and
    // answer nonsense.
    expect(evaluateCondition({ kind: 'leaf', variable: 'Salary', operator: 'greaterThan', value: '0' }, resolved)).toBe(true);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Salary', operator: 'greaterThan', value: '2000' }, resolved)).toBe(false);
    expect(evaluateCondition({ kind: 'leaf', variable: 'Salary', operator: 'lessThan', value: '2000' }, resolved)).toBe(true);
  });

  it('nests groups with all and any', () => {
    const tree = createGroup('all', [
      { kind: 'leaf', variable: 'Employee', operator: 'exists' },
      createGroup('any', [
        { kind: 'leaf', variable: 'Department', operator: 'equals', value: 'المالية' },
        { kind: 'leaf', variable: 'Salary', operator: 'greaterThan', value: '1000' },
      ]),
    ]);
    expect(evaluateCondition(tree, resolved)).toBe(true);
    expect(evaluateCondition(tree, none)).toBe(false);
  });

  it('SHOWS content when the condition is broken, never hides it', () => {
    // Content vanishing without explanation is far worse than content appearing that
    // should have been hidden. E20 reports it; the renderer keeps the text.
    expect(evaluateCondition({ kind: 'leaf', variable: 'Bogus', operator: 'exists' }, resolved)).toBe(true);
    expect(evaluateCondition(createGroup('all', []), resolved), 'an empty group is not yet a rule').toBe(true);
    expect(evaluateCondition(undefined, resolved)).toBe(true);
  });

  it('hides a block whose condition fails, and keeps it out of the flow', () => {
    const conditional = setBlockCondition(doc('دائم', 'مشروط'), 'b1', createLeaf('Employee'));
    expect(visibleBlocks(conditional, resolved)).toHaveLength(2);
    expect(visibleBlocks(conditional, none)).toHaveLength(1);
    expect(visibleBlocks(conditional, none)[0].id).toBe('b0');
  });

  it('removing a condition restores the block permanently', () => {
    const conditional = setBlockCondition(doc('نص'), 'b0', createLeaf('Employee'));
    const cleared = setBlockCondition(conditional, 'b0', undefined);
    expect(cleared.blocks[0].attributes.condition).toBeUndefined();
    expect(visibleBlocks(cleared, none)).toHaveLength(1);
  });

  it('describes a tree in Arabic labels, not raw token names', () => {
    const text = describeCondition(createGroup('all', [
      { kind: 'leaf', variable: 'Salary', operator: 'greaterThan', value: '0' },
      { kind: 'leaf', variable: 'Employee', operator: 'exists' },
    ]));
    expect(text).toContain('الراتب');
    expect(text).not.toContain('Salary');
  });

  it('reports structural problems rather than a bare boolean', () => {
    expect(validateCondition({ kind: 'leaf', variable: 'Bogus', operator: 'exists' })[0]).toMatch(/غير معروف/);
    expect(validateCondition({ kind: 'leaf', variable: 'Employee', operator: 'equals', value: '' })[0]).toMatch(/يحتاج قيمة/);
    expect(validateCondition({ kind: 'leaf', variable: 'Employee', operator: 'exists' })).toEqual([]);
  });

  it('lists the variables a tree reads', () => {
    expect(conditionVariables(createGroup('any', [createLeaf('Employee'), createLeaf('Salary')])).sort())
      .toEqual(['Employee', 'Salary']);
  });
});

/* ══ Library ═══════════════════════════════════════════════════════════════ */

describe('The content libraries', () => {
  it('drops a malformed entry rather than failing the whole library', () => {
    // A half-written entry from an interrupted save must not make every template in the
    // company unreachable.
    const raw = JSON.stringify([
      { id: 'a', name: 'صالح', contentJson: '{}' },
      { id: 'b' },
      'nonsense',
    ]);
    const { entries, dropped } = parseLibraryList<LetterTemplateEntry>(raw, 'template', isTemplateRecord);
    expect(entries).toHaveLength(1);
    expect(dropped).toBe(2);
  });

  it('stamps the kind from the KEY, not from the record', () => {
    // A template stored under the blocks key is a storage bug; honouring its
    // self-declared kind would make it appear in the wrong panel for ever.
    const raw = JSON.stringify([{ id: 'a', name: 'x', kind: 'asset', contentJson: '{}' }]);
    const { entries } = parseLibraryList<LetterTemplateEntry>(raw, 'template', isTemplateRecord);
    expect(entries[0].kind).toBe('template');
  });

  it('survives unparseable JSON and a non-array', () => {
    expect(parseLibraryList('not json', 'template', isTemplateRecord).entries).toEqual([]);
    expect(parseLibraryList('{"a":1}', 'template', isTemplateRecord).entries).toEqual([]);
    expect(parseLibraryList('', 'template', isTemplateRecord).entries).toEqual([]);
  });

  it('requires an image for an asset', () => {
    expect(isAssetRecord({ imageUrl: 'data:image/png;base64,x' })).toBe(true);
    expect(isAssetRecord({ imageUrl: '' })).toBe(false);
  });

  it('collects categories and searches name, category and description', () => {
    const entries = [
      { id: 'a', name: 'تحية', category: 'رسمي', description: '', kind: 'block' as const, createdAt: '', updatedAt: '', contentJson: '', preview: '' },
      { id: 'b', name: 'ختام', category: '', description: 'نهاية الخطاب', kind: 'block' as const, createdAt: '', updatedAt: '', contentJson: '', preview: '' },
    ];
    expect(categoriesOf(entries)).toEqual(['رسمي']);
    expect(searchEntries(entries, 'نهاية')).toHaveLength(1);
    expect(searchEntries(entries, '')).toHaveLength(2);
  });
});

/* ══ Favourites and recents ════════════════════════════════════════════════ */

describe('Favourites and recents', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('toggles a favourite and reads it back', () => {
    expect(getFavourites('variable')).toEqual([]);
    expect(toggleFavourite('variable', 'Employee')).toEqual(['Employee']);
    expect(getFavourites('variable')).toEqual(['Employee']);
    expect(toggleFavourite('variable', 'Employee')).toEqual([]);
  });

  it('keeps namespaces separate so ids never collide', () => {
    toggleFavourite('variable', 'x');
    expect(getFavourites('template')).toEqual([]);
  });

  it('moves a re-used item to the front rather than duplicating it', () => {
    recordRecent('block', 'a');
    recordRecent('block', 'b');
    recordRecent('block', 'a');
    expect(getRecents('block')).toEqual(['a', 'b']);
  });

  it('caps the recents list', () => {
    for (let i = 0; i < RECENT_LIMIT + 5; i += 1) recordRecent('asset', `a${i}`);
    expect(getRecents('asset')).toHaveLength(RECENT_LIMIT);
  });

  it('orders favourites first, then recents, then source order', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
    const ordered = orderByPreference(items, (i) => i.id, ['d'], ['c', 'b']);
    expect(ordered.map((i) => i.id)).toEqual(['d', 'c', 'b', 'a']);
  });
});

/* ══ Validation ════════════════════════════════════════════════════════════ */

describe('The automation validation rules', () => {
  const geometry = getPageGeometry('companyLetterhead', 1);
  const template = getTemplate('officialLetter');
  const registry = createLetterValidationRegistry();

  function validate(content: BlockDocument, resolvedVariables: Record<string, string | null> = {}) {
    return runValidation(registry, template.validationRules, {
      template,
      geometry,
      status: 'DRAFT',
      reference: null,
      issueDate: '2026-01-01',
      subject: 'موضوع',
      recipient: { name: 'جهة', title: '', organisation: '' },
      content,
      resolvedVariables,
      unresolvedBindings: [],
      pagination: paginate([{ id: 'b0', kind: 'content', heightMm: 10 }], geometry),
      itemHeightsMm: { b0: 10 },
      subjectLineCount: 1,
      signatureAssetId: null,
      stampAssetId: null,
      signatureResolved: false,
      stampResolved: false,
      barcodePayload: '',
      now: new Date('2026-01-01'),
    });
  }

  it('E18 BLOCKS an unresolved variable', () => {
    // Without this rule the feature turns from one that saves typing into a mechanism
    // for posting an official letter that reads «المحترم {{Employee}}».
    const issues = validate(doc('السيد {{Employee}}')).issues.filter((i) => i.ruleId === 'E18_unresolvedVariable');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
  });

  it('E18 passes once the variable has a value', () => {
    const issues = validate(doc('السيد {{Employee}}'), { Employee: 'أحمد' })
      .issues.filter((i) => i.ruleId === 'E18_unresolvedVariable');
    expect(issues).toEqual([]);
  });

  it('E18 names the BINDING as the cause when one is needed', () => {
    const issues = validate(doc('{{Salary}}')).issues.filter((i) => i.ruleId === 'E18_unresolvedVariable');
    expect(issues[0].message).toMatch(/ربط/);
  });

  it('E19 reports an unknown token SEPARATELY from an unresolved one', () => {
    // The fix is different: an unresolved variable needs data, an unknown one needs the
    // text corrected. Reporting both as "unresolved" sends the author hunting for a
    // record that was never the problem.
    const result = validate(doc('{{Bogus}}'));
    expect(result.issues.filter((i) => i.ruleId === 'E19_unknownVariable')).toHaveLength(1);
    expect(result.issues.filter((i) => i.ruleId === 'E18_unresolvedVariable')).toHaveLength(0);
  });

  it('E20 BLOCKS a broken condition even though nothing looks wrong', () => {
    // A broken condition renders its content, so the letter LOOKS right while the rule
    // the author wrote is silently ignored. A silent wrong answer is more dangerous
    // than a visible hole.
    const broken = setBlockCondition(doc('نص'), 'b0', { kind: 'leaf', variable: 'Bogus', operator: 'exists' });
    const issues = validate(broken).issues.filter((i) => i.ruleId === 'E20_brokenCondition');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('blocking');
  });

  it('W11 reports a missing recipient as ADVISORY, not blocking', () => {
    // The template declares the recipient section optional; blocking would make the
    // engine contradict its own registry.
    const result = runValidation(registry, template.validationRules, {
      template,
      geometry,
      status: 'DRAFT',
      reference: null,
      issueDate: '2026-01-01',
      subject: 'موضوع',
      recipient: { name: '', title: '', organisation: '' },
      content: doc('نص'),
      resolvedVariables: {},
      unresolvedBindings: [],
      pagination: paginate([{ id: 'b0', kind: 'content', heightMm: 10 }], geometry),
      itemHeightsMm: { b0: 10 },
      subjectLineCount: 1,
      signatureAssetId: null,
      stampAssetId: null,
      signatureResolved: false,
      stampResolved: false,
      barcodePayload: '',
      now: new Date('2026-01-01'),
    });
    const issues = result.issues.filter((i) => i.ruleId === 'W11_recipientMissing');
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('a letter with no variables reports none of the automation rules', () => {
    const clean = validate(doc('نص عادي بلا متغيّرات')).issues.filter((i) =>
      ['E18_unresolvedVariable', 'E19_unknownVariable', 'E20_brokenCondition'].includes(i.ruleId),
    );
    expect(clean).toEqual([]);
  });
});
