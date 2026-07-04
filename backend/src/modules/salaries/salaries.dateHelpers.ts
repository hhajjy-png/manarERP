// Shared month/date parsing helpers for salary-payment features.
// Extracted from salaries.bankImport.service.ts so the live analytics service
// (and remaining callers) no longer depend on the legacy bank-import service.

const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, september: 9, sept: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

export function parseSheetMonth(sheetName: string): { month: number; year: number } | null {
  const cleaned = sheetName.trim().toLowerCase();
  const match = cleaned.match(/^([a-z]+)[-\s](\d{4})$/);
  if (!match) return null;
  const month = MONTH_NAMES[match[1]];
  if (!month) return null;
  const year = parseInt(match[2], 10);
  if (year < 2000 || year > 2100) return null;
  return { month, year };
}

// Parses the Month column in All_Transactions sheet: "Mar-25" → { month: 3, year: 2025 }
// Also handles Date objects for callers that receive XLSX-parsed date cells.
export function parseMonthColumn(value: unknown): { month: number; year: number } | null {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    const month = value.getMonth() + 1;
    const year = value.getFullYear();
    if (year < 2000 || year > 2100) return null;
    return { month, year };
  }
  if (typeof value !== 'string' || !value.trim()) return null;
  const cleaned = value.trim().toLowerCase();
  const match = cleaned.match(/^([a-z]+)-(\d{2})$/);
  if (!match) return null;
  const month = MONTH_NAMES[match[1]];
  if (!month) return null;
  const year = 2000 + parseInt(match[2], 10);
  if (year > 2100) return null;
  return { month, year };
}

export function formatSourceMonth(month: number, year: number): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[month - 1]}-${String(year).slice(2)}`;
}
