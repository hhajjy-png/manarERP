// ─── Payroll Skill ────────────────────────────────────────────────────────────
// Wraps GET /payroll. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';

const SKILL_ID    = 'payroll';
const SKILL_TITLE = 'مهارة تحليل الرواتب';

const SOURCES = [
  { icon: '💰', labelAr: 'إدارة الرواتب',    routePath: '/salaries' },
  { icon: '📊', labelAr: 'تحليلات البنك',    routePath: '/payroll/bank-analytics' },
];

const FOLLOW_UPS = [
  'أعلى الرواتب هذا الشهر',
  'أدنى الرواتب هذا الشهر',
  'متوسط الراتب',
  'مقارنة الرواتب بالأشهر السابقة',
  'لخّص آخر شهر',
];

const ARABIC_MONTHS: Record<number, string> = {
  1:'يناير',2:'فبراير',3:'مارس',4:'أبريل',5:'مايو',6:'يونيو',
  7:'يوليو',8:'أغسطس',9:'سبتمبر',10:'أكتوبر',11:'نوفمبر',12:'ديسمبر',
};

interface PayrollRecord {
  id: number;
  month: number;
  year: number;
  netSalary: number;
  grossSalary: number;
  baseSalary: number;
  status: string;
  employee?: { id: number; code: string; fullName: string; department?: string | null };
}

const kd   = (n: number) => `${Number(n).toFixed(3)} د.ك`;
const mStr = (r: PayrollRecord) => `${ARABIC_MONTHS[r.month] ?? r.month} ${r.year}`;

function errResult(prompt: string, intent: string, err: unknown, t0: number): SkillResult {
  const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'خطأ في جلب بيانات الرواتب',
    summary: 'تعذّر الحصول على بيانات الرواتب. تحقق من الاتصال وصلاحياتك.',
    statistics: [], warnings: [{ message: msg, severity: 'danger' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isError: true, errorMessage: msg,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

export async function executePayrollSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();
  try {
    // Fetch last 150 payroll records ordered by year/month desc
    const res = await api.get<{ data: { data: PayrollRecord[]; total: number } }>(
      '/payroll',
      { params: { pageSize: 150 } },
    );
    const records: PayrollRecord[] = (res.data.data.data ?? []).map(r => ({
      ...r,
      netSalary:  Number(r.netSalary),
      grossSalary: Number(r.grossSalary),
      baseSalary:  Number(r.baseSalary),
    }));

    if (!records.length) {
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'لا توجد بيانات رواتب',
        summary: 'لم يتم توليد أي كشوف رواتب بعد. انتقل إلى صفحة الرواتب وأنشئ أول كشف.',
        statistics: [],
        warnings: [{ message: 'لا توجد كشوف رواتب في النظام.', severity: 'warning' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS, isInsufficientData: true,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // Identify latest month
    const latest     = records[0];
    const latestKey  = `${latest.year}-${latest.month}`;
    const latestRecs = records.filter(r => r.year === latest.year && r.month === latest.month);

    // ── intent: highest ────────────────────────────────────────────────────
    if (intent === 'highest') {
      const sorted = [...latestRecs].sort((a, b) => b.netSalary - a.netSalary).slice(0, 10);
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `أعلى الرواتب — ${mStr(latest)}`,
        summary: `أعلى ${sorted.length} رواتب صافية في ${mStr(latest)}.`,
        highlights: sorted.map((r, i) => ({
          icon: ['🥇','🥈','🥉'][i] ?? '•',
          labelAr: r.employee?.fullName ?? `موظف #${r.id}`,
          value: kd(r.netSalary), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'أعلى راتب صافٍ', value: kd(sorted[0]?.netSalary ?? 0), kind: 'money' },
          { labelAr: 'عدد الموظفين',    value: latestRecs.length, kind: 'count' },
          { labelAr: 'الشهر',           value: mStr(latest), kind: 'text' },
        ],
        cards: [{
          titleAr: 'تفاصيل أعلى الرواتب',
          rows: sorted.map((r, i) => ({
            labelAr: `${i + 1}. ${r.employee?.fullName ?? `موظف #${r.id}`}`,
            value: kd(r.netSalary), kind: 'money' as const,
          })),
        }],
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: lowest ─────────────────────────────────────────────────────
    if (intent === 'lowest') {
      const sorted = [...latestRecs].sort((a, b) => a.netSalary - b.netSalary).slice(0, 10);
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `أدنى الرواتب — ${mStr(latest)}`,
        summary: `أدنى ${sorted.length} رواتب صافية في ${mStr(latest)}.`,
        highlights: sorted.map(r => ({
          icon: '•', labelAr: r.employee?.fullName ?? `موظف #${r.id}`,
          value: kd(r.netSalary), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'أدنى راتب صافٍ', value: kd(sorted[0]?.netSalary ?? 0), kind: 'money' },
          { labelAr: 'عدد الموظفين',   value: latestRecs.length, kind: 'count' },
          { labelAr: 'الشهر',          value: mStr(latest), kind: 'text' },
        ],
        cards: [{
          titleAr: 'تفاصيل أدنى الرواتب',
          rows: sorted.map((r, i) => ({
            labelAr: `${i + 1}. ${r.employee?.fullName ?? `موظف #${r.id}`}`,
            value: kd(r.netSalary), kind: 'money' as const,
          })),
        }],
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: average ────────────────────────────────────────────────────
    if (intent === 'average') {
      const total = latestRecs.reduce((s, r) => s + r.netSalary, 0);
      const avg   = latestRecs.length > 0 ? total / latestRecs.length : 0;
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `متوسط الراتب — ${mStr(latest)}`,
        summary: `متوسط الراتب الصافي في ${mStr(latest)}: ${kd(avg)} لـ ${latestRecs.length} موظف.`,
        statistics: [
          { labelAr: 'متوسط الراتب الصافي',  value: kd(avg), kind: 'money' },
          { labelAr: 'إجمالي الرواتب',        value: kd(total), kind: 'money' },
          { labelAr: 'عدد الموظفين',          value: latestRecs.length, kind: 'count' },
        ],
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: comparison ─────────────────────────────────────────────────
    if (intent === 'comparison') {
      // Group by year-month
      const byMonth = new Map<string, { label: string; total: number; count: number }>();
      for (const r of records) {
        const key = `${r.year}-${String(r.month).padStart(2,'0')}`;
        const existing = byMonth.get(key);
        if (existing) {
          existing.total += r.netSalary;
          existing.count += 1;
        } else {
          byMonth.set(key, { label: `${ARABIC_MONTHS[r.month]} ${r.year}`, total: r.netSalary, count: 1 });
        }
      }
      const months = [...byMonth.entries()]
        .sort(([a], [b]) => b.localeCompare(a))
        .slice(0, 6)
        .reverse();

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'مقارنة الرواتب — آخر 6 أشهر',
        summary: `مقارنة إجمالي الرواتب الصافية لآخر ${months.length} أشهر.`,
        highlights: months.map(([, v]) => ({
          icon: '📅', labelAr: v.label,
          value: kd(v.total), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'الشهر الأحدث', value: months.at(-1)?.[1].label ?? '—', kind: 'text' },
          { labelAr: 'إجمالي الأحدث', value: kd(months.at(-1)?.[1].total ?? 0), kind: 'money' },
          { labelAr: 'أشهر مقارنة', value: months.length, kind: 'count' },
        ],
        cards: [{
          titleAr: 'إجمالي الرواتب الصافية شهرياً',
          rows: months.map(([, v]) => ({
            labelAr: v.label,
            value: `${kd(v.total)} (${v.count} موظف)`, kind: 'text' as const,
          })),
        }],
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: summary (default) ──────────────────────────────────────────
    const totalNet   = latestRecs.reduce((s, r) => s + r.netSalary,  0);
    const totalGross = latestRecs.reduce((s, r) => s + r.grossSalary, 0);
    const avgNet     = latestRecs.length > 0 ? totalNet / latestRecs.length : 0;
    const paid       = latestRecs.filter(r => r.status === 'PAID').length;

    // Unique months in dataset
    const uniqueMonths = new Set(records.map(r => `${r.year}-${r.month}`)).size;

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: `ملخص رواتب ${mStr(latest)}`,
      summary: `كشف رواتب ${mStr(latest)}: ${latestRecs.length} موظف، إجمالي صافي ${kd(totalNet)}، متوسط ${kd(avgNet)}.`,
      highlights: [
        { icon: '💰', labelAr: 'إجمالي الرواتب الصافية',  value: kd(totalNet),   kind: 'money' },
        { icon: '💼', labelAr: 'إجمالي الرواتب الإجمالية', value: kd(totalGross), kind: 'money' },
        { icon: '👥', labelAr: 'عدد الموظفين',             value: String(latestRecs.length), kind: 'count' },
        { icon: '✓',  labelAr: 'تم صرفه',                 value: String(paid),   kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي صافي الرواتب',   value: kd(totalNet),   kind: 'money' },
        { labelAr: 'إجمالي الرواتب الإجمالية', value: kd(totalGross), kind: 'money' },
        { labelAr: 'متوسط الراتب الصافي',   value: kd(avgNet),     kind: 'money' },
        { labelAr: 'عدد الموظفين',          value: latestRecs.length, kind: 'count' },
      ],
      cards: [{
        titleAr: 'ملخص الكشف',
        rows: [
          { labelAr: 'الشهر',          value: mStr(latest), kind: 'text' },
          { labelAr: 'تم صرفه',        value: paid, kind: 'count' },
          { labelAr: 'غير مصروف',      value: latestRecs.length - paid, kind: 'count' },
          { labelAr: 'أشهر محفوظة',   value: uniqueMonths, kind: 'count' },
        ],
      }],
      warnings: latestRecs.length - paid > 0
        ? [{ message: `${latestRecs.length - paid} كشف لم يُصرف بعد في ${mStr(latest)}.`, severity: 'info' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
