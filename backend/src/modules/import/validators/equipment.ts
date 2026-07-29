import { ENUMS } from '../../../config/constants';
import { parseImportDate } from '../../../shared/utils/dateParse';

export interface NormalizedEquipment {
  code: string;
  type: string;
  ownerName?: string;
  driverName?: string;
  plateNumber?: string;
  chassisNumber?: string;
  color?: string;
  registrationExpiry?: Date;
  status: 'WORKING' | 'NOT_WORKING';
  name?: string;
  manufacturer?: string;
  model?: string;
  manufactureYear?: number;
  serialNumber?: string;
  currentLocation?: string;
  operatingHours: number;
  purchaseDate?: Date;
  purchaseCost?: number;
  notes?: string;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

/** DD/MM/YYYY وISO والرقم التسلسلي — انظر `shared/utils/dateParse`. */
const parseDate = (v: unknown): Date | undefined => parseImportDate(v) ?? undefined;

function parseNumber(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return isNaN(n) || n < 0 ? 0 : n;
}

function parseOptionalPositiveInt(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = parseInt(String(v), 10);
  return isNaN(n) || n < 1900 || n > 2100 ? undefined : n;
}

export function validateEquipmentRow(row: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  normalized: NormalizedEquipment | null;
} {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('رقم المعدة (code) مطلوب');

  const type = str(row, 'type');
  if (!type) errors.push('نوع المعدة (type) مطلوب');

  const rawStatus = str(row, 'status');
  const status = (ENUMS.equipmentStatus as readonly string[]).includes(rawStatus ?? '')
    ? (rawStatus as 'WORKING' | 'NOT_WORKING')
    : 'WORKING';

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      type: type!,
      ownerName: str(row, 'ownerName'),
      driverName: str(row, 'driverName'),
      plateNumber: str(row, 'plateNumber'),
      // أعمدة اختيارية: ملفّ استيراد قديم لا يحملها ⇒ undefined كما لو لم تُذكر.
      chassisNumber: str(row, 'chassisNumber'),
      color: str(row, 'color'),
      registrationExpiry: parseDate(row['registrationExpiry']),
      status,
      name: str(row, 'name'),
      manufacturer: str(row, 'manufacturer'),
      model: str(row, 'model'),
      manufactureYear: parseOptionalPositiveInt(row['manufactureYear']),
      serialNumber: str(row, 'serialNumber'),
      currentLocation: str(row, 'currentLocation'),
      operatingHours: parseNumber(row['operatingHours']),
      purchaseDate: parseDate(row['purchaseDate']),
      purchaseCost: row['purchaseCost'] != null && row['purchaseCost'] !== '' ? parseNumber(row['purchaseCost']) : undefined,
      notes: str(row, 'notes'),
    },
  };
}
