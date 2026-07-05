/**
 * Single source of truth for monetary display formatting (frontend).
 *
 * FUTURE (Company Settings → Currency Display Language): only this module changes.
 * English: 144,922.400 KWD   Arabic: 144,922.400 د.ك
 * The formatter API and all callers stay unchanged.
 *
 * NOTE: kept in sync (by value) with backend/src/shared/config/currencyConfig.ts.
 * The two TS projects build independently, so the config is intentionally mirrored.
 */
export const currencyConfig = {
  locale: 'en-US',
  code: 'KWD',
} as const;
