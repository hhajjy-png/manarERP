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

// ── Arabic-first category labels per backend-classified bankFeeType ─────────────
// More specific than the generic type badge (which collapses all fees → "رسوم").
// A `Record<BankFeeType, …>` so the type system guarantees every enum value maps.
const FEE_TYPE_LABELS: Record<BankFeeType, string> = {
  TRANSFER_FEE:    'رسوم تحويل',
  MONTHLY_FEE:     'رسوم شهرية',
  INTEREST:        'فائدة',
  CHARGE:          'رسوم بنكية',
  ATM_FEE:         'رسوم صراف آلي',
  CHEQUEBOOK_FEE:  'رسوم دفتر شيكات',
  OTHER_FEE:       'رسوم أخرى',
  CASH_WITHDRAWAL: 'سحب نقدي',
  CHEQUE_PAYMENT:  'دفع شيك',
  BANK_TRANSFER:   'تحويل بنكي',
};

// ── Anchored, high-confidence bank phrases that refine a category label ─────────
// `family` ties each phrase to a bankFeeType so it may only *refine* a matching
// structured classification (never contradict it). Used to fill the category
// when `bankFeeType` is absent (e.g. Gulf Bank "Cheque Paid").
interface SpecificCategory {
  re:     RegExp;
  label:  string;
  family: BankFeeType;
  rule:   string;
}

const SPECIFIC_CATEGORIES: SpecificCategory[] = [
  { re: /inward\s+clearing\s+cheque/i,   label: 'شيك مقاصة وارد',   family: 'CHEQUE_PAYMENT',  rule: 'inward-clearing-cheque' },
  { re: /outgoing\s+clearing\s+cheque/i, label: 'شيك مقاصة صادر',   family: 'CHEQUE_PAYMENT',  rule: 'outgoing-clearing-cheque' },
  { re: /cheque\s+paid/i,                label: 'دفع شيك',          family: 'CHEQUE_PAYMENT',  rule: 'cheque-paid' },
  { re: /outgoing\s+rtgs/i,              label: 'تحويل صادر (RTGS)', family: 'BANK_TRANSFER',   rule: 'outgoing-rtgs' },
  { re: /atm\s+with(?:d|dr)a?wal/i,      label: 'سحب نقدي (صراف آلي)', family: 'CASH_WITHDRAWAL', rule: 'atm-withdrawal' },
  { re: /cash\s+with(?:d|dr)a?wal/i,     label: 'سحب نقدي',          family: 'CASH_WITHDRAWAL', rule: 'cash-withdrawal' },
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

function firstSpecific(raw: string): SpecificCategory | null {
  return SPECIFIC_CATEGORIES.find((s) => s.re.test(raw)) ?? null;
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

function resolveCategory(t: TimelineTransaction, raw: string): ResolvedCategory {
  const spec = firstSpecific(raw);

  if (t.bankFeeType) {
    // Structured classification wins. A same-family anchored phrase may refine
    // the label to something more specific (e.g. CHEQUE_PAYMENT → "شيك مقاصة وارد").
    if (spec && spec.family === t.bankFeeType) {
      return {
        label: spec.label, source: 'bankFeeType', confidence: 'high',
        rule: `bankFeeType:${t.bankFeeType}+${spec.rule}`, matchedOn: t.bankFeeType,
      };
    }
    return {
      label: FEE_TYPE_LABELS[t.bankFeeType], source: 'bankFeeType', confidence: 'high',
      rule: `bankFeeType:${t.bankFeeType}`, matchedOn: t.bankFeeType,
    };
  }

  if (spec) {
    const matched = spec.re.exec(raw)?.[0] ?? spec.rule;
    return {
      label: spec.label, source: 'text', confidence: 'high',
      rule: `text:${spec.rule}`, matchedOn: matched,
    };
  }

  const credit = safeNum(t.credit);
  const debit  = safeNum(t.debit);
  if (credit > 0) {
    return { label: 'إيداع', source: 'direction', confidence: 'high', rule: 'direction:credit', matchedOn: `credit=${credit}` };
  }
  if (debit > 0) {
    return { label: 'سحب', source: 'direction', confidence: 'high', rule: 'direction:debit', matchedOn: `debit=${debit}` };
  }

  // Nothing structured and no amount direction: show the bank's own text, clamped.
  return {
    label: raw ? clamp(raw) : 'عملية',
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

function resolveDetail(t: TimelineTransaction, raw: string, categoryLabel: string): ResolvedDetail | null {
  // 1) Inward-clearing: cheque number + presented-in channel (combined).
  const inward = raw.match(/inward\s+clearing\s+cheque\s*([0-9]{1,7})?/i);
  if (inward) {
    const num  = inward[1] ? `رقم ${inward[1]}` : '';
    const chan = raw.match(/presented\s+in\s*([A-Za-z0-9]{1,10})\b/i);
    const parts = [num, chan ? `مقدَّم في ${chan[1]}` : ''].filter(Boolean);
    const text = parts.join(' · ');
    if (acceptable(text, categoryLabel)) return { text, kind: num ? 'cheque' : 'channel', confidence: 'high' };
  }

  // 2) Cheque number from an anchored "Cheque Number: N" label.
  const chqText = raw.match(/cheque\s+number:?\s*([0-9]{1,7})\b/i);
  if (chqText) {
    const text = `شيك رقم ${chqText[1]}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'cheque', confidence: 'high' };
  }

  // 3) Structured cheque-number field (NBK/KFH), when short & non-sensitive.
  if (t.chequeNumber && /^[0-9]{1,7}$/.test(t.chequeNumber.trim())) {
    const text = `شيك رقم ${t.chequeNumber.trim()}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'cheque', confidence: 'high' };
  }

  // 4) Standalone "Presented in XXX" channel.
  const chan = raw.match(/presented\s+in\s*([A-Za-z0-9]{1,10})\b/i);
  if (chan) {
    const text = `مقدَّم في ${chan[1]}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'channel', confidence: 'high' };
  }

  // 5) Explicit structured reference field (non-sensitive).
  if (t.reference) {
    const ref = t.reference.trim();
    if (ref && !isSensitive(ref) && !raw.includes(ref)) {
      const text = `مرجع ${ref}`;
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
    const text = `مشروع ${project[1]}`;
    if (acceptable(text, categoryLabel)) return { text, kind: 'project', confidence: 'medium' };
  }

  return null;
}

// ── Public entry point ──────────────────────────────────────────────────────────

export function presentTransaction(t: TimelineTransaction): SmartTransactionPresentation {
  const raw = collapse(t.description ?? '');
  const category = resolveCategory(t, raw);
  const detail = resolveDetail(t, raw, category.label);

  return {
    category: { label: category.label, source: category.source, confidence: category.confidence },
    ...(detail ? { detail } : {}),
    raw,
    provenance: { rule: category.rule, matchedOn: category.matchedOn },
  };
}

// Arabic labels for confidence levels (Audit tab display).
export const CONFIDENCE_LABELS: Record<PresentationConfidence, string> = {
  high:   'عالية',
  medium: 'متوسطة',
  low:    'منخفضة',
};
