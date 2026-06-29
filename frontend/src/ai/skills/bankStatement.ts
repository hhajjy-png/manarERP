// ─── Bank Statement Skill ─────────────────────────────────────────────────────
// Wraps /bank-statement-import and /bank-statement-import/:id/workspace APIs.
// No backend changes. No SQL. Read-only.

import { api } from '../../api/client';
import type { SkillResult, SkillHighlight, SkillDataCard } from '../types';
import type { ImportListResult, ReconciliationWorkspace } from '../../api/bankStatementImport';

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
];

const kd = (n: number) => `${n.toFixed(3)} د.ك`;

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
    // 1. List imports — get latest
    const listRes = await api.get<{ data: ImportListResult }>(
      '/bank-statement-import',
      { params: { page: 1, pageSize: 5 } },
    );
    const items = listRes.data.data.items;
    if (!items.length) return noDataResult(prompt, intent, t0);

    const latest = items[0];

    // 2. Workspace for latest import (up to 200 rows for analysis)
    const wsRes = await api.get<{ data: ReconciliationWorkspace }>(
      `/bank-statement-import/${latest.id}/workspace`,
      { params: { pageSize: 100 } },
    );
    const ws   = wsRes.data.data;
    const txns = ws.transactions;

    // ── intent: withdrawals ────────────────────────────────────────────────
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
        highlights,
        statistics: [
          { labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits), kind: 'money' },
          { labelAr: 'عدد عمليات السحب', value: txns.filter(t => t.debit > 0).length, kind: 'count' },
          { labelAr: 'أكبر سحب واحد',    value: kd(debits[0]?.debit ?? 0), kind: 'money' },
        ],
        cards: [card],
        warnings: [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: deposits ───────────────────────────────────────────────────
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
        warnings: [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: fees ───────────────────────────────────────────────────────
    if (intent === 'fees') {
      const fees      = txns.filter(t => t.isBankFee && t.debit > 0);
      const feesTotal = fees.reduce((s, t) => s + t.debit, 0);

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'رسوم البنك',
        summary: fees.length
          ? `رُصد ${fees.length} بند رسوم بنكية بإجمالي ${kd(feesTotal)} في كشف ${latest.bankName}.`
          : `لم يُرصد أي رسوم بنكية في كشف ${latest.bankName}.`,
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
        warnings: feesTotal > 50
          ? [{ message: `إجمالي الرسوم ${kd(feesTotal)} — يُنصح بمراجعة شروط الحساب البنكي.`, severity: 'warning' }]
          : [],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: warnings ───────────────────────────────────────────────────
    if (intent === 'warnings') {
      const warned = txns.filter(t => t.warnings && t.warnings.length > 0);
      const pct    = txns.length > 0 ? ((warned.length / txns.length) * 100).toFixed(1) : '0';

      return {
        skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent, prompt,
        title: 'العمليات ذات التنبيهات',
        summary: warned.length
          ? `رُصد ${warned.length} عملية تحتوي على تنبيهات من أصل ${txns.length} عملية (${pct}%) في كشف ${latest.bankName}.`
          : `لا توجد عمليات تحتوي على تنبيهات في كشف ${latest.bankName}.`,
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
        warnings: warned.length > 0
          ? [{ message: `${warned.length} عملية تستوجب المراجعة.`, severity: 'warning' }]
          : [{ message: 'لا توجد تنبيهات — الكشف نظيف.', severity: 'info' }],
        sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
        executedAt: t0, executionMs: Date.now() - t0,
      };
    }

    // ── intent: summary (default) ──────────────────────────────────────────
    const importedDate = new Date(latest.importedAt).toLocaleDateString('ar-KW');
    const balance      = (latest.totalCredits - latest.totalDebits).toFixed(3);

    return {
      skillId: SKILL_ID, skillTitleAr: SKILL_TITLE, intent: 'summary', prompt,
      title: `ملخص كشف ${latest.bankName}`,
      summary: `آخر كشف حساب مستورد: ${latest.fileName} (${latest.bankName}) — استُورد بتاريخ ${importedDate}. ${latest.totalRows} عملية، إجمالي السحوبات ${kd(latest.totalDebits)} وإجمالي الإيداعات ${kd(latest.totalCredits)}.`,
      highlights: [
        { icon: '↓', labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits),  kind: 'money' },
        { icon: '↑', labelAr: 'إجمالي الإيداعات', value: kd(latest.totalCredits), kind: 'money' },
        { icon: '✓', labelAr: 'عمليات مطابقة',    value: String(ws.matched ?? 0),  kind: 'count' },
        { icon: '⚠️', labelAr: 'قيد المراجعة',     value: String(ws.review ?? 0),   kind: 'count' },
      ],
      statistics: [
        { labelAr: 'إجمالي السحوبات',  value: kd(latest.totalDebits),  kind: 'money' },
        { labelAr: 'إجمالي الإيداعات', value: kd(latest.totalCredits), kind: 'money' },
        { labelAr: 'الرصيد الصافي',    value: `${balance} د.ك`,        kind: 'money' },
        { labelAr: 'عدد العمليات',     value: latest.totalRows,        kind: 'count' },
      ],
      cards: [{
        titleAr: 'حالة المطابقة',
        rows: [
          { labelAr: 'مطابق',       value: ws.matched    ?? 0, kind: 'count' },
          { labelAr: 'غير مطابق',   value: ws.unmatched  ?? 0, kind: 'count' },
          { labelAr: 'قيد المراجعة', value: ws.review     ?? 0, kind: 'count' },
          { labelAr: 'مكرر',        value: ws.duplicates ?? 0, kind: 'count' },
          { labelAr: 'مُتجاهَل',    value: ws.ignored    ?? 0, kind: 'count' },
        ],
      }],
      warnings: (ws.unmatched ?? 0) > 10
        ? [{ message: `${ws.unmatched} عملية غير مطابقة — يُنصح بمراجعة الكشف.`, severity: 'warning' }]
        : [],
      sources: SOURCES, suggestedQuestions: FOLLOW_UPS,
      executedAt: t0, executionMs: Date.now() - t0,
    };

  } catch (err) {
    return errResult(prompt, intent, err, t0);
  }
}
