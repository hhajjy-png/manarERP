// ─── Dashboard Skill (AI-2.5) ─────────────────────────────────────────────────
// Wraps GET /dashboard/overview, /dashboard/trend, /dashboard/operational.
// Read-only. No backend changes.

import { api } from '../../api/client';
import { formatCurrency, formatPercent } from '../../lib/format';
import type { SkillResult } from '../types';
import { computeQuality } from '../qualityEngine';

const SKILL_ID    = 'dashboard';
const SKILL_TITLE = 'مهارة مؤشرات لوحة التحكم';

const SOURCES = [
  { icon: '📈', labelAr: 'لوحة التحكم',  routePath: '/' },
  { icon: '📊', labelAr: 'مركز التقارير', routePath: '/reports' },
];

const FOLLOW_UPS = [
  'اعرض ملخص لوحة التحكم',
  'اعرض إجمالي الإيرادات',
  'اعرض الأرباح',
  'اعرض التنبيهات',
  'اعرض المؤشرات الرئيسية',
  'حالة المعدات',
  'توزيع العملاء',
];

const RELATED_SKILLS = [
  { skillId: 'bank-statement', labelAr: 'كشف الحساب البنكي', promptSuggestion: 'لخّص آخر كشف حساب مستورد' },
  { skillId: 'payroll',        labelAr: 'تحليل الرواتب',     promptSuggestion: 'لخّص رواتب هذا الشهر' },
  { skillId: 'contracts',      labelAr: 'تحليل العقود',      promptSuggestion: 'اعرض العقود النشطة' },
];

const RELATED_PAGES = [
  { path: '/',  labelAr: 'لوحة التحكم', icon: '📈' },
  { path: '/invoices',   labelAr: 'الفواتير',     icon: '📄' },
  { path: '/accounting', labelAr: 'المحاسبة',     icon: '💳' },
];

const ACTIONS = [
  { kind: 'openModule' as const,   labelAr: 'فتح اللوحة',  icon: '📈', available: true, payload: '/' },
  { kind: 'copySummary' as const,  labelAr: 'نسخ الملخص', icon: '📋', available: true },
  { kind: 'exportResult' as const, labelAr: 'تصدير txt',  icon: '📄', available: true },
  { kind: 'print' as const,        labelAr: 'طباعة',       icon: '🖨️', available: true },
];

const EXPLANATION_STEPS_BASE = [
  { step: 1, labelAr: 'جلب نظرة عامة',   detailAr: 'GET /dashboard/overview' },
  { step: 2, labelAr: 'معالجة البيانات', detailAr: 'استخراج المؤشرات محلياً' },
];

const EXPLANATION_STEPS_REVENUE = [
  { step: 1, labelAr: 'جلب نظرة عامة',       detailAr: 'GET /dashboard/overview' },
  { step: 2, labelAr: 'جلب بيانات الاتجاه',  detailAr: 'GET /dashboard/trend' },
  { step: 3, labelAr: 'حساب المؤشرات المالية', detailAr: 'إيرادات، مصروفات، ربح' },
  { step: 4, labelAr: 'حساب جودة البيانات',   detailAr: 'computeQuality() — محلي' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'stable' as const,
  capabilities: ['KPIs', 'الإيرادات', 'الأرباح', 'التنبيهات', 'المعدات', 'العملاء'],
  dependentModules: ['dashboard', 'contracts', 'employees', 'equipment', 'invoices'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
};

interface DashboardOverview {
  contracts:  { total: number; active: number; monthlyTransportTotal: number };
  customers:  { total: number; government: number; private: number };
  employees:  { active: number };
  equipment:  { total: number; notWorking: number };
  finance:    {
    totalRevenue: number; totalExpense: number; netProfit: number;
    monthlyExpense: number; dueInvoicesAmount: number; dueInvoicesCount: number;
  };
}

interface TrendPoint { label: string; revenue: number; expense: number; }

interface OperationalSummary {
  pendingExpenses?: number;
  draftPayrolls?:  number;
  overdueInvoices?: number;
}

const kd  = (n: number) => formatCurrency(n);
const pct = (a: number, b: number) => b > 0 ? formatPercent((a / b) * 100, 1) : '—';

function errResult(prompt: string, intent: string, err: unknown, t0: number): SkillResult {
  const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'خطأ في جلب بيانات لوحة التحكم',
    summary: 'تعذّر الحصول على بيانات لوحة التحكم.',
    statistics: [], warnings: [{ message: msg, severity: 'danger' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isError: true, errorMessage: msg,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

export async function executeDashboardSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();
  try {
    const apiT0 = Date.now();
    const ovRes = await api.get<{ data: DashboardOverview }>('/dashboard/overview');
    const apiMs = Date.now() - apiT0;
    const ov    = ovRes.data.data;
    const f     = ov.finance;

    const richSources = [
      { module: 'dashboard', datasetName: 'نظرة عامة', dataCompleteness: 95, sourceType: 'primary' as const },
    ];

    const diagnostics = {
      routerMs: 0, skillMs: Date.now() - t0, apiMs,
      recordsAnalyzed: 1, cardsRendered: 2,
    };

    // ── intent: revenue ────────────────────────────────────────────────────
    if (intent === 'revenue') {
      let trend: TrendPoint[] = [];
      let trendApiMs = 0;
      try {
        const tT0 = Date.now();
        const tRes = await api.get<{ data: TrendPoint[] }>('/dashboard/trend');
        trendApiMs = Date.now() - tT0;
        trend = tRes.data.data ?? [];
      } catch { /* non-fatal */ }

      const recent6 = trend.slice(-6);
      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords:    Math.max(recent6.length, 1),
        completeRecords: recent6.filter(p => p.revenue > 0 || p.expense > 0).length,
        warningCount:    f.netProfit < 0 ? 1 : 0,
        missingFields:   recent6.length === 0 ? ['بيانات الاتجاه'] : [],
      });

      const richSourcesRevenue = [
        ...richSources,
        { module: 'dashboard', datasetName: 'بيانات الاتجاه الشهري', recordCount: recent6.length, dataCompleteness: recent6.length > 0 ? 90 : 30, sourceType: 'aggregated' as const },
      ];

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'الإيرادات',
        summary: `إجمالي الإيرادات المسجّلة: ${kd(f.totalRevenue)}. صافي الربح: ${kd(f.netProfit)}.`,
        capabilityLevel: 'partial',
        highlights: [
          { icon: '💵', labelAr: 'إجمالي الإيرادات', value: kd(f.totalRevenue), kind: 'money' },
          { icon: '💸', labelAr: 'إجمالي المصروفات', value: kd(f.totalExpense), kind: 'money' },
          { icon: '📈', labelAr: 'صافي الربح',       value: kd(f.netProfit),   kind: 'money' },
        ],
        statistics: [
          { labelAr: 'إجمالي الإيرادات', value: kd(f.totalRevenue), kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
          { labelAr: 'إجمالي المصروفات', value: kd(f.totalExpense), kind: 'money' },
          { labelAr: 'صافي الربح',       value: kd(f.netProfit),   kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
          { labelAr: 'هامش الربح',       value: pct(f.netProfit, f.totalRevenue), kind: 'percent' },
        ],
        cards: recent6.length ? [{
          titleAr: 'الإيرادات والمصروفات — آخر 6 أشهر',
          rows: recent6.map(t => ({
            labelAr: t.label,
            value: `إيراد ${kd(t.revenue)} | مصروف ${kd(t.expense)}`,
            kind: 'text' as const,
          })),
        }] : [],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_REVENUE,
        richSources: richSourcesRevenue,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, apiMs: apiMs + trendApiMs, skillMs: Date.now() - t0 },
        warnings: f.netProfit < 0
          ? [{ message: `خسارة صافية: ${kd(Math.abs(f.netProfit))} — يُنصح بمراجعة التقارير المالية.`, severity: 'danger' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: profit ─────────────────────────────────────────────────────
    if (intent === 'profit') {
      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords: 1, completeRecords: 1, warningCount: f.netProfit < 0 ? 1 : 0, missingFields: [],
      });
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'الأرباح والخسائر',
        summary: `صافي الربح: ${kd(f.netProfit)} (إيرادات ${kd(f.totalRevenue)} — مصروفات ${kd(f.totalExpense)}).`,
        capabilityLevel: 'partial',
        highlights: [
          { icon: f.netProfit >= 0 ? '📈' : '📉', labelAr: 'صافي الربح',        value: kd(f.netProfit),    kind: 'money' },
          { icon: '💵', labelAr: 'الإيرادات الإجمالية', value: kd(f.totalRevenue), kind: 'money' },
          { icon: '💸', labelAr: 'المصروفات الإجمالية', value: kd(f.totalExpense), kind: 'money' },
          { icon: '📅', labelAr: 'مصروفات الشهر',       value: kd(f.monthlyExpense), kind: 'money' },
        ],
        statistics: [
          { labelAr: 'صافي الربح',           value: kd(f.netProfit),    kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
          { labelAr: 'هامش الربح',           value: pct(f.netProfit, f.totalRevenue), kind: 'percent' },
          { labelAr: 'نسبة المصروفات',       value: pct(f.totalExpense, f.totalRevenue), kind: 'percent' },
          { labelAr: 'مصروفات الشهر الحالي', value: kd(f.monthlyExpense), kind: 'money' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_BASE,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: f.netProfit < 0
          ? [{ message: `النظام يسجّل خسارة صافية بقيمة ${kd(Math.abs(f.netProfit))}.`, severity: 'danger' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: alerts ─────────────────────────────────────────────────────
    if (intent === 'alerts') {
      let ops: OperationalSummary = {};
      let opsApiMs = 0;
      try {
        const oT0 = Date.now();
        const opsRes = await api.get<{ data: OperationalSummary }>('/dashboard/operational');
        opsApiMs = Date.now() - oT0;
        ops = opsRes.data.data ?? {};
      } catch { /* non-fatal */ }

      const warnings = [];
      if (f.dueInvoicesCount > 0) {
        warnings.push({ message: `${f.dueInvoicesCount} فاتورة مستحقة بقيمة ${kd(f.dueInvoicesAmount)}.`, severity: 'warning' as const });
      }
      if ((ops.pendingExpenses ?? 0) > 0) {
        warnings.push({ message: `${ops.pendingExpenses} مصروف معلّق يحتاج اعتماداً.`, severity: 'info' as const });
      }
      if ((ops.draftPayrolls ?? 0) > 0) {
        warnings.push({ message: `${ops.draftPayrolls} كشف رواتب مسوّدة لم يُعتمد بعد.`, severity: 'info' as const });
      }
      if (ov.equipment.notWorking > 0) {
        warnings.push({ message: `${ov.equipment.notWorking} معدة خارج الخدمة من أصل ${ov.equipment.total}.`, severity: 'warning' as const });
      }

      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords: 1, completeRecords: 1, warningCount: warnings.length, missingFields: [],
      });

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'تنبيهات النظام',
        summary: warnings.length
          ? `رُصد ${warnings.length} تنبيه يستوجب المتابعة.`
          : 'لا توجد تنبيهات عاجلة حالياً — الوضع طبيعي.',
        capabilityLevel: 'complete',
        statistics: [
          { labelAr: 'فواتير مستحقة',     value: f.dueInvoicesCount,    kind: 'count' },
          { labelAr: 'إجمالي الفواتير',   value: kd(f.dueInvoicesAmount), kind: 'money' },
          { labelAr: 'معدات خارج الخدمة', value: ov.equipment.notWorking, kind: 'count' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: [
          { step: 1, labelAr: 'جلب نظرة عامة',          detailAr: 'GET /dashboard/overview' },
          { step: 2, labelAr: 'جلب البيانات التشغيلية', detailAr: 'GET /dashboard/operational' },
          { step: 3, labelAr: 'تجميع التنبيهات',         detailAr: 'فواتير، معدات، رواتب، مصروفات' },
        ],
        richSources: [
          ...richSources,
          { module: 'dashboard', datasetName: 'ملخص تشغيلي', dataCompleteness: 90, sourceType: 'derived' as const },
        ],
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, apiMs: apiMs + opsApiMs, skillMs: Date.now() - t0 },
        warnings: warnings.length ? warnings : [{ message: 'لا توجد تنبيهات عاجلة.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: equipment ──────────────────────────────────────────────────
    if (intent === 'equipment') {
      const workingCount  = ov.equipment.total - ov.equipment.notWorking;
      const workingPct    = ov.equipment.total > 0
        ? ((workingCount / ov.equipment.total) * 100).toFixed(1) : '0';

      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords:    ov.equipment.total || 1,
        completeRecords: workingCount,
        warningCount:    ov.equipment.notWorking > 0 ? 1 : 0,
        missingFields:   [],
      });

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'حالة المعدات والأسطول',
        summary: `${ov.equipment.total} معدة: ${workingCount} تعمل (${workingPct}%)، ${ov.equipment.notWorking} خارج الخدمة.`,
        capabilityLevel: 'complete',
        highlights: [
          { icon: '✅', labelAr: 'تعمل',              value: String(workingCount),            kind: 'count' },
          { icon: '🔴', labelAr: 'خارج الخدمة',       value: String(ov.equipment.notWorking), kind: 'count' },
          { icon: '📊', labelAr: 'نسبة التشغيل',      value: `${workingPct}%`,               kind: 'percent' },
          { icon: '🚛', labelAr: 'إجمالي المعدات',    value: String(ov.equipment.total),     kind: 'count' },
        ],
        statistics: [
          { labelAr: 'إجمالي المعدات',    value: ov.equipment.total,        kind: 'count' },
          { labelAr: 'تعمل',             value: workingCount,               kind: 'count' },
          { labelAr: 'خارج الخدمة',      value: ov.equipment.notWorking,    kind: 'count' },
          { labelAr: 'نسبة التشغيل',     value: `${workingPct}%`,           kind: 'percent' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_BASE,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: ov.equipment.notWorking > 0
          ? [{ message: `${ov.equipment.notWorking} معدة خارج الخدمة — يُنصح بالمتابعة.`, severity: 'warning' }]
          : [{ message: 'جميع المعدات تعمل.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: customers ──────────────────────────────────────────────────
    if (intent === 'customers') {
      const govPct  = ov.customers.total > 0
        ? ((ov.customers.government / ov.customers.total) * 100).toFixed(1) : '0';
      const privPct = ov.customers.total > 0
        ? ((ov.customers.private / ov.customers.total) * 100).toFixed(1) : '0';

      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords:    ov.customers.total || 1,
        completeRecords: ov.customers.government + ov.customers.private,
        warningCount:    0,
        missingFields:   ov.customers.total === 0 ? ['عملاء'] : [],
      });

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'توزيع العملاء',
        summary: `إجمالي ${ov.customers.total} عميل: ${ov.customers.government} حكوميون (${govPct}%)، ${ov.customers.private} خاصون (${privPct}%).`,
        capabilityLevel: 'complete',
        highlights: [
          { icon: '🏛️', labelAr: 'عملاء حكوميون', value: String(ov.customers.government), kind: 'count' },
          { icon: '🏢', labelAr: 'عملاء خاصون',   value: String(ov.customers.private),   kind: 'count' },
          { icon: '👥', labelAr: 'الإجمالي',       value: String(ov.customers.total),     kind: 'count' },
        ],
        statistics: [
          { labelAr: 'إجمالي العملاء',   value: ov.customers.total,      kind: 'count' },
          { labelAr: 'عملاء حكوميون',   value: ov.customers.government, kind: 'count' },
          { labelAr: 'عملاء خاصون',     value: ov.customers.private,    kind: 'count' },
          { labelAr: 'نسبة الحكوميين',  value: `${govPct}%`,            kind: 'percent' },
        ],
        cards: [{
          titleAr: 'توزيع العملاء حسب القطاع',
          rows: [
            { labelAr: `حكوميون (${govPct}%)`,  value: ov.customers.government, kind: 'count' },
            { labelAr: `خاصون (${privPct}%)`,   value: ov.customers.private,    kind: 'count' },
            { labelAr: 'الإجمالي',              value: ov.customers.total,      kind: 'count' },
          ],
        }],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_BASE,
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

    // ── intent: kpi (default) ──────────────────────────────────────────────
    const { qualityScore, qualityIssues } = computeQuality({
      totalRecords: 1, completeRecords: 1, warningCount: f.dueInvoicesCount > 0 ? 1 : 0, missingFields: [],
    });

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'kpi', prompt,
      title: 'المؤشرات الرئيسية — لوحة التحكم',
      summary:
        `لوحة التحكم: ${ov.contracts.active} عقد نشط، ${ov.employees.active} موظف، ` +
        `إيرادات ${kd(f.totalRevenue)}، صافي ربح ${kd(f.netProfit)}.`,
      capabilityLevel: 'complete',
      highlights: [
        { icon: '💰', labelAr: 'إجمالي الإيرادات', value: kd(f.totalRevenue),          kind: 'money' },
        { icon: '📈', labelAr: 'صافي الربح',        value: kd(f.netProfit),             kind: 'money' },
        { icon: '📄', labelAr: 'عقود نشطة',        value: String(ov.contracts.active), kind: 'count' },
        { icon: '👥', labelAr: 'موظفون نشطون',     value: String(ov.employees.active), kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي الإيرادات',  value: kd(f.totalRevenue),      kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
        { labelAr: 'إجمالي المصروفات',  value: kd(f.totalExpense),      kind: 'money' },
        { labelAr: 'صافي الربح',        value: kd(f.netProfit),         kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
        { labelAr: 'فواتير مستحقة',     value: kd(f.dueInvoicesAmount), kind: 'money' },
      ],
      cards: [
        {
          titleAr: 'مؤشرات العقود والعملاء',
          rows: [
            { labelAr: 'إجمالي العقود',             value: ov.contracts.total, kind: 'count' },
            { labelAr: 'عقود نشطة',                 value: ov.contracts.active, kind: 'count' },
            { labelAr: 'إجمالي قيمة النقل الشهرية', value: kd(ov.contracts.monthlyTransportTotal), kind: 'money' },
            { labelAr: 'إجمالي العملاء',            value: ov.customers.total, kind: 'count' },
            { labelAr: 'عملاء حكوميون',            value: ov.customers.government, kind: 'count' },
          ],
        },
        {
          titleAr: 'مؤشرات الموارد البشرية والمعدات',
          rows: [
            { labelAr: 'موظفون نشطون',     value: ov.employees.active, kind: 'count' },
            { labelAr: 'إجمالي المعدات',   value: ov.equipment.total, kind: 'count' },
            { labelAr: 'معدات خارج الخدمة', value: ov.equipment.notWorking, kind: 'count' },
          ],
        },
      ],
      qualityScore, qualityIssues,
      explanationSteps: EXPLANATION_STEPS_BASE,
      richSources: [
        ...richSources,
        { module: 'dashboard', datasetName: 'مؤشرات تشغيلية', dataCompleteness: 85, sourceType: 'derived' as const },
      ],
      relatedSkills: RELATED_SKILLS,
      relatedPages:  RELATED_PAGES,
      actions:       ACTIONS,
      skillMetadata: SKILL_META,
      diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
      warnings: [
        ...(f.dueInvoicesCount > 0 ? [{
          message: `${f.dueInvoicesCount} فاتورة مستحقة بقيمة ${kd(f.dueInvoicesAmount)}.`,
          severity: 'warning' as const,
        }] : []),
        ...(f.netProfit < 0 ? [{
          message: `صافي الربح سالب: ${kd(f.netProfit)}.`,
          severity: 'danger' as const,
        }] : []),
      ],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
