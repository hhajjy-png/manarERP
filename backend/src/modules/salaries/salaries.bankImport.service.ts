import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';

// ── Input / output types ──────────────────────────────────────────────────────

export interface BankImportInputRow {
  transactionId: string;
  beneficiaryAccount?: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  paymentType?: string;
  status: string;
  paymentDate: string;
  errorDescription?: string;
  civilId?: string;
  payrollMonth: number;
  payrollYear: number;
  _sheetName: string;
  _rowIndex: number;
}

export interface BankPreviewRow {
  rowIndex: number;
  sheetName: string;
  payrollMonth: number;
  payrollYear: number;
  transactionId: string;
  civilId: string | null;
  employeeId: number | null;
  employeeName: string | null;
  matchedBankAccount: string | null;
  beneficiaryAccount: string | null;
  beneficiaryName: string;
  amount: number;
  currency: string;
  paymentDate: string | null;
  paymentType: string | null;
  matchMethod: 'civilId' | 'bankAccount' | null;
  isValid: boolean;
  errors: string[];
  isDuplicate: boolean;
  isMatched: boolean;
}

export interface BankPreviewSummary {
  totalRows: number;
  matched: number;
  unmatched: number;
  invalid: number;
  duplicate: number;
  totalAmount: number;
  canExecute: boolean;
  rows: BankPreviewRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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

export function formatSourceMonth(month: number, year: number): string {
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${names[month - 1]}-${String(year).slice(2)}`;
}

// ── Service ───────────────────────────────────────────────────────────────────

class SalariesBankImportService {
  async preview(rows: BankImportInputRow[]): Promise<BankPreviewSummary> {
    if (!rows || rows.length === 0) throw AppError.badRequest('لا توجد صفوف للمعاينة');

    const employees = await prisma.employee.findMany({
      select: { id: true, fullName: true, civilId: true, bankAccount: true },
    });

    const byCivilId = new Map<string, (typeof employees)[0]>();
    const byBankAccount = new Map<string, (typeof employees)[0]>();
    for (const emp of employees) {
      if (emp.civilId?.trim()) byCivilId.set(emp.civilId.trim(), emp);
      if (emp.bankAccount?.trim()) byBankAccount.set(emp.bankAccount.trim(), emp);
    }

    const existingTxIds = new Set(
      (await prisma.salaryPayment.findMany({ select: { transactionId: true } })).map((r) => r.transactionId),
    );

    // First pass: detect duplicate transactionIds within the payload
    const payloadTxCount = new Map<string, number>();
    for (const row of rows) {
      const tid = row.transactionId?.trim();
      if (tid) payloadTxCount.set(tid, (payloadTxCount.get(tid) ?? 0) + 1);
    }
    const payloadDuplicates = new Set(
      [...payloadTxCount.entries()].filter(([, c]) => c > 1).map(([tid]) => tid),
    );

    // Second pass: build preview rows
    const previewRows: BankPreviewRow[] = rows.map((row) => {
      const errors: string[] = [];
      let isMatched = false;
      let employeeId: number | null = null;
      let employeeName: string | null = null;
      let matchedBankAccount: string | null = null;
      let matchMethod: 'civilId' | 'bankAccount' | null = null;
      let isDuplicate = false;
      let parsedPaymentDate: string | null = null;

      if (!row.payrollMonth || row.payrollMonth < 1 || row.payrollMonth > 12) {
        errors.push('شهر الرواتب غير صحيح');
      }
      if (!row.payrollYear || row.payrollYear < 2000 || row.payrollYear > 2100) {
        errors.push('سنة الرواتب غير صحيحة');
      }

      const txId = row.transactionId?.trim() ?? '';
      if (!txId) {
        errors.push('رقم المعاملة مفقود');
      } else {
        if (payloadDuplicates.has(txId)) {
          isDuplicate = true;
          errors.push('رقم المعاملة مكرر داخل الملف');
        }
        if (existingTxIds.has(txId)) {
          isDuplicate = true;
          errors.push('رقم المعاملة مستورد مسبقاً');
        }
      }

      const currency = row.currency?.trim().toUpperCase() ?? '';
      if (currency !== 'KWD') {
        errors.push(`العملة غير مدعومة: ${row.currency || 'مفقود'} (يجب أن تكون KWD)`);
      }

      const statusVal = row.status?.trim().toUpperCase() ?? '';
      if (statusVal !== 'PROCESSED') {
        errors.push(`الحالة غير صحيحة: ${row.status || 'مفقود'} (يجب أن تكون PROCESSED)`);
      }

      const amount = Number(row.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`المبلغ غير صحيح: ${row.amount}`);
      }

      if (!row.paymentDate) {
        errors.push('تاريخ الدفع مفقود');
      } else {
        const d = new Date(row.paymentDate);
        if (isNaN(d.getTime())) {
          errors.push(`تاريخ الدفع غير صحيح: ${row.paymentDate}`);
        } else {
          parsedPaymentDate = d.toISOString();
        }
      }

      const rawCivilId = row.civilId?.trim() || null;
      const rawBankAccount = row.beneficiaryAccount?.trim() || null;

      if (rawCivilId) {
        const emp = byCivilId.get(rawCivilId);
        if (emp) {
          isMatched = true;
          employeeId = emp.id;
          employeeName = emp.fullName;
          matchedBankAccount = emp.bankAccount ?? null;
          matchMethod = 'civilId';
        }
      }

      if (!isMatched && rawBankAccount) {
        const emp = byBankAccount.get(rawBankAccount);
        if (emp) {
          isMatched = true;
          employeeId = emp.id;
          employeeName = emp.fullName;
          matchedBankAccount = emp.bankAccount ?? null;
          matchMethod = 'bankAccount';
        }
      }

      if (!isMatched) {
        errors.push('لم يتم العثور على موظف مطابق (الرقم المدني أو رقم الحساب البنكي)');
      }

      return {
        rowIndex: row._rowIndex,
        sheetName: row._sheetName,
        payrollMonth: row.payrollMonth,
        payrollYear: row.payrollYear,
        transactionId: txId,
        civilId: rawCivilId,
        employeeId,
        employeeName,
        matchedBankAccount,
        beneficiaryAccount: rawBankAccount,
        beneficiaryName: row.beneficiaryName ?? '',
        amount: isNaN(amount) ? 0 : amount,
        currency,
        paymentDate: parsedPaymentDate,
        paymentType: row.paymentType?.trim() || null,
        matchMethod,
        isValid: errors.length === 0,
        errors,
        isDuplicate,
        isMatched,
      };
    });

    const matched = previewRows.filter((r) => r.isMatched).length;
    const unmatched = previewRows.filter((r) => !r.isMatched).length;
    const invalid = previewRows.filter((r) => !r.isValid).length;
    const duplicate = previewRows.filter((r) => r.isDuplicate).length;
    const totalAmount = previewRows.reduce((s, r) => s + (r.isValid ? r.amount : 0), 0);
    const canExecute = invalid === 0 && unmatched === 0;

    return { totalRows: previewRows.length, matched, unmatched, invalid, duplicate, totalAmount, canExecute, rows: previewRows };
  }

  async execute(rows: BankImportInputRow[], req: Request): Promise<{ imported: number; totalAmount: number }> {
    // Full server-side revalidation — never trust the preview payload
    const validated = await this.preview(rows);

    if (!validated.canExecute) {
      throw AppError.badRequest(
        `لا يمكن تنفيذ الاستيراد: ${validated.invalid} صف غير صحيح، ${validated.unmatched} موظف غير مطابق`,
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      const records = [];
      for (const row of validated.rows) {
        const sourceMonth = formatSourceMonth(row.payrollMonth, row.payrollYear);
        const record = await tx.salaryPayment.create({
          data: {
            transactionId: row.transactionId,
            beneficiaryAccount: row.beneficiaryAccount,
            beneficiaryName: row.beneficiaryName,
            amount: row.amount,
            currency: row.currency,
            paymentType: row.paymentType,
            status: 'PROCESSED',
            paymentDate: row.paymentDate ? new Date(row.paymentDate) : null,
            sourceMonth,
            civilId: row.civilId,
            errorDescription: null,
            duplicateFlag: null,
          },
        });
        records.push(record);
      }
      return records;
    });

    await recordAudit({
      req,
      action: 'IMPORT',
      module: 'salaries',
      newValue: { count: created.length, totalAmount: validated.totalAmount },
    });

    return { imported: created.length, totalAmount: validated.totalAmount };
  }
}

export const salariesBankImportService = new SalariesBankImportService();
