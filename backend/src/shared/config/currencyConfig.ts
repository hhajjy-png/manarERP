/**
 * Single source of truth for monetary display formatting (backend).
 * Mirrors frontend/src/lib/format/currencyConfig.ts by value — keep in sync.
 * FUTURE Company Settings language switch changes ONLY this module.
 */
export const currencyConfig = {
  locale: 'en-US',
  code: 'KWD',
} as const;
