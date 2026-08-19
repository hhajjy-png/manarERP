import { describe, expect, it } from 'vitest';

/**
 * محرّك تحقق جاهزية XBRL — دوال صافية، فلا Prisma ولا شبكة في هذا الملف.
 * كل اختبار يبدأ من مجموعة بيانات **سليمة** ويكسر عنصرًا واحدًا بالضبط.
 */
import { computeBalanceSheetEquation, validateReadiness } from '../domain/validation.engine';
import { XBRL_RULE_CODES } from '../xbrl.constants';
import { account, concept, context, dataset, mapping, statementLine, taxonomy } from './fixtures';

const codes = (ds: Parameters<typeof validateReadiness>[0]) =>
  validateReadiness(ds).findings.map((f) => f.code);

describe('computeBalanceSheetEquation', () => {
  it('تُغلق المعادلة على دليل حسابات متوازن', () => {
    const eq = computeBalanceSheetEquation([
      account({ accountId: 1, type: 'ASSET', balance: 10 }),
      account({ accountId: 2, type: 'LIABILITY', balance: -4 }),
      account({ accountId: 3, type: 'EQUITY', balance: -3 }),
      account({ accountId: 4, type: 'REVENUE', balance: -8 }),
      account({ accountId: 5, type: 'EXPENSE', balance: 5 }),
    ]);

    expect(eq.assets).toBe(10);
    expect(eq.liabilities).toBe(4);
    expect(eq.equity).toBe(3);
    expect(eq.netResult).toBe(3);
    expect(eq.totalEquityWithResult).toBe(6);
    expect(eq.difference).toBe(0);
    expect(eq.isBalanced).toBe(true);
  });

  it('حساب فعّال بنوع غير معروف يُرصد ويكسر إغلاق المعادلة', () => {
    const eq = computeBalanceSheetEquation([
      account({ accountId: 1, type: 'ASSET', balance: 10 }),
      account({ accountId: 2, type: 'LIABILITY', balance: -4 }),
      account({ accountId: 9, type: 'SUSPENSE', balance: -6 }),
    ]);

    expect(eq.unclassifiedAccountIds).toEqual([9]);
    expect(eq.isBalanced).toBe(false);
  });

  it('حساب غير فعّال بنوع غير معروف لا يُبلَّغ عنه', () => {
    const eq = computeBalanceSheetEquation([
      account({ accountId: 9, type: 'SUSPENSE', balance: 0, isActive: false }),
    ]);
    expect(eq.unclassifiedAccountIds).toEqual([]);
  });

  it('يقرّب بدقة الدينار: ثلاث منازل عشرية', () => {
    const eq = computeBalanceSheetEquation([
      account({ accountId: 1, type: 'ASSET', balance: 0.1 }),
      account({ accountId: 2, type: 'ASSET', balance: 0.2 }),
      account({ accountId: 3, type: 'LIABILITY', balance: -0.3 }),
    ]);
    expect(eq.assets).toBe(0.3);
    expect(eq.isBalanced).toBe(true);
  });
});

describe('validateReadiness — الفحوص المحاسبية', () => {
  it('مجموعة بيانات سليمة لا تُنتج أي خطأ', () => {
    const result = validateReadiness(dataset());
    expect(result.errorCount).toBe(0);
    expect(result.isValid).toBe(true);
  });

  it('ACC-001 — ميزان مراجعة غير متوازن يُنتج خطأ', () => {
    const result = validateReadiness(
      dataset({ trialBalance: { totalDebit: 15, totalCredit: 14, difference: 1, isBalanced: false } }),
    );
    expect(result.findings.map((f) => f.code)).toContain(XBRL_RULE_CODES.TRIAL_BALANCE_UNBALANCED);
    expect(result.isValid).toBe(false);
  });

  it('ACC-002 + ACC-004 — حساب بنوع غير معروف يكسر المعادلة ويُبلَّغ مرتين بكودين مختلفين', () => {
    const accounts = [
      account({ accountId: 1, type: 'ASSET', balance: 10 }),
      account({ accountId: 9, type: 'SUSPENSE', balance: -10 }),
    ];
    const found = codes(dataset({ accounts }));
    expect(found).toContain(XBRL_RULE_CODES.UNCLASSIFIED_ACCOUNT_TYPE);
    expect(found).toContain(XBRL_RULE_CODES.BALANCE_SHEET_EQUATION);
  });

  it('ACC-003 — حساب مالي فعّال بلا ربط: خطأ مع تصنيف مفعَّل', () => {
    const result = validateReadiness(dataset({ accountMappings: [] }));
    const unmapped = result.findings.find((f) => f.code === XBRL_RULE_CODES.UNMAPPED_FINANCIAL_ACCOUNTS);
    expect(unmapped?.severity).toBe('ERROR');
    expect(unmapped?.entityIds).toHaveLength(5);
  });

  it('ACC-003 — تنبيه لا خطأ حين لا يوجد تصنيف مفعَّل', () => {
    const result = validateReadiness(dataset({ taxonomy: taxonomy({ status: 'DRAFT' }), accountMappings: [] }));
    const unmapped = result.findings.find((f) => f.code === XBRL_RULE_CODES.UNMAPPED_FINANCIAL_ACCOUNTS);
    expect(unmapped?.severity).toBe('WARNING');
  });

  it('ACC-003 — حساب موسوم «غير مطلوب» لا يُعدّ غير مربوط', () => {
    const accounts = [account({ accountId: 1, type: 'ASSET', balance: 0 })];
    const result = validateReadiness(
      dataset({
        accounts,
        equation: computeBalanceSheetEquation(accounts),
        accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 10, status: 'NOT_APPLICABLE', isEnabled: false })],
      }),
    );
    expect(result.findings.map((f) => f.code)).not.toContain(XBRL_RULE_CODES.UNMAPPED_FINANCIAL_ACCOUNTS);
  });
});

describe('validateReadiness — فحوص سياق التقرير', () => {
  it('RPT-001 — غياب السياق كليًا خطأ', () => {
    expect(codes(dataset({ context: null }))).toContain(XBRL_RULE_CODES.REPORTING_PERIOD_INVALID);
  });

  it('RPT-001 — بداية الفترة بعد نهايتها خطأ', () => {
    const ds = dataset({ context: context({ periodStart: '2026-12-31T00:00:00.000Z', periodEnd: '2026-01-01T00:00:00.000Z' }) });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.REPORTING_PERIOD_INVALID);
  });

  it('RPT-002 — فترة مقارنة نصف محدَّدة خطأ', () => {
    const ds = dataset({ context: context({ comparativePeriodEnd: null }) });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.COMPARATIVE_PERIOD_INCONSISTENT);
  });

  it('RPT-002 — فترة مقارنة متداخلة مع الفترة الحالية خطأ', () => {
    const ds = dataset({
      context: context({
        comparativePeriodStart: '2025-06-01T00:00:00.000Z',
        comparativePeriodEnd: '2026-06-01T00:00:00.000Z',
      }),
    });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.COMPARATIVE_PERIOD_INCONSISTENT);
  });

  it('RPT-002 — غياب فترة المقارنة كليًا مقبول', () => {
    const ds = dataset({ context: context({ comparativePeriodStart: null, comparativePeriodEnd: null }) });
    expect(codes(ds)).not.toContain(XBRL_RULE_CODES.COMPARATIVE_PERIOD_INCONSISTENT);
  });

  it('RPT-003 — عملة بصيغة غير صالحة خطأ', () => {
    expect(codes(dataset({ context: context({ currency: 'دك' }) }))).toContain(XBRL_RULE_CODES.CURRENCY_MISSING);
  });

  it('RPT-003 — KWD هي الحالة السليمة', () => {
    expect(codes(dataset())).not.toContain(XBRL_RULE_CODES.CURRENCY_MISSING);
  });

  it('RPT-004 — غياب اسم الشركة خطأ', () => {
    const ds = dataset({ company: { name: null, nameEn: null, country: null, phone: null, address: null } });
    const found = validateReadiness(ds).findings.find((f) => f.code === XBRL_RULE_CODES.ENTITY_INFO_INCOMPLETE);
    expect(found?.severity).toBe('ERROR');
  });

  it('RPT-004 — غياب معرّف الكيان تنبيه لا خطأ', () => {
    const ds = dataset({ context: context({ entityIdentifier: null }) });
    const found = validateReadiness(ds).findings.find((f) => f.code === XBRL_RULE_CODES.ENTITY_INFO_INCOMPLETE);
    expect(found?.severity).toBe('WARNING');
  });
});

describe('validateReadiness — فحوص الربط', () => {
  it('MAP-001 — ربطان فعّالان لنفس الحساب بنافذتين مفتوحتين تعارض', () => {
    const ds = dataset({
      concepts: [concept({ id: 10 }), concept({ id: 11 })],
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10 }),
        mapping({ id: 2, accountId: 1, conceptId: 11 }),
      ],
    });
    const found = validateReadiness(ds).findings.find((f) => f.code === XBRL_RULE_CODES.CONFLICTING_MAPPING);
    expect(found?.severity).toBe('ERROR');
    expect(found?.entityIds).toEqual(expect.arrayContaining([1, 2]));
  });

  it('MAP-001 — نافذتان لا تتقاطعان ليستا تعارضًا', () => {
    const ds = dataset({
      concepts: [concept({ id: 10 }), concept({ id: 11 })],
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10, effectiveFrom: '2025-01-01T00:00:00.000Z', effectiveTo: '2025-12-31T00:00:00.000Z' }),
        mapping({ id: 2, accountId: 1, conceptId: 11, effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: '2026-12-31T00:00:00.000Z' }),
      ],
    });
    expect(codes(ds)).not.toContain(XBRL_RULE_CODES.CONFLICTING_MAPPING);
  });

  it('MAP-001 — سطر معطَّل لا يزاحم السطر الفعّال', () => {
    const ds = dataset({
      concepts: [concept({ id: 10 }), concept({ id: 11 })],
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10 }),
        mapping({ id: 2, accountId: 1, conceptId: 11, isEnabled: false }),
      ],
    });
    expect(codes(ds)).not.toContain(XBRL_RULE_CODES.CONFLICTING_MAPPING);
  });

  it('عدة حسابات ← مفهوم واحد ليست تعارضًا', () => {
    const ds = dataset({
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10 }),
        mapping({ id: 2, accountId: 2, conceptId: 10 }),
        mapping({ id: 3, accountId: 3, conceptId: 10 }),
      ],
    });
    const found = codes(ds);
    expect(found).not.toContain(XBRL_RULE_CODES.CONFLICTING_MAPPING);
    expect(found).not.toContain(XBRL_RULE_CODES.INVALID_MAPPING);
  });

  it('MAP-002 — ربط بمفهوم من تصنيف آخر خطأ', () => {
    const ds = dataset({
      concepts: [concept({ id: 10, taxonomyId: 99 })],
      accountMappings: [mapping({ id: 1, accountId: 1, conceptId: 10, taxonomyId: 1 })],
    });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.INVALID_MAPPING);
  });

  it('MAP-003 — غياب تصنيف مفعَّل تنبيه', () => {
    const found = validateReadiness(dataset({ taxonomy: null })).findings
      .find((f) => f.code === XBRL_RULE_CODES.TAXONOMY_INACTIVE);
    expect(found?.severity).toBe('WARNING');
  });

  it('MAP-004 — مفهوم مطلوب بلا ربط تنبيه', () => {
    const ds = dataset({
      concepts: [concept({ id: 10 }), concept({ id: 20, isRequired: true })],
    });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.MISSING_REQUIRED_CONCEPTS);
  });

  it('MAP-004 — مفهوم مطلوب مغطّى ببند قائمة لا يُبلَّغ', () => {
    const ds = dataset({
      concepts: [concept({ id: 10 }), concept({ id: 20, isRequired: true })],
      statementMappings: [statementLine({ id: 1, conceptId: 20 })],
    });
    expect(codes(ds)).not.toContain(XBRL_RULE_CODES.MISSING_REQUIRED_CONCEPTS);
  });

  it('MAP-005 — ربط لحساب غير فعّال يتيم', () => {
    const accounts = [account({ accountId: 1, type: 'ASSET', balance: 0, isActive: false })];
    const ds = dataset({
      accounts,
      accountMappings: [mapping({ id: 7, accountId: 1, conceptId: 10 })],
    });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.ORPHAN_MAPPING);
  });

  it('MAP-006 — بند قائمة مفعَّل بلا مفهوم تنبيه', () => {
    const ds = dataset({ statementMappings: [statementLine({ id: 1, conceptId: null })] });
    expect(codes(ds)).toContain(XBRL_RULE_CODES.STATEMENT_LINE_UNMAPPED);
  });
});

describe('validateReadiness — التصنيف الرسمي', () => {
  it('EXP-001 — يُبلَّغ كمعلومة لا كتنبيه حين لا يوجد تصنيف رسمي', () => {
    const found = validateReadiness(dataset()).findings.find((f) => f.code === XBRL_RULE_CODES.NO_OFFICIAL_TAXONOMY);
    expect(found?.severity).toBe('INFO');
    expect(found?.category).toBe('EXPORT');
  });

  it('EXP-001 — يختفي متى وُجد تصنيف رسمي مثبَّت', () => {
    expect(codes(dataset({ hasOfficialTaxonomy: true }))).not.toContain(XBRL_RULE_CODES.NO_OFFICIAL_TAXONOMY);
  });

  it('التحقق يعمل كاملًا بلا أي تصنيف حكومي — لا قاعدة تعتمد على وجوده', () => {
    const result = validateReadiness(dataset({ taxonomy: null, concepts: [], accountMappings: [] }));
    expect(result.findings.length).toBeGreaterThan(0);
    // النتيجة تقرير لا قفل: حتى مع أخطاء، الدالة تُرجع بنية كاملة ولا ترمي.
    expect(result).toHaveProperty('isValid');
  });
});
