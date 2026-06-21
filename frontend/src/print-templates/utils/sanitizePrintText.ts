/**
 * Coerces a nullable/undefined print field to a trimmed string.
 *
 * Use on any field that will be rendered as text in a print template:
 * prevents undefined/null from appearing as "undefined" literals, and
 * strips accidental leading/trailing whitespace that would disturb layout.
 *
 * Does NOT use innerHTML or any HTML escaping — output is plain text only.
 */
export function sanitizePrintText(value?: string | null): string {
  if (value == null) return '';
  return value.trim();
}
