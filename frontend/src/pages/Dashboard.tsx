import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { periodToRangeParams } from '../lib/financialPeriod';
import { useT } from '../lib/i18n';
import PrivateAmount from '../components/PrivateAmount';
import { MetricCard, SectionCard, StatusChip, Button } from '../components/explorer/ExplorerKit';

import '../components/dashboard/dashboard.css';
import '../components/explorer/explorer-kit.css';

import AlertPanel from '../components/dashboard/AlertPanel';
import type { DashAlert } from '../components/dashboard/AlertPanel';
import ContractProgressList from '../components/dashboard/ContractProgressCard';
import RevenueChart from '../components/dashboard/RevenueChart';
import ContractStatusChart from '../components/dashboard/ContractStatusChart';
import LatestInvoicesTable from '../components/dashboard/LatestInvoicesTable';
import LatestExpensesTable from '../components/dashboard/LatestExpensesTable';
import {
  StatsSkeletons,
  Skeleton,
  TableRowSkeletons,
} from '../components/dashboard/Skeleton';
import LastAutoBackupCard from '../components/dashboard/LastAutoBackupCard';
import ExpirationWidget from '../components/dashboard/ExpirationWidget';
import FinancialIntelPanel from '../components/dashboard/FinancialIntelPanel';
import type { FinV2Data } from '../components/dashboard/FinancialIntelPanel';
import ExecutiveIntelligenceV2Panel from '../components/dashboard/ExecutiveIntelligenceV2Panel';
import type { IntelV2Data } from '../components/dashboard/ExecutiveIntelligenceV2Panel';
import { FinancialDashboardTab } from '../components/financial/FinancialDashboardTab';
// Command Center is DECOMPOSED into the executive spine below — its former sections
// are rendered directly (same components, same props, same data) instead of via the
// composite wrapper, so the primary KPI row leads and the deep panels collapse.
import HealthGaugeSection from '../components/dashboard/command/HealthGaugeSection';
import ActionCenterSection from '../components/dashboard/command/ActionCenterSection';
import KpiRowSection from '../components/dashboard/command/KpiRowSection';
import PerformanceChartSection from '../components/dashboard/command/PerformanceChartSection';
import RevenueDistributionSection from '../components/dashboard/command/RevenueDistributionSection';
import QuickActionsSection from '../components/dashboard/command/QuickActionsSection';
import RecentActivityFeed from '../components/dashboard/command/RecentActivityFeed';
import RecommendationsSection from '../components/dashboard/command/RecommendationsSection';
import { useDashboardCommandData } from '../components/dashboard/command/useDashboardCommandData';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiAny = any;

const CONTRACT_STATUS_CLS: Record<string, string> = {
  ACTIVE: 'green',
  EXPIRED: 'gray',
  RENEWING: 'amber',
  SUSPENDED: 'red',
};

/**
 * شريحة اتجاه شهري للملخّص التنفيذي — تُعرض فقط عند توفّر نسبة تغيّر حقيقية (لا تُختلق قيمة).
 * higherIsBetter: هل ارتفاع القيمة إيجابي (الإيرادات/التحصيلات) أم سلبي (المصروفات).
 */
function TrendChip({ label, pct, higherIsBetter }: { label: string; pct: number | null; higherIsBetter: boolean }) {
  if (pct == null || !Number.isFinite(pct)) return null;
  const up = pct >= 0;
  const good = higherIsBetter ? up : !up;
  return (
    <span className={`db-today-chip ${good ? 'ok' : 'warn'}`}>
      <span className="db-today-dot" />{label} {up ? '▲' : '▼'} {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

function GeneralDashboardContent() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { t } = useT();
  const { period } = useFinancialPeriod();

  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshAt, setRefreshAt] = useState<Date | null>(null);

  // Executive Command Center data — مؤشرات الحركة/الذمم تتبع الفترة العالمية.
  const commandData = useDashboardCommandData(refreshKey, periodToRangeParams(period));

  // ── State slices populated from /dashboard/executive ─────────────────────
  const [exec, setExec] = useState<ApiAny>(null);
  const [att, setAtt] = useState<ApiAny>({});
  const [trend, setTrend] = useState<ApiAny[]>([]);
  const [cStatus, setCStatus] = useState<ApiAny[]>([]);
  const [iStatus, setIStatus] = useState<ApiAny[]>([]);
  const [invoices, setInvoices] = useState<ApiAny[]>([]);
  const [expenses, setExpenses] = useState<ApiAny[]>([]);
  const [contracts, setContracts] = useState<ApiAny[]>([]);
  const [alerts, setAlerts] = useState<DashAlert[]>([]);
  const [ops, setOps] = useState<ApiAny>(null);
  const [finV2, setFinV2] = useState<FinV2Data | null>(null);
  const [intelV2, setIntelV2] = useState<IntelV2Data | null>(null);
  const [intelV2Loading, setIntelV2Loading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      // Only show skeleton on first load; subsequent refreshes use the refreshing indicator
      if (exec === null) setInitialLoading(true);
      else setRefreshing(true);
      setError('');

      // Intelligence V2 — isolated fetch; failure does NOT break main dashboard
      setIntelV2Loading(true);
      const intelPromise = api.get('/dashboard/executive-intelligence-v2')
        .then(r => r.data?.data ?? null)
        .catch(() => null);
      try {
        const [execRes, equipRes, empsRes, opsRes, finV2Res] = await Promise.all([
          api.get('/dashboard/executive'),
          api.get('/equipment/expiring', { params: { days: 30 } }),
          api.get('/employees/expiring-documents', { params: { days: 30 } }),
          api.get('/dashboard/operational'),
          api.get('/dashboard/executive-financial-v2'),
        ]);

        if (cancelled) return;

        const d = execRes.data?.data ?? {};
        setExec(d.kpis ?? null);
        setAtt(d.attendance ?? {});
        setTrend(d.trend ?? []);
        setCStatus(d.contractStatus ?? []);
        setIStatus(d.invoiceStatus ?? []);
        setInvoices(d.latestInvoices ?? []);
        setExpenses(d.latestExpenses ?? []);
        setContracts(d.latestContracts ?? []);

        // Build alerts from equipment + employee expiry endpoints
        const equipAlerts: DashAlert[] = (equipRes.data?.data || []).map((e: ApiAny) => ({
          title: `${t('dash.alert.equipment')}: ${e.code}`,
          desc: `${t('dash.alert.vehicle_book')}: ${e.registration?.remainingText ?? '—'}`,
          status: (e.registration?.expired ? 'red' : 'amber') as DashAlert['status'],
          icon: '🚜',
        }));
        const empAlerts: DashAlert[] = [];
        (empsRes.data?.data || []).forEach((e: ApiAny) => {
          (e.alerts ?? []).forEach((a: ApiAny) => {
            empAlerts.push({
              title: e.fullName,
              desc: `${a.document}: ${a.remainingDays < 0 ? t('dash.alert.expired') : t('dash.alert.expires_in', { days: a.remainingDays })}`,
              status: (a.remainingDays < 0 ? 'red' : 'amber') as DashAlert['status'],
              icon: '👷',
            });
          });
        });
        setAlerts([...equipAlerts, ...empAlerts]);
        setOps(opsRes.data?.data ?? null);
        setFinV2(finV2Res.data?.data ?? null);
        setRefreshAt(new Date());
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) {
          setInitialLoading(false);
          setRefreshing(false);
        }
      }

      // Resolve intel panel (already running in parallel)
      const intelData = await intelPromise;
      if (!cancelled) {
        setIntelV2(intelData);
        setIntelV2Loading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived values ────────────────────────────────────────────────────────
  const f = exec?.finance ?? {};
  const c = exec?.contracts ?? {};
  const eq = exec?.equipment ?? {};
  const emp = exec?.employees ?? {};
  const inv = exec?.invoices ?? {};

  const workingEquipment = eq.active ?? 0;
  const brokenEquipment = (eq.total ?? 0) - workingEquipment;

  // Kuwait weekend: Friday (5) and Saturday (6)
  const isWeekend = (() => { const d = new Date().getDay(); return d === 5 || d === 6; })();

  const expiredContracts =
    (cStatus as ApiAny[]).find((s: ApiAny) => s.status === 'EXPIRED')?.count ?? 0;
  const duePayments = inv.unpaid ?? 0;
  const expiringContracts = contracts.filter((ct: ApiAny) => {
    if (!ct.endDate) return false;
    const daysLeft = (new Date(ct.endDate).getTime() - Date.now()) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  const invStatusTotal =
    (iStatus as ApiAny[]).reduce((s: number, x: ApiAny) => s + x.count, 0) || 1;

  // ── Executive daily summary (derived from existing state only — no new fetches)
  const overdueInvoices =
    (iStatus as ApiAny[]).find((s: ApiAny) => s.status === 'OVERDUE')?.count ?? 0;
  const pendingReview = ops
    ? (ops.pendingExpensesCount ?? 0) + (ops.draftPayrollCount ?? 0) +
      (ops.unprintedChequesCount ?? 0) + (ops.outstandingInvoicesCount ?? 0) +
      (ops.expiringAgreementsCount ?? 0)
    : 0;
  const daySummaryAllClear =
    (inv.unpaid ?? 0) === 0 && overdueInvoices === 0 &&
    expiringContracts === 0 && alerts.length === 0 && pendingReview === 0;

  // ── Executive financial glance (existing data only — from the decision-center summary) ──
  const finSummary = commandData.decisionCenter?.financialSummary ?? null;
  const momRevenue = finSummary?.monthOnMonthChanges?.revenue ?? null;
  const momExpenses = finSummary?.monthOnMonthChanges?.expenses ?? null;
  const momCollections = finSummary?.monthOnMonthChanges?.collections ?? null;
  const thisMonthProfit = finSummary?.thisMonth?.profit ?? null;
  const hasFinancialGlance = finSummary != null &&
    (momRevenue != null || momExpenses != null || momCollections != null || thisMonthProfit != null);

  const hasPending = !initialLoading && ops && (
    ops.pendingExpensesCount > 0 || ops.draftPayrollCount > 0 || ops.unprintedChequesCount > 0 ||
    ops.outstandingInvoicesCount > 0 || ops.expiringAgreementsCount > 0
  );

  // Display-only period label for the executive header (no control, no new data).

  return (
    // xpl-scope makes ExplorerKit tokens (--xpl-*) + kit component styles resolve for the
    // canonical SectionCard / MetricCard spine and the tokenised charts. Tokens/font only —
    // no layout side-effects; existing db-* markup is unaffected.
    <div className="db-page xpl-scope">
      {/* ═══════════════ §1 — EXECUTIVE HEADER (title · period · refresh) ═══════════════ */}
      <div className="db-exec-head">
        <div className="db-exec-head-main">
          <h2 className="db-exec-head-title">لوحة التحكم</h2>
          <p className="db-exec-head-sub">نظرة عامة على أداء الشركة</p>
        </div>
        <div className="db-exec-head-actions">
          <PeriodControl />
          {!initialLoading && refreshAt && (
            <span className="db-exec-updated">آخر تحديث {refreshAt.toLocaleTimeString('ar')}</span>
          )}
          <button
            type="button"
            className="db-refresh-loader-btn"
            disabled={initialLoading || refreshing}
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label={t('page.dashboard.retry')}
          >
            <svg className="retry-loader" viewBox="25 25 50 50">
              <circle cx="50" cy="50" r="20"></circle>
            </svg>
          </button>
        </div>
      </div>

      {/* ── Error State ────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert error db-alert-error">
          ⚠️ {error}
          <button
            type="button"
            className="btn secondary db-retry-btn"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            {t('page.dashboard.retry')}
          </button>
        </div>
      )}

      {/* ═══════════════ §2 — PRIMARY KPI ROW (financial results — the hero) ═══════════════ */}
      <div className="db-kpi-hero">
        <SectionCard title="المؤشرات المالية الرئيسية" icon="query_stats">
          <KpiRowSection
            financial={commandData.decisionCenter?.financialSummary ?? null}
            cashFlow={commandData.cashFlowThisMonth}
            loading={commandData.loading}
          />
        </SectionCard>
      </div>

      {/* ═══════════════ §3 — QUICK INSIGHTS (company-status glance) ═══════════════ */}
      {!initialLoading && exec && (
        <div className="db-today" role="status" aria-label={t('page.dashboard.today_summary')}>
          <span className="db-today-label">{t('page.dashboard.today_summary')}</span>
          <div className="db-today-chips">
            {hasFinancialGlance && (
              <>
                {thisMonthProfit != null && (
                  <span className={`db-today-chip ${thisMonthProfit >= 0 ? 'ok' : 'crit'}`}>
                    <span className="db-today-dot" />{thisMonthProfit >= 0 ? t('today.net_profit_month') : t('today.net_loss_month')}
                  </span>
                )}
                <TrendChip label={t('today.revenue')} pct={momRevenue} higherIsBetter />
                <TrendChip label={t('today.collections')} pct={momCollections} higherIsBetter />
                <TrendChip label={t('today.expenses')} pct={momExpenses} higherIsBetter={false} />
              </>
            )}
            {daySummaryAllClear ? (
              <span className="db-today-chip ok">
                <span className="db-today-dot" />{t('today.all_clear')}
              </span>
            ) : (
              <>
                <span className={`db-today-chip ${(inv.unpaid ?? 0) > 0 ? 'warn' : 'ok'}`}>
                  <span className="db-today-dot" />{t('today.unpaid', { count: inv.unpaid ?? 0 })}
                </span>
                <span className={`db-today-chip ${overdueInvoices > 0 ? 'crit' : 'ok'}`}>
                  <span className="db-today-dot" />{t('today.overdue', { count: overdueInvoices })}
                </span>
                <span className={`db-today-chip ${expiringContracts > 0 ? 'warn' : 'ok'}`}>
                  <span className="db-today-dot" />
                  {expiringContracts > 0
                    ? t('today.expiring_contracts', { count: expiringContracts })
                    : t('today.no_expiring_contracts')}
                </span>
                {alerts.length > 0 && (
                  <span className="db-today-chip warn">
                    <span className="db-today-dot" />{t('today.expiry_warnings', { count: alerts.length })}
                  </span>
                )}
                {pendingReview > 0 && (
                  <span className="db-today-chip warn">
                    <span className="db-today-dot" />{t('today.pending_review', { count: pendingReview })}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════ §4 — CRITICAL ALERTS & ACTIONS ═══════════════ */}
      <div className="db-section-label">التنبيهات والإجراءات</div>

      <ExpirationWidget />

      <SectionCard title="يحتاج إجراءً الآن" icon="priority_high">
        <ActionCenterSection cards={commandData.decisionCenter?.decisionCards ?? []} loading={commandData.loading} />
      </SectionCard>

      {initialLoading ? (
        <div className="db-alert-widgets">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="db-aw db-aw-loading">
              <Skeleton height={42} width="42px" style={{ borderRadius: 11, flexShrink: 0 }} />
              <div className="db-aw-skel-body">
                <Skeleton height={22} width="45%" style={{ marginBottom: 6 }} />
                <Skeleton height={11} width="65%" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="db-alert-widgets">
          <div className={`db-aw ${expiredContracts > 0 ? 'aw-critical' : 'aw-safe'}`}>
            <div className="db-aw-icon">📋</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{expiredContracts}</div>
              <div className="db-aw-label">{t('page.dashboard.expired_contracts')}</div>
            </div>
            <span className="db-aw-tag">{t('page.dashboard.contract_unit')}</span>
          </div>
          <div className={`db-aw ${brokenEquipment > 0 ? 'aw-warning' : 'aw-safe'}`}>
            <div className="db-aw-icon">🚜</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{brokenEquipment}</div>
              <div className="db-aw-label">{t('page.dashboard.broken_equipment')}</div>
            </div>
            <span className="db-aw-tag">{t('page.dashboard.equipment_unit')}</span>
          </div>
          <div className={`db-aw ${duePayments > 0 ? 'aw-critical' : 'aw-safe'}`}>
            <div className="db-aw-icon">💳</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{duePayments}</div>
              <div className="db-aw-label">{t('page.dashboard.due_payments')}</div>
              {(inv.unpaidAmount ?? 0) > 0 && (
                <div className="db-aw-sub"><PrivateAmount value={inv.unpaidAmount} /></div>
              )}
            </div>
            <span className="db-aw-tag">{t('page.dashboard.invoice_unit')}</span>
          </div>
          <div className={`db-aw ${expiringContracts > 0 ? 'aw-warning' : 'aw-safe'}`}>
            <div className="db-aw-icon">⏰</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{expiringContracts}</div>
              <div className="db-aw-label">{t('page.dashboard.expiring_contracts')}</div>
              <div className="db-aw-sub">{t('page.dashboard.within_30')}</div>
            </div>
            <span className="db-aw-tag">{t('page.dashboard.contract_unit')}</span>
          </div>
        </div>
      )}

      {hasPending && (
        <>
          <div className="db-section-label">{t('ops.pending.title')}</div>
          <div className="db-alert-widgets">
            {ops.pendingExpensesCount > 0 && (
              <button
                type="button"
                className="db-aw db-aw-btn aw-warning"
                onClick={() => navigate('/expenses')}
                aria-label={`${t('ops.pending.expenses')}: ${ops.pendingExpensesCount}`}
              >
                <div className="db-aw-icon" aria-hidden="true">🧾</div>
                <div className="db-aw-body">
                  <div className="db-aw-val">{ops.pendingExpensesCount}</div>
                  <div className="db-aw-label">{t('ops.pending.expenses')}</div>
                  <div className="db-aw-sub"><PrivateAmount value={ops.pendingExpensesTotal} /></div>
                </div>
                <span className="db-aw-tag">{t('ops.pending.expense_unit')}</span>
              </button>
            )}
            {ops.draftPayrollCount > 0 && (
              <button
                type="button"
                className="db-aw db-aw-btn aw-warning"
                onClick={() => navigate('/salaries')}
                aria-label={`${t('ops.pending.draft_payroll')}: ${ops.draftPayrollCount}`}
              >
                <div className="db-aw-icon" aria-hidden="true">💼</div>
                <div className="db-aw-body">
                  <div className="db-aw-val">{ops.draftPayrollCount}</div>
                  <div className="db-aw-label">{t('ops.pending.draft_payroll')}</div>
                </div>
                <span className="db-aw-tag">{t('ops.pending.salary_unit')}</span>
              </button>
            )}
            {ops.unprintedChequesCount > 0 && (
              <button
                type="button"
                className="db-aw db-aw-btn aw-warning"
                onClick={() => navigate('/cheques')}
                aria-label={`${t('ops.pending.unprinted_cheques')}: ${ops.unprintedChequesCount}`}
              >
                <div className="db-aw-icon" aria-hidden="true">🖨️</div>
                <div className="db-aw-body">
                  <div className="db-aw-val">{ops.unprintedChequesCount}</div>
                  <div className="db-aw-label">{t('ops.pending.unprinted_cheques')}</div>
                </div>
                <span className="db-aw-tag">{t('ops.pending.cheque_unit')}</span>
              </button>
            )}
            {ops.outstandingInvoicesCount > 0 && (
              <button
                type="button"
                className="db-aw db-aw-btn aw-critical"
                onClick={() => navigate('/invoices')}
                aria-label={`${t('ops.pending.outstanding_invoices')}: ${ops.outstandingInvoicesCount}`}
              >
                <div className="db-aw-icon" aria-hidden="true">📄</div>
                <div className="db-aw-body">
                  <div className="db-aw-val">{ops.outstandingInvoicesCount}</div>
                  <div className="db-aw-label">{t('ops.pending.outstanding_invoices')}</div>
                  <div className="db-aw-sub"><PrivateAmount value={ops.outstandingInvoicesTotal} /></div>
                </div>
                <span className="db-aw-tag">{t('ops.pending.invoice_unit')}</span>
              </button>
            )}
            {ops.expiringAgreementsCount > 0 && (
              <button
                type="button"
                className="db-aw db-aw-btn aw-warning"
                onClick={() => navigate('/prices')}
                aria-label={`${t('ops.pending.expiring_agreements')}: ${ops.expiringAgreementsCount}`}
              >
                <div className="db-aw-icon" aria-hidden="true">⏰</div>
                <div className="db-aw-body">
                  <div className="db-aw-val">{ops.expiringAgreementsCount}</div>
                  <div className="db-aw-label">{t('ops.pending.expiring_agreements')}</div>
                  <div className="db-aw-sub">{t('ops.pending.within_30')}</div>
                </div>
                <span className="db-aw-tag">{t('ops.pending.agreement_unit')}</span>
              </button>
            )}
          </div>
        </>
      )}

      <SectionCard
        title={t('section.urgent_alerts')}
        icon="warning"
        padded={false}
        actions={!initialLoading && alerts.length > 0 ? <StatusChip tone="red">{alerts.length}</StatusChip> : undefined}
      >
        <div className="db-card-body scrollable">
          <AlertPanel alerts={alerts} loading={initialLoading} />
        </div>
      </SectionCard>

      {/* ═══════════════ §5 — EXECUTIVE RECOMMENDATIONS (high priority — promoted) ═══════════════ */}
      <div className="db-reco-emphasis">
        <SectionCard title="التوصيات الذكية" icon="lightbulb">
          <RecommendationsSection recommendations={commandData.decisionCenter?.recommendations ?? []} loading={commandData.loading} />
        </SectionCard>
      </div>

      {/* ═══════════════ §6 — FINANCIAL ANALYTICS ═══════════════ */}
      <div className="db-section-label">التحليلات المالية</div>

      <div className="db-charts-row">
        <SectionCard title={t('section.revenue_flow')} icon="bar_chart">
          <RevenueChart data={trend} loading={initialLoading} />
        </SectionCard>
        <SectionCard title="توزيع الإيرادات حسب العميل" icon="donut_small">
          <RevenueDistributionSection slices={commandData.revenueDistribution} loading={commandData.loading} />
        </SectionCard>
      </div>

      <div className="db-charts-row">
        <SectionCard title={t('section.invoice_status')} icon="request_quote">
          {initialLoading ? (
            <div className="db-inv-rows">
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} height={36} style={{ borderRadius: 8 }} />
              ))}
            </div>
          ) : iStatus.length === 0 ? (
            <div className="db-empty">
              <div className="db-empty-icon">🧾</div>
              <div className="db-empty-text">{t('empty.no_invoices')}</div>
            </div>
          ) : (
            <div className="db-inv-rows">
              {(iStatus as ApiAny[])
                .sort((a: ApiAny, b: ApiAny) => b.count - a.count)
                .map((s: ApiAny) => {
                  const pct = Math.round((s.count / invStatusTotal) * 100);
                  return (
                    <div key={s.status}>
                      <div className="db-inv-row-head">
                        <span className="db-inv-row-label">
                          {t('inv.status.' + s.status.toLowerCase())}
                        </span>
                        <span className="db-inv-row-count">
                          {s.count} ({pct}%)
                        </span>
                      </div>
                      <div className="db-inv-track">
                        <div
                          className={`db-inv-fill db-inv-fill--${s.status.toLowerCase()}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </SectionCard>

        <SectionCard
          title={t('section.latest_invoices')}
          icon="receipt_long"
          padded={false}
          actions={!initialLoading && invoices.length > 0
            ? <Button variant="secondary" onClick={() => navigate('/invoices')}>{t('page.dashboard.view_all')}</Button>
            : undefined}
        >
          <LatestInvoicesTable invoices={invoices} loading={initialLoading} />
        </SectionCard>
      </div>

      {/* ═══════════════ §7 — OPERATIONAL ANALYTICS ═══════════════ */}
      <div className="db-section-label">{t('section.data_summary')}</div>
      {initialLoading ? (
        <StatsSkeletons />
      ) : (
        <div className="xpl-kpi-grid db-ops-summary">
          <MetricCard
            tone="indigo"
            label={t('stat.registered_customers')}
            value={exec?.customers?.total ?? 0}
            icon="groups"
          />
          <MetricCard
            tone="indigo"
            label={t('stat.total_invoices')}
            value={inv.total ?? 0}
            icon="receipt_long"
            sub={inv.unpaid ? t('stat.unpaid', { count: inv.unpaid }) : t('stat.all_paid')}
          />
          <MetricCard
            tone="indigo"
            label={t('stat.active_employees')}
            value={`${emp.active ?? 0} / ${emp.total ?? 0}`}
            icon="badge"
            sub={t('stat.of_total_employees')}
          />
          <MetricCard
            tone="indigo"
            label={t('stat.working_equipment')}
            value={`${workingEquipment} / ${eq.total ?? 0}`}
            icon="construction"
            sub={
              brokenEquipment > 0
                ? t('stat.out_of_service', { count: brokenEquipment })
                : t('stat.all_working')
            }
          />
          <MetricCard
            tone="indigo"
            label={t('stat.today_attendance')}
            value={att.present ?? 0}
            icon="event_available"
            sub={
              att.total > 0
                ? `${t('stat.absent_lbl')} ${att.absent ?? 0} · ${t('stat.late_lbl')} ${att.late ?? 0} · ${t('stat.leave_lbl')} ${att.leave ?? 0}`
                : t('stat.no_attendance')
            }
          />
          <LastAutoBackupCard />
        </div>
      )}

      <SectionCard title="حالة الشركة اليوم" icon="health_and_safety">
        <HealthGaugeSection health={commandData.decisionCenter?.healthScore ?? null} loading={commandData.loading} />
      </SectionCard>

      <SectionCard
        title={t('section.latest_expenses')}
        icon="payments"
        padded={false}
        actions={!initialLoading && expenses.length > 0
          ? <Button variant="secondary" onClick={() => navigate('/expenses')}>{t('page.dashboard.view_all')}</Button>
          : undefined}
      >
        <LatestExpensesTable expenses={expenses} loading={initialLoading} />
      </SectionCard>

      {/* ═══════════════ §8 — RECENT ACTIVITY ═══════════════ */}
      <SectionCard title="آخر النشاطات" icon="history">
        <RecentActivityFeed rows={commandData.activity} loading={commandData.loading} />
      </SectionCard>

      {/* ═══════════════ §9 — ADVANCED ANALYTICS (progressive disclosure — before contracts) ═══════════════
          Deep / secondary panels are preserved verbatim but collapsed by default so the
          executive spine stays calm. Nothing removed — the duplicate YTD performance chart,
          quick actions, the financial-source note, and the two deep intelligence panels
          simply live behind the expander. */}
      <details className="db-advanced">
        <summary className="db-advanced-summary">
          <span className="material-symbols-outlined" aria-hidden="true">insights</span>
          تحليلات متقدمة
          <span className="material-symbols-outlined db-advanced-chevron" aria-hidden="true">expand_more</span>
        </summary>
        <div className="db-advanced-body">
          {!initialLoading && exec && (
            <div className="db-src-note">
              <div className="db-src-note-title">ℹ مصدر البيانات المالية</div>
              <div className="db-src-note-items">
                <span>
                  <span className="db-src-note-rev">الإيرادات</span>
                  {' '}— دفعات الفواتير المحصّلة من سجل المعاملات
                </span>
                <span>
                  <span className="db-src-note-exp">المصروفات</span>
                  {' '}— المصروفات المعتمدة من سجل المعاملات
                </span>
                <span>
                  <span className="db-src-note-profit">الربح الصافي</span>
                  {' '}= الإيرادات − المصروفات (قد يكون سالباً)
                </span>
                <span>
                  <span className="db-src-note-pending">الفواتير المعلّقة</span>
                  {' '}— بحالة غير مدفوعة أو جزئية أو متأخرة
                </span>
              </div>
            </div>
          )}

          <SectionCard title="الأداء المالي (منذ بداية العام)" icon="show_chart">
            <PerformanceChartSection trend={trend} loading={commandData.loading} />
          </SectionCard>

          <SectionCard title="إجراءات سريعة" icon="bolt">
            <QuickActionsSection />
          </SectionCard>

          <FinancialIntelPanel data={finV2} loading={initialLoading} />

          <ExecutiveIntelligenceV2Panel data={intelV2} loading={intelV2Loading} />
        </div>
      </details>

      {/* ═══════════════ §10 — CONTRACTS (low priority — relocated to the bottom) ═══════════════
          The company rarely uses Contracts, so every contracts surface is de-prioritised to
          the tail of the dashboard. Nothing removed — only visual priority reduced. */}
      <div className="db-section-label">العقود</div>

      {/* Active-contracts KPI preserved here (relocated from the operational stats row so
          contracts stay low-priority without dropping the insight). */}
      {!initialLoading && (
        <div className="xpl-kpi-grid">
          <MetricCard
            tone="indigo"
            label={t('stat.active_contracts')}
            value={`${c.active ?? 0} / ${c.total ?? 0}`}
            icon="description"
            sub={t('stat.of_total_contracts')}
          />
        </div>
      )}

      <div className="db-charts-row">
        <SectionCard
          title={t('section.latest_contracts')}
          icon="description"
          padded={false}
          actions={!initialLoading && contracts.length > 0
            ? <StatusChip tone="blue">{contracts.length} {t('page.dashboard.contract_unit')}</StatusChip>
            : undefined}
        >
          <div className="db-card-body scrollable">
            <ContractProgressList contracts={contracts} loading={initialLoading} />
          </div>
        </SectionCard>

        <SectionCard title={t('section.contract_status')} icon="pie_chart">
          <ContractStatusChart data={cStatus} loading={initialLoading} />
        </SectionCard>
      </div>

      <SectionCard
        title={t('section.added_contracts')}
        icon="table_rows"
        padded={false}
        actions={<Button variant="secondary" onClick={() => navigate('/contracts')}>{t('page.dashboard.view_all')}</Button>}
      >
        <table className="db-table">
          <thead>
            <tr>
              <th>{t('col.db.contract_no')}</th>
              <th>{t('col.db.asphalt_plant')}</th>
              <th>{t('col.db.customer')}</th>
              <th>{t('col.db.monthly_value')}</th>
              <th>{t('col.db.status')}</th>
            </tr>
          </thead>
          <tbody>
            {initialLoading ? (
              <TableRowSkeletons rows={4} cols={5} />
            ) : contracts.length === 0 ? (
              <tr>
                <td colSpan={5}>
                  <div className="db-empty">
                    <div className="db-empty-icon">📄</div>
                    <div className="db-empty-text">{t('empty.no_contracts')}</div>
                  </div>
                </td>
              </tr>
            ) : (
              contracts.map((ct: ApiAny, i: number) => {
                const statusCls = CONTRACT_STATUS_CLS[ct.status] ?? 'gray';
                const statusLabel = t('contract.status.' + ct.status.toLowerCase());
                return (
                  <tr key={i}>
                    <td>
                      <span className="db-table-mono">{ct.code}</span>
                    </td>
                    <td className="db-table-strong">{ct.asphaltPlant}</td>
                    <td>{ct.customer?.name ?? '—'}</td>
                    <td>{ct.monthlyTransportValue ? <PrivateAmount value={ct.monthlyTransportValue} /> : '—'}</td>
                    <td>
                      <span className={`db-pill ${statusCls}`}>{statusLabel}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </SectionCard>

      {/* ═══════════════ §11 — TODAY'S ATTENDANCE (low-priority operational — dashboard tail) ═══════════════ */}
      <SectionCard title={t('section.today_attendance')} icon="event_available">
        {initialLoading ? (
          <div className="db-att-grid">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={88} style={{ borderRadius: 12 }} />
            ))}
          </div>
        ) : (att.total ?? 0) === 0 ? (
          <div className="db-empty">
            <div className="db-empty-icon">{isWeekend ? '🏖️' : '📅'}</div>
            <div className="db-empty-text">{isWeekend ? t('att.weekend') : t('empty.no_attendance')}</div>
          </div>
        ) : (
          <div className="db-att-grid">
            {[
              { key: 'present', label: t('att.present'), val: att.present, icon: '✅' },
              { key: 'absent', label: t('att.absent'), val: att.absent, icon: '❌' },
              { key: 'late', label: t('att.late'), val: att.late, icon: '⏰' },
              { key: 'leave', label: t('att.leave'), val: att.leave, icon: '🏖️' },
            ].map((item) => (
              <div key={item.key} className={`db-att-item ${item.key}`}>
                <span className="db-att-icon">{item.icon}</span>
                <div className="db-att-body">
                  <div className="db-att-val">{item.val ?? 0}</div>
                  <div className="db-att-label">{item.label}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

export default function Dashboard() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  const [dashTab, setDashTab] = useState<'general' | 'financial'>(
    (localStorage.getItem('dashboard.tab') as 'general' | 'financial') ?? 'general'
  );

  return (
    <div>
      <div className="db-tab-bar">
        <button
          type="button"
          className={`db-tab-btn${dashTab === 'general' ? ' active' : ''}`}
          onClick={() => { setDashTab('general'); localStorage.setItem('dashboard.tab', 'general'); }}
        >
          {t('dash.tab.general')}
        </button>
        {hasPermission('financialdashboard.read') && (
          <button
            type="button"
            className={`db-tab-btn${dashTab === 'financial' ? ' active' : ''}`}
            onClick={() => { setDashTab('financial'); localStorage.setItem('dashboard.tab', 'financial'); }}
          >
            {t('dash.tab.financial')}
          </button>
        )}
      </div>

      {dashTab === 'general' && <GeneralDashboardContent />}
      {dashTab === 'financial' && hasPermission('financialdashboard.read') && <FinancialDashboardTab />}
    </div>
  );
}
