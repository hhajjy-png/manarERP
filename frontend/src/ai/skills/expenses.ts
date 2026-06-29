// ─── Expense Skill ────────────────────────────────────────────────────────────
// Wraps GET /expenses/stats. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';

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
];

const CATEGORY_AR: Record<string, string> = {
  FUEL: 'وقود', SALARIES: 'رواتب', MAINTENANCE: 'صيانة', RENT: 'إيجارات',
  PURCHASES: 'مشتريات', EQUIPMENT: 'معدات', SERVICES: 'خدمات',
  EQUIPMENT_RENT: 'إيجار معدات', TRUCK_RENT: 'إيجار شاحنات',
  HASSAN: 'مصروف حسن', GHANEM: 'مصروف غانم',
  NATHEER: 'مصروف نظير', HAROON: 'مصروف هارون', OTHER: 'أخرى',
};

interface ExpenseStats {
  count: number;
  total: number;
  pendingCount: number;
  pendingTotal: number;
  byCategory: Record<string, number>;
  bySupplier?: Record<string, number>;
}

const kd = (n: number) => `${Number(n).toFixed(3)} د.ك`;

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
    const res = await api.get<{ data: ExpenseStats }>('/expenses/stats');
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

    // Top categories sorted desc
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
        highlights: top.slice(0, 5).map((c, i) => ({
          icon: ['🔴','🟠','🟡','🟢','🔵'][i] ?? '•',
          labelAr: c.labelAr,
          value: kd(c.amount), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'إجمالي المصروفات',   value: kd(stats.total),   kind: 'money' },
          { labelAr: 'عدد المصروفات',      value: stats.count,       kind: 'count' },
          { labelAr: 'أكبر فئة',           value: top[0]?.labelAr ?? '—', kind: 'text' },
        ],
        cards: [{
          titleAr: 'توزيع المصروفات حسب الفئة',
          rows: top.map(c => ({
            labelAr: c.labelAr,
            value: kd(c.amount), kind: 'money' as const,
          })),
        }],
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
        summary: 'تحليل الاتجاهات الزمنية للمصروفات يتطلب واجهة بيانات تاريخية شهرية لم تُتَح بعد. يمكنك الاطلاع على ملخص المصروفات الحالي في الوقت الراهن.',
        statistics: [
          { labelAr: 'إجمالي المصروفات الكلي', value: kd(stats.total), kind: 'money' },
          { labelAr: 'عدد المصروفات',          value: stats.count, kind: 'count' },
        ],
        warnings: [{ message: 'بيانات الاتجاهات الشهرية غير متوفرة حالياً — ستُضاف في مرحلة قادمة.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: summary (default) ──────────────────────────────────────────
    const approvedTotal = stats.total - stats.pendingTotal;

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: 'ملخص المصروفات',
      summary: `إجمالي ${stats.count} مصروف بقيمة ${kd(stats.total)}، منها ${stats.pendingCount} معلّق بقيمة ${kd(stats.pendingTotal)}.`,
      highlights: [
        { icon: '💸', labelAr: 'إجمالي المصروفات', value: kd(stats.total),   kind: 'money' },
        { icon: '✓',  labelAr: 'مُعتمد',           value: kd(approvedTotal), kind: 'money' },
        { icon: '⏳',  labelAr: 'معلّق',            value: kd(stats.pendingTotal), kind: 'money' },
        { icon: '🗂️', labelAr: 'عدد المصروفات',   value: String(stats.count), kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي المصروفات',   value: kd(stats.total),        kind: 'money' },
        { labelAr: 'مُعتمد',             value: kd(approvedTotal),      kind: 'money' },
        { labelAr: 'معلّق',              value: kd(stats.pendingTotal), kind: 'money' },
        { labelAr: 'عدد بنود معلقة',    value: stats.pendingCount,     kind: 'count' },
      ],
      cards: [{
        titleAr: 'توزيع حسب الفئة (الأعلى)',
        rows: categories.slice(0, 8).map(c => ({
          labelAr: c.labelAr,
          value: kd(c.amount), kind: 'money' as const,
        })),
      }],
      warnings: stats.pendingTotal > stats.total * 0.3
        ? [{ message: `${((stats.pendingTotal / stats.total) * 100).toFixed(0)}% من المصروفات معلّقة — يُنصح بمراجعة الاعتمادات.`, severity: 'warning' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
