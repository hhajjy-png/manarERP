import { ENUMS } from '../../../config/constants';

export interface NormalizedEmployee {
  code: string;
  fullName: string;
  fullNameEn?: string;
  civilId?: string;
  jobTitle?: string;
  nationality?: string;
  passportNumber?: string;
  passportExpiry?: Date;
  residencyExpiry?: Date;
  licenseExpiry?: Date;
  vehiclePlate?: string;
  vehicleLicenseExpiry?: Date;
  birthDate?: Date;
  company?: string;
  department?: string;
  salary: number;
  hireDate?: Date;
  phone?: string;
  email?: string;
  address?: string;
  status: 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED';
  notes?: string;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

function parseDate(v: unknown): Date | undefined {
  if (v == null || v === '') return undefined;
  // Excel serial number
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? undefined : d;
  }
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? undefined : d;
}

function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateEmployeeRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedEmployee | null;
} {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('الرقم الوظيفي (code) مطلوب');

  const fullName = str(row, 'fullName');
  if (!fullName) errors.push('الاسم الكامل (fullName) مطلوب');

  const rawEmail = str(row, 'email');
  if (rawEmail && !isValidEmail(rawEmail)) errors.push('البريد الإلكتروني غير صحيح');

  const rawStatus = str(row, 'status');
  const status = (ENUMS.employeeStatus as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as 'ACTIVE' | 'ON_LEAVE' | 'TERMINATED')
    : 'ACTIVE';

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      fullName: fullName!,
      fullNameEn: str(row, 'fullNameEn'),
      civilId: str(row, 'civilId'),
      jobTitle: str(row, 'jobTitle'),
      nationality: str(row, 'nationality'),
      passportNumber: str(row, 'passportNumber'),
      passportExpiry: parseDate(row['passportExpiry']),
      residencyExpiry: parseDate(row['residencyExpiry']),
      licenseExpiry: parseDate(row['licenseExpiry']),
      vehiclePlate: str(row, 'vehiclePlate'),
      vehicleLicenseExpiry: parseDate(row['vehicleLicenseExpiry']),
      birthDate: parseDate(row['birthDate']),
      company: str(row, 'company'),
      department: str(row, 'department'),
      salary: parseNumber(row['salary']),
      hireDate: parseDate(row['hireDate']),
      phone: str(row, 'phone'),
      email: rawEmail || undefined,
      address: str(row, 'address'),
      status,
      notes: str(row, 'notes'),
    },
  };
}
