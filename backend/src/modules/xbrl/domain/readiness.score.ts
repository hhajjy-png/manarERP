/**
 * حساب مؤشر جاهزية XBRL — دالة صافية على `ReadinessDataset` ونتيجة التحقق.
 *
 * ⚠ المؤشر **لا يُسمّى ولا يُعرض** بوصفه توافقًا مع QAYD أو وزارة التجارة. أقصى حالة
 *   يبلغها هي `READY_PENDING_TAXONOMY`: البيانات الداخلية سليمة والتصنيف الرسمي لم
 *   يصل. التسمية جزء من العقد — تغييرها يجعل النظام يدّعي ما لم يُختبَر.
 */
import { isFinancialAccountType, XBRL_READINESS_STATUS } from '../xbrl.constants';
import type {
  AccountMappingSnapshot,
  AccountReadinessRow,
  ConceptSnapshot,
  ReadinessDataset,
  ReadinessScore,
  ValidationResult,
} from '../xbrl.types';

/**
 * سطر الربط الفعّال لحساب معيّن.
 * عند وجود أكثر من سطر (حالة تعارض يكشفها MAP-001) يُختار الأحدث معرّفًا حتى تعرض
 * الشاشة شيئًا محدَّدًا — والتعارض نفسه يظهر في نتائج التحقق، فلا يُخفى بهذا الاختيار.
 */
function activeMappingFor(
  accountId: number,
  mappings: AccountMappingSnapshot[],
): AccountMappingSnapshot | null {
  const candidates = mappings.filter((m) => m.accountId === accountId && m.isEnabled);
  if (candidates.length === 0) {
    // سطر معطَّل بحالة «غير مطلوب» يبقى ذا معنى: هو قرار صريح باستثناء الحساب.
    const excluded = mappings.find((m) => m.accountId === accountId && m.status === 'NOT_APPLICABLE');
    return excluded ?? null;
  }
  return candidates.reduce((a, b) => (b.id > a.id ? b : a));
}

/** يبني صفوف جدول «ربط الحسابات» — الحسابات الفعّالة ذات النوع المالي المعروف. */
export function buildAccountRows(dataset: ReadinessDataset): AccountReadinessRow[] {
  const conceptById = new Map<number, ConceptSnapshot>(dataset.concepts.map((c) => [c.id, c]));

  return dataset.accounts
    .filter((a) => a.isActive && isFinancialAccountType(a.type))
    .map((account) => {
      const mapping = activeMappingFor(account.accountId, dataset.accountMappings);
      const concept = mapping ? conceptById.get(mapping.conceptId) ?? null : null;

      // «غير مربوط» مشتقة من غياب السطر — ليست قيمة مخزَّنة في أي عمود.
      const mappingStatus: AccountReadinessRow['mappingStatus'] = !mapping
        ? 'UNMAPPED'
        : mapping.status === 'NEEDS_REVIEW'
          ? 'NEEDS_REVIEW'
          : mapping.status === 'NOT_APPLICABLE'
            ? 'NOT_APPLICABLE'
            : 'MAPPED';

      return {
        accountId: account.accountId,
        code: account.code,
        name: account.name,
        type: account.type,
        balance: account.balance,
        mappingStatus,
        mappingId: mapping?.id ?? null,
        conceptId: concept?.id ?? null,
        conceptCode: concept?.conceptCode ?? null,
        conceptLabelAr: concept?.labelAr ?? null,
        notes: mapping?.notes ?? null,
      };
    });
}

/**
 * يحسب المؤشر من صفوف الحسابات ونتيجة التحقق.
 *
 * النسبة تُقاس على **القابل للربط** — أي الحسابات المالية الفعّالة بعد استبعاد ما
 * وُسم صراحةً «غير مطلوب». وسم حساب بأنه غير مطلوب قرار إداري صريح، ولا يجوز أن
 * يُحسب ضده في النسبة كأنه إهمال.
 */
export function computeReadinessScore(
  rows: AccountReadinessRow[],
  validation: ValidationResult,
  hasOfficialTaxonomy: boolean,
): ReadinessScore {
  const notApplicable = rows.filter((r) => r.mappingStatus === 'NOT_APPLICABLE').length;
  const mapped = rows.filter((r) => r.mappingStatus === 'MAPPED').length;
  const needsReview = rows.filter((r) => r.mappingStatus === 'NEEDS_REVIEW').length;
  const unmapped = rows.filter((r) => r.mappingStatus === 'UNMAPPED').length;

  const applicableAccounts = rows.length - notApplicable;
  const mappedPercentage =
    applicableAccounts === 0 ? 0 : Math.round(((mapped / applicableAccounts) * 100) * 10) / 10;

  const status =
    validation.errorCount > 0
      ? XBRL_READINESS_STATUS.NOT_READY
      : unmapped > 0 || needsReview > 0 || validation.warningCount > 0
        ? XBRL_READINESS_STATUS.IN_PROGRESS
        : XBRL_READINESS_STATUS.READY_PENDING_TAXONOMY;

  return {
    applicableAccounts,
    mapped,
    unmapped,
    needsReview,
    notApplicable,
    errorCount: validation.errorCount,
    warningCount: validation.warningCount,
    infoCount: validation.infoCount,
    mappedPercentage,
    status,
    officialTaxonomyInstalled: hasOfficialTaxonomy,
  };
}
