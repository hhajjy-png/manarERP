import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  detectBankTemplate,
  rowToTransaction,
  parseExcelRows,
  parseCsvRows,
  detectCsvDelimiter,
  STATEMENT_CONFIGS,
} from '../parser.js';
import { normalizeRow, buildNormalizedText } from '../normalizer.js';
import {
  validateRows,
  detectFileDuplicates,
  checkBalanceContinuity,
} from '../validators.js';
import { detectBankFee } from '../bankFeeDetector.js';
import { matchTransaction, type MatcherContext } from '../matcher.js';
import {
  generatePostingSuggestions,
} from '../postingSuggestions.js';
import { isTransitionAllowed } from '../reconciliationEngine.js';
import type { StatementTransaction, ReconciliationTransaction } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeTx(overrides: Partial<StatementTransaction> = {}): StatementTransaction {
  return {
    transactionId:  'TX-001',
    bankName:       'NBK',
    statementDate:  '2026-06-01',
    postingDate:    '2026-06-01',
    description:    'شراء بضائع',
    reference:      'REF-001',
    debit:          100.000,
    credit:         0,
    balance:        5000.000,
    currency:       'KWD',
    accountNumber:  '123456',
    iban:           'KW81CBKU0000000000001234560101',
    chequeNumber:   null,
    rawRow:         {},
    ...overrides,
  };
}

function makeCtx(overrides: Partial<MatcherContext> = {}): MatcherContext {
  return {
    invoices:  [],
    payments:  [],
    expenses:  [],
    journals:  [],
    cheques:   [],
    payrolls:  [], // PayrollRecord: { id, month, year, netSalary }
    ...overrides,
  };
}

// ── Parser: detectBankTemplate ────────────────────────────────────────────────

describe('detectBankTemplate', () => {
  it('detects NBK by Cheque No header', () => {
    const tpl = detectBankTemplate(['Date', 'Value Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Cheque No', 'Currency']);
    expect(tpl.bankName).toBe('NBK');
  });

  it('detects KFH by Narration header', () => {
    const tpl = detectBankTemplate(['Transaction Date', 'Posting Date', 'Narration', 'Reference Number', 'Debit Amount', 'Credit Amount', 'Running Balance']);
    expect(tpl.bankName).toBe('KFH');
  });

  it('detects GULF_BANK by Txn Date header', () => {
    const tpl = detectBankTemplate(['Txn Date', 'Value Date', 'Transaction Description', 'Ref No', 'Amount', 'Balance', 'CCY']);
    expect(tpl.bankName).toBe('GULF_BANK');
  });

  it('detects BOUBYAN by Withdrawal header', () => {
    const tpl = detectBankTemplate(['Seq No', 'Date', 'Details', 'Reference', 'Withdrawal', 'Deposit', 'Balance']);
    expect(tpl.bankName).toBe('BOUBYAN');
  });

  it('detects AHLI_UNITED by Trans ID header', () => {
    const tpl = detectBankTemplate(['Trans ID', 'Trans Date', 'Value Date', 'Remarks', 'Cheque/Ref No', 'Debit', 'Credit', 'Balance', 'Currency']);
    expect(tpl.bankName).toBe('AHLI_UNITED');
  });

  it('falls back to UNKNOWN for unrecognized headers', () => {
    const tpl = detectBankTemplate(['Col1', 'Col2', 'Col3']);
    expect(tpl.bankName).toBe('UNKNOWN');
  });
});

// ── Parser: detectCsvDelimiter ────────────────────────────────────────────────

describe('detectCsvDelimiter', () => {
  it('detects comma delimiter', () => {
    expect(detectCsvDelimiter('a,b,c,d')).toBe(',');
  });
  it('detects semicolon delimiter', () => {
    expect(detectCsvDelimiter('a;b;c;d')).toBe(';');
  });
  it('detects tab delimiter', () => {
    expect(detectCsvDelimiter('a\tb\tc\td')).toBe('\t');
  });
});

// ── Parser: rowToTransaction ──────────────────────────────────────────────────

describe('rowToTransaction', () => {
  const colMap = STATEMENT_CONFIGS.NBK.columnMap;

  it('converts a normal row', () => {
    const raw = {
      'Date':          '01/06/2026',
      'Value Date':    '01/06/2026',
      'Description':   'Test payment',
      'Reference':     'REF-123',
      'Debit':         '100.000',
      'Credit':        '',
      'Balance':       '4900.000',
      'Currency':      'KWD',
      'Cheque No':     '',
      'Transaction ID': 'TX-100',
    };
    const tx = rowToTransaction(raw, colMap, 'NBK', 'KWD');
    expect(tx.description).toBe('Test payment');
    expect(tx.debit).toBe(100);
    expect(tx.credit).toBe(0);
    expect(tx.statementDate).toBe('2026-06-01');
    expect(tx.currency).toBe('KWD');
    expect(tx.transactionId).toBe('TX-100');
  });

  it('handles empty row gracefully', () => {
    const raw = { 'Date': '', 'Description': '', 'Debit': '', 'Credit': '', 'Balance': '' };
    const tx = rowToTransaction(raw, colMap, 'NBK', 'KWD');
    expect(tx.debit).toBe(0);
    expect(tx.credit).toBe(0);
    expect(tx.statementDate).toBeNull();
  });

  it('parses Excel date serial numbers', () => {
    const raw = { 'Date': 46100, 'Description': 'test', 'Debit': '0', 'Credit': '50', 'Balance': '5000' };
    const tx = rowToTransaction(raw, colMap, 'NBK', 'KWD');
    expect(tx.statementDate).toBeTruthy();
    expect(tx.statementDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('uses currency default when cell is empty', () => {
    const raw = { 'Date': '01/06/2026', 'Description': 'test', 'Debit': '10', 'Credit': '0', 'Balance': '100', 'Currency': '' };
    const tx = rowToTransaction(raw, colMap, 'NBK', 'KWD');
    expect(tx.currency).toBe('KWD');
  });

  it('handles signed amount column (GULF_BANK style)', () => {
    const gulfColMap = STATEMENT_CONFIGS.GULF_BANK.columnMap;
    const raw = { 'Txn Date': '01/06/2026', 'Transaction Description': 'fee', 'Amount': '-200.000', 'Balance': '800' };
    const tx = rowToTransaction(raw, gulfColMap, 'GULF_BANK', 'KWD');
    expect(tx.debit).toBe(200);
    expect(tx.credit).toBe(0);
  });

  it('handles positive signed amount as credit', () => {
    const gulfColMap = STATEMENT_CONFIGS.GULF_BANK.columnMap;
    const raw = { 'Txn Date': '01/06/2026', 'Transaction Description': 'deposit', 'Amount': '500.000', 'Balance': '1300' };
    const tx = rowToTransaction(raw, gulfColMap, 'GULF_BANK', 'KWD');
    expect(tx.credit).toBe(500);
    expect(tx.debit).toBe(0);
  });
});

// ── Parser: parseExcelRows ────────────────────────────────────────────────────

describe('parseExcelRows', () => {
  const tpl = STATEMENT_CONFIGS.NBK;

  it('parses well-formed sheet data', () => {
    const sheet = [
      ['Date', 'Value Date', 'Description', 'Reference', 'Debit', 'Credit', 'Balance', 'Currency', 'Cheque No', 'Transaction ID'],
      ['01/06/2026', '01/06/2026', 'Purchase', 'REF-1', '100', '', '4900', 'KWD', '', 'TX-1'],
      ['02/06/2026', '02/06/2026', 'Deposit',  'REF-2', '',    '500', '5400', 'KWD', '', 'TX-2'],
    ];
    const rows = parseExcelRows(sheet, tpl);
    expect(rows).toHaveLength(2);
    expect(rows[0].debit).toBe(100);
    expect(rows[1].credit).toBe(500);
  });

  it('skips empty rows', () => {
    const sheet = [
      ['Date', 'Description', 'Debit', 'Credit', 'Balance'],
      ['01/06/2026', 'Valid', '100', '', '900'],
      [null, null, null, null, null],
      ['', '', '', '', ''],
    ];
    const rows = parseExcelRows(sheet, tpl);
    expect(rows.length).toBeLessThanOrEqual(1);
  });
});

// ── Parser: parseCsvRows ──────────────────────────────────────────────────────

describe('parseCsvRows', () => {
  const tpl = STATEMENT_CONFIGS.NBK;

  it('parses comma-delimited CSV', () => {
    const csv = [
      'Date,Value Date,Description,Reference,Debit,Credit,Balance,Currency,Cheque No,Transaction ID',
      '01/06/2026,01/06/2026,Test purchase,REF-1,100.000,,4900.000,KWD,,TX-1',
    ].join('\n');
    const rows = parseCsvRows(csv, tpl);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit).toBe(100);
    expect(rows[0].description).toBe('Test purchase');
  });

  it('parses semicolon-delimited CSV', () => {
    const csv = [
      'Date;Description;Debit;Credit;Balance',
      '01/06/2026;Fee;50;0;950',
    ].join('\n');
    const rows = parseCsvRows(csv, tpl);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit).toBe(50);
  });
});

// ── Normalizer ────────────────────────────────────────────────────────────────

describe('normalizeRow', () => {
  it('trims and limits description', () => {
    const tx = makeTx({ description: '  ' + 'A'.repeat(600) + '  ' });
    const norm = normalizeRow(tx);
    expect(norm.description.length).toBeLessThanOrEqual(500);
    expect(norm.description).not.toMatch(/^\s|\s$/);
  });

  it('uppercases currency', () => {
    const tx = makeTx({ currency: 'kwd' });
    expect(normalizeRow(tx).currency).toBe('KWD');
  });

  it('uppercases IBAN', () => {
    const tx = makeTx({ iban: 'kw81cbku0000000000001234560101' });
    expect(normalizeRow(tx).iban).toBe('KW81CBKU0000000000001234560101');
  });

  it('rounds KWD amounts to 3 decimal places', () => {
    const tx = makeTx({ debit: 100.12345, credit: 0 });
    expect(normalizeRow(tx).debit).toBe(100.123);
  });

  it('sets currency to KWD when empty', () => {
    const tx = makeTx({ currency: '' });
    expect(normalizeRow(tx).currency).toBe('KWD');
  });
});

describe('buildNormalizedText', () => {
  it('combines description, reference, and transactionId', () => {
    const tx = makeTx({ description: 'Test DESC', reference: 'REF-001', transactionId: 'TX-123' });
    const text = buildNormalizedText(tx);
    expect(text).toContain('test desc');
    expect(text).toContain('ref-001');
    expect(text).toContain('tx-123');
  });

  it('excludes null fields', () => {
    const tx = makeTx({ reference: null, transactionId: null, chequeNumber: null });
    const text = buildNormalizedText(tx);
    expect(text).not.toContain('null');
  });
});

// ── Validators ────────────────────────────────────────────────────────────────

describe('validateRows — individual rules', () => {
  it('reports INVALID_DATE for missing date', () => {
    const row = makeTx({ statementDate: null });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('INVALID_DATE');
  });

  it('reports INVALID_DATE for pre-2000 date', () => {
    const row = makeTx({ statementDate: '1999-12-31' });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('INVALID_DATE');
  });

  it('reports INVALID_CURRENCY for unknown currency', () => {
    const row = makeTx({ currency: 'XYZ' });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('INVALID_CURRENCY');
  });

  it('accepts known currencies', () => {
    for (const cur of ['KWD', 'USD', 'EUR', 'SAR', 'AED']) {
      const row = makeTx({ currency: cur });
      const [val] = validateRows([row]);
      expect(val.errors).not.toContain('INVALID_CURRENCY');
    }
  });

  it('reports NEGATIVE_AMOUNT for negative debit', () => {
    const row = makeTx({ debit: -10 });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('NEGATIVE_AMOUNT');
  });

  it('reports ZERO_AMOUNT when both debit and credit are 0', () => {
    const row = makeTx({ debit: 0, credit: 0 });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('ZERO_AMOUNT');
  });

  it('reports MISSING_DESCRIPTION for empty description', () => {
    const row = makeTx({ description: '' });
    const [val] = validateRows([row]);
    expect(val.errors).toContain('MISSING_DESCRIPTION');
  });

  it('warns MISSING_TRANSACTION_ID when transactionId is null', () => {
    const row = makeTx({ transactionId: null });
    const [val] = validateRows([row]);
    expect(val.warnings).toContain('MISSING_TRANSACTION_ID');
  });

  it('warns DESCRIPTION_TOO_LONG for very long description', () => {
    const row = makeTx({ description: 'A'.repeat(501) });
    const [val] = validateRows([row]);
    expect(val.warnings).toContain('DESCRIPTION_TOO_LONG');
  });

  it('passes a clean row with no errors', () => {
    const row = makeTx();
    const [val] = validateRows([row]);
    expect(val.errors).toHaveLength(0);
  });
});

describe('detectFileDuplicates', () => {
  it('detects duplicate rows (same date + amount + description)', () => {
    const rows = [
      makeTx({ statementDate: '2026-06-01', debit: 100, description: 'Purchase' }),
      makeTx({ statementDate: '2026-06-01', debit: 100, description: 'Purchase' }),
      makeTx({ statementDate: '2026-06-02', debit: 200, description: 'Another' }),
    ];
    const dups = detectFileDuplicates(rows);
    expect(dups.has(0)).toBe(true);
    expect(dups.has(1)).toBe(true);
    expect(dups.has(2)).toBe(false);
  });

  it('returns empty set when no duplicates', () => {
    const rows = [
      makeTx({ statementDate: '2026-06-01', debit: 100, description: 'A' }),
      makeTx({ statementDate: '2026-06-02', debit: 200, description: 'B' }),
    ];
    expect(detectFileDuplicates(rows).size).toBe(0);
  });

  it('uses transactionId as tie-breaker', () => {
    const rows = [
      makeTx({ statementDate: '2026-06-01', debit: 100, description: 'Test', transactionId: 'TX-A' }),
      makeTx({ statementDate: '2026-06-01', debit: 100, description: 'Test', transactionId: 'TX-B' }),
    ];
    // Different transactionIds → not duplicates
    expect(detectFileDuplicates(rows).size).toBe(0);
  });
});

describe('checkBalanceContinuity', () => {
  it('detects balance break', () => {
    const rows = [
      makeTx({ debit: 100, credit: 0, balance: 4900 }),
      makeTx({ debit: 0, credit: 50,  balance: 5000 }), // expected 4950, got 5000 → break
    ];
    const breaks = checkBalanceContinuity(rows);
    expect(breaks.has(1)).toBe(true);
  });

  it('accepts correct running balance', () => {
    const rows = [
      makeTx({ debit: 100, credit: 0, balance: 4900 }),
      makeTx({ debit: 0, credit: 50,  balance: 4950 }),
      makeTx({ debit: 200, credit: 0,  balance: 4750 }),
    ];
    const breaks = checkBalanceContinuity(rows);
    expect(breaks.size).toBe(0);
  });

  it('skips continuity check when balance is null', () => {
    const rows = [
      makeTx({ debit: 100, credit: 0, balance: null }),
      makeTx({ debit: 0,   credit: 50, balance: null }),
    ];
    expect(checkBalanceContinuity(rows).size).toBe(0);
  });
});

// ── BankFeeDetector ───────────────────────────────────────────────────────────

describe('detectBankFee', () => {
  it('detects TRANSFER_FEE from Arabic description', () => {
    const r = detectBankFee('رسوم تحويل', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('TRANSFER_FEE');
  });

  it('detects MONTHLY_FEE from English description', () => {
    const r = detectBankFee('Monthly service charge', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('MONTHLY_FEE');
  });

  it('detects INTEREST', () => {
    const r = detectBankFee('Interest payment on account', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('INTEREST');
  });

  it('detects ATM_FEE', () => {
    const r = detectBankFee('ATM fee withdrawal', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('ATM_FEE');
  });

  it('detects CHEQUEBOOK_FEE', () => {
    const r = detectBankFee('Chequebook issuance fee', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('CHEQUEBOOK_FEE');
  });

  it('detects CHARGE from bank charge pattern', () => {
    const r = detectBankFee('Bank charge - processing', null);
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('CHARGE');
  });

  it('returns false for regular transaction', () => {
    const r = detectBankFee('Payment to supplier ABC', null);
    expect(r.isBankFee).toBe(false);
    expect(r.bankFeeType).toBeNull();
  });

  it('checks reference field too', () => {
    const r = detectBankFee('Payment', 'transfer fee Q2');
    expect(r.isBankFee).toBe(true);
    expect(r.bankFeeType).toBe('TRANSFER_FEE');
  });
});

// ── Matcher ───────────────────────────────────────────────────────────────────

describe('matchTransaction', () => {
  it('matches cheque number at confidence 100', () => {
    const tx = makeTx({ chequeNumber: 'CHQ-001', debit: 500 });
    const ctx = makeCtx({ cheques: [{ id: 1, chequeNumber: 'CHQ-001', amount: 500 }] });
    const result = matchTransaction(tx, ctx);
    expect(result.best?.confidence).toBe(100);
    expect(result.best?.type).toBe('cheque');
  });

  it('matches transactionId against payment reference at confidence 100', () => {
    const tx = makeTx({ transactionId: 'TX-PAY-999' });
    const ctx = makeCtx({ payments: [{ id: 5, reference: 'TX-PAY-999', amount: 100, invoiceId: 1 }] });
    const result = matchTransaction(tx, ctx);
    expect(result.best?.confidence).toBe(100);
    expect(result.best?.type).toBe('payment');
  });

  it('matches invoice number in description at confidence 90', () => {
    const tx = makeTx({ description: 'دفع الفاتورة INV-2026-001', chequeNumber: null, transactionId: null });
    const ctx = makeCtx({ invoices: [{ id: 10, invoiceNumber: 'INV-2026-001', total: 100 }] });
    const result = matchTransaction(tx, ctx);
    expect(result.best?.confidence).toBe(90);
    expect(result.best?.type).toBe('invoice');
  });

  it('matches by amount at confidence 75', () => {
    const tx = makeTx({ debit: 1500, chequeNumber: null, transactionId: null, description: 'Generic payment' });
    const ctx = makeCtx({ invoices: [{ id: 7, invoiceNumber: 'INV-777', total: 1500 }] });
    const result = matchTransaction(tx, ctx);
    expect(result.best?.confidence).toBe(75);
  });

  it('returns null best when no match', () => {
    const tx = makeTx({ debit: 99999, chequeNumber: null, transactionId: null });
    const ctx = makeCtx();
    const result = matchTransaction(tx, ctx);
    expect(result.best).toBeNull();
  });

  it('prefers higher confidence when multiple matches exist', () => {
    const tx = makeTx({ chequeNumber: 'CHQ-100', description: 'INV-100 payment', debit: 500 });
    const ctx = makeCtx({
      cheques:  [{ id: 1, chequeNumber: 'CHQ-100', amount: 500 }],
      invoices: [{ id: 2, invoiceNumber: 'INV-100', total: 500 }],
    });
    const result = matchTransaction(tx, ctx);
    // Cheque exact match (100) should win over invoice ref (90)
    expect(result.best?.confidence).toBe(100);
    expect(result.best?.type).toBe('cheque');
  });

  it('deduplicates candidates per (type, id)', () => {
    // Both transactionId and description reference the same invoice → only one candidate
    const tx = makeTx({ transactionId: null, description: 'INV-001 INV-001 double mention', chequeNumber: null });
    const ctx = makeCtx({ invoices: [{ id: 1, invoiceNumber: 'INV-001', total: 999 }] });
    const result = matchTransaction(tx, ctx);
    const invoiceCandidates = result.candidates.filter((c) => c.type === 'invoice' && c.id === 1);
    expect(invoiceCandidates).toHaveLength(1);
  });
});

// ── Posting Suggestions ───────────────────────────────────────────────────────

function makeReconTx(overrides: Partial<ReconciliationTransaction> = {}): ReconciliationTransaction {
  return {
    id:              1,
    importId:        1,
    transactionId:   null,
    bankName:        'NBK',
    statementDate:   '2026-06-01',
    postingDate:     null,
    description:     'Test tx',
    reference:       null,
    debit:           100,
    credit:          0,
    balance:         null,
    currency:        'KWD',
    chequeNumber:    null,
    reconcileStatus: 'UNMATCHED',
    matchedType:     null,
    matchedId:       null,
    matchedRef:      null,
    matchConfidence: null,
    isDuplicate:     false,
    isBankFee:       false,
    bankFeeType:     null,
    errors:          [],
    warnings:        [],
    ...overrides,
  };
}

describe('generatePostingSuggestions', () => {
  it('suggests INVOICE_PAYMENT for matched invoice', () => {
    const tx = makeReconTx({
      matchedType:     'invoice',
      matchedId:       5,
      matchedRef:      'INV-005',
      matchConfidence: 90,
    });
    const suggestions = generatePostingSuggestions(tx);
    const inv = suggestions.find((s) => s.type === 'INVOICE_PAYMENT');
    expect(inv).toBeTruthy();
    expect(inv?.linkedRef).toBe('INV-005');
  });

  it('suggests EXPENSE_LINK for matched expense', () => {
    const tx = makeReconTx({
      matchedType:     'expense',
      matchedId:       3,
      matchedRef:      'EXP-003',
      matchConfidence: 75,
    });
    const suggestions = generatePostingSuggestions(tx);
    expect(suggestions.find((s) => s.type === 'EXPENSE_LINK')).toBeTruthy();
  });

  it('suggests JOURNAL_ENTRY for bank fee', () => {
    const tx = makeReconTx({ isBankFee: true, bankFeeType: 'TRANSFER_FEE' });
    const suggestions = generatePostingSuggestions(tx);
    expect(suggestions.find((s) => s.type === 'JOURNAL_ENTRY')).toBeTruthy();
  });

  it('suggests JOURNAL_ENTRY for unmatched credit (incoming payment)', () => {
    const tx = makeReconTx({ debit: 0, credit: 500 });
    const suggestions = generatePostingSuggestions(tx);
    expect(suggestions.find((s) => s.type === 'JOURNAL_ENTRY')).toBeTruthy();
  });

  it('suggests EXPENSE_LINK for unmatched debit (outgoing)', () => {
    const tx = makeReconTx({ debit: 200, credit: 0 });
    const suggestions = generatePostingSuggestions(tx);
    expect(suggestions.find((s) => s.type === 'EXPENSE_LINK')).toBeTruthy();
  });

  it('always includes IGNORE option', () => {
    const tx = makeReconTx();
    const suggestions = generatePostingSuggestions(tx);
    expect(suggestions.find((s) => s.type === 'IGNORE')).toBeTruthy();
  });
});

// ── ReconciliationEngine: status transitions ──────────────────────────────────

describe('isTransitionAllowed', () => {
  it('allows UNMATCHED → MATCHED', () => {
    expect(isTransitionAllowed('UNMATCHED', 'MATCHED')).toBe(true);
  });
  it('allows UNMATCHED → IGNORED', () => {
    expect(isTransitionAllowed('UNMATCHED', 'IGNORED')).toBe(true);
  });
  it('allows MATCHED → UNMATCHED', () => {
    expect(isTransitionAllowed('MATCHED', 'UNMATCHED')).toBe(true);
  });
  it('allows REVIEW → MATCHED', () => {
    expect(isTransitionAllowed('REVIEW', 'MATCHED')).toBe(true);
  });
  it('allows DUPLICATE → IGNORED', () => {
    expect(isTransitionAllowed('DUPLICATE', 'IGNORED')).toBe(true);
  });
  it('disallows MATCHED → DUPLICATE', () => {
    expect(isTransitionAllowed('MATCHED', 'DUPLICATE')).toBe(false);
  });
  it('disallows same-state transition (UNMATCHED → UNMATCHED) not in allowed list', () => {
    // UNMATCHED can go to MATCHED, IGNORED, REVIEW — not itself
    expect(isTransitionAllowed('UNMATCHED', 'UNMATCHED')).toBe(false);
  });
});

// ── Schema validation ─────────────────────────────────────────────────────────

describe('PreviewRequestSchema', () => {
  it('rejects empty rows array', async () => {
    const { PreviewRequestSchema } = await import('../schema.js');
    const result = PreviewRequestSchema.safeParse({ bankName: 'NBK', fileName: 'test.xlsx', rows: [] });
    expect(result.success).toBe(false);
  });

  it('rejects rows array exceeding 10000', async () => {
    const { PreviewRequestSchema } = await import('../schema.js');
    const bigRows = Array.from({ length: 10001 }, () => ({
      transactionId: null, bankName: 'NBK', statementDate: '2026-06-01', postingDate: null,
      description: 'Test', reference: null, debit: 0, credit: 100, balance: null,
      currency: 'KWD', accountNumber: null, iban: null, chequeNumber: null, rawRow: {},
    }));
    const result = PreviewRequestSchema.safeParse({ bankName: 'NBK', fileName: 'test.xlsx', rows: bigRows });
    expect(result.success).toBe(false);
  });

  it('accepts a valid preview request', async () => {
    const { PreviewRequestSchema } = await import('../schema.js');
    const result = PreviewRequestSchema.safeParse({
      bankName: 'NBK',
      fileName: 'statement.xlsx',
      rows: [{
        transactionId: null, bankName: 'NBK', statementDate: '2026-06-01', postingDate: null,
        description: 'Test', reference: null, debit: 0, credit: 100, balance: null,
        currency: 'KWD', accountNumber: null, iban: null, chequeNumber: null, rawRow: {},
      }],
    });
    expect(result.success).toBe(true);
  });
});

describe('UpdateStatusSchema', () => {
  it('rejects invalid status', async () => {
    const { UpdateStatusSchema } = await import('../schema.js');
    const result = UpdateStatusSchema.safeParse({ status: 'INVALID' });
    expect(result.success).toBe(false);
  });

  it('accepts valid status', async () => {
    const { UpdateStatusSchema } = await import('../schema.js');
    const result = UpdateStatusSchema.safeParse({ status: 'MATCHED', matchedRef: 'INV-001', matchedId: 1, matchedType: 'invoice', matchConfidence: 90 });
    expect(result.success).toBe(true);
  });
});

describe('BulkUpdateStatusSchema', () => {
  it('rejects empty ids array', async () => {
    const { BulkUpdateStatusSchema } = await import('../schema.js');
    const result = BulkUpdateStatusSchema.safeParse({ ids: [], status: 'IGNORED' });
    expect(result.success).toBe(false);
  });

  it('rejects ids array exceeding 500', async () => {
    const { BulkUpdateStatusSchema } = await import('../schema.js');
    const result = BulkUpdateStatusSchema.safeParse({
      ids: Array.from({ length: 501 }, (_, i) => i + 1),
      status: 'IGNORED',
    });
    expect(result.success).toBe(false);
  });

  it('accepts valid bulk update', async () => {
    const { BulkUpdateStatusSchema } = await import('../schema.js');
    const result = BulkUpdateStatusSchema.safeParse({ ids: [1, 2, 3], status: 'IGNORED' });
    expect(result.success).toBe(true);
  });
});

// ── STATEMENT_CONFIGS completeness check ──────────────────────────────────────

describe('STATEMENT_CONFIGS', () => {
  const requiredBanks = ['NBK', 'KFH', 'GULF_BANK', 'BOUBYAN', 'WARBA', 'AHLI_UNITED', 'UNKNOWN'];

  it.each(requiredBanks)('has config for %s', (bank) => {
    expect(STATEMENT_CONFIGS[bank]).toBeDefined();
    expect(STATEMENT_CONFIGS[bank].bankName).toBe(bank);
    expect(STATEMENT_CONFIGS[bank].columnMap.statementDate).toBeTruthy();
    expect(STATEMENT_CONFIGS[bank].columnMap.description).toBeTruthy();
  });

  it.each(requiredBanks)('%s has displayNameAr set', (bank) => {
    expect(STATEMENT_CONFIGS[bank].displayNameAr.length).toBeGreaterThan(0);
  });

  it.each(requiredBanks)('%s has at least one date format', (bank) => {
    expect(STATEMENT_CONFIGS[bank].dateFormats.length).toBeGreaterThan(0);
  });
});
