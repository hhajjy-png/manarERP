import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * تقرير الشيكات — Cheques Reporting & Excel Export Pack v1.
 *
 * Pins the report's business semantics AND the consistency contract that matters
 * most: for one filter state the report selects exactly the cheques the Cheques
 * screen's own list endpoint selects, because both go through the very same
 * `buildChequeFilterWhere()`.
 */

vi.mock('../../../config/database', () => ({
  prisma: {
    cheque: { findMany: vi.fn(), count: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';
import { reportsService } from '../reports.service';
import { buildChequeFilterWhere, ChequesService } from '../../cheques/cheques.service';

const mp = prisma as any;

function cheque(over: Record<string, unknown> = {}) {
  return {
    id: 46,
    chequeNumber: '000002',
    // Stored exactly as the API stores a user-entered 2026-08-02 (UTC midnight).
    chequeDate: new Date('2026-08-02T00:00:00.000Z'),
    beneficiaryName: 'ساير طليحان العذاب',
    amount: 1370,
    currency: 'KWD',
    bankName: 'بنك الخليج',
    status: 'DRAFT',
    paymentVoucherNumber: null,
    printedAt: null,
    cancelledAt: null,
    createdAt: new Date('2026-07-30T12:57:21.772Z'),
    updatedAt: new Date('2026-07-30T12:57:21.772Z'),
    ...over,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mp.cheque.findMany.mockResolvedValue([]);
  mp.cheque.count.mockResolvedValue(0);
});

// ── Report identity & columns ────────────────────────────────────────────────

describe('cheques report — identity and columns', () => {
  it('is a known report type and is titled تقرير الشيكات', async () => {
    const r = await reportsService.build('cheques', {});
    expect(r.title).toBe('تقرير الشيكات');
  });

  it('exposes exactly the business-visible cheque columns, in table order', async () => {
    const r = await reportsService.build('cheques', {});
    expect(r.columns.map((c) => c.key)).toEqual([
      'chequeNumber', 'beneficiaryName', 'bankName', 'amount', 'chequeDate', 'status', 'paymentVoucherNumber',
    ]);
    expect(r.columns.map((c) => c.header)).toEqual([
      'رقم الشيك', 'المستفيد', 'البنك', 'المبلغ', 'تاريخ الشيك', 'الحالة', 'رقم سند الصرف',
    ]);
  });

  it('exposes NO UI-only or internal technical columns', async () => {
    const r = await reportsService.build('cheques', {});
    const keys = r.columns.map((c) => c.key);
    for (const forbidden of ['id', 'createdAt', 'updatedAt', 'printedAt', 'cancelledAt', 'currency', 'select', 'actions']) {
      expect(keys, forbidden).not.toContain(forbidden);
    }
  });

  it('formats the amount column as a 3-decimal currency column', async () => {
    const r = await reportsService.build('cheques', {});
    const amount = r.columns.find((c) => c.key === 'amount')!;
    expect(amount.numFmt).toBe('#,##0.000');
    expect(amount.format).toBe('currency');
  });
});

// ── Data source & date semantics ─────────────────────────────────────────────

describe('cheques report — data source and chequeDate', () => {
  it('reads from the cheque table and returns the real record values', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque()]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      chequeNumber: '000002',
      beneficiaryName: 'ساير طليحان العذاب',
      bankName: 'بنك الخليج',
      amount: 1370,
    });
  });

  it('takes the date from chequeDate — 02/08/2026 means 2 August 2026', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque()]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows[0].chequeDate).toBe('02/08/2026');
  });

  it('never falls back to createdAt / updatedAt / printedAt for the date', async () => {
    // createdAt is a DIFFERENT day (30/07/2026) — if it leaked in, this fails.
    mp.cheque.findMany.mockResolvedValue([cheque({ printedAt: new Date('2026-09-09T00:00:00.000Z') })]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows[0].chequeDate).toBe('02/08/2026');
    expect(r.rows[0].chequeDate).not.toBe('30/07/2026');
    expect(r.rows[0].chequeDate).not.toBe('09/09/2026');
    expect(r.rows[0]).not.toHaveProperty('createdAt');
    expect(r.rows[0]).not.toHaveProperty('printedAt');
  });

  it('never inverts day and month across the year', async () => {
    mp.cheque.findMany.mockResolvedValue([
      cheque({ chequeDate: new Date('2026-02-08T00:00:00.000Z') }),  // 8 February
      cheque({ chequeDate: new Date('2026-08-02T00:00:00.000Z') }),  // 2 August
      cheque({ chequeDate: new Date('2026-12-31T00:00:00.000Z') }),
      cheque({ chequeDate: new Date('2026-01-01T00:00:00.000Z') }),
    ]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows.map((x) => x.chequeDate)).toEqual(['08/02/2026', '02/08/2026', '31/12/2026', '01/01/2026']);
  });

  it('orders rows by the cheques module’s own default order', async () => {
    await reportsService.build('cheques', {});
    expect(mp.cheque.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }]);
  });
});

// ── Status semantics ─────────────────────────────────────────────────────────

describe('cheques report — status semantics', () => {
  it('labels DRAFT/PRINTED/CANCELLED exactly as the Cheques screen does', async () => {
    mp.cheque.findMany.mockResolvedValue([
      cheque({ status: 'DRAFT' }),
      cheque({ status: 'PRINTED' }),
      cheque({ status: 'CANCELLED' }),
    ]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows.map((x) => x.status)).toEqual(['مسودة', 'مطبوع', 'ملغي']);
  });

  it('does not reuse the feminine invoice labels', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque({ status: 'PRINTED' }), cheque({ status: 'CANCELLED' })]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows.map((x) => x.status)).not.toContain('مطبوعة');
    expect(r.rows.map((x) => x.status)).not.toContain('ملغاة');
  });

  it('passes an unknown status through untouched rather than inventing a label', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque({ status: 'SOMETHING_NEW' })]);
    const r = await reportsService.build('cheques', {});
    expect(r.rows[0].status).toBe('SOMETHING_NEW');
  });
});

// ── Filters ──────────────────────────────────────────────────────────────────

describe('cheques report — filters', () => {
  it('applies the period to chequeDate, never to another date field', async () => {
    await reportsService.build('cheques', { from: '2026-08-01', to: '2026-08-31' });
    const where = mp.cheque.findMany.mock.calls[0][0].where;
    expect(where.chequeDate).toBeDefined();
    expect(where.createdAt).toBeUndefined();
    expect(where.printedAt).toBeUndefined();
    expect(where.chequeDate.gte).toBeInstanceOf(Date);
    expect(where.chequeDate.lte.getHours()).toBe(23); // inclusive end of the local day
  });

  it('applies the status filter with the raw status value', async () => {
    await reportsService.build('cheques', { status: 'PRINTED' });
    expect(mp.cheque.findMany.mock.calls[0][0].where.status).toBe('PRINTED');
  });

  it('applies the search filter across beneficiary, cheque number and bank', async () => {
    await reportsService.build('cheques', { search: 'خليج' });
    const or = mp.cheque.findMany.mock.calls[0][0].where.OR;
    expect(or).toEqual([
      { beneficiaryName: { contains: 'خليج' } },
      { chequeNumber: { contains: 'خليج' } },
      { bankName: { contains: 'خليج' } },
    ]);
  });

  it('applies no date filter when no period is given (all periods)', async () => {
    await reportsService.build('cheques', {});
    expect(mp.cheque.findMany.mock.calls[0][0].where.chequeDate).toBeUndefined();
  });
});

// ── Total ────────────────────────────────────────────────────────────────────

describe('cheques report — total', () => {
  it('sums the amount of every matching cheque and labels it إجمالي مبالغ الشيكات', async () => {
    mp.cheque.findMany.mockResolvedValue([
      cheque({ amount: 1370 }), cheque({ amount: 5550.25 }), cheque({ amount: 90 }),
    ]);
    const r = await reportsService.build('cheques', {});
    expect(r.totalsRow).toEqual({ bankName: 'إجمالي مبالغ الشيكات', amount: 7010.25 });
  });

  it('covers the WHOLE filtered dataset — the query is never paginated', async () => {
    // 53 matching cheques across what the screen would paginate into 3 pages.
    mp.cheque.findMany.mockResolvedValue(Array.from({ length: 53 }, () => cheque({ amount: 899.755 })));
    const r = await reportsService.build('cheques', {});

    const args = mp.cheque.findMany.mock.calls[0][0];
    expect(args.skip).toBeUndefined();
    expect(args.take).toBeUndefined();
    expect(r.rows).toHaveLength(53);
    expect(r.totalsRow!.amount).toBe(47687.015);
    expect(r.subtitle).toContain('عدد الشيكات: 53');
  });

  it('rounds to the dinar’s 3 decimals', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque({ amount: 0.1 }), cheque({ amount: 0.2 })]);
    const r = await reportsService.build('cheques', {});
    expect(r.totalsRow!.amount).toBe(0.3);
  });

  it('is zero, not undefined, for an empty result', async () => {
    const r = await reportsService.build('cheques', {});
    expect(r.totalsRow!.amount).toBe(0);
    expect(r.rows).toEqual([]);
  });

  it('never renders the #…# cheque-print amount form anywhere in the report', async () => {
    mp.cheque.findMany.mockResolvedValue([cheque({ amount: 1370 })]);
    const r = await reportsService.build('cheques', {});
    expect(JSON.stringify(r)).not.toContain('#1,370');
    expect(r.rows[0].amount).toBe(1370); // a raw number, not a formatted string
  });
});

// ── Consistency contract: report selection === screen selection ──────────────

describe('consistency contract — report vs Cheques screen', () => {
  const service = new ChequesService();

  const FILTERS = [
    {},
    { status: 'PRINTED' },
    { from: '2026-08-01', to: '2026-08-31' },
    { search: 'الخليج' },
    { status: 'DRAFT', from: '2026-01-01', to: '2026-12-31', search: '000' },
  ];

  it.each(FILTERS)('report and list build an IDENTICAL where clause for %o', async (filters) => {
    await reportsService.build('cheques', filters as never);
    const reportWhere = mp.cheque.findMany.mock.calls[0][0].where;

    vi.clearAllMocks();
    mp.cheque.findMany.mockResolvedValue([]);
    mp.cheque.count.mockResolvedValue(0);
    await service.list(filters as never);
    const listWhere = mp.cheque.findMany.mock.calls[0][0].where;

    expect(reportWhere).toEqual(listWhere);
  });

  it('both routes go through the one exported filter builder', async () => {
    const filters = { status: 'PRINTED', from: '2026-08-01', to: '2026-08-31', search: 'x' };
    await reportsService.build('cheques', filters);
    expect(mp.cheque.findMany.mock.calls[0][0].where).toEqual(buildChequeFilterWhere(filters));
  });

  it('the period lower bound is LOCAL midnight on both routes (no UTC/local split)', async () => {
    // The generic reports `dateWhere()` helper would have produced UTC midnight here.
    const where = buildChequeFilterWhere({ from: '2026-08-02' });
    const gte = (where.chequeDate as { gte: Date }).gte;
    expect(gte.getHours()).toBe(0);
    expect(gte.getDate()).toBe(2);
    expect(gte.getMonth()).toBe(7); // August
    expect(gte.getFullYear()).toBe(2026);
  });
});

// ── No regression on existing reports ────────────────────────────────────────

describe('no regression — existing report types still resolve', () => {
  it('rejects an unknown report type exactly as before', async () => {
    await expect(reportsService.build('not-a-report', {})).rejects.toThrow('نوع تقرير غير معروف');
  });
});
