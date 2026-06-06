import { useEffect, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import { money } from '../config/modules';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Overview = any;

export default function Dashboard() {
  const [ov, setOv] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const barRef = useRef<HTMLCanvasElement>(null);
  const donutRef = useRef<HTMLCanvasElement>(null);
  const charts = useRef<Chart[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const [overview, trend, status] = await Promise.all([
          api.get('/dashboard/overview'),
          api.get('/dashboard/trend'),
          api.get('/dashboard/contract-status'),
        ]);
        setOv(overview.data.data);
        drawCharts(trend.data.data, status.data.data);
      } catch {
        // قد لا تكون الخدمة متاحة بعد
      } finally {
        setLoading(false);
      }
    })();
    return () => charts.current.forEach((c) => c.destroy());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function drawCharts(trend: any[], status: any[]) {
    charts.current.forEach((c) => c.destroy());
    charts.current = [];
    Chart.defaults.font.family = "'Cairo', sans-serif";
    Chart.defaults.font.weight = 600;

    if (barRef.current) {
      charts.current.push(new Chart(barRef.current, {
        type: 'bar',
        data: {
          labels: trend.map((t) => t.label),
          datasets: [
            { label: 'إيرادات', data: trend.map((t) => t.revenue), backgroundColor: '#10b981', borderRadius: 6 },
            { label: 'مصروفات', data: trend.map((t) => t.expense), backgroundColor: '#ef4444', borderRadius: 6 },
          ],
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top', align: 'end' } } },
      }));
    }
    if (donutRef.current && status.length) {
      const labelMap: Record<string, string> = { ACTIVE: 'سارية', EXPIRED: 'منتهية', RENEWING: 'قيد التجديد', SUSPENDED: 'موقوفة' };
      charts.current.push(new Chart(donutRef.current, {
        type: 'doughnut',
        data: {
          labels: status.map((s) => labelMap[s.status] ?? s.status),
          datasets: [{ data: status.map((s) => s.count), backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#ef4444'], borderWidth: 0 }],
        },
        options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom' } } },
      }));
    }
  }

  if (loading) return <div className="center-msg"><div className="spinner" />جارٍ تحميل لوحة التحكم…</div>;

  const f = ov?.finance ?? {};
  const c = ov?.contracts ?? {};
  return (
    <div>
      <div className="page-head">
        <div><h2>لوحة التحكم 👋</h2><p>ملخص أداء شركة المنار</p></div>
      </div>

      <div className="stats">
        <StatCard label="العقود السارية" value={c.active ?? 0} icon="📄" color="var(--blue)" bg="var(--blue-light)" sub={`من إجمالي ${c.total ?? 0}`} />
        <StatCard label="النقل الشهري للعقود" value={money(c.monthlyTransportTotal)} icon="🚛" color="var(--amber)" bg="var(--amber-light)" />
        <StatCard label="إجمالي الإيرادات" value={money(f.totalRevenue)} icon="💰" color="var(--green)" bg="var(--green-light)" dir="up" />
        <StatCard label="إجمالي المصروفات" value={money(f.totalExpense)} icon="📉" color="var(--red)" bg="var(--red-light)" />
        <StatCard label="صافي الربح" value={money(f.netProfit)} icon="📈" color="var(--green)" bg="var(--green-light)" dir="up" />
        <StatCard label="فواتير مستحقة" value={money(f.dueInvoicesAmount)} icon="🧾" color="var(--red)" bg="var(--red-light)" sub={`${f.dueInvoicesCount ?? 0} فاتورة`} />
        <StatCard label="الموظفون النشطون" value={ov?.employees?.active ?? 0} icon="👷" color="var(--primary)" bg="var(--surface-2)" />
        <StatCard label="المركبات" value={ov?.equipment?.total ?? 0} icon="🚜" color="var(--amber)" bg="var(--amber-light)" sub={`${ov?.equipment?.notWorking ?? 0} لا تعمل`} />
      </div>

      <div className="grid-2">
        <div className="card panel">
          <h3>التدفق المالي</h3><div className="ph-sub">آخر 6 أشهر (د.ك)</div>
          <div style={{ position: 'relative', height: 260 }}><canvas ref={barRef} /></div>
        </div>
        <div className="card panel">
          <h3>حالة العقود</h3><div className="ph-sub">توزيع العقود حسب الحالة</div>
          <div style={{ position: 'relative', height: 240 }}><canvas ref={donutRef} /></div>
        </div>
      </div>
    </div>
  );
}
