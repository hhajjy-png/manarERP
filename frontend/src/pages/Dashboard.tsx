import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';

import '../components/dashboard/dashboard.css';

import KPICard from '../components/dashboard/KPICard';
import OpsCard from '../components/dashboard/OpsCard';
import AlertPanel from '../components/dashboard/AlertPanel';
import type { DashAlert } from '../components/dashboard/AlertPanel';
import ContractProgressList from '../components/dashboard/ContractProgressCard';
import RevenueChart from '../components/dashboard/RevenueChart';
import ContractStatusChart from '../components/dashboard/ContractStatusChart';
import LatestInvoicesTable from '../components/dashboard/LatestInvoicesTable';
import LatestExpensesTable from '../components/dashboard/LatestExpensesTable';
import {
  KPISkeletons,
  StatsSkeletons,
  Skeleton,
  TableRowSkeletons,
} from '../components/dashboard/Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiAny = any;

const INVOICE_STATUS_COLOR: Record<string, string> = {
  UNPAID: '#EF4444',
  PARTIAL: '#F59E0B',
  PAID: '#10B981',
  OVERDUE: '#DC2626',
  CANCELLED: '#6B7280',
};

const CONTRACT_STATUS_CLS: Record<string, string> = {
  ACTIVE: 'green',
  EXPIRED: 'gray',
  RENEWING: 'amber',
  SUSPENDED: 'red',
};

export default function Dashboard() {
  const { user, hasPermission } = useAuth();
  const navigate = useNavigate();
  const { t } = useT();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshAt, setRefreshAt] = useState<Date | null>(null);

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

  const today = new Date().toLocaleDateString('ar-KW', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let cancelled = false;

    try {
      const [execRes, equipRes, empsRes] = await Promise.all([
        api.get('/dashboard/executive'),
        api.get('/equipment/expiring', { params: { days: 30 } }),
        api.get('/employees/expiring-documents', { params: { days: 30 } }),
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
      setRefreshAt(new Date());
    } catch (e) {
      if (!cancelled) setError(errorMessage(e));
    } finally {
      if (!cancelled) setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    load();
  }, [load]);

  // ── Derived values ────────────────────────────────────────────────────────
  const f = exec?.finance ?? {};
  const c = exec?.contracts ?? {};
  const eq = exec?.equipment ?? {};
  const emp = exec?.employees ?? {};
  const inv = exec?.invoices ?? {};

  const workingEquipment = eq.active ?? 0;
  const brokenEquipment = (eq.total ?? 0) - workingEquipment;
  const profitPositive = (f.netProfit ?? 0) >= 0;

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

  return (
    <div className="db-page">
      {/* ══════════════════════════════════════════════════
          EXECUTIVE HERO PANEL
      ══════════════════════════════════════════════════ */}
      <div className="db-exec-header">
        {/* Topbar: system tagline + refresh control */}
        <div className="db-exec-topbar">
          <span className="db-exec-system-label">{t('layout.tagline')}</span>
          <div className="db-exec-topbar-end">
            {refreshAt && !loading && (
              <span className="db-refresh-time">
                {t('page.dashboard.last_update')} {refreshAt.toLocaleTimeString('ar')}
              </span>
            )}
            <button
              type="button"
              className="btn secondary db-refresh-btn"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
            >
              {loading ? '⏳' : t('page.dashboard.refresh')}
            </button>
          </div>
        </div>

        <div className="db-exec-hero-layout">
          {/* INFO: greeting, date, snapshot metrics, status chips */}
          <div className="db-exec-hero-info">
            <h2 className="db-exec-greeting">
              {t('page.dashboard.greeting', { name: user?.fullName ?? '—' })}
            </h2>
            <p className="db-exec-date">📅 {today}</p>

            {/* Executive snapshot metrics strip */}
            {loading ? (
              <div className="db-exec-hero-metrics">
                <Skeleton height={42} width="120px" style={{ borderRadius: 8 }} />
                <Skeleton height={42} width="120px" style={{ borderRadius: 8 }} />
                <Skeleton height={42} width="120px" style={{ borderRadius: 8 }} />
              </div>
            ) : exec ? (
              <div className="db-exec-hero-metrics">
                <div className="db-exec-hm-item">
                  <span className="db-exec-hm-label">{t('kpi.total_revenue')}</span>
                  <span className="db-exec-hm-val db-exec-hm-green">{money(f.totalRevenue)}</span>
                </div>
                <div className="db-exec-hm-sep" />
                <div className="db-exec-hm-item">
                  <span className="db-exec-hm-label">{t('kpi.net_profit')}</span>
                  <span className={`db-exec-hm-val ${profitPositive ? 'db-exec-hm-green' : 'db-exec-hm-red'}`}>
                    {money(f.netProfit)}
                  </span>
                </div>
                <div className="db-exec-hm-sep" />
                <div className="db-exec-hm-item">
                  <span className="db-exec-hm-label">{t('kpi.unpaid_invoices')}</span>
                  <span className={`db-exec-hm-val ${(inv.unpaidAmount ?? 0) > 0 ? 'db-exec-hm-amber' : 'db-exec-hm-green'}`}>
                    {money(inv.unpaidAmount)}
                  </span>
                </div>
              </div>
            ) : null}

            {!loading && (
              <div className="db-exec-chips">
                <span className="db-exec-chip blue">
                  <span className="db-exec-chip-dot" />
                  {t('page.dashboard.chip_contracts')} {c.active ?? 0}
                </span>
                <span className="db-exec-chip amber">
                  <span className="db-exec-chip-dot" />
                  {t('page.dashboard.chip_equipment')} {workingEquipment}
                </span>
                <span className="db-exec-chip red">
                  <span className="db-exec-chip-dot" />
                  {t('page.dashboard.chip_invoices')} {inv.unpaid ?? 0}
                </span>
              </div>
            )}
          </div>

          {/* ACTIONS: section label + quick action buttons */}
          <div className="db-exec-hero-actions">
            <div className="db-exec-section-label">{t('section.quick_actions')}</div>
            <div className="db-actions">
              {hasPermission('invoices.create') && (
                <button type="button" className="db-action-btn primary" onClick={() => navigate('/invoices')}>
                  {t('page.dashboard.new_invoice')}
                </button>
              )}
              {hasPermission('contracts.create') && (
                <button type="button" className="db-action-btn green" onClick={() => navigate('/contracts')}>
                  {t('page.dashboard.new_contract')}
                </button>
              )}
              {hasPermission('customers.create') && (
                <button type="button" className="db-action-btn purple" onClick={() => navigate('/customers')}>
                  {t('page.dashboard.new_customer')}
                </button>
              )}
              {hasPermission('expenses.create') && (
                <button type="button" className="db-action-btn amber" onClick={() => navigate('/expenses')}>
                  {t('page.dashboard.new_expense')}
                </button>
              )}
            </div>
          </div>
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

      {/* ══════════════════════════════════════════════════
          ROW 1 — FINANCIAL KPIs
      ══════════════════════════════════════════════════ */}
      <div className="db-section-label">{t('section.financial_kpis')}</div>
      {loading ? (
        <KPISkeletons />
      ) : (
        <div className="db-kpi-grid">
          <KPICard
            label={t('kpi.total_revenue')}
            value={money(f.totalRevenue)}
            icon="💰"
            color="green"
            sub={t('kpi.all_time')}
          />
          <KPICard
            label={t('kpi.total_expenses')}
            value={money(f.totalExpense)}
            icon="📉"
            color="red"
            sub={t('kpi.all_time')}
          />
          <KPICard
            label={t('kpi.net_profit')}
            value={money(f.netProfit)}
            icon="📈"
            color={profitPositive ? 'blue' : 'red'}
            sub={t('kpi.all_time')}
          />
          <KPICard
            label={t('kpi.unpaid_invoices')}
            value={money(inv.unpaidAmount)}
            icon="🧾"
            color="amber"
            sub={inv.unpaid ? t('kpi.pending_sub', { count: inv.unpaid }) : undefined}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          EXECUTIVE ALERT WIDGETS
      ══════════════════════════════════════════════════ */}
      <div className="db-section-label">{t('section.operation_alerts')}</div>
      {loading ? (
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
                <div className="db-aw-sub">{money(inv.unpaidAmount)}</div>
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

      {/* ══════════════════════════════════════════════════
          ROW 2 — OPERATIONAL STATS (6 cards)
      ══════════════════════════════════════════════════ */}
      <div className="db-section-label">{t('section.data_summary')}</div>
      {loading ? (
        <StatsSkeletons />
      ) : (
        <div className="db-stats-grid">
          <OpsCard
            label={t('stat.registered_customers')}
            value={exec?.customers?.total ?? 0}
            icon="👥"
            iconBg="rgba(99,102,241,0.14)"
          />
          <OpsCard
            label={t('stat.active_contracts')}
            value={`${c.active ?? 0} / ${c.total ?? 0}`}
            icon="📄"
            iconBg="rgba(37,99,235,0.14)"
            sub={t('stat.of_total_contracts')}
          />
          <OpsCard
            label={t('stat.total_invoices')}
            value={inv.total ?? 0}
            icon="🧾"
            iconBg="rgba(245,158,11,0.14)"
            sub={inv.unpaid ? t('stat.unpaid', { count: inv.unpaid }) : t('stat.all_paid')}
          />
          <OpsCard
            label={t('stat.active_employees')}
            value={`${emp.active ?? 0} / ${emp.total ?? 0}`}
            icon="👷"
            iconBg="rgba(16,185,129,0.14)"
            sub={t('stat.of_total_employees')}
          />
          <OpsCard
            label={t('stat.working_equipment')}
            value={`${workingEquipment} / ${eq.total ?? 0}`}
            icon="🚜"
            iconBg="rgba(234,88,12,0.14)"
            sub={
              brokenEquipment > 0
                ? t('stat.out_of_service', { count: brokenEquipment })
                : t('stat.all_working')
            }
          />
          <OpsCard
            label={t('stat.today_attendance')}
            value={att.present ?? 0}
            icon="📅"
            iconBg="rgba(16,185,129,0.12)"
            sub={
              att.total > 0
                ? `${t('stat.absent_lbl')} ${att.absent ?? 0} · ${t('stat.late_lbl')} ${att.late ?? 0} · ${t('stat.leave_lbl')} ${att.leave ?? 0}`
                : t('stat.no_attendance')
            }
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MAIN ROW — Active Contracts  |  Urgent Alerts
      ══════════════════════════════════════════════════ */}
      <div className="db-main-row">
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.latest_contracts')}</h3>
              <p>{t('section.latest_5')}</p>
            </div>
            {!loading && contracts.length > 0 && (
              <span className="db-pill blue">
                {contracts.length} {t('page.dashboard.contract_unit')}
              </span>
            )}
          </div>
          <div className="db-card-body scrollable">
            <ContractProgressList contracts={contracts} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.urgent_alerts')}</h3>
              <p>{t('section.expiry_30')}</p>
            </div>
            {!loading && alerts.length > 0 && <span className="db-pill red">{alerts.length}</span>}
          </div>
          <div className="db-card-body scrollable">
            <AlertPanel alerts={alerts} loading={loading} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          CHARTS ROW — Revenue Bar  |  Contract Pie
      ══════════════════════════════════════════════════ */}
      <div className="db-charts-row">
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.revenue_flow')}</h3>
              <p>{t('section.revenue_6m')}</p>
            </div>
          </div>
          <div className="db-card-body">
            <RevenueChart data={trend} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.contract_status')}</h3>
              <p>{t('section.contract_dist')}</p>
            </div>
          </div>
          <div className="db-card-body">
            <ContractStatusChart data={cStatus} loading={loading} />
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          SECOND ROW — Invoice Status  |  Attendance Today
      ══════════════════════════════════════════════════ */}
      <div className="db-charts-row">
        {/* Invoice Status progress bars */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.invoice_status')}</h3>
              <p>{t('section.invoice_status_sub', { count: inv.total ?? 0 })}</p>
            </div>
          </div>
          <div className="db-card-body">
            {loading ? (
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
                    const color = INVOICE_STATUS_COLOR[s.status] ?? '#6B7280';
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
                            className="db-inv-fill"
                            style={{ width: `${pct}%`, background: color }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>

        {/* Attendance Today */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.today_attendance')}</h3>
              <p>{t('section.attendance_records')}</p>
            </div>
          </div>
          <div className="db-card-body">
            {loading ? (
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
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          BOTTOM — Latest Invoices  |  Latest Expenses
      ══════════════════════════════════════════════════ */}
      <div className="db-tables-row">
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.latest_invoices')}</h3>
              <p>{t('section.latest_inv_sub')}</p>
            </div>
            {!loading && invoices.length > 0 && (
              <button type="button" className="btn secondary db-card-btn" onClick={() => navigate('/invoices')}>
                {t('page.dashboard.view_all')}
              </button>
            )}
          </div>
          <LatestInvoicesTable invoices={invoices} loading={loading} />
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>{t('section.latest_expenses')}</h3>
              <p>{t('section.latest_exp_sub')}</p>
            </div>
            {!loading && expenses.length > 0 && (
              <button type="button" className="btn secondary db-card-btn" onClick={() => navigate('/expenses')}>
                {t('page.dashboard.view_all')}
              </button>
            )}
          </div>
          <LatestExpensesTable expenses={expenses} loading={loading} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          LATEST CONTRACTS TABLE
      ══════════════════════════════════════════════════ */}
      <div className="db-card db-card-top">
        <div className="db-card-head">
          <div>
            <h3>{t('section.added_contracts')}</h3>
            <p>{t('section.latest_5')}</p>
          </div>
          <button
            type="button"
            className="btn secondary db-card-btn"
            onClick={() => navigate('/contracts')}
          >
            {t('page.dashboard.view_all')}
          </button>
        </div>
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
            {loading ? (
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
                    <td>{ct.monthlyTransportValue ? money(ct.monthlyTransportValue) : '—'}</td>
                    <td>
                      <span className={`db-pill ${statusCls}`}>{statusLabel}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
