// ─── Expense Skill (AI-2.5) ───────────────────────────────────────────────────
// Wraps GET /expenses/stats. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';
import { computeQuality } from '../qualityEngine';
import { formatCurrency } from '../../lib/format';
import { expenseCategoryArMap } from '../../config/expenseCategories';

const SKILL_ID    = 'expenses';
const SKILL_TITLE = 'مهارة تحليل المصروفات';

const SOURCES = [
  { icon: '💸', labelAr: 'المصروفات', routePath: '/expenses' },
  { icon: '📊', labelAr: 'التقارير',  routePath: '/reports' },
];

const FOLLOW_UPS = [
  'اعرض ملخص المصروفات',
  'اعرض أكبر المصروفات',
  'اعرض اتجاهات المصروفات',
  'اعرض مصروفات حسب المورد',
];

// مشتقّة من المصدر الموحّد للتصنيفات (config/expenseCategories.ts).
const CATEGORY_AR: Record<string, string> = expenseCategoryArMap;

const RELATED_SKILLS = [
  { skillId: 'dashboard', labelAr: 'لوحة التحكم',  promptSuggestion: 'اعرض المؤشرات الرئيسية' },
  { skillId: 'contracts', labelAr: 'تحليل العقود', promptSuggestion: 'اعرض العقود النشطة' },
];

const RELATED_PAGES = [
  { path: '/expenses', labelAr: 'المصروفات', icon: '💸' },
  { path: '/reports',  labelAr: 'التقارير',  icon: '📊' },
];

const ACTIONS = [
  { kind: 'openModule' as const,   labelAr: 'فتح المصروفات', icon: '💸', available: true, payload: '/expenses' },
  { kind: 'copySummary' as const,  labelAr: 'نسخ الملخص',   icon: '📋', available: true },
  { kind: 'exportResult' as const, labelAr: 'تصدير txt',    icon: '📄', available: true },
  { kind: 'print' as const,        labelAr: 'طباعة',         icon: '🖨️', available: true },
];

const EXPLANATION_STEPS = [
  { step: 1, labelAr: 'جلب إحصائيات المصروفات', detailAr: 'GET /expenses/stats' },
  { step: 2, labelAr: 'ترتيب الفئات تنازلياً',  detailAr: 'معالجة محلية بدون SQL' },
  { step: 3, labelAr: 'حساب جودة البيانات',      detailAr: 'computeQuality() — محلي' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'stable' as const,
  capabilities: ['ملخص المصروفات', 'أكبر الفئات', 'توزيع الموردين'],
  dependentModules: ['expenses'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
};

interface ExpenseStats {
  count: number;
  total: number;
  pendingCount: number;
  pendingTotal: number;
  byCategory: Record<string, number>;
  bySupplier?: Record<string, number>;
}

const kd = (n: number) => formatCurrency(n);

function errResult(prompt: string, intent: string, err: unknown, t0: number): SkillResult {
  const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'خطأ في جلب بيانات المصروفات',
    summary: 'تعذّر الحصول على بيانات المصروفات.',
    statistics: [], warnings: [{ message: msg, severity: 'danger' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isError: true, errorMessage: msg,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

export async function executeExpensesSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();
  try {
    const apiT0 = Date.now();
    const res   = await api.get<{ data: ExpenseStats }>('/expenses/stats');
    const apiMs = Date.now() - apiT0;
    const stats = res.data.data;

    if (!stats || stats.count === 0) {
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'لا توجد مصروفات',
        summary: 'لم يتم تسجيل أي مصروفات بعد.',
        statistics: [],
        warnings: [{ message: 'لا توجد سجلات مصروفات في النظام.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    const pendingRatio = stats.total > 0 ? stats.pendingTotal / stats.total : 0;
    const { qualityScore, qualityIssues } = computeQuality({
      totalRecords:    stats.count,
      completeRecords: stats.count - stats.pendingCount,
      warningCount:    pendingRatio > 0.3 ? 1 : 0,
      missingFields:   [],
      customPenalties: pendingRatio > 0.3
        ? [{ reason: `${Math.round(pendingRatio * 100)}% من المصروفات معلقة`, points: 10 }]
        : [],
    });

    const richSources = [{
      module:           'expenses',
      datasetName:      'إحصائيات المصروفات',
      recordCount:      stats.count,
      dataCompleteness: qualityScore,
      sourceType:       'aggregated' as const,
    }];

    const diagnostics = {
      routerMs: 0, skillMs: Date.now() - t0, apiMs,
      recordsAnalyzed: stats.count, cardsRendered: 1,
    };

    const categories = Object.entries(stats.byCategory ?? {})
      .map(([k, v]) => ({ key: k, labelAr: CATEGORY_AR[k] ?? k, amount: v }))
      .sort((a, b) => b.amount - a.amount);

    // ── intent: top ────────────────────────────────────────────────────────
    if (intent === 'top') {
      const top = categories.slice(0, 8);
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'أكبر فئات المصروفات',
        summary: `أكبر فئات الإنفاق من إجمالي ${stats.count} مصروف بقيمة ${kd(stats.total)}.`,
        capabilityLevel: 'complete',
        highlights: top.slice(0, 5).map((c, i) => ({
          icon: ['🔴','🟠','🟡','🟢','🔵'][i] ?? '•',
          labelAr: c.labelAr,
          value: kd(c.amount), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'إجمالي المصروفات', value: kd(stats.total), kind: 'money' },
          { labelAr: 'عدد المصروفات',    value: stats.count,     kind: 'count' },
          { labelAr: 'أكبر فئة',         value: top[0]?.labelAr ?? '—', kind: 'text' },
        ],
        cards: [{
          titleAr: 'توزيع المصروفات حسب الفئة',
          rows: top.map(c => ({
            labelAr: c.labelAr,
            value: kd(c.amount), kind: 'money' as const,
          })),
        }],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
        richSources,
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

    // ── intent: trends ─────────────────────────────────────────────────────
    if (intent === 'trends') {
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'اتجاهات المصروفات — قيد التطوير',
        summary: 'تحليل الاتجاهات الزمنية للمصروفات يتطلب واجهة بيانات تاريخية شهرية لم تُتَح بعد.',
        capabilityLevel: 'comingSoon',
        statistics: [
          { labelAr: 'إجمالي المصروفات الكلي', value: kd(stats.total), kind: 'money' },
          { labelAr: 'عدد المصروفات',          value: stats.count, kind: 'count' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: [{ message: 'بيانات الاتجاهات الشهرية غير متوفرة حالياً — ستُضاف في مرحلة قادمة.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: supplier ───────────────────────────────────────────────────
    if (intent === 'supplier') {
      if (!stats.bySupplier || Object.keys(stats.bySupplier).length === 0) {
        return {
          skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
          title: 'مصروفات حسب المورد — بيانات غير كافية',
          summary: 'بيانات تصنيف المصروفات حسب المورد غير متوفرة في الإحصائيات الحالية.',
          statistics: [{ labelAr: 'إجمالي المصروفات', value: kd(stats.total), kind: 'money' }],
          qualityScore, qualityIssues,
          explanationSteps: EXPLANATION_STEPS,
          richSources,
          relatedSkills: RELATED_SKILLS,
          relatedPages:  RELATED_PAGES,
          actions:       ACTIONS,
          skillMetadata: SKILL_META,
          diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
          warnings: [{ message: 'بيانات الموردين غير متوفرة في الإحصائيات الحالية.', severity: 'info' }],
          sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
          executedAt: t0, executionMs: Date.now() - t0,
        };
      }

      const suppliers = Object.entries(stats.bySupplier)
        .map(([name, amount]) => ({ name, amount }))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 8);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'أكبر الموردين حسب المصروفات',
        summary: `أكبر ${suppliers.length} موردين حسب إجمالي المصروفات من أصل ${kd(stats.total)} إجمالي.`,
        capabilityLevel: 'complete',
        highlights: suppliers.slice(0, 5).map((s, i) => ({
          icon: ['🥇','🥈','🥉','•','•'][i] ?? '•',
          labelAr: s.name,
          value: kd(s.amount), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'إجمالي المصروفات', value: kd(stats.total), kind: 'money' },
          { labelAr: 'عدد الموردين',     value: Object.keys(stats.bySupplier).length, kind: 'count' },
          { labelAr: 'أكبر مورد',        value: suppliers[0]?.name ?? '—', kind: 'text' },
        ],
        cards: [{
          titleAr: 'توزيع المصروفات حسب المورد',
          rows: suppliers.map(s => ({
            labelAr: s.name,
            value: kd(s.amount), kind: 'money' as const,
          })),
        }],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
        richSources,
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

    // ── intent: summary (default) ──────────────────────────────────────────
    const approvedTotal = stats.total - stats.pendingTotal;

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: 'ملخص المصروفات',
      summary: `إجمالي ${stats.count} مصروف بقيمة ${kd(stats.total)}، منها ${stats.pendingCount} معلّق بقيمة ${kd(stats.pendingTotal)}.`,
      capabilityLevel: 'complete',
      highlights: [
        { icon: '💸', labelAr: 'إجمالي المصروفات', value: kd(stats.total),   kind: 'money' },
        { icon: '✓',  labelAr: 'مُعتمد',           value: kd(approvedTotal), kind: 'money' },
        { icon: '⏳',  labelAr: 'معلّق',            value: kd(stats.pendingTotal), kind: 'money' },
        { icon: '🗂️', labelAr: 'عدد المصروفات',   value: String(stats.count), kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي المصروفات', value: kd(stats.total),        kind: 'money' },
        { labelAr: 'مُعتمد',           value: kd(approvedTotal),      kind: 'money' },
        { labelAr: 'معلّق',            value: kd(stats.pendingTotal), kind: 'money' },
        { labelAr: 'عدد بنود معلقة',  value: stats.pendingCount,     kind: 'count' },
      ],
      cards: [{
        titleAr: 'توزيع حسب الفئة (الأعلى)',
        rows: categories.slice(0, 8).map(c => ({
          labelAr: c.labelAr,
          value: kd(c.amount), kind: 'money' as const,
        })),
      }],
      qualityScore, qualityIssues,
      explanationSteps: EXPLANATION_STEPS,
      richSources,
      relatedSkills: RELATED_SKILLS,
      relatedPages:  RELATED_PAGES,
      actions:       ACTIONS,
      skillMetadata: SKILL_META,
      diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
      warnings: pendingRatio > 0.3
        ? [{ message: `${Math.round(pendingRatio * 100)}% من المصروفات معلّقة — يُنصح بمراجعة الاعتمادات.`, severity: 'warning' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
