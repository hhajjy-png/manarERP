/**
 * محرّك تحقق جاهزية XBRL — دوال صافية على `ReadinessDataset`.
 *
 * ═══ لماذا لا يلمس هذا الملف قاعدة البيانات ═══
 * لأن الحكم يجب أن يكون قابلًا للاختبار بمدخلات مصنوعة يدويًا. لا Prisma هنا، ولا
 * `Date.now()` داخل القواعد (اللحظة تُمرَّر)، ولا كتابة من أي نوع. القاعدة التي
 * تحتاج بيانات جديدة تُطلبها في `ReadinessDataset`، ولا تذهب لجلبها بنفسها.
 *
 * ═══ ما لا يفعله هذا المحرّك ═══
 * • لا يمنع أي عملية محاسبية. نتيجته تقرير، لا قفل: `ERROR` هنا لا يوقف ترحيل قيد
 *   ولا اعتماد فاتورة ولا صرف راتب. هذا قيد تصميمي صريح في مواصفة الحزمة.
 * • لا يحتاج تصنيفًا حكوميًا ليعمل: كل قاعدة أدناه تُقيَّم على بيانات المنار نفسها،
 *   وغياب التصنيف الرسمي حالة يُبلَّغ عنها (EXP-001) لا شرط تشغيل.
 */
import { moneyEquals, roundMoney } from '../../../shared/utils/money';
import {
  isFinancialAccountType,
  XBRL_RULE_CODES,
  type XbrlRuleCategory,
  type XbrlSeverity,
} from '../xbrl.constants';
import type {
  AccountBalanceSnapshot,
  BalanceSheetEquation,
  ReadinessDataset,
  ValidationFinding,
  ValidationResult,
} from '../xbrl.types';

/** صيغة نقدية للعرض داخل الرسائل — ثلاث منازل دائمًا. */
function money(value: number): string {
  return roundMoney(value).toFixed(3);
}

function finding(
  code: ValidationFinding['code'],
  severity: XbrlSeverity,
  category: XbrlRuleCategory,
  messageAr: string,
  extra: Partial<Pick<ValidationFinding, 'entityType' | 'entityIds' | 'details'>> = {},
): ValidationFinding {
  return { code, severity, category, messageAr, ...extra };
}

// ═══════════════════════════════════════════════════════════════════════════
//  حساب معادلة الميزانية من الأرصدة المقروءة
// ═══════════════════════════════════════════════════════════════════════════

/**
 * يبني طرفَي المعادلة من أرصدة الحسابات (رصيد = مدين − دائن لكل حساب).
 *
 * الهوية المحاسبية على كل الأسطر المُرحَّلة: Σ مدين = Σ دائن ⇒ Σ رصيد = 0، ومنها:
 *
 *     الأصول = الالتزامات + حقوق الملكية + (الإيرادات − المصروفات)
 *
 * ولهذا **يُقاس الفرق على الحسابات المصنَّفة وحدها**: حساب فعّال بنوع غير معروف لا
 * يقع في أي طرف، فيُخرج المعادلة عن الإغلاق — وهذا بالضبط ما نريد كشفه. لو جمعنا
 * كل الحسابات بلا تصنيف لأغلقت المعادلة حسابيًا دائمًا ولما كشفت شيئًا.
 */
export function computeBalanceSheetEquation(accounts: AccountBalanceSnapshot[]): BalanceSheetEquation {
  let assets = 0;
  let liabilities = 0;
  let equity = 0;
  let revenue = 0;
  let expenses = 0;
  const unclassifiedAccountIds: number[] = [];

  for (const account of accounts) {
    if (!isFinancialAccountType(account.type)) {
      // الحسابات غير الفعّالة بنوع غير معروف لا تُبلَّغ: لا أثر لها على أي تقرير.
      if (account.isActive) unclassifiedAccountIds.push(account.accountId);
      continue;
    }
    switch (account.type) {
      case 'ASSET':     assets      += account.balance; break;
      // الالتزامات وحقوق الملكية والإيرادات أرصدتها دائنة ⇒ سالبة بصيغة (مدين − دائن).
      case 'LIABILITY': liabilities += -account.balance; break;
      case 'EQUITY':    equity      += -account.balance; break;
      case 'REVENUE':   revenue     += -account.balance; break;
      case 'EXPENSE':   expenses    += account.balance; break;
    }
  }

  assets = roundMoney(assets);
  liabilities = roundMoney(liabilities);
  equity = roundMoney(equity);
  revenue = roundMoney(revenue);
  expenses = roundMoney(expenses);

  const netResult = roundMoney(revenue - expenses);
  const totalEquityWithResult = roundMoney(equity + netResult);
  const difference = roundMoney(assets - (liabilities + totalEquityWithResult));

  return {
    assets,
    liabilities,
    equity,
    revenue,
    expenses,
    netResult,
    totalEquityWithResult,
    difference,
    isBalanced: moneyEquals(assets, liabilities + totalEquityWithResult),
    unclassifiedAccountIds,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
//  قواعد التحقق
// ═══════════════════════════════════════════════════════════════════════════

/** هل تتقاطع نافذتا سريان؟ نافذة مفتوحة الطرف تمتد إلى ما لا نهاية في ذلك الاتجاه. */
function windowsOverlap(
  aFrom: string | null, aTo: string | null,
  bFrom: string | null, bTo: string | null,
): boolean {
  const aStart = aFrom ? Date.parse(aFrom) : Number.NEGATIVE_INFINITY;
  const aEnd = aTo ? Date.parse(aTo) : Number.POSITIVE_INFINITY;
  const bStart = bFrom ? Date.parse(bFrom) : Number.NEGATIVE_INFINITY;
  const bEnd = bTo ? Date.parse(bTo) : Number.POSITIVE_INFINITY;
  return aStart <= bEnd && bStart <= aEnd;
}

/** ACC-001 — ميزان المراجعة متوازن. */
function checkTrialBalance(ds: ReadinessDataset): ValidationFinding[] {
  if (ds.trialBalance.isBalanced) return [];
  return [
    finding(
      XBRL_RULE_CODES.TRIAL_BALANCE_UNBALANCED,
      'ERROR',
      'ACCOUNTING',
      `ميزان المراجعة غير متوازن: إجمالي المدين ${money(ds.trialBalance.totalDebit)} مقابل إجمالي الدائن ${money(ds.trialBalance.totalCredit)} (الفرق ${money(ds.trialBalance.difference)} د.ك).`,
      { details: { ...ds.trialBalance } },
    ),
  ];
}

/** ACC-002 / ACC-004 — معادلة الميزانية وحسابات بلا تصنيف. */
function checkEquation(ds: ReadinessDataset): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const eq = ds.equation;

  if (eq.unclassifiedAccountIds.length > 0) {
    out.push(
      finding(
        XBRL_RULE_CODES.UNCLASSIFIED_ACCOUNT_TYPE,
        'ERROR',
        'ACCOUNTING',
        `${eq.unclassifiedAccountIds.length} حساب فعّال بنوع غير معروف — لا يقع في أي طرف من معادلة الميزانية.`,
        { entityType: 'ACCOUNT', entityIds: eq.unclassifiedAccountIds },
      ),
    );
  }

  if (!eq.isBalanced) {
    out.push(
      finding(
        XBRL_RULE_CODES.BALANCE_SHEET_EQUATION,
        'ERROR',
        'ACCOUNTING',
        `معادلة الميزانية لا تُغلق: الأصول ${money(eq.assets)} ≠ الالتزامات ${money(eq.liabilities)} + حقوق الملكية شاملة نتيجة الفترة ${money(eq.totalEquityWithResult)} (الفرق ${money(eq.difference)} د.ك).`,
        { details: { assets: eq.assets, liabilities: eq.liabilities, totalEquityWithResult: eq.totalEquityWithResult, difference: eq.difference } },
      ),
    );
  }

  return out;
}

/**
 * ACC-003 — حسابات مالية فعّالة بلا ربط.
 *
 * الشدّة تتبع وجود تصنيف مفعَّل: بلا تصنيف مفعَّل لا يوجد ما يُربط به أصلًا، فالنقص
 * تنبيه لا خطأ. مع تصنيف مفعَّل يصبح النقص خطأ حقيقيًا يمنع اكتمال الجاهزية.
 */
function checkUnmappedAccounts(ds: ReadinessDataset): ValidationFinding[] {
  const taxonomyActive = ds.taxonomy?.status === 'ACTIVE';
  const mappedAccountIds = new Set(
    ds.accountMappings
      .filter((m) => m.isEnabled && m.status !== 'NOT_APPLICABLE')
      .map((m) => m.accountId),
  );
  const excludedAccountIds = new Set(
    ds.accountMappings.filter((m) => m.status === 'NOT_APPLICABLE').map((m) => m.accountId),
  );

  const unmapped = ds.accounts
    .filter((a) => a.isActive && isFinancialAccountType(a.type))
    .filter((a) => !mappedAccountIds.has(a.accountId) && !excludedAccountIds.has(a.accountId))
    .map((a) => a.accountId);

  if (unmapped.length === 0) return [];

  return [
    finding(
      XBRL_RULE_CODES.UNMAPPED_FINANCIAL_ACCOUNTS,
      taxonomyActive ? 'ERROR' : 'WARNING',
      'MAPPING',
      `${unmapped.length} حساب مالي فعّال بلا ربط بمفهوم XBRL.`,
      { entityType: 'ACCOUNT', entityIds: unmapped, details: { taxonomyActive } },
    ),
  ];
}

/** RPT-001 — وجود سياق التقرير وصحة فترته. */
function checkReportingPeriod(ds: ReadinessDataset): ValidationFinding[] {
  const ctx = ds.context;
  if (!ctx) {
    return [
      finding(
        XBRL_RULE_CODES.REPORTING_PERIOD_INVALID,
        'ERROR',
        'REPORTING',
        'لا يوجد سياق تقرير محدَّد (الفترة المالية والعملة والكيان).',
        { entityType: 'CONTEXT' },
      ),
    ];
  }

  const start = Date.parse(ctx.periodStart);
  const end = Date.parse(ctx.periodEnd);
  if (Number.isNaN(start) || Number.isNaN(end) || start >= end) {
    return [
      finding(
        XBRL_RULE_CODES.REPORTING_PERIOD_INVALID,
        'ERROR',
        'REPORTING',
        'الفترة المالية غير صحيحة: تاريخ البداية يجب أن يسبق تاريخ النهاية.',
        { entityType: 'CONTEXT', entityIds: ctx.id ? [ctx.id] : undefined },
      ),
    ];
  }
  return [];
}

/** RPT-002 — اتساق فترة المقارنة مع الفترة الحالية. */
function checkComparativePeriod(ds: ReadinessDataset): ValidationFinding[] {
  const ctx = ds.context;
  if (!ctx) return [];

  const { comparativePeriodStart: cStart, comparativePeriodEnd: cEnd } = ctx;
  if (!cStart && !cEnd) return []; // فترة المقارنة اختيارية بالكامل.

  const ids = ctx.id ? [ctx.id] : undefined;
  const emit = (msg: string) =>
    finding(XBRL_RULE_CODES.COMPARATIVE_PERIOD_INCONSISTENT, 'ERROR', 'REPORTING', msg, {
      entityType: 'CONTEXT',
      entityIds: ids,
    });

  if (!cStart || !cEnd) {
    return [emit('فترة المقارنة ناقصة: يجب تحديد بدايتها ونهايتها معًا أو تركهما فارغتين.')];
  }

  const cs = Date.parse(cStart);
  const ce = Date.parse(cEnd);
  const ps = Date.parse(ctx.periodStart);
  if (Number.isNaN(cs) || Number.isNaN(ce) || cs >= ce) {
    return [emit('فترة المقارنة غير صحيحة: تاريخ البداية يجب أن يسبق تاريخ النهاية.')];
  }
  if (ce >= ps) {
    return [emit('فترة المقارنة تتداخل مع الفترة الحالية: يجب أن تنتهي قبل بداية الفترة الحالية.')];
  }
  return [];
}

/** RPT-003 — العملة موجودة وبصيغة صالحة. */
function checkCurrency(ds: ReadinessDataset): ValidationFinding[] {
  const ctx = ds.context;
  if (!ctx) return []; // غياب السياق كله يُبلَّغ عنه في RPT-001، فلا نُكرّره.
  if (!/^[A-Z]{3}$/.test(ctx.currency)) {
    return [
      finding(
        XBRL_RULE_CODES.CURRENCY_MISSING,
        'ERROR',
        'REPORTING',
        'عملة التقرير مفقودة أو بصيغة غير صالحة (المتوقع رمز ISO من ثلاثة أحرف، مثل KWD).',
        { entityType: 'CONTEXT', entityIds: ctx.id ? [ctx.id] : undefined },
      ),
    ];
  }
  return [];
}

/** RPT-004 — بيانات الشركة الأساسية. */
function checkEntityInfo(ds: ReadinessDataset): ValidationFinding[] {
  const out: ValidationFinding[] = [];
  const missing: string[] = [];
  if (!ds.company.name?.trim()) missing.push('اسم الشركة');
  if (ds.context && !ds.context.entityName.trim()) missing.push('اسم الكيان في سياق التقرير');

  if (missing.length > 0) {
    out.push(
      finding(
        XBRL_RULE_CODES.ENTITY_INFO_INCOMPLETE,
        'ERROR',
        'REPORTING',
        `بيانات الشركة الأساسية ناقصة: ${missing.join('، ')}.`,
        { entityType: 'COMPANY' },
      ),
    );
  } else if (ds.context && !ds.context.entityIdentifier?.trim()) {
    out.push(
      finding(
        XBRL_RULE_CODES.ENTITY_INFO_INCOMPLETE,
        'WARNING',
        'REPORTING',
        'معرّف الكيان (السجل التجاري / الرقم الموحّد) غير محدَّد — سيلزم عند التصدير الرسمي.',
        { entityType: 'CONTEXT', entityIds: ds.context.id ? [ds.context.id] : undefined },
      ),
    );
  }
  return out;
}

/**
 * MAP-001 — تعارض ربط: أكثر من سطر فعّال لنفس الحساب بنوافذ سريان متداخلة.
 *
 * الخدمة تمنع إنشاء هذا التعارض أصلًا؛ القاعدة هنا خط دفاع ثانٍ مستقل عنها، لأن
 * البيانات قد تصل مستقبلًا من مستورد تصنيف رسمي لا يمرّ بمسار الإنشاء اليدوي.
 */
function checkConflictingMappings(ds: ReadinessDataset): ValidationFinding[] {
  const enabled = ds.accountMappings.filter((m) => m.isEnabled);
  const byAccount = new Map<number, typeof enabled>();
  for (const m of enabled) {
    const list = byAccount.get(m.accountId) ?? [];
    list.push(m);
    byAccount.set(m.accountId, list);
  }

  const conflicting: number[] = [];
  const conflictingAccounts: number[] = [];
  for (const [accountId, list] of byAccount) {
    if (list.length < 2) continue;
    let hasOverlap = false;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (windowsOverlap(list[i].effectiveFrom, list[i].effectiveTo, list[j].effectiveFrom, list[j].effectiveTo)) {
          hasOverlap = true;
          conflicting.push(list[i].id, list[j].id);
        }
      }
    }
    if (hasOverlap) conflictingAccounts.push(accountId);
  }

  if (conflictingAccounts.length === 0) return [];
  return [
    finding(
      XBRL_RULE_CODES.CONFLICTING_MAPPING,
      'ERROR',
      'MAPPING',
      `${conflictingAccounts.length} حساب مرتبط بأكثر من مفهوم في الوقت نفسه (نوافذ سريان متداخلة).`,
      { entityType: 'MAPPING', entityIds: [...new Set(conflicting)], details: { accountIds: conflictingAccounts } },
    ),
  ];
}

/** MAP-002 — ربط يشير إلى مفهوم خارج التصنيف نفسه. */
function checkInvalidMappings(ds: ReadinessDataset): ValidationFinding[] {
  const conceptTaxonomy = new Map(ds.concepts.map((c) => [c.id, c.taxonomyId]));
  const invalid = ds.accountMappings
    .filter((m) => {
      const owner = conceptTaxonomy.get(m.conceptId);
      return owner !== undefined && owner !== m.taxonomyId;
    })
    .map((m) => m.id);

  if (invalid.length === 0) return [];
  return [
    finding(
      XBRL_RULE_CODES.INVALID_MAPPING,
      'ERROR',
      'MAPPING',
      `${invalid.length} سطر ربط يشير إلى مفهوم لا ينتمي إلى التصنيف نفسه.`,
      { entityType: 'MAPPING', entityIds: invalid },
    ),
  ];
}

/** MAP-003 — لا يوجد تصنيف مفعَّل. */
function checkTaxonomyActive(ds: ReadinessDataset): ValidationFinding[] {
  if (!ds.taxonomy) {
    return [
      finding(
        XBRL_RULE_CODES.TAXONOMY_INACTIVE,
        'WARNING',
        'MAPPING',
        'لا يوجد تصنيف (Taxonomy) مفعَّل — الربط والتحقق يعملان، لكن لا مرجع مفاهيم مُعتمَد.',
        { entityType: 'TAXONOMY' },
      ),
    ];
  }
  if (ds.taxonomy.status !== 'ACTIVE') {
    return [
      finding(
        XBRL_RULE_CODES.TAXONOMY_INACTIVE,
        'WARNING',
        'MAPPING',
        `التصنيف «${ds.taxonomy.nameAr}» غير مفعَّل (الحالة: ${ds.taxonomy.status}).`,
        { entityType: 'TAXONOMY', entityIds: [ds.taxonomy.id] },
      ),
    ];
  }
  return [];
}

/** MAP-004 — مفاهيم مطلوبة بلا أي ربط (حساب أو بند قائمة). */
function checkMissingRequiredConcepts(ds: ReadinessDataset): ValidationFinding[] {
  if (!ds.taxonomy) return [];
  const covered = new Set<number>();
  for (const m of ds.accountMappings) if (m.isEnabled) covered.add(m.conceptId);
  for (const s of ds.statementMappings) if (s.isEnabled && s.conceptId != null) covered.add(s.conceptId);

  const missing = ds.concepts
    .filter((c) => c.taxonomyId === ds.taxonomy!.id && c.isRequired && !covered.has(c.id))
    .map((c) => c.id);

  if (missing.length === 0) return [];
  return [
    finding(
      XBRL_RULE_CODES.MISSING_REQUIRED_CONCEPTS,
      'WARNING',
      'MAPPING',
      `${missing.length} مفهوم مطلوب في التصنيف بلا أي ربط.`,
      { entityType: 'CONCEPT', entityIds: missing },
    ),
  ];
}

/** MAP-005 — ربط يتيم: حسابه غير فعّال، أو مفهومه غير موجود. */
function checkOrphanMappings(ds: ReadinessDataset): ValidationFinding[] {
  const activeAccountIds = new Set(ds.accounts.filter((a) => a.isActive).map((a) => a.accountId));
  const knownAccountIds = new Set(ds.accounts.map((a) => a.accountId));
  const conceptIds = new Set(ds.concepts.map((c) => c.id));

  const orphans = ds.accountMappings
    .filter((m) => !conceptIds.has(m.conceptId) || !knownAccountIds.has(m.accountId) || !activeAccountIds.has(m.accountId))
    .map((m) => m.id);

  if (orphans.length === 0) return [];
  return [
    finding(
      XBRL_RULE_CODES.ORPHAN_MAPPING,
      'WARNING',
      'MAPPING',
      `${orphans.length} سطر ربط يتيم: الحساب غير فعّال أو المفهوم غير موجود.`,
      { entityType: 'MAPPING', entityIds: orphans },
    ),
  ];
}

/** MAP-006 — بند قائمة مالية مفعَّل بلا مفهوم. */
function checkUnmappedStatementLines(ds: ReadinessDataset): ValidationFinding[] {
  const unmapped = ds.statementMappings.filter((s) => s.isEnabled && s.conceptId == null).map((s) => s.id);
  if (unmapped.length === 0) return [];
  return [
    finding(
      XBRL_RULE_CODES.STATEMENT_LINE_UNMAPPED,
      'WARNING',
      'MAPPING',
      `${unmapped.length} بند قائمة مالية مفعَّل بلا مفهوم XBRL.`,
      { entityType: 'STATEMENT_LINE', entityIds: unmapped },
    ),
  ];
}

/**
 * EXP-001 — لا تصنيف رسمي معتمد.
 *
 * `INFO` لا `WARNING`: هذه هي الحالة الطبيعية والمتوقّعة في هذه المرحلة، لا خلل في
 * إعداد المستخدم. رفعها إلى تنبيه يجعل كل شاشة تبدو معطوبة بلا سبب.
 */
function checkOfficialTaxonomy(ds: ReadinessDataset): ValidationFinding[] {
  if (ds.hasOfficialTaxonomy) return [];
  return [
    finding(
      XBRL_RULE_CODES.NO_OFFICIAL_TAXONOMY,
      'INFO',
      'EXPORT',
      'لا يوجد تصنيف (Taxonomy) رسمي معتمد مثبَّت — التصدير الرسمي غير متاح في هذه المرحلة.',
      { entityType: 'TAXONOMY' },
    ),
  ];
}

const RULES: ((ds: ReadinessDataset) => ValidationFinding[])[] = [
  checkTrialBalance,
  checkEquation,
  checkUnmappedAccounts,
  checkReportingPeriod,
  checkComparativePeriod,
  checkCurrency,
  checkEntityInfo,
  checkConflictingMappings,
  checkInvalidMappings,
  checkTaxonomyActive,
  checkMissingRequiredConcepts,
  checkOrphanMappings,
  checkUnmappedStatementLines,
  checkOfficialTaxonomy,
];

/** يشغّل كل القواعد ويُجمِّع النتائج. لا ترتيب اعتمادي بين القواعد. */
export function validateReadiness(dataset: ReadinessDataset): ValidationResult {
  const findings = RULES.flatMap((rule) => rule(dataset));
  const errorCount = findings.filter((f) => f.severity === 'ERROR').length;
  const warningCount = findings.filter((f) => f.severity === 'WARNING').length;
  const infoCount = findings.filter((f) => f.severity === 'INFO').length;
  return { findings, errorCount, warningCount, infoCount, isValid: errorCount === 0 };
}
