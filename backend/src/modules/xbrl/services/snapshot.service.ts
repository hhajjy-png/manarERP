/**
 * لقطة الإصدار المالي (Reporting Snapshot).
 *
 * ═══ اللقطة غير قابلة للتعديل ═══
 * هذه الخدمة تعرض `create` و `list` و `getById` **فقط**. لا `update`، ولا `delete`،
 * ولا مسار API خلفهما. السبب ليس تشدّدًا: اللقطة هي الجواب على سؤال «ما البيانات
 * التي بُني عليها الإصدار؟»، وجواب قابل للتحرير لا يجيب شيئًا.
 *
 * ═══ ما لا تفعله اللقطة ═══
 * • لا تُعدِّل حسابًا ولا قيدًا ولا رصيدًا.
 * • لا تقفل السنة المالية ولا الفترة المحاسبية (لا تمسّ `periodLock.service` أصلًا).
 * • لا تمنع أي عملية لاحقة: يمكن ترحيل قيد في نفس الفترة بعد إنشائها بلحظة، وتبقى
 *   اللقطة كما هي — وهذا هو المقصود، فهي صورة لحظة لا قفل.
 */
import { createHash } from 'crypto';
import { Request } from 'express';
import { prisma } from '../../../config/database';
import { AppError } from '../../../core/errors/AppError';
import { recordAudit } from '../../../core/middleware/audit';
import { SNAPSHOT_NUMBER_PREFIX, SNAPSHOT_SEQUENCE_WIDTH } from '../xbrl.constants';
import type { ReadinessDataset, ReadinessReport } from '../xbrl.types';
import { readinessService, type ReadinessQuery } from './readiness.service';

const AUDIT_MODULE = 'xbrl';

const LIST_SELECT = {
  id: true,
  snapshotNumber: true,
  taxonomyId: true,
  taxonomyCode: true,
  taxonomyVersion: true,
  taxonomyIsOfficial: true,
  contextId: true,
  fiscalYear: true,
  periodStart: true,
  periodEnd: true,
  sourceHash: true,
  createdById: true,
  createdByName: true,
  createdAt: true,
} as const;

/**
 * بصمة البيانات المصدرية.
 *
 * تُحتسب على ما يُحدِّد الأرقام وحدها — الأرصدة والربط والسياق — دون `generatedAt`
 * ولا أي طابع زمني. لقطتان لنفس البيانات تعطيان البصمة نفسها؛ اختلافها دليل قاطع
 * على أن البيانات المحاسبية تحرّكت بينهما.
 */
export function computeSourceHash(dataset: ReadinessDataset): string {
  const material = JSON.stringify({
    accounts: dataset.accounts.map((a) => [a.accountId, a.code, a.type, a.balance, a.totalDebit, a.totalCredit]),
    trialBalance: dataset.trialBalance,
    equation: {
      assets: dataset.equation.assets,
      liabilities: dataset.equation.liabilities,
      totalEquityWithResult: dataset.equation.totalEquityWithResult,
    },
    mappings: dataset.accountMappings.map((m) => [m.id, m.accountId, m.conceptId, m.status, m.isEnabled]),
    statementMappings: dataset.statementMappings.map((s) => [s.id, s.lineCode, s.conceptId, s.isEnabled]),
    taxonomy: dataset.taxonomy ? [dataset.taxonomy.code, dataset.taxonomy.version, dataset.taxonomy.isOfficial] : null,
    context: dataset.context,
    company: dataset.company,
  });
  return createHash('sha256').update(material, 'utf8').digest('hex');
}

async function nextSnapshotNumber(year: number): Promise<string> {
  const prefix = `${SNAPSHOT_NUMBER_PREFIX}-${year}-`;
  const last = await prisma.xbrlSnapshot.findFirst({
    where: { snapshotNumber: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { snapshotNumber: true },
  });
  const lastSeq = last ? parseInt(last.snapshotNumber.slice(prefix.length), 10) : 0;
  const nextSeq = Number.isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(SNAPSHOT_SEQUENCE_WIDTH, '0')}`;
}

export class SnapshotService {
  async list(filters: { fiscalYear?: number } = {}) {
    return prisma.xbrlSnapshot.findMany({
      where: { ...(filters.fiscalYear && { fiscalYear: filters.fiscalYear }) },
      select: LIST_SELECT,
      orderBy: { id: 'desc' },
    });
  }

  /** اللقطة كاملة — الحقول النصية تُفكَّك إلى كائنات كما كانت لحظة الإنشاء. */
  async getById(id: number) {
    const row = await prisma.xbrlSnapshot.findUnique({ where: { id } });
    if (!row) throw AppError.notFound('اللقطة غير موجودة');

    const parse = <T>(raw: string): T | null => {
      try {
        return JSON.parse(raw) as T;
      } catch {
        // لقطة قديمة أو تالفة تُعرض بحقولها الوصفية بدل أن تُسقط الطلب كله.
        return null;
      }
    };

    return {
      id: row.id,
      snapshotNumber: row.snapshotNumber,
      taxonomyId: row.taxonomyId,
      taxonomyCode: row.taxonomyCode,
      taxonomyVersion: row.taxonomyVersion,
      taxonomyIsOfficial: row.taxonomyIsOfficial,
      contextId: row.contextId,
      fiscalYear: row.fiscalYear,
      periodStart: row.periodStart,
      periodEnd: row.periodEnd,
      sourceHash: row.sourceHash,
      createdById: row.createdById,
      createdByName: row.createdByName,
      createdAt: row.createdAt,
      company: parse(row.companyJson),
      context: parse(row.contextJson),
      trialBalance: parse(row.trialBalanceJson),
      accountMappings: parse(row.accountMappingsJson),
      statementMappings: parse(row.statementMappingsJson),
      validation: parse(row.validationJson),
      readiness: parse(row.readinessJson),
    };
  }

  /**
   * ينشئ لقطة من الحالة الحالية.
   *
   * تُخزَّن هوية التصنيف **نصًّا** (رمزه ونسخته وهل هو رسمي) إلى جانب معرّفه: حذف
   * التصنيف لاحقًا يُفرغ المعرّف لكنه لا يُفقد اللقطة معناها — وهو الشرط الذي يجعلها
   * صالحة كسجل تدقيق بعد سنوات.
   */
  async create(req: Request, query: ReadinessQuery = {}) {
    const dataset = await readinessService.buildDataset(query);
    const report: ReadinessReport = readinessService.buildReportFromDataset(dataset);

    if (!dataset.context) {
      throw AppError.badRequest('لا يمكن إنشاء لقطة بلا سياق تقرير: حدّد الفترة المالية والعملة والكيان أولًا.');
    }

    const periodStart = new Date(dataset.context.periodStart);
    const periodEnd = new Date(dataset.context.periodEnd);
    const snapshotNumber = await nextSnapshotNumber(dataset.context.fiscalYear);

    const created = await prisma.xbrlSnapshot.create({
      data: {
        snapshotNumber,
        taxonomyId: dataset.taxonomy?.id ?? null,
        taxonomyCode: dataset.taxonomy?.code ?? null,
        taxonomyVersion: dataset.taxonomy?.version ?? null,
        taxonomyIsOfficial: dataset.taxonomy?.isOfficial ?? false,
        contextId: dataset.context.id,
        fiscalYear: dataset.context.fiscalYear,
        periodStart,
        periodEnd,
        companyJson: JSON.stringify(dataset.company),
        contextJson: JSON.stringify(dataset.context),
        trialBalanceJson: JSON.stringify({
          totals: dataset.trialBalance,
          equation: dataset.equation,
          accounts: dataset.accounts,
        }),
        accountMappingsJson: JSON.stringify(dataset.accountMappings),
        statementMappingsJson: JSON.stringify(dataset.statementMappings),
        validationJson: JSON.stringify(report.validation),
        readinessJson: JSON.stringify(report.score),
        sourceHash: computeSourceHash(dataset),
        createdById: req.user?.userId ?? null,
        createdByName: req.user?.username ?? null,
      },
      select: LIST_SELECT,
    });

    await recordAudit({
      req,
      action: 'SNAPSHOT',
      module: AUDIT_MODULE,
      entityId: `snapshot:${created.id}`,
      newValue: {
        snapshotNumber: created.snapshotNumber,
        fiscalYear: created.fiscalYear,
        taxonomyCode: created.taxonomyCode,
        taxonomyIsOfficial: created.taxonomyIsOfficial,
        sourceHash: created.sourceHash,
        errorCount: report.validation.errorCount,
        warningCount: report.validation.warningCount,
      },
    });

    return created;
  }
}

export const snapshotService = new SnapshotService();
