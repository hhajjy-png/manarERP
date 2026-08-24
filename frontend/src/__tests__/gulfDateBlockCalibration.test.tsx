// @vitest-environment jsdom
/**
 * The cheque date is ONE calibration object — «قالب شيك الخليج».
 *
 * WHAT WAS WRONG. The date was three Designer fields (day, month, year). Visual
 * review found the consequences: an outer frame plus three inner frames, digits
 * that did not share a baseline, and a selection/geometry model heavier than the
 * problem. An attempt to hold the three together with a "move group" was a patch
 * on that shape and was removed.
 *
 * WHAT IT IS NOW. One field, `chequeDate`, at X 135 / Y 23 / W 28 / H 7 mm. Its
 * day / month / year are INTERNAL SLOTS of that one field — rendering detail, not
 * objects: nothing can select, frame, resize or rotate them, they share the
 * block's box and typography (so one baseline is structural, not a coincidence),
 * and their offsets are percentages of the block, so moving the block moves them
 * with no group logic in the system at all.
 *
 * The printed positions are unchanged: 135 / 144 / 153 mm, all at y = 23.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

import ChequeTemplateManager from '../components/chequeTemplateManager/ChequeTemplateManager';
import ChequeRenderSurface from '../components/chequeTemplateManager/ChequeRenderSurface';
import {
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_SURFACE_CM,
  GULF_CHEQUE_WIDTH_MM,
  GULF_DATE_SLOTS_MM,
  GULF_LOCAL_FIELDS,
  gulfFactoryProfile,
  parseGulfProfile,
  serializeGulfProfile,
} from '../modules/chequePrint';
import type { GulfA4Profile } from '../modules/chequePrint';
import type { DesignerField } from '../modules/chequeTemplateDesigner';
import { resolveChequeTemplateForPrint } from '../modules/chequeTemplateRuntime';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';

const CHEQUE = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};
const RUNTIME = buildChequeRuntimeData(CHEQUE);

const DATE_ID = 'chequeDate';
const SLOT_KEYS = ['chequeDay', 'chequeMonth', 'chequeYear'] as const;

function byId(fields: DesignerField[], id: string): DesignerField {
  return fields.find((f) => f.id === id)!;
}

function printModel(profile: GulfA4Profile = gulfFactoryProfile()) {
  return resolveChequeTemplateForPrint({ surface: profile.surface, fields: profile.fields }, RUNTIME);
}

/** The one absolute truth this rebuild must preserve: where the digits land, in mm. */
function slotXMm(profile: GulfA4Profile, key: string): number {
  const block = byId(profile.fields, DATE_ID);
  const slot = block.slots!.find((s) => s.key === key)!;
  const blockXMm = (block.x / 100) * GULF_CHEQUE_WIDTH_MM;
  const blockWidthMm = (block.width / 100) * GULF_CHEQUE_WIDTH_MM;
  return blockXMm + (slot.xPercent / 100) * blockWidthMm;
}

// ── 1. One calibration entity for the date ───────────────────────────────────

describe('the date is a single calibration entity', () => {
  it('has exactly ONE date field in the profile', () => {
    const fields = gulfFactoryProfile().fields;
    const dateFields = fields.filter((f) => f.id === DATE_ID || SLOT_KEYS.includes(f.id as typeof SLOT_KEYS[number]));
    expect(dateFields.map((f) => f.id)).toEqual([DATE_ID]);
  });

  it('has no day / month / year fields at all', () => {
    const ids = gulfFactoryProfile().fields.map((f) => f.id);
    for (const gone of SLOT_KEYS) {
      expect(ids, gone).not.toContain(gone);
    }
    expect(ids).toEqual(['beneficiary', 'chequeDate', 'amountInWords', 'amount']);
  });

  it('carries the approved block geometry — X 135, Y 23, W 28, H 7 mm', () => {
    const block = GULF_LOCAL_FIELDS.find((f) => f.id === DATE_ID)!;
    expect({ xMm: block.xMm, yMm: block.yMm, widthMm: block.widthMm, heightMm: block.heightMm })
      .toEqual({ xMm: 135, yMm: 23, widthMm: 28, heightMm: 7 });
  });

  it('declares its three cells as internal slots at 0 / 9 / 18 mm', () => {
    expect(GULF_DATE_SLOTS_MM.map((s) => ({ key: s.key, xMm: s.xMm, widthMm: s.widthMm }))).toEqual([
      { key: 'chequeDay', xMm: 0, widthMm: 6 },
      { key: 'chequeMonth', xMm: 9, widthMm: 6 },
      { key: 'chequeYear', xMm: 18, widthMm: 10 },
    ]);
  });

  it('places the digits exactly where they always printed — 135 / 144 / 153 mm', () => {
    const profile = gulfFactoryProfile();
    expect(slotXMm(profile, 'chequeDay')).toBeCloseTo(135, 9);
    expect(slotXMm(profile, 'chequeMonth')).toBeCloseTo(144, 9);
    expect(slotXMm(profile, 'chequeYear')).toBeCloseTo(153, 9);
  });

  it('leaves no group concept anywhere in the field model', () => {
    for (const f of gulfFactoryProfile().fields) {
      expect(f, f.id).not.toHaveProperty('groupId');
    }
  });
});

// ── 2. One baseline, by construction ─────────────────────────────────────────

describe('the three cells share one baseline', () => {
  it('share the block’s y, height, font size and weight — there is no per-cell value', () => {
    const block = byId(gulfFactoryProfile().fields, DATE_ID);
    // A slot carries ONLY a horizontal offset and width. Nothing vertical, no
    // typography — so no per-cell property exists that could drift.
    for (const slot of block.slots!) {
      expect(Object.keys(slot).sort()).toEqual(['key', 'widthPercent', 'xPercent']);
    }
    expect(block.y).toBeCloseTo((23 / GULF_CHEQUE_HEIGHT_MM) * 100, 9);
    expect(block.fontSize).toBe(14);
    expect(block.fontWeight).toBe(700);
  });

  it('renders every cell at the same top and height on the print surface', () => {
    const { container } = render(<ChequeRenderSurface model={printModel()} showBackground={false} />);
    const slots = Array.from(container.querySelectorAll<HTMLElement>('.crs-slot'));
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.dataset.slot)).toEqual([...SLOT_KEYS]);
    // Vertical geometry comes from the shared class, never from inline styles —
    // so no cell can carry a different y or height.
    for (const s of slots) {
      expect(s.style.top).toBe('');
      expect(s.style.height).toBe('');
      expect(s.style.fontSize).toBe(slots[0].style.fontSize);
      expect(s.style.fontWeight).toBe(slots[0].style.fontWeight);
    }
  });

  it('renders the date as three cells of ONE field box', () => {
    const { container } = render(<ChequeRenderSurface model={printModel()} showBackground={false} />);
    const dateBoxes = Array.from(container.querySelectorAll('.crs-field')).filter(
      (box) => box.querySelector('.crs-slot'),
    );
    expect(dateBoxes).toHaveLength(1);
    expect(dateBoxes[0].querySelectorAll('.crs-slot')).toHaveLength(3);
    expect(Array.from(dateBoxes[0].querySelectorAll('.crs-slot')).map((s) => s.textContent))
      .toEqual(['02', '08', '2026']);
  });
});

// ── 3. In the studio: one frame, one object ──────────────────────────────────

describe('the calibration studio', () => {
  afterEach(cleanup);

  function renderStudio(profile: GulfA4Profile = gulfFactoryProfile()) {
    return render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}>
        <ChequeTemplateManager chequeRecord={CHEQUE} gulfProfile={profile} onGulfProfileSaved={vi.fn()} />
      </MemoryRouter>,
    );
  }

  /** The one editor wrapper that contains the date cells. */
  function dateWrapper(container: HTMLElement): HTMLElement {
    const el = Array.from(container.querySelectorAll<HTMLElement>('.ctd-field-wrapper'))
      .find((w) => w.querySelector('.ctd-field-slot'));
    if (!el) throw new Error('no date block in the designer');
    return el;
  }

  it('exposes ONE selectable object for the date, with three inert cells inside it', () => {
    const { container } = renderStudio();
    const wrappers = Array.from(container.querySelectorAll('.ctd-field-wrapper'));
    // Four fields: payee, date block, tafqeet, amount.
    expect(wrappers).toHaveLength(4);
    const withSlots = wrappers.filter((w) => w.querySelector('.ctd-field-slot'));
    expect(withSlots).toHaveLength(1);
    expect(withSlots[0].querySelectorAll('.ctd-field-slot')).toHaveLength(3);
    expect(Array.from(withSlots[0].querySelectorAll('.ctd-field-slot')).map((s) => s.textContent))
      .toEqual(['02', '08', '2026']);
  });

  it('clicking any cell selects the date BLOCK — one frame, no inner frames or handles', () => {
    const { container } = renderStudio();
    const block = dateWrapper(container);
    const cells = Array.from(block.querySelectorAll<HTMLElement>('.ctd-field-slot'));

    for (const cell of cells) {
      fireEvent.click(cell);
      // Exactly one selected object in the whole editor, and it is the block.
      const selected = Array.from(container.querySelectorAll('.ctd-field-wrapper.selected'));
      expect(selected, cell.dataset.slot).toHaveLength(1);
      expect(selected[0]).toBe(block);
    }

    // No group frame survives from the previous attempt.
    expect(container.querySelectorAll('[data-testid="ctd-group-frame"]')).toHaveLength(0);
    // Handles belong to the block, not to a cell: none live inside a slot.
    for (const cell of cells) {
      expect(cell.querySelectorAll('.ctd-field-handle')).toHaveLength(0);
      expect(cell.querySelectorAll('.ctd-field-rotation-handle')).toHaveLength(0);
    }
    expect(block.querySelectorAll('.ctd-field-handle')).toHaveLength(4);
    expect(block.querySelectorAll('.ctd-field-rotation-handle')).toHaveLength(1);
  });

  it('a drag on the block moves the whole date, cells and all', () => {
    const { container } = renderStudio();
    const layer = container.querySelector('.ctd-field-layer') as HTMLElement;
    layer.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 200, width: 400, height: 200, toJSON: () => ({}) }) as DOMRect;
    const block = dateWrapper(container);
    block.setPointerCapture = () => {};
    block.releasePointerCapture = () => {};
    block.hasPointerCapture = () => true;

    const beforeLeft = parseFloat(block.style.left);
    const beforeTop = parseFloat(block.style.top);
    const cellOffsets = Array.from(block.querySelectorAll<HTMLElement>('.ctd-field-slot'))
      .map((s) => s.style.left);

    fireEvent.click(block);
    fireEvent.pointerDown(block, { pointerId: 1, clientX: 200, clientY: 100 });
    fireEvent.pointerMove(block, { pointerId: 1, clientX: 160, clientY: 120 });
    fireEvent.pointerUp(block, { pointerId: 1 });

    const moved = dateWrapper(container);
    expect(parseFloat(moved.style.left)).not.toBeCloseTo(beforeLeft, 6);
    expect(parseFloat(moved.style.top)).not.toBeCloseTo(beforeTop, 6);
    // The cells are positioned INSIDE the block, so their offsets are untouched —
    // the date moved as one object with nothing to keep in sync.
    expect(Array.from(moved.querySelectorAll<HTMLElement>('.ctd-field-slot')).map((s) => s.style.left))
      .toEqual(cellOffsets);
  });

  it('a keyboard nudge moves the whole date block', () => {
    const { container } = renderStudio();
    const block = dateWrapper(container);
    const beforeLeft = parseFloat(block.style.left);
    const cellOffsets = Array.from(block.querySelectorAll<HTMLElement>('.ctd-field-slot')).map((s) => s.style.left);

    fireEvent.click(block);
    fireEvent.keyDown(window, { key: 'ArrowRight' });

    const moved = dateWrapper(container);
    expect(parseFloat(moved.style.left)).toBeGreaterThan(beforeLeft);
    expect(Array.from(moved.querySelectorAll<HTMLElement>('.ctd-field-slot')).map((s) => s.style.left))
      .toEqual(cellOffsets);
  });

  it('an X/Y property edit moves the whole date block', () => {
    const { container } = renderStudio();
    const block = dateWrapper(container);
    fireEvent.click(block);

    const xInput = Array.from(container.querySelectorAll<HTMLElement>('.ctd-inspector-properties .ctd-field'))
      .find((row) => row.querySelector('label')?.textContent === 'س (%)')
      ?.querySelector('input') as HTMLInputElement;
    expect(xInput).toBeTruthy();
    fireEvent.change(xInput, { target: { value: '60' } });

    const moved = dateWrapper(container);
    expect(parseFloat(moved.style.left)).toBeCloseTo(60, 6);
    // Cells still at 0 / 9 / 18 mm of the block — they are part of it.
    expect(Array.from(moved.querySelectorAll<HTMLElement>('.ctd-field-slot')).map((s) => s.dataset.slot))
      .toEqual([...SLOT_KEYS]);
  });
});

// ── 4. Persistence, preview and print agree ──────────────────────────────────

describe('persistence, preview and print', () => {
  it('keeps the block position and its slots across save → load', () => {
    const factory = gulfFactoryProfile();
    const movedProfile: GulfA4Profile = {
      ...factory,
      fields: factory.fields.map((f) => (f.id === DATE_ID ? { ...f, x: f.x - 5, y: f.y + 2 } : f)),
    };
    const reloaded = parseGulfProfile(serializeGulfProfile(movedProfile));
    const block = byId(reloaded.fields, DATE_ID);
    expect(block.x).toBeCloseTo(byId(movedProfile.fields, DATE_ID).x, 9);
    expect(block.y).toBeCloseTo(byId(movedProfile.fields, DATE_ID).y, 9);
    expect(block.slots!.map((s) => s.key)).toEqual([...SLOT_KEYS]);
    expect(block.slots).toEqual(byId(factory.fields, DATE_ID).slots);
  });

  it('gives preview and physical print the SAME resolved slot geometry', () => {
    const factory = gulfFactoryProfile();
    const moved: GulfA4Profile = {
      ...factory,
      fields: factory.fields.map((f) => (f.id === DATE_ID ? { ...f, x: f.x + 4 } : f)),
    };
    const preview = printModel(moved);
    const print = printModel(moved);
    const p = preview.fields.find((f) => f.id === DATE_ID)!;
    const q = print.fields.find((f) => f.id === DATE_ID)!;
    expect(q.geometry).toEqual(p.geometry);
    expect(q.slots).toEqual(p.slots);
    // And the moved block carries its cells: +4% of 180 mm = +7.2 mm each.
    expect(slotXMm(moved, 'chequeDay')).toBeCloseTo(135 + 7.2, 6);
    expect(slotXMm(moved, 'chequeMonth')).toBeCloseTo(144 + 7.2, 6);
    expect(slotXMm(moved, 'chequeYear')).toBeCloseTo(153 + 7.2, 6);
  });

  it('resolves the real cheque date into the three cells and blocks a missing one', () => {
    const ok = printModel();
    expect(ok.meta.hasErrors).toBe(false);
    expect(ok.fields.find((f) => f.id === DATE_ID)!.slots.map((s) => s.text)).toEqual(['02', '08', '2026']);

    const factory = gulfFactoryProfile();
    const missing = resolveChequeTemplateForPrint(
      { surface: factory.surface, fields: factory.fields },
      { ...RUNTIME, chequeMonth: '' },
    );
    expect(missing.meta.hasErrors).toBe(true);
    expect(missing.issues.some((i) => i.code === 'UNRESOLVED_DATA_BINDING' && i.fieldId === DATE_ID)).toBe(true);
  });

  it('restores X = 135 mm, Y = 23 mm on reset to factory', () => {
    const block = byId(gulfFactoryProfile().fields, DATE_ID);
    expect((block.x / 100) * GULF_CHEQUE_WIDTH_MM).toBeCloseTo(135, 9);
    expect((block.y / 100) * GULF_CHEQUE_HEIGHT_MM).toBeCloseTo(23, 9);
    expect(GULF_CHEQUE_SURFACE_CM).toEqual({ widthCm: 18, heightCm: 9 });
  });

  it('leaves the payee, tafqeet and amount coordinates untouched', () => {
    expect(GULF_LOCAL_FIELDS.filter((f) => f.id !== DATE_ID).map((f) => ({ id: f.id, xMm: f.xMm, yMm: f.yMm, widthMm: f.widthMm, heightMm: f.heightMm }))).toEqual([
      { id: 'beneficiary', xMm: 8, yMm: 23.5, widthMm: 108, heightMm: 7 },
      { id: 'amountInWords', xMm: 10, yMm: 33, widthMm: 105, heightMm: 16 },
      { id: 'amount', xMm: 132, yMm: 40, widthMm: 38.5, heightMm: 8.5 },
    ]);
  });
});
