// ─── Payroll Skill (AI-2.5) ───────────────────────────────────────────────────
// Wraps GET /payroll. Read-only. No backend changes.

import { api } from '../../api/client';
import type { SkillResult } from '../types';
import { computeQuality } from '../qualityEngine';
import { formatCurrency } from '../../lib/format';

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
  'حسب الإدارة',
  'حالة الرواتب',
  'لخّص آخر شهر',
];

const ARABIC_MONTHS: Record<number, string> = {
  1:'يناير',2:'فبراير',3:'مارس',4:'أبريل',5:'مايو',6:'يونيو',
  7:'يوليو',8:'أغسطس',9:'سبتمبر',10:'أكتوبر',11:'نوفمبر',12:'ديسمبر',
};

const RELATED_SKILLS = [
  { skillId: 'dashboard',      labelAr: 'لوحة التحكم',      promptSuggestion: 'اعرض المؤشرات الرئيسية' },
  { skillId: 'bank-statement', labelAr: 'كشف الحساب البنكي', promptSuggestion: 'لخّص آخر كشف حساب مستورد' },
];

const RELATED_PAGES = [
  { path: '/salaries',               labelAr: 'إدارة الرواتب',    icon: '💰' },
  { path: '/payroll/bank-analytics', labelAr: 'تحليلات البنك',    icon: '📊' },
];

const ACTIONS = [
  { kind: 'openModule' as const,   labelAr: 'فتح الرواتب',   icon: '💰', available: true, payload: '/salaries' },
  { kind: 'copySummary' as const,  labelAr: 'نسخ الملخص',   icon: '📋', available: true },
  { kind: 'exportResult' as const, labelAr: 'تصدير txt',    icon: '📄', available: true },
  { kind: 'print' as const,        labelAr: 'طباعة',         icon: '🖨️', available: true },
];

const EXPLANATION_STEPS = [
  { step: 1, labelAr: 'جلب سجلات الرواتب',           detailAr: 'GET /payroll?pageSize=150' },
  { step: 2, labelAr: 'تحديد آخر شهر',               detailAr: 'أول سجل في القائمة' },
  { step: 3, labelAr: 'تصفية وترتيب السجلات',         detailAr: 'معالجة محلية بدون SQL' },
  { step: 4, labelAr: 'حساب جودة البيانات',            detailAr: 'computeQuality() — محلي' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'stable' as const,
  capabilities: ['أعلى الرواتب', 'أدنى الرواتب', 'متوسط', 'مقارنة شهرية', 'حسب الإدارة', 'حالة الصرف'],
  dependentModules: ['payroll', 'employees'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
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

const kd   = (n: number) => formatCurrency(n);
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
    const apiT0 = Date.now();
    const res = await api.get<{ data: { data: PayrollRecord[]; total: number } }>(
      '/payroll',
      { params: { pageSize: 150 } },
    );
    const apiMs = Date.now() - apiT0;
    const records: PayrollRecord[] = (res.data.data.data ?? []).map(r => ({
      ...r,
      netSalary:   Number(r.netSalary),
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

    const latest     = records[0];
    const latestRecs = records.filter(r => r.year === latest.year && r.month === latest.month);
    const paid       = latestRecs.filter(r => r.status === 'PAID').length;
    const unpaid     = latestRecs.length - paid;

    const missingDept = latestRecs.filter(r => !r.employee?.department).length;
    const { qualityScore, qualityIssues } = computeQuality({
      totalRecords:    latestRecs.length,
      completeRecords: latestRecs.length - missingDept,
      warningCount:    unpaid,
      missingFields:   missingDept > 0 ? ['الإدارة'] : [],
      customPenalties: unpaid > 0 ? [{ reason: `${unpaid} راتب غير مدفوع`, points: Math.min(unpaid * 3, 15) }] : [],
    });

    const richSources = [{
      module:           'payroll',
      datasetName:      `رواتب ${mStr(latest)}`,
      recordCount:      records.length,
      dataCompleteness: qualityScore,
      sourceType:       'primary' as const,
    }];

    const diagnostics = {
      routerMs:        0,
      skillMs:         Date.now() - t0,
      apiMs,
      recordsAnalyzed: latestRecs.length,
      cardsRendered:   1,
    };

    const uniqueMonths = new Set(records.map(r => `${r.year}-${r.month}`)).size;

    // ── intent: highest ────────────────────────────────────────────────────
    if (intent === 'highest') {
      const sorted = [...latestRecs].sort((a, b) => b.netSalary - a.netSalary).slice(0, 10);
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `أعلى الرواتب — ${mStr(latest)}`,
        summary: `أعلى ${sorted.length} رواتب صافية في ${mStr(latest)}.`,
        capabilityLevel: 'complete',
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
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
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

    // ── intent: lowest ─────────────────────────────────────────────────────
    if (intent === 'lowest') {
      const sorted = [...latestRecs].sort((a, b) => a.netSalary - b.netSalary).slice(0, 10);
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `أدنى الرواتب — ${mStr(latest)}`,
        summary: `أدنى ${sorted.length} رواتب صافية في ${mStr(latest)}.`,
        capabilityLevel: 'complete',
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
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
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

    // ── intent: average ────────────────────────────────────────────────────
    if (intent === 'average') {
      const total = latestRecs.reduce((s, r) => s + r.netSalary, 0);
      const avg   = latestRecs.length > 0 ? total / latestRecs.length : 0;
      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `متوسط الراتب — ${mStr(latest)}`,
        summary: `متوسط الراتب الصافي في ${mStr(latest)}: ${kd(avg)} لـ ${latestRecs.length} موظف.`,
        capabilityLevel: 'complete',
        statistics: [
          { labelAr: 'متوسط الراتب الصافي',  value: kd(avg), kind: 'money' },
          { labelAr: 'إجمالي الرواتب',        value: kd(total), kind: 'money' },
          { labelAr: 'عدد الموظفين',          value: latestRecs.length, kind: 'count' },
        ],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
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

    // ── intent: comparison ─────────────────────────────────────────────────
    if (intent === 'comparison') {
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
        capabilityLevel: 'partial',
        highlights: months.map(([, v]) => ({
          icon: '📅', labelAr: v.label,
          value: kd(v.total), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'الشهر الأحدث',  value: months.at(-1)?.[1].label ?? '—', kind: 'text' },
          { labelAr: 'إجمالي الأحدث', value: kd(months.at(-1)?.[1].total ?? 0), kind: 'money' },
          { labelAr: 'أشهر مقارنة',   value: months.length, kind: 'count' },
        ],
        cards: [{
          titleAr: 'إجمالي الرواتب الصافية شهرياً',
          rows: months.map(([, v]) => ({
            labelAr: v.label,
            value: `${kd(v.total)} (${v.count} موظف)`, kind: 'text' as const,
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
        warnings: [], sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: department ─────────────────────────────────────────────────
    if (intent === 'department') {
      const byDept = new Map<string, { total: number; count: number }>();
      for (const r of latestRecs) {
        const dept = r.employee?.department ?? 'غير محدد';
        const existing = byDept.get(dept);
        if (existing) { existing.total += r.netSalary; existing.count += 1; }
        else { byDept.set(dept, { total: r.netSalary, count: 1 }); }
      }
      const depts = [...byDept.entries()]
        .sort(([, a], [, b]) => b.total - a.total);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `توزيع الرواتب حسب الإدارة — ${mStr(latest)}`,
        summary: `${depts.length} إدارة في ${mStr(latest)}. أعلى إدارة: ${depts[0]?.[0] ?? '—'} بإجمالي ${kd(depts[0]?.[1].total ?? 0)}.`,
        capabilityLevel: 'complete',
        highlights: depts.slice(0, 6).map(([dept, v], i) => ({
          icon: ['🥇','🥈','🥉','•','•','•'][i] ?? '•',
          labelAr: dept,
          value: kd(v.total), kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'عدد الإدارات',   value: depts.length, kind: 'count' },
          { labelAr: 'أعلى إدارة',     value: depts[0]?.[0] ?? '—', kind: 'text' },
          { labelAr: 'إجمالي الرواتب', value: kd(latestRecs.reduce((s,r)=>s+r.netSalary,0)), kind: 'money' },
        ],
        cards: [{
          titleAr: 'الرواتب الصافية حسب الإدارة',
          rows: depts.map(([dept, v]) => ({
            labelAr: `${dept} (${v.count} موظف)`,
            value: kd(v.total), kind: 'money' as const,
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
        warnings: missingDept > 0
          ? [{ message: `${missingDept} موظف بلا إدارة محددة.`, severity: 'info' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: status ─────────────────────────────────────────────────────
    if (intent === 'status') {
      const byStatus = new Map<string, { count: number; total: number }>();
      for (const r of latestRecs) {
        const s = r.status ?? 'UNKNOWN';
        const existing = byStatus.get(s);
        if (existing) { existing.count += 1; existing.total += r.netSalary; }
        else { byStatus.set(s, { count: 1, total: r.netSalary }); }
      }

      const STATUS_AR: Record<string, string> = {
        PAID: 'مدفوع', APPROVED: 'معتمد', DRAFT: 'مسودة', REJECTED: 'مرفوض', UNKNOWN: 'غير محدد',
      };

      const statuses = [...byStatus.entries()]
        .sort(([, a], [, b]) => b.count - a.count);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `حالة الرواتب — ${mStr(latest)}`,
        summary: `توزيع ${latestRecs.length} راتب حسب الحالة في ${mStr(latest)}.`,
        capabilityLevel: 'complete',
        highlights: statuses.map(([status, v]) => ({
          icon: status === 'PAID' ? '✅' : status === 'APPROVED' ? '✔️' : status === 'DRAFT' ? '📝' : '❌',
          labelAr: STATUS_AR[status] ?? status,
          value: `${v.count} (${kd(v.total)})`, kind: 'text' as const,
        })),
        statistics: [
          { labelAr: 'إجمالي الكشوف',   value: latestRecs.length, kind: 'count' },
          { labelAr: 'مدفوع',           value: byStatus.get('PAID')?.count     ?? 0, kind: 'count' },
          { labelAr: 'معتمد',           value: byStatus.get('APPROVED')?.count ?? 0, kind: 'count' },
          { labelAr: 'مسودة',           value: byStatus.get('DRAFT')?.count    ?? 0, kind: 'count' },
        ],
        cards: [{
          titleAr: 'تفاصيل حالة الرواتب',
          rows: statuses.map(([status, v]) => ({
            labelAr: STATUS_AR[status] ?? status,
            value: `${v.count} كشف — ${kd(v.total)}`, kind: 'text' as const,
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
        warnings: unpaid > 0
          ? [{ message: `${unpaid} كشف راتب لم يُدفع بعد في ${mStr(latest)}.`, severity: 'info' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: summary (default) ──────────────────────────────────────────
    const totalNet   = latestRecs.reduce((s, r) => s + r.netSalary,  0);
    const totalGross = latestRecs.reduce((s, r) => s + r.grossSalary, 0);
    const avgNet     = latestRecs.length > 0 ? totalNet / latestRecs.length : 0;

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: `ملخص رواتب ${mStr(latest)}`,
      summary: `كشف رواتب ${mStr(latest)}: ${latestRecs.length} موظف، إجمالي صافي ${kd(totalNet)}، متوسط ${kd(avgNet)}.`,
      capabilityLevel: 'complete',
      highlights: [
        { icon: '💰', labelAr: 'إجمالي الرواتب الصافية',   value: kd(totalNet),   kind: 'money' },
        { icon: '💼', labelAr: 'إجمالي الرواتب الإجمالية', value: kd(totalGross), kind: 'money' },
        { icon: '👥', labelAr: 'عدد الموظفين',             value: String(latestRecs.length), kind: 'count' },
        { icon: '✓',  labelAr: 'تم صرفه',                 value: String(paid),   kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي صافي الرواتب',     value: kd(totalNet),   kind: 'money' },
        { labelAr: 'إجمالي الرواتب الإجمالية', value: kd(totalGross), kind: 'money' },
        { labelAr: 'متوسط الراتب الصافي',     value: kd(avgNet),     kind: 'money' },
        { labelAr: 'عدد الموظفين',            value: latestRecs.length, kind: 'count' },
      ],
      cards: [{
        titleAr: 'ملخص الكشف',
        rows: [
          { labelAr: 'الشهر',        value: mStr(latest), kind: 'text' },
          { labelAr: 'تم صرفه',      value: paid,         kind: 'count' },
          { labelAr: 'غير مصروف',    value: unpaid,       kind: 'count' },
          { labelAr: 'أشهر محفوظة', value: uniqueMonths, kind: 'count' },
        ],
      }],
      qualityScore, qualityIssues,
      explanationSteps: EXPLANATION_STEPS,
      richSources,
      relatedSkills: RELATED_SKILLS,
      relatedPages:  RELATED_PAGES,
      actions:       ACTIONS,
      skillMetadata: SKILL_META,
      diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
      warnings: unpaid > 0
        ? [{ message: `${unpaid} كشف لم يُصرف بعد في ${mStr(latest)}.`, severity: 'info' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
