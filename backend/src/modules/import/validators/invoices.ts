// Direction values accepted from import file: CUSTOMER (→ SALES) | SUPPLIER (→ PURCHASE)
// These are user-friendly aliases for the system's internal SALES/PURCHASE direction values.

const DIRECTION_MAP: Record<string, string> = {
  CUSTOMER: 'SALES',
  SUPPLIER: 'PURCHASE',
  SALES: 'SALES',
  PURCHASE: 'PURCHASE',
};

const VALID_INVOICE_TYPES = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت'] as const;

const VALID_STATUSES = ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'] as const;
type InvoiceStatus = (typeof VALID_STATUSES)[number];

export interface InvoiceFKMaps {
  customerCodeToId: Map<string, number>;
  supplierCodeToId: Map<string, number>;
  contractCodeToId: Map<string, number>;
}

export interface NormalizedInvoice {
  number: string;
  invoiceNumber: string;
  direction: string;
  invoiceType: string;
  customerId?: number;
  supplierId?: number;
  contractId?: number;
  issueDate: Date;
  dueDate?: Date;
  billingMonth?: number;
  billingYear?: number;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discount: number;
  total: number;
  paidAmount: number;
  status: InvoiceStatus;
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

function parseInt10(v: unknown): number | null {
  if (v == null || v === '') return null;
  const raw = typeof v === 'number' ? Math.trunc(v) : parseInt(String(v).trim(), 10);
  if (isNaN(raw)) return null;
  return raw;
}

export function validateInvoiceRow(
  row: Record<string, unknown>,
  fkMaps: InvoiceFKMaps,
): { valid: boolean; errors: string[]; normalized: NormalizedInvoice | null } {
  const errors: string[] = [];

  // invoiceNumber — required, must be non-empty (no regex enforced for import)
  const invoiceNumber = str(row, 'invoiceNumber');
  if (!invoiceNumber) errors.push('رقم الفاتورة (invoiceNumber) مطلوب');

  // direction — required, CUSTOMER→SALES or SUPPLIER→PURCHASE
  const rawDirection = str(row, 'direction');
  let direction: string | undefined;
  if (!rawDirection) {
    errors.push('الاتجاه (direction) مطلوب: CUSTOMER أو SUPPLIER');
  } else {
    direction = DIRECTION_MAP[rawDirection.toUpperCase()];
    if (!direction) {
      errors.push(`الاتجاه (direction) يجب أن يكون: CUSTOMER أو SUPPLIER (المُدخل: "${rawDirection}")`);
    }
  }

  // invoiceType — required, must match existing system values
  const invoiceType = str(row, 'invoiceType');
  if (!invoiceType) {
    errors.push(`نوع الفاتورة (invoiceType) مطلوب: ${VALID_INVOICE_TYPES.join(' / ')}`);
  } else if (!(VALID_INVOICE_TYPES as readonly string[]).includes(invoiceType)) {
    errors.push(`نوع الفاتورة (invoiceType) يجب أن يكون: ${VALID_INVOICE_TYPES.join(' / ')}`);
  }

  // issueDate — required
  let issueDate: Date | undefined;
  if (row['issueDate'] == null || row['issueDate'] === '') {
    errors.push('تاريخ الفاتورة (issueDate) مطلوب');
  } else {
    const d = parseDate(row['issueDate']);
    if (!d) errors.push('تاريخ الفاتورة (issueDate) يجب أن يكون تاريخاً صالحاً أو رقم Excel');
    else issueDate = d;
  }

  // total — required, >= 0
  let total: number | undefined;
  if (row['total'] == null || row['total'] === '') {
    errors.push('الإجمالي (total) مطلوب');
  } else {
    const t = parseNonNegativeFloat(row['total']);
    if (t === null) errors.push('الإجمالي (total) يجب أن يكون رقماً غير سالب');
    else total = t;
  }

  // subtotal — optional, >= 0, defaults to total if omitted
  let subtotal = 0;
  if (row['subtotal'] != null && row['subtotal'] !== '') {
    const s = parseNonNegativeFloat(row['subtotal']);
    if (s === null) errors.push('الإجمالي الفرعي (subtotal) يجب أن يكون رقماً غير سالب');
    else subtotal = s;
  } else if (total !== undefined) {
    subtotal = total;
  }

  // taxRate — optional, >= 0, defaults to 0
  let taxRate = 0;
  if (row['taxRate'] != null && row['taxRate'] !== '') {
    const r = parseNonNegativeFloat(row['taxRate']);
    if (r === null) errors.push('نسبة الضريبة (taxRate) يجب أن تكون رقماً غير سالب');
    else taxRate = r;
  }

  // taxAmount — optional, >= 0, defaults to 0
  let taxAmount = 0;
  if (row['taxAmount'] != null && row['taxAmount'] !== '') {
    const a = parseNonNegativeFloat(row['taxAmount']);
    if (a === null) errors.push('مبلغ الضريبة (taxAmount) يجب أن يكون رقماً غير سالب');
    else taxAmount = a;
  }

  // discount — optional, >= 0, defaults to 0
  let discount = 0;
  if (row['discount'] != null && row['discount'] !== '') {
    const d = parseNonNegativeFloat(row['discount']);
    if (d === null) errors.push('الخصم (discount) يجب أن يكون رقماً غير سالب');
    else discount = d;
  }

  // paidAmount — optional, >= 0, defaults to 0, must not exceed total
  let paidAmount = 0;
  if (row['paidAmount'] != null && row['paidAmount'] !== '') {
    const p = parseNonNegativeFloat(row['paidAmount']);
    if (p === null) errors.push('المبلغ المدفوع (paidAmount) يجب أن يكون رقماً غير سالب');
    else {
      if (total !== undefined && p > total + 0.001) {
        errors.push('المبلغ المدفوع (paidAmount) يتجاوز الإجمالي (total)');
      }
      paidAmount = p;
    }
  }

  // status — optional, defaults to UNPAID
  const rawStatus = str(row, 'status');
  let status: InvoiceStatus = 'UNPAID';
  if (rawStatus) {
    if (!(VALID_STATUSES as readonly string[]).includes(rawStatus)) {
      errors.push(`الحالة (status) يجب أن تكون: ${VALID_STATUSES.join(' / ')}`);
    } else {
      status = rawStatus as InvoiceStatus;
    }
  }

  // dueDate — optional
  let dueDate: Date | undefined;
  if (row['dueDate'] != null && row['dueDate'] !== '') {
    const d = parseDate(row['dueDate']);
    if (!d) errors.push('تاريخ الاستحقاق (dueDate) يجب أن يكون تاريخاً صالحاً');
    else dueDate = d;
  }

  // billingMonth — optional 1–12
  let billingMonth: number | undefined;
  if (row['billingMonth'] != null && row['billingMonth'] !== '') {
    const m = parseInt10(row['billingMonth']);
    if (m === null || m < 1 || m > 12) errors.push('شهر الحساب (billingMonth) يجب أن يكون رقماً من 1 إلى 12');
    else billingMonth = m;
  }

  // billingYear — optional 2020–2099
  let billingYear: number | undefined;
  if (row['billingYear'] != null && row['billingYear'] !== '') {
    const y = parseInt10(row['billingYear']);
    if (y === null || y < 2020 || y > 2099) errors.push('سنة الحساب (billingYear) يجب أن تكون سنة من 2020 إلى 2099');
    else billingYear = y;
  }

  // FK — customerCode (required if direction=SALES/CUSTOMER)
  let customerId: number | undefined;
  const customerCode = str(row, 'customerCode');
  if (direction === 'SALES') {
    if (!customerCode) {
      errors.push('رمز العميل (customerCode) مطلوب عند الاتجاه CUSTOMER');
    } else {
      const id = fkMaps.customerCodeToId.get(customerCode);
      if (id === undefined) errors.push(`رمز العميل "${customerCode}" غير موجود`);
      else customerId = id;
    }
  } else if (customerCode) {
    // optional for PURCHASE direction — resolve if provided
    const id = fkMaps.customerCodeToId.get(customerCode);
    if (id === undefined) errors.push(`رمز العميل "${customerCode}" غير موجود`);
    else customerId = id;
  }

  // FK — supplierCode (required if direction=PURCHASE/SUPPLIER)
  let supplierId: number | undefined;
  const supplierCode = str(row, 'supplierCode');
  if (direction === 'PURCHASE') {
    if (!supplierCode) {
      errors.push('رمز المورد (supplierCode) مطلوب عند الاتجاه SUPPLIER');
    } else {
      const id = fkMaps.supplierCodeToId.get(supplierCode);
      if (id === undefined) errors.push(`رمز المورد "${supplierCode}" غير موجود`);
      else supplierId = id;
    }
  } else if (supplierCode) {
    // optional for SALES direction — resolve if provided
    const id = fkMaps.supplierCodeToId.get(supplierCode);
    if (id === undefined) errors.push(`رمز المورد "${supplierCode}" غير موجود`);
    else supplierId = id;
  }

  // FK — contractCode (optional for all directions)
  let contractId: number | undefined;
  const contractCode = str(row, 'contractCode');
  if (contractCode) {
    const id = fkMaps.contractCodeToId.get(contractCode);
    if (id === undefined) errors.push(`رمز العقد "${contractCode}" غير موجود`);
    else contractId = id;
  }

  if (errors.length > 0) return { valid: false, errors, normalized: null };

  return {
    valid: true,
    errors: [],
    normalized: {
      number: invoiceNumber!,
      invoiceNumber: invoiceNumber!,
      direction: direction!,
      invoiceType: invoiceType!,
      customerId,
      supplierId,
      contractId,
      issueDate: issueDate!,
      dueDate,
      billingMonth,
      billingYear,
      subtotal,
      taxRate,
      taxAmount,
      discount,
      total: total!,
      paidAmount,
      status,
      notes: str(row, 'notes'),
    },
  };
}
