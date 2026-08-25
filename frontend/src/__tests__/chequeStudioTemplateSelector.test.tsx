// @vitest-environment jsdom
/**
 * Cheque Calibration Template Selector v1.
 *
 * The calibration studio calibrates a TEMPLATE, and the system registers one per
 * bank. Before this, the studio could only ever look at the single approved one,
 * so a bank's template could not be prepared until a real cheque existed on that
 * bank's account. The selector fixes that — and must fix it WITHOUT letting an
 * unmeasured template borrow anything from the measured one.
 *
 * Locked here:
 *   • all three registered templates appear, each with its status;
 *   • the list comes from `BANK_CHEQUE_PROFILES`, not a copy in the shell;
 *   • every template opens the SAME full studio — including the provisional
 *     ones, which is how their seeded numbers become measured ones;
 *   • a provisional template still shows its status and is not printable;
 *   • each template carries its own document, its own settings key and its own
 *     preview photo, so switching never mixes one bank's calibration into
 *     another's;
 *   • Gulf's own calibration is unchanged.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
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
  DEFAULT_CALIBRATION_PROFILE,
  GULF_A4_CALIBRATION_SETTING_KEY,
  GULF_A4_TEMPLATE_NAME,
  GULF_BANK_CODE,
  KFH_BANK_CODE,
  KFH_CALIBRATION_SETTING_KEY,
  NBK_BANK_CODE,
  NBK_CALIBRATION_SETTING_KEY,
  PROFILE_STATUS_LABELS,
  bankChequeProfileByCode,
  calibrationSettingKey,
  gulfFactoryProfile,
  isProfileCalibratable,
  isProfilePrintable,
  serializeGulfProfile,
} from '../modules/chequePrint';

const CHEQUE = {
  chequeNumber: '000123',
  chequeDate: '2026-08-02T00:00:00.000Z',
  beneficiaryName: 'ساير طليحان العذاب',
  amount: 1250.75,
  currency: 'KWD',
  bankName: 'بنك الخليج',
};

function renderStudio(onSaved = vi.fn(), settings: { key: string; value: string }[] = []) {
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

/** The studio's full editor is open (designer + preview + toolbar). */
function expectFullStudio(container: HTMLElement) {
  expect(container.querySelector('.ctm-root')).toBeTruthy();
  expect(container.querySelector('.ctd-field-layer')).toBeTruthy();
  expect(container.querySelector('.ctm-preview-pane')).toBeTruthy();
}

const picker = () => screen.getByRole('combobox', { name: 'القالب' }) as HTMLSelectElement;
const selectTemplate = (bankCode: string) => fireEvent.change(picker(), { target: { value: bankCode } });

afterEach(cleanup);

// ── 1. The selector lists every registered template ──────────────────────────

describe('the template selector', () => {
  it('shows the three registered templates with their status', () => {
    renderStudio();
    const options = within(picker()).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.textContent)).toEqual([
      `${GULF_A4_TEMPLATE_NAME} — معتمد`,
      'قالب شيك بيت التمويل الكويتي — إعداد افتراضي',
      'قالب شيك بنك الكويت الوطني — إعداد افتراضي',
    ]);
  });

  it('derives the list from BANK_CHEQUE_PROFILES — the shell keeps no copy', () => {
    renderStudio();
    const options = within(picker()).getAllByRole('option') as HTMLOptionElement[];
    expect(options.map((o) => o.value)).toEqual(BANK_CHEQUE_PROFILES.map((p) => p.bankCode));
    for (const [i, profile] of BANK_CHEQUE_PROFILES.entries()) {
      expect(options[i].textContent, profile.bankCode)
        .toBe(`${profile.displayName} — ${PROFILE_STATUS_LABELS[profile.status]}`);
    }
  });

  it('opens on the approved template', () => {
    renderStudio();
    expect(picker().value).toBe(GULF_BANK_CODE);
  });
});

// ── 2. Gulf opens the real, approved studio ──────────────────────────────────

describe('selecting the Gulf template', () => {
  it('opens the full calibration studio with its designer and preview', () => {
    const { container } = renderStudio();
    expect(container.querySelector('.ctm-root')).toBeTruthy();
    expect(container.querySelector('.ctd-field-layer')).toBeTruthy();
    expect(container.querySelector('.ctm-preview-pane')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^حفظ$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /استعادة الافتراضي/ })).toBeTruthy();
    // No pending banner while the approved template is open.
    expect(screen.queryByText('غير معاير — يلزم شيك أصلي')).toBeNull();
  });

  it('renders the Gulf date block and its cheque photo', () => {
    const { container } = renderStudio();
    const dateBlock = Array.from(container.querySelectorAll('.ctd-field-wrapper'))
      .filter((w) => w.querySelector('.ctd-field-slot'));
    expect(dateBlock).toHaveLength(1);
    expect(container.querySelector('.crs-bg')).toBeTruthy();
  });

  it('saves under the Gulf calibration key', async () => {
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
    renderStudio();
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
    await vi.waitFor(() => expect(api.put).toHaveBeenCalled());
    const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string }[] };
    expect(body.settings[0].key)
      .toBe(calibrationSettingKey(bankChequeProfileByCode(GULF_BANK_CODE)!, DEFAULT_CALIBRATION_PROFILE));
  });
});

// ── 3. Provisional templates open the SAME full studio ──────────────────────

describe('selecting a provisional template', () => {
  for (const [bankCode, displayName, ownKey] of [
    [KFH_BANK_CODE, 'قالب شيك بيت التمويل الكويتي', KFH_CALIBRATION_SETTING_KEY],
    [NBK_BANK_CODE, 'قالب شيك بنك الكويت الوطني', NBK_CALIBRATION_SETTING_KEY],
  ] as const) {
    it(`${displayName}: opens the full calibration studio, not a reduced panel`, () => {
      const { container } = renderStudio();
      selectTemplate(bankCode);
      expect(picker().value).toBe(bankCode);
      expectFullStudio(container);
      // No setup panel any more — it is a real, editable template now.
      expect(screen.queryByTestId('cpsp-status')).toBeNull();
    });

    it(`${displayName}: exposes every calibration tool Gulf has`, () => {
      renderStudio();
      selectTemplate(bankCode);
      for (const label of [/^حفظ$/, /استعادة الافتراضي/, /طباعة تجريبية/]) {
        expect(screen.getByRole('button', { name: label }), String(label)).toBeTruthy();
      }
      expect(screen.getByLabelText('إزاحة أفقية (مم)')).toBeTruthy();
      expect(screen.getByLabelText('إزاحة رأسية (مم)')).toBeTruthy();
      expect(screen.getByText('الخصائص')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Undo' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Redo' })).toBeTruthy();
    });

    it(`${displayName}: still shows its provisional status`, () => {
      renderStudio();
      selectTemplate(bankCode);
      expect(screen.getByTestId('chq-studio-status'))
        .toHaveTextContent('إعداد افتراضي — يحتاج مطابقة مع الشيك الأصلي');
    });

    it(`${displayName}: starts from the seeded baseline geometry`, () => {
      const profile = bankChequeProfileByCode(bankCode)!;
      expect(profile.status).toBe('PROVISIONAL');
      expect(profile.chequeGeometry).toEqual({ widthMm: 180, heightMm: 90 });
      expect(profile.placement).toEqual({ xMm: 117, yMm: 60 });
      expect(isProfileCalibratable(profile)).toBe(true);
    });

    it(`${displayName}: opens with NO cheque photo — never Gulf's`, () => {
      const { container } = renderStudio();
      selectTemplate(bankCode);
      expect(bankChequeProfileByCode(bankCode)!.previewBackground).toBeNull();
      expect(container.querySelector('.crs-bg')).toBeNull();
      expect(container.querySelectorAll('img')).toHaveLength(0);
    });

    it(`${displayName}: renders the date as ONE block with internal slots`, () => {
      const { container } = renderStudio();
      selectTemplate(bankCode);
      const withSlots = Array.from(container.querySelectorAll('.ctd-field-wrapper'))
        .filter((w) => w.querySelector('.ctd-field-slot'));
      expect(withSlots).toHaveLength(1);
      expect(withSlots[0].querySelectorAll('.ctd-field-slot')).toHaveLength(3);
      // No separate day/month/year designer fields anywhere.
      const profile = bankChequeProfileByCode(bankCode)!;
      for (const gone of ['chequeDay', 'chequeMonth', 'chequeYear']) {
        expect(profile.fields.map((f) => f.id), gone).not.toContain(gone);
      }
    });

    it(`${displayName}: saves under its OWN key, never Gulf's`, async () => {
      vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
      renderStudio();
      selectTemplate(bankCode);
      fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
      await vi.waitFor(() => expect(api.put).toHaveBeenCalled());
      const body = vi.mocked(api.put).mock.calls[0][1] as { settings: { key: string }[] };
      expect(body.settings).toHaveLength(1);
      expect(body.settings[0].key)
        .toBe(calibrationSettingKey(bankChequeProfileByCode(bankCode)!, DEFAULT_CALIBRATION_PROFILE));
      expect(body.settings[0].key).toContain(ownKey.replace(/\.v\d+$/, ''));
      expect(body.settings[0].key).not.toContain('gulf-a4');
    });

    it(`${displayName}: reads only its OWN saved row`, () => {
      // A saved row for the OTHER provisional bank must not move this one.
      const otherCode = bankCode === KFH_BANK_CODE ? NBK_BANK_CODE : KFH_BANK_CODE;
      const other = bankChequeProfileByCode(otherCode)!;
      const otherDoc = {
        id: 'gulf-a4' as const,
        name: other.displayName,
        surface: { widthCm: 18, heightCm: 9 },
        fields: [],
        calibration: { offsetXMm: 9, offsetYMm: 9 },
      };
      const { container } = renderStudio(vi.fn(), [
        { key: other.settingKey, value: serializeGulfProfile(otherDoc) },
      ]);
      selectTemplate(bankCode);
      expectFullStudio(container);
      // This template still shows its own factory offsets (0 / 0), not 9 / 9.
      expect((screen.getByLabelText('إزاحة أفقية (مم)') as HTMLInputElement).value).toBe('0');
      expect((screen.getByLabelText('إزاحة رأسية (مم)') as HTMLInputElement).value).toBe('0');
    });

    it(`${displayName}: is NOT production-printable`, () => {
      expect(isProfilePrintable(bankChequeProfileByCode(bankCode)!)).toBe(false);
    });
  }
});

// ── 4. Switching never mixes one bank's calibration into another's ───────────

describe('switching templates', () => {
  it('swaps the open template immediately, both ways', () => {
    const { container } = renderStudio();
    expectFullStudio(container);
    expect(screen.getByText(GULF_A4_TEMPLATE_NAME)).toBeTruthy();

    selectTemplate(KFH_BANK_CODE);
    expectFullStudio(container);
    expect(screen.getAllByText('قالب شيك بيت التمويل الكويتي').length).toBeGreaterThan(0);

    selectTemplate(NBK_BANK_CODE);
    expect(screen.getAllByText('قالب شيك بنك الكويت الوطني').length).toBeGreaterThan(0);

    selectTemplate(GULF_BANK_CODE);
    expectFullStudio(container);
    expect(screen.queryByTestId('chq-studio-status')).toBeNull();
  });

  it('routes each template’s save to that template’s own key', async () => {
    vi.mocked(api.put).mockReset().mockResolvedValue({ data: { success: true } } as never);
    const onSaved = vi.fn();
    renderStudio(onSaved);

    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));

    selectTemplate(KFH_BANK_CODE);
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(2));

    selectTemplate(NBK_BANK_CODE);
    fireEvent.click(screen.getByRole('button', { name: /^حفظ$/ }));
    await vi.waitFor(() => expect(api.put).toHaveBeenCalledTimes(3));

    const keys = vi.mocked(api.put).mock.calls
      .map((c) => (c[1] as { settings: { key: string }[] }).settings.map((row) => row.key))
      .flat();
    // Three saves, three distinct keys, in the order the templates were opened.
    expect(keys).toEqual(
      [GULF_BANK_CODE, KFH_BANK_CODE, NBK_BANK_CODE].map((code) =>
        calibrationSettingKey(bankChequeProfileByCode(code)!, DEFAULT_CALIBRATION_PROFILE)),
    );
    expect(new Set(keys).size).toBe(3);
    // And the host is told WHICH bank each save belonged to.
    expect(onSaved.mock.calls.map((c) => c[0])).toEqual([GULF_BANK_CODE, KFH_BANK_CODE, NBK_BANK_CODE]);
  });

  it('keeps one template’s edits out of another’s document', () => {
    renderStudio();
    // Move the Gulf sheet.
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '7' } });
    expect((screen.getByLabelText('إزاحة أفقية (مم)') as HTMLInputElement).value).toBe('7');

    // KFH opens on its own baseline, untouched by that edit.
    selectTemplate(KFH_BANK_CODE);
    expect((screen.getByLabelText('إزاحة أفقية (مم)') as HTMLInputElement).value).toBe('0');
    fireEvent.change(screen.getByLabelText('إزاحة أفقية (مم)'), { target: { value: '-3' } });

    // NBK likewise — neither Gulf's 7 nor KFH's -3 reaches it.
    selectTemplate(NBK_BANK_CODE);
    expect((screen.getByLabelText('إزاحة أفقية (مم)') as HTMLInputElement).value).toBe('0');
  });

  it('returns Gulf to its own approved document after a round trip', () => {
    const { container } = renderStudio();
    selectTemplate(NBK_BANK_CODE);
    // The provisional template has no photo; Gulf's must come back on return.
    expect(container.querySelector('.crs-bg')).toBeNull();

    selectTemplate(GULF_BANK_CODE);
    expect(container.querySelectorAll('.ctd-field-wrapper')).toHaveLength(gulfFactoryProfile().fields.length);
    expect(Array.from(container.querySelectorAll('.ctd-field-wrapper'))
      .filter((w) => w.querySelector('.ctd-field-slot'))).toHaveLength(1);
    expect(container.querySelector('.crs-bg')).toBeTruthy();
    expect(screen.getByText(GULF_A4_TEMPLATE_NAME)).toBeTruthy();
  });
});

// ── 5. No regression in the Gulf calibration itself ──────────────────────────

describe('Gulf calibration unchanged', () => {
  it('keeps the approved geometry, key and printability', () => {
    const gulf = bankChequeProfileByCode(GULF_BANK_CODE)!;
    expect(gulf.status).toBe('APPROVED');
    expect(gulf.settingKey).toBe('cheque.calibration.gulf-a4.v1');
    expect(gulf.chequeGeometry).toEqual({ widthMm: 180, heightMm: 90 });
    expect(gulf.placement).toEqual({ xMm: 117, yMm: 60 });
    expect(isProfilePrintable(gulf)).toBe(true);
  });

  it('still exposes the whole studio toolbar for it', () => {
    renderStudio();
    for (const label of [/^حفظ$/, /استعادة الافتراضي/, /طباعة تجريبية/]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    expect(screen.getByLabelText('إزاحة أفقية (مم)')).toBeTruthy();
    expect(screen.getByLabelText('إزاحة رأسية (مم)')).toBeTruthy();
  });
});
