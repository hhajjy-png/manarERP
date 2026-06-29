// ─── Contracts Skill ──────────────────────────────────────────────────────────
// Wraps GET /contracts and GET /contracts/summary. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';

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
  'لخّص العقود',
];

interface ContractSummary {
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
    // Always fetch summary first (lightweight)
    const summaryRes = await api.get<{ data: ContractSummary }>('/contracts/summary');
    const summary = summaryRes.data.data;

    // ── intent: summary ────────────────────────────────────────────────────
    if (intent === 'summary') {
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'ملخص العقود',
        summary: `إجمالي ${summary.totalContracts} عقد، منها ${summary.activeContracts} نشط. إجمالي قيمة النقل الشهرية ${kd(summary.monthlyTransportTotal)}.`,
        statistics: [
          { labelAr: 'إجمالي العقود',           value: summary.totalContracts,       kind: 'count' },
          { labelAr: 'العقود النشطة',            value: summary.activeContracts,      kind: 'count' },
          { labelAr: 'إجمالي النقل الشهري',     value: kd(summary.monthlyTransportTotal), kind: 'money' },
        ],
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
    const contracts: ContractRecord[] = (listRes.data.data.data ?? []).map(c => ({
      ...c,
      monthlyTransportValue: c.monthlyTransportValue != null ? Number(c.monthlyTransportValue) : null,
    }));

    // ── intent: active ─────────────────────────────────────────────────────
    if (intent === 'active') {
      const active = contracts.filter(c => c.status === 'ACTIVE');
      if (!active.length) {
        return {
          skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
          title: 'العقود النشطة',
          summary: 'لا توجد عقود نشطة حالياً.',
          statistics: [{ labelAr: 'العقود النشطة', value: 0, kind: 'count' }],
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
        highlights: expiring.slice(0, 6).map(c => {
          const days = daysUntil(c.endDate);
          return {
            icon: days !== null && days <= 30 ? '🔴' : '🟡',
            labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
            value: `${days} يوم`, kind: 'text' as const,
          };
        }),
        statistics: [
          { labelAr: 'عقود تنتهي قريباً',   value: expiring.length, kind: 'count' },
          { labelAr: 'خلال 30 يوم',         value: expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length, kind: 'count' },
        ],
        cards: expiring.length ? [{
          titleAr: 'جدول انتهاء العقود',
          rows: expiring.slice(0, 15).map(c => ({
            labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
            value: c.endDate ? new Date(c.endDate).toLocaleDateString('ar-KW') : '—',
            kind: 'date' as const,
          })),
        }] : [],
        warnings: expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length > 0
          ? [{ message: `${expiring.filter(c => (daysUntil(c.endDate) ?? 0) <= 30).length} عقد تنتهي خلال 30 يوماً — يستوجب الاهتمام.`, severity: 'danger' }]
          : [],
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
      highlights: sorted.slice(0, 5).map((c, i) => ({
        icon: ['🥇','🥈','🥉','•','•'][i] ?? '•',
        labelAr: `${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
        value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
      })),
      statistics: [
        { labelAr: 'أعلى عقد',       value: kd(sorted[0]?.monthlyTransportValue ?? 0), kind: 'money' },
        { labelAr: 'عدد العقود',     value: contracts.length, kind: 'count' },
      ],
      cards: [{
        titleAr: 'أكبر العقود',
        rows: sorted.map((c, i) => ({
          labelAr: `${i + 1}. ${c.code} — ${c.customer?.name ?? c.asphaltPlant}`,
          value: kd(c.monthlyTransportValue ?? 0), kind: 'money' as const,
        })),
      }],
      warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
