// ─── Contracts Skill (AI-2.5) ─────────────────────────────────────────────────
// Wraps GET /contracts and GET /contracts/summary. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';
import { computeQuality } from '../qualityEngine';

const SKILL_ID    = 'contracts';
const SKILL_TITLE = 'مهارة تحليل العقود';

const SOURCES = [
  { icon: '📄', labelAr: 'العقود',   routePath: '/contracts' },
  { icon: '👥', labelAr: 'العملاء',  routePath: '/customers' },
];

const FOLLOW_UPS = [
  'اعرض العقود النشطة',
  'اعرض العقود القريبة من الانتهاء',
  'اعرض أكبر العقود قيمةً',
  'اعرض عقود حسب العميل',
  'لخّص العقود',
];

const RELATED_SKILLS = [
  { skillId: 'dashboard', labelAr: 'لوحة التحكم',     promptSuggestion: 'اعرض المؤشرات الرئيسية' },
  { skillId: 'expenses',  labelAr: 'تحليل المصروفات', promptSuggestion: 'اعرض ملخص المصروفات' },
];

const RELATED_PAGES = [
  { path: '/contracts', labelAr: 'العقود',  icon: '📄' },
  { path: '/customers', labelAr: 'العملاء', icon: '👥' },
];

const ACTIONS = [
  { kind: 'openModule' as const,   labelAr: 'فتح العقود', icon: '📄', available: true, payload: '/contracts' },
  { kind: 'copySummary' as const,  labelAr: 'نسخ الملخص', icon: '📋', available: true },
  { kind: 'exportResult' as const, labelAr: 'تصدير txt',  icon: '📄', available: true },
  { kind: 'print' as const,        labelAr: 'طباعة',       icon: '🖨️', available: true },
];

const EXPLANATION_STEPS_SUMMARY = [
  { step: 1, labelAr: 'جلب ملخص العقود', detailAr: 'GET /contracts/summary' },
  { step: 2, labelAr: 'حساب الإحصائيات', detailAr: 'معالجة محلية' },
];

const EXPLANATION_STEPS_LIST = [
  { step: 1, labelAr: 'جلب ملخص العقود',  detailAr: 'GET /contracts/summary' },
  { step: 2, labelAr: 'جلب قائمة العقود', detailAr: 'GET /contracts?pageSize=50' },
  { step: 3, labelAr: 'تصفية وترتيب',     detailAr: 'معالجة محلية بدون SQL' },
  { step: 4, labelAr: 'حساب جودة البيانات', detailAr: 'computeQuality() — محلي' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'stable' as const,
  capabilities: ['العقود النشطة', 'العقود المنتهية', 'أكبر العقود', 'حسب العميل'],
  dependentModules: ['contracts', 'customers'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
};

interface ContractSummaryData {
  totalContracts: number;
  activeContracts: number;
  monthlyTransportTotal: number;
}

interface ContractRecord {
  id: number;
  code: string;
  asphaltPlant: string;
  location?: string | null;
  status: string;
  startDate?: string | null;
  endDate?: string | null;
  monthlyTransportValue?: number | null;
  customer?: { id: number; name: string } | null;
}

interface ContractListResponse {
  data: ContractRecord[];
  total: number;
}

const kd = (n: number) => `${Number(n).toFixed(3)} د.ك`;

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function errResult(prompt: string, intent: string, err: unknown, t0: number): SkillResult {
  const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'خطأ في جلب بيانات العقود',
    summary: 'تعذّر الحصول على بيانات العقود.',
    statistics: [], warnings: [{ message: msg, severity: 'danger' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isError: true, errorMessage: msg,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

export async function executeContractsSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();
  try {
    const apiT0 = Date.now();
    const summaryRes = await api.get<{ data: ContractSummaryData }>('/contracts/summary');
    const summary    = summaryRes.data.data;

    // ── intent: summary ────────────────────────────────────────────────────
    if (intent === 'summary') {
      const apiMs = Date.now() - apiT0;
      const { qualityScore, qualityIssues } = computeQuality({
        totalRecords:    summary.totalContracts || 1,
        completeRecords: summary.activeContracts,
        warningCount:    summary.activeContracts === 0 ? 1 : 0,
        missingFields:   [],
      });
      const richSources = [
        { module: 'contracts', datasetName: 'ملخص العقود', dataCompleteness: qualityScore, sourceType: 'aggregated' as const },
      ];
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'ملخص العقود',
        summary: `إجمالي ${summary.totalContracts} عقد، منها ${summary.activeContracts} نشط. إجمالي قيمة النقل الشهرية ${kd(summary.monthlyTransportTotal)}.`,
        capabilityLevel: 'complete',
        statistics: [
          { labelAr: 'إجمالي العقود',       value: summary.totalContracts,       kind: 'count' },
          { labelAr: 'العقود النشطة',        value: summary.activeContracts,      kind: 'count' },
          { labelAr: 'إجمالي النقل الشهري', value: kd(summary.monthlyTransportTotal), kind: 'money' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_SUMMARY,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics: { routerMs: 0, skillMs: Date.now() - t0, apiMs, recordsAnalyzed: summary.totalContracts, cardsRendered: 0 },
        warnings: summary.activeContracts === 0
          ? [{ message: 'لا توجد عقود نشطة حالياً.', severity: 'warning' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // For other intents, fetch the contract list
    const listRes = await api.get<{ data: ContractListResponse }>(
      '/contracts',
      { params: { status: intent === 'active' ? 'ACTIVE' : undefined, pageSize: 50 } },
    );
    const apiMs = Date.now() - apiT0;

    const contracts: ContractRecord[] = (listRes.data.data.data ?? []).map(c => ({
      ...c,
      monthlyTransportValue: c.monthlyTransportValue != null ? Number(c.monthlyTransportValue) : null,
    }));

    const missingEndDate = contracts.filter(c => !c.endDate).length;
    const missingValue   = contracts.filter(c => c.monthlyTransportValue == null).length;
    const missingFields  = [
      ...(missingEndDate > 0 ? ['تاريخ الانتهاء'] : []),
      ...(missingValue   > 0 ? ['قيمة النقل']     : []),
    ];
    const { qualityScore, qualityIssues } = computeQuality({
      totalRecords:    contracts.length || 1,
      completeRecords: contracts.filter(c => c.endDate && c.monthlyTransportValue != null).length,
      warningCount:    0,
      missingFields,
    });

    const richSources = [
      { module: 'contracts', datasetName: 'ملخص العقود', dataCompleteness: 95, sourceType: 'aggregated' as const },
      { module: 'contracts', datasetName: 'قائمة العقود', recordCount: contracts.length, dataCompleteness: qualityScore, sourceType: 'primary' as const },
    ];

    const diagnostics = {
      routerMs: 0, skillMs: Date.now() - t0, apiMs,
      recordsAnalyzed: contracts.length, cardsRendered: 1,
    };

    // ── intent: active ─────────────────────────────────────────────────────
    if (intent === 'active') {
      const active = contracts.filter(c => c.status === 'ACTIVE');
      if (!active.length) {
        return {
          skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
          title: 'العقود النشطة',
          summary: 'لا توجد عقود نشطة حالياً.',
          capabilityLevel: 'complete',
          statistics: [{ labelAr: 'العقود النشطة', value: 0, kind: 'count' }],
          qualityScore, qualityIssues,
          explanationSteps: EXPLANATION_STEPS_LIST,
          richSources,
          relatedSkills: RELATED_SKILLS,
          relatedPages:  RELATED_PAGES,
          actions:       ACTIONS,
          skillMetadata: SKILL_META,
          diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
          warnings: [{ message: 'لا توجد عقود نشطة في النظام.', severity: 'warning' }],
          sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
          executedAt: t0, executionMs: Date.now() - t0,
        };
      }
      const totalMonthly = active.reduce((s, c) => s + (c.monthlyTransportValue ?? 0), 0);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `العقود النشطة (${active.length})`,
        summary: `${active.length} عقد نشط بإجمالي قيمة نقل شهرية ${kd(totalMonthly)}.`,
        capabilityLevel: 'complete',
        highlights: active.slice(0, 8).map(c => ({
          icon: '📄',
          labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
          value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'العقود النشطة',        value: active.length, kind: 'count' },
          { labelAr: 'إجمالي النقل الشهري', value: kd(totalMonthly), kind: 'money' },
        ],
        cards: [{
          titleAr: 'قائمة العقود النشطة',
          rows: active.slice(0, 20).map(c => ({
            labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
            value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
          })),
        }],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_LIST,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: expiring ───────────────────────────────────────────────────
    if (intent === 'expiring') {
      const DAYS_WINDOW = 90;
      const expiring = contracts
        .filter(c => {
          const d = daysUntil(c.endDate);
          return d !== null && d >= 0 && d <= DAYS_WINDOW;
        })
        .sort((a, b) => {
          const da = daysUntil(a.endDate) ?? 9999;
          const db = daysUntil(b.endDate) ?? 9999;
          return da - db;
        });

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `العقود القريبة من الانتهاء (${DAYS_WINDOW} يوم)`,
        summary: expiring.length
          ? `${expiring.length} عقد تنتهي خلال ${DAYS_WINDOW} يوماً.`
          : `لا توجد عقود تنتهي خلال ${DAYS_WINDOW} يوماً القادمة.`,
        capabilityLevel: 'partial',
        highlights: expiring.slice(0, 6).map(c => {
          const days = daysUntil(c.endDate);
          return {
            icon: days !== null && days <= 30 ? '🔴' : '🟡',
            labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
            value: `${days} يوم`, kind: 'text' as const,
          };
        }),
        statistics: [
          { labelAr: 'عقود تنتهي قريباً', value: expiring.length, kind: 'count' },
          { labelAr: 'خلال 30 يوم',       value: expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length, kind: 'count' },
        ],
        cards: expiring.length ? [{
          titleAr: 'جدول انتهاء العقود',
          rows: expiring.slice(0, 15).map(c => ({
            labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
            value: c.endDate ? new Date(c.endDate).toLocaleDateString('ar-KW') : '—',
            kind: 'date' as const,
          })),
        }] : [],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_LIST,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length > 0
          ? [{ message: `${expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length} عقد تنتهي خلال 30 يوماً — يستوجب الاهتمام.`, severity: 'danger' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: customer ───────────────────────────────────────────────────
    if (intent === 'customer') {
      const byCustomer = new Map<string, { total: number; count: number }>();
      for (const c of contracts) {
        const name = c.customer?.name ?? null;
        if (!name) continue;
        const existing = byCustomer.get(name);
        if (existing) {
          existing.total += c.monthlyTransportValue ?? 0;
          existing.count += 1;
        } else {
          byCustomer.set(name, { total: c.monthlyTransportValue ?? 0, count: 1 });
        }
      }

      if (byCustomer.size === 0) {
        return {
          skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
          title: 'عقود حسب العميل — بيانات غير كافية',
          summary: 'بيانات العملاء غير مرتبطة بالعقود المستردة حالياً.',
          capabilityLevel: 'partial',
          statistics: [{ labelAr: 'إجمالي العقود', value: contracts.length, kind: 'count' }],
          qualityScore, qualityIssues,
          explanationSteps: EXPLANATION_STEPS_LIST,
          richSources,
          relatedSkills: RELATED_SKILLS,
          relatedPages:  RELATED_PAGES,
          actions:       ACTIONS,
          skillMetadata: SKILL_META,
          diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
          warnings: [{ message: 'لا تتوفر بيانات العملاء مرتبطة بالعقود.', severity: 'info' }],
          sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
          executedAt: t0, executionMs: Date.now() - t0,
        };
      }

      const topCustomers = [...byCustomer.entries()]
        .sort(([, a], [, b]) => b.total - a.total)
        .slice(0, 10);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'العقود حسب العميل',
        summary: `${byCustomer.size} عميل. أكبر عميل: ${topCustomers[0]?.[0] ?? '—'} بقيمة ${kd(topCustomers[0]?.[1].total ?? 0)}.`,
        capabilityLevel: 'complete',
        highlights: topCustomers.slice(0, 5).map(([name, v], i) => ({
          icon: ['🥇','🥈','🥉','•','•'][i] ?? '•',
          labelAr: name,
          value: kd(v.total), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'عدد العملاء',     value: byCustomer.size, kind: 'count' },
          { labelAr: 'إجمالي العقود',   value: contracts.length, kind: 'count' },
          { labelAr: 'أكبر عميل',       value: topCustomers[0]?.[0] ?? '—', kind: 'text' },
        ],
        cards: [{
          titleAr: 'قيمة العقود حسب العميل',
          rows: topCustomers.map(([name, v]) => ({
            labelAr: `${name} (${v.count} عقد)`,
            value: kd(v.total), kind: 'money' as const,
          })),
        }],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS_LIST,
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

    // ── intent: top ────────────────────────────────────────────────────────
    const sorted = [...contracts]
      .sort((a, b) => (b.monthlyTransportValue ?? 0) - (a.monthlyTransportValue ?? 0))
      .slice(0, 10);

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'top', prompt,
      title: 'أكبر العقود قيمةً',
      summary: `أكبر ${sorted.length} عقود حسب قيمة النقل الشهرية.`,
      capabilityLevel: 'partial',
      highlights: sorted.slice(0, 5).map((c, i) => ({
        icon: ['🥇','🥈','🥉','•','•'][i] ?? '•',
        labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
        value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
      })),
      statistics: [
        { labelAr: 'أعلى عقد',   value: kd(sorted[0]?.monthlyTransportValue ?? 0), kind: 'money' },
        { labelAr: 'عدد العقود', value: contracts.length, kind: 'count' },
      ],
      cards: [{
        titleAr: 'أكبر العقود',
        rows: sorted.map((c, i) => ({
          labelAr: `${i + 1}. ${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
          value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
        })),
      }],
      qualityScore, qualityIssues,
      explanationSteps: EXPLANATION_STEPS_LIST,
      richSources,
      relatedSkills: RELATED_SKILLS,
      relatedPages:  RELATED_PAGES,
      actions:       ACTIONS,
      skillMetadata: SKILL_META,
      diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
      warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
