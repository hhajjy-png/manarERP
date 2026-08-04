import { prisma } from '@config/database.js';
import type { Prisma } from '@prisma/client';
import { AppError } from '@core/errors/AppError.js';
import { localDateRange } from '@core/utils/dateWindows.js';
import {
  txCategory,
  type TxCategory,
  type TxDirection,
} from './timelineClassification.js';
import { buildSearchPattern, SEARCHABLE_FIELDS } from './timelineSearch.js';
import { buildPreview } from './previewBuilder.js';
import { normalizeRow, buildNormalizedText } from './normalizer.js';
import { validateRows, detectFileDuplicates } from './validators.js';
import { matchAllTransactions } from './matcher.js';
import { detectBankFee } from './bankFeeDetector.js';
import { classifyRows } from './dedupDetector.js';
import { buildAccountKey, computeFingerprint } from './fingerprint.js';
import {
  getWorkspace,
  updateStatus,
  bulkUpdateStatus,
  type WorkspaceFilter,
  type StatusUpdateInput,
} from './reconciliationEngine.js';
import { generatePostingSuggestions } from './postingSuggestions.js';
import { buildReconciliationReportExcel, buildReconciliationReportHtml } from './reportBuilder.js';
import type {
  StatementTransaction,
  ImportResult,
  ImportPreviewSummary,
  ReconciliationWorkspace,
  PostingSuggestion,
  ReconciliationReport,
  ReconciliationReportRow,
  ReconcileStatus,
  TimelineResult,
  TimelineTransaction,
} from './types.js';
import type {
  PreviewRequest,
  ExecuteImportRequest,
  UpdateStatusRequest,
  BulkUpdateStatusRequest,
} from './schema.js';

// ── Preview ────────────────────────────────────────────────────────────────────

export async function preview(req: PreviewRequest): Promise<ImportPreviewSummary> {
  return buildPreview(req.bankName, req.fileName, req.rows as StatementTransaction[]);
}

// ── Execute import — Incremental v2 ───────────────────────────────────────────

export async function execute(req: ExecuteImportRequest, importedBy: string): Promise<ImportResult> {
  const startMs = Date.now();
  const rows        = req.rows as StatementTransaction[];
  const normalized  = rows.map(normalizeRow);
  const validations = validateRows(normalized);
  const dupSet      = detectFileDuplicates(normalized);

  // Re-validate: block import if any hard errors exist
  const invalid = validations.filter((v) => v.errors.length > 0);
  if (invalid.length > 0) {
    throw AppError.badRequest(`لا يمكن استيراد الكشف — يوجد ${invalid.length} صف(وف) بها أخطاء`);
  }

  // Incremental dedup: classify every row against the DB
  const dedupResults = await classifyRows(normalized, req.bankName);

  // Separate rows that need to be inserted from skipped duplicates
  const insertIndices: number[]  = [];
  const skipIndices:   number[]  = [];
  const potentialIndices: number[] = [];

  for (let i = 0; i < dedupResults.length; i++) {
    const cat = dedupResults[i]!.category;
    if (cat === 'NEW')                  insertIndices.push(i);
    else if (cat === 'POTENTIAL_DUPLICATE') { insertIndices.push(i); potentialIndices.push(i); }
    else                                skipIndices.push(i);
  }

  const matchResults = await matchAllTransactions(normalized.filter((_, i) => insertIndices.includes(i)));

  // Summary stats over ALL rows (file totals stay unchanged)
  const totalDebits  = normalized.reduce((s, r) => s + r.debit,  0);
  const totalCredits = normalized.reduce((s, r) => s + r.credit, 0);

  const dates = normalized.map((r) => r.statementDate).filter((d): d is string => d != null).sort();
  const fromDate = req.fromDate ? new Date(req.fromDate) : (dates[0]   ? new Date(dates[0])   : undefined);
  const toDate   = req.toDate   ? new Date(req.toDate)   : (dates.at(-1) ? new Date(dates.at(-1)!) : undefined);

  // Derive session-level accountKey
  const accountKey = dedupResults[0]?.accountKey ??
                     (normalized[0] ? buildAccountKey(normalized[0]) : null);

  const insertedNewCount        = insertIndices.length - potentialIndices.length;
  const skippedDuplicateCount   = skipIndices.length;
  const potentialDuplicateCount = potentialIndices.length;
  const total = normalized.length;

  const potentialSet = new Set(potentialIndices);

  const importRecord = await prisma.$transaction(async (tx) => {
    const imp = await tx.bankStatementImport.create({
      data: {
        bankName:     req.bankName,
        fileName:     req.fileName,
        importedBy,
        fromDate,
        toDate,
        totalRows:    total,
        totalDebits:  Math.round(totalDebits  * 1000) / 1000,
        totalCredits: Math.round(totalCredits * 1000) / 1000,
        status:       'ACTIVE',
        accountKey,
        insertedNewCount,
        skippedDuplicateCount,
        potentialDuplicateCount,
      },
    });

    // Build insertion data — only for NEW + POTENTIAL rows
    let matchIdx = 0;
    const txData = insertIndices.map((rowIdx) => {
      const row      = normalized[rowIdx]!;
      const val      = validations[rowIdx]!;
      const dedupRes = dedupResults[rowIdx]!;
      const matchRes = matchResults[matchIdx++];
      const feeInfo  = detectBankFee(row.description, row.reference);
      const isDup    = dupSet.has(rowIdx);
      const best     = matchRes?.best ?? null;
      const isPotential = potentialSet.has(rowIdx);

      // Potential duplicates get REVIEW status + a warning flag
      const autoStatus =
        isPotential         ? 'REVIEW' as const :
        best && best.confidence >= 90 ? 'MATCHED' as const :
        'UNMATCHED' as const;

      const warnings = [...val.warnings];
      if (isPotential) warnings.push('POTENTIAL_CROSS_IMPORT_DUPLICATE' as never);

      return {
        importId:              imp.id,
        // 1-based position among this file's data rows, in original file order
        // (rowIdx is the index into `normalized`/`rows`, which the parser already
        // built in file order with header/blank rows excluded). Source of truth
        // for display order and "current balance" — never re-derived from dates.
        statementSequence:     rowIdx + 1,
        transactionId:         row.transactionId,
        bankName:              row.bankName,
        statementDate:         row.statementDate ? new Date(row.statementDate) : null,
        postingDate:           row.postingDate   ? new Date(row.postingDate)   : null,
        description:           row.description,
        reference:             row.reference,
        debit:                 row.debit,
        credit:                row.credit,
        balance:               row.balance,
        currency:              row.currency,
        accountNumber:         row.accountNumber,
        iban:                  row.iban,
        chequeNumber:          row.chequeNumber,
        rawRow:                JSON.stringify(row.rawRow),
        normalizedText:        buildNormalizedText(row),
        reconcileStatus:       autoStatus,
        matchedType:           best?.type ?? null,
        matchedId:             best?.id   ?? null,
        matchedRef:            best?.ref  ?? null,
        matchConfidence:       best?.confidence ?? null,
        isDuplicate:           isDup,
        isBankFee:             feeInfo.isBankFee,
        bankFeeType:           feeInfo.bankFeeType,
        errors:                JSON.stringify(val.errors),
        warnings:              JSON.stringify(warnings),
        accountKey:            dedupRes.accountKey,
        transactionFingerprint: dedupRes.fingerprint,
      };
    });

    // Batch insert in chunks of 500 to avoid SQLite parameter limits
    const CHUNK = 500;
    for (let i = 0; i < txData.length; i += CHUNK) {
      await tx.bankStatementTransaction.createMany({ data: txData.slice(i, i + CHUNK) });
    }

    return imp;
  });

  const executionTimeMs = Date.now() - startMs;

  return {
    importId:                importRecord.id,
    bankName:                importRecord.bankName,
    fileName:                importRecord.fileName,
    totalRows:               total,
    totalDebits:             importRecord.totalDebits,
    totalCredits:            importRecord.totalCredits,
    importedAt:              importRecord.importedAt.toISOString(),
    accountKey,
    insertedNewCount,
    skippedDuplicateCount,
    potentialDuplicateCount,
    duplicateRate:   total > 0 ? (skippedDuplicateCount + potentialDuplicateCount) / total : 0,
    newDataRate:     total > 0 ? insertedNewCount / total : 0,
    executionTimeMs,
  };
}

// ── Workspace ──────────────────────────────────────────────────────────────────

export async function getWorkspaceByImport(
  importId: number,
  query: Record<string, string | undefined>,
): Promise<ReconciliationWorkspace> {
  const filter: WorkspaceFilter = {
    importId,
    status:      query.status as ReconcileStatus | undefined,
    isBankFee:   query.isBankFee   === 'true' ? true : query.isBankFee   === 'false' ? false : undefined,
    isDuplicate: query.isDuplicate === 'true' ? true : query.isDuplicate === 'false' ? false : undefined,
    search:      query.search,
    fromDate:    query.fromDate,
    toDate:      query.toDate,
    minAmount:   query.minAmount ? Number(query.minAmount) : undefined,
    maxAmount:   query.maxAmount ? Number(query.maxAmount) : undefined,
    page:        query.page     ? Number(query.page)     : undefined,
    pageSize:    query.pageSize ? Number(query.pageSize) : undefined,
  };
  return getWorkspace(filter);
}

// ── Status updates ─────────────────────────────────────────────────────────────

export async function updateTransactionStatus(
  importId: number,
  transactionId: number,
  body: UpdateStatusRequest,
): Promise<void> {
  // Verify the transaction belongs to this import
  const tx = await prisma.bankStatementTransaction.findFirst({
    where: { id: transactionId, importId },
  });
  if (!tx) throw AppError.notFound('المعاملة غير موجودة');

  const input: StatusUpdateInput = {
    transactionId,
    status:          body.status as ReconcileStatus,
    matchedType:     body.matchedType,
    matchedId:       body.matchedId,
    matchedRef:      body.matchedRef,
    matchConfidence: body.matchConfidence,
  };
  await updateStatus(input);
}

export async function bulkUpdateTransactionStatus(
  importId: number,
  body: BulkUpdateStatusRequest,
): Promise<{ updated: number }> {
  const count = await bulkUpdateStatus(importId, body.ids, body.status as ReconcileStatus);
  return { updated: count };
}

// ── Posting suggestions ────────────────────────────────────────────────────────

export async function getPostingSuggestions(
  importId: number,
  transactionId: number,
): Promise<PostingSuggestion[]> {
  const tx = await prisma.bankStatementTransaction.findFirst({
    where: { id: transactionId, importId },
  });
  if (!tx) throw AppError.notFound('المعاملة غير موجودة');

  const parsed = {
    id:              tx.id,
    importId:        tx.importId,
    transactionId:   tx.transactionId,
    bankName:        tx.bankName,
    statementDate:   tx.statementDate?.toISOString().substring(0, 10) ?? null,
    postingDate:     tx.postingDate?.toISOString().substring(0, 10) ?? null,
    description:     tx.description,
    reference:       tx.reference,
    debit:           Number(tx.debit),
    credit:          Number(tx.credit),
    balance:         tx.balance != null ? Number(tx.balance) : null,
    currency:        tx.currency,
    chequeNumber:    tx.chequeNumber,
    reconcileStatus: tx.reconcileStatus as ReconcileStatus,
    matchedType:     tx.matchedType as never,
    matchedId:       tx.matchedId,
    matchedRef:      tx.matchedRef,
    matchConfidence: tx.matchConfidence as never,
    isDuplicate:     Boolean(tx.isDuplicate),
    isBankFee:       Boolean(tx.isBankFee),
    bankFeeType:     tx.bankFeeType as never,
    errors:          JSON.parse(tx.errors || '[]') as never,
    warnings:        JSON.parse(tx.warnings || '[]') as never,
  };

  return generatePostingSuggestions(parsed);
}

// ── Report export ──────────────────────────────────────────────────────────────

async function buildReport(importId: number): Promise<ReconciliationReport> {
  const [imp, txs] = await Promise.all([
    prisma.bankStatementImport.findUniqueOrThrow({ where: { id: importId } }),
    prisma.bankStatementTransaction.findMany({
      where: { importId },
      orderBy: { statementDate: 'asc' },
    }),
  ]);

  function mapRow(tx: typeof txs[0]): ReconciliationReportRow {
    return {
      id:              tx.id,
      bankName:        tx.bankName,
      statementDate:   tx.statementDate?.toISOString().substring(0, 10) ?? null,
      description:     tx.description,
      reference:       tx.reference,
      debit:           Number(tx.debit),
      credit:          Number(tx.credit),
      reconcileStatus: tx.reconcileStatus as ReconcileStatus,
      matchedType:     tx.matchedType as never,
      matchedRef:      tx.matchedRef,
      matchConfidence: tx.matchConfidence as never,
      isBankFee:       Boolean(tx.isBankFee),
      bankFeeType:     tx.bankFeeType as never,
    };
  }

  return {
    importId:     imp.id,
    bankName:     imp.bankName,
    fileName:     imp.fileName,
    importedAt:   imp.importedAt.toISOString(),
    generatedAt:  new Date().toISOString(),
    totalRows:    imp.totalRows,
    totalDebits:  imp.totalDebits,
    totalCredits: imp.totalCredits,
    matched:      txs.filter((t) => t.reconcileStatus === 'MATCHED').map(mapRow),
    unmatched:    txs.filter((t) => t.reconcileStatus === 'UNMATCHED' || t.reconcileStatus === 'REVIEW').map(mapRow),
    bankFees:     txs.filter((t) => t.isBankFee).map(mapRow),
  };
}

export async function exportReport(
  importId: number,
  format: 'excel' | 'pdf',
): Promise<{ buffer?: Buffer; html?: string; filename: string; contentType: string }> {
  const report = await buildReport(importId);

  if (format === 'excel') {
    const buffer = await buildReconciliationReportExcel(report);
    return {
      buffer,
      filename:    `bank-reconciliation-${importId}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  }

  const html = buildReconciliationReportHtml(report);
  return {
    html,
    filename:    `bank-reconciliation-${importId}.html`,
    contentType: 'text/html; charset=utf-8',
  };
}

// ── Unified Timeline ───────────────────────────────────────────────────────────

export type TimelineFilterType =
  'all' | 'deposits' | 'withdrawals' | 'fees' | 'cheques' | 'transfers';

/**
 * توافُق خلفي: فلتر «النوع» القديم كان يخلط الاتجاه بالتصنيف في قائمة واحدة.
 * يُترجَم الآن إلى البُعدين المستقلين بلا تغيير في سلوك المستدعي القديم.
 */
export function mapLegacyType(
  type?: TimelineFilterType,
): { direction?: TxDirection; categories?: TxCategory[] } {
  switch (type) {
    case 'deposits':    return { direction: 'deposit' };
    case 'withdrawals': return { direction: 'withdrawal' };
    case 'fees':        return { categories: ['bank_fee'] };
    case 'cheques':     return { categories: ['cheque'] };
    case 'transfers':   return { categories: ['transfer'] };
    default:            return {};
  }
}

export interface TimelineFilterOptions {
  fromDate?:   string;
  toDate?:     string;
  search?:     string;
  /** فلتر النوع القديم — يُترجَم عبر `mapLegacyType`. */
  type?:       TimelineFilterType;
  /** الاتجاه المالي الحقيقي (دائن − مدين) — بُعد مستقل عن التصنيف. */
  direction?:  TxDirection;
  /** تصنيف المستند — بُعد مستقل، متعدد الاختيار. يُطبَّق خارج SQL. */
  categories?: TxCategory[];
  minAmount?:  number;
  maxAmount?:  number;
  /** استبعاد الحركات المعلَّمة كتكرار محتمل من النتائج والإجماليات. */
  excludeDuplicates?: boolean;
}

/**
 * باني شرط Prisma للتسلسل الزمني — كل الأبعاد القابلة للتعبير في SQL.
 *
 * التصنيف **غير** مبني هنا عمدًا: قاعدته سلسلة أولويات من ست مراحل تشمل مطابقة
 * نصية مرتَّبة، وأي محاولة لتقريبها بـ`contains` تُنتج انحرافًا عن العرض. لذلك
 * يُطبَّق التصنيف في `getTimeline` عبر نفس منفذ القاعدة (`timelineClassification`)
 * المربوط بالواجهة عبر ملف حالات ذهبية مشترك.
 */
export function buildTimelineWhere(
  accountKey: string,
  opts: TimelineFilterOptions = {},
): Prisma.BankStatementTransactionWhereInput {
  const where: Prisma.BankStatementTransactionWhereInput = { accountKey };
  const and: Prisma.BankStatementTransactionWhereInput[] = [];

  const dateRange = localDateRange(opts.fromDate, opts.toDate);
  if (dateRange) where.statementDate = dateRange;

  // ── الاتجاه: مقارنة عمود بعمود، مطابِقة تمامًا لقاعدة العرض (دائن − مدين) ──
  // مراجع الحقول في Prisma تعبّر عن المقارنة بدقة، فلا يبقى أي صف بجانبين
  // يظهر في «إيداعات» و«سحوبات» معًا كما كان مع `credit > 0` / `debit > 0`.
  // مرجع الحقل يُقرأ فقط عند وجود فلتر اتجاه — فلا يلمس البانّي عميل Prisma بلا داعٍ.
  const direction = opts.direction ?? mapLegacyType(opts.type).direction;
  if (direction) {
    const fields = prisma.bankStatementTransaction.fields;
    if (direction === 'deposit') {
      and.push({ credit: { gt: fields.debit } });
    } else if (direction === 'withdrawal') {
      and.push({ debit: { gt: fields.credit } });
    } else {
      and.push({ NOT: [{ credit: { gt: fields.debit } }, { debit: { gt: fields.credit } }] });
    }
  }

  // ── المبلغ: يُقارَن بالجانب غير الصفري، مع تماثل حول الصفر ──
  // الحدّ الأعلى كان يشترط `> 0` فيُخفي حركات الصفر التي يُظهرها الحدّ الأدنى
  // وحده — توسيع المدى كان يُقلّص النتيجة. الآن الطرفان يعاملان الصفر بنفس المنطق.
  const { minAmount, maxAmount } = opts;
  if (minAmount != null || maxAmount != null) {
    const side = (field: 'debit' | 'credit'): Prisma.BankStatementTransactionWhereInput => {
      const range: Prisma.FloatFilter = { gt: 0 };
      if (minAmount != null) range.gte = minAmount;
      if (maxAmount != null) range.lte = maxAmount;
      return { [field]: range } as Prisma.BankStatementTransactionWhereInput;
    };
    const branches: Prisma.BankStatementTransactionWhereInput[] = [side('debit'), side('credit')];
    // حركة بصافي صفر تقع داخل المدى متى كان المدى يشمل الصفر.
    if ((minAmount ?? 0) <= 0) branches.push({ AND: [{ debit: 0 }, { credit: 0 }] });
    and.push({ OR: branches });
  }

  // ── البحث: كل معرّف يراه المستخدم + حياد رسم الحروف العربية ──
  const pattern = buildSearchPattern(opts.search);
  if (pattern) {
    and.push({
      OR: SEARCHABLE_FIELDS.map((field) => ({ [field]: { contains: pattern } })) as
        Prisma.BankStatementTransactionWhereInput[],
    });
  }

  if (opts.excludeDuplicates) and.push({ isDuplicate: false });

  if (and.length) where.AND = and;
  return where;
}

// Default ordering for the Bank Account / Transaction Explorer list.
//
// Source of truth: the bank's original statement file order, not statementDate.
// Business rule — official statement files are ordered newest → oldest, and a
// row's `statementSequence` (1 = first data row = newest, set at import time)
// is that file's row order verbatim. So: most recently imported batch first
// (importId is monotonic with import time), then ascending statementSequence
// within that batch reproduces the original file's row order exactly. `id`
// is a final tiebreaker only for legacy rows imported before statementSequence
// existed (backfilled, but kept here defensively). Exported so the rule is
// unit-testable without a database.
export const TIMELINE_ORDER_BY: Prisma.BankStatementTransactionOrderByWithRelationInput[] = [
  { importId:          'desc' },
  { statementSequence: 'asc' },
  { id:                'asc' },
];

/** الشكل الخام لصف قادم من Prisma مع دفعة الاستيراد المضمَّنة. */
type TimelineRow = Prisma.BankStatementTransactionGetPayload<{
  include: { import: { select: { id: true; fileName: true; importedAt: true; bankName: true } } };
}>;

/** سقف أمان لمسار التصنيف (يقرأ المجموعة المفلترة كاملة قبل الترقيم). */
export const CATEGORY_SCAN_CAP = 50_000;

function toTimelineTransaction(t: TimelineRow): TimelineTransaction {
  return {
    id:               t.id,
    importId:         t.importId,
    importBatchLabel: `Import #${t.importId}`,
    fileName:         t.import.fileName,
    importedAt:       t.import.importedAt.toISOString(),
    bankName:         t.bankName,
    accountKey:       t.accountKey,
    statementDate:    t.statementDate ? t.statementDate.toISOString().substring(0, 10) : null,
    postingDate:      t.postingDate   ? t.postingDate.toISOString().substring(0, 10)   : null,
    description:      t.description,
    reference:        t.reference,
    debit:            Number(t.debit),
    credit:           Number(t.credit),
    balance:          t.balance != null ? Number(t.balance) : null,
    currency:         t.currency,
    chequeNumber:     t.chequeNumber,
    reconcileStatus:  t.reconcileStatus as ReconcileStatus,
    matchedType:      t.matchedType as never,
    matchedRef:       t.matchedRef,
    isDuplicate:      Boolean(t.isDuplicate),
    isBankFee:        Boolean(t.isBankFee),
    bankFeeType:      (t.bankFeeType ?? null) as TimelineTransaction['bankFeeType'],
    transactionFingerprint: t.transactionFingerprint ?? null,
  };
}

/** مجاميع المجموعة المفلترة — محسوبة من نفس الصفوف المعروضة، لا من مصدر ثانٍ. */
export interface TimelineTotals {
  totalDebits:  number;
  totalCredits: number;
  netMovement:  number;
  turnover:     number;
  currencies:   string[];
  duplicateCount:   number;
  filteredFromDate: string | null;
  filteredToDate:   string | null;
}

/** يجمع مجاميع مجموعة حركات في مرور واحد (بلا مسح مكرّر). */
export function summariseTransactions(rows: TimelineTransaction[]): TimelineTotals {
  let totalDebits = 0;
  let totalCredits = 0;
  let duplicateCount = 0;
  let min: string | null = null;
  let max: string | null = null;
  const currencies = new Set<string>();

  for (const r of rows) {
    totalDebits  += r.debit;
    totalCredits += r.credit;
    if (r.isDuplicate) duplicateCount += 1;
    if (r.currency) currencies.add(r.currency);
    if (r.statementDate) {
      if (min === null || r.statementDate < min) min = r.statementDate;
      if (max === null || r.statementDate > max) max = r.statementDate;
    }
  }

  const round = (n: number): number => Math.round(n * 1000) / 1000;
  return {
    totalDebits:  round(totalDebits),
    totalCredits: round(totalCredits),
    netMovement:  round(totalCredits - totalDebits),
    turnover:     round(totalDebits + totalCredits),
    currencies:   [...currencies].sort(),
    duplicateCount,
    filteredFromDate: min,
    filteredToDate:   max,
  };
}

const TIMELINE_INCLUDE = {
  import: { select: { id: true, fileName: true, importedAt: true, bankName: true } },
} as const;

/**
 * يُرجع كل الحركات المطابقة (بلا ترقيم) بعد تطبيق كل الأبعاد — يُستخدم للتصدير
 * ولمسار التصنيف. مقيَّد بسقف `CATEGORY_SCAN_CAP` مع إفصاح عبر `truncated`.
 */
export async function getTimelineRows(
  accountKey: string,
  opts: TimelineFilterOptions = {},
): Promise<{ rows: TimelineTransaction[]; truncated: boolean }> {
  const where = buildTimelineWhere(accountKey, opts);
  const raw = await prisma.bankStatementTransaction.findMany({
    where,
    orderBy: TIMELINE_ORDER_BY,
    take:    CATEGORY_SCAN_CAP + 1,
    include: TIMELINE_INCLUDE,
  });
  const truncated = raw.length > CATEGORY_SCAN_CAP;
  const mapped = (truncated ? raw.slice(0, CATEGORY_SCAN_CAP) : raw).map(toTimelineTransaction);
  const categories = opts.categories?.length
    ? new Set<TxCategory>(opts.categories)
    : null;
  const rows = categories ? mapped.filter((r) => categories.has(txCategory(r))) : mapped;
  return { rows, truncated };
}

/** تغطية الحساب الكاملة — مستقلة عن أي فلتر (تُستخدم في الشاشة والتصدير). */
export async function getAccountCoverage(
  accountKey: string,
): Promise<{ fromDate: string | null; toDate: string | null }> {
  const agg = await prisma.bankStatementTransaction.aggregate({
    where: { accountKey },
    _min:  { statementDate: true },
    _max:  { statementDate: true },
  });
  return {
    fromDate: agg._min.statementDate ? agg._min.statementDate.toISOString().substring(0, 10) : null,
    toDate:   agg._max.statementDate ? agg._max.statementDate.toISOString().substring(0, 10) : null,
  };
}

export async function getTimeline(
  accountKey: string,
  page       = 1,
  pageSize   = 50,
  opts: TimelineFilterOptions = {},
): Promise<TimelineResult> {
  const skip = (page - 1) * pageSize;
  const where = buildTimelineWhere(accountKey, opts);

  // تغطية الحساب كاملًا + عدد الدفعات: ثابتان لا يتأثران بالفلاتر.
  const [coverage, importCount] = await Promise.all([
    prisma.bankStatementTransaction.aggregate({
      where: { accountKey },
      _min:  { statementDate: true },
      _max:  { statementDate: true },
    }),
    prisma.bankStatementImport.count({ where: { accountKey } }),
  ]);

  const base = {
    accountKey,
    fromDate: coverage._min.statementDate ? coverage._min.statementDate.toISOString().substring(0, 10) : null,
    toDate:   coverage._max.statementDate ? coverage._max.statementDate.toISOString().substring(0, 10) : null,
    importCount,
    page,
    pageSize,
  };

  // ── المسار السريع: بلا فلتر تصنيف ⇒ العدّ والترقيم والمجاميع من SQL ──
  if (!opts.categories?.length) {
    const [total, txs, agg, currencyGroups, duplicateCount] = await Promise.all([
      prisma.bankStatementTransaction.count({ where }),
      prisma.bankStatementTransaction.findMany({
        where, orderBy: TIMELINE_ORDER_BY, skip, take: pageSize, include: TIMELINE_INCLUDE,
      }),
      prisma.bankStatementTransaction.aggregate({
        where,
        _sum: { debit: true, credit: true },
        _min: { statementDate: true },
        _max: { statementDate: true },
      }),
      prisma.bankStatementTransaction.groupBy({ by: ['currency'], where }),
      prisma.bankStatementTransaction.count({ where: { AND: [where, { isDuplicate: true }] } }),
    ]);

    const totalDebits  = Math.round(Number(agg._sum.debit  ?? 0) * 1000) / 1000;
    const totalCredits = Math.round(Number(agg._sum.credit ?? 0) * 1000) / 1000;

    return {
      ...base,
      totalCount:   total,
      totalDebits,
      totalCredits,
      netMovement:  Math.round((totalCredits - totalDebits) * 1000) / 1000,
      turnover:     Math.round((totalDebits + totalCredits) * 1000) / 1000,
      filteredFromDate: agg._min.statementDate ? agg._min.statementDate.toISOString().substring(0, 10) : null,
      filteredToDate:   agg._max.statementDate ? agg._max.statementDate.toISOString().substring(0, 10) : null,
      currencies:     currencyGroups.map((g) => g.currency).filter(Boolean).sort(),
      duplicateCount,
      transactions:   txs.map(toTimelineTransaction),
    };
  }

  // ── مسار التصنيف: يُطبَّق بنفس منفذ قاعدة العرض، ثم يُرقَّم ويُجمَّع منه ──
  // العدّ والمجاميع والصفحة كلها مشتقّة من **نفس** المجموعة، فلا يمكن أن يختلف
  // العدّاد عمّا يظهر في الجدول ولا عمّا يُصدَّر.
  const { rows } = await getTimelineRows(accountKey, opts);
  const totals = summariseTransactions(rows);

  return {
    ...base,
    totalCount:   rows.length,
    totalDebits:  totals.totalDebits,
    totalCredits: totals.totalCredits,
    netMovement:  totals.netMovement,
    turnover:     totals.turnover,
    filteredFromDate: totals.filteredFromDate,
    filteredToDate:   totals.filteredToDate,
    currencies:       totals.currencies,
    duplicateCount:   totals.duplicateCount,
    transactions:     rows.slice(skip, skip + pageSize),
  };
}

// ── List imports ───────────────────────────────────────────────────────────────

export async function listImports(page = 1, pageSize = 20) {
  const skip = (page - 1) * pageSize;
  const [total, items] = await Promise.all([
    prisma.bankStatementImport.count({ where: { status: 'ACTIVE' } }),
    prisma.bankStatementImport.findMany({
      where:   { status: 'ACTIVE' },
      orderBy: { importedAt: 'desc' },
      skip,
      take:    pageSize,
      select: {
        id: true, bankName: true, fileName: true, importedBy: true,
        importedAt: true, fromDate: true, toDate: true,
        totalRows: true, totalDebits: true, totalCredits: true,
        accountKey: true,
        _count: { select: { transactions: true } },
      },
    }),
  ]);

  return { total, page, pageSize, items };
}

// ── Delete imports ─────────────────────────────────────────────────────────────

export async function deleteImport(importId: number): Promise<void> {
  const imp = await prisma.bankStatementImport.findUnique({ where: { id: importId } });
  if (!imp) throw AppError.notFound('الكشف البنكي غير موجود');
  await prisma.bankStatementImport.delete({ where: { id: importId } });
}

export async function bulkDeleteImports(ids: number[]): Promise<{ deleted: number }> {
  const result = await prisma.bankStatementImport.deleteMany({
    where: { id: { in: ids } },
  });
  return { deleted: result.count };
}

export { updateStatus, bulkUpdateStatus };
