// ─── Bank Statement Skill (AI-2.5) ────────────────────────────────────────────
// Explorer only — view, filter, analyze. NOT reconciliation/matching.
// Wraps /bank-statement-import and /bank-statement-import/:id/workspace APIs.
// No backend changes. No SQL. Read-only.

import { api } from '../../api/client';
import type { SkillResult, SkillHighlight, SkillDataCard } from '../types';
import type { ImportListResult, ReconciliationWorkspace } from '../../api/bankStatementImport';
import { computeQuality } from '../qualityEngine';

const SKILL_ID    = 'bank-statement';
const SKILL_TITLE = 'مهارة كشف الحساب البنكي';

const SOURCES = [
  { icon: '🏦', labelAr: 'مستكشف كشف الحساب',    routePath: '/bank-reconciliation' },
  { icon: '📊', labelAr: 'تحليلات رواتب البنك', routePath: '/payroll/bank-analytics' },
];

const FOLLOW_UPS = [
  'اعرض أكبر السحوبات',
  'اعرض رسوم البنك',
  'اعرض العمليات ذات التنبيهات',
  'اعرض أكبر الإيداعات',
  'لخّص آخر كشف حساب مستورد',
  'اعرض تنبيهات الجودة',
  'اعرض نظرة عامة على الكشف',
];

const kd = (n: number) => `${n.toFixed(3)} د.ك`;

const RELATED_SKILLS = [
  { skillId: 'payroll',   labelAr: 'تحليل الرواتب',    promptSuggestion: 'لخّص رواتب هذا الشهر' },
  { skillId: 'dashboard', labelAr: 'لوحة التحكم',      promptSuggestion: 'اعرض المؤشرات الرئيسية' },
];

const RELATED_PAGES = [
  { path: '/bank-reconciliation',      labelAr: 'مستكشف كشف الحساب', icon: '🏦' },
  { path: '/payroll/bank-analytics',   labelAr: 'تحليلات رواتب البنك', icon: '📊' },
];

const ACTIONS = [
  { kind: 'openModule' as const,   labelAr: 'فتح المستكشف', icon: '🏦', available: true,  payload: '/bank-reconciliation' },
  { kind: 'copySummary' as const,  labelAr: 'نسخ الملخص',  icon: '📋', available: true  },
  { kind: 'exportResult' as const, labelAr: 'تصدير txt',   icon: '📄', available: true  },
  { kind: 'print' as const,        labelAr: 'طباعة',        icon: '🖨️', available: true  },
];

const EXPLANATION_STEPS = [
  { step: 1, labelAr: 'جلب قائمة الكشوف المستوردة', detailAr: 'GET /bank-statement-import' },
  { step: 2, labelAr: 'تحديد أحدث كشف',             detailAr: 'أول عنصر في القائمة' },
  { step: 3, labelAr: 'جلب تفاصيل العمليات',         detailAr: 'GET /bank-statement-import/:id/workspace' },
  { step: 4, labelAr: 'تصفية وترتيب حسب الطلب',     detailAr: 'تصفية محلية بدون SQL' },
  { step: 5, labelAr: 'حساب جودة البيانات',           detailAr: 'computeQuality() — محلي' },
];

const SKILL_META = {
  version: '2.5.0',
  status: 'stable' as const,
  capabilities: ['استكشاف الكشوف', 'تحليل السحوبات', 'تحليل الإيداعات', 'رسوم البنك', 'جودة البيانات'],
  dependentModules: ['bank-statement-import'],
  lastUpdated: '2026-06-29',
  skillGeneration: 'AI-2.5-deterministic' as const,
};

function errResult(prompt: string, intent: string, err: unknown, t0: number): SkillResult {
  const msg = err instanceof Error ? err.message : 'خطأ غير معروف';
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'خطأ في جلب بيانات كشف الحساب',
    summary: 'تعذّر الحصول على البيانات. تحقق من تشغيل الخادم وصلاحياتك.',
    statistics: [], warnings: [{ message: msg, severity: 'danger' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isError: true, errorMessage: msg,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

function noDataResult(prompt: string, intent: string, t0: number): SkillResult {
  return {
    skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
    title: 'لا توجد كشوف حساب مستوردة',
    summary: 'لم يتم استيراد أي كشف حساب بعد. انتقل إلى مستكشف كشف الحساب وابدأ الاستيراد.',
    statistics: [],
    warnings: [{ message: 'لا توجد كشوف حساب في النظام حالياً.', severity: 'warning' }],
    sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
    isInsufficientData: true,
    executedAt: t0, executionMs: Date.now() - t0,
  };
}

export async function executeBankStatementSkill(prompt: string, intent: string): Promise<SkillResult> {
  const t0 = Date.now();
  try {
    const apiT0 = Date.now();
    const listRes = await api.get<{ data: ImportListResult }>(
      '/bank-statement-import',
      { params: { page: 1, pageSize: 5 } },
    );
    const items = listRes.data.data.items;
    if (!items.length) return noDataResult(prompt, intent, t0);

    const latest = items[0];

    const wsRes = await api.get<{ data: ReconciliationWorkspace }>(
      `/bank-statement-import/${latest.id}/workspace`,
      { params: { pageSize: 100 } },
    );
    const apiMs = Date.now() - apiT0;
    const ws    = wsRes.data.data;
    const txns  = ws.transactions;

    const warnedTxns = txns.filter(t => t.warnings && t.warnings.length > 0);
    const { qualityScore, qualityIssues } = computeQuality({
      totalRecords:    txns.length,
      completeRecords: txns.filter(t => t.description && (t.debit > 0 || t.credit > 0)).length,
      warningCount:    warnedTxns.length,
      missingFields:   txns.some(t => !t.statementDate) ? ['تاريخ العملية'] : [],
    });

    const richSources = [{
      module:           'bank-statement-import',
      datasetName:      `كشف ${latest.bankName} — ${latest.fileName}`,
      recordCount:      latest.totalRows,
      dataCompleteness: qualityScore,
      sourceType:       'primary' as const,
    }];

    const diagnostics = {
      routerMs:        0,
      skillMs:         Date.now() - t0,
      apiMs,
      recordsAnalyzed: txns.length,
      cardsRendered:   1,
    };

    // ── intent: withdrawals ──────────────────────────────────────────────────
    if (intent === 'withdrawals') {
      const debits = [...txns]
        .filter(t => t.debit > 0)
        .sort((a, b) => b.debit - a.debit)
        .slice(0, 10);

      const highlights: SkillHighlight[] = debits.map(t => ({
        icon: '↓',
        labelAr: t.description.slice(0, 55),
        value: kd(t.debit),
        kind: 'money' as const,
      }));

      const card: SkillDataCard = {
        titleAr: 'تفاصيل أكبر عمليات السحب',
        rows: debits.map(t => ({
          labelAr: (t.statementDate ?? '') + ' — ' + t.description.slice(0, 50),
          value: kd(t.debit),
          kind: 'money' as const,
        })),
      };

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'أكبر عمليات السحب',
        summary: `أكبر ${debits.length} عملية سحب في كشف ${latest.bankName} — ${latest.fileName}.`,
        capabilityLevel: 'complete',
        highlights,
        statistics: [
          { labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits),  kind: 'money' },
          { labelAr: 'عدد عمليات السحب', value: txns.filter(t => t.debit > 0).length, kind: 'count' },
          { labelAr: 'أكبر سحب واحد',    value: kd(debits[0]?.debit ?? 0), kind: 'money' },
        ],
        cards: [card],
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

    // ── intent: deposits ─────────────────────────────────────────────────────
    if (intent === 'deposits') {
      const credits = [...txns]
        .filter(t => t.credit > 0)
        .sort((a, b) => b.credit - a.credit)
        .slice(0, 10);

      const highlights: SkillHighlight[] = credits.map(t => ({
        icon: '↑',
        labelAr: t.description.slice(0, 55),
        value: kd(t.credit),
        kind: 'money' as const,
      }));

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'أكبر عمليات الإيداع',
        summary: `أكبر ${credits.length} عملية إيداع في كشف ${latest.bankName} — ${latest.fileName}.`,
        capabilityLevel: 'complete',
        highlights,
        statistics: [
          { labelAr: 'إجمالي الإيداعات',   value: kd(latest.totalCredits), kind: 'money' },
          { labelAr: 'عدد عمليات الإيداع', value: txns.filter(t => t.credit > 0).length, kind: 'count' },
          { labelAr: 'أكبر إيداع واحد',    value: kd(credits[0]?.credit ?? 0), kind: 'money' },
        ],
        cards: [{
          titleAr: 'تفاصيل أكبر عمليات الإيداع',
          rows: credits.map(t => ({
            labelAr: (t.statementDate ?? '') + ' — ' + t.description.slice(0, 50),
            value: kd(t.credit), kind: 'money' as const,
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

    // ── intent: fees ─────────────────────────────────────────────────────────
    if (intent === 'fees') {
      const fees      = txns.filter(t => t.isBankFee && t.debit > 0);
      const feesTotal = fees.reduce((s, t) => s + t.debit, 0);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'رسوم البنك',
        summary: fees.length
          ? `رُصد ${fees.length} بند رسوم بنكية بإجمالي ${kd(feesTotal)} في كشف ${latest.bankName}.`
          : `لم يُرصد أي رسوم بنكية في كشف ${latest.bankName}.`,
        capabilityLevel: 'complete',
        highlights: fees.slice(0, 8).map(t => ({
          icon: '🏷️',
          labelAr: t.bankFeeType ?? t.description.slice(0, 40),
          value: kd(t.debit),
          kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'إجمالي الرسوم', value: kd(feesTotal), kind: 'money' },
          { labelAr: 'عدد بنود الرسوم', value: fees.length, kind: 'count' },
        ],
        cards: fees.length ? [{
          titleAr: 'تفاصيل الرسوم البنكية',
          rows: fees.map(t => ({
            labelAr: t.bankFeeType ?? t.description.slice(0, 50),
            value: kd(t.debit), kind: 'money' as const,
          })),
        }] : [],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: feesTotal > 50
          ? [{ message: `إجمالي الرسوم ${kd(feesTotal)} — يُنصح بمراجعة شروط الحساب البنكي.`, severity: 'warning' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: warnings ─────────────────────────────────────────────────────
    if (intent === 'warnings') {
      const warned = txns.filter(t => t.warnings && t.warnings.length > 0);
      const pct    = txns.length > 0 ? ((warned.length / txns.length) * 100).toFixed(1) : '0';

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'العمليات ذات التنبيهات',
        summary: warned.length
          ? `رُصد ${warned.length} عملية تحتوي على تنبيهات من أصل ${txns.length} عملية (${pct}%) في كشف ${latest.bankName}.`
          : `لا توجد عمليات تحتوي على تنبيهات في كشف ${latest.bankName}.`,
        capabilityLevel: 'partial',
        highlights: warned.slice(0, 8).map(t => ({
          icon: '⚠️',
          labelAr: t.description.slice(0, 55),
          value: t.debit > 0 ? kd(t.debit) : kd(t.credit),
          kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'عمليات بتنبيهات', value: warned.length, kind: 'count' },
          { labelAr: 'إجمالي العمليات', value: txns.length, kind: 'count' },
          { labelAr: 'نسبة التنبيهات',  value: `${pct}%`, kind: 'percent' },
        ],
        cards: warned.length ? [{
          titleAr: 'تفاصيل التنبيهات',
          rows: warned.slice(0, 20).map(t => ({
            labelAr: t.description.slice(0, 60),
            value: t.warnings.join(' | '), kind: 'text' as const,
          })),
        }] : [],
        qualityScore, qualityIssues,
        explanationSteps: EXPLANATION_STEPS,
        richSources,
        relatedSkills: RELATED_SKILLS,
        relatedPages:  RELATED_PAGES,
        actions:       ACTIONS,
        skillMetadata: SKILL_META,
        diagnostics:   { ...diagnostics, skillMs: Date.now() - t0 },
        warnings: warned.length > 0
          ? [{ message: `${warned.length} عملية تستوجب المراجعة.`, severity: 'warning' }]
          : [{ message: 'لا توجد تنبيهات — الكشف نظيف.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: quality_issues ───────────────────────────────────────────────
    if (intent === 'quality_issues') {
      const unclassified = txns.filter(t => !t.bankFeeType && !t.isBankFee && !t.description);
      const needsReview  = txns.filter(t => t.warnings && t.warnings.length > 0);
      const reviewPct    = txns.length > 0 ? ((needsReview.length / txns.length) * 100).toFixed(1) : '0';

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'مشاكل جودة البيانات — كشف الحساب',
        summary: `جودة الكشف: ${qualityScore}%. ${needsReview.length} عملية تحتاج مراجعة، ${unclassified.length} غير مصنفة.`,
        capabilityLevel: 'partial',
        highlights: needsReview.slice(0, 6).map(t => ({
          icon: '⚠️',
          labelAr: t.description?.slice(0, 50) ?? 'عملية بلا وصف',
          value: t.debit > 0 ? kd(t.debit) : kd(t.credit),
          kind: 'money' as const,
        })),
        statistics: [
          { labelAr: 'تحتاج مراجعة',    value: needsReview.length,  kind: 'count' },
          { labelAr: 'غير مصنفة',        value: unclassified.length, kind: 'count' },
          { labelAr: 'نسبة المشاكل',     value: `${reviewPct}%`,     kind: 'percent' },
          { labelAr: 'جودة الكشف',       value: `${qualityScore}%`,  kind: 'percent' },
        ],
        cards: [{
          titleAr: 'توزيع مشاكل الجودة',
          rows: [
            { labelAr: 'تحتاج مراجعة',     value: needsReview.length,      kind: 'count' },
            { labelAr: 'غير مصنفة',         value: unclassified.length,     kind: 'count' },
            { labelAr: 'مكررة',             value: ws.duplicates ?? 0,      kind: 'count' },
            { labelAr: 'مُتجاهَلة',         value: ws.ignored    ?? 0,      kind: 'count' },
            { labelAr: 'إجمالي العمليات',   value: txns.length,             kind: 'count' },
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
        warnings: needsReview.length > 5
          ? [{ message: `${needsReview.length} عملية تحتاج مراجعة — يُنصح بفحص الكشف.`, severity: 'info' }]
          : [{ message: 'جودة الكشف مقبولة.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: statement_overview ───────────────────────────────────────────
    if (intent === 'statement_overview') {
      const totalDebit  = txns.reduce((s, t) => s + t.debit,  0);
      const totalCredit = txns.reduce((s, t) => s + t.credit, 0);
      const fees        = txns.filter(t => t.isBankFee && t.debit > 0);
      const cheques     = txns.filter(t => t.bankFeeType === 'CHEQUE_PAYMENT');
      const transfers   = txns.filter(t => t.bankFeeType === 'BANK_TRANSFER');
      const withdrawals = txns.filter(t => t.bankFeeType === 'CASH_WITHDRAWAL');

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: `نظرة عامة — كشف ${latest.bankName}`,
        summary: `كشف ${latest.fileName}: ${txns.length} عملية، إيداعات ${kd(totalCredit)}، سحوبات ${kd(totalDebit)}. جودة البيانات ${qualityScore}%.`,
        capabilityLevel: 'complete',
        highlights: [
          { icon: '↑', labelAr: 'إجمالي الإيداعات',  value: kd(totalCredit),      kind: 'money' },
          { icon: '↓', labelAr: 'إجمالي السحوبات',   value: kd(totalDebit),       kind: 'money' },
          { icon: '🏷️', labelAr: 'رسوم بنكية',       value: kd(fees.reduce((s,t)=>s+t.debit,0)), kind: 'money' },
          { icon: '📋', labelAr: 'شيكات',             value: String(cheques.length), kind: 'count' },
        ],
        statistics: [
          { labelAr: 'إجمالي الإيداعات',  value: kd(totalCredit),  kind: 'money' },
          { labelAr: 'إجمالي السحوبات',   value: kd(totalDebit),   kind: 'money' },
          { labelAr: 'الرصيد الصافي',     value: kd(totalCredit - totalDebit), kind: 'money' },
          { labelAr: 'عدد العمليات',      value: txns.length,      kind: 'count' },
        ],
        cards: [{
          titleAr: 'توزيع العمليات',
          rows: [
            { labelAr: 'إيداعات',          value: txns.filter(t=>t.credit>0).length, kind: 'count' },
            { labelAr: 'سحوبات نقدية',     value: withdrawals.length, kind: 'count' },
            { labelAr: 'تحويلات بنكية',    value: transfers.length,   kind: 'count' },
            { labelAr: 'شيكات مدفوعة',    value: cheques.length,     kind: 'count' },
            { labelAr: 'رسوم بنكية',       value: fees.length,        kind: 'count' },
            { labelAr: 'قيد المراجعة',     value: ws.review     ?? 0, kind: 'count' },
            { labelAr: 'مكرر',             value: ws.duplicates ?? 0, kind: 'count' },
            { labelAr: 'مُتجاهَل',         value: ws.ignored    ?? 0, kind: 'count' },
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
        warnings: (ws.review ?? 0) > 5
          ? [{ message: `${ws.review} عملية قيد المراجعة — تحقق من الكشف.`, severity: 'info' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: summary (default) ─────────────────────────────────────────────
    const importedDate = new Date(latest.importedAt).toLocaleDateString('ar-KW');
    const balance      = (latest.totalCredits - latest.totalDebits).toFixed(3);

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: `ملخص كشف ${latest.bankName}`,
      summary: `آخر كشف حساب مستورد: ${latest.fileName} (${latest.bankName}) — استُورد بتاريخ ${importedDate}. ${latest.totalRows} عملية، إجمالي السحوبات ${kd(latest.totalDebits)} وإجمالي الإيداعات ${kd(latest.totalCredits)}.`,
      capabilityLevel: 'complete',
      highlights: [
        { icon: '↓', labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits),  kind: 'money' },
        { icon: '↑', labelAr: 'إجمالي الإيداعات', value: kd(latest.totalCredits), kind: 'money' },
        { icon: '⏳', labelAr: 'قيد المراجعة',     value: String(ws.review ?? 0),  kind: 'count' },
        { icon: '📋', labelAr: 'مكرر',             value: String(ws.duplicates ?? 0), kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits),  kind: 'money' },
        { labelAr: 'إجمالي الإيداعات', value: kd(latest.totalCredits), kind: 'money' },
        { labelAr: 'الرصيد الصافي',    value: `${balance} د.ك`,        kind: 'money' },
        { labelAr: 'عدد العمليات',     value: latest.totalRows,        kind: 'count' },
      ],
      cards: [{
        titleAr: 'توزيع العمليات',
        rows: [
          { labelAr: 'قيد المراجعة', value: ws.review     ?? 0, kind: 'count' },
          { labelAr: 'مكرر',         value: ws.duplicates ?? 0, kind: 'count' },
          { labelAr: 'مُتجاهَل',    value: ws.ignored    ?? 0, kind: 'count' },
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
      warnings: (ws.review ?? 0) > 10
        ? [{ message: `${ws.review} عملية قيد المراجعة — يُنصح بفحص الكشف.`, severity: 'info' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
