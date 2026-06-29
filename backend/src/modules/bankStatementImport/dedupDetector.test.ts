import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StatementTransaction } from './types.js';

// ── Prisma mock (must be hoisted before the module under test is imported) ─────

vi.mock('@config/database.js', () => ({
  prisma: {
    bankStatementTransaction: {
      findMany:  vi.fn(),
      aggregate: vi.fn(),
    },
  },
}));

import { classifyRows, buildDedupSummary } from './dedupDetector.js';
import { prisma } from '@config/database.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

const mockPrisma = prisma.bankStatementTransaction as unknown as {
  findMany:  ReturnType<typeof vi.fn>;
  aggregate: ReturnType<typeof vi.fn>;
};

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

// ── classifyRows ───────────────────────────────────────────────────────────────

describe('classifyRows', () => {
  it('returns empty array for empty input', async () => {
    const result = await classifyRows([], 'NBK');
    expect(result).toEqual([]);
    expect(mockPrisma.findMany).not.toHaveBeenCalled();
  });

  it('classifies new transactions as NEW', async () => {
    emptySnapshot();
    const rows = [tx(), tx({ description: 'Another payment', debit: 50 })];
    const result = await classifyRows(rows, 'NBK');
    expect(result.every((r) => r.category === 'NEW')).toBe(true);
  });

  it('classifies as SKIP_TRANSACTION_ID when transactionId exists in DB', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'TXN001' }]) // stage-1 query
      .mockResolvedValue([]);                                // remaining queries

    const result = await classifyRows([tx({ transactionId: 'TXN001' })], 'NBK');
    expect(result[0]?.category).toBe('SKIP_TRANSACTION_ID');
  });

  it('classifies as SKIP_REFERENCE when reference exists in DB for accountKey', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([])                       // stage-1: no transactionIds
      .mockResolvedValueOnce([])                       // stage-3: no fingerprints
      .mockResolvedValueOnce([{ reference: 'REF999' }]) // stage-2: reference hit
      .mockResolvedValue([]);                           // stage-4

    const result = await classifyRows([tx({ reference: 'REF999' })], 'NBK');
    expect(result[0]?.category).toBe('SKIP_REFERENCE');
  });

  it('classifies as SKIP_FINGERPRINT when fingerprint exists in DB', async () => {
    // We need to know what fingerprint computeFingerprint generates.
    // Import it to calculate it deterministically.
    const { computeFingerprint, buildAccountKey } = await import('./fingerprint.js');
    const row = tx({ description: 'Rent payment', debit: 200 });
    const fp  = computeFingerprint(row)!;

    mockPrisma.findMany
      .mockResolvedValueOnce([])                                    // stage-1
      .mockResolvedValueOnce([{ transactionFingerprint: fp }])      // stage-3: fingerprint hit
      .mockResolvedValueOnce([])                                    // stage-2
      .mockResolvedValue([]);

    const result = await classifyRows([row], 'NBK');
    expect(result[0]?.category).toBe('SKIP_FINGERPRINT');

    // accountKey should reflect the account
    expect(result[0]?.accountKey).toBe(buildAccountKey(row));
  });

  it('classifies as POTENTIAL_DUPLICATE when same date + amount + similar description', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([])  // stage-1
      .mockResolvedValueOnce([])  // stage-3
      .mockResolvedValueOnce([])  // stage-2
      .mockResolvedValueOnce([{   // stage-4: potential match
          statementDate: new Date('2026-01-15'),
          debit:         100,
          credit:        0,
          description:   'Monthly payment ref',  // similar to 'Monthly payment'
        }]);

    const result = await classifyRows([tx()], 'NBK');
    expect(result[0]?.category).toBe('POTENTIAL_DUPLICATE');
  });

  it('returns NEW when stage-4 description is unrelated', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([])  // stage-1
      .mockResolvedValueOnce([])  // stage-3
      .mockResolvedValueOnce([])  // stage-2
      .mockResolvedValueOnce([{   // stage-4: different description
          statementDate: new Date('2026-01-15'),
          debit:         100,
          credit:        0,
          description:   'Electricity bill',
        }]);

    const result = await classifyRows([tx()], 'NBK');
    expect(result[0]?.category).toBe('NEW');
  });

  it('returns NEW when stage-4 amount differs', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
          statementDate: new Date('2026-01-15'),
          debit:         999,  // different amount
          credit:        0,
          description:   'Monthly payment',
        }]);

    const result = await classifyRows([tx()], 'NBK');
    expect(result[0]?.category).toBe('NEW');
  });

  it('processes multiple rows independently', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'TXN_A' }])  // stage-1: one dupe
      .mockResolvedValue([]);

    const rows = [
      tx({ transactionId: 'TXN_A' }),  // dupe
      tx({ transactionId: 'TXN_B' }),  // new
    ];
    const result = await classifyRows(rows, 'NBK');
    expect(result[0]?.category).toBe('SKIP_TRANSACTION_ID');
    expect(result[1]?.category).toBe('NEW');
  });
});

// ── buildDedupSummary ──────────────────────────────────────────────────────────

describe('buildDedupSummary', () => {
  it('returns correct counts for a mixed batch', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'TXN_X' }])  // stage-1
      .mockResolvedValue([]);

    const rows = [
      tx({ transactionId: 'TXN_X' }),  // SKIP_TRANSACTION_ID
      tx({ transactionId: 'TXN_Y' }),  // NEW
      tx({ debit: 50 }),               // NEW
    ];

    const summary = await buildDedupSummary(rows, 'NBK');

    expect(summary.totalInFile).toBe(3);
    expect(summary.wouldInsert).toBe(2);
    expect(summary.wouldSkipExact).toBe(1);
    expect(summary.wouldSkipPotential).toBe(0);
    expect(summary.newDataRate).toBeCloseTo(2 / 3);
    expect(summary.duplicateRate).toBeCloseTo(1 / 3);
  });

  it('handles all-new batch', async () => {
    emptySnapshot();
    const rows = [tx(), tx({ debit: 200 })];
    const summary = await buildDedupSummary(rows, 'NBK');
    expect(summary.wouldInsert).toBe(2);
    expect(summary.wouldSkipExact).toBe(0);
    expect(summary.duplicateRate).toBe(0);
    expect(summary.newDataRate).toBe(1);
  });

  it('handles all-duplicate batch', async () => {
    mockPrisma.findMany
      .mockResolvedValueOnce([{ transactionId: 'A' }, { transactionId: 'B' }])
      .mockResolvedValue([]);

    const rows = [tx({ transactionId: 'A' }), tx({ transactionId: 'B' })];
    const summary = await buildDedupSummary(rows, 'NBK');
    expect(summary.wouldInsert).toBe(0);
    expect(summary.wouldSkipExact).toBe(2);
    expect(summary.duplicateRate).toBe(1);
    expect(summary.newDataRate).toBe(0);
  });
});
