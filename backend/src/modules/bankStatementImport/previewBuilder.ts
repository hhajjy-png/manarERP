import { normalizeRow, buildNormalizedText } from './normalizer.js';
import { validateRows, detectFileDuplicates } from './validators.js';
import { matchAllTransactions } from './matcher.js';
import { detectBankFee } from './bankFeeDetector.js';
import type { StatementTransaction, ImportPreviewSummary, PreviewRow } from './types.js';

export async function buildPreview(
  bankName: string,
  fileName: string,
  rawRows: StatementTransaction[],
): Promise<ImportPreviewSummary> {
  // 1. Normalize
  const rows = rawRows.map(normalizeRow);

  // 2. Validate
  const validations = validateRows(rows);

  // 3. Duplicate detection (already in validations, extract set for O(1) lookup)
  const dupSet = detectFileDuplicates(rows);

  // 4. Match
  const matchResults = await matchAllTransactions(rows);

  // 5. Assemble preview rows
  const previewRows: PreviewRow[] = rows.map((tx, i) => {
    const val = validations[i];
    const matchResult = matchResults[i];
    const feeDetection = detectBankFee(tx.description, tx.reference);
    const isDuplicate = val.warnings.includes('DUPLICATE_IN_FILE') || dupSet.has(i);

    return {
      ...tx,
      rowIndex:       i,
      errors:         val.errors,
      warnings:       val.warnings,
      isDuplicate,
      isBankFee:      feeDetection.isBankFee,
      bankFeeType:    feeDetection.bankFeeType,
      matchResult,
      normalizedText: buildNormalizedText(tx),
    };
  });

  // 6. Summary statistics
  const dates = previewRows
    .map((r) => r.statementDate)
    .filter((d): d is string => d != null)
    .sort();

  const fromDate = dates[0] ?? null;
  const toDate   = dates[dates.length - 1] ?? null;

  let totalDebits  = 0;
  let totalCredits = 0;
  let invalid      = 0;
  let warnings     = 0;
  let duplicates   = 0;
  let bankFees     = 0;
  let matched      = 0;

  for (const r of previewRows) {
    totalDebits  += r.debit;
    totalCredits += r.credit;
    if (r.errors.length > 0)   invalid++;
    if (r.warnings.length > 0) warnings++;
    if (r.isDuplicate)         duplicates++;
    if (r.isBankFee)           bankFees++;
    if (r.matchResult.best && r.matchResult.best.confidence >= 75) matched++;
  }

  return {
    bankName,
    fileName,
    fromDate,
    toDate,
    totalRows:    previewRows.length,
    totalDebits:  Math.round(totalDebits  * 1000) / 1000,
    totalCredits: Math.round(totalCredits * 1000) / 1000,
    valid:        previewRows.length - invalid,
    invalid,
    warnings,
    duplicates,
    bankFees,
    matched,
    canImport:    invalid === 0,
    rows:         previewRows,
  };
}
