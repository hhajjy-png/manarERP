// ─── Shared Quality Engine — pure function, no side effects ───────────────────
// Used by all AI-2.5 skills to compute a consistent quality score.

import type { QualityIssue } from './types';

export interface QualityInput {
  totalRecords: number;
  completeRecords: number;
  warningCount: number;
  missingFields: string[];
  customPenalties?: Array<{ reason: string; points: number }>;
}

export interface QualityOutput {
  qualityScore: number;
  qualityIssues: QualityIssue[];
}

export function computeQuality(input: QualityInput): QualityOutput {
  const issues: QualityIssue[] = [];
  let penalties = 0;

  // Completeness penalty: up to 40 points
  if (input.totalRecords > 0) {
    const incompleteFraction = 1 - input.completeRecords / input.totalRecords;
    const completenessPenalty = Math.round(incompleteFraction * 40);
    if (completenessPenalty > 0) {
      penalties += completenessPenalty;
      const pct = Math.round(incompleteFraction * 100);
      issues.push({
        severity: completenessPenalty > 20 ? 'danger' : 'warning',
        messageAr: `${pct}% من السجلات غير مكتملة البيانات`,
      });
    }
  }

  // Warning penalty: 5 pts each, capped at 20
  const warnPenalty = Math.min(input.warningCount * 5, 20);
  if (warnPenalty > 0) {
    penalties += warnPenalty;
    issues.push({
      severity: warnPenalty >= 15 ? 'warning' : 'info',
      messageAr: `${input.warningCount} تنبيه مرتبط بجودة البيانات`,
    });
  }

  // Missing fields penalty: 5 pts each, capped at 20
  const missingPenalty = Math.min(input.missingFields.length * 5, 20);
  if (missingPenalty > 0) {
    penalties += missingPenalty;
    issues.push({
      severity: 'info',
      messageAr: `حقول مفقودة: ${input.missingFields.join('، ')}`,
    });
  }

  // Custom penalties: capped at 20
  if (input.customPenalties?.length) {
    const customTotal = Math.min(
      input.customPenalties.reduce((s, p) => s + p.points, 0),
      20,
    );
    if (customTotal > 0) {
      penalties += customTotal;
      for (const cp of input.customPenalties) {
        issues.push({ severity: 'info', messageAr: cp.reason });
      }
    }
  }

  const qualityScore = Math.max(0, Math.round(100 - penalties));
  return { qualityScore, qualityIssues: issues };
}
