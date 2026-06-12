// Arabic header → English key mapping (supplier import)
const ARABIC_HEADER_MAP: Record<string, string> = {
  'الكود':        'code',
  'كود المورد':   'code',
  'رقم المورد':   'code',
  'الاسم':        'name',
  'اسم المورد':   'name',
  'الهاتف':       'phone',
  'رقم الهاتف':   'phone',
  'البريد':       'email',
  'البريد الإلكتروني': 'email',
  'العنوان':      'address',
  'اسم المسؤول':  'contactName',
  'مسؤول التواصل': 'contactName',
  'ملاحظات':      'notes',
};

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

export interface NormalizedSupplier {
  code: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  contactName?: string;
  notes?: string;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateSupplierRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedSupplier | null;
} {
  const normalized = normalizeHeaders(row);
  const errors: string[] = [];

  const code = str(normalized, 'code');
  if (!code) errors.push('كود المورد (code) مطلوب');

  const name = str(normalized, 'name');
  if (!name) errors.push('اسم المورد (name) مطلوب');

  const rawEmail = str(normalized, 'email');
  if (rawEmail && !isValidEmail(rawEmail)) errors.push('البريد الإلكتروني غير صحيح');

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      name: name!,
      phone: str(normalized, 'phone'),
      email: rawEmail || undefined,
      address: str(normalized, 'address'),
      contactName: str(normalized, 'contactName'),
      notes: str(normalized, 'notes'),
    },
  };
}
