import { ENUMS } from '../../../config/constants';

export interface NormalizedCustomer {
  code: string;
  name: string;
  type: 'GOVERNMENT' | 'PRIVATE';
  category?: string;
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

export function validateCustomerRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedCustomer | null;
} {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('رقم العميل (code) مطلوب');

  const name = str(row, 'name');
  if (!name) errors.push('اسم العميل (name) مطلوب');

  const rawEmail = str(row, 'email');
  if (rawEmail && !isValidEmail(rawEmail)) errors.push('البريد الإلكتروني غير صحيح');

  const rawType = str(row, 'type');
  const type = (ENUMS.customerType as readonly string[]).includes(rawType ?? '')
    ? (rawType as 'GOVERNMENT' | 'PRIVATE')
    : 'PRIVATE';

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      name: name!,
      type,
      category: str(row, 'category'),
      phone: str(row, 'phone'),
      email: rawEmail || undefined,
      address: str(row, 'address'),
      contactName: str(row, 'contactName'),
      notes: str(row, 'notes'),
    },
  };
}
