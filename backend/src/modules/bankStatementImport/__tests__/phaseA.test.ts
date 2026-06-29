/**
 * Bank Statement Import — Phase A engine tests
 *
 * Covers:
 *  - buildCoverageSummary: FULLY_DUPLICATE / OVERLAPPING / GAP_BEFORE / GAP_AFTER scenarios
 *  - Zero-new scenario: all rows classified as duplicates → wouldInsert = 0, graceful result
 *  - Session summary counts: mixed batch reports correct counts and rates
 *  - Incremental import: overlapping file is handled safely (only new rows counted)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatementTransaction } from '../types.js';

// ── Prisma mock (must be hoisted) ──────────────────────────────────────────────

vi.mock('@config/database.js', () => ({
  prisma: {
    bankStatementTransaction: {
      findMany:  vi.fn(),
      aggregate: vi.fn(),
      count:     vi.fn(),
    },
    bankStatementImport: {
      count: vi.fn(),
    },
  },
}));

import { buildCoverageSummary, buildDedupSummary } from '../dedupDetector.js';
import { prisma } from '@config/database.js';

const mockPrisma = prisma.bankStatementTransaction as unknown as {
  findMany:  ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function tx(overrides: Partial<StatementTransaction> = {}): StatementTransaction {
  return {
    transactionId:  null,
    bankName:       'NBK',
    statementDate:  '2026-01-15',
    postingDate:    null,
    description:    'Monthly payment',
    reference:      null,
    debit:          100,
    credit:         0,
    balance:        null,
    currency:       'KWD',
    accountNumber:  '123456',
    iban:           null,
    chequeNumber:   null,
    rawRow:         {},
    ...overrides,
  };
}

function emptySnapshot() {
  // findMany called 4 times: txIds, fingerprints, references, potentials
  mockPrisma.findMany.mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── buildCoverageSummary ───────────────────────────────────────────────────────

describe('buildCoverageSummary — coverage warning scenarios', () => {
  it('returns hasExisting=false and no warning when DB is empty', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min: { statementDate: null }, _max: { statementDate: null }, _count: { id: 0 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-01-01', '2026-01-31');
    expect(cs.hasExisting).toBe(false);
    expect(cs.coverageWarning).toBeNull();
    expect(cs.existingCount).toBe(0);
  });

  it('emits FULLY_DUPLICATE when import range is entirely inside existing range', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2025-10-01') },
      _max:   { statementDate: new Date('2026-03-31') },
      _count: { id: 150 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-01-01', '2026-01-31');
    expect(cs.hasExisting).toBe(true);
    expect(cs.coverageWarning).toBe('FULLY_DUPLICATE');
    expect(cs.isFullyContained).toBe(true);
  });

  it('emits GAP_BEFORE when import starts before existing coverage', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2026-02-01') },
      _max:   { statementDate: new Date('2026-06-30') },
      _count: { id: 80 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-01-01', '2026-02-28');
    expect(cs.coverageWarning).toBe('GAP_BEFORE');
    expect(cs.isFullyContained).toBe(false);
  });

  it('emits OVERLAPPING when import extends beyond existing end with partial overlap', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2026-01-01') },
      _max:   { statementDate: new Date('2026-05-31') },
      _count: { id: 120 },
    });
    // Apr–Jun overlaps May and extends into Jun (beyond existing May end)
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-04-01', '2026-06-30');
    expect(cs.coverageWarning).toBe('OVERLAPPING');
    expect(cs.isFullyContained).toBe(false);
  });

  it('emits GAP_AFTER when import starts after existing coverage end', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2025-01-01') },
      _max:   { statementDate: new Date('2025-12-31') },
      _count: { id: 200 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-01-01', '2026-06-30');
    expect(cs.coverageWarning).toBe('GAP_AFTER');
    expect(cs.isFullyContained).toBe(false);
  });

  it('returns no warning when importFrom/importTo are omitted', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2026-01-01') },
      _max:   { statementDate: new Date('2026-06-30') },
      _count: { id: 50 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST');
    expect(cs.hasExisting).toBe(true);
    expect(cs.coverageWarning).toBeNull();
  });

  it('populates existingFrom, existingTo, importFrom, importTo correctly', async () => {
    (prisma.bankStatementTransaction.aggregate as ReturnType<typeof vi.fn>).mockResolvedValue({
      _min:   { statementDate: new Date('2026-01-15') },
      _max:   { statementDate: new Date('2026-06-15') },
      _count: { id: 42 },
    });
    const cs = await buildCoverageSummary('IBAN:KW81TEST', '2026-04-01', '2026-04-30');
    expect(cs.existingFrom).toBe('2026-01-15');
    expect(cs.existingTo).toBe('2026-06-15');
    expect(cs.existingCount).toBe(42);
    expect(cs.importFrom).toBe('2026-04-01');
    expect(cs.importTo).toBe('2026-04-30');
  });
});

// ── Zero-new scenario via buildDedupSummary ────────────────────────────────────

describe('buildDedupSummary — zero-new scenario (all duplicates)', () => {
  it('returns wouldInsert=0 when every row has a matching transactionId in DB', async () => {
    // Stage 1: all transactionIds found in DB
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'TX-A' }, { transactionId: 'TX-B' }, { transactionId: 'TX-C' }])
      .mockResolvedValue([]);

    const rows = [
      tx({ transactionId: 'TX-A', debit: 100 }),
      tx({ transactionId: 'TX-B', debit: 200 }),
      tx({ transactionId: 'TX-C', debit: 300 }),
    ];

    const summary = await buildDedupSummary(rows, 'NBK');

    expect(summary.wouldInsert).toBe(0);
    expect(summary.wouldSkipExact).toBe(3);
    expect(summary.wouldSkipPotential).toBe(0);
    expect(summary.totalInFile).toBe(3);
    expect(summary.duplicateRate).toBe(1);
    expect(summary.newDataRate).toBe(0);
  });

  it('returns wouldInsert=0 when every row matches by fingerprint', async () => {
    const { computeFingerprint } = await import('../fingerprint.js');
    const row1 = tx({ description: 'Wire transfer',  debit: 500 });
    const row2 = tx({ description: 'Salary payment', debit: 1200 });
    const fp1  = computeFingerprint(row1)!;
    const fp2  = computeFingerprint(row2)!;

    mockPrisma.findMany
      .mockResolvedValueOnce([])                                                   // stage-1: no txIds
      .mockResolvedValueOnce([{ transactionFingerprint: fp1 }, { transactionFingerprint: fp2 }]) // stage-3: fingerprint hits
      .mockResolvedValue([]);

    const summary = await buildDedupSummary([row1, row2], 'NBK');

    expect(summary.wouldInsert).toBe(0);
    expect(summary.wouldSkipExact).toBe(2);
    expect(summary.totalInFile).toBe(2);
    expect(summary.newDataRate).toBe(0);
  });
});

// ── Session summary counts ─────────────────────────────────────────────────────

describe('buildDedupSummary — session summary count accuracy', () => {
  it('counts correctly for an all-new batch', async () => {
    emptySnapshot();
    const rows = [
      tx({ debit: 100 }),
      tx({ debit: 200 }),
      tx({ debit: 300 }),
    ];
    const summary = await buildDedupSummary(rows, 'NBK');
    expect(summary.wouldInsert).toBe(3);
    expect(summary.wouldSkipExact).toBe(0);
    expect(summary.wouldSkipPotential).toBe(0);
    expect(summary.duplicateRate).toBe(0);
    expect(summary.newDataRate).toBe(1);
  });

  it('handles a 50/50 split correctly (overlapping file scenario)', async () => {
    // 2 known duplicates via transactionId
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'TX-OLD-1' }, { transactionId: 'TX-OLD-2' }])
      .mockResolvedValue([]);

    const rows = [
      tx({ transactionId: 'TX-OLD-1', debit: 100 }),  // duplicate
      tx({ transactionId: 'TX-OLD-2', debit: 200 }),  // duplicate
      tx({ transactionId: 'TX-NEW-A', debit: 300 }),  // new
      tx({ transactionId: 'TX-NEW-B', debit: 400 }),  // new
    ];

    const summary = await buildDedupSummary(rows, 'NBK');

    expect(summary.totalInFile).toBe(4);
    expect(summary.wouldInsert).toBe(2);
    expect(summary.wouldSkipExact).toBe(2);
    expect(summary.newDataRate).toBeCloseTo(0.5);
    expect(summary.duplicateRate).toBeCloseTo(0.5);
  });

  it('counts potential duplicates separately from exact duplicates', async () => {
    // Stage 1 + 3 + 2 return nothing; stage 4 finds a potential match
    mockPrisma.findMany
      .mockResolvedValueOnce([])  // stage-1
      .mockResolvedValueOnce([])  // stage-3
      .mockResolvedValueOnce([])  // stage-2
      .mockResolvedValueOnce([{   // stage-4: potential match
          statementDate: new Date('2026-01-15'),
          debit:         100,
          credit:        0,
          description:   'Monthly payment ref',  // similar to default 'Monthly payment'
        }])
      .mockResolvedValue([]);

    const rows = [tx()]; // default tx matches the stage-4 entry

    const summary = await buildDedupSummary(rows, 'NBK');

    expect(summary.wouldSkipPotential).toBe(1);
    expect(summary.wouldSkipExact).toBe(0);
    expect(summary.wouldInsert).toBe(0);
  });
});

// ── Incremental import: overlapping file stays safe ──────────────────────────

describe('buildDedupSummary — incremental import with overlapping statement', () => {
  it('only counts genuinely new transactions as wouldInsert', async () => {
    // Simulate: Jan–Mar 2026 statement where Jan and Feb exist, Mar is new
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'JAN-01' }, { transactionId: 'FEB-01' }]) // stage-1
      .mockResolvedValue([]);

    const rows = [
      tx({ transactionId: 'JAN-01', statementDate: '2026-01-10', debit: 100 }),
      tx({ transactionId: 'FEB-01', statementDate: '2026-02-10', debit: 200 }),
      tx({ transactionId: 'MAR-01', statementDate: '2026-03-10', debit: 300 }),  // new
    ];

    const summary = await buildDedupSummary(rows, 'NBK');

    expect(summary.wouldInsert).toBe(1);         // only MAR-01
    expect(summary.wouldSkipExact).toBe(2);      // JAN-01 + FEB-01
    expect(summary.totalInFile).toBe(3);
    expect(summary.newDataRate).toBeCloseTo(1 / 3);
    expect(summary.duplicateRate).toBeCloseTo(2 / 3);
  });
});
