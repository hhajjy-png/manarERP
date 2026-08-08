// @vitest-environment jsdom
/**
 * Cheque Printing Data Integrity & Formatting Pack v1 — regression suite.
 *
 * Locks the two confirmed print defects, and the hardening added around them, so
 * neither can return:
 *
 *   1. AMOUNT — `fmtChequeAmount` dropped `.000` on whole-dinar cheques
 *      (`#1,370#` instead of `#1,370.000#`) and disagreed with itself on the
 *      rounding basis (`999.9999` printed `#999#` — a one-dinar understatement).
 *   2. DATE — legacy stored templates carry no `binding`, and the date field's id
 *      is `'date'` while its canonical semantic key is `'chequeDate'`, so binding
 *      inference returned null and the template's design-time SAMPLE date
 *      (`24 / 07 / 2026`) printed instead of the real cheque date.
 *
 * Plus: RTL bidi safety for Latin-ordered values, the print-mode integrity guard
 * (no mock, no placeholder substitution), print-state validation, print-page state
 * safety, and Classic ↔ Designer canonical parity.
 *
 * PRIMARY FIXTURE — the real cheque 000002 from the forensic audit:
 *   amount     = 1370          → must print  #1,370.000#
 *   chequeDate = 2026-08-02    → must print  02 / 08 / 2026
 *   and must NEVER print the legacy sample  24 / 07 / 2026
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Cheque designer templates live in the database now (Cheque Template
// Persistence Migration Pack v1), so the store block below talks to a fake of
// `/api/cheque-designer-templates` that mirrors the real service semantics.
// Nothing else in this file touches the API client.
vi.mock('../api/client', async () => {
  const mod = await import('./helpers/fakeChequeTemplateApi');
  return { api: mod.fakeApi };
});
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

import { fmtChequeAmount } from '../utils/chequeTemplate';
import { amountToWordsKWD } from '../lib/tafqeet';
import {
  resolveChequeTemplate,
  resolveChequeTemplateForPrint,
  defaultBindingResolver,
  normalizeFieldBindings,
  MOCK_RUNTIME_DATA,
  REQUIRED_PRINT_KEYS,
  LTR_ISOLATED_KEYS,
} from '../modules/chequeTemplateRuntime';
import type { RuntimeData, SemanticKey } from '../modules/chequeTemplateRuntime';
import { fakeTemplateDb, resetFakeTemplateDb, seedFakeTemplates } from './helpers/fakeChequeTemplateApi';
import {
  LEGACY_STORAGE_KEY,
  resetLegacyImportForTests,
  listTemplates,
  getTemplate,
  getDefaultTemplate,
  saveTemplate,
} from '../components/chequeTemplateManager/chequeDesignerStore';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';
import type { ChequeRecordInput } from '../components/chequeTemplateManager/chequeRuntimeData';
import ChequeRenderSurface from '../components/chequeTemplateManager/ChequeRenderSurface';
import ChequeTemplatePrintPage from '../components/chequeTemplateManager/ChequeTemplatePrintPage';
import type { DesignerField, DesignerSurfaceSpec } from '../modules/chequeTemplateDesigner';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Cheque 000002 exactly as stored (cheques.id = 46) and served by the API. */
const CHEQUE_000002: ChequeRecordInput = {
  chequeNumber: '000002',
  chequeDate: new Date(1785628800000).toISOString(), // 2026-08-02T00:00:00.000Z
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1370,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

const EXPECTED_AMOUNT = '#1,370.000#';
const EXPECTED_DATE = '02 / 08 / 2026';
const LEGACY_SAMPLE_DATE = '24 / 07 / 2026';

const SURFACE: DesignerSurfaceSpec = { widthCm: 17.8, heightCm: 8.9 };

function field(over: Partial<DesignerField> & { id: string }): DesignerField {
  return {
    label: '', value: '', x: 10, y: 10, width: 20, height: 6, rotation: 0,
    fontSize: 12, fontWeight: 400, textAlign: 'center', color: '#000000', zIndex: 1, visible: true,
    ...over,
  };
}

/**
 * The five template shapes actually found in this installation's localStorage
 * (`chequeDesigner.templates.v1`). Every one has NO `binding` on any field and the
 * same design-time sample values — the legacy shape this pack must keep working.
 */
// Widths/font sizes mirror the REAL stored templates (45 / 22 / 16 / 58 percent),
// not placeholder values: the Deterministic Geometry pack added a text-fit check
// that blocks printing when a value cannot fit its box, so a fixture with an
// unrealistically narrow box would report an overflow the real templates do not have.
const LEGACY_FIELDS: DesignerField[] = [
  field({ id: 'beneficiary', value: 'اسم المستفيد', x: 5, y: 22.47, width: 45, fontSize: 14, textAlign: 'right', zIndex: 3 }),
  field({ id: 'date', value: LEGACY_SAMPLE_DATE, x: 73, y: 19.47, width: 22, fontSize: 13, zIndex: 1 }),
  field({ id: 'amount', value: '#1,250.000#', x: 76, y: 42.3, width: 16, fontSize: 14, fontWeight: 700, zIndex: 4 }),
  field({ id: 'amountInWords', value: 'ألف ومئتان وخمسون ديناراً فقط', x: 10.7, y: 29.78, width: 58, fontSize: 12, zIndex: 5 }),
];

const LEGACY_TEMPLATE_NAMES = ['1', '1 نسخة', 'الخليج', '2026', 'تجربه'];

function legacyTemplate() {
  return { surface: SURFACE, fields: LEGACY_FIELDS.map((f) => ({ ...f })) };
}

function textOf(model: ReturnType<typeof resolveChequeTemplateForPrint>, id: string): string | undefined {
  return model.fields.find((f) => f.id === id)?.text;
}

// ── 1. Canonical printed amount ──────────────────────────────────────────────

describe('canonical printed cheque amount', () => {
  it.each([
    [1370, '#1,370.000#'],
    [1370.0, '#1,370.000#'],
    [5550, '#5,550.000#'],
    [5550.25, '#5,550.250#'],
    [90, '#90.000#'],
    [999.9999, '#1,000.000#'],
    [1369.99999, '#1,370.000#'],
    [0.5, '#0.500#'],
    [0.001, '#0.001#'],
    [0, '#0.000#'],
  ])('fmtChequeAmount(%s) → %s', (input, expected) => {
    expect(fmtChequeAmount(input)).toBe(expected);
  });

  it('holds the canonical invariant across a wide sweep: #<thousands>.<exactly 3 decimals>#', () => {
    const CANONICAL = /^#\d{1,3}(,\d{3})*\.\d{3}#$/;
    const samples = [
      0, 0.001, 0.5, 1, 9.9, 90, 100, 999, 999.9999, 1000, 1370, 5550.25,
      12345, 999999.999, 1234567.891, 87654321.5,
    ];
    for (const n of samples) {
      expect(fmtChequeAmount(n), `failed for ${n}`).toMatch(CANONICAL);
    }
  });

  it('never emits a bare integer (the old zero-fils suppression branch is gone)', () => {
    for (const n of [1370, 5550, 90, 1000, 7]) {
      expect(fmtChequeAmount(n)).not.toMatch(/^#[\d,]+#$/);
      expect(fmtChequeAmount(n)).toContain('.');
    }
  });

  it('uses ONE rounding basis — no floor/round disagreement at boundaries', () => {
    // Old behaviour: fils tested with Math.round but integer part taken with
    // Math.floor, so these understated the amount by a whole dinar.
    expect(fmtChequeAmount(999.9999)).toBe('#1,000.000#');
    expect(fmtChequeAmount(1369.99999)).toBe('#1,370.000#');
    expect(fmtChequeAmount(0.0004)).toBe('#0.000#');
  });

  it('degrades a non-finite amount to #0.000# rather than printing #NaN#', () => {
    expect(fmtChequeAmount(Number.NaN)).toBe('#0.000#');
    expect(fmtChequeAmount(Number.POSITIVE_INFINITY)).toBe('#0.000#');
  });

  it('cheque 000002 prints the canonical amount', () => {
    expect(buildChequeRuntimeData(CHEQUE_000002).amount).toBe(EXPECTED_AMOUNT);
  });

  it('leaves tafqeet untouched — it consumes the raw numeric amount independently', () => {
    // Sibling consumers of the same number: the formatter cannot influence words.
    const words = amountToWordsKWD(1370, 'ar');
    expect(buildChequeRuntimeData(CHEQUE_000002).amountInWords).toBe(words);
    expect(words).not.toContain('#');
    expect(amountToWordsKWD(1370, 'ar')).toBe(amountToWordsKWD(1370.0, 'ar'));
    // Fils still reach the words when they exist.
    expect(amountToWordsKWD(1370.25, 'ar')).not.toBe(words);
  });
});

// ── 2. Permanent cheque-date binding ─────────────────────────────────────────

describe('cheque date binding — legacy alias', () => {
  it('resolves a legacy binding-less id:"date" field to the chequeDate semantic key', () => {
    expect(defaultBindingResolver({ id: 'date' })).toBe('chequeDate');
  });

  it('still resolves the ids that already were semantic keys', () => {
    expect(defaultBindingResolver({ id: 'beneficiary' })).toBe('beneficiary');
    expect(defaultBindingResolver({ id: 'amount' })).toBe('amount');
    expect(defaultBindingResolver({ id: 'amountInWords' })).toBe('amountInWords');
  });

  it('keeps a genuinely unknown id static', () => {
    expect(defaultBindingResolver({ id: 'note' })).toBeNull();
  });

  it('treats an EXPLICIT binding as authoritative — the alias never overrides it', () => {
    // Explicit static markers must survive even on a field id the alias covers.
    expect(defaultBindingResolver({ id: 'date', binding: 'none' })).toBeNull();
    expect(defaultBindingResolver({ id: 'date', binding: 'custom' })).toBeNull();
    // An explicit binding to a DIFFERENT key wins over the id alias.
    expect(defaultBindingResolver({ id: 'date', binding: 'issueDate' })).toBe('issueDate');
    expect(defaultBindingResolver({ id: 'amount', binding: 'chequeNumber' })).toBe('chequeNumber');
  });

  it('a legacy binding-less template prints the ACTUAL cheque date, not the sample', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(CHEQUE_000002));
    expect(textOf(model, 'date')).toBe(EXPECTED_DATE);
    expect(textOf(model, 'date')).not.toBe(LEGACY_SAMPLE_DATE);
    expect(model.meta.hasErrors).toBe(false);
  });

  it('no design-time sample value survives anywhere once real cheque data exists', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(CHEQUE_000002));
    const printed = model.fields.map((f) => f.text);
    for (const sample of [LEGACY_SAMPLE_DATE, '#1,250.000#', 'اسم المستفيد', 'ألف ومئتان وخمسون ديناراً فقط']) {
      expect(printed).not.toContain(sample);
    }
    expect(printed).toContain(EXPECTED_DATE);
    expect(printed).toContain(EXPECTED_AMOUNT);
    expect(printed).toContain(CHEQUE_000002.beneficiaryName);
  });

  it.each(LEGACY_TEMPLATE_NAMES)('template shape «%s» resolves the actual selected cheque', (_name) => {
    // All five stored templates share the same legacy field shape; each must bind.
    const model = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(CHEQUE_000002));
    expect(textOf(model, 'date')).toBe(EXPECTED_DATE);
    expect(textOf(model, 'amount')).toBe(EXPECTED_AMOUNT);
    expect(textOf(model, 'beneficiary')).toBe(CHEQUE_000002.beneficiaryName);
    expect(model.meta.hasErrors).toBe(false);
  });

  it('the real cheque date reaches the model for a SECOND, different cheque too', () => {
    // Guards against any accidental caching of the first resolved date.
    const other: ChequeRecordInput = { ...CHEQUE_000002, chequeNumber: '000059', chequeDate: '2026-02-03T00:00:00.000Z', amount: 1550 };
    const model = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(other));
    expect(textOf(model, 'date')).toBe('03 / 02 / 2026');
    expect(textOf(model, 'amount')).toBe('#1,550.000#');
  });
});

describe('template normalization (legacy migration)', () => {
  it('backfills an explicit binding for every inferable legacy field', () => {
    const normalized = normalizeFieldBindings(LEGACY_FIELDS);
    expect(normalized.map((f) => f.binding)).toEqual([
      'beneficiary', 'chequeDate', 'amount', 'amountInWords',
    ]);
  });

  it('leaves an explicit binding — including the static markers — untouched', () => {
    const input = [
      field({ id: 'date', binding: 'none' }),
      field({ id: 'amount', binding: 'custom' }),
      field({ id: 'x', binding: 'issueDate' }),
    ];
    expect(normalizeFieldBindings(input).map((f) => f.binding)).toEqual(['none', 'custom', 'issueDate']);
  });

  it('preserves reference identity when nothing needs changing (no phantom edits)', () => {
    const already = normalizeFieldBindings(LEGACY_FIELDS);
    const again = normalizeFieldBindings(already);
    already.forEach((f, i) => expect(again[i]).toBe(f));
  });

  it('does not invent a binding for a genuinely static field', () => {
    const [only] = normalizeFieldBindings([field({ id: 'note', value: 'ثابت' })]);
    expect(only.binding).toBeUndefined();
  });

  it('normalization and the alias agree — a normalized template resolves identically', () => {
    const raw = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(CHEQUE_000002));
    const normalized = resolveChequeTemplateForPrint(
      { surface: SURFACE, fields: normalizeFieldBindings(legacyTemplate().fields) },
      buildChequeRuntimeData(CHEQUE_000002),
    );
    expect(normalized.fields.map((f) => f.text)).toEqual(raw.fields.map((f) => f.text));
  });
});

describe('chequeDesignerStore — legacy templates keep working after the move to SQLite', () => {
  /**
   * The five real stored templates, verbatim in the legacy (binding-less) shape
   * the old `localStorage` store wrote. They are seeded into browser storage and
   * then carried into the database by the one-time import, which is exactly the
   * path a real upgrading installation takes — so these tests prove the date
   * defect stays fixed ACROSS the migration, not just before it.
   */
  function seedLegacyStore() {
    const templates = LEGACY_TEMPLATE_NAMES.map((name, i) => ({
      id: `tpl-${i}`,
      name,
      isDefault: name === 'تجربه',
      surface: SURFACE,
      fields: LEGACY_FIELDS.map((f) => ({ ...f, binding: undefined })).map(({ binding: _b, ...rest }) => rest),
      createdAt: '2026-07-24T04:02:48.954Z',
      updatedAt: `2026-07-30T13:${String(10 + i).padStart(2, '0')}:00.000Z`,
    }));
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ version: 1, templates }));
  }

  beforeEach(() => {
    localStorage.clear();
    resetFakeTemplateDb();
    resetLegacyImportForTests();
    seedLegacyStore();
  });
  afterEach(() => localStorage.clear());

  it('none of the seeded templates has a stored binding (the legacy shape is real)', () => {
    const raw = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY)!) as { templates: { fields: DesignerField[] }[] };
    for (const t of raw.templates) {
      for (const f of t.fields) expect(f.binding).toBeUndefined();
    }
  });

  it('every read path hands out normalized bindings — all 5 templates preserved', async () => {
    const all = await listTemplates();
    expect(all).toHaveLength(5);
    expect(all.map((t) => t.name).sort()).toEqual([...LEGACY_TEMPLATE_NAMES].sort());
    for (const t of all) {
      expect(t.fields.find((f) => f.id === 'date')?.binding).toBe('chequeDate');
      expect(t.fields.find((f) => f.id === 'amount')?.binding).toBe('amount');
    }
    expect((await getDefaultTemplate())?.name).toBe('تجربه');
    expect((await getTemplate('tpl-0'))?.fields.find((f) => f.id === 'date')?.binding).toBe('chequeDate');
  });

  it('a normal save PERSISTS the corrected shape (no manual recreation needed)', async () => {
    const tpl = (await getDefaultTemplate())!;
    await saveTemplate(tpl.id, { surface: tpl.surface, fields: tpl.fields });

    expect(fakeTemplateDb.templates).toHaveLength(5); // nothing deleted or recreated
    const saved = fakeTemplateDb.templates.find((t) => t.name === 'تجربه')!;
    const fields = saved.fields as DesignerField[];
    expect(fields.find((f) => f.id === 'date')?.binding).toBe('chequeDate');
  });

  it('a stored template read from the store prints the ACTUAL cheque date end to end', async () => {
    const tpl = (await getDefaultTemplate())!;
    const model = resolveChequeTemplateForPrint(
      { surface: tpl.surface, fields: tpl.fields },
      buildChequeRuntimeData(CHEQUE_000002),
    );
    expect(textOf(model, 'date')).toBe(EXPECTED_DATE);
    expect(textOf(model, 'amount')).toBe(EXPECTED_AMOUNT);
    expect(model.meta.hasErrors).toBe(false);
  });

  it('a malformed stored template degrades safely instead of throwing', async () => {
    resetFakeTemplateDb();
    resetLegacyImportForTests();
    localStorage.clear();
    seedFakeTemplates([
      { id: 'x', name: 'broken', isDefault: true, surface: SURFACE, fields: undefined as unknown as unknown[], createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    ]);
    const rows = await listTemplates();
    expect(rows[0].fields).toEqual([]);
  });
});

// ── 3. Bidi safety ───────────────────────────────────────────────────────────

describe('RTL bidi safety for date / numeric print values', () => {
  function renderSurface(data: RuntimeData) {
    const model = resolveChequeTemplateForPrint(
      {
        surface: SURFACE,
        fields: [
          ...LEGACY_FIELDS.map((f) => ({ ...f })),
          field({ id: 'num', binding: 'chequeNumber', zIndex: 6 }),
        ],
      },
      data,
    );
    // `dir="rtl"` mirrors the real print page / studio overlay ancestor.
    const { container } = render(<div dir="rtl"><ChequeRenderSurface model={model} showBackground={false} /></div>);
    return container;
  }

  function styleFor(container: HTMLElement, binding: string): CSSStyleDeclaration {
    const el = container.querySelector<HTMLElement>(`[data-binding="${binding}"]`);
    expect(el, `no rendered field for binding ${binding}`).not.toBeNull();
    return el!.style;
  }

  it('isolates the date to LTR so 02 / 08 / 2026 keeps its logical order', () => {
    const container = renderSurface(buildChequeRuntimeData(CHEQUE_000002));
    const s = styleFor(container, 'chequeDate');
    expect(s.direction).toBe('ltr');
    expect(s.unicodeBidi).toBe('isolate');
    expect(screen.getByText(EXPECTED_DATE)).toBeInTheDocument();
  });

  it('isolates the numeric amount and the cheque number to LTR', () => {
    const container = renderSurface(buildChequeRuntimeData(CHEQUE_000002));
    for (const binding of ['amount', 'chequeNumber']) {
      const s = styleFor(container, binding);
      expect(s.direction, binding).toBe('ltr');
      expect(s.unicodeBidi, binding).toBe('isolate');
    }
  });

  it('leaves Arabic beneficiary and tafqeet in the inherited RTL direction', () => {
    const container = renderSurface(buildChequeRuntimeData(CHEQUE_000002));
    for (const binding of ['beneficiary', 'amountInWords']) {
      const s = styleFor(container, binding);
      expect(s.direction, binding).toBe('');
      expect(s.unicodeBidi, binding).toBe('');
    }
  });

  it('isolates exactly the declared Latin-ordered keys and nothing else', () => {
    expect([...LTR_ISOLATED_KEYS].sort()).toEqual(['amount', 'chequeDate', 'chequeNumber', 'issueDate']);
  });

  it('bidi isolation does not disturb alignment (text-align is physical)', () => {
    const container = renderSurface(buildChequeRuntimeData(CHEQUE_000002));
    // The legacy date/amount fields are centered; isolation must not change that.
    expect(styleFor(container, 'chequeDate').textAlign).toBe('center');
    expect(styleFor(container, 'amount').textAlign).toBe('center');
    expect(styleFor(container, 'beneficiary').textAlign).toBe('right');
  });
});

// ── 4. Print-mode integrity: no mock, no placeholder ─────────────────────────

describe('print-mode runtime integrity', () => {
  it('raises an error and blocks printing when a REQUIRED binding cannot resolve', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), {
      ...buildChequeRuntimeData(CHEQUE_000002),
      chequeDate: '',
    });
    expect(model.meta.hasErrors).toBe(true);
    const issue = model.issues.find((i) => i.code === 'UNRESOLVED_DATA_BINDING' && i.fieldId === 'date');
    expect(issue?.severity).toBe('error');
    expect(issue?.message).toContain('chequeDate');
  });

  it('renders EMPTY — never the sample value — for an unresolved required field', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), {
      ...buildChequeRuntimeData(CHEQUE_000002),
      chequeDate: '',
    });
    expect(textOf(model, 'date')).toBe('');
    expect(textOf(model, 'date')).not.toBe(LEGACY_SAMPLE_DATE);
  });

  it('flags every required key that is missing', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), {});
    const errored = model.issues
      .filter((i) => i.code === 'UNRESOLVED_DATA_BINDING' && i.severity === 'error')
      .map((i) => i.fieldId)
      .sort();
    expect(errored).toEqual(['amount', 'amountInWords', 'beneficiary', 'date']);
    expect(model.meta.hasErrors).toBe(true);
  });

  it('a supporting (non-required) unresolved binding is info-level and does not block', () => {
    const model = resolveChequeTemplateForPrint(
      { surface: SURFACE, fields: [field({ id: 'br', binding: 'branchName', value: 'الفرع الرئيسي' })] },
      buildChequeRuntimeData(CHEQUE_000002), // branchName is deliberately ''
    );
    expect(model.meta.hasErrors).toBe(false);
    const issue = model.issues.find((i) => i.code === 'UNRESOLVED_DATA_BINDING');
    expect(issue?.severity).toBe('info');
    expect(textOf(model, 'br')).toBe('الفرع الرئيسي');
  });

  it('leaves genuinely static fields completely alone in print mode', () => {
    const model = resolveChequeTemplateForPrint(
      { surface: SURFACE, fields: [field({ id: 'note', value: 'نص ثابت' }), field({ id: 'c', binding: 'custom', value: 'مخصص' })] },
      buildChequeRuntimeData(CHEQUE_000002),
    );
    expect(model.issues.some((i) => i.code === 'UNRESOLVED_DATA_BINDING')).toBe(false);
    expect(textOf(model, 'note')).toBe('نص ثابت');
    expect(textOf(model, 'c')).toBe('مخصص');
    expect(model.meta.hasErrors).toBe(false);
  });

  it('MOCK_RUNTIME_DATA is structurally unreachable from the print path', () => {
    // Every mock value, with NO data supplied at all: none may appear.
    const model = resolveChequeTemplateForPrint(legacyTemplate(), {});
    const printed = model.fields.map((f) => f.text).join(' ');
    for (const mockValue of Object.values(MOCK_RUNTIME_DATA)) {
      expect(printed, `mock value leaked: ${mockValue}`).not.toContain(mockValue);
    }
  });

  it('a partial runtime payload never has missing keys filled in from the mock', () => {
    const model = resolveChequeTemplateForPrint(legacyTemplate(), { chequeDate: EXPECTED_DATE });
    expect(textOf(model, 'date')).toBe(EXPECTED_DATE);
    expect(textOf(model, 'beneficiary')).not.toBe(MOCK_RUNTIME_DATA.beneficiary);
    expect(textOf(model, 'amount')).not.toBe(MOCK_RUNTIME_DATA.amount);
    expect(model.meta.hasErrors).toBe(true);
  });

  it('missing runtime data altogether is an error, not a mock render', () => {
    for (const bad of [undefined, null]) {
      const model = resolveChequeTemplateForPrint(legacyTemplate(), bad);
      expect(model.meta.hasErrors).toBe(true);
      expect(model.fields).toEqual([]);
      expect(model.issues[0].code).toBe('UNRESOLVED_DATA_BINDING');
    }
  });

  it('DESIGN mode keeps its mock + static-fallback behaviour (designer preview unchanged)', () => {
    const model = resolveChequeTemplate(legacyTemplate());
    expect(model.meta.hasErrors).toBe(false);
    expect(textOf(model, 'date')).toBe(MOCK_RUNTIME_DATA.chequeDate);
    expect(model.issues.some((i) => i.code === 'UNRESOLVED_DATA_BINDING')).toBe(false);
  });

  it('every required print key is one the cheque record actually supplies', () => {
    const data = buildChequeRuntimeData(CHEQUE_000002) as Record<SemanticKey, string | undefined>;
    for (const key of REQUIRED_PRINT_KEYS) {
      expect(data[key], `buildChequeRuntimeData does not supply required key ${key}`).toBeTruthy();
    }
  });
});

// ── 5. Print page state safety ───────────────────────────────────────────────

describe('ChequeTemplatePrintPage — state safety', () => {
  afterEach(cleanup);

  const RUNTIME_A = buildChequeRuntimeData(CHEQUE_000002);
  const RUNTIME_B = buildChequeRuntimeData({ ...CHEQUE_000002, chequeNumber: '000003', beneficiaryName: 'مستفيد آخر', amount: 250 });
  const TRACK = (id: number) => ({ id, status: 'DRAFT' as const, chequeNumber: `C-${id}`, beneficiaryName: 'x' });

  function renderPage(state: unknown) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/cheque-template/print', state }]}>
        <ChequeTemplatePrintPage />
      </MemoryRouter>,
    );
  }

  it('rejects a print state with no runtimeData and fails safely', () => {
    renderPage({ surface: SURFACE, fields: LEGACY_FIELDS });
    expect(screen.getByText(/تعذّر تحميل بيانات الطباعة/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /طباعة/ })).not.toBeInTheDocument();
  });

  it('rejects a batch whose items lack runtimeData', () => {
    renderPage({ surface: SURFACE, fields: LEGACY_FIELDS, ctppBatchItems: [{ tracking: TRACK(1) }] });
    expect(screen.getByText(/تعذّر تحميل بيانات الطباعة/)).toBeInTheDocument();
  });

  it('rejects an empty batch and an entirely absent state', () => {
    renderPage({ surface: SURFACE, fields: LEGACY_FIELDS, ctppBatchItems: [] });
    expect(screen.getByText(/تعذّر تحميل بيانات الطباعة/)).toBeInTheDocument();
    cleanup();
    renderPage(undefined);
    expect(screen.getByText(/تعذّر تحميل بيانات الطباعة/)).toBeInTheDocument();
  });

  it('renders a valid single print state with the real cheque values', () => {
    renderPage({ surface: SURFACE, fields: LEGACY_FIELDS, runtimeData: RUNTIME_A, tracking: TRACK(46) });
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeEnabled();
    expect(screen.getByText(EXPECTED_DATE)).toBeInTheDocument();
    expect(screen.getByText(EXPECTED_AMOUNT)).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_SAMPLE_DATE)).not.toBeInTheDocument();
  });

  it('blocks printing (button disabled) when the model has an unresolved required binding', () => {
    renderPage({
      surface: SURFACE,
      fields: LEGACY_FIELDS,
      runtimeData: { ...RUNTIME_A, chequeDate: '' },
      tracking: TRACK(46),
    });
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeDisabled();
    expect(screen.getByText(/لا يمكن الطباعة/)).toBeInTheDocument();
    expect(screen.queryByText(LEGACY_SAMPLE_DATE)).not.toBeInTheDocument();
  });

  /**
   * Drives a REAL same-route navigation, which is the scenario the audit flagged:
   * React Router does not remount the element, so `location.state` changes under a
   * component whose index/per-item state was scoped to the original mount.
   * (`MemoryRouter`'s `initialEntries` is mount-only, so re-rendering it cannot
   * reproduce this — an actual `navigate()` is required.)
   */
  function Renavigate({ to }: { to: unknown }) {
    const navigate = useNavigate();
    return (
      <button type="button" onClick={() => navigate('/cheque-template/print', { state: to })}>
        RENAV
      </button>
    );
  }

  function renderSameRouteNav(first: unknown, second: unknown) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={[{ pathname: '/cheque-template/print', state: first }]}>
        <Routes>
          <Route
            path="/cheque-template/print"
            element={<><Renavigate to={second} /><ChequeTemplatePrintPage /></>}
          />
        </Routes>
      </MemoryRouter>,
    );
  }

  const batch = (n: number, runtimeData: RuntimeData) => ({
    surface: SURFACE,
    fields: LEGACY_FIELDS,
    ctppBatchItems: Array.from({ length: n }, (_, i) => ({ runtimeData, tracking: TRACK(i + 1) })),
  });

  it('an out-of-range activeIndex cannot crash — a shorter new state clamps and resets', () => {
    // Browse to the last item of a 3-item batch, then navigate the SAME route to a
    // single-item state: the stale index must not address past the end.
    const single = { surface: SURFACE, fields: LEGACY_FIELDS, runtimeData: RUNTIME_B, tracking: TRACK(9) };
    renderSameRouteNav(batch(3, RUNTIME_A), single);

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('الشيك 3 من 3')).toBeInTheDocument();

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'RENAV' }))).not.toThrow();

    // Single item ⇒ no navigator bar, and the page still renders a printable cheque.
    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /طباعة/ })).toBeEnabled();
    expect(screen.getByText(EXPECTED_DATE)).toBeInTheDocument();
  });

  it('cheque A per-item state cannot leak into a new print state for cheque B', () => {
    renderSameRouteNav(batch(2, RUNTIME_A), batch(2, RUNTIME_B));

    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('الشيك 2 من 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'RENAV' }));

    // Index reset to the FIRST item of the new batch, status back to "not printed".
    expect(screen.getByText('الشيك 1 من 2')).toBeInTheDocument();
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();
  });

  it('itemStates always correspond to the CURRENT items after a state change', () => {
    // 1 item → 3 items: the per-item state array must grow to match, and every
    // item must report the fresh "not printed" status rather than undefined.
    const single = { surface: SURFACE, fields: LEGACY_FIELDS, runtimeData: RUNTIME_A, tracking: TRACK(1) };
    renderSameRouteNav(single, batch(3, RUNTIME_B));

    expect(screen.queryByRole('button', { name: 'التالي' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'RENAV' }));

    expect(screen.getByText('الشيك 1 من 3')).toBeInTheDocument();
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    fireEvent.click(screen.getByRole('button', { name: 'التالي' }));
    expect(screen.getByText('الشيك 3 من 3')).toBeInTheDocument();
    expect(screen.getByText('غير مطبوع')).toBeInTheDocument();
  });
});

// ── 6. Classic ↔ Designer parity ─────────────────────────────────────────────

describe('Classic ↔ Designer canonical parity', () => {
  /**
   * Classic (`ChequePrintOutput`) formats the date inline and the amount through
   * the same central formatter. This pins the two providers to identical canonical
   * strings so they can never drift apart again.
   */
  function classicValues(record: ChequeRecordInput) {
    const amount = Number(record.amount) || 0;
    const d = new Date(record.chequeDate);
    const date = `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;
    return { date, amount: fmtChequeAmount(amount), words: amountToWordsKWD(amount, 'ar') };
  }

  it.each([
    CHEQUE_000002,
    { ...CHEQUE_000002, amount: 5550.25 },
    { ...CHEQUE_000002, amount: 90 },
    { ...CHEQUE_000002, chequeDate: '2026-02-03T00:00:00.000Z', amount: 1550 },
  ])('both providers produce the same date and amount for amount=$amount', (record) => {
    const classic = classicValues(record);
    const designer = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(record));

    expect(textOf(designer, 'date')).toBe(classic.date);
    expect(textOf(designer, 'amount')).toBe(classic.amount);
    expect(textOf(designer, 'amountInWords')).toBe(classic.words);
  });

  it('cheque 000002 — the audit fixture — is canonical on both providers', () => {
    const classic = classicValues(CHEQUE_000002);
    expect(classic.date).toBe(EXPECTED_DATE);
    expect(classic.amount).toBe(EXPECTED_AMOUNT);

    const designer = resolveChequeTemplateForPrint(legacyTemplate(), buildChequeRuntimeData(CHEQUE_000002));
    expect(textOf(designer, 'date')).toBe(EXPECTED_DATE);
    expect(textOf(designer, 'amount')).toBe(EXPECTED_AMOUNT);
  });
});
