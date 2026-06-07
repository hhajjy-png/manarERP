import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { useAuth } from '../stores/authStore';

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
import { KPISkeletons, StatsSkeletons, Skeleton, TableRowSkeletons } from '../components/dashboard/Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiAny = any;

const INVOICE_STATUS_AR: Record<string, string> = {
  UNPAID: 'غير مدفوعة', PARTIAL: 'مدفوعة جزئيًا', PAID: 'مسدّدة',
  OVERDUE: 'متأخرة', CANCELLED: 'ملغاة',
};
const INVOICE_STATUS_COLOR: Record<string, string> = {
  UNPAID: '#EF4444', PARTIAL: '#F59E0B', PAID: '#10B981',
  OVERDUE: '#DC2626', CANCELLED: '#6B7280',
};

const CONTRACT_STATUS_AR: Record<string, [string, string]> = {
  ACTIVE:    ['ساري',         'green'],
  EXPIRED:   ['منتهٍ',        'gray'],
  RENEWING:  ['قيد التجديد',  'amber'],
  SUSPENDED: ['موقوف',        'red'],
};

export default function Dashboard() {
  const { user } = useAuth();
  const navigate  = useNavigate();

  const [loading,    setLoading]   = useState(true);
  const [error,      setError]     = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshAt,  setRefreshAt]  = useState<Date | null>(null);

  // ── State slices populated from /dashboard/executive ─────────────────────
  const [exec,      setExec]      = useState<ApiAny>(null);   // kpis object
  const [att,       setAtt]       = useState<ApiAny>({});     // attendance today
  const [trend,     setTrend]     = useState<ApiAny[]>([]);
  const [cStatus,   setCStatus]   = useState<ApiAny[]>([]);
  const [iStatus,   setIStatus]   = useState<ApiAny[]>([]);
  const [invoices,  setInvoices]  = useState<ApiAny[]>([]);
  const [expenses,  setExpenses]  = useState<ApiAny[]>([]);
  const [contracts, setContracts] = useState<ApiAny[]>([]);
  const [alerts,    setAlerts]    = useState<DashAlert[]>([]);

  const today = new Date().toLocaleDateString('ar-KW', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    let cancelled = false;

    try {
      const [execRes, equipRes, empsRes] = await Promise.all([
        api.get('/dashboard/executive'),
        api.get('/equipment/expiring',           { params: { days: 30 } }),
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
        title:  `معدة: ${e.code}`,
        desc:   `دفتر المركبة: ${e.registration?.remainingText ?? '—'}`,
        status: (e.registration?.expired ? 'red' : 'amber') as DashAlert['status'],
        icon:   '🚜',
      }));
      const empAlerts: DashAlert[] = [];
      (empsRes.data?.data || []).forEach((e: ApiAny) => {
        (e.alerts ?? []).forEach((a: ApiAny) => {
          empAlerts.push({
            title:  e.fullName,
            desc:   `${a.document}: ${a.remainingDays < 0 ? 'منتهٍ' : `ينتهي خلال ${a.remainingDays} يوم`}`,
            status: (a.remainingDays < 0 ? 'red' : 'amber') as DashAlert['status'],
            icon:   '👷',
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

    return () => { cancelled = true; };
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // ── Derived values ────────────────────────────────────────────────────────
  const f   = exec?.finance   ?? {};
  const c   = exec?.contracts ?? {};
  const eq  = exec?.equipment ?? {};
  const emp = exec?.employees ?? {};
  const inv = exec?.invoices  ?? {};

  const workingEquipment  = eq.active ?? 0;
  const brokenEquipment   = (eq.total ?? 0) - workingEquipment;
  const profitPositive    = (f.netProfit ?? 0) >= 0;

  const expiredContracts  = (cStatus as ApiAny[]).find((s: ApiAny) => s.status === 'EXPIRED')?.count ?? 0;
  const duePayments       = inv.unpaid ?? 0;
  const expiringContracts = contracts.filter((ct: ApiAny) => {
    if (!ct.endDate) return false;
    const daysLeft = (new Date(ct.endDate).getTime() - Date.now()) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  const invStatusTotal = (iStatus as ApiAny[]).reduce((s: number, x: ApiAny) => s + x.count, 0) || 1;

  return (
    <div className="db-page">

      {/* ══════════════════════════════════════════════════
          EXECUTIVE HEADER
      ══════════════════════════════════════════════════ */}
      <div className="db-exec-header">
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h2 className="db-exec-greeting">مرحباً، {user?.fullName ?? 'مدير النظام'} 👋</h2>
            <p className="db-exec-date">📅 {today}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {refreshAt && !loading && (
              <span style={{ fontSize: 11, color: 'var(--db-muted)' }}>
                آخر تحديث: {refreshAt.toLocaleTimeString('ar')}
              </span>
            )}
            <button
              className="btn secondary"
              onClick={() => setRefreshKey((k) => k + 1)}
              disabled={loading}
              style={{ padding: '7px 14px', fontSize: 13 }}
            >
              {loading ? '⏳' : '↻ تحديث'}
            </button>
          </div>
        </div>
        {!loading && (
          <div className="db-exec-chips">
            <span className="db-exec-chip blue">
              <span className="db-exec-chip-dot" />
              العقود السارية: {c.active ?? 0}
            </span>
            <span className="db-exec-chip amber">
              <span className="db-exec-chip-dot" />
              المعدات العاملة: {workingEquipment}
            </span>
            <span className="db-exec-chip red">
              <span className="db-exec-chip-dot" />
              الفواتير المستحقة: {inv.unpaid ?? 0}
            </span>
          </div>
        )}
      </div>

      {/* ── Error State ────────────────────────────────────────────────────── */}
      {error && (
        <div className="alert error" style={{ marginBottom: 20 }}>
          ⚠️ {error}
          <button className="btn secondary" style={{ marginRight: 12 }} onClick={() => setRefreshKey((k) => k + 1)}>
            إعادة المحاولة
          </button>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          QUICK ACTIONS
      ══════════════════════════════════════════════════ */}
      <div className="db-actions">
        <button className="db-action-btn primary" onClick={() => navigate('/invoices')}>＋ فاتورة جديدة</button>
        <button className="db-action-btn green"   onClick={() => navigate('/contracts')}>＋ عقد جديد</button>
        <button className="db-action-btn purple"  onClick={() => navigate('/customers')}>＋ عميل جديد</button>
        <button className="db-action-btn amber"   onClick={() => navigate('/expenses')}>＋ مصروف جديد</button>
      </div>

      {/* ══════════════════════════════════════════════════
          ROW 1 — FINANCIAL KPIs
      ══════════════════════════════════════════════════ */}
      {loading ? <KPISkeletons /> : (
        <div className="db-kpi-grid">
          <KPICard label="إجمالي الإيرادات"    value={money(f.totalRevenue)}  icon="💰" color="green" />
          <KPICard label="إجمالي المصروفات"    value={money(f.totalExpense)}   icon="📉" color="red" />
          <KPICard label="صافي الربح"           value={money(f.netProfit)}      icon="📈" color={profitPositive ? 'blue' : 'red'} />
          <KPICard
            label="الفواتير غير المحصلة"
            value={money(inv.unpaidAmount)}
            icon="🧾"
            color="amber"
            sub={inv.unpaid ? `${inv.unpaid} فاتورة معلّقة` : undefined}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          EXECUTIVE ALERT WIDGETS
      ══════════════════════════════════════════════════ */}
      {loading ? (
        <div className="db-alert-widgets">
          {[0,1,2,3].map((i) => (
            <div key={i} className="db-aw aw-safe" style={{ borderInlineStartColor: 'rgba(255,255,255,0.08)' }}>
              <Skeleton height={42} width="42px" style={{ borderRadius: 11, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
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
              <div className="db-aw-label">العقود المتأخرة</div>
            </div>
            <span className="db-aw-tag">عقد</span>
          </div>
          <div className={`db-aw ${brokenEquipment > 0 ? 'aw-warning' : 'aw-safe'}`}>
            <div className="db-aw-icon">🚜</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{brokenEquipment}</div>
              <div className="db-aw-label">المعدات المعطلة</div>
            </div>
            <span className="db-aw-tag">معدة</span>
          </div>
          <div className={`db-aw ${duePayments > 0 ? 'aw-critical' : 'aw-safe'}`}>
            <div className="db-aw-icon">💳</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{duePayments}</div>
              <div className="db-aw-label">الدفعات المستحقة</div>
              {(inv.unpaidAmount ?? 0) > 0 && <div className="db-aw-sub">{money(inv.unpaidAmount)}</div>}
            </div>
            <span className="db-aw-tag">فاتورة</span>
          </div>
          <div className={`db-aw ${expiringContracts > 0 ? 'aw-warning' : 'aw-safe'}`}>
            <div className="db-aw-icon">⏰</div>
            <div className="db-aw-body">
              <div className="db-aw-val">{expiringContracts}</div>
              <div className="db-aw-label">العقود المنتهية قريباً</div>
              <div className="db-aw-sub">خلال 30 يوم</div>
            </div>
            <span className="db-aw-tag">عقد</span>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          ROW 2 — OPERATIONAL STATS (6 cards)
      ══════════════════════════════════════════════════ */}
      {loading ? <StatsSkeletons /> : (
        <div className="db-stats-grid">
          <OpsCard label="العملاء المسجلون"  value={exec?.customers?.total ?? 0} icon="👥" iconBg="rgba(99,102,241,0.14)" />
          <OpsCard
            label="العقود السارية"
            value={`${c.active ?? 0} / ${c.total ?? 0}`}
            icon="📄"
            iconBg="rgba(37,99,235,0.14)"
            sub="من إجمالي العقود"
          />
          <OpsCard
            label="إجمالي الفواتير"
            value={inv.total ?? 0}
            icon="🧾"
            iconBg="rgba(245,158,11,0.14)"
            sub={inv.unpaid ? `${inv.unpaid} غير مدفوعة` : 'جميعها مسدّدة'}
          />
          <OpsCard
            label="الموظفون النشطون"
            value={`${emp.active ?? 0} / ${emp.total ?? 0}`}
            icon="👷"
            iconBg="rgba(16,185,129,0.14)"
            sub="من إجمالي الموظفين"
          />
          <OpsCard
            label="المعدات العاملة"
            value={`${workingEquipment} / ${eq.total ?? 0}`}
            icon="🚜"
            iconBg="rgba(234,88,12,0.14)"
            sub={brokenEquipment > 0 ? `${brokenEquipment} خارج الخدمة` : 'جميعها تعمل'}
          />
          <OpsCard
            label="حضور اليوم"
            value={att.present ?? 0}
            icon="📅"
            iconBg="rgba(16,185,129,0.12)"
            sub={att.total > 0
              ? `غائب: ${att.absent ?? 0} · متأخر: ${att.late ?? 0} · إجازة: ${att.leave ?? 0}`
              : 'لا توجد سجلات اليوم'}
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
              <h3>آخر العقود</h3>
              <p>أحدث 5 عقود في النظام</p>
            </div>
            {!loading && contracts.length > 0 && (
              <span className="db-pill blue">{contracts.length} عقد</span>
            )}
          </div>
          <div className="db-card-body scrollable">
            <ContractProgressList contracts={contracts} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>التنبيهات العاجلة</h3>
              <p>انتهاء الصلاحيات خلال 30 يوم</p>
            </div>
            {!loading && alerts.length > 0 && (
              <span className="db-pill red">{alerts.length}</span>
            )}
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
              <h3>التدفق المالي</h3>
              <p>الإيرادات والمصروفات — آخر 6 أشهر (د.ك)</p>
            </div>
          </div>
          <div className="db-card-body">
            <RevenueChart data={trend} loading={loading} />
          </div>
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>حالة العقود</h3>
              <p>توزيع العقود حسب الحالة</p>
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
              <h3>حالة الفواتير</h3>
              <p>توزيع {inv.total ?? 0} فاتورة حسب الحالة</p>
            </div>
          </div>
          <div className="db-card-body">
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {[0,1,2,3,4].map((i) => <Skeleton key={i} height={36} style={{ borderRadius: 8 }} />)}
              </div>
            ) : iStatus.length === 0 ? (
              <div className="db-empty">
                <div className="db-empty-icon">🧾</div>
                <div className="db-empty-text">لا توجد فواتير</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(iStatus as ApiAny[])
                  .sort((a: ApiAny, b: ApiAny) => b.count - a.count)
                  .map((s: ApiAny) => {
                    const pct   = Math.round((s.count / invStatusTotal) * 100);
                    const color = INVOICE_STATUS_COLOR[s.status] ?? '#6B7280';
                    return (
                      <div key={s.status}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
                          <span style={{ color: 'var(--db-text)', fontWeight: 600 }}>
                            {INVOICE_STATUS_AR[s.status] ?? s.status}
                          </span>
                          <span style={{ color: 'var(--db-muted)' }}>{s.count} ({pct}%)</span>
                        </div>
                        <div style={{ height: 8, background: 'rgba(255,255,255,0.07)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4, transition: 'width 0.6s ease' }} />
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
              <h3>حضور اليوم</h3>
              <p>سجلات الحضور والغياب لهذا اليوم</p>
            </div>
          </div>
          <div className="db-card-body">
            {loading ? (
              <div style={{ display: 'flex', gap: 12 }}>
                {[0,1,2,3].map((i) => <Skeleton key={i} height={88} style={{ flex: 1, borderRadius: 12 }} />)}
              </div>
            ) : (att.total ?? 0) === 0 ? (
              <div className="db-empty">
                <div className="db-empty-icon">📅</div>
                <div className="db-empty-text">لا توجد سجلات حضور اليوم</div>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {[
                  { label: 'حاضر',  val: att.present, color: '#10B981', icon: '✅' },
                  { label: 'غائب',  val: att.absent,  color: '#EF4444', icon: '❌' },
                  { label: 'متأخر', val: att.late,    color: '#F59E0B', icon: '⏰' },
                  { label: 'إجازة', val: att.leave,   color: '#6B7280', icon: '🏖️' },
                ].map((item) => (
                  <div
                    key={item.label}
                    style={{
                      background: 'var(--db-inner)',
                      borderRadius: 12,
                      padding: '14px 16px',
                      border: `1px solid ${item.color}22`,
                      display: 'flex', alignItems: 'center', gap: 10,
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{item.icon}</span>
                    <div>
                      <div style={{ fontSize: 22, fontWeight: 800, color: item.color, lineHeight: 1 }}>{item.val ?? 0}</div>
                      <div style={{ fontSize: 12, color: 'var(--db-muted)', marginTop: 2 }}>{item.label}</div>
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
              <h3>آخر الفواتير</h3>
              <p>أحدث فواتير المطالبات والمشتريات</p>
            </div>
          </div>
          <LatestInvoicesTable invoices={invoices} loading={loading} />
        </div>
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>آخر المصروفات</h3>
              <p>أحدث مصروفات التشغيل</p>
            </div>
          </div>
          <LatestExpensesTable expenses={expenses} loading={loading} />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════
          LATEST CONTRACTS TABLE
      ══════════════════════════════════════════════════ */}
      <div className="db-card" style={{ marginTop: 20 }}>
        <div className="db-card-head">
          <div>
            <h3>آخر العقود المضافة</h3>
            <p>أحدث 5 عقود في النظام</p>
          </div>
          <button
            className="btn secondary"
            style={{ padding: '6px 14px', fontSize: 13 }}
            onClick={() => navigate('/contracts')}
          >
            عرض الكل
          </button>
        </div>
        <table className="db-table">
          <thead>
            <tr>
              <th>رقم العقد</th>
              <th>مصنع الأسفلت</th>
              <th>العميل</th>
              <th>قيمة النقل الشهري</th>
              <th>الحالة</th>
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
                    <div className="db-empty-text">لا توجد عقود</div>
                  </div>
                </td>
              </tr>
            ) : contracts.map((ct: ApiAny, i: number) => {
              const [statusLabel, statusCls] = CONTRACT_STATUS_AR[ct.status] ?? [ct.status, 'gray'];
              return (
                <tr key={i}>
                  <td><span className="db-table-mono">{ct.code}</span></td>
                  <td style={{ fontWeight: 700 }}>{ct.asphaltPlant}</td>
                  <td>{ct.customer?.name ?? '—'}</td>
                  <td>{ct.monthlyTransportValue ? money(ct.monthlyTransportValue) : '—'}</td>
                  <td><span className={`db-pill ${statusCls}`}>{statusLabel}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

    </div>
  );
}
