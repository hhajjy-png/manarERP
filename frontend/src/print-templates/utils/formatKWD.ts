/**
 * KWD (Kuwaiti Dinar) currency utilities for print templates.
 * KWD has 3 decimal places: 1.500 KD = 1 dinar + 500 fils.
 */

export interface KWDParts {
  dinars: number;
  fils: number;
  /** fils as a zero-padded 3-digit string, e.g. "050" */
  filsPadded: string;
}

/**
 * Splits a KWD float into integer dinars and fils.
 *
 * @example
 * splitKWD(732.5)  // { dinars: 732, fils: 500, filsPadded: "500" }
 * splitKWD(28.05)  // { dinars: 28,  fils: 50,  filsPadded: "050" }
 */
export function splitKWD(total: number): KWDParts {
  const abs = Math.abs(total);
  const dinars = Math.floor(abs);
  const fils = Math.round((abs - dinars) * 1000);
  return { dinars, fils, filsPadded: String(fils).padStart(3, '0') };
}

/**
 * Formats a KWD amount as "1,234.500" (3 decimal places, thousands separator).
 *
 * @example
 * formatKWD(1234.5)  // "1,234.500"
 * formatKWD(28)      // "28.000"
 */
export function formatKWD(total: number): string {
  return Math.abs(total).toLocaleString('en-US', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

/**
 * Formats a KWD amount with the Arabic currency symbol: "28.500 د.ك"
 */
export function formatKWDAr(total: number): string {
  return `${formatKWD(total)} د.ك`;
}
