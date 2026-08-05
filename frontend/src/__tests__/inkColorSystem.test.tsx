// @vitest-environment jsdom
/**
 * Ink Color System v2 — signature/stamp color is now PER-ELEMENT (independent for
 * signature vs stamp), stored on `BrandingElementLayout.inkMode` inside the SAME
 * `print.brandingLayout` record every document's position/size already lives in — no
 * second store, no parallel Design Mode. `localStorage['manar.inkMode']` (v1's only
 * source of truth) is demoted to a READ-ONLY fallback for elements that have never
 * been given their own color, so no pre-v2 document's appearance changes silently.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, cleanup, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { readFileSync } from 'node:fs';
import ApprovalSection from '../forms/shared/ApprovalSection';
import InkColorFilterDefs from '../print-templates/designer/InkColorFilterDefs';
import {
  DEFAULT_ELEMENT_LAYOUT,
  clampBrandingElementLayout,
  parseBrandingLayout,
  serializeBrandingLayout,
  getBrandingLayoutForDocument,
} from '../print-templates/utils/brandingLayout';
import {
  getInkFilterStyle,
  resolveInkMode,
  NEW_INK_COLOR_IDS,
  INK_COLOR_HEX,
  INK_MODE_LABELS,
  type InkMode,
  type NewInkColorId,
} from '../print-templates/utils/inkFilter';
import { FORM_BRANDING_DOC_KEYS } from '../print-templates/engine/types';
import type { BrandingLayout, PrintBrandingLayoutSettings } from '../print-templates/engine/types';

vi.mock('../api/client', () => ({
  api: { put: vi.fn(() => Promise.resolve()) },
  errorMessage: (e: unknown) => String(e),
}));

import { useBrandingDesigner } from '../print-templates/hooks/useBrandingDesigner';

const SIG = 'data:image/png;base64,SIG';
const STAMP = 'data:image/png;base64,STAMP';
const el = (over: Partial<typeof DEFAULT_ELEMENT_LAYOUT> = {}) => ({ ...DEFAULT_ELEMENT_LAYOUT, ...over });
const pair = (over: Partial<BrandingLayout> = {}): BrandingLayout => ({ signature: el(), stamp: el(), ...over });

/** jsdom's CSSOM re-quotes the url() fragment on round-trip (`url("#id")`); real
 *  browsers keep it bare. Normalize before comparing so the assertion targets the
 *  filter id, not a jsdom serialization quirk unrelated to this feature. */
const normalizeUrlFilter = (filter: string) => filter.replace(/url\(["']?(#[^"')]+)["']?\)/, 'url($1)');

beforeEach(() => localStorage.clear());
afterEach(cleanup);

// ── 1 · Backward-compat resolution ─────────────────────────────────────────────
describe('Backward compatibility — legacy localStorage fallback, no silent appearance change', () => {
  it('an element with no saved color falls back to the legacy global default (original when unset)', () => {
    expect(resolveInkMode(undefined)).toBe('original');
  });

  it('a pre-v2 blue-ink choice is preserved, rendering the EXACT old CSS filter string', () => {
    localStorage.setItem('manar.inkMode', 'blue-ink');
    expect(resolveInkMode(undefined)).toBe('blue-ink');
    expect(getInkFilterStyle('blue-ink')).toEqual({ filter: 'sepia(100%) saturate(200%) hue-rotate(190deg)' });
  });

  it('a pre-v2 black choice is preserved, rendering the EXACT old CSS filter string', () => {
    localStorage.setItem('manar.inkMode', 'black');
    expect(resolveInkMode(undefined)).toBe('black');
    expect(getInkFilterStyle('black')).toEqual({ filter: 'grayscale(100%) brightness(0.85) contrast(1.1)' });
  });

  it('original produces no filter at all — a never-customized element with no legacy override is untouched', () => {
    expect(getInkFilterStyle('original')).toEqual({});
    expect(getInkFilterStyle(undefined)).toEqual({});
  });

  it("an element's OWN saved color always wins over the legacy global default", () => {
    localStorage.setItem('manar.inkMode', 'blue-ink');
    expect(resolveInkMode('royal-blue')).toBe('royal-blue');
  });

  it('parseBrandingLayout accepts pre-v2 data with no inkMode field at all on any element', () => {
    const legacy = JSON.stringify({
      invoice: pair(),
      quotation: pair(),
      'salary-certificate': pair({ signature: el({ x: 12 }) }),
    });
    const parsed = parseBrandingLayout(legacy);
    expect(parsed.invoice.signature.inkMode).toBeUndefined();
    expect(parsed['salary-certificate']?.signature.x).toBe(12);
    expect(parsed['salary-certificate']?.signature.inkMode).toBeUndefined();
  });
});

// ── 2 · New colors use SVG feColorMatrix, one stable id per color ─────────────
describe('New ballpoint-blue colors — SVG filter, not the old CSS approximation', () => {
  it('each new color resolves to a stable url(#...) SVG filter reference', () => {
    for (const id of NEW_INK_COLOR_IDS) {
      expect(getInkFilterStyle(id)).toEqual({ filter: `url(#manar-ink-${id})` });
    }
  });

  it('every InkMode value has an Arabic label, including the four new colors', () => {
    const allModes: InkMode[] = ['original', 'black', 'blue-ink', ...NEW_INK_COLOR_IDS];
    for (const mode of allModes) {
      expect(INK_MODE_LABELS[mode]?.length).toBeGreaterThan(0);
    }
  });

  it('renders the <svg><filter> definition only for a new color — never for original/black/blue-ink/undefined', () => {
    const untouchedModes: (InkMode | undefined)[] = ['original', 'black', 'blue-ink', undefined];
    for (const mode of untouchedModes) {
      const { container } = render(<InkColorFilterDefs mode={mode} />);
      expect(container.querySelector('svg')).toBeNull();
      cleanup();
    }
    for (const id of NEW_INK_COLOR_IDS) {
      const { container } = render(<InkColorFilterDefs mode={id} />);
      const filterEl = container.querySelector('filter');
      expect(filterEl?.id).toBe(`manar-ink-${id}`);
      expect(container.querySelector('feColorMatrix')).toBeTruthy();
      cleanup();
    }
  });

  /**
   * Professional Ink Set v1 — twenty shades APPENDED to the four that existed.
   *
   * The colors themselves need no new machinery (the loops above already cover every id
   * in the list), so what these pin is the part that could silently go wrong: an existing
   * color being renamed, recolored, reordered or dropped, and two swatches becoming
   * indistinguishable on screen.
   */
  describe('Professional Ink Set v1 — appended, never disturbing what exists', () => {
    const ORIGINAL_FOUR = ['ballpoint-dark-blue', 'ballpoint-medium-blue', 'royal-blue', 'blue-violet-ink'];
    const NEW_TWENTY: Array<[string, string, string]> = [
      ['ink-sky', '#0062D2', 'الحبر السماوي'],
      ['ink-light-blue', '#005DC8', 'الحبر الأزرق الفاتح'],
      ['ink-classic', '#0058BE', 'الحبر الكلاسيكي'],
      ['ink-bic', '#0054B5', 'حبر Bic'],
      ['ink-standard', '#0050AC', 'الحبر القياسي'],
      ['ink-executive', '#004CA3', 'الحبر التنفيذي'],
      ['ink-official', '#00489B', 'الحبر الرسمي'],
      ['ink-regal', '#004493', 'الحبر الملكي'],
      ['ink-marine', '#00418C', 'الحبر البحري'],
      ['ink-dark', '#003E85', 'الحبر الداكن'],
      ['ink-professional', '#003B7E', 'الحبر الاحترافي'],
      ['ink-velvet', '#003878', 'الحبر المخملي'],
      ['ink-navy', '#003572', 'الحبر الكحلي'],
      ['ink-vintage', '#00326C', 'الحبر العتيق'],
      ['ink-archival', '#003067', 'الحبر الأرشيفي'],
      ['ink-documentary', '#002E62', 'الحبر الوثائقي'],
      ['ink-night', '#002C5D', 'الحبر الليلي'],
      ['ink-deep', '#002A58', 'الحبر العميق'],
      ['ink-imperial', '#002854', 'الحبر الإمبراطوري'],
      ['ink-blue-black', '#002650', 'الحبر الأسود المزرق'],
    ];

    it('keeps the original four first and in their original order — no reordering, no removal', () => {
      expect(NEW_INK_COLOR_IDS.slice(0, 4)).toEqual(ORIGINAL_FOUR);
      for (const id of ORIGINAL_FOUR) {
        expect(INK_COLOR_HEX[id as NewInkColorId]).toBeTruthy();
      }
      // The pre-existing labels are untouched — an operator's chosen color keeps its name.
      expect(INK_MODE_LABELS['royal-blue']).toBe('أزرق ملكي');
      expect(INK_MODE_LABELS['ballpoint-dark-blue']).toBe('أزرق قلم داكن');
    });

    it('appends all twenty with the approved hex and name', () => {
      expect(NEW_INK_COLOR_IDS).toHaveLength(24);
      expect(NEW_INK_COLOR_IDS.slice(4)).toEqual(NEW_TWENTY.map(([id]) => id));
      for (const [id, hex, label] of NEW_TWENTY) {
        expect(INK_COLOR_HEX[id as NewInkColorId]).toBe(hex);
        expect(INK_MODE_LABELS[id as InkMode]).toBe(label);
      }
    });

    /**
     * The duplicate-name rule, enforced at build time rather than by a runtime
     * de-duplicator: if a future color repeats an existing label this fails, and the fix
     * is to number the NEW one — never to rename the old one.
     */
    it('gives every color a distinct label, so no two swatches read the same', () => {
      const labels = Object.values(INK_MODE_LABELS);
      expect(new Set(labels).size).toBe(labels.length);
    });

    it('gives every color a distinct id and hex — no shade is an unreachable duplicate', () => {
      expect(new Set(NEW_INK_COLOR_IDS).size).toBe(NEW_INK_COLOR_IDS.length);
      const hexes = Object.values(INK_COLOR_HEX);
      expect(new Set(hexes).size).toBe(hexes.length);
    });
  });

  it('the feColorMatrix preserves the alpha row (1 in the 4th column) — transparency untouched', () => {
    const { container } = render(<InkColorFilterDefs mode="royal-blue" />);
    const matrix = container.querySelector('feColorMatrix')?.getAttribute('values') ?? '';
    const values = matrix.trim().split(/\s+/).map(Number);
    expect(values).toHaveLength(20); // 4x5 feColorMatrix "matrix" form
    // Alpha row (last row): 0 0 0 1 0 — alpha passes through unchanged, no offset.
    expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
});

// ── 3 · Signature/stamp are fully independent ──────────────────────────────────
describe('Signature and stamp ink colors are independent', () => {
  it('setting one element\'s color leaves its sibling untouched in the data', () => {
    const layout = pair({
      signature: el({ inkMode: 'royal-blue' }),
      stamp: el({ inkMode: 'black' }),
    });
    expect(layout.signature.inkMode).toBe('royal-blue');
    expect(layout.stamp.inkMode).toBe('black');
  });

  it('renders each image with its OWN resolved filter, not a shared global one', () => {
    const layout = pair({
      signature: el({ inkMode: 'ballpoint-dark-blue' }),
      stamp: el({ inkMode: 'black' }),
    });
    const { container } = render(<ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline layout={layout} />);
    const sig = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    const stamp = container.querySelector('img[data-bd-type="stamp"]') as HTMLElement;
    expect(normalizeUrlFilter(sig.style.filter)).toBe('url(#manar-ink-ballpoint-dark-blue)');
    expect(stamp.style.filter).toBe('grayscale(100%) brightness(0.85) contrast(1.1)');
  });

  it('an element left uncustomized still resolves independently via the legacy fallback', () => {
    localStorage.setItem('manar.inkMode', 'blue-ink');
    const layout = pair({ signature: el({ inkMode: 'royal-blue' }) }); // stamp: no inkMode
    const { container } = render(<ApprovalSection signatureUrl={SIG} stampUrl={STAMP} stampInline layout={layout} />);
    const sig = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    const stamp = container.querySelector('img[data-bd-type="stamp"]') as HTMLElement;
    expect(normalizeUrlFilter(sig.style.filter)).toBe('url(#manar-ink-royal-blue)');
    expect(stamp.style.filter).toBe('sepia(100%) saturate(200%) hue-rotate(190deg)');
  });
});

// ── 4 · Geometry is unaffected by color ────────────────────────────────────────
describe('Ink color never affects x/y/scale/opacity/zIndex or page geometry', () => {
  it('clampBrandingElementLayout preserves inkMode through the numeric clamp untouched', () => {
    const clamped = clampBrandingElementLayout(el({ x: 9999, y: -9999, scale: 99, inkMode: 'royal-blue' }));
    expect(clamped.inkMode).toBe('royal-blue');
    expect(clamped.x).toBe(150);
    expect(clamped.y).toBe(-150);
    expect(clamped.scale).toBe(4);
  });

  it('changing inkMode does not alter position/size in the stored layout', () => {
    const base = el({ x: 42, y: -7, scale: 1.6, opacity: 0.75, zIndex: 2 });
    const recolored = { ...base, inkMode: 'blue-violet-ink' as const };
    expect(recolored.x).toBe(base.x);
    expect(recolored.y).toBe(base.y);
    expect(recolored.scale).toBe(base.scale);
    expect(recolored.opacity).toBe(base.opacity);
    expect(recolored.zIndex).toBe(base.zIndex);
  });

  it('the transform/style geometry contribution is identical regardless of ink color', () => {
    const layout = pair({ signature: el({ x: 20, y: -10, scale: 1.3, inkMode: 'royal-blue' }) });
    const { container } = render(<ApprovalSection signatureUrl={SIG} layout={layout} />);
    const img = container.querySelector('img[data-bd-type="signature"]') as HTMLElement;
    expect(img.style.transform).toBe('translateX(-50%) translate(20px, -10px) scale(1.3)');
  });
});

// ── 5 · Storage — same print.brandingLayout record, round-trips per element ───
describe('Storage — inkMode lives in the SAME print.brandingLayout record, per element', () => {
  it('round-trips independent signature/stamp colors through serialize/parse', () => {
    const raw = serializeBrandingLayout({
      invoice: pair({ signature: el({ inkMode: 'royal-blue' }), stamp: el({ inkMode: 'black' }) }),
      quotation: pair(),
      'leave-request': pair({ signature: el({ inkMode: 'blue-violet-ink' }) }),
    });
    const parsed = parseBrandingLayout(raw);
    expect(parsed.invoice.signature.inkMode).toBe('royal-blue');
    expect(parsed.invoice.stamp.inkMode).toBe('black');
    expect(parsed['leave-request']?.signature.inkMode).toBe('blue-violet-ink');
    expect(parsed['leave-request']?.stamp.inkMode).toBeUndefined();
  });

  it('no second Setting key is introduced for color', () => {
    const hookSrc = readFileSync('src/print-templates/hooks/useBrandingDesigner.ts', 'utf8');
    const keys = (hookSrc.match(/key: '[^']+'/g) ?? []) as string[];
    expect(keys).toEqual(["key: 'print.brandingLayout'"]);
  });
});

// ── 6 · Document-type coverage — generic, not hardcoded per document ──────────
describe('Every branding-enabled document resolves per-element color through the SAME generic path', () => {
  it('every registered form key, plus invoice/quotation, round-trips its own inkMode', () => {
    const settings: PrintBrandingLayoutSettings = {
      invoice: pair({ signature: el({ inkMode: 'royal-blue' }) }),
      quotation: pair({ signature: el({ inkMode: 'black' }) }),
    };
    for (const key of FORM_BRANDING_DOC_KEYS) {
      settings[key] = pair({ signature: el({ inkMode: 'ballpoint-medium-blue' }) });
    }
    expect(getBrandingLayoutForDocument(settings, 'invoice').signature.inkMode).toBe('royal-blue');
    expect(getBrandingLayoutForDocument(settings, 'quotation').signature.inkMode).toBe('black');
    for (const key of FORM_BRANDING_DOC_KEYS) {
      expect(getBrandingLayoutForDocument(settings, key).signature.inkMode).toBe('ballpoint-medium-blue');
    }
  });

  it('includes blank-a4-print — the same lookup, no special case for it either', () => {
    expect(FORM_BRANDING_DOC_KEYS).toContain('blank-a4-print');
    const settings: PrintBrandingLayoutSettings = {
      invoice: pair(),
      quotation: pair(),
      'blank-a4-print': pair({ stamp: el({ inkMode: 'blue-violet-ink' }) }),
    };
    expect(getBrandingLayoutForDocument(settings, 'blank-a4-print').stamp.inkMode).toBe('blue-violet-ink');
  });

  it('an undocumented/absent document key resolves to the identity pair — no color invented', () => {
    const resolved = getBrandingLayoutForDocument(undefined, 'purchase-request');
    expect(resolved.signature.inkMode).toBeUndefined();
    expect(resolved.stamp.inkMode).toBeUndefined();
  });
});

// ── 7 · Live hook: independence, reset, undo/redo ──────────────────────────────
describe('useBrandingDesigner — per-element color joins Save/Reset/Undo/Redo', () => {
  function setup() {
    return renderHook(() =>
      useBrandingDesigner({ docType: 'salary-certificate', initialLayout: undefined }),
    );
  }

  it('updateElement sets ONE element\'s color without touching its sibling', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.updateElement('signature', { inkMode: 'royal-blue' }));
    expect(result.current.docLayout.signature.inkMode).toBe('royal-blue');
    expect(result.current.docLayout.stamp.inkMode).toBeUndefined();

    act(() => result.current.updateElement('stamp', { inkMode: 'black' }));
    expect(result.current.docLayout.signature.inkMode).toBe('royal-blue'); // unaffected
    expect(result.current.docLayout.stamp.inkMode).toBe('black');
  });

  it('resetElement clears the color back to undefined (legacy fallback), not a hardcoded value', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.updateElement('signature', { inkMode: 'royal-blue', x: 40 }));
    expect(result.current.docLayout.signature.inkMode).toBe('royal-blue');

    act(() => result.current.resetElement('signature'));
    expect(result.current.docLayout.signature.inkMode).toBeUndefined();
    expect(result.current.docLayout.signature.x).toBe(0);
  });

  it('resetDoc clears color for BOTH elements', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.updateElement('signature', { inkMode: 'royal-blue' }));
    act(() => result.current.updateElement('stamp', { inkMode: 'black' }));
    act(() => result.current.resetDoc());
    expect(result.current.docLayout.signature.inkMode).toBeUndefined();
    expect(result.current.docLayout.stamp.inkMode).toBeUndefined();
  });

  it('undo restores the previous color, redo reapplies it — same history as position/size', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.updateElement('signature', { inkMode: 'royal-blue' }));
    act(() => result.current.updateElement('signature', { inkMode: 'blue-violet-ink' }));
    expect(result.current.docLayout.signature.inkMode).toBe('blue-violet-ink');

    act(() => result.current.undo());
    expect(result.current.docLayout.signature.inkMode).toBe('royal-blue');

    act(() => result.current.redo());
    expect(result.current.docLayout.signature.inkMode).toBe('blue-violet-ink');
  });

  it('a color change does not perturb the element\'s x/y/scale/opacity/zIndex', () => {
    const { result } = setup();
    act(() => result.current.activate());
    act(() => result.current.updateElement('signature', { x: 33, y: -12, scale: 1.4 }));
    const before = { ...result.current.docLayout.signature };
    act(() => result.current.updateElement('signature', { inkMode: 'ballpoint-dark-blue' }));
    const after = result.current.docLayout.signature;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.scale).toBe(before.scale);
    expect(after.opacity).toBe(before.opacity);
    expect(after.zIndex).toBe(before.zIndex);
    expect(after.inkMode).toBe('ballpoint-dark-blue');
  });
});
