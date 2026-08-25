// @vitest-environment jsdom
/**
 * Simple Cheque Calibration Profiles v1.
 *
 * The same bank template lands differently on different printers, so a template
 * now keeps one saved calibration PER PROFILE — المكتب / البيت / أخرى. The
 * identity of a calibration is the PAIR `bank template + calibration profile`.
 *
 * Locked here:
 *   • exactly three fixed profiles, `office` first and default — no creating,
 *     deleting or renaming;
 *   • every pair is an independent settings row: nine rows for three banks;
 *   • a pair never seen before starts from ITS OWN BANK's factory document, not
 *     from another profile's edits and not from another bank;
 *   • saving one pair leaves every other pair untouched, in storage and on screen;
 *   • the studio preview and the physical print consume the SAME document for the
 *     selected pair — there is no separate preview setting;
 *   • a calibration saved before profiles existed is inherited by `home` — the
 *     printer it was actually made on — so the Gulf calibration already in
 *     production is not lost, while `office` starts from factory geometry;
 *   • that inheritance is a fallback only: a pair with its own saved row always
 *     reads its own row;
 *   • profiles change nothing else: no new status, no printability change, and
 *     the studio itself is untouched.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));

import { api } from '../api/client';
import ChequeStudioOverlay from '../components/ChequeStudioOverlay';
import {
  BANK_CHEQUE_PROFILES,
  CALIBRATION_PROFILES,
  CALIBRATION_PROFILE_LABELS,
  DEFAULT_CALIBRATION_PROFILE,
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_BANK_CODE,
  KFH_BANK_CODE,
  LEGACY_ADOPTING_CALIBRATION_PROFILE,
  NBK_BANK_CODE,
  bankChequeProfileByCode,
  calibrationSettingKey,
  isCalibrationProfileId,
  isProfilePrintable,
  legacyCalibrationSettingKey,
  profileDocumentFromSettings,
  profileFactoryDocument,
  serializeGulfProfile,
} from '../modules/chequePrint';
import type { CalibrationProfileId, GulfA4Profile } from '../modules/chequePrint';

const GULF = bankChequeProfileByCode(GULF_BANK_CODE)!;
const KFH = bankChequeProfileByCode(KFH_BANK_CODE)!;
const NBK = bankChequeProfileByCode(NBK_BANK_CODE)!;

const CHEQUE = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

/** A saved row for one pair, with a recognisable horizontal offset. */
function savedRow(
  bank: typeof GULF,
  calibrationProfile: CalibrationProfileId,
  offsetXMm: number,
): { key: string; value: string } {
  const factory = profileFactoryDocument(bank)!;
  const document: GulfA4Profile = {
    ...factory,
    calibration: { ...factory.calibration, offsetXMm },
  };
  return { key: calibrationSettingKey(bank, calibrationProfile), value: serializeGulfProfile(document) };
}

function renderStudio(settings: { key: string; value: string }[] = [], onSaved = vi.fn()) {
  const utils = render(
    <MemoryRouter future={ROUTER_FUTURE} initialEntries={['/cheques']}>
      <ChequeStudioOverlay
        onClose={vi.fn()}
        chequeRecord={CHEQUE}
        settings={settings}
        onProfileSaved={onSaved}
      />
    </MemoryRouter>,
  );
  return { ...utils, onSaved };
}

const templatePicker = () => screen.getByRole('combobox', { name: 'القالب' }) as HTMLSelectElement;
const profilePicker = () => screen.getByRole('combobox', { name: 'البروفايل' }) as HTMLSelectElement;
const selectTemplate = (bankCode: string) => fireEvent.change(templatePicker(), { target: { value: bankCode } });
const selectProfile = (id: CalibrationProfileId) => fireEvent.change(profilePicker(), { target: { value: id } });

/** The offset the studio currently shows — the visible proof of which document is open. */
const shownOffsetX = () => (screen.getByLabelText('إزاحة أفقية (مم)') as HTMLInputElement).value;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── 1. Three fixed profiles, office default ─────────────────────────────────

describe('the three fixed profiles', () => {
  it('offers exactly المكتب / البيت / أخرى and nothing else', () => {
    expect(CALIBRATION_PROFILES).toEqual(['office', 'home', 'other']);
    expect(CALIBRATION_PROFILES).toHaveLength(3);
    expect(Object.values(CALIBRATION_PROFILE_LABELS)).toEqual(['المكتب', 'البيت', 'أخرى']);

    renderStudio();
    const options = within(profilePicker()).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(['office', 'home', 'other']);
    expect(options.map((o) => o.textContent)).toEqual(['المكتب', 'البيت', 'أخرى']);
  });

  it('opens on المكتب', () => {
    expect(DEFAULT_CALIBRATION_PROFILE).toBe('office');
    renderStudio();
    expect(profilePicker().value).toBe('office');
  });

  it('offers no way to create, rename or delete a profile', () => {
    const { container } = renderStudio();
    const shell = container.querySelector('.chq-studio-shell') ?? container;
    for (const label of ['بروفايل جديد', 'حذف البروفايل', 'إعادة تسمية', 'إضافة بروفايل']) {
      expect(within(shell as HTMLElement).queryByText(label)).toBeNull();
    }
    // The picker is a fixed list, not a free-text field.
    expect(profilePicker().tagName).toBe('SELECT');
  });

  it('accepts only the three ids', () => {
    expect(isCalibrationProfileId('office')).toBe(true);
    expect(isCalibrationProfileId('home')).toBe(true);
    expect(isCalibrationProfileId('other')).toBe(true);
    for (const bad of ['work', 'OFFICE', '', null, undefined, 3, {}]) {
      expect(isCalibrationProfileId(bad)).toBe(false);
    }
  });
});

// ── 2. Every pair is its own row ────────────────────────────────────────────

describe('pair identity', () => {
  it('gives all nine bank × profile pairs distinct settings keys', () => {
    const keys = BANK_CHEQUE_PROFILES.flatMap((bank) =>
      CALIBRATION_PROFILES.map((p) => calibrationSettingKey(bank, p)));
    expect(keys).toHaveLength(9);
    expect(new Set(keys).size).toBe(9);
  });

  it('composes the key from the template’s own key plus the profile', () => {
    expect(calibrationSettingKey(GULF, 'office')).toBe('cheque.calibration.gulf-a4.office.v1');
    expect(calibrationSettingKey(GULF, 'home')).toBe('cheque.calibration.gulf-a4.home.v1');
    expect(calibrationSettingKey(GULF, 'other')).toBe('cheque.calibration.gulf-a4.other.v1');
    for (const bank of BANK_CHEQUE_PROFILES) {
      for (const p of CALIBRATION_PROFILES) {
        expect(calibrationSettingKey(bank, p).startsWith(bank.settingKey.replace(/\.v\d+$/, ''))).toBe(true);
      }
    }
  });

  it('reads Gulf/office and Gulf/home as independent documents', () => {
    const settings = [savedRow(GULF, 'office', 3), savedRow(GULF, 'home', -4)];
    expect(profileDocumentFromSettings(GULF, settings, 'office')!.calibration.offsetXMm).toBe(3);
    expect(profileDocumentFromSettings(GULF, settings, 'home')!.calibration.offsetXMm).toBe(-4);
  });

  it('reads KFH/office and KFH/home as independent documents', () => {
    const settings = [savedRow(KFH, 'office', 5), savedRow(KFH, 'home', -2)];
    expect(profileDocumentFromSettings(KFH, settings, 'office')!.calibration.offsetXMm).toBe(5);
    expect(profileDocumentFromSettings(KFH, settings, 'home')!.calibration.offsetXMm).toBe(-2);
  });

  it('never lets one bank read another bank’s profile row', () => {
    const settings = [savedRow(GULF, 'home', 9)];
    // Gulf/home sees it; nobody else does.
    expect(profileDocumentFromSettings(GULF, settings, 'home')!.calibration.offsetXMm).toBe(9);
    for (const bank of [KFH, NBK]) {
      for (const p of CALIBRATION_PROFILES) {
        expect(profileDocumentFromSettings(bank, settings, p)!.calibration.offsetXMm)
          .toBe(profileFactoryDocument(bank)!.calibration.offsetXMm);
      }
    }
  });
});

// ── 3. A new profile starts from the bank's factory document ────────────────

describe('a profile never used before', () => {
  it('starts from its own bank’s factory document, not from another profile', () => {
    // office is heavily calibrated; home has never been saved.
    const settings = [savedRow(GULF, 'office', 6)];
    const home = profileDocumentFromSettings(GULF, settings, 'home')!;
    const factory = profileFactoryDocument(GULF)!;
    expect(home.calibration).toEqual(factory.calibration);
    expect(home.surface).toEqual(factory.surface);
    expect(home.fields).toEqual(factory.fields);
    expect(home.calibration.offsetXMm).not.toBe(6);
  });

  it('starts from its own bank’s factory document, not another bank’s', () => {
    for (const bank of BANK_CHEQUE_PROFILES) {
      const fresh = profileDocumentFromSettings(bank, [], 'other')!;
      expect(fresh).toEqual(profileFactoryDocument(bank));
    }
  });

  it('shows the factory offsets when switching to an unsaved profile in the studio', () => {
    renderStudio([savedRow(GULF, 'office', 6)]);
    expect(shownOffsetX()).toBe('6');
    selectProfile('home');
    expect(shownOffsetX()).toBe('0');
    selectProfile('office');
    expect(shownOffsetX()).toBe('6');
  });
});

// ── 4. Saving one pair touches only that pair ───────────────────────────────

describe('saving', () => {
  it('writes the pair’s own settings key', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    renderStudio();
    selectProfile('home');
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string }[] };
    expect(body.settings[0].key).toBe(calibrationSettingKey(GULF, 'home'));
    expect(body.settings[0].key).not.toBe(GULF_A4_CALIBRATION_SETTING_KEY);
  });

  it('reports which pair was saved, so the host applies it to that pair alone', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    const { onSaved } = renderStudio();
    selectTemplate(KFH_BANK_CODE);
    selectProfile('other');
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toBe(KFH_BANK_CODE);
    expect(onSaved.mock.calls[0][1]).toBe('other');
  });

  it('leaves the other profiles of the same template where they were', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    renderStudio([savedRow(GULF, 'office', 6)]);

    selectProfile('home');
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '-5' } });
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
    await waitFor(() => expect(api.put).toHaveBeenCalled());

    // Only home's key was written…
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string }[] };
    expect(body.settings.map((s) => s.key)).toEqual([calibrationSettingKey(GULF, 'home')]);
    // …and office still reads what it always did.
    expect(shownOffsetX()).toBe('-5');
    selectProfile('office');
    expect(shownOffsetX()).toBe('6');
    selectProfile('other');
    expect(shownOffsetX()).toBe('0');
  });

  it('keeps an edit in one pair from leaking into another', () => {
    renderStudio();
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '8' } });
    expect(shownOffsetX()).toBe('8');
    selectProfile('home');          // unsaved edit abandoned with the pair
    expect(shownOffsetX()).toBe('0');
    selectProfile('office');
    expect(shownOffsetX()).toBe('0');
  });

  it('survives a reload: the saved row is what the pair reads back', () => {
    const settings = [savedRow(GULF, 'home', -5)];
    renderStudio(settings);
    expect(shownOffsetX()).toBe('0');   // office, never saved
    selectProfile('home');
    expect(shownOffsetX()).toBe('-5');
  });
});

// ── 5. One document for preview and print ───────────────────────────────────

describe('preview and print', () => {
  it('resolve through the same reader, so neither can hold its own settings', () => {
    const settings = [savedRow(GULF, 'home', -4)];
    const forHome = profileDocumentFromSettings(GULF, settings, 'home')!;
    // Same call, same arguments, same document — there is no preview-only variant.
    expect(profileDocumentFromSettings(GULF, settings, 'home')).toEqual(forHome);
    expect(forHome.calibration.offsetXMm).toBe(-4);
  });

  it('offers the print-profile choice on the cheques page as a manual pick', async () => {
    const page = await import('fs').then((fs) =>
      fs.readFileSync('src/pages/Cheques.tsx', 'utf8'));
    // The page selects the pair explicitly and resolves both surface and placement
    // from the SAME resolved document.
    expect(page).toContain('printCalibrationProfile');
    expect(page).toContain('calibrationDocumentFor');
    expect(page).toContain('aria-label="بروفايل الطباعة"');
    // No printer detection, no automatic mapping, no persisted preference.
    expect(page).not.toMatch(/navigator\.\s*printer|getPrinters|defaultPrinter/i);
  });
});

// ── 6. The pre-profile calibration is inherited by البيت ────────────────────

describe('a calibration saved before profiles existed', () => {
  /** The Gulf row exactly as production holds it today: no profile in the key. */
  function legacyGulfRow(offsetXMm: number, offsetYMm = 0) {
    const factory = profileFactoryDocument(GULF)!;
    return {
      key: legacyCalibrationSettingKey(GULF),
      value: serializeGulfProfile({
        ...factory,
        calibration: { ...factory.calibration, offsetXMm, offsetYMm },
      }),
    };
  }

  it('is the un-suffixed key the system has always used', () => {
    expect(legacyCalibrationSettingKey(GULF)).toBe(GULF_A4_CALIBRATION_SETTING_KEY);
    expect(legacyCalibrationSettingKey(GULF)).toBe('cheque.calibration.gulf-a4.v1');
    // It is NOT any of the three profile keys — which is why it needs inheriting.
    for (const p of CALIBRATION_PROFILES) {
      expect(calibrationSettingKey(GULF, p)).not.toBe(legacyCalibrationSettingKey(GULF));
    }
  });

  it('is inherited by البيت — the printer it was made on', () => {
    expect(LEGACY_ADOPTING_CALIBRATION_PROFILE).toBe('home');
    const legacy = [legacyGulfRow(4, -2)];
    const home = profileDocumentFromSettings(GULF, legacy, 'home')!;
    expect(home.calibration.offsetXMm).toBe(4);
    expect(home.calibration.offsetYMm).toBe(-2);
  });

  it('leaves المكتب on the Gulf factory document', () => {
    const factory = profileFactoryDocument(GULF)!;
    const office = profileDocumentFromSettings(GULF, [legacyGulfRow(4, -2)], 'office')!;
    expect(office).toEqual(factory);
    expect(office.calibration.offsetXMm).toBe(factory.calibration.offsetXMm);
    expect(office.calibration.offsetXMm).not.toBe(4);
  });

  it('leaves أخرى on the Gulf factory document', () => {
    const other = profileDocumentFromSettings(GULF, [legacyGulfRow(4, -2)], 'other')!;
    expect(other).toEqual(profileFactoryDocument(GULF));
  });

  it('yields to البيت’s own row once البيت has been saved', () => {
    // Both rows present — the profile-specific one wins, always.
    const settings = [legacyGulfRow(4), savedRow(GULF, 'home', 11)];
    expect(profileDocumentFromSettings(GULF, settings, 'home')!.calibration.offsetXMm).toBe(11);
    // Order in the settings array must not decide it either.
    const reversed = [savedRow(GULF, 'home', 11), legacyGulfRow(4)];
    expect(profileDocumentFromSettings(GULF, reversed, 'home')!.calibration.offsetXMm).toBe(11);
  });

  it('never overrides a profile-specific row for any profile', () => {
    const legacy = legacyGulfRow(4);
    for (const p of CALIBRATION_PROFILES) {
      const own = profileDocumentFromSettings(GULF, [legacy, savedRow(GULF, p, 7)], p)!;
      expect(own.calibration.offsetXMm).toBe(7);
    }
  });

  it('is read, never written — saving البيت writes the profile key instead', async () => {
    vi.mocked(api.put).mockResolvedValue({ data: { success: true } } as never);
    renderStudio([legacyGulfRow(4)]);
    selectProfile('home');
    expect(shownOffsetX()).toBe('4');            // inherited, visible in the studio
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));

    await waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string }[] };
    expect(body.settings.map((s) => s.key)).toEqual([calibrationSettingKey(GULF, 'home')]);
    // The legacy key is never a write target, so the old row is left in place.
    expect(body.settings.map((s) => s.key)).not.toContain(legacyCalibrationSettingKey(GULF));
  });

  it('shows البيت calibrated and المكتب factory-fresh in the studio', () => {
    renderStudio([legacyGulfRow(4)]);
    expect(profilePicker().value).toBe('office');
    expect(shownOffsetX()).toBe('0');            // office — factory
    selectProfile('home');
    expect(shownOffsetX()).toBe('4');            // home — the old calibration
    selectProfile('other');
    expect(shownOffsetX()).toBe('0');
  });

  it('does not reach KFH or NBK', () => {
    // Those templates were registered with profiles already in place, so they
    // have no legacy row. Nothing about this rule changes them.
    for (const bank of [KFH, NBK]) {
      const legacy = {
        key: legacyCalibrationSettingKey(bank),
        value: serializeGulfProfile({
          ...profileFactoryDocument(bank)!,
          calibration: { ...profileFactoryDocument(bank)!.calibration, offsetXMm: 4 },
        }),
      };
      // The rule is generic, but Gulf's legacy row can never be one of theirs…
      expect(legacy.key).not.toBe(legacyCalibrationSettingKey(GULF));
      // …and with no legacy row at all, every profile is factory-fresh.
      for (const p of CALIBRATION_PROFILES) {
        expect(profileDocumentFromSettings(bank, [], p)).toEqual(profileFactoryDocument(bank));
      }
    }
  });
});

// ── 7. Nothing else changed ─────────────────────────────────────────────────

describe('scope', () => {
  it('leaves every template’s status and printability alone', () => {
    expect(GULF.status).toBe('APPROVED');
    expect(KFH.status).toBe('PROVISIONAL');
    expect(NBK.status).toBe('PROVISIONAL');
    expect(isProfilePrintable(GULF)).toBe(true);
    expect(isProfilePrintable(KFH)).toBe(false);
    expect(isProfilePrintable(NBK)).toBe(false);
  });

  it('does not make a provisional template printable under any profile', () => {
    for (const p of CALIBRATION_PROFILES) {
      const doc = profileDocumentFromSettings(KFH, [savedRow(KFH, p, 3)], p);
      expect(doc).not.toBeNull();          // fully calibratable…
      expect(isProfilePrintable(KFH)).toBe(false);   // …still not printable.
    }
  });

  it('leaves the studio itself intact — designer, preview and toolbar', () => {
    const { container } = renderStudio();
    for (const id of CALIBRATION_PROFILES) {
      selectProfile(id);
      expect(container.querySelector('.ctm-root')).toBeTruthy();
      expect(container.querySelector('.ctd-field-layer')).toBeTruthy();
      expect(container.querySelector('.ctm-preview-pane')).toBeTruthy();
      expect(screen.getByRole('button', { name: /^حفظ$/ })).toBeTruthy();
      expect(screen.getByRole('button', { name: /استعادة الافتراضي/ })).toBeTruthy();
    }
  });

  it('keeps the template selector working alongside the profile selector', () => {
    renderStudio();
    expect(templatePicker().value).toBe(GULF_BANK_CODE);
    selectTemplate(NBK_BANK_CODE);
    expect(templatePicker().value).toBe(NBK_BANK_CODE);
    expect(profilePicker().value).toBe('office');   // profile is not reset by template
  });
});
