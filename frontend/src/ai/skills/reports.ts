// ─── Reports Discovery Skill (AI-2.5) ────────────────────────────────────────
// Two-layer: attempt GET /reports, fallback to hardcoded registry.
// No report-summary API — reports are PDF/Excel exports only.

import { api } from '../../api/client';
import type { SkillResult } from '../types';

const SKILL_ID    = 'reports';
const SKILL_TITLE = 'مهارة استكشاف التقارير';

const SOURCES = [
  { icon: '📊', labelAr: 'مركز التقارير', routePath: '/reports' },
  { icon: '📈', labelAr: 'لوحة التحكم',   routePath: '/dashboard' },
];

const FOLLOW_UPS = [
  'اعرض ملخص لوحة التحكم',
  'اعرض إجمالي الإيرادات',
  'اعرض ملخص المصروفات',
  'اعرض العقود النشطة',
];

const RELATED_SKILLS = [
  { skillId: 'dashboard', labelAr: 'لوحة التحكم',    promptSuggestion: 'اعرض المؤشرات الرئيسية' },
  { skillId: 'expenses',  labelAr: 'تحليل المصروفات', promptSuggestion: 'اعرض ملخص المصروفات' },
];

const RELATED_PAGES = [
  { path: '/reports',   labelAr: 'مركز التقارير', icon: '📊' },
  { path: '/dashboard', labelAr: 'لوحة التحكم',  icon: '📈' },
];

const ACTIONS = [
  { kind: 'openModule' as const, labelAr: 'فتح مركز التقارير', icon: '📊', available: true, payload: '/reports' },
  { kind: 'copySummary' as const, labelAr: 'نسخ الملخص', icon: '📋', available: true },
];

const EXPLANATION_STEPS = [
  { step: 1, labelAr: 'محاولة جلب قائمة التقارير', detailAr: 'GET /reports (اختياري)' },
  { step: 2, labelAr: 'الرجوع إلى السجل المدمج',  detailAr: 'إذا فشل طلب API' },
  { step: 3, labelAr: 'عرض التقارير المتاحة',      detailAr: 'مع التوصية المناسبة' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'experimental' as const,
  capabilities: ['استكشاف التقارير', 'توصية التقارير'],
  dependentModules: ['reports'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
};

interface ReportTypeEntry {
  key: string;
  nameAr: string;
  descAr: string;
  recommended?: boolean;
}

const REPORT_REGISTRY: ReportTypeEntry[] = [
  { key: 'FINANCIAL',  nameAr: 'التقرير المالي',        descAr: 'ملخص الإيرادات والمصروفات والأرباح', recommended: true },
  { key: 'PAYROLL',    nameAr: 'تقرير الرواتب',         descAr: 'تفاصيل كشوف الرواتب الشهرية' },
  { key: 'CONTRACTS',  nameAr: 'تقرير العقود',          descAr: 'قائمة العقود النشطة والمنتهية' },
  { key: 'EXPENSES',   nameAr: 'تقرير المصروفات',       descAr: 'توزيع المصروفات حسب الفئة والمورد' },
];

export async function executeReportsSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();

  // Attempt to fetch reports list; graceful fallback to registry
  let reportTypes: ReportTypeEntry[] = REPORT_REGISTRY;
  try {
    const res = await api.get<{ data: Array<{ type?: string; nameAr?: string; descAr?: string }> }>('/reports');
    const fetched = res.data.data;
    if (Array.isArray(fetched) && fetched.length > 0) {
      // Map fetched entries, fill from registry where possible
      const mapped = fetched
        .filter(r => r.type)
        .map(r => {
          const reg = REPORT_REGISTRY.find(reg => reg.key === r.type);
          return reg ?? { key: r.type!, nameAr: r.nameAr ?? r.type!, descAr: r.descAr ?? '' };
        });
      if (mapped.length > 0) reportTypes = mapped;
    }
  } catch { /* non-fatal — use registry */ }

  const recommended = reportTypes.find(r => r.recommended) ?? reportTypes[0];

  const diagnostics = {
    routerMs: 0, skillMs: Date.now() - t0, apiMs: 0,
    recordsAnalyzed: reportTypes.length, cardsRendered: 1,
  };

  // ── intent: recommend ──────────────────────────────────────────────────────
  if (intent === 'recommend') {
    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
      title: 'التقرير الموصى به',
      summary: recommended
        ? `التقرير الموصى به: ${recommended.nameAr}. ${recommended.descAr}`
        : 'انتقل إلى مركز التقارير لاختيار التقرير المناسب.',
      capabilityLevel: 'partial',
      statistics: [
        { labelAr: 'عدد التقارير المتاحة', value: reportTypes.length, kind: 'count' },
        { labelAr: 'التقرير الموصى به',    value: recommended?.nameAr ?? '—', kind: 'text' },
      ],
      cards: recommended ? [{
        titleAr: 'التقرير الموصى به',
        rows: [
          { labelAr: 'النوع',    value: recommended.nameAr, kind: 'text' },
          { labelAr: 'الوصف',   value: recommended.descAr, kind: 'text' },
          { labelAr: 'الإجراء', value: 'افتح مركز التقارير واختر هذا التقرير', kind: 'text' },
        ],
      }] : [],
      explanationSteps: EXPLANATION_STEPS,
      relatedSkills: RELATED_SKILLS,
      relatedPages:  RELATED_PAGES,
      actions:       ACTIONS,
      skillMetadata: SKILL_META,
      diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
      warnings: [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };
  }

  // ── intent: discover (default) ─────────────────────────────────────────────
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'discover', prompt,
    title: 'التقارير المتاحة — مركز التقارير',
    summary: `${reportTypes.length} تقارير متاحة في مركز التقارير. انتقل إلى المركز لتوليد وتصدير التقارير بصيغة PDF أو Excel.`,
    capabilityLevel: 'partial',
    statistics: [
      { labelAr: 'تقارير متاحة', value: reportTypes.length, kind: 'count' },
    ],
    cards: [{
      titleAr: 'قائمة التقارير',
      rows: reportTypes.map(r => ({
        labelAr: r.nameAr + (r.recommended ? ' ★' : ''),
        value: r.descAr, kind: 'text' as const,
      })),
    }],
    explanationSteps: EXPLANATION_STEPS,
    relatedSkills: RELATED_SKILLS,
    relatedPages:  RELATED_PAGES,
    actions:       ACTIONS,
    skillMetadata: SKILL_META,
    diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
    warnings: [{
      message: 'ملخصات التقارير غير متوفرة في المرحلة الحالية — التوليد والتصدير متاح مباشرةً في مركز التقارير.',
      severity: 'info',
    }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}
