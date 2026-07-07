import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../api/client', () => ({ api: { get: vi.fn() } }));

import { api } from '../../api/client';
import { useSettings, currentCurrencyLanguage, CURRENCY_DISPLAY_LANGUAGE_KEY } from '../settingsStore';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockGet = (api as any).get as ReturnType<typeof vi.fn>;

function resetStore() {
  useSettings.setState({ currencyLanguage: 'english', loaded: false });
}

describe('settingsStore — currency display language (single source of truth)', () => {
  beforeEach(() => { vi.clearAllMocks(); resetStore(); });
  afterEach(() => resetStore());

  it('loadCompanySettings holds arabic from the setting; currentCurrencyLanguage reflects it', async () => {
    mockGet.mockResolvedValue({ data: { data: { settings: [{ key: CURRENCY_DISPLAY_LANGUAGE_KEY, value: 'arabic' }] } } });
    await useSettings.getState().loadCompanySettings();
    expect(useSettings.getState().currencyLanguage).toBe('arabic');
    expect(useSettings.getState().loaded).toBe(true);
    expect(currentCurrencyLanguage()).toBe('arabic');
  });

  it('defaults to english when the setting is missing', async () => {
    mockGet.mockResolvedValue({ data: { data: { settings: [{ key: 'company.name', value: 'X' }] } } });
    await useSettings.getState().loadCompanySettings();
    expect(useSettings.getState().currencyLanguage).toBe('english');
    expect(currentCurrencyLanguage()).toBe('english');
  });

  it('defaults safely to english when the fetch fails', async () => {
    mockGet.mockRejectedValue(new Error('network'));
    await useSettings.getState().loadCompanySettings();
    expect(useSettings.getState().loaded).toBe(true);
    expect(currentCurrencyLanguage()).toBe('english');
  });

  it('setCurrencyLanguage updates the single source and normalizes invalid input', () => {
    useSettings.getState().setCurrencyLanguage('arabic');
    expect(currentCurrencyLanguage()).toBe('arabic');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useSettings.getState().setCurrencyLanguage('bogus' as any);
    expect(currentCurrencyLanguage()).toBe('english');
  });
});
