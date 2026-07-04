// Payroll-bank import quality score — informational only. Combines match
// coverage, hard errors, warnings, duplicate risk, IBAN validity, salary
// anomalies, and missing expected employees into a single 0..100 indicator.
// Never affects whether an import can execute. Pure function.

import type { QualityBreakdown } from './types';

export interface QualityInput {
  totalRows: number;
  matched: number;
  invalid: number;       // rows with blocking errors
  unmatched: number;     // rows with no employee match
  warningRows: number;   // rows carrying any warning (validator or assistant)
  duplicates: number;    // rows flagged as duplicates
  ibanChecked: number;
  ibanInvalid: number;
  anomalyCount: number;  // rows with a salary-anomaly warning
  missingCount: number;  // employees expected but absent from the file
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

export function computeQuality(q: QualityInput): QualityBreakdown {
  const rows = Math.max(q.totalRows, 1);

  const matchScore       = round1((q.matched / rows) * 100);
  const errorPenalty     = round1((q.invalid / rows) * 40);
  const unmatchedPenalty = round1((q.unmatched / rows) * 25);
  const warningPenalty   = round1((q.warningRows / rows) * 10);
  const duplicatePenalty = round1((q.duplicates / rows) * 10);
  const ibanPenalty      = q.ibanChecked > 0 ? round1((q.ibanInvalid / q.ibanChecked) * 8) : 0;
  const anomalyPenalty   = round1((q.anomalyCount / rows) * 8);
  const missingPenalty   = round1(clamp(q.missingCount * 2, 0, 15));

  const score = round1(
    clamp(
      100 - errorPenalty - unmatchedPenalty - warningPenalty - duplicatePenalty - ibanPenalty - anomalyPenalty - missingPenalty,
      0,
      100,
    ),
  );

  return {
    score,
    matchScore,
    errorPenalty,
    unmatchedPenalty,
    warningPenalty,
    duplicatePenalty,
    ibanPenalty,
    anomalyPenalty,
    missingPenalty,
  };
}
