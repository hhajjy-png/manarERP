import type { StaticTextKey, StaticTextOverrides } from './staticTextTypes';
import { DEFAULT_STATIC_TEXT, STATIC_TEXT_LIMITS } from './staticTextTypes';

/**
 * Returns the static text for a key — user override, then design-specific default,
 * then global default.
 *
 * @param overrides  - live StaticTextOverrides from CompanyPrintData
 * @param key        - the StaticTextKey to look up
 * @param designDefault - optional per-design hardcoded string (e.g. 'INVOICE' vs 'فاتورة')
 */
export function getStaticText(
  overrides: StaticTextOverrides | undefined,
  key: StaticTextKey,
  designDefault?: string,
): string {
  return overrides?.[key] ?? designDefault ?? DEFAULT_STATIC_TEXT[key];
}

export function validateStaticText(key: StaticTextKey, value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'النص لا يمكن أن يكون فارغاً';
  const limit = STATIC_TEXT_LIMITS[key];
  if (trimmed.length > limit) return `الحد الأقصى ${limit} حرفاً`;
  return null;
}

export function escapeStaticText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function parseStaticTextOverrides(json: string): StaticTextOverrides {
  try {
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: StaticTextOverrides = {};
    for (const key of Object.keys(parsed)) {
      if (key in DEFAULT_STATIC_TEXT && typeof parsed[key] === 'string') {
        result[key as StaticTextKey] = parsed[key] as string;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export function serializeStaticTextOverrides(overrides: StaticTextOverrides): string {
  return JSON.stringify(overrides);
}
