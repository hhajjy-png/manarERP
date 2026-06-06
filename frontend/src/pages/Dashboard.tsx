import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
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
import { KPISkeletons, StatsSkeletons, Skeleton } from '../components/dashboard/Skeleton';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ApiAny = any;

/** Safely extract data array from various API response shapes */
function extractArray(res: ApiAny): ApiAny[] {
  const d = res?.data?.data;
  if (Array.isArray(d)) return d;
  if (Array.isArray(d?.data)) return d.data;
  return [];
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [loading, setLoading]   = useState(true);
  const [ov,      setOv]        = useState<ApiAny>(null);
  const [trend,   setTrend]     = useState<ApiAny[]>([]);
  const [status,  setStatus]    = useState<ApiAny[]>([]);
  const [alerts,  setAlerts]    = useState<DashAlert[]>([]);
  const [contracts, setContracts] = useState<ApiAny[]>([]);
  const [invoices,  setInvoices]  = useState<ApiAny[]>([]);
  const [expenses,  setExpenses]  = useState<ApiAny[]>([]);

  const today = new Date().toLocaleDateString('ar-KW', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [ovRes, trendRes, statusRes, equipRes, empsRes, invRes, expRes, ctrRes] =
          await Promise.all([
            api.get('/dashboard/overview'),
            api.get('/dashboard/trend'),
            api.get('/dashboard/contract-status'),
            api.get('/equipment/expiring',              { params: { days: 30 } }),
            api.get('/employees/expiring-documents',    { params: { days: 30 } }),
            api.get('/invoices',  { params: { page: 1, pageSize: 5 } }),
            api.get('/expenses',  { params: { page: 1, pageSize: 5 } }),
            api.get('/contracts', { params: { status: 'ACTIVE', pageSize: 6 } }),
          ]);

        if (cancelled) return;

        setOv(ovRes.data?.data ?? null);
        setTrend(Array.isArray(trendRes.data?.data) ? trendRes.data.data : []);
        setStatus(Array.isArray(statusRes.data?.data) ? statusRes.data.data : []);

        setInvoices(extractArray(invRes).slice(0, 5));
        setExpenses(extractArray(expRes).slice(0, 5));
        setContracts(extractArray(ctrRes).slice(0, 6));

        // ---- Build alerts from equipment + employee endpoints ----
        const equipAlerts: DashAlert[] = (equipRes.data?.data || []).map((e: ApiAny) => ({
          title: `معدة: ${e.code}`,
          desc:  `دفتر المركبة: ${e.registration?.remainingText ?? '—'}`,
          status: (e.registration?.expired ? 'red' : 'amber') as DashAlert['status'],
          icon:  '🚜',
        }));

        const empAlerts: DashAlert[] = [];
        (empsRes.data?.data || []).forEach((e: ApiAny) => {
          (e.alerts ?? []).forEach((a: ApiAny) => {
            empAlerts.push({
              title: e.fullName,
              desc:  `${a.document}: ${
                a.remainingDays < 0
                  ? 'منتهٍ'
                  : `ينتهي خلال ${a.remainingDays} يوم`
              }`,
              status: (a.remainingDays < 0 ? 'red' : 'amber') as DashAlert['status'],
              icon: '👷',
            });
          });
        });

        setAlerts([...equipAlerts, ...empAlerts]);
      } catch {
        // API unavailable — leave data empty, UI shows empty states
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Derived values
  const f   = ov?.finance   ?? {};
  const c   = ov?.contracts ?? {};
  const eq  = ov?.equipment ?? {};
  const emp = ov?.employees ?? {};

  const workingEquipment  = (eq.total ?? 0) - (eq.notWorking ?? 0);
  const profitPositive    = (f.netProfit ?? 0) >= 0;

  // Alert widget derived values
  const expiredContracts  = (status as ApiAny[]).find((s: ApiAny) => s.status === 'EXPIRED')?.count ?? 0;
  const brokenEquipment   = eq.notWorking ?? 0;
  const duePayments       = f.dueInvoicesCount ?? 0;
  const expiringContracts = contracts.filter((ct: ApiAny) => {
    if (!ct.endDate) return false;
    const daysLeft = (new Date(ct.endDate).getTime() - Date.now()) / 86_400_000;
    return daysLeft >= 0 && daysLeft <= 30;
  }).length;

  return (
    <div className="db-page">

      {/* ══════════════════════════════════════════════════
          EXECUTIVE HEADER
      ══════════════════════════════════════════════════ */}
      <div className="db-exec-header">
        <h2 className="db-exec-greeting">
          مرحباً، {user?.fullName ?? 'مدير النظام'} 👋
        </h2>
        <p className="db-exec-date">📅 {today}</p>
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
              الفواتير المستحقة: {f.dueInvoicesCount ?? 0}
            </span>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          QUICK ACTIONS
      ══════════════════════════════════════════════════ */}
      <div className="db-actions">
        <button className="db-action-btn primary" onClick={() => navigate('/invoices')}>
          ＋ فاتورة جديدة
        </button>
        <button className="db-action-btn green" onClick={() => navigate('/contracts')}>
          ＋ عقد جديد
        </button>
        <button className="db-action-btn purple" onClick={() => navigate('/customers')}>
          ＋ عميل جديد
        </button>
        <button className="db-action-btn amber" onClick={() => navigate('/expenses')}>
          ＋ مصروف جديد
        </button>
      </div>

      {/* ══════════════════════════════════════════════════
          ROW 1 — FINANCIAL KPIs
      ══════════════════════════════════════════════════ */}
      {loading ? <KPISkeletons /> : (
        <div className="db-kpi-grid">
          <KPICard
            label="إجمالي الإيرادات"
            value={money(f.totalRevenue)}
            icon="💰"
            color="green"
          />
          <KPICard
            label="إجمالي المصروفات"
            value={money(f.totalExpense)}
            icon="📉"
            color="red"
          />
          <KPICard
            label="صافي الربح"
            value={money(f.netProfit)}
            icon="📈"
            color={profitPositive ? 'blue' : 'red'}
          />
          <KPICard
            label="الفواتير غير المحصلة"
            value={money(f.dueInvoicesAmount)}
            icon="🧾"
            color="amber"
            sub={f.dueInvoicesCount ? `${f.dueInvoicesCount} فاتورة معلّقة` : undefined}
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          EXECUTIVE ALERT WIDGETS
      ══════════════════════════════════════════════════ */}
      {loading ? (
        <div className="db-alert-widgets">
          {[0,1,2,3].map(i => (
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
              {(f.dueInvoicesAmount ?? 0) > 0 && (
                <div className="db-aw-sub">{money(f.dueInvoicesAmount)}</div>
              )}
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
          ROW 2 — OPERATIONAL STATS
      ══════════════════════════════════════════════════ */}
      {loading ? <StatsSkeletons /> : (
        <div className="db-stats-grid">
          <OpsCard
            label="العقود السارية"
            value={c.active ?? 0}
            icon="📄"
            iconBg="rgba(37,99,235,0.14)"
            sub={`من إجمالي ${c.total ?? 0} عقد`}
          />
          <OpsCard
            label="المعدات العاملة"
            value={workingEquipment}
            icon="🚜"
            iconBg="rgba(245,158,11,0.14)"
            sub={eq.notWorking ? `${eq.notWorking} خارج الخدمة` : 'جميعها تعمل'}
          />
          <OpsCard
            label="الموظفون النشطون"
            value={emp.active ?? 0}
            icon="👷"
            iconBg="rgba(16,185,129,0.14)"
          />
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MAIN ROW — Active Contracts  |  Urgent Alerts
      ══════════════════════════════════════════════════ */}
      <div className="db-main-row">

        {/* Active contracts with time-progress bars */}
        <div className="db-card">
          <div className="db-card-head">
            <div>
              <h3>العقود النشطة</h3>
              <p>عقود نقل الأسفلت الجارية</p>
            </div>
            {!loading && (c.active ?? 0) > 0 && (
              <span className="db-pill blue">{c.active} عقد</span>
            )}
          </div>
          <div className="db-card-body scrollable">
            <ContractProgressList contracts={contracts} loading={loading} />
          </div>
        </div>

        {/* Priority alerts */}
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
            <ContractStatusChart data={status} loading={loading} />
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

    </div>
  );
}
