/* ════════════════════════════════════════════════════════════════════════════
   Bank Transaction Intelligence Engine v1 — display-only
   --------------------------------------------------------------------------
   Extends the Smart Transaction Presentation Engine (bankTransactionPresentation.ts)
   with a richer, structured PRESENTATION VIEW MODEL: channel, counterparty,
   cheque/branch/account/reference/device identifiers — every field OPTIONAL,
   never fabricated, always a literal substring of the source transaction (raw
   description or an already-structured field such as `reference`/`chequeNumber`).

   The transaction itself remains the source of truth. This engine only builds
   a view model on top of it; nothing is stored, nothing feeds back into
   import/matching/reconciliation/accounting.

   Architecture (each helper independent & reusable — no duplicated regex):
     Generic Parser Helpers → ATM Detection → Cheque Detection →
     Transfer Detection → Deposit/Withdrawal Detection → Reference Extraction →
     Account Extraction → Branch Extraction → Presentation Builder

   All anchors require an explicit label + separator (":", "-", "#") before a
   value is captured — free prose is never mistaken for a labelled field. This
   keeps the "never guess" rule mechanical rather than a matter of judgement,
   and is why the engine returns undefined far more often than it returns a
   value on transaction shapes it hasn't seen yet.

   Extensible by design: adding a bank-specific parser later means adding a new
   label set or a new helper — never rewriting this file's structure.
   ════════════════════════════════════════════════════════════════════════════ */
import type { TimelineTransaction } from '../api/bankStatementImport';
import { safeNum } from './bankTimelineFilters';
import {
  presentTransaction,
  extractInwardClearingCheque, extractChequeNumberLabeled, extractPresentedChannel,
  isSensitiveValue,
  type SmartTransactionPresentation,
} from './bankTransactionPresentation';

type TranslateFn = (key: string) => string;

export type TransactionChannel = 'atm' | 'branch' | 'online' | 'clearing' | 'pos' | 'transfer_system';

export interface TransactionPresentationModel {
  /** Human-readable title (line 1) — never an i18n key, never fabricated. */
  title:                string;
  /** Human-readable subtitle (line 2) — the presentation engine's safe detail, if any. */
  subtitle?:            string;
  category?:            string;
  channel?:             TransactionChannel;
  bank?:                string;
  counterparty?:        string;
  chequeNumber?:        string;
  branch?:              string;
  presentedBranch?:     string;
  clearingBranch?:      string;
  atmId?:               string;
  accountNumber?:       string;
  sourceAccount?:       string;
  destinationAccount?:  string;
  referenceNumber?:     string;
  terminalId?:          string;
  authorizationCode?:   string;
  extractedKeywords?:   string[];
  originalDescription:  string;
  /** Internal only — never displayed. Used solely to gate low-trust fields. */
  confidenceScore:      number;
}

// ── Generic Parser Helpers ──────────────────────────────────────────────────

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Extracts the value following an explicit "Label:" / "Label -" / "Label #"
// anchor. Requires a punctuation separator so free prose is never mistaken for
// a labelled value — the mechanical form of "never guess".
function captureAfterLabel(raw: string, labels: readonly string[], maxLen = 20): string | null {
  for (const label of labels) {
    const re = new RegExp(`${escapeRegExp(label)}\\s*[:#\\-]\\s*([A-Za-z0-9/]{1,${maxLen}})`, 'i');
    const m = raw.match(re);
    if (m?.[1]) return m[1];
  }
  return null;
}

// Same anchor discipline, but for name-like values (counterparty): Latin or
// Arabic letters/spaces only — never a bare digit run, so CIVIL ID / mobile /
// instrument numbers can never surface through this path.
function captureNameAfterLabel(raw: string, labels: readonly string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`${escapeRegExp(label)}\\s*[:#\\-]\\s*([A-Za-z\\u0600-\\u06FF ]{2,40})`, 'i');
    const value = raw.match(re)?.[1]?.trim();
    if (value) return value;
  }
  return null;
}

// ── ATM Detection ────────────────────────────────────────────────────────────

const ATM_PATTERN   = /\b(atm|صراف\s*آلي|جهاز\s*الصراف)\b/i;
const ATM_ID_LABELS = ['ATM ID', 'ATM No', 'ATM'] as const;

function detectAtm(raw: string): { isAtm: boolean; atmId?: string } {
  return { isAtm: ATM_PATTERN.test(raw), atmId: captureAfterLabel(raw, ATM_ID_LABELS) ?? undefined };
}

// ── Cheque Detection ─────────────────────────────────────────────────────────

const CLEARING_BRANCH_LABELS = ['Clearing Branch', 'Cleared Through', 'Cleared At'] as const;

function detectCheque(tx: TimelineTransaction, raw: string): {
  chequeNumber?: string; presentedBranch?: string; clearingBranch?: string;
} {
  const inward     = extractInwardClearingCheque(raw);
  const labeled    = extractChequeNumberLabeled(raw);
  const structured = tx.chequeNumber && /^[0-9]{1,7}$/.test(tx.chequeNumber.trim())
    ? tx.chequeNumber.trim() : null;
  return {
    chequeNumber:    inward?.number ?? labeled ?? structured ?? undefined,
    presentedBranch: inward?.channel ?? extractPresentedChannel(raw) ?? undefined,
    clearingBranch:  captureAfterLabel(raw, CLEARING_BRANCH_LABELS) ?? undefined,
  };
}

// ── Transfer Detection ───────────────────────────────────────────────────────

const SOURCE_ACCOUNT_LABELS = ['From A/C', 'From Account', 'Source Account', 'Debit A/C'] as const;
const DEST_ACCOUNT_LABELS   = ['To A/C', 'To Account', 'Beneficiary A/C', 'Destination Account', 'Credit A/C'] as const;
const COUNTERPARTY_LABELS   = ['Beneficiary', 'Payee', 'Remitter', 'Sender'] as const;
const ACCOUNT_MAX_LEN       = 34; // IBAN-length ceiling

function detectTransfer(raw: string): {
  sourceAccount?: string; destinationAccount?: string; counterparty?: string;
} {
  return {
    sourceAccount:      captureAfterLabel(raw, SOURCE_ACCOUNT_LABELS, ACCOUNT_MAX_LEN) ?? undefined,
    destinationAccount: captureAfterLabel(raw, DEST_ACCOUNT_LABELS, ACCOUNT_MAX_LEN) ?? undefined,
    counterparty:       captureNameAfterLabel(raw, COUNTERPARTY_LABELS) ?? undefined,
  };
}

// ── Deposit / Withdrawal Detection ──────────────────────────────────────────
// Thin directional predicates — the category/title itself is still resolved by
// the presentation engine; these only refine channel classification below.

function isDeposit(tx: TimelineTransaction): boolean { return safeNum(tx.credit) > 0; }
function isWithdrawal(tx: TimelineTransaction): boolean { return safeNum(tx.debit) > 0; }

// ── Reference Extraction ────────────────────────────────────────────────────

const REFERENCE_LABELS = ['Reference No', 'Ref No', 'Reference', 'Transaction No', 'Txn No', 'Ref'] as const;
const TERMINAL_LABELS  = ['Terminal ID', 'Terminal No', 'TID', 'Terminal'] as const;
const AUTH_LABELS      = ['Authorization Code', 'Auth Code', 'Approval Code', 'Auth No'] as const;

function extractReferenceInfo(tx: TimelineTransaction, raw: string): {
  referenceNumber?: string; terminalId?: string; authorizationCode?: string;
} {
  const structuredRef = tx.reference && !isSensitiveValue(tx.reference.trim()) ? tx.reference.trim() : null;
  return {
    referenceNumber:   structuredRef ?? captureAfterLabel(raw, REFERENCE_LABELS) ?? undefined,
    terminalId:        captureAfterLabel(raw, TERMINAL_LABELS) ?? undefined,
    authorizationCode: captureAfterLabel(raw, AUTH_LABELS) ?? undefined,
  };
}

// ── Account Extraction ───────────────────────────────────────────────────────

const ACCOUNT_LABELS = ['Account No', 'Acc No', 'A/C No', 'IBAN'] as const;

function extractAccountInfo(raw: string): { accountNumber?: string } {
  return { accountNumber: captureAfterLabel(raw, ACCOUNT_LABELS, ACCOUNT_MAX_LEN) ?? undefined };
}

// ── Branch Extraction ────────────────────────────────────────────────────────

const BRANCH_LABELS = ['Branch', 'Br No', 'Br'] as const;

function extractBranchInfo(raw: string, presentedBranch?: string): { branch?: string } {
  return { branch: captureAfterLabel(raw, BRANCH_LABELS) ?? presentedBranch };
}

// ── Channel resolution ───────────────────────────────────────────────────────

function resolveChannel(tx: TimelineTransaction, raw: string, isAtm: boolean): TransactionChannel | undefined {
  if (isAtm) return 'atm';
  if (/\bpos\b|point\s+of\s+sale/i.test(raw)) return 'pos';
  if (/online|internet\s+banking|mobile\s+banking|e-?banking/i.test(raw)) return 'online';
  if (/clearing/i.test(raw)) return 'clearing';
  if (tx.bankFeeType === 'BANK_TRANSFER' || /\brtgs\b|\bswift\b/i.test(raw)) return 'transfer_system';
  if (extractPresentedChannel(raw)) return 'branch';
  return undefined;
}

// Not displayed — only used to gate how much weight future callers should give
// extracted fields (e.g. an audit view could dim low-score rows).
function computeConfidenceScore(pres: SmartTransactionPresentation, extractedFieldCount: number): number {
  let score = pres.category.confidence === 'high' ? 0.6 : pres.category.confidence === 'medium' ? 0.4 : 0.2;
  if (pres.detail) score += pres.detail.confidence === 'high' ? 0.15 : 0.08;
  score += Math.min(extractedFieldCount, 5) * 0.03;
  return Math.min(1, Math.round(score * 100) / 100);
}

// ── Channel labels (Arabic-first, optional i18n) ────────────────────────────

export const CHANNEL_LABELS: Record<TransactionChannel, { key: string; label: string }> = {
  atm:             { key: 'bank.presentation.channel_atm',             label: 'صراف آلي' },
  branch:          { key: 'bank.presentation.channel_branch',          label: 'فرع' },
  online:          { key: 'bank.presentation.channel_online',          label: 'خدمات إلكترونية' },
  clearing:        { key: 'bank.presentation.channel_clearing',        label: 'مقاصة' },
  pos:             { key: 'bank.presentation.channel_pos',             label: 'نقطة بيع' },
  transfer_system: { key: 'bank.presentation.channel_transfer_system', label: 'نظام التحويلات' },
};

export function channelLabel(channel: TransactionChannel, translate?: TranslateFn): string {
  const entry = CHANNEL_LABELS[channel];
  return translate ? translate(entry.key) : entry.label;
}

// ── Presentation Builder ─────────────────────────────────────────────────────
// Assembles the full view model. Every field is optional; nothing here is
// stored, and every value is either a literal substring of `raw`/`description`
// or a pass-through of an already-structured transaction field.

export function buildTransactionIntelligence(
  tx: TimelineTransaction,
  translate?: TranslateFn,
): TransactionPresentationModel {
  const pres = presentTransaction(tx, translate);
  const raw  = pres.raw;

  const atm      = detectAtm(raw);
  const cheque   = detectCheque(tx, raw);
  const transfer = detectTransfer(raw);
  const refs     = extractReferenceInfo(tx, raw);
  const account  = extractAccountInfo(raw);
  const branch   = extractBranchInfo(raw, cheque.presentedBranch);
  const channel  = resolveChannel(tx, raw, atm.isAtm);

  const keywords = [
    atm.atmId && 'atm', cheque.chequeNumber && 'cheque', transfer.counterparty && 'counterparty',
    refs.referenceNumber && 'reference', branch.branch && 'branch', account.accountNumber && 'account',
  ].filter((k): k is string => Boolean(k));

  const category = tx.bankFeeType
    ?? (isDeposit(tx) ? 'DEPOSIT' : isWithdrawal(tx) ? 'WITHDRAWAL' : undefined);

  return {
    title:               pres.category.label,
    subtitle:            pres.detail?.text,
    category,
    channel,
    bank:                tx.bankName || undefined,
    counterparty:        transfer.counterparty,
    chequeNumber:        cheque.chequeNumber,
    branch:              branch.branch,
    presentedBranch:     cheque.presentedBranch,
    clearingBranch:      cheque.clearingBranch,
    atmId:               atm.atmId,
    accountNumber:       account.accountNumber,
    sourceAccount:       transfer.sourceAccount,
    destinationAccount:  transfer.destinationAccount,
    referenceNumber:     refs.referenceNumber,
    terminalId:          refs.terminalId,
    authorizationCode:   refs.authorizationCode,
    extractedKeywords:   keywords.length ? keywords : undefined,
    originalDescription: tx.description ?? '',
    confidenceScore:     computeConfidenceScore(pres, keywords.length),
  };
}
