import { describe, expect, it } from 'vitest';

import { validateReadiness } from '../domain/validation.engine';
import { buildAccountRows, computeReadinessScore } from '../domain/readiness.score';
import { XBRL_READINESS_STATUS } from '../xbrl.constants';
import { account, concept, dataset, mapping } from './fixtures';

const FIVE_ACCOUNTS = [
  account({ accountId: 1, type: 'ASSET', balance: 10 }),
  account({ accountId: 2, type: 'LIABILITY', balance: -4 }),
  account({ accountId: 3, type: 'EQUITY', balance: -3 }),
  account({ accountId: 4, type: 'REVENUE', balance: -8 }),
  account({ accountId: 5, type: 'EXPENSE', balance: 5 }),
];

describe('buildAccountRows', () => {
  it('يشتق «غير مربوط» من غياب سطر الربط لا من عمود مخزَّن', () => {
    const rows = buildAccountRows(dataset({ accounts: FIVE_ACCOUNTS, accountMappings: [] }));
    expect(rows).toHaveLength(5);
    expect(rows.every((r) => r.mappingStatus === 'UNMAPPED')).toBe(true);
    expect(rows.every((r) => r.mappingId === null && r.conceptId === null)).toBe(true);
  });

  it('يستبعد الحسابات غير الفعّالة وغير المالية من جدول الربط', () => {
    const rows = buildAccountRows(
      dataset({
        accounts: [
          account({ accountId: 1, type: 'ASSET', balance: 1 }),
          account({ accountId: 2, type: 'ASSET', balance: 0, isActive: false }),
          account({ accountId: 3, type: 'SUSPENSE', balance: 0 }),
        ],
        accountMappings: [],
      }),
    );
    expect(rows.map((r) => r.accountId)).toEqual([1]);
  });

  it('يعرض رمز المفهوم وتسميته للحساب المربوط', () => {
    const rows = buildAccountRows(
      dataset({
        accounts: [account({ accountId: 1, type: 'ASSET', balance: 1 })],
        concepts: [concept({ id: 10, conceptCode: 'Assets', labelAr: 'إجمالي الأصول' })],
        accountMappings: [mapping({ id: 5, accountId: 1, conceptId: 10, notes: 'ملاحظة' })],
      }),
    );
    expect(rows[0]).toMatchObject({
      mappingStatus: 'MAPPED',
      mappingId: 5,
      conceptCode: 'Assets',
      conceptLabelAr: 'إجمالي الأصول',
      notes: 'ملاحظة',
    });
  });

  it('عدة حسابات ← مفهوم واحد: كلها تظهر مربوطة بنفس المفهوم', () => {
    const rows = buildAccountRows(
      dataset({
        accounts: FIVE_ACCOUNTS,
        concepts: [concept({ id: 10, conceptCode: 'Assets' })],
        accountMappings: FIVE_ACCOUNTS.map((a, i) => mapping({ id: i + 1, accountId: a.accountId, conceptId: 10 })),
      }),
    );
    expect(rows.every((r) => r.mappingStatus === 'MAPPED' && r.conceptCode === 'Assets')).toBe(true);
  });

  it('«يحتاج مراجعة» و«غير مطلوب» حالتان متمايزتان عن «مربوط»', () => {
    const rows = buildAccountRows(
      dataset({
        accounts: [
          account({ accountId: 1, type: 'ASSET', balance: 1 }),
          account({ accountId: 2, type: 'ASSET', balance: 1 }),
        ],
        accountMappings: [
          mapping({ id: 1, accountId: 1, conceptId: 10, status: 'NEEDS_REVIEW' }),
          mapping({ id: 2, accountId: 2, conceptId: 10, status: 'NOT_APPLICABLE', isEnabled: false }),
        ],
      }),
    );
    expect(rows.map((r) => r.mappingStatus)).toEqual(['NEEDS_REVIEW', 'NOT_APPLICABLE']);
  });
});

describe('computeReadinessScore', () => {
  const score = (ds: Parameters<typeof buildAccountRows>[0]) =>
    computeReadinessScore(buildAccountRows(ds), validateReadiness(ds), ds.hasOfficialTaxonomy);

  it('يعدّ المربوط وغير المربوط ويحسب النسبة', () => {
    const ds = dataset({
      accounts: FIVE_ACCOUNTS,
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10 }),
        mapping({ id: 2, accountId: 2, conceptId: 10 }),
      ],
    });
    const s = score(ds);
    expect(s.applicableAccounts).toBe(5);
    expect(s.mapped).toBe(2);
    expect(s.unmapped).toBe(3);
    expect(s.mappedPercentage).toBe(40);
  });

  it('الحسابات الموسومة «غير مطلوب» تخرج من مقام النسبة', () => {
    const ds = dataset({
      accounts: FIVE_ACCOUNTS,
      accountMappings: [
        mapping({ id: 1, accountId: 1, conceptId: 10 }),
        mapping({ id: 2, accountId: 2, conceptId: 10 }),
        mapping({ id: 3, accountId: 3, conceptId: 10, status: 'NOT_APPLICABLE', isEnabled: false }),
        mapping({ id: 4, accountId: 4, conceptId: 10, status: 'NOT_APPLICABLE', isEnabled: false }),
        mapping({ id: 5, accountId: 5, conceptId: 10, status: 'NOT_APPLICABLE', isEnabled: false }),
      ],
    });
    const s = score(ds);
    expect(s.notApplicable).toBe(3);
    expect(s.applicableAccounts).toBe(2);
    expect(s.mappedPercentage).toBe(100);
  });

  it('لا قسمة على صفر حين لا يوجد حساب قابل للربط', () => {
    const s = score(dataset({ accounts: [], accountMappings: [] }));
    expect(s.applicableAccounts).toBe(0);
    expect(s.mappedPercentage).toBe(0);
  });

  it('وجود خطأ يجعل الحالة NOT_READY', () => {
    const s = score(dataset({ trialBalance: { totalDebit: 1, totalCredit: 0, difference: 1, isBalanced: false } }));
    expect(s.status).toBe(XBRL_READINESS_STATUS.NOT_READY);
    expect(s.errorCount).toBeGreaterThan(0);
  });

  it('ربط ناقص بلا أخطاء يجعل الحالة IN_PROGRESS', () => {
    const s = score(dataset({ taxonomy: null, accountMappings: [] }));
    expect(s.status).toBe(XBRL_READINESS_STATUS.IN_PROGRESS);
  });

  it('أقصى حالة ممكنة هي READY_PENDING_TAXONOMY — لا حالة توافق QAYD', () => {
    const s = score(dataset({ hasOfficialTaxonomy: true }));
    expect(s.status).toBe(XBRL_READINESS_STATUS.READY_PENDING_TAXONOMY);
    expect(Object.values(XBRL_READINESS_STATUS)).not.toContain('QAYD_READY');
  });

  it('officialTaxonomyInstalled يعكس الواقع ولا يُخمَّن — false في هذه المرحلة', () => {
    expect(score(dataset()).officialTaxonomyInstalled).toBe(false);
  });
});
