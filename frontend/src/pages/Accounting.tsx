import { useEffect, useState } from 'react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import { money, dateText } from '../config/modules';

export default function Accounting() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [pl, setPl] = useState<{ totalRevenue: number; totalExpense: number; netProfit: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [journal, profit] = await Promise.all([
          api.get('/transactions', { params: { pageSize: 20 } }),
          api.get('/transactions/profit-loss'),
        ]);
        setRows(journal.data.data.data ?? []);
        setPl(profit.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <div className="page-head"><div><h2>القيود المحاسبية</h2><p>دفتر اليومية والأرباح والخسائر</p></div></div>

      <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
        <StatCard label="إجمالي الإيرادات" value={money(pl?.totalRevenue)} icon="📈" color="var(--green)" bg="var(--green-light)" />
        <StatCard label="إجمالي المصروفات" value={money(pl?.totalExpense)} icon="📉" color="var(--red)" bg="var(--red-light)" />
        <StatCard label="صافي الربح" value={money(pl?.netProfit)} icon="💰" color="var(--green)" bg="var(--green-light)" dir="up" />
      </div>

      <div className="card panel">
        <h3>دفتر اليومية</h3><div className="ph-sub">أحدث القيود المحاسبية</div>
        <div className="table-responsive">
          <table>
            <thead><tr><th>رقم القيد</th><th>التاريخ</th><th>البيان</th><th>مدين</th><th>دائن</th><th>الحساب</th></tr></thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6}><div className="center-msg"><div className="spinner" />جارٍ التحميل…</div></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6}><div className="center-msg">لا توجد قيود بعد</div></td></tr>
              ) : rows.map((j) => (
                <tr key={j.id}>
                  <td style={{ fontFamily: 'monospace' }}><strong>{j.entryNumber}</strong></td>
                  <td>{dateText(j.date)}</td>
                  <td>{j.description}</td>
                  <td style={{ color: 'var(--red)', fontWeight: 700 }}>{j.debit ? money(j.debit) : '—'}</td>
                  <td style={{ color: 'var(--green)', fontWeight: 700 }}>{j.credit ? money(j.credit) : '—'}</td>
                  <td>{j.account}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
