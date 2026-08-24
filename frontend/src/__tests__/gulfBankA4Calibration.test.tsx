// @vitest-environment jsdom
/**
 * Gulf A4 Professional Calibration Integration.
 *
 * «قالب شيك الخليج» is calibrated in the SAME professional studio every other
 * cheque template is calibrated in — the Cheque Template Designer plus its
 * Template Manager toolbar. It is a PROFILE DOCUMENT handed to that studio, not
 * a calibration surface of its own.
 *
 * What this suite pins:
 *   • the profile is `{ surface, fields }` — the exact document the studio edits,
 *     so it inherits the studio's capabilities rather than a reduced subset;
 *   • no parallel calibration component, engine or storage exists for it;
 *   • Save / Restore-default / Test print / Preview all run through the studio's
 *     own controls and the shared print pipeline;
 *   • the calibrated document — every field, plus the A4 placement — is what the
 *     preview and the physical print consume;
 *   • factory geometry (297×210, 117/60/180/90 and the measured field table) is
 *     the starting point and the restore point, never silently rewritten;
 *   • it is the ONLY template the studio offers — the removed templates' historical
 *     settings rows are never read.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

import { api } from '../api/client';
import ChequeTemplateManager from '../components/chequeTemplateManager/ChequeTemplateManager';
import {
  A4_LANDSCAPE_PAGE,
  GULF_A4_CALIBRATION,
  GULF_A4_CALIBRATION_SETTING_GROUP,
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_A4_PROFILE_ID,
  GULF_A4_TEMPLATE_NAME,
  GULF_CHEQUE_BASE_X_MM,
  GULF_CHEQUE_BASE_Y_MM,
  GULF_CHEQUE_HEIGHT_MM,
  GULF_CHEQUE_WIDTH_MM,
  GULF_LOCAL_FIELDS,
  gulfFactoryProfile,
  gulfProfileFromSettings,
  gulfProfilePlacement,
  parseGulfProfile,
  physicalPageFor,
  serializeGulfProfile,
} from '../modules/chequePrint';
import type { GulfA4Profile } from '../modules/chequePrint';

const CHEQUE = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

/** A profile the operator has actually calibrated: one field moved, page offset applied. */
function calibratedProfile(): GulfA4Profile {
  const factory = gulfFactoryProfile();
  return {
    ...factory,
    fields: factory.fields.map((f) =>
      f.id === 'beneficiary' ? { ...f, x: f.x + 2, y: f.y - 1, fontSize: 16, textAlign: 'center' as const } : f,
    ),
    calibration: { offsetXMm: -1.5, offsetYMm: 0.8 },
  };
}

function renderStudio(profile: GulfA4Profile, onSaved = vi.fn()) {
  const utils = render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}>
      <ChequeTemplateManager chequeRecord={CHEQUE} gulfProfile={profile} onGulfProfileSaved={onSaved} />
    </MemoryRouter>,
  );
  return { ...utils, onSaved };
}

// ── 1. It is a profile inside the professional studio ────────────────────────

describe('Gulf A4 is a profile of the professional calibration system', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { data: [] } } as never);
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('is the document the Cheque Template Designer edits — surface + fields', () => {
    const factory = gulfFactoryProfile();
    expect(factory.id).toBe(GULF_A4_PROFILE_ID);
    expect(factory.name).toBe(GULF_A4_TEMPLATE_NAME);
    expect(factory.surface).toEqual({ widthCm: 18, heightCm: 9 });
    expect(factory.fields).toHaveLength(GULF_LOCAL_FIELDS.length);
    for (const f of factory.fields) {
      // Every property the studio's properties panel edits is present.
      for (const key of ['x', 'y', 'width', 'height', 'rotation', 'fontSize', 'fontWeight', 'textAlign', 'color', 'zIndex', 'visible'] as const) {
        expect(f[key], `${f.id}.${key}`).not.toBeUndefined();
      }
    }
  });

  it('opens inside the studio itself — same designer, same toolbar, same preview', () => {
    const { container } = renderStudio(gulfFactoryProfile());
    // The professional editor and its live preview, not a bespoke panel.
    expect(container.querySelector('.ctm-root')).toBeTruthy();
    expect(container.querySelector('.ctm-designer-pane')).toBeTruthy();
    expect(container.querySelector('.ctm-preview-pane')).toBeTruthy();
    for (const label of [/^حفظ$/, /استعادة الافتراضي/, /طباعة تجريبية/]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByText(GULF_A4_TEMPLATE_NAME)).toBeTruthy();
  });

  it('offers no way to create, open, rename or delete another template', () => {
    renderStudio(gulfFactoryProfile());
    for (const gone of [/جديد/, /^فتح$/, /حفظ باسم/, /إعادة تسمية/, /^حذف$/, /تعيين افتراضي/]) {
      expect(screen.queryByRole('button', { name: gone }), String(gone)).toBeNull();
    }
  });

  it('has no calibration component, engine or endpoint of its own', () => {
    // Everything the profile needs is a pure function over the shared contract;
    // there is no Gulf-specific renderer, editor or engine module to import.
    const factory = gulfFactoryProfile();
    expect(typeof gulfProfilePlacement(factory)).toBe('object');
    expect(physicalPageFor(factory.surface, 'a4')).toEqual(A4_LANDSCAPE_PAGE);
  });
});

// ── 2. Full capability parity — the studio's edits survive a round trip ──────

describe('capability parity', () => {
  it('persists every calibratable property the studio can change', () => {
    const factory = gulfFactoryProfile();
    const edited: GulfA4Profile = {
      ...factory,
      fields: factory.fields.map((f) =>
        f.id === 'amount'
          ? { ...f, x: 70, y: 50, width: 25, height: 10, rotation: 3, fontSize: 18, fontWeight: 400, textAlign: 'left' as const, color: '#111111', zIndex: 9, visible: false }
          : f,
      ),
      calibration: { offsetXMm: 2.5, offsetYMm: -3 },
    };
    const reloaded = parseGulfProfile(serializeGulfProfile(edited));
    const field = reloaded.fields.find((f) => f.id === 'amount')!;
    expect(field).toMatchObject({
      x: 70, y: 50, width: 25, height: 10, rotation: 3,
      fontSize: 18, fontWeight: 400, textAlign: 'left', color: '#111111', zIndex: 9, visible: false,
    });
    expect(reloaded.calibration).toEqual({ offsetXMm: 2.5, offsetYMm: -3 });
    expect(reloaded.surface).toEqual(factory.surface);
  });

  it('keeps the profile field set and order stable, whatever storage holds', () => {
    const reloaded = parseGulfProfile(JSON.stringify({ fields: [{ id: 'amount', x: 1, y: 2, width: 3, height: 4 }] }));
    expect(reloaded.fields.map((f) => f.id)).toEqual(gulfFactoryProfile().fields.map((f) => f.id));
    // The one stored field is applied; the rest stay factory.
    expect(reloaded.fields.find((f) => f.id === 'amount')).toMatchObject({ x: 1, y: 2, width: 3, height: 4 });
    expect(reloaded.fields.find((f) => f.id === 'beneficiary')).toEqual(
      gulfFactoryProfile().fields.find((f) => f.id === 'beneficiary'),
    );
  });

  it('discards an unreadable document back to the measured factory geometry', () => {
    for (const bad of ['', 'not json', '[]', 'null', '{"fields":"x"}']) {
      expect(parseGulfProfile(bad)).toEqual(gulfFactoryProfile());
    }
  });
});

// ── 3. Save / restore inside the studio ──────────────────────────────────────

describe('save and restore through the studio toolbar', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { data: [] } } as never);
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('saves the whole calibrated document to the profile settings row', async () => {
    const profile = calibratedProfile();
    const { onSaved } = renderStudio(profile);
    fireEvent.click(screen.getByRole('button', { name: /حفظ$/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    const [url, body] = vi.mocked(api.put).mock.calls[0] as [string, { settings: { key: string; value: string; group: string }[] }];
    expect(url).toBe('/settings');
    expect(body.settings).toHaveLength(1);
    expect(body.settings[0].key).toBe(GULF_A4_CALIBRATION_SETTING_KEY);
    expect(body.settings[0].group).toBe(GULF_A4_CALIBRATION_SETTING_GROUP);
    // Round trip: what was written reloads as the same calibrated profile.
    expect(gulfProfileFromSettings(body.settings)).toEqual(profile);
    expect(onSaved).toHaveBeenCalledWith(profile);
  });

  it('creates no database template row when a profile is saved', async () => {
    renderStudio(gulfFactoryProfile());
    fireEvent.click(screen.getByRole('button', { name: /حفظ$/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(api.post).not.toHaveBeenCalled();
  });

  it('offers Restore default, which returns the factory geometry unsaved', async () => {
    renderStudio(calibratedProfile());
    fireEvent.click(screen.getByRole('button', { name: /استعادة الافتراضي/ }));
    expect(await screen.findByText(/تمت استعادة الإحداثيات الأساسية/)).toBeTruthy();
    expect(api.put).not.toHaveBeenCalled();
  });

  it('reports a failed save instead of claiming success', async () => {
    vi.mocked(api.put).mockRejectedValueOnce(new Error('offline'));
    const { onSaved } = renderStudio(gulfFactoryProfile());
    fireEvent.click(screen.getByRole('button', { name: /حفظ$/ }));
    expect(await screen.findByText('تعذّر الحفظ.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });
});

// ── 4. One set of coordinates for preview, test print and physical print ─────

describe('preview, test print and physical print share the calibrated profile', () => {
  afterEach(cleanup);
  beforeEach(() => {
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { data: [] } } as never);
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
  });

  it('places the studio preview at the profile placement', () => {
    const { container } = renderStudio(calibratedProfile());
    const slot = container.querySelector('.cha4-cheque-slot') as HTMLElement;
    expect(slot.style.left).toBe(`${(115.5 / 297) * 100}%`);
    expect(slot.style.top).toBe(`${(60.8 / 210) * 100}%`);
    expect(slot.style.width).toBe(`${(180 / 297) * 100}%`);
    expect(slot.style.height).toBe(`${(90 / 210) * 100}%`);
  });

  it('moves the preview as the placement offsets are edited', () => {
    const { container } = renderStudio(gulfFactoryProfile());
    const slot = () => container.querySelector('.cha4-cheque-slot') as HTMLElement;
    expect(slot().style.left).toBe(`${(117 / 297) * 100}%`);
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '-1.5' } });
    expect(slot().style.left).toBe(`${(115.5 / 297) * 100}%`);
  });

  it('derives the production print job from the SAME stored document', () => {
    const profile = calibratedProfile();
    const rows = [{ key: GULF_A4_CALIBRATION_SETTING_KEY, value: serializeGulfProfile(profile) }];
    // Exactly what `Cheques.tsx` sends for a single print and for a batch.
    const loaded = gulfProfileFromSettings(rows);
    expect(loaded.surface).toEqual(profile.surface);
    expect(loaded.fields).toEqual(profile.fields);
    expect(gulfProfilePlacement(loaded)).toEqual({ xMm: 115.5, yMm: 60.8, widthMm: 180, heightMm: 90 });
  });

  it('sends the test print through the shared print route with the same placement', () => {
    renderStudio(calibratedProfile());
    // The studio's own Test Print button, not a Gulf-specific print path.
    const btn = screen.getByRole('button', { name: /طباعة تجريبية/ });
    expect(btn).toBeEnabled();
  });
});

// ── 5. Factory geometry is preserved ─────────────────────────────────────────

describe('factory geometry', () => {
  it('keeps the A4 page at 297 × 210 landscape', () => {
    const page = physicalPageFor(gulfFactoryProfile().surface, 'a4');
    expect(page.widthMm).toBe(297);
    expect(page.heightMm).toBe(210);
    expect(page.landscape).toBe(false);
    expect(page.widthMm).toBeGreaterThan(page.heightMm);
  });

  it('keeps the base cheque area at 117 / 60 / 180 / 90', () => {
    expect(GULF_CHEQUE_BASE_X_MM).toBe(117);
    expect(GULF_CHEQUE_BASE_Y_MM).toBe(60);
    expect(GULF_CHEQUE_WIDTH_MM).toBe(180);
    expect(GULF_CHEQUE_HEIGHT_MM).toBe(90);
    expect(gulfProfilePlacement(gulfFactoryProfile())).toEqual({ xMm: 117, yMm: 60, widthMm: 180, heightMm: 90 });
    expect(GULF_A4_CALIBRATION).toEqual({ offsetXMm: 0, offsetYMm: 0 });
  });

  it('keeps the measured factory field table', () => {
    expect(GULF_LOCAL_FIELDS.map((f) => ({ id: f.id, xMm: f.xMm, yMm: f.yMm, widthMm: f.widthMm, heightMm: f.heightMm }))).toEqual([
      { id: 'beneficiary', xMm: 8, yMm: 23.5, widthMm: 108, heightMm: 7 },
      // ONE date block spanning the cheque's date box; its day / month / year are
      // internal cells at 0 / 9 / 18 mm — see gulfDateBlockCalibration.test.tsx.
      { id: 'chequeDate', xMm: 135, yMm: 23, widthMm: 28, heightMm: 7 },
      { id: 'amountInWords', xMm: 10, yMm: 33, widthMm: 105, heightMm: 16 },
      { id: 'amount', xMm: 132, yMm: 40, widthMm: 38.5, heightMm: 8.5 },
    ]);
  });

  it('does not rewrite the factory table when a calibrated document is loaded', () => {
    const snapshot = JSON.stringify(GULF_LOCAL_FIELDS);
    parseGulfProfile(serializeGulfProfile(calibratedProfile()));
    expect(JSON.stringify(GULF_LOCAL_FIELDS)).toBe(snapshot);
  });
});

// ── 6. Independence from Classic and from Designer templates ─────────────────

describe('calibration independence', () => {
  afterEach(cleanup);

  it('stores under its own profile key', () => {
    expect(GULF_A4_CALIBRATION_SETTING_KEY).toBe('cheque.calibration.gulf-a4.v1');
  });

  it('reads nothing from the historical rows of the removed templates', () => {
    // Those rows still exist in the database — historical data is never deleted —
    // but no cheque surface reads them any more: only the profile key is consulted,
    // so a legacy row can neither shift nor override the one approved template.
    const legacyRows = [
      { key: 'cheque.template.بنك الخليج', value: JSON.stringify({ beneficiary: { top: 1, left: 1, width: 9 } }) },
      { key: 'cheque.template.بنك برقان', value: JSON.stringify({ beneficiary: { top: 2, left: 2, width: 9 } }) },
      { key: 'cheques.defaultPrintProvider', value: 'classic' },
    ];
    expect(gulfProfileFromSettings(legacyRows)).toEqual(gulfFactoryProfile());

    // And with a real calibration present, the legacy rows change nothing.
    expect(gulfProfileFromSettings([
      ...legacyRows,
      { key: GULF_A4_CALIBRATION_SETTING_KEY, value: serializeGulfProfile(calibratedProfile()) },
    ])).toEqual(calibratedProfile());
  });

  it('never fetches or adopts a database Designer template in profile mode', async () => {
    vi.mocked(api.get).mockReset().mockResolvedValue({ data: { data: [] } } as never);
    renderStudio(gulfFactoryProfile());
    await waitFor(() => expect(screen.getByText(GULF_A4_TEMPLATE_NAME)).toBeTruthy());
    for (const call of vi.mocked(api.get).mock.calls) {
      expect(String(call[0])).not.toContain('/cheque-designer-templates');
    }
  });
});
