// Arabic header → English key mapping (project price import)
const ARABIC_HEADER_MAP: Record<string, string> = {
  'مصنع الأسفلت':  'asphaltPlant',
  'اسم الشركة':    'companyName',
  'مكان العقد':    'contractLocation',
  'وحدة العقد':    'contractUnit',
  'سعر الوحدة':    'unitPrice',
};

// Allowed values for contractUnit — must match Arabic values used in DB
const VALID_UNITS = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'] as const;
type ContractUnit = (typeof VALID_UNITS)[number];

function normalizeHeaders(row: Record<string, unknown>): Record<string, unknown> {
  const trimmed: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    trimmed[k.trim()] = v;
  }
  const result: Record<string, unknown> = { ...trimmed };
  for (const [arabicKey, englishKey] of Object.entries(ARABIC_HEADER_MAP)) {
    if (arabicKey in trimmed && !(englishKey in trimmed)) {
      result[englishKey] = trimmed[arabicKey];
    }
  }
  return result;
}

export interface NormalizedPrice {
  asphaltPlant: string;
  companyName: string;
  contractLocation: string;
  contractUnit: ContractUnit;
  unitPrice: number;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

// Accepts both JS numbers (from SheetJS numeric cells) and string representations.
// Strips commas so values like "1,500" parse correctly.
function parsePositiveFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/,/g, ''));
  if (isNaN(raw) || raw <= 0) return null;
  return raw;
}

export function validatePriceRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedPrice | null;
} {
  const norm = normalizeHeaders(row);
  const errors: string[] = [];

  const asphaltPlant = str(norm, 'asphaltPlant');
  if (!asphaltPlant) errors.push('مصنع الأسفلت مطلوب');

  const companyName = str(norm, 'companyName');
  if (!companyName) errors.push('اسم الشركة مطلوب');

  const contractLocation = str(norm, 'contractLocation');
  if (!contractLocation) errors.push('مكان العقد مطلوب');

  const rawUnit = str(norm, 'contractUnit');
  if (!rawUnit) {
    errors.push('وحدة العقد مطلوبة');
  } else if (!(VALID_UNITS as readonly string[]).includes(rawUnit)) {
    errors.push(`وحدة العقد يجب أن تكون: ${VALID_UNITS.join(' / ')}`);
  }

  const unitPrice = parsePositiveFloat(norm['unitPrice']);
  if (unitPrice === null) errors.push('سعر الوحدة يجب أن يكون رقماً موجباً');

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      asphaltPlant: asphaltPlant!,
      companyName: companyName!,
      contractLocation: contractLocation!,
      contractUnit: rawUnit as ContractUnit,
      unitPrice: unitPrice!,
    },
  };
}

// Composite dedup key used by import.service — all 4 fields included per Gemini review:
// same plant+company+location+unit is the full identity of a price record.
export function priceCompositeKey(asphaltPlant: string, companyName: string, contractLocation: string, contractUnit: string): string {
  return `${asphaltPlant}|${companyName}|${contractLocation}|${contractUnit}`;
}
