import type { ParsedBankRow, PreviewRow, PreviewSummary, MatchResult, RowValidation } from './types';

interface BuildPreviewArgs {
  templateName: string;
  rows: ParsedBankRow[];
  matches: MatchResult[];
  validations: RowValidation[];
  existingTxIds: Set<string>;
}

export function buildPreview(args: BuildPreviewArgs): PreviewSummary {
  const { templateName, rows, matches, validations } = args;

  const previewRows: PreviewRow[] = rows.map((row, i) => {
    const match = matches[i];
    const val   = validations[i];

    // A duplicate is any row whose transactionId appears in errors about duplication
    const isDuplicate =
      val.errors.some((e) => e.includes('مستورد مسبقاً') || e.includes('مكرر'));

    // Inactive employee → extra error
    if (match.isMatched && match.employeeStatus === 'TERMINATED') {
      val.errors.push('الموظف محدد لكنه خارج الخدمة (TERMINATED)');
    }

    const isValid = val.errors.length === 0 && match.isMatched;

    let status: PreviewRow['status'];
    if (!isValid) {
      status = 'error';
    } else if (val.warnings.length > 0) {
      status = 'warning';
    } else {
      status = 'valid';
    }

    return {
      _rowIndex: row._rowIndex,
      _sheetName: row._sheetName,
      payrollMonth: row.payrollMonth,
      payrollYear: row.payrollYear,
      employeeCode: row.employeeCode,
      civilId: row.civilId,
      iban: row.iban,
      bankAccount: row.bankAccount,
      beneficiaryName: row.beneficiaryName,
      amount: row.amount,
      currency: row.currency,
      transactionId: row.transactionId,
      paymentDate: row.paymentDate,
      matchedEmployeeId:   match.employeeId,
      matchedEmployeeName: match.employeeName,
      matchedEmployeeCode: match.employeeCode,
      matchConfidence:     match.confidence,
      isMatched:           match.isMatched,
      errors:   val.errors,
      warnings: val.warnings,
      isValid,
      isDuplicate,
      status,
    };
  });

  const matched      = previewRows.filter((r) => r.isMatched).length;
  const unmatched    = previewRows.filter((r) => !r.isMatched).length;
  const invalid      = previewRows.filter((r) => r.status === 'error').length;
  const withWarnings = previewRows.filter((r) => r.status === 'warning').length;
  const valid        = previewRows.filter((r) => r.status === 'valid').length;
  const duplicates   = previewRows.filter((r) => r.isDuplicate).length;
  const totalAmount  = previewRows
    .filter((r) => r.status !== 'error')
    .reduce((s, r) => s + r.amount, 0);

  const canExecute = invalid === 0 && unmatched === 0;

  return {
    templateName,
    totalRows: previewRows.length,
    matched,
    unmatched,
    valid,
    withWarnings,
    invalid,
    duplicates,
    totalAmount,
    canExecute,
    rows: previewRows,
  };
}
