const VALID_STATUSES = ['ACTIVE', 'EXPIRED', 'RENEWING', 'SUSPENDED'] as const;
type ContractStatus = (typeof VALID_STATUSES)[number];

export interface ContractFKMaps {
  customerCodeToId: Map<string, number>;
  employeeCodeToId: Map<string, number>;
}

export interface NormalizedContract {
  code: string;
  asphaltPlant: string;
  status: ContractStatus;
  location?: string;
  companyName?: string;
  unitName?: string;
  price?: number;
  monthlyTransportValue?: number;
  startDate?: Date;
  endDate?: Date;
  customerId?: number;
  managerId?: number;
  notes?: string;
}

function str(row: Record<string, unknown>, key: string): string | undefined {
  const v = row[key];
  if (v == null || v === '') return undefined;
  return String(v).trim();
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(v).trim());
  return isNaN(d.getTime()) ? null : d;
}

function parseNonNegativeFloat(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? v : parseFloat(String(v).trim().replace(/,/g, ''));
  if (isNaN(raw) || raw < 0) return null;
  return raw;
}

export function validateContractRow(
  row: Record<string, unknown>,
  fkMaps: ContractFKMaps,
): { valid: boolean; errors: string[]; normalized: NormalizedContract | null } {
  const errors: string[] = [];

  const code = str(row, 'code');
  if (!code) errors.push('رمز العقد (code) مطلوب');

  const asphaltPlant = str(row, 'asphaltPlant');
  if (!asphaltPlant) errors.push('محطة الأسفلت (asphaltPlant) مطلوبة');

  // status — optional, default ACTIVE
  const rawStatus = str(row, 'status');
  let status: ContractStatus = 'ACTIVE';
  if (rawStatus) {
    if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
      errors.push(`الحالة (status) يجب أن تكون: ${VALID_STATUSES.join(' / ')}`);
    } else {
      status = rawStatus as ContractStatus;
    }
  }

  // dates
  let startDate: Date | undefined;
  const startDateRaw = row['startDate'];
  if (startDateRaw != null && startDateRaw !== '') {
    const d = parseDate(startDateRaw);
    if (!d) errors.push('تاريخ البدء (startDate) يجب أن يكون بصيغة YYYY-MM-DD');
    else startDate = d;
  }

  let endDate: Date | undefined;
  const endDateRaw = row['endDate'];
  if (endDateRaw != null && endDateRaw !== '') {
    const d = parseDate(endDateRaw);
    if (!d) errors.push('تاريخ الانتهاء (endDate) يجب أن يكون بصيغة YYYY-MM-DD');
    else endDate = d;
  }

  if (startDate && endDate && endDate < startDate) {
    errors.push('تاريخ الانتهاء يجب أن يكون بعد أو يساوي تاريخ البدء');
  }

  // price — optional non-negative
  let price: number | undefined;
  if (row['price'] != null && row['price'] !== '') {
    const p = parseNonNegativeFloat(row['price']);
    if (p === null) errors.push('السعر (price) يجب أن يكون رقماً غير سالب');
    else price = p;
  }

  // monthlyTransportValue — optional non-negative
  let monthlyTransportValue: number | undefined;
  if (row['monthlyTransportValue'] != null && row['monthlyTransportValue'] !== '') {
    const m = parseNonNegativeFloat(row['monthlyTransportValue']);
    if (m === null) errors.push('قيمة النقل الشهري (monthlyTransportValue) يجب أن تكون رقماً غير سالب');
    else monthlyTransportValue = m;
  }

  // FK — customerCode
  let customerId: number | undefined;
  const customerCode = str(row, 'customerCode');
  if (customerCode) {
    const id = fkMaps.customerCodeToId.get(customerCode);
    if (id === undefined) errors.push(`رمز العميل "${customerCode}" غير موجود`);
    else customerId = id;
  }

  // FK — managerCode
  let managerId: number | undefined;
  const managerCode = str(row, 'managerCode');
  if (managerCode) {
    const id = fkMaps.employeeCodeToId.get(managerCode);
    if (id === undefined) errors.push(`رمز الموظف "${managerCode}" غير موجود أو غير نشط`);
    else managerId = id;
  }

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      code: code!,
      asphaltPlant: asphaltPlant!,
      status,
      location: str(row, 'location'),
      companyName: str(row, 'companyName'),
      unitName: str(row, 'unitName'),
      price,
      monthlyTransportValue,
      startDate,
      endDate,
      customerId,
      managerId,
      notes: str(row, 'notes'),
    },
  };
}
