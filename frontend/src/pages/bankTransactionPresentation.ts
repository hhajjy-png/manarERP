/* ════════════════════════════════════════════════════════════════════════════
   Smart Transaction Presentation Engine v1 — display-only
   --------------------------------------------------------------------------
   Turns a bank timeline transaction into a safe, structured presentation:

     • category — the transaction "what" (line 1). Resolved from STRUCTURED
       signals first (`bankFeeType`, then debit/credit direction); anchored
       high-confidence bank phrases only refine or fill gaps. Never guessed
       from free prose.
     • detail   — a single, highest-confidence SAFE extra (line 2): cheque
       number, clearing channel, explicit reference, an explicitly-labelled
       project hint, or a verbatim Arabic mirror. Sensitive tokens (CIVIL ID,
       mobile numbers, long account-like numbers, personal names) are NEVER
       promoted here — they remain only in `raw`.
     • raw        — the bank's original text, verbatim (whitespace-collapsed).
     • provenance — how the category was resolved (rule + matched source), for
       the drawer Audit tab.

   PURE PRESENTATION. No backend/API/DB/import/accounting/reconciliation logic;
   nothing is stored; bank text (Arabic or English) is preserved verbatim; and
   any value shown is a literal substring of the source — never fabricated.

   i18n: category/detail label FRAGMENTS are UI vocabulary and are routed
   through an optional `translate` callback (the caller's `t()`); interpolated
   substrings extracted from the bank's raw text are never translated. When
   `translate` is omitted (e.g. in unit tests), every label falls back to its
   original Arabic literal — behavior is unchanged.

   Roadmap: docs/roadmap/SmartTransactionPresentationEngine-Phase1.md
   ════════════════════════════════════════════════════════════════════════════ */
import type { TimelineTransaction, BankFeeType } from '../api/bankStatementImport';
import { safeNum } from './bankTimelineFilters';

export type PresentationConfidence = 'high' | 'medium' | 'low';
export type CategorySource = 'bankFeeType' | 'direction' | 'text' | 'fallback';
export type DetailKind = 'cheque' | 'channel' | 'reference' | 'project' | 'arabic' | 'generic';

export interface SmartTransactionPresentation {
  category: {
    label:      string;
    source:     CategorySource;
    confidence: PresentationConfidence;
  };
  detail?: {
    text:       string;
    kind:       DetailKind;
    confidence: PresentationConfidence;
  };
  raw: string;
  provenance: {
    rule:      string;
    matchedOn: string;
  };
}

// Optional i18n hook. Callers pass their `t()` to localize labels; omitted in
// unit tests (and by any caller that hasn't wired it up yet) falls back to
// the Arabic literal, so behavior is identical either way.
type TranslateFn = (key: string) => string;

function tr(key: string, fallback: string, translate?: TranslateFn): string {
  return translate ? translate(key) : fallback;
}

// ── Arabic-first category labels per backend-classified bankFeeType ─────────────
// More specific than the generic type badge (which collapses all fees → "رسوم").
// A `Record<BankFeeType, …>` so the type system guarantees every enum value maps.
const FEE_TYPE_LABELS: Record<BankFeeType, { key: string; label: string }> = {
  TRANSFER_FEE:    { key: 'bank.presentation.transfer_fee',    label: 'رسوم تحويل' },
  MONTHLY_FEE:     { key: 'bank.cat.monthly_fee',               label: 'رسوم شهرية' },
  INTEREST:        { key: 'bank.presentation.interest',         label: 'فائدة' },
  CHARGE:          { key: 'bank.cat.bank_charge',                label: 'رسوم بنكية' },
  ATM_FEE:         { key: 'bank.presentation.atm_fee',          label: 'رسوم صراف آلي' },
  CHEQUEBOOK_FEE:  { key: 'bank.cat.chequebook_fee',             label: 'رسوم دفتر شيكات' },
  OTHER_FEE:       { key: 'bank.cat.other_fee',                  label: 'رسوم أخرى' },
  CASH_WITHDRAWAL: { key: 'bank.cat.cash_withdrawal',            label: 'سحب نقدي' },
  CHEQUE_PAYMENT:  { key: 'bank.presentation.cheque_payment',   label: 'دفع شيك' },
  BANK_TRANSFER:   { key: 'opt.sal.payment.bank_transfer',       label: 'تحويل بنكي' },
};

// ── Anchored, high-confidence bank phrases that refine a category label ─────────
// `family` ties each phrase to a bankFeeType so it may only *refine* a matching
// structured classification (never contradict it). Used to fill the category
// when `bankFeeType` is absent (e.g. Gulf Bank "Cheque Paid").
interface SpecificCategory {
  re:     RegExp;
  key:    string;
  label:  string;
  family: BankFeeType;
  rule:   string;
}

const SPECIFIC_CATEGORIES: SpecificCategory[] = [
  { re: /inward\s+clearing\s+cheque/i,   key: 'bank.presentation.inward_clearing_cheque',   label: 'شيك مقاصة وارد',     family: 'CHEQUE_PAYMENT',  rule: 'inward-clearing-cheque' },
  { re: /outgoing\s+clearing\s+cheque/i, key: 'bank.presentation.outgoing_clearing_cheque', label: 'شيك مقاصة صادر',     family: 'CHEQUE_PAYMENT',  rule: 'outgoing-clearing-cheque' },
  { re: /cheque\s+paid/i,                key: 'bank.presentation.cheque_payment',           label: 'دفع شيك',            family: 'CHEQUE_PAYMENT',  rule: 'cheque-paid' },
  { re: /outgoing\s+rtgs/i,              key: 'bank.presentation.outgoing_rtgs',            label: 'تحويل صادر (RTGS)',  family: 'BANK_TRANSFER',   rule: 'outgoing-rtgs' },
  { re: /atm\s+with(?:d|dr)a?wal/i,      key: 'bank.presentation.atm_withdrawal',           label: 'سحب نقدي عبر جهاز الصراف', family: 'CASH_WITHDRAWAL', rule: 'atm-withdrawal' },
  { re: /cash\s+with(?:d|dr)a?wal/i,     key: 'bank.cat.cash_withdrawal',                    label: 'سحب نقدي',           family: 'CASH_WITHDRAWAL', rule: 'cash-withdrawal' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────────

function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

function tidy(s: string): string {
  return s.replace(/^[\s,،|:–-]+/, '').replace(/[\s,،|:–-]+$/, '').replace(/\s+/g, ' ').trim();
}

function clamp(s: string, n = 48): string {
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
}

// Any run of ≥ 8 digits is treated as potentially sensitive (CIVIL ID, mobile,
// full account/instrument number) and must never be promoted to a detail line.
const SENSITIVE_DIGITS = /\d{8,}/;

function isSensitive(s: string): boolean {
  return SENSITIVE_DIGITS.test(s);
}

// Exported alias — lets other presentation-layer modules (e.g. the intelligence
// engine) reuse the same sensitive-digit-run guard instead of redefining it.
export function isSensitiveValue(s: string): boolean {
  return isSensitive(s);
}

function firstSpecific(raw: string): SpecificCategory | null {
  return SPECIFIC_CATEGORIES.find((s) => s.re.test(raw)) ?? null;
}

// ── Reusable low-level extractors ────────────────────────────────────────────
// Anchored, labelled patterns only (never fuzzy free-text matching). Exported so
// the intelligence engine (bankTransactionIntelligence.ts) can reuse the exact
// same extraction rules instead of duplicating the regexes.

export function extractInwardClearingCheque(raw: string): { number: string | null; channel: string | null } | null {
  const inward = raw.match(/inward\s+clearing\s+cheque\s*([0-9]{1,7})?/i);
  if (!inward) return null;
  const channel = raw.match(/presented\s+in\s*([A-Za-z0-9]{1,10})\b/i);
  return { number: inward[1] ?? null, channel: channel ? channel[1] : null };
}

export function extractChequeNumberLabeled(raw: string): string | null {
  const m = raw.match(/cheque\s+number:?\s*([0-9]{1,7})\b/i);
  return m ? m[1] : null;
}

export function extractPresentedChannel(raw: string): string | null {
  const m = raw.match(/presented\s+in\s*([A-Za-z0-9]{1,10})\b/i);
  return m ? m[1] : null;
}

// ── Category resolution (structured first) ──────────────────────────────────────
// Priority: bankFeeType (optionally refined by a same-family anchored phrase) →
// anchored high-confidence phrase → debit/credit direction → safe fallback.
// Every branch except the last is HIGH confidence.
interface ResolvedCategory {
  label:      string;
  source:     CategorySource;
  confidence: PresentationConfidence;
  rule:       string;
  matchedOn:  string;
}

function resolveCategory(t: TimelineTransaction, raw: string, translate?: TranslateFn): ResolvedCategory {
  const spec = firstSpecific(raw);

  if (t.bankFeeType) {
    // Structured classification wins. A same-family anchored phrase may refine
    // the label to something more specific (e.g. CHEQUE_PAYMENT → "شيك مقاصة وارد").
    if (spec && spec.family === t.bankFeeType) {
      return {
        label: tr(spec.key, spec.label, translate), source: 'bankFeeType', confidence: 'high',
        rule: `bankFeeType:${t.bankFeeType}+${spec.rule}`, matchedOn: t.bankFeeType,
      };
    }
    const feeType = FEE_TYPE_LABELS[t.bankFeeType];
    return {
      label: tr(feeType.key, feeType.label, translate), source: 'bankFeeType', confidence: 'high',
      rule: `bankFeeType:${t.bankFeeType}`, matchedOn: t.bankFeeType,
    };
  }

  if (spec) {
    const matched = spec.re.exec(raw)?.[0] ?? spec.rule;
    return {
      label: tr(spec.key, spec.label, translate), source: 'text', confidence: 'high',
      rule: `text:${spec.rule}`, matchedOn: matched,
    };
  }

  const credit = safeNum(t.credit);
  const debit  = safeNum(t.debit);
  if (credit > 0) {
    return { label: tr('bank.presentation.deposit', 'إيداع', translate), source: 'direction', confidence: 'high', rule: 'direction:credit', matchedOn: `credit=${credit}` };
  }
  if (debit > 0) {
    return { label: tr('bank.presentation.withdrawal', 'سحب', translate), source: 'direction', confidence: 'high', rule: 'direction:debit', matchedOn: `debit=${debit}` };
  }

  // Nothing structured and no amount direction: show the bank's own text, clamped.
  return {
    label: raw ? clamp(raw) : tr('bank.presentation.transaction', 'عملية', translate),
    source: 'fallback', confidence: 'low',
    rule: 'fallback:raw', matchedOn: raw ? clamp(raw) : '',
  };
}

// ── Detail resolution (single, safe, high-confidence extra) ─────────────────────
// Ordered; first safe hit wins. Never emits a candidate that duplicates the
// category label or that contains a sensitive digit run.
interface ResolvedDetail { text: string; kind: DetailKind; confidence: PresentationConfidence; }

function acceptable(candidate: string, categoryLabel: string): boolean {
  if (!candidate) return false;
  if (isSensitive(candidate)) return false;
  // No duplication between line 1 and line 2 (either direction).
  if (candidate === categoryLabel) return false;
  if (categoryLabel.includes(candidate) || candidate.includes(categoryLabel)) return false;
  return true;
}

function resolveDetail(t: TimelineTransaction, raw: string, categoryLabel: string, translate?: TranslateFn): ResolvedDetail | null {
  // 1) Inward-clearing: cheque number + presented-in channel (combined).
  const inward = extractInwardClearingCheque(raw);
  if (inward) {
    const num  = inward.number ? `${tr('bank.presentation.number_prefix', 'رقم', translate)} ${inward.number}` : '';
    const parts = [num, inward.channel ? `${tr('bank.presentation.presented_at', 'مقدَّم في', translate)} ${inward.channel}` : ''].filter(Boolean);
    const text = parts.join(' · ');
    if (acceptable(text, categoryLabel)) return { text, kind: num ? 'cheque' : 'channel', confidence: 'high' };
  }

  // 2) Cheque number from an anchored "Cheque Number: N" label.
  const chqNum = extractChequeNumberLabeled(raw);
  if (chqNum) {
    const text = `${tr('bank.presentation.cheque_no', 'شيك رقم', translate)} ${chqNum}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'cheque', confidence: 'high' };
  }

  // 3) Structured cheque-number field (NBK/KFH), when short & non-sensitive.
  if (t.chequeNumber && /^[0-9]{1,7}$/.test(t.chequeNumber.trim())) {
    const text = `${tr('bank.presentation.cheque_no', 'شيك رقم', translate)} ${t.chequeNumber.trim()}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'cheque', confidence: 'high' };
  }

  // 4) Standalone "Presented in XXX" channel.
  const chan = extractPresentedChannel(raw);
  if (chan) {
    const text = `${tr('bank.presentation.presented_at', 'مقدَّم في', translate)} ${chan}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'channel', confidence: 'high' };
  }

  // 5) Explicit structured reference field (non-sensitive).
  if (t.reference) {
    const ref = t.reference.trim();
    if (ref && !isSensitive(ref) && !raw.includes(ref)) {
      const text = `${tr('bank.presentation.reference_prefix', 'مرجع', translate)} ${ref}`;
      if (acceptable(text, categoryLabel)) return { text, kind: 'reference', confidence: 'high' };
    }
  }

  // 6) Verbatim Arabic mirror from a mixed Latin/Arabic description.
  const arabic = raw.match(/[؀-ۿ][؀-ۿ\s0-9]{3,}/);
  if (arabic && /[A-Za-z]/.test(raw)) {
    const text = tidy(arabic[0]);
    if (acceptable(text, categoryLabel)) return { text, kind: 'arabic', confidence: 'medium' };
  }

  // 7) Explicitly-labelled project hint (safe: labelled + short token).
  const project = raw.match(/(?:project|مشروع)\s+([A-Za-z0-9-]{1,12})/i);
  if (project) {
    const text = `${tr('bank.presentation.project_prefix', 'مشروع', translate)} ${project[1]}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'project', confidence: 'medium' };
  }

  return null;
}

// ── Public entry point ──────────────────────────────────────────────────────────
// `translate` is optional: pass the caller's `t()` to localize labels in
// English mode. Omitted (e.g. in unit tests), every label is the original
// Arabic literal — behavior is unchanged.

export function presentTransaction(t: TimelineTransaction, translate?: TranslateFn): SmartTransactionPresentation {
  const raw = collapse(t.description ?? '');
  const category = resolveCategory(t, raw, translate);
  const detail = resolveDetail(t, raw, category.label, translate);

  return {
    category: { label: category.label, source: category.source, confidence: category.confidence },
    ...(detail ? { detail } : {}),
    raw,
    provenance: { rule: category.rule, matchedOn: category.matchedOn },
  };
}

// Arabic labels for confidence levels (Audit tab display).
// NOTE: kept as raw Arabic (not routed through t()) because this constant is
// pinned byte-for-byte by __tests__/bankTransactionPresentation.test.ts.
// Callers that need a localized confidence label should map
// PresentationConfidence -> 'opt.maint.sev_high' / '_medium' / '_low' and
// call their own t() — see BankAccountExplorer.tsx.
export const CONFIDENCE_LABELS: Record<PresentationConfidence, string> = {
  high:   'عالية',
  medium: 'متوسطة',
  low:    'منخفضة',
};
