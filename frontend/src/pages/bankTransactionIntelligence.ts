/* ════════════════════════════════════════════════════════════════════════════
   Bank Transaction Intelligence Engine v2 — display-only
   --------------------------------------------------------------------------
   Extends the Smart Transaction Presentation Engine (bankTransactionPresentation.ts)
   with a richer, structured PRESENTATION VIEW MODEL: channel, counterparty,
   cheque/branch/account/reference/device identifiers, cheque clearing direction
   & presentation type, a contextual "rich" title, and a compact one-sentence
   summary — every field OPTIONAL, never fabricated, always either a literal
   substring of the source transaction (raw description / structured fields
   such as `reference`/`chequeNumber`) or a direct read of an already-resolved
   classification (e.g. the underlying engine's clearing-direction rule).

   The transaction itself remains the source of truth. This engine only builds
   a view model on top of it; nothing is stored, nothing feeds back into
   import/matching/reconciliation/accounting.

   Architecture (each helper independent & reusable — no duplicated regex):
     Generic Parser Helpers → ATM Detection → Cheque Detection →
     Cheque Direction & Presentation Type → Transfer Detection →
     Deposit/Withdrawal Detection → Reference Extraction → Account Extraction →
     Branch Extraction → Rich Title Resolution → Rich Summary → Presentation Builder

   All anchors require an explicit label + separator (":", "-", "#") — or, for
   purely numeric codes, the label directly followed by a digit run that can
   never be mistaken for trailing prose — before a value is captured. This
   keeps the "never guess" rule mechanical rather than a matter of judgement,
   and is why the engine returns undefined far more often than it returns a
   value on transaction shapes it hasn't seen yet. The rich title and summary
   layers apply the exact same discipline: they only ever recombine values
   already extracted by the detectors above, never infer new ones.

   Extensible by design: adding a bank-specific parser later means adding a new
   label set or a new helper — never rewriting this file's structure.
   ════════════════════════════════════════════════════════════════════════════ */
import type { TimelineTransaction } from '../api/bankStatementImport';
import { safeNum } from './bankTimelineFilters';
import { formatNumber } from '../lib/format';
import {
  presentTransaction,
  extractInwardClearingCheque, extractChequeNumberLabeled, extractPresentedChannel,
  isSensitiveValue,
  type SmartTransactionPresentation,
} from './bankTransactionPresentation';

type TranslateFn = (key: string) => string;
interface LabelEntry { key: string; label: string; }

// Resolves a { key, label } pair through the caller's `t()`, falling back to
// the Arabic literal when omitted (unit tests, or a caller not yet wired up) —
// the same convention as bankTransactionPresentation.ts's `tr()`.
function resolveLabel(entry: LabelEntry, translate?: TranslateFn): string {
  return translate ? translate(entry.key) : entry.label;
}

// Fills `{placeholder}` tokens in an i18n template with literal extracted
// values — mirrors the `{name}` convention already used throughout i18n.ts.
// Placeholders are always substrings the detectors below already validated;
// this never introduces a value that wasn't already extracted.
function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? '');
}

export type TransactionChannel = 'atm' | 'branch' | 'online' | 'clearing' | 'pos' | 'transfer_system';
export type ChequeDirection = 'incoming' | 'outgoing';
export type ChequePresentationType = 'clearing' | 'returned';

export interface TransactionPresentationModel {
  /** Human-readable title (line 1) — never an i18n key, never fabricated. Richer
   *  than the underlying engine's category label where a strong signal allows it. */
  title:                string;
  /** Human-readable subtitle (line 2) — the presentation engine's safe detail, if any. */
  subtitle?:            string;
  /** One-sentence ERP-style summary, generated only from high-confidence signals. */
  summary?:             string;
  category?:            string;
  channel?:             TransactionChannel;
  bank?:                string;
  counterparty?:        string;
  chequeNumber?:        string;
  chequeDirection?:     ChequeDirection;
  chequePresentationType?: ChequePresentationType;
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

// Extracts the value following an explicit label anchor. Two forms, both
// mechanical (never a judgement call):
//   1) "Label:" / "Label -" / "Label #" + an alphanumeric value.
//   2) "Label" directly followed by a pure digit run — no separator required,
//      because a bare number can never be mistaken for trailing prose (unlike
//      a word, which could be part of the label's own sentence, e.g. "ATM
//      Withdrawal"). This form exists specifically for common no-punctuation
//      bank formats ("ATM 004521", "Terminal 00381").
function captureAfterLabel(raw: string, labels: readonly string[], maxLen = 20): string | null {
  for (const label of labels) {
    const strict = new RegExp(`${escapeRegExp(label)}\\s*[:#\\-]\\s*([A-Za-z0-9/]{1,${maxLen}})`, 'i');
    const strictMatch = raw.match(strict)?.[1];
    if (strictMatch) return strictMatch;
  }
  for (const label of labels) {
    const relaxed = new RegExp(`${escapeRegExp(label)}\\s*[:#\\-]?\\s*(\\d{3,${maxLen}})\\b`, 'i');
    const relaxedMatch = raw.match(relaxed)?.[1];
    if (relaxedMatch) return relaxedMatch;
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

const ATM_PATTERN   = /\b(atm|cdm|cash\s+machine|صراف\s*آلي|جهاز\s*الصراف)\b/i;
const ATM_ID_LABELS = ['ATM ID', 'ATM No', 'ATM Terminal', 'ATM'] as const;

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

// ── Cheque Direction & Presentation Type ────────────────────────────────────
// Direction is never guessed from prose — it is read directly from the
// underlying engine's own clearing-direction rule (`inward-clearing-cheque` /
// `outgoing-clearing-cheque`), which only fires on the same anchored phrases
// bankTransactionPresentation.ts already validates. Presentation type adds one
// independent, explicit keyword check (a returned/bounced cheque) on top.

const RETURNED_CHEQUE_PATTERN = /return(?:ed)?\s+cheque|cheque\s+return(?:ed)?|bounced\s+cheque|شيك\s*مرتجع/i;

function detectChequeDirection(pres: SmartTransactionPresentation): ChequeDirection | undefined {
  const rule = pres.provenance.rule;
  if (rule.includes('inward-clearing-cheque')) return 'incoming';
  if (rule.includes('outgoing-clearing-cheque')) return 'outgoing';
  return undefined;
}

function detectChequePresentationType(raw: string, direction: ChequeDirection | undefined): ChequePresentationType | undefined {
  if (RETURNED_CHEQUE_PATTERN.test(raw)) return 'returned';
  if (direction) return 'clearing';
  return undefined;
}

export const CHEQUE_PRESENTATION_TYPE_LABELS: Record<ChequePresentationType, LabelEntry> = {
  clearing: { key: 'bank.presentation.cheque_type_clearing', label: 'مُقدَّم للمقاصة' },
  returned: { key: 'bank.presentation.cheque_type_returned', label: 'مرتجع' },
};

export function chequePresentationTypeLabel(type: ChequePresentationType, translate?: TranslateFn): string {
  return resolveLabel(CHEQUE_PRESENTATION_TYPE_LABELS[type], translate);
}

export const CHEQUE_DIRECTION_LABELS: Record<ChequeDirection, LabelEntry> = {
  incoming: { key: 'bank.presentation.cheque_direction_incoming', label: 'وارد' },
  outgoing: { key: 'bank.presentation.cheque_direction_outgoing', label: 'صادر' },
};

export function chequeDirectionLabel(direction: ChequeDirection, translate?: TranslateFn): string {
  return resolveLabel(CHEQUE_DIRECTION_LABELS[direction], translate);
}

// ── Transfer Detection ───────────────────────────────────────────────────────

const SOURCE_ACCOUNT_LABELS = ['From A/C', 'From Account', 'Source Account', 'Debit A/C', 'From IBAN'] as const;
const DEST_ACCOUNT_LABELS   = [
  'To A/C', 'To Account', 'Beneficiary A/C', 'Beneficiary IBAN', 'Destination Account', 'Credit A/C', 'To IBAN',
] as const;
const COUNTERPARTY_LABELS = ['Beneficiary', 'Payee', 'Remitter', 'Sender', 'Ordering Customer', 'Beneficiary Name'] as const;
const ACCOUNT_MAX_LEN     = 34; // IBAN-length ceiling

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
// the presentation engine; these only refine channel/title/summary below.

function isDeposit(tx: TimelineTransaction): boolean { return safeNum(tx.credit) > 0; }
function isWithdrawal(tx: TimelineTransaction): boolean { return safeNum(tx.debit) > 0; }

// ── Reference Extraction ────────────────────────────────────────────────────

const REFERENCE_LABELS = ['Reference No', 'Ref No', 'Reference', 'Transaction No', 'Txn No', 'RRN', 'Ref'] as const;
const TERMINAL_LABELS  = ['Terminal ID', 'Terminal No', 'TID', 'STAN', 'Terminal'] as const;
const AUTH_LABELS      = ['Authorization Code', 'Auth Code', 'Approval Code', 'Auth No', 'Approval', 'Auth'] as const;

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

export const CHANNEL_LABELS: Record<TransactionChannel, LabelEntry> = {
  atm:             { key: 'bank.presentation.channel_atm',             label: 'صراف آلي' },
  branch:          { key: 'bank.presentation.channel_branch',          label: 'فرع' },
  online:          { key: 'bank.presentation.channel_online',          label: 'خدمات إلكترونية' },
  clearing:        { key: 'bank.presentation.channel_clearing',        label: 'مقاصة' },
  pos:             { key: 'bank.presentation.channel_pos',             label: 'نقطة بيع' },
  transfer_system: { key: 'bank.presentation.channel_transfer_system', label: 'نظام التحويلات' },
};

export function channelLabel(channel: TransactionChannel, translate?: TranslateFn): string {
  return resolveLabel(CHANNEL_LABELS[channel], translate);
}

// ── Rich Title Resolution ────────────────────────────────────────────────────
// Refines the underlying engine's category label into a more specific,
// context-aware title — but only ever from signals the detectors above already
// extracted (cheque direction, a returned-cheque keyword, an explicit internal-
// transfer or cash-deposit phrase, or a cheque number attached to a credit).
// Falls back to the underlying label untouched when no such signal applies —
// every existing transaction shape keeps its exact v1 title.

const INTERNAL_TRANSFER_PATTERN = /internal\s+transfer|own\s+account|between\s+(?:own\s+)?accounts|تحويل\s*داخلي|بين\s*الحسابات/i;
const CASH_DEPOSIT_PATTERN      = /cash\s+deposit|إيداع\s*نقدي/i;

const RICH_TITLES = {
  chequeIncomingClearing: { key: 'bank.presentation.title_cheque_incoming_clearing', label: 'شيك وارد للمقاصة' },
  chequeOutgoingClearing: { key: 'bank.presentation.title_cheque_outgoing_clearing', label: 'شيك صادر للمقاصة' },
  chequeReturned:         { key: 'bank.presentation.title_cheque_returned',          label: 'شيك مرتجع' },
  internalTransfer:       { key: 'bank.presentation.title_internal_transfer',        label: 'تحويل داخلي' },
  cashDeposit:            { key: 'bank.presentation.title_cash_deposit',             label: 'إيداع نقدي' },
  chequeDeposit:          { key: 'bank.presentation.title_cheque_deposit',           label: 'إيداع شيك' },
} as const satisfies Record<string, LabelEntry>;

function resolveRichTitle(
  tx: TimelineTransaction, pres: SmartTransactionPresentation, raw: string,
  direction: ChequeDirection | undefined, presentationType: ChequePresentationType | undefined,
  chequeNumber: string | undefined, translate?: TranslateFn,
): string {
  if (presentationType === 'returned') return resolveLabel(RICH_TITLES.chequeReturned, translate);
  if (direction === 'incoming') return resolveLabel(RICH_TITLES.chequeIncomingClearing, translate);
  if (direction === 'outgoing') return resolveLabel(RICH_TITLES.chequeOutgoingClearing, translate);
  if (INTERNAL_TRANSFER_PATTERN.test(raw)) return resolveLabel(RICH_TITLES.internalTransfer, translate);
  if (isDeposit(tx)) {
    if (CASH_DEPOSIT_PATTERN.test(raw)) return resolveLabel(RICH_TITLES.cashDeposit, translate);
    if (chequeNumber) return resolveLabel(RICH_TITLES.chequeDeposit, translate);
  }
  return pres.category.label;
}

// ── Rich Summary ─────────────────────────────────────────────────────────────
// A single ERP-style sentence recombining already-extracted values — never a
// new inference. The transaction amount/currency are always genuine structured
// fields (never extracted/guessed), so a summary is generated for essentially
// every transaction — richer wording where a strong signal exists (cheque
// clearing, ATM, internal transfer, counterparty), a plain amount-based
// sentence otherwise. Only the true edge case of a zero-amount transaction
// (no debit and no credit) produces no summary at all.

const SUMMARY_TEMPLATES = {
  chequeClearedWithBranch: { key: 'bank.presentation.summary_cheque_cleared_branch', fallback: 'شيك رقم {number} تم تقديمه للمقاصة عبر فرع {branch}.' },
  chequeCleared:           { key: 'bank.presentation.summary_cheque_cleared',        fallback: 'شيك رقم {number} تم تقديمه للمقاصة.' },
  atmWithdrawal:           { key: 'bank.presentation.summary_atm_withdrawal',        fallback: 'تم سحب {amount} {currency} عبر جهاز الصراف.' },
  atmDeposit:              { key: 'bank.presentation.summary_atm_deposit',           fallback: 'تم إيداع {amount} {currency} عبر جهاز الصراف.' },
  internalTransfer:        { key: 'bank.presentation.summary_internal_transfer',     fallback: 'تحويل داخلي بين الحسابات.' },
  transferFrom:            { key: 'bank.presentation.summary_transfer_from',         fallback: 'تحويل بنكي من {counterparty}.' },
  transferTo:              { key: 'bank.presentation.summary_transfer_to',           fallback: 'تحويل بنكي إلى {counterparty}.' },
  genericWithdrawal:       { key: 'bank.presentation.summary_generic_withdrawal',    fallback: 'تم سحب {amount} {currency}.' },
  genericDeposit:          { key: 'bank.presentation.summary_generic_deposit',       fallback: 'تم إيداع مبلغ {amount} {currency}.' },
} as const;

function summarize(entry: { key: string; fallback: string }, vars: Record<string, string>, translate?: TranslateFn): string {
  const template = translate ? translate(entry.key) : entry.fallback;
  return interpolate(template, vars);
}

function buildSummary(
  tx: TimelineTransaction, raw: string, isAtm: boolean,
  chequeNumber: string | undefined, direction: ChequeDirection | undefined, presentedBranch: string | undefined,
  counterparty: string | undefined, translate?: TranslateFn,
): string | undefined {
  if (chequeNumber && direction) {
    return presentedBranch
      ? summarize(SUMMARY_TEMPLATES.chequeClearedWithBranch, { number: chequeNumber, branch: presentedBranch }, translate)
      : summarize(SUMMARY_TEMPLATES.chequeCleared, { number: chequeNumber }, translate);
  }

  const deposit    = isDeposit(tx);
  const withdrawal = isWithdrawal(tx);
  const amount     = formatNumber(deposit ? tx.credit : tx.debit);
  const currency   = tx.currency;

  if (isAtm && withdrawal) return summarize(SUMMARY_TEMPLATES.atmWithdrawal, { amount, currency }, translate);
  if (isAtm && deposit) return summarize(SUMMARY_TEMPLATES.atmDeposit, { amount, currency }, translate);
  if (INTERNAL_TRANSFER_PATTERN.test(raw)) return summarize(SUMMARY_TEMPLATES.internalTransfer, {}, translate);
  if (counterparty && deposit) return summarize(SUMMARY_TEMPLATES.transferFrom, { counterparty }, translate);
  if (counterparty && withdrawal) return summarize(SUMMARY_TEMPLATES.transferTo, { counterparty }, translate);
  if (deposit) return summarize(SUMMARY_TEMPLATES.genericDeposit, { amount, currency }, translate);
  if (withdrawal) return summarize(SUMMARY_TEMPLATES.genericWithdrawal, { amount, currency }, translate);
  return undefined;
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

  const atm       = detectAtm(raw);
  const cheque    = detectCheque(tx, raw);
  const direction = detectChequeDirection(pres);
  const presentationType = detectChequePresentationType(raw, direction);
  const transfer  = detectTransfer(raw);
  const refs      = extractReferenceInfo(tx, raw);
  const account   = extractAccountInfo(raw);
  const branch    = extractBranchInfo(raw, cheque.presentedBranch);
  const channel   = resolveChannel(tx, raw, atm.isAtm);

  const title   = resolveRichTitle(tx, pres, raw, direction, presentationType, cheque.chequeNumber, translate);
  const summary = buildSummary(tx, raw, atm.isAtm, cheque.chequeNumber, direction, cheque.presentedBranch, transfer.counterparty, translate);

  const keywords = [
    atm.atmId && 'atm', cheque.chequeNumber && 'cheque', direction && 'cheque-direction',
    transfer.counterparty && 'counterparty', refs.referenceNumber && 'reference',
    branch.branch && 'branch', account.accountNumber && 'account',
  ].filter((k): k is string => Boolean(k));

  const category = tx.bankFeeType
    ?? (isDeposit(tx) ? 'DEPOSIT' : isWithdrawal(tx) ? 'WITHDRAWAL' : undefined);

  return {
    title,
    subtitle:            pres.detail?.text,
    summary,
    category,
    channel,
    bank:                tx.bankName || undefined,
    counterparty:        transfer.counterparty,
    chequeNumber:        cheque.chequeNumber,
    chequeDirection:     direction,
    chequePresentationType: presentationType,
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
