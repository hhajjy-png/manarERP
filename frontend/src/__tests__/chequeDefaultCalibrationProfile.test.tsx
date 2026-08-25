// @vitest-environment jsdom
/**
 * Persistent Default Cheque Calibration Profile v1.
 *
 * Picking المكتب / البيت / أخرى used to last exactly as long as the page did:
 * every navigation, every new session and every restart dropped the operator
 * back on المكتب. The choice is now REMEMBERED — one settings row holding one
 * word, which the cheques page and the calibration studio both start from.
 *
 * Locked here:
 *   • nothing saved yet ⇒ `office`, the first-run value and nothing more;
 *   • choosing a profile writes it to `cheques.defaultCalibrationProfile`;
 *   • a reload / new session / restart comes back on the saved profile, never on
 *     `office`;
 *   • changing it again replaces it — the last choice is the default;
 *   • a missing, empty or corrupt value falls back to `office` instead of
 *     breaking the picker;
 *   • the page and the studio share ONE choice, so preview and print cannot
 *     diverge;
 *   • the preference carries no geometry: every profile's calibration document
 *     is byte-for-byte what it was.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
vi.mock('../utils/print', () => ({ printCurrentViewWithResult: vi.fn() }));
vi.mock('../stores/authStore', () => ({
  useAuth: () => ({
    hasPermission: () => true,
    isSystemAdmin: () => true,
    user: { id: 1, username: 'admin', role: 'SYSTEM_ADMIN' },
  }),
}));
vi.mock('../lib/i18n', () => ({ useT: () => ({ t: (k: string) => k }), t: (k: string) => k }));

import { api } from '../api/client';
import Cheques from '../pages/Cheques';
import { FinancialPeriodProvider } from '../context/FinancialPeriodContext';
import ChequeStudioOverlay from '../components/ChequeStudioOverlay';
import {
  GULF_ACCOUNT_FIXTURE,
  GULF_BANK_FIXTURE,
  bankRegistryResponse,
  gulfChequeAccountFields,
} from './helpers/bankRegistry';
import {
  BANK_CHEQUE_PROFILES,
  CALIBRATION_PROFILES,
  DEFAULT_CALIBRATION_PROFILE,
  DEFAULT_PROFILE_SETTING_KEY,
  GULF_BANK_CODE,
  bankChequeProfileByCode,
  calibrationSettingKey,
  profileDocumentFromSettings,
  profileFactoryDocument,
  readDefaultCalibrationProfile,
  serializeGulfProfile,
} from '../modules/chequePrint';
import type { CalibrationProfileId } from '../modules/chequePrint';

const GULF = bankChequeProfileByCode(GULF_BANK_CODE)!;

const CHEQUE = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

/** The saved-preference row, exactly as `/settings` returns it. */
const savedDefault = (value: string) => ({ key: DEFAULT_PROFILE_SETTING_KEY, value });

/** One printable Gulf cheque — enough for the printing toolbar to render. */
const GULF_CHEQUE = {
  id: 1, chequeNumber: '000002', chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'مستفيد الخليج', amount: 1370, currency: 'KWD',
  description: null, bankName: 'بنك الخليج', status: 'DRAFT',
  printedAt: null, cancelledAt: null, notes: null, printCount: 0,
  paymentVoucherNumber: null, createdAt: '2026-07-30',
  ...gulfChequeAccountFields(),
};

/** The cheques page, mounted with `/settings` answering exactly `settings`. */
async function renderPage(settings: { key: string; value: string }[]) {
  vi.mocked(api.get).mockImplementation((url: string) => {
    const registry = bankRegistryResponse(url, {
      banks: [GULF_BANK_FIXTURE] as never,
      accounts: [GULF_ACCOUNT_FIXTURE] as never,
    });
    if (registry) return Promise.resolve(registry as never);
    if (url === '/cheques') return Promise.resolve({ data: { data: { data: [GULF_CHEQUE], meta: { total: 1 } } } } as never);
    if (url === '/cheques/stats') return Promise.resolve({ data: { data: { total: 1, draft: 1, printed: 0, cancelled: 0 } } } as never);
    if (url === '/settings') return Promise.resolve({ data: { data: { settings } } } as never);
    return Promise.resolve({ data: { data: [] } } as never);
  });
  render(
    <FinancialPeriodProvider>
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}><Cheques /></MemoryRouter>
    </FinancialPeriodProvider>,
  );
  return await screen.findByRole('combobox', { name: 'بروفايل الطباعة' }) as HTMLSelectElement;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── The reader — the single place the default comes from ────────────────────

describe('reading the saved default', () => {
  it('falls back to المكتب when nothing has been saved', () => {
    expect(readDefaultCalibrationProfile([])).toBe('office');
    expect(readDefaultCalibrationProfile([])).toBe(DEFAULT_CALIBRATION_PROFILE);
    // Other rows present, but not this one.
    expect(readDefaultCalibrationProfile([{ key: 'something.else', value: 'home' }])).toBe('office');
  });

  it('returns the saved profile once one exists', () => {
    expect(readDefaultCalibrationProfile([savedDefault('home')])).toBe('home');
    expect(readDefaultCalibrationProfile([savedDefault('other')])).toBe('other');
    expect(readDefaultCalibrationProfile([savedDefault('office')])).toBe('office');
  });

  it('falls back safely on a corrupt value instead of breaking the picker', () => {
    for (const bad of ['', ' ', 'HOME', 'work', 'office ', '{"id":"home"}', 'null', '3']) {
      expect(readDefaultCalibrationProfile([savedDefault(bad)])).toBe('office');
    }
    // A malformed settings payload is survivable too.
    expect(readDefaultCalibrationProfile(undefined as never)).toBe('office');
    expect(readDefaultCalibrationProfile([null as never])).toBe('office');
  });

  it('uses one app-wide key that carries no geometry', () => {
    expect(DEFAULT_PROFILE_SETTING_KEY).toBe('cheques.defaultCalibrationProfile');
    // Never confusable with any of the nine calibration-document rows.
    for (const bank of BANK_CHEQUE_PROFILES) {
      expect(DEFAULT_PROFILE_SETTING_KEY).not.toBe(bank.settingKey);
      for (const p of CALIBRATION_PROFILES) {
        expect(DEFAULT_PROFILE_SETTING_KEY).not.toBe(calibrationSettingKey(bank, p));
      }
    }
  });
});

// ── The cheques page ────────────────────────────────────────────────────────

describe('the cheques page', () => {
  it('starts on المكتب on a first run with nothing saved', async () => {
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));
  });

  it('starts on the saved profile after a restart', async () => {
    const picker = await renderPage([savedDefault('home')]);
    await waitFor(() => expect(picker.value).toBe('home'));
  });

  it('starts on أخرى when أخرى was the last choice', async () => {
    const picker = await renderPage([savedDefault('other')]);
    await waitFor(() => expect(picker.value).toBe('other'));
  });

  it('starts on المكتب when the saved value is corrupt', async () => {
    const picker = await renderPage([savedDefault('printer-2')]);
    await waitFor(() => expect(picker.value).toBe('office'));
  });

  it('saves البيت the moment it is chosen', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));

    fireEvent.change(picker, { target: { value: 'home' } });

    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/settings', expect.anything()));
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string; value: string }[] };
    expect(body.settings).toHaveLength(1);
    expect(body.settings[0].key).toBe(DEFAULT_PROFILE_SETTING_KEY);
    expect(body.settings[0].value).toBe('home');
    expect(picker.value).toBe('home');
  });

  it('replaces the default when the choice changes again', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([savedDefault('home')]);
    await waitFor(() => expect(picker.value).toBe('home'));

    fireEvent.change(picker, { target: { value: 'other' } });
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { value: string }[] };
    expect(body.settings[0].value).toBe('other');

    // …and the next launch reads exactly that back.
    expect(readDefaultCalibrationProfile([savedDefault(body.settings[0].value)])).toBe('other');
  });

  it('round-trips: choose البيت, restart, still البيت', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));
    fireEvent.change(picker, { target: { value: 'home' } });
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    // What the server now holds, fed back exactly as `/settings` would return it.
    const written = (vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string; value: string }[] }).settings;
    cleanup();
    const afterRestart = await renderPage(written);
    await waitFor(() => expect(afterRestart.value).toBe('home'));
  });

  it('round-trips again: البيت → أخرى, restart, still أخرى', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([savedDefault('home')]);
    await waitFor(() => expect(picker.value).toBe('home'));
    fireEvent.change(picker, { target: { value: 'other' } });
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    const written = (vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string; value: string }[] }).settings;
    cleanup();
    const afterRestart = await renderPage(written);
    await waitFor(() => expect(afterRestart.value).toBe('other'));
  });

  it('opens the studio on the same profile the page is printing with', async () => {
    const picker = await renderPage([savedDefault('other')]);
    await waitFor(() => expect(picker.value).toBe('other'));

    fireEvent.click(screen.getByRole('button', { name: /action\.cheque\.calibrate_print/ }));
    const studioPicker = await screen.findByRole('combobox', { name: 'البروفايل' }) as HTMLSelectElement;
    expect(studioPicker.value).toBe('other');
    expect(studioPicker.value).toBe(picker.value);
  });

  it('a profile chosen inside the studio becomes the page’s profile and is saved', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));

    fireEvent.click(screen.getByRole('button', { name: /action\.cheque\.calibrate_print/ }));
    const studioPicker = await screen.findByRole('combobox', { name: 'البروفايل' }) as HTMLSelectElement;
    fireEvent.change(studioPicker, { target: { value: 'home' } });

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string; value: string }[] };
    expect(body.settings[0]).toMatchObject({ key: DEFAULT_PROFILE_SETTING_KEY, value: 'home' });
    // One choice, not two: the page moved with it.
    expect(studioPicker.value).toBe('home');
    expect(picker.value).toBe('home');
  });

  it('keeps the operator’s choice even when the save fails', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('offline'));
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));

    fireEvent.change(picker, { target: { value: 'other' } });
    // The session is not silently pushed back onto another profile.
    await waitFor(() => expect(api.put).toHaveBeenCalled());
    expect(picker.value).toBe('other');
  });
});

// ── The studio ──────────────────────────────────────────────────────────────

describe('the calibration studio', () => {
  function renderStudio(
    calibrationProfile: CalibrationProfileId | undefined,
    onChange = vi.fn(),
  ) {
    render(
      <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}>
        <ChequeStudioOverlay
          onClose={vi.fn()}
          chequeRecord={CHEQUE}
          settings={[]}
          calibrationProfile={calibrationProfile}
          onCalibrationProfileChange={onChange}
          onProfileSaved={vi.fn()}
        />
      </MemoryRouter>,
    );
    return { picker: screen.getByRole('combobox', { name: 'البروفايل' }) as HTMLSelectElement, onChange };
  }

  it('opens on the default it is handed, not on المكتب', () => {
    expect(renderStudio('home').picker.value).toBe('home');
    cleanup();
    expect(renderStudio('other').picker.value).toBe('other');
  });

  it('opens on المكتب when no default is supplied', () => {
    expect(renderStudio(undefined).picker.value).toBe('office');
  });

  it('reports a change up so the host applies and saves it', () => {
    const { picker, onChange } = renderStudio('office');
    fireEvent.change(picker, { target: { value: 'home' } });
    expect(onChange).toHaveBeenCalledWith('home');
  });
});

// ── Page and studio agree ───────────────────────────────────────────────────

describe('page and studio', () => {
  it('read their default from the same key through the same reader', async () => {
    const page = await import('fs').then((fs) => fs.readFileSync('src/pages/Cheques.tsx', 'utf8'));
    const overlay = await import('fs')
      .then((fs) => fs.readFileSync('src/components/ChequeStudioOverlay.tsx', 'utf8'));

    // The page is the single owner: it reads the saved default and hands the
    // SAME state down to the studio, which reports changes back rather than
    // keeping a second choice of its own.
    expect(page).toContain('readDefaultCalibrationProfile');
    expect(page).toContain('DEFAULT_PROFILE_SETTING_KEY');
    expect(page).toContain('calibrationProfile={printCalibrationProfile}');
    expect(page).toContain('onCalibrationProfileChange={chooseCalibrationProfile}');
    expect(overlay).toContain('onCalibrationProfileChange');
    // The studio never reads or writes the preference itself.
    expect(overlay).not.toContain('DEFAULT_PROFILE_SETTING_KEY');
    expect(overlay).not.toContain("api.put('/settings'");
    // No second storage mechanism anywhere.
    expect(page).not.toContain('localStorage');
    expect(overlay).not.toContain('localStorage');
  });

  it('drives the print document from the same chosen profile', async () => {
    const page = await import('fs').then((fs) => fs.readFileSync('src/pages/Cheques.tsx', 'utf8'));
    // One state feeds the resolver that both preview and physical print use.
    expect(page).toContain('calibrationDocumentFor(bankProfile, printCalibrationProfile)');
    expect(page).toContain('calibrationDocumentFor(batchBankProfile, printCalibrationProfile)');
  });
});

// ── The preference moves nothing ────────────────────────────────────────────

describe('geometry', () => {
  /** A saved calibration document for one pair. */
  function savedRow(calibrationProfile: CalibrationProfileId, offsetXMm: number) {
    const factory = profileFactoryDocument(GULF)!;
    return {
      key: calibrationSettingKey(GULF, calibrationProfile),
      value: serializeGulfProfile({
        ...factory,
        calibration: { ...factory.calibration, offsetXMm },
      }),
    };
  }

  it('leaves every profile’s document identical whatever the default is', () => {
    const documents = [savedRow('office', 3), savedRow('home', -4), savedRow('other', 8)];
    const withoutPreference = CALIBRATION_PROFILES.map(
      (p) => profileDocumentFromSettings(GULF, documents, p));

    for (const preference of ['office', 'home', 'other', 'garbage']) {
      const withPreference = CALIBRATION_PROFILES.map(
        (p) => profileDocumentFromSettings(GULF, [...documents, savedDefault(preference)], p));
      expect(withPreference).toEqual(withoutPreference);
    }
  });

  it('is never mistaken for a calibration document', () => {
    // The preference row alone leaves every pair on its factory geometry.
    for (const bank of BANK_CHEQUE_PROFILES) {
      for (const p of CALIBRATION_PROFILES) {
        expect(profileDocumentFromSettings(bank, [savedDefault('home')], p))
          .toEqual(profileFactoryDocument(bank));
      }
    }
  });

  it('stores one word and nothing else', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const picker = await renderPage([]);
    await waitFor(() => expect(picker.value).toBe('office'));
    fireEvent.change(picker, { target: { value: 'home' } });

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { value: string }[] };
    // Not a document — just the id.
    expect(body.settings[0].value).toBe('home');
    expect(body.settings[0].value).not.toContain('surface');
    expect(body.settings[0].value).not.toContain('fields');
    expect(body.settings[0].value).not.toContain('offsetXMm');
  });
});
