import { prisma } from '@config/database.js';
import { BANK_MATCH_TOLERANCE } from './tolerances.js';
import type { StatementTransaction, MatchResult, MatchCandidate, MatchedType, MatchConfidence } from './types.js';

// ── Data source loaders ────────────────────────────────────────────────────────

interface InvoiceRecord  { id: number; invoiceNumber: string; total: number; }
interface PaymentRecord  { id: number; reference: string | null; amount: number; invoiceId: number; }
interface ExpenseRecord  { id: number; code: string; amount: number; description: string; }
interface JournalRecord  { id: number; entryNumber: string; }
interface ChequeRecord   {
  id: number;
  chequeNumber: string;
  amount: number;
  /** الحساب البنكي المُصدِر — `null` لشيكات Legacy غير المربوطة. */
  bankAccountId: number | null;
  /** `accountKey` الخاص بحساب الشيك، إن رُبط الحساب بعالم كشوف البنوك. */
  accountKey: string | null;
}
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
      select: {
        id: true,
        chequeNumber: true,
        amount: true,
        bankAccountId: true,
        bankAccount: { select: { statementAccountKey: true } },
      },
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
    cheques:   cheques.map((c) => ({
      id: c.id,
      chequeNumber: c.chequeNumber,
      amount: Number(c.amount),
      bankAccountId: c.bankAccountId,
      accountKey: c.bankAccount?.statementAccountKey ?? null,
    })),
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

/**
 * مطابقة **تقريبية** — استدلال لا قيد. التسامح واسع عمدًا (٥ فلوس): عمولة أو فرق تقريب
 * من طرف ثالث يجب ألّا يمنع اقتراح المطابقة. القيمة لم تتغيّر؛ صار لها اسم ومعنى.
 */
function amountsMatch(a: number, b: number): boolean {
  return Math.abs(a - b) <= BANK_MATCH_TOLERANCE;
}

function txAmount(tx: StatementTransaction): number {
  return tx.debit > 0 ? tx.debit : tx.credit;
}

function containsRef(text: string, ref: string): boolean {
  if (!ref) return false;
  return text.toLowerCase().includes(ref.toLowerCase());
}

// ── Match engine ───────────────────────────────────────────────────────────────

/**
 * يختار الشيك المطابق لرقم معيّن **دون تخمين** — Multi-Bank Cheques Foundation v1.
 *
 * رقم الشيك لم يعد فريدًا عالميًا (صار فريدًا لكل حساب بنكي)، فالبحث القديم
 * `cheques.find(c => c.chequeNumber === n)` صار قادرًا على إعادة شيك من بنك
 * مختلف تمامًا لمجرد أنه أول ما صادفه في المصفوفة — أي مطابقة مالية خاطئة
 * صامتة. القواعد هنا، بالترتيب:
 *
 *   1. عند توفّر هوية الحساب (`accountKey` للحركة يطابق `statementAccountKey`
 *      لحساب الشيك) تُحصر المطابقة في شيكات ذلك الحساب.
 *   2. عند غياب هوية الحساب — وهو حال كشوف Legacy المستوردة قبل هذا السجل —
 *      يُقبل السلوك القديم **فقط إذا كان غير ملتبس**: مرشّح واحد لا غير.
 *   3. عند التباس حقيقي (نفس الرقم في حسابين) لا يُختار شيء ويُعاد `ambiguous`،
 *      فتبقى الحركة «غير مطابَقة» ليقررها إنسان بدل أن يخمّنها النظام.
 */
function resolveChequeByNumber(
  chequeNumber: string,
  ctx: MatcherContext,
  accountKey: string | null,
): { cheque: ChequeRecord | null; ambiguous: boolean } {
  const byNumber = ctx.cheques.filter((c) => c.chequeNumber === chequeNumber);
  if (byNumber.length === 0) return { cheque: null, ambiguous: false };
  if (byNumber.length === 1) return { cheque: byNumber[0], ambiguous: false };

  // أكثر من شيك يحمل الرقم — نضيّق بهوية الحساب إن توفّرت.
  if (accountKey) {
    const scoped = byNumber.filter((c) => c.accountKey === accountKey);
    if (scoped.length === 1) return { cheque: scoped[0], ambiguous: false };
    // صفر أو أكثر من واحد داخل الحساب نفسه: لا قرار آمن.
    return { cheque: null, ambiguous: true };
  }

  return { cheque: null, ambiguous: true };
}

export function matchTransaction(
  tx: StatementTransaction,
  ctx: MatcherContext,
  /** هوية حساب الحركة (`accountKey` للاستيراد). غيابها = كشف Legacy بلا ربط. */
  accountKey: string | null = null,
): MatchResult {
  const candidates: MatchCandidate[] = [];
  const amount = txAmount(tx);
  const desc   = (tx.description + ' ' + (tx.reference ?? '') + ' ' + (tx.transactionId ?? '')).toLowerCase();
  /** أرقام شيكات التبس أمرها بين حسابين — لا تُطابَق بأي قاعدة لاحقة أيضًا. */
  const ambiguousChequeNumbers = new Set<string>();

  // 1. Exact cheque number match — confidence 100
  if (tx.chequeNumber) {
    const { cheque, ambiguous } = resolveChequeByNumber(tx.chequeNumber, ctx, accountKey);
    if (cheque) {
      candidates.push(candidate('cheque', cheque.id, cheque.chequeNumber, 100, 'cheque_number'));
    } else if (ambiguous) {
      ambiguousChequeNumbers.add(tx.chequeNumber);
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
  //
  // يمر عبر `resolveChequeByNumber` نفسه: رقم موجود في حسابين لا يُطابَق هنا
  // أيضًا. سابقًا كانت هذه الحلقة تدفع مرشّحًا لكل شيك يحمل الرقم، فينتهي
  // الترتيب باختيار أحدهما اعتباطًا — نفس الخطأ الصامت الذي تغلقه القاعدة 1.
  if (!tx.chequeNumber) {
    const seenNumbers = new Set<string>();
    for (const cheque of ctx.cheques) {
      if (seenNumbers.has(cheque.chequeNumber)) continue;
      if (!containsRef(desc, cheque.chequeNumber)) continue;
      seenNumbers.add(cheque.chequeNumber);
      const resolved = resolveChequeByNumber(cheque.chequeNumber, ctx, accountKey);
      if (resolved.cheque) {
        candidates.push(candidate('cheque', resolved.cheque.id, resolved.cheque.chequeNumber, 90, 'cheque_in_desc'));
      } else if (resolved.ambiguous) {
        ambiguousChequeNumbers.add(cheque.chequeNumber);
      }
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

  return {
    best,
    candidates: unique,
    // تحذير صريح بدل تخمين صامت: هذه الأرقام موجودة في أكثر من حساب بنكي ولم
    // تُطابَق. تبقى الحركة «غير مطابَقة» ليربطها المستخدم يدويًا بالشيك الصحيح.
    ...(ambiguousChequeNumbers.size > 0
      ? { ambiguousChequeNumbers: [...ambiguousChequeNumbers] }
      : {}),
  };
}

// ── Batch match (for preview) ──────────────────────────────────────────────────

export async function matchAllTransactions(
  rows: StatementTransaction[],
  /** هوية حساب الكشف المستورد. غيابها = السلوك القديم غير الملتبس فقط. */
  accountKey: string | null = null,
): Promise<MatchResult[]> {
  const ctx = await loadMatcherContext();
  return rows.map((tx) => matchTransaction(tx, ctx, accountKey));
}
