// ─── Reports Skill ────────────────────────────────────────────────────────────
// No report-summary API exists — reports are PDF/Excel exports only.
// Returns a structured isInsufficientData result pointing to Reports Center.
// Future phases will integrate a report-summary endpoint.

import type { SkillResult } from '../types';

const SKILL_ID    = 'reports';
const SKILL_TITLE = 'مهارة شرح التقارير';

const SOURCES = [
  { icon: '📊', labelAr: 'مركز التقارير',  routePath: '/reports' },
  { icon: '📈', labelAr: 'لوحة التحكم',    routePath: '/dashboard' },
];

const FOLLOW_UPS = [
  'اعرض ملخص لوحة التحكم',
  'اعرض إجمالي الإيرادات',
  'اعرض ملخص المصروفات',
  'اعرض العقود النشطة',
];

function buildInsufficientResult(prompt: string, intent: string): SkillResult {
  const now = Date.now();
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'مركز التقارير — ربط قيد مستقبلاً',
    summary:
      'لا تتوفر حالياً واجهة برمجية لملخصات التقارير. ' +
      'التقارير في المرحلة الحالية تُولَّد وتُصدَّر مباشرةً بصيغة PDF/Excel. ' +
      'سيتم ربط مهارة شرح التقارير بملخصات التقارير في مرحلة قادمة. ' +
      'يمكنك الانتقال إلى مركز التقارير مباشرةً من الروابط أدناه، ' +
      'أو استخدام مهارة لوحة التحكم للاطلاع على المؤشرات الرئيسية الآن.',
    statistics: [],
    warnings: [
      {
        message: 'مهارة التقارير تحتاج إلى واجهة ملخص لم تُتَح بعد. الانتقال إلى مركز التقارير متاح أدناه.',
        severity: 'info',
      },
    ],
    sources: SOURCES,
    suggestedQuestions: FOLLOW_UPS,
    isInsufficientData: true,
    executedAt: now,
    executionMs: 0,
  };
}

export function executeReportsSkill(prompt: string, intent: string): Promise<SkillResult> {
  return Promise.resolve(buildInsufficientResult(prompt, intent));
}
