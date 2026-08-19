/**
 * تجميع بيانات الجاهزية وتشغيل التحقق.
 *
 * ═══ لا منطق محاسبي جديد هنا ═══
 * الأرصدة تأتي من **ميزان المراجعة القائم** (`financialService.getTrialBalance`) لا من
 * استعلام مكتوب خصيصًا لهذه الحزمة. لو اختلف رقم في شاشة الجاهزية عن رقم في المركز
 * المالي لكان لدينا مصدرا حقيقة للرقم نفسه — وهذا بالضبط ما تتجنّبه الحزمة.
 *
 * كل ما تفعله هذه الخدمة تجاه المحاسبة **قراءة**: لا `create` ولا `update` ولا
 * `delete` على أي جدول محاسبي، ولا استدعاء لأي خدمة ترحيل.
 */
import { prisma } from '../../../config/database';
import { roundMoney } from '../../../shared/utils/money';
import { financialService } from '../../financial/financial.service';
import type { TrialBalanceAsOfRow } from '../../../shared/services/financial/financial.types';
import { computeBalanceSheetEquation, validateReadiness } from '../domain/validation.engine';
import { buildAccountRows, computeReadinessScore } from '../domain/readiness.score';
import type {
  AccountBalanceSnapshot,
  CompanyInfoSnapshot,
  ReadinessDataset,
  ReadinessReport,
} from '../xbrl.types';
import { reportingContextService } from './context.service';
import { taxonomyService } from './taxonomy.service';

export interface ReadinessQuery {
  /** التصنيف المستخدَم؛ الافتراضي هو المفعَّل حاليًا. */
  taxonomyId?: number;
  contextId?: number;
  fiscalYear?: number;
  /** تاريخ قياس الأرصدة؛ الافتراضي نهاية فترة السياق، أو اليوم عند غيابه. */
  asOfDate?: string;
}

async function loadCompanyInfo(): Promise<CompanyInfoSnapshot> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: ['company.name', 'company.nameEn', 'company.country', 'company.phone', 'company.address'] } },
    select: { key: true, value: true },
  });
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const read = (key: string) => {
    const value = byKey.get(key);
    return value && value.trim() !== '' ? value : null;
  };
  return {
    name: read('company.name'),
    nameEn: read('company.nameEn'),
    country: read('company.country'),
    phone: read('company.phone'),
    address: read('company.address'),
  };
}

/**
 * يبني صورة الحسابات: كل الحسابات من الدليل، وأرصدتها من ميزان المراجعة.
 *
 * الحسابات غير الفعّالة تدخل القائمة برصيد صفر — لا لأن رصيدها صفر بالضرورة، بل لأن
 * ميزان المراجعة في هذا النظام يقتصر على الفعّالة، ونحن نلتزم بحدوده بدل أن نخترع
 * ميزانًا موازيًا. وجودها في القائمة يخدم كشف الربط اليتيم (MAP-005) وحده.
 */
async function loadAccountBalances(asOfDate: string): Promise<{
  accounts: AccountBalanceSnapshot[];
  trialBalance: { totalDebit: number; totalCredit: number; difference: number; isBalanced: boolean };
}> {
  const [accounts, trialBalance] = await Promise.all([
    prisma.account.findMany({
      select: { id: true, code: true, name: true, nameEn: true, type: true, normalBalance: true, isActive: true },
      orderBy: { code: 'asc' },
    }),
    financialService.getTrialBalance({ mode: 'as-of', asOfDate, showZeroBalances: true }),
  ]);

  const rows = trialBalance.rows as TrialBalanceAsOfRow[];
  const byAccountId = new Map(rows.map((r) => [r.accountId, r]));

  const snapshots: AccountBalanceSnapshot[] = accounts.map((a) => {
    const row = byAccountId.get(a.id);
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      nameEn: a.nameEn,
      type: a.type,
      normalBalance: a.normalBalance,
      isActive: a.isActive,
      balance: roundMoney(row?.balance ?? 0),
      totalDebit: roundMoney(row?.totalDebit ?? 0),
      totalCredit: roundMoney(row?.totalCredit ?? 0),
    };
  });

  const totalDebit = roundMoney(Number(trialBalance.summary.totalDebit ?? 0));
  const totalCredit = roundMoney(Number(trialBalance.summary.totalCredit ?? 0));
  const metadata = trialBalance.metadata ?? {};

  return {
    accounts: snapshots,
    trialBalance: {
      totalDebit,
      totalCredit,
      difference: roundMoney(Number(metadata.difference ?? Math.abs(totalDebit - totalCredit))),
      isBalanced: Boolean(metadata.isBalanced),
    },
  };
}

export class ReadinessService {
  /** يجمع كل ما يحتاجه محرّك التحقق في بنية واحدة صافية. */
  async buildDataset(query: ReadinessQuery = {}): Promise<ReadinessDataset> {
    const [taxonomy, context, hasOfficialTaxonomy, company] = await Promise.all([
      query.taxonomyId
        ? taxonomyService.getById(query.taxonomyId).then((t) => ({
            id: t.id, code: t.code, nameAr: t.nameAr, nameEn: t.nameEn, jurisdiction: t.jurisdiction,
            version: t.version, status: t.status, isOfficial: t.isOfficial,
            effectiveFrom: t.effectiveFrom?.toISOString() ?? null,
            effectiveTo: t.effectiveTo?.toISOString() ?? null,
          }))
        : taxonomyService.getActive(),
      reportingContextService.resolve({ contextId: query.contextId, fiscalYear: query.fiscalYear }),
      taxonomyService.hasOfficialTaxonomy(),
      loadCompanyInfo(),
    ]);

    const asOfDate = query.asOfDate ?? context?.periodEnd ?? new Date().toISOString();
    const { accounts, trialBalance } = await loadAccountBalances(asOfDate);

    const [concepts, accountMappings, statementMappings] = taxonomy
      ? await Promise.all([
          prisma.xbrlConcept.findMany({
            where: { taxonomyId: taxonomy.id },
            orderBy: [{ displayOrder: 'asc' }, { conceptCode: 'asc' }],
          }),
          prisma.xbrlAccountMapping.findMany({ where: { taxonomyId: taxonomy.id }, orderBy: { id: 'asc' } }),
          prisma.xbrlStatementMapping.findMany({ where: { taxonomyId: taxonomy.id }, orderBy: [{ statementType: 'asc' }, { displayOrder: 'asc' }] }),
        ])
      : [[], [], []];

    return {
      taxonomy,
      hasOfficialTaxonomy,
      company,
      accounts,
      trialBalance,
      equation: computeBalanceSheetEquation(accounts),
      context,
      concepts: concepts.map((c) => ({
        id: c.id,
        taxonomyId: c.taxonomyId,
        conceptCode: c.conceptCode,
        namespace: c.namespace,
        labelAr: c.labelAr,
        labelEn: c.labelEn,
        dataType: c.dataType,
        balanceType: c.balanceType,
        periodType: c.periodType,
        statementType: c.statementType,
        parentConceptId: c.parentConceptId,
        isRequired: c.isRequired,
        displayOrder: c.displayOrder,
      })),
      accountMappings: accountMappings.map((m) => ({
        id: m.id,
        taxonomyId: m.taxonomyId,
        accountId: m.accountId,
        conceptId: m.conceptId,
        status: m.status,
        isEnabled: m.isEnabled,
        effectiveFrom: m.effectiveFrom?.toISOString() ?? null,
        effectiveTo: m.effectiveTo?.toISOString() ?? null,
        source: m.source,
        notes: m.notes,
      })),
      statementMappings: statementMappings.map((s) => ({
        id: s.id,
        taxonomyId: s.taxonomyId,
        statementType: s.statementType,
        lineCode: s.lineCode,
        lineLabelAr: s.lineLabelAr,
        lineLabelEn: s.lineLabelEn,
        parentLineCode: s.parentLineCode,
        conceptId: s.conceptId,
        displayOrder: s.displayOrder,
        isTotal: s.isTotal,
        isEnabled: s.isEnabled,
      })),
    };
  }

  /** التقرير الكامل الذي تعرضه شاشة «جاهزية XBRL». */
  async getReport(query: ReadinessQuery = {}): Promise<ReadinessReport> {
    const dataset = await this.buildDataset(query);
    return this.buildReportFromDataset(dataset);
  }

  /** يحوّل مجموعة بيانات جاهزة إلى تقرير — مفصولة كي تعيد اللقطة استعمالها بلا قراءة ثانية. */
  buildReportFromDataset(dataset: ReadinessDataset): ReadinessReport {
    const validation = validateReadiness(dataset);
    const accounts = buildAccountRows(dataset);
    return {
      generatedAt: new Date().toISOString(),
      taxonomy: dataset.taxonomy,
      context: dataset.context,
      company: dataset.company,
      trialBalance: dataset.trialBalance,
      equation: dataset.equation,
      score: computeReadinessScore(accounts, validation, dataset.hasOfficialTaxonomy),
      validation,
      accounts,
    };
  }
}

export const readinessService = new ReadinessService();
