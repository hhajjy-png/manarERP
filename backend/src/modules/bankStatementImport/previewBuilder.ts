import { normalizeRow, buildNormalizedText } from './normalizer.js';
import { validateRows, detectFileDuplicates } from './validators.js';
import { matchAllTransactions } from './matcher.js';
import { detectBankFee } from './bankFeeDetector.js';
import { buildDedupSummary, buildCoverageSummary } from './dedupDetector.js';
import { buildAccountKey } from './fingerprint.js';
import { roundMoney } from '@shared/utils/money.js';
import type { StatementTransaction, ImportPreviewSummary, PreviewRow } from './types.js';

export async function buildPreview(
  bankName: string,
  fileName: string,
  rawRows:  StatementTransaction[],
): Promise<ImportPreviewSummary> {
  // 1. Normalize
  const rows = rawRows.map(normalizeRow);

  // 2. Validate
  const validations = validateRows(rows);

  // 3. Duplicate detection (already in validations, extract set for O(1) lookup)
  const dupSet = detectFileDuplicates(rows);

  // 4. Match
  //
  // هوية الحساب تُشتق قبل المطابقة لا بعدها (Multi-Bank Cheques Foundation v1):
  // رقم الشيك لم يعد فريدًا عالميًا، فالمطابق يحتاج معرفة حساب الكشف ليحصر
  // مرشّحي الشيكات فيه. مفاتيح `BANK:` مستبعدة لأنها لا تعرّف حسابًا بعينه —
  // نفس القاعدة التي يستخدمها حساب `accountKey` أدناه، مُستخرجة إلى ثابت واحد
  // لئلا يتباعد التعريفان.
  const accountKey = rows.map(buildAccountKey).find((k) => !k.startsWith('BANK:')) ??
                     (rows[0] ? buildAccountKey(rows[0]) : null);
  const matchResults = await matchAllTransactions(rows, accountKey);

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

  // Incremental import v2: dedup + coverage summary — يعيد استخدام `accountKey`
  // المشتق أعلاه قبل المطابقة (نفس القيمة حرفيًا، بلا حساب مكرر).
  const [dedupSummary, coverageSummary] = accountKey
    ? await Promise.all([
        buildDedupSummary(rows, bankName),
        buildCoverageSummary(accountKey, fromDate, toDate),
      ])
    : [null, null];

  return {
    bankName,
    fileName,
    fromDate,
    toDate,
    totalRows:    previewRows.length,
    // وحدة النقود المعتمدة بدل تقريب محلي بلا تصحيح EPSILON.
    totalDebits:  roundMoney(totalDebits),
    totalCredits: roundMoney(totalCredits),
    valid:        previewRows.length - invalid,
    invalid,
    warnings,
    duplicates,
    bankFees,
    matched,
    canImport:    invalid === 0,
    rows:         previewRows,
    dedupSummary,
    coverageSummary,
  };
}
