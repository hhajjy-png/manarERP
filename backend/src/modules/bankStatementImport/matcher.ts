import { prisma } from '@config/database.js';
import type { StatementTransaction, MatchResult, MatchCandidate, MatchedType, MatchConfidence } from './types.js';

// ── Data source loaders ────────────────────────────────────────────────────────

interface InvoiceRecord  { id: number; invoiceNumber: string; total: number; }
interface PaymentRecord  { id: number; reference: string | null; amount: number; invoiceId: number; }
interface ExpenseRecord  { id: number; code: string; amount: number; description: string; }
interface JournalRecord  { id: number; entryNumber: string; }
interface ChequeRecord   { id: number; chequeNumber: string; amount: number; }
interface PayrollRecord  { id: number; month: number; year: number; netSalary: number; }

export interface MatcherContext {
  invoices:  InvoiceRecord[];
  payments:  PaymentRecord[];
  expenses:  ExpenseRecord[];
  journals:  JournalRecord[];
  cheques:   ChequeRecord[];
  payrolls:  PayrollRecord[];
}

export async function loadMatcherContext(): Promise<MatcherContext> {
  const [invoices, payments, expenses, journals, cheques, payrolls] = await Promise.all([
    prisma.invoice.findMany({
      select: { id: true, invoiceNumber: true, total: true },
      where: { status: { not: 'CANCELLED' } },
    }),
    prisma.payment.findMany({
      select: { id: true, reference: true, amount: true, invoiceId: true },
    }),
    prisma.expense.findMany({
      select: { id: true, code: true, amount: true, description: true },
      where: { status: { not: 'CANCELLED' } },
    }),
    prisma.journalEntry.findMany({
      select: { id: true, entryNumber: true },
    }),
    prisma.cheque.findMany({
      select: { id: true, chequeNumber: true, amount: true },
      where: { status: { not: 'CANCELLED' } },
    }),
    prisma.payroll.findMany({
      select: { id: true, month: true, year: true, netSalary: true },
      where: { status: { not: 'CANCELLED' } },
    }),
  ]);

  return {
    invoices:  invoices.map((i) => ({ id: i.id, invoiceNumber: i.invoiceNumber, total: Number(i.total) })),
    payments:  payments.map((p) => ({ id: p.id, reference: p.reference, amount: Number(p.amount), invoiceId: p.invoiceId })),
    expenses:  expenses.map((e) => ({ id: e.id, code: e.code, amount: Number(e.amount), description: e.description })),
    journals:  journals.map((j) => ({ id: j.id, entryNumber: j.entryNumber })),
    cheques:   cheques.map((c) => ({ id: c.id, chequeNumber: c.chequeNumber, amount: Number(c.amount) })),
    payrolls:  payrolls.map((p) => ({ id: p.id, month: p.month, year: p.year, netSalary: Number(p.netSalary) })),
  };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function candidate(
  type: MatchedType,
  id: number,
  ref: string,
  confidence: MatchConfidence,
  matchedBy: string,
): MatchCandidate {
  return { type, id, ref, confidence, matchedBy };
}

function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= 0.005;
}

function txAmount(tx: StatementTransaction): number {
  return tx.debit > 0 ? tx.debit : tx.credit;
}

function containsRef(text: string, ref: string): boolean {
  if (!ref) return false;
  return text.toLowerCase().includes(ref.toLowerCase());
}

// ── Match engine ───────────────────────────────────────────────────────────────

export function matchTransaction(
  tx: StatementTransaction,
  ctx: MatcherContext,
): MatchResult {
  const candidates: MatchCandidate[] = [];
  const amount = txAmount(tx);
  const desc   = (tx.description + ' ' + (tx.reference ?? '') + ' ' + (tx.transactionId ?? '')).toLowerCase();

  // 1. Exact cheque number match — confidence 100
  if (tx.chequeNumber) {
    const cheque = ctx.cheques.find((c) => c.chequeNumber === tx.chequeNumber);
    if (cheque) {
      candidates.push(candidate('cheque', cheque.id, cheque.chequeNumber, 100, 'cheque_number'));
    }
  }

  // 2. Exact transaction ID match against payment reference — confidence 100
  if (tx.transactionId) {
    const payment = ctx.payments.find((p) => p.reference === tx.transactionId);
    if (payment) {
      candidates.push(candidate('payment', payment.id, payment.reference ?? String(payment.id), 100, 'transaction_id'));
    }
  }

  // 3. Invoice number found in description/reference — confidence 90
  for (const inv of ctx.invoices) {
    if (containsRef(desc, inv.invoiceNumber)) {
      candidates.push(candidate('invoice', inv.id, inv.invoiceNumber, 90, 'invoice_ref_in_desc'));
    }
  }

  // 4. Payment reference found in description — confidence 90
  for (const pay of ctx.payments) {
    if (pay.reference && containsRef(desc, pay.reference)) {
      candidates.push(candidate('payment', pay.id, pay.reference, 90, 'payment_ref_in_desc'));
    }
  }

  // 5. Cheque number in description (even if chequeNumber field is null) — confidence 90
  for (const cheque of ctx.cheques) {
    if (!tx.chequeNumber && containsRef(desc, cheque.chequeNumber)) {
      candidates.push(candidate('cheque', cheque.id, cheque.chequeNumber, 90, 'cheque_in_desc'));
    }
  }

  // 6. Amount + date match against invoice total — confidence 75
  for (const inv of ctx.invoices) {
    if (amountsMatch(amount, inv.total)) {
      candidates.push(candidate('invoice', inv.id, inv.invoiceNumber, 75, 'amount_match'));
    }
  }

  // 7. Amount match against expense — confidence 75
  for (const exp of ctx.expenses) {
    if (amountsMatch(amount, exp.amount)) {
      candidates.push(candidate('expense', exp.id, exp.code, 75, 'amount_match'));
    }
  }

  // 8. Amount match against payroll netSalary — confidence 75
  for (const pay of ctx.payrolls) {
    if (amountsMatch(amount, pay.netSalary)) {
      const ref = `PAY-${pay.year}-${String(pay.month).padStart(2, '0')}-${pay.id}`;
      candidates.push(candidate('payroll', pay.id, ref, 75, 'amount_match'));
    }
  }

  // Deduplicate: prefer highest confidence per (type, id) pair
  const deduped = new Map<string, MatchCandidate>();
  for (const c of candidates) {
    const key = `${c.type}:${c.id}`;
    const existing = deduped.get(key);
    if (!existing || c.confidence > existing.confidence) deduped.set(key, c);
  }

  const unique = [...deduped.values()].sort((a, b) => b.confidence - a.confidence);
  const best = unique[0] ?? null;

  return { best, candidates: unique };
}

// ── Batch match (for preview) ──────────────────────────────────────────────────

export async function matchAllTransactions(
  rows: StatementTransaction[],
): Promise<MatchResult[]> {
  const ctx = await loadMatcherContext();
  return rows.map((tx) => matchTransaction(tx, ctx));
}
