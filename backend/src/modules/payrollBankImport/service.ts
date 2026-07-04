import type { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import type { ParsedBankRow, PreviewInput, PreviewSummary, ImportReport } from './types';
import { validateRow, buildPayloadTxCount } from './validators';
import { buildEmployeeIndex, matchEmployee } from './matcher';
import { buildPreview } from './previewBuilder';
import { runAssistant } from './assistant';
import { formatSourceMonth } from './excelParser';

const MAX_ROWS = 2000;

class PayrollBankImportService {
  // ── Preview ────────────────────────────────────────────────────────────────

  async preview(input: PreviewInput): Promise<PreviewSummary> {
    const { templateName, rows } = input;
    if (!rows || rows.length === 0) throw AppError.badRequest('لا توجد صفوف للمعاينة');
    if (rows.length > MAX_ROWS) throw AppError.badRequest(`الحد الأقصى ${MAX_ROWS} صف لكل استيراد`);

    // Load all employees for matching (+ salary for anomaly detection).
    const employees = await prisma.employee.findMany({
      select: { id: true, code: true, fullName: true, civilId: true, bankAccount: true, salary: true, status: true },
    });
    const index = buildEmployeeIndex(employees);

    // Load existing salary payments once — used for both the transactionId hard
    // duplicate guard and the assistant's variance / duplicate-payroll baselines.
    const existingPayments = await prisma.salaryPayment.findMany({
      select: { transactionId: true, civilId: true, sourceMonth: true, amount: true },
    });
    const existingTxIds = new Set(existingPayments.map((r) => r.transactionId));

    const payloadTxCount = buildPayloadTxCount(rows);

    const matches     = rows.map((row) => matchEmployee(row, index));
    const validations = rows.map((row) => validateRow(row, existingTxIds, payloadTxCount));

    const summary = buildPreview({ templateName, rows, matches, validations, existingTxIds });

    // Assistant (v1): preview-only, non-blocking enrichment. Does not affect canExecute.
    return runAssistant(summary, {
      employees,
      existingPayments: existingPayments.map((p) => ({
        civilId: p.civilId, sourceMonth: p.sourceMonth, amount: p.amount,
      })),
    });
  }

  // ── Execute ────────────────────────────────────────────────────────────────

  async execute(input: PreviewInput, req: Request): Promise<ImportReport> {
    const { templateName, rows } = input;
    if (!rows || rows.length === 0) throw AppError.badRequest('لا توجد صفوف للاستيراد');
    if (rows.length > MAX_ROWS) throw AppError.badRequest(`الحد الأقصى ${MAX_ROWS} صف لكل استيراد`);

    // Full server-side re-validation — never trust client preview
    const summary = await this.preview(input);

    if (!summary.canExecute) {
      throw AppError.badRequest(
        `لا يمكن تنفيذ الاستيراد: ${summary.invalid} صف غير صحيح، ${summary.unmatched} موظف غير مطابق`,
      );
    }

    const user = (req as Request & { user?: { id: number; username: string } }).user;
    const importedBy = user?.username ?? 'النظام';
    const importedAt = new Date().toISOString();

    const reportRows: ImportReport['rows'] = [];
    let totalAmount = 0;
    let imported = 0;
    let skipped = 0;
    let withWarnings = 0;

    // Execute inside a transaction — rollback on any failure
    await prisma.$transaction(async (tx) => {
      for (const pRow of summary.rows) {
        if (pRow.status === 'error') {
          skipped++;
          reportRows.push({
            employeeCode: pRow.matchedEmployeeCode,
            employeeName: pRow.matchedEmployeeName,
            civilId: pRow.civilId,
            amount: pRow.amount,
            currency: pRow.currency,
            transactionId: pRow.transactionId,
            paymentDate: pRow.paymentDate,
            payrollMonth: pRow.payrollMonth,
            payrollYear: pRow.payrollYear,
            status: 'skipped',
            reason: pRow.errors.join(' | '),
          });
          continue;
        }

        const sourceMonth = formatSourceMonth(pRow.payrollMonth, pRow.payrollYear);

        await tx.salaryPayment.create({
          data: {
            transactionId:     pRow.transactionId ?? `${importedAt}-${pRow._rowIndex}`,
            beneficiaryAccount: pRow.bankAccount ?? pRow.iban ?? undefined,
            beneficiaryName:   pRow.beneficiaryName,
            bankName:          templateName,
            amount:            pRow.amount,
            currency:          pRow.currency,
            paymentType:       null,
            status:            'PROCESSED',
            paymentDate:       pRow.paymentDate ? new Date(pRow.paymentDate) : null,
            sourceMonth,
            civilId:           pRow.civilId,
            errorDescription:  null,
            duplicateFlag:     null,
          },
        });

        imported++;
        totalAmount += pRow.amount;
        if (pRow.warnings.length > 0) withWarnings++;

        reportRows.push({
          employeeCode: pRow.matchedEmployeeCode,
          employeeName: pRow.matchedEmployeeName,
          civilId: pRow.civilId,
          amount: pRow.amount,
          currency: pRow.currency,
          transactionId: pRow.transactionId,
          paymentDate: pRow.paymentDate,
          payrollMonth: pRow.payrollMonth,
          payrollYear: pRow.payrollYear,
          status: 'imported',
          reason: pRow.warnings.length > 0 ? pRow.warnings.join(' | ') : undefined,
        });
      }
    });

    await recordAudit({
      req,
      action: 'IMPORT',
      module: 'payrollBankImport',
      newValue: { templateName, imported, skipped, totalAmount, importedBy },
    });

    return { templateName, importedAt, importedBy, imported, skipped, withWarnings, totalAmount, rows: reportRows };
  }

  // ── Validate rows input ────────────────────────────────────────────────────

  validateInput(rows: unknown): ParsedBankRow[] {
    if (!Array.isArray(rows)) throw AppError.badRequest('rows يجب أن تكون مصفوفة');
    if (rows.length === 0) throw AppError.badRequest('لا توجد صفوف');
    if (rows.length > MAX_ROWS) throw AppError.badRequest(`الحد الأقصى ${MAX_ROWS} صف`);
    return rows as ParsedBankRow[];
  }
}

export const payrollBankImportService = new PayrollBankImportService();
