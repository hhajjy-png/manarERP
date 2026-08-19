/**
 * مُنشئات بيانات اختبار لطبقة جاهزية XBRL.
 *
 * الافتراضي **صحيح ومتوازن**: كل اختبار يكسر ما يقصد اختباره وحده، فلا يمرّ فحص
 * بالصدفة لأن المدخل كان معطوبًا من أصله.
 */
import { computeBalanceSheetEquation } from '../domain/validation.engine';
import type {
  AccountBalanceSnapshot,
  AccountMappingSnapshot,
  ConceptSnapshot,
  ReadinessDataset,
  ReportingContextSnapshot,
  StatementMappingSnapshot,
  TaxonomySnapshot,
} from '../xbrl.types';

export function account(over: Partial<AccountBalanceSnapshot> & { accountId: number; type: string; balance: number }): AccountBalanceSnapshot {
  return {
    code: `A${over.accountId}`,
    name: `حساب ${over.accountId}`,
    nameEn: null,
    normalBalance: 'DEBIT',
    isActive: true,
    totalDebit: over.balance > 0 ? over.balance : 0,
    totalCredit: over.balance < 0 ? -over.balance : 0,
    ...over,
  };
}

export function taxonomy(over: Partial<TaxonomySnapshot> = {}): TaxonomySnapshot {
  return {
    id: 1,
    code: 'INTERNAL-DRAFT',
    nameAr: 'تصنيف داخلي',
    nameEn: null,
    jurisdiction: 'INTERNAL',
    version: '1.0',
    status: 'ACTIVE',
    isOfficial: false,
    effectiveFrom: null,
    effectiveTo: null,
    ...over,
  };
}

export function concept(over: Partial<ConceptSnapshot> & { id: number }): ConceptSnapshot {
  return {
    taxonomyId: 1,
    conceptCode: `Concept${over.id}`,
    namespace: null,
    labelAr: `مفهوم ${over.id}`,
    labelEn: null,
    dataType: 'MONETARY',
    balanceType: 'NONE',
    periodType: 'DURATION',
    statementType: 'SFP',
    parentConceptId: null,
    isRequired: false,
    displayOrder: 0,
    ...over,
  };
}

export function mapping(over: Partial<AccountMappingSnapshot> & { id: number; accountId: number; conceptId: number }): AccountMappingSnapshot {
  return {
    taxonomyId: 1,
    status: 'MAPPED',
    isEnabled: true,
    effectiveFrom: null,
    effectiveTo: null,
    source: 'MANUAL',
    notes: null,
    ...over,
  };
}

export function statementLine(over: Partial<StatementMappingSnapshot> & { id: number }): StatementMappingSnapshot {
  return {
    taxonomyId: 1,
    statementType: 'SFP',
    lineCode: `LINE-${over.id}`,
    lineLabelAr: `بند ${over.id}`,
    lineLabelEn: null,
    parentLineCode: null,
    conceptId: null,
    displayOrder: 0,
    isTotal: false,
    isEnabled: true,
    ...over,
  };
}

export function context(over: Partial<ReportingContextSnapshot> = {}): ReportingContextSnapshot {
  return {
    id: 1,
    name: 'السنة المالية 2026',
    taxonomyId: 1,
    entityName: 'شركة المنار الدولية',
    entityNameEn: null,
    entityIdentifier: '123456',
    entityScheme: 'وزارة التجارة والصناعة',
    fiscalYear: 2026,
    periodStart: '2026-01-01T00:00:00.000Z',
    periodEnd: '2026-12-31T00:00:00.000Z',
    instantDate: '2026-12-31T00:00:00.000Z',
    comparativePeriodStart: '2025-01-01T00:00:00.000Z',
    comparativePeriodEnd: '2025-12-31T00:00:00.000Z',
    currency: 'KWD',
    decimals: 3,
    reportingLanguage: 'ar',
    isDefault: true,
    ...over,
  };
}

/**
 * دليل حسابات متوازن افتراضيًا:
 *   أصول 10.000 = التزامات 4.000 + حقوق ملكية 3.000 + (إيرادات 8.000 − مصروفات 5.000)
 */
export const BALANCED_ACCOUNTS: AccountBalanceSnapshot[] = [
  account({ accountId: 1, type: 'ASSET', balance: 10 }),
  account({ accountId: 2, type: 'LIABILITY', balance: -4 }),
  account({ accountId: 3, type: 'EQUITY', balance: -3 }),
  account({ accountId: 4, type: 'REVENUE', balance: -8 }),
  account({ accountId: 5, type: 'EXPENSE', balance: 5 }),
];

/** مجموعة بيانات سليمة بالكامل — نقطة انطلاق كل اختبار. */
export function dataset(over: Partial<ReadinessDataset> = {}): ReadinessDataset {
  const accounts = over.accounts ?? BALANCED_ACCOUNTS;
  const base: ReadinessDataset = {
    taxonomy: taxonomy(),
    hasOfficialTaxonomy: false,
    concepts: [concept({ id: 10 })],
    accounts,
    accountMappings: accounts.map((a, i) => mapping({ id: 100 + i, accountId: a.accountId, conceptId: 10 })),
    statementMappings: [],
    context: context(),
    company: { name: 'شركة المنار الدولية', nameEn: null, country: 'الكويت', phone: null, address: null },
    trialBalance: { totalDebit: 15, totalCredit: 15, difference: 0, isBalanced: true },
    equation: computeBalanceSheetEquation(accounts),
  };
  const merged = { ...base, ...over };
  // إعادة اشتقاق المعادلة عند تبديل الحسابات دون تمرير معادلة صريحة — وإلا اختبرنا
  // معادلة لا تخصّ الحسابات التي أمامنا.
  if (over.accounts && !over.equation) merged.equation = computeBalanceSheetEquation(over.accounts);
  return merged;
}
