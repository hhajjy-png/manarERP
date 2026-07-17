/**
 * Financial Cross-Validation — Accounting Integrity Pack v1
 *
 * يتحقّق أن كل السطوح المالية تُنتج نفس الأرقام لنفس الفترة، عبر مسارات مستقلّة:
 *   • محرّك الأستاذ العام (glProfitAndLoss)           — المصدر الموحّد
 *   • ميزان المراجعة (financialService.getTrialBalance) — groupBy مستقل تمامًا
 *   • الملخص المالي (accountingService.financialSummary)
 *   • لوحة القيادة (dashboardService.overview / executive)
 *   • الذمم: التشغيلي (Invoice) مقابل رصيد حساب الرقابة في GL مقابل تقرير الأعمار
 *
 * نجاح = فرق أقل من فلس واحد (0.001) في كل مقارنة. أي انحراف ⇒ الكود يخرج بـ 1.
 *
 * التشغيل:  npx tsx scripts/cross-validate-accounting-v1.ts
 */
import { prisma } from '../src/config/database';
import { accountingService } from '../src/modules/accounting/accounting.service';
import { financialService } from '../src/modules/financial/financial.service';
import { dashboardService } from '../src/modules/dashboard/dashboard.service';
import { glProfitAndLoss, glAccountFlow } from '../src/shared/services/gl.reporting';
import { SYSTEM_ACCOUNT_CODES } from '../src/modules/accounting/accounting.accounts';

const EPS = 0.001;
let failures = 0;
let checks = 0;

function check(name: string, a: number, b: number): void {
  checks++;
  const ok = Math.abs(a - b) < EPS;
  if (!ok) failures++;
  console.log(`  ${ok ? '✓' : '✗ FAIL'}  ${name.padEnd(52)} ${a.toFixed(3)}  vs  ${b.toFixed(3)}`);
}

/** صافي الربح من ميزان المراجعة (مسار groupBy مستقل عن المحرّك). */
async function netFromTrialBalance(asOf: Date): Promise<{ revenue: number; expense: number; net: number }> {
  const tb = await financialService.getTrialBalance({
    mode: 'as-of',
    asOfDate: asOf.toISOString(),
    showZeroBalances: true,
  });
  let revenue = 0;
  let expense = 0;
  for (const r of tb.rows as { accountType: string; totalDebit: number; totalCredit: number }[]) {
    if (r.accountType === 'REVENUE') revenue += r.totalCredit - r.totalDebit;
    if (r.accountType === 'EXPENSE') expense += r.totalDebit - r.totalCredit;
  }
  return { revenue, expense, net: revenue - expense };
}

async function main() {
  const now = new Date();
  const farFuture = new Date('2100-01-01');

  // ── 1) اتّساق الأرباح والخسائر (تراكمي حتى الآن) عبر المسارات ─────────────────
  console.log('\n[1] الأرباح والخسائر — محرّك GL مقابل ميزان المراجعة مقابل الملخص مقابل لوحة القيادة');
  const engineAll = await glProfitAndLoss(); // كل الفترات
  const tbAll = await netFromTrialBalance(farFuture);
  const summaryAll = await accountingService.financialSummary(); // بلا فترة = كل الفترات
  const overview = await dashboardService.overview();
  const executive = await dashboardService.executive();

  check('TrialBalance.revenue == engine.revenue', tbAll.revenue, engineAll.revenue);
  check('TrialBalance.expense == engine.expense', tbAll.expense, engineAll.expenses);
  check('TrialBalance.net     == engine.net',     tbAll.net,     engineAll.netProfit);
  check('financialSummary.revenue == engine.revenue', summaryAll.totalRevenue, engineAll.revenue);
  check('financialSummary.expense == engine.expense', summaryAll.totalExpenses, engineAll.expenses);
  check('financialSummary.net     == engine.net',     summaryAll.netProfit,     engineAll.netProfit);
  check('dashboard.overview.revenue  == engine.revenue', overview.finance.totalRevenue, engineAll.revenue);
  check('dashboard.overview.expense  == engine.expense', overview.finance.totalExpense, engineAll.expenses);
  check('dashboard.overview.netProfit== engine.net',     overview.finance.netProfit,    engineAll.netProfit);
  check('dashboard.executive.netProfit == engine.net',   executive.kpis.finance.netProfit, engineAll.netProfit);

  // ── 2) اتّساق الأرباح والخسائر عبر نوافذ زمنية (period) ───────────────────────
  console.log('\n[2] الأرباح والخسائر عبر نوافذ زمنية — الملخص المالي مقابل المحرّك');
  const windows: { label: string; from: string; to: string }[] = [
    { label: '2026 كامل', from: '2026-01-01', to: '2026-12-31' },
    { label: '2026-H1',   from: '2026-01-01', to: '2026-06-30' },
    { label: '2026-06',   from: '2026-06-01', to: '2026-06-30' },
  ];
  for (const w of windows) {
    const eng = await glProfitAndLoss({ from: new Date(w.from), to: new Date(`${w.to}T23:59:59`) });
    const sum = await accountingService.financialSummary(w.from, `${w.to}T23:59:59`);
    check(`[${w.label}] summary.revenue == engine`, sum.totalRevenue, eng.revenue);
    check(`[${w.label}] summary.expense == engine`, sum.totalExpenses, eng.expenses);
    check(`[${w.label}] summary.net     == engine`, sum.netProfit,     eng.netProfit);
  }

  // ── 3) اتّساق الذمم المدينة (AR) — التشغيلي مقابل GL مقابل الأعمار مقابل اللوحة ──
  console.log('\n[3] الذمم المدينة (AR) — التشغيلي مقابل رصيد GL مقابل تقرير الأعمار مقابل ملخص اللوحة');
  const opAgg = await prisma.invoice.aggregate({
    where: { direction: 'SALES', status: { not: 'CANCELLED' } },
    _sum: { total: true, paidAmount: true },
  });
  const opAR = (opAgg._sum.total ?? 0) - (opAgg._sum.paidAmount ?? 0);
  const arFlow = await glAccountFlow(SYSTEM_ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
  const glAR = arFlow.debit - arFlow.credit;
  const aging = await financialService.getArAging({});
  const agingTotal = Number(aging.summary?.totalOutstanding ?? 0);
  const dash = await financialService.getDashboardSummary();
  const dashAR = dash.arSummary.totalOutstanding;

  check('GL AR balance == operational outstanding', glAR, opAR);
  check('AR aging total == operational outstanding', agingTotal, opAR);
  check('dashboard-summary AR == operational outstanding', dashAR, opAR);

  // ── 4) اتّساق مجاميع كشوف الحسابات مع إجمالي الذمم ──────────────────────────
  console.log('\n[4] كشوف حسابات العملاء — مجموع الأرصدة الختامية == إجمالي الذمم');
  const customers = await prisma.customer.findMany({ select: { id: true } });
  let stmtSum = 0;
  for (const c of customers) {
    const st = await financialService.getStatement('CUSTOMER', c.id, {});
    stmtSum += Number(st.summary?.closingBalance ?? 0);
  }
  check('Σ customer statement closing == operational AR', stmtSum, opAR);

  // ── 5) لا-تغيّر ميزان المراجعة (توازن الدفتر) ───────────────────────────────
  console.log('\n[5] لا-تغيّر: توازن الأستاذ العام (إجمالي المدين = إجمالي الدائن)');
  const tbNow = await financialService.getTrialBalance({ mode: 'as-of', asOfDate: farFuture.toISOString(), showZeroBalances: true });
  check('TrialBalance ΣtotalDebit == ΣtotalCredit', Number(tbNow.summary?.totalDebit ?? 0), Number(tbNow.summary?.totalCredit ?? 0));

  console.log(`\n════════════════════════════════════════`);
  console.log(`النتيجة: ${checks - failures}/${checks} تحقّق ناجح، ${failures} إخفاق.`);
  console.log(`الربح الاستحقاقي الموحّد (كل الفترات): ${engineAll.netProfit.toFixed(3)} د.ك`);
  console.log(`════════════════════════════════════════`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(failures === 0 ? 0 : 1);
  })
  .catch(async (e) => {
    console.error('خطأ في التحقّق المتقاطع:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
