// Expense model has no `notes` field — the notes column in the import template is accepted
// but silently dropped from the normalized output to prevent Prisma runtime errors.

import { parseImportDate } from '../../../shared/utils/dateParse';

const VALID_CATEGORIES = [
  'FUEL', 'SALARIES', 'MAINTENANCE', 'RENT', 'PURCHASES', 'EQUIPMENT', 'SERVICES', 'OTHER',
] as const;
type ExpenseCategory = (typeof VALID_CATEGORIES)[number];

export interface ExpenseFKMaps {
  contractCodeToId: Map<string, number>;
  supplierCodeToId: Map<string, number>;
}

export interface NormalizedExpense {
  code: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  date?: Date;
  contractId?: number;
  supplierId?: number;
  status: 'PENDING';
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

/** DD/MM/YYYY وISO والرقم التسلسلي — انظر `shared/utils/dateParse`. */
const parseDate = (v: unknown): Date | null => parseImportDate(v);

function parsePositiveFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/,/g, ''));
  if (isNaN(raw) || raw <= 0) return null;
  return raw;
}

export function validateExpenseRow(
  row: Record<string, unknown>,
  fkMaps: ExpenseFKMaps,
): { valid: boolean; errors: string[]; normalized: NormalizedExpense | null } {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('رمز المصروف (code) مطلوب');

  const rawCategory = str(row, 'category');
  if (!rawCategory) {
    errors.push('الفئة (category) مطلوبة');
  } else if (!(VALID_CATEGORIES as readonly string[]).includes(rawCategory)) {
    errors.push(`الفئة (category) يجب أن تكون: ${VALID_CATEGORIES.join(' / ')}`);
  }

  const description = str(row, 'description');
  if (!description) errors.push('الوصف (description) مطلوب');

  const amount = parsePositiveFloat(row['amount']);
  if (amount === null) errors.push('المبلغ (amount) يجب أن يكون رقماً موجباً');

  // date — optional
  let date: Date | undefined;
  if (row['date'] != null && row['date'] !== '') {
    const d = parseDate(row['date']);
    if (!d) errors.push('التاريخ (date) يجب أن يكون بصيغة YYYY-MM-DD');
    else date = d;
  }

  // FK — contractCode
  let contractId: number | undefined;
  const contractCode = str(row, 'contractCode');
  if (contractCode) {
    const id = fkMaps.contractCodeToId.get(contractCode);
    if (id === undefined) errors.push(`رمز العقد "${contractCode}" غير موجود`);
    else contractId = id;
  }

  // FK — supplierCode
  let supplierId: number | undefined;
  const supplierCode = str(row, 'supplierCode');
  if (supplierCode) {
    const id = fkMaps.supplierCodeToId.get(supplierCode);
    if (id === undefined) errors.push(`رمز المورد "${supplierCode}" غير موجود`);
    else supplierId = id;
  }

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      category: rawCategory as ExpenseCategory,
      description: description!,
      amount: amount!,
      date,
      contractId,
      supplierId,
      status: 'PENDING',
    },
  };
}
