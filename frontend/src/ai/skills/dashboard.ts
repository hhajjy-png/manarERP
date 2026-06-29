// ─── Dashboard Skill ──────────────────────────────────────────────────────────
// Wraps GET /dashboard/overview, /dashboard/trend, /dashboard/operational.
// Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';

const SKILL_ID    = 'dashboard';
const SKILL_TITLE = 'مهارة مؤشرات لوحة التحكم';

const SOURCES = [
  { icon: '📈', labelAr: 'لوحة التحكم',  routePath: '/dashboard' },
  { icon: '📊', labelAr: 'مركز التقارير', routePath: '/reports' },
];

const FOLLOW_UPS = [
  'اعرض ملخص لوحة التحكم',
  'اعرض إجمالي الإيرادات',
  'اعرض الأرباح',
  'اعرض التنبيهات',
  'اعرض المؤشرات الرئيسية',
];

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

const kd  = (n: number) => `${Number(n).toFixed(3)} د.ك`;
const pct = (a: number, b: number) => b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—';

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
    // Core overview is always fetched
    const ovRes = await api.get<{ data: DashboardOverview }>('/dashboard/overview');
    const ov    = ovRes.data.data;
    const f     = ov.finance;

    // ── intent: revenue ────────────────────────────────────────────────────
    if (intent === 'revenue') {
      // Also fetch monthly trend
      let trend: TrendPoint[] = [];
      try {
        const tRes = await api.get<{ data: TrendPoint[] }>('/dashboard/trend');
        trend = tRes.data.data ?? [];
      } catch { /* non-fatal */ }

      const recent6 = trend.slice(-6);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'الإيرادات',
        summary: `إجمالي الإيرادات المسجّلة: ${kd(f.totalRevenue)}. صافي الربح: ${kd(f.netProfit)}.`,
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
        warnings: f.netProfit < 0
          ? [{ message: `خسارة صافية: ${kd(Math.abs(f.netProfit))} — يُنصح بمراجعة التقارير المالية.`, severity: 'danger' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: profit ─────────────────────────────────────────────────────
    if (intent === 'profit') {
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'الأرباح والخسائر',
        summary: `صافي الربح: ${kd(f.netProfit)} (إيرادات ${kd(f.totalRevenue)} — مصروفات ${kd(f.totalExpense)}).`,
        highlights: [
          { icon: f.netProfit >= 0 ? '📈' : '📉', labelAr: 'صافي الربح',       value: kd(f.netProfit),    kind: 'money' },
          { icon: '💵', labelAr: 'الإيرادات الإجمالية', value: kd(f.totalRevenue), kind: 'money' },
          { icon: '💸', labelAr: 'المصروفات الإجمالية', value: kd(f.totalExpense), kind: 'money' },
          { icon: '📅', labelAr: 'مصروفات الشهر الحالي', value: kd(f.monthlyExpense), kind: 'money' },
        ],
        statistics: [
          { labelAr: 'صافي الربح',            value: kd(f.netProfit),    kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
          { labelAr: 'هامش الربح',            value: pct(f.netProfit, f.totalRevenue), kind: 'percent' },
          { labelAr: 'نسبة المصروفات',        value: pct(f.totalExpense, f.totalRevenue), kind: 'percent' },
          { labelAr: 'مصروفات الشهر الحالي', value: kd(f.monthlyExpense), kind: 'money' },
        ],
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
      try {
        const opsRes = await api.get<{ data: OperationalSummary }>('/dashboard/operational');
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

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'تنبيهات النظام',
        summary: warnings.length
          ? `رُصد ${warnings.length} تنبيه يستوجب المتابعة.`
          : 'لا توجد تنبيهات عاجلة حالياً — الوضع طبيعي.',
        statistics: [
          { labelAr: 'فواتير مستحقة',   value: f.dueInvoicesCount, kind: 'count' },
          { labelAr: 'إجمالي الفواتير', value: kd(f.dueInvoicesAmount), kind: 'money' },
          { labelAr: 'معدات خارج الخدمة', value: ov.equipment.notWorking, kind: 'count' },
        ],
        warnings: warnings.length ? warnings : [{ message: 'لا توجد تنبيهات عاجلة.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: kpi (default) ──────────────────────────────────────────────
    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'kpi', prompt,
      title: 'المؤشرات الرئيسية — لوحة التحكم',
      summary:
        `لوحة التحكم: ${ov.contracts.active} عقد نشط، ${ov.employees.active} موظف، ` +
        `إيرادات ${kd(f.totalRevenue)}، صافي ربح ${kd(f.netProfit)}.`,
      highlights: [
        { icon: '💰', labelAr: 'إجمالي الإيرادات', value: kd(f.totalRevenue),          kind: 'money' },
        { icon: '📈', labelAr: 'صافي الربح',        value: kd(f.netProfit),             kind: 'money' },
        { icon: '📄', labelAr: 'عقود نشطة',        value: String(ov.contracts.active), kind: 'count' },
        { icon: '👥', labelAr: 'موظفون نشطون',     value: String(ov.employees.active), kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي الإيرادات',   value: kd(f.totalRevenue),            kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
        { labelAr: 'إجمالي المصروفات',   value: kd(f.totalExpense),            kind: 'money' },
        { labelAr: 'صافي الربح',         value: kd(f.netProfit),               kind: 'money', trend: f.netProfit >= 0 ? 'up' : 'down' },
        { labelAr: 'فواتير مستحقة',      value: kd(f.dueInvoicesAmount),       kind: 'money' },
      ],
      cards: [
        {
          titleAr: 'مؤشرات العقود والعملاء',
          rows: [
            { labelAr: 'إجمالي العقود',         value: ov.contracts.total, kind: 'count' },
            { labelAr: 'عقود نشطة',             value: ov.contracts.active, kind: 'count' },
            { labelAr: 'إجمالي قيمة النقل الشهرية', value: kd(ov.contracts.monthlyTransportTotal), kind: 'money' },
            { labelAr: 'إجمالي العملاء',        value: ov.customers.total, kind: 'count' },
            { labelAr: 'عملاء حكوميون',        value: ov.customers.government, kind: 'count' },
          ],
        },
        {
          titleAr: 'مؤشرات الموارد البشرية والمعدات',
          rows: [
            { labelAr: 'موظفون نشطون',          value: ov.employees.active, kind: 'count' },
            { labelAr: 'إجمالي المعدات',         value: ov.equipment.total, kind: 'count' },
            { labelAr: 'معدات خارج الخدمة',     value: ov.equipment.notWorking, kind: 'count' },
          ],
        },
      ],
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
