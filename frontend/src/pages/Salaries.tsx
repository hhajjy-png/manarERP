import { useEffect, useState } from 'react';
import { api } from '../api/client';
import StatCard from '../components/StatCard';
import DataTable, { PageMeta } from '../components/DataTable';
import { money, dateText } from '../config/modules';

interface SummaryEmp { name: string; civilId: string | null; values: number[]; monthsPaid: number; total: number; }
interface Summary {
  months: string[]; employees: SummaryEmp[]; monthTotals: number[];
  monthCounts: number[]; grandTotal: number; employeeCount: number;
}

const fmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 3 });

export default function Salaries() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tx, setTx] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const s = await api.get('/salaries/summary');
        setSummary(s.data.data);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // العمليات التفصيلية تُصفّى من الخادم باسم المستفيد
  useEffect(() => {
    (async () => {
      const r = await api.get('/salaries', { params: { page, pageSize: 12, search: query } });
      setTx(r.data.data.data ?? []);
      setMeta(r.data.data.meta ?? null);
    })();
  }, [page, query]);

  if (loading) return <div className="center-msg"><div className="spinner" />جارٍ تحميل الرواتب…</div>;

  const empty = !summary || summary.employeeCount === 0;

  // تصفية الملخص باسم الموظف (في المتصفّح) مع إعادة حساب الإجماليات للنتيجة المصفّاة
  const q = query.trim().toLowerCase();
  const months = summary?.months ?? [];
  const allEmps = summary?.employees ?? [];
  const emps = q ? allEmps.filter((e) => e.name.toLowerCase().includes(q)) : allEmps;
  const monthTotals = months.map((_, i) => emps.reduce((s, e) => s + e.values[i], 0));
  const monthCounts = months.map((_, i) => emps.reduce((s, e) => s + (e.values[i] > 0 ? 1 : 0), 0));
  const grandTotal = emps.reduce((s, e) => s + e.total, 0);
  const topMonthly = emps.length ? Math.max(0, ...emps.map((e) => Math.max(0, ...e.values))) : 0;

  const txColumns = [
    { key: 'paymentDate', label: 'تاريخ الدفع', render: (r: Record<string, unknown>) => dateText(r.paymentDate) },
    { key: 'sourceMonth', label: 'الشهر' },
    { key: 'transactionId', label: 'رقم العملية', render: (r: Record<string, unknown>) => <span style={{ fontFamily: 'monospace' }}>{String(r.transactionId)}</span> },
    { key: 'beneficiaryName', label: 'اسم المستفيد', render: (r: Record<string, unknown>) => <strong>{String(r.beneficiaryName)}</strong> },
    { key: 'bankName', label: 'البنك' },
    { key: 'amount', label: 'المبلغ', render: (r: Record<string, unknown>) => money(r.amount) },
    { key: 'civilId', label: 'الرقم المدني', render: (r: Record<string, unknown>) => <span style={{ fontFamily: 'monospace' }}>{String(r.civilId ?? '—')}</span> },
    { key: 'status', label: 'الحالة', render: (r: Record<string, unknown>) => <span className="pill green">{String(r.status ?? '—')}</span> },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>الرواتب</h2><p>ملخص الرواتب الشهري — دينار كويتي (KWD)</p></div>
        <button className="btn secondary" onClick={() => window.print()}>🖨️ طباعة</button>
      </div>

      {empty ? (
        <div className="card panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 56, marginBottom: 14 }}>💵</div>
          <h3 style={{ fontSize: 20, marginBottom: 8 }}>لا توجد بيانات رواتب بعد</h3>
          <p style={{ color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto', fontWeight: 600 }}>
            استورد ملف عمليات الرواتب من Excel عبر الأمر:
          </p>
          <pre style={{ direction: 'ltr', textAlign: 'left', background: 'var(--primary)', color: '#e2e8f0', borderRadius: 12, padding: '12px 16px', maxWidth: 560, margin: '14px auto', fontFamily: 'monospace', fontSize: 13 }}>
            npm run import -- salaries "data\salary-report.xlsx"
          </pre>
        </div>
      ) : (
        <>
          <div className="toolbar no-print">
            <input
              placeholder="🔎 بحث / فلترة باسم الموظف…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(1); }}
              style={{ flex: 1, minWidth: 260 }}
            />
            {query && <button className="btn secondary" onClick={() => { setQuery(''); setPage(1); }}>مسح الفلتر</button>}
          </div>

          <div className="stats" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
            <StatCard label={q ? 'إجمالي المصروف (مفلتر)' : 'إجمالي المصروف'} value={money(grandTotal)} icon="💵" color="var(--green)" bg="var(--green-light)" />
            <StatCard label="عدد الموظفين" value={emps.length} icon="👷" color="var(--blue)" bg="var(--blue-light)" />
            <StatCard label="عدد الأشهر" value={months.length} icon="📅" color="var(--amber)" bg="var(--amber-light)" />
            <StatCard label="أعلى راتب شهري" value={money(topMonthly)} icon="📈" color="var(--green)" bg="var(--green-light)" />
          </div>

          <div className="card panel" style={{ padding: 0, marginBottom: 24 }}>
            <div style={{ padding: '18px 24px 0' }}><h3>ملخص الرواتب الشهري</h3><div className="ph-sub">مجموع المصروف لكل موظف حسب الشهر{q ? ` — نتائج الفلتر: «${query}»` : ''}</div></div>
            <div className="table-responsive">
              <table>
                <thead>
                  <tr>
                    <th>#</th><th>اسم الموظف</th>
                    {months.map((m) => <th key={m} style={{ textAlign: 'center' }}>{m}</th>)}
                    <th style={{ textAlign: 'center' }}>عدد الأشهر</th>
                    <th style={{ textAlign: 'center' }}>إجمالي المستلم</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.length === 0 ? (
                    <tr><td colSpan={months.length + 4}><div className="center-msg">لا يوجد موظف بهذا الاسم</div></td></tr>
                  ) : emps.map((e, idx) => (
                    <tr key={e.name + idx}>
                      <td style={{ color: 'var(--text-muted)' }}>{idx + 1}</td>
                      <td><strong>{e.name}</strong></td>
                      {e.values.map((v, i) => (
                        <td key={i} style={{ textAlign: 'center', color: v === 0 ? 'var(--text-muted)' : 'var(--text)' }}>{fmt(v)}</td>
                      ))}
                      <td style={{ textAlign: 'center' }}><span className="pill blue">{e.monthsPaid}</span></td>
                      <td style={{ textAlign: 'center', fontWeight: 800, color: 'var(--green)' }}>{fmt(e.total)}</td>
                    </tr>
                  ))}
                  {emps.length > 0 && (
                    <>
                      <tr style={{ background: 'var(--surface-2)' }}>
                        <td></td><td style={{ fontWeight: 800 }}>عدد الموظفين المستلمين</td>
                        {monthCounts.map((c, i) => <td key={i} style={{ textAlign: 'center', fontWeight: 800, color: 'var(--blue)' }}>{c}</td>)}
                        <td></td><td></td>
                      </tr>
                      <tr style={{ background: 'var(--primary)' }}>
                        <td></td><td style={{ fontWeight: 800, color: '#fff' }}>إجمالي المبالغ (KWD)</td>
                        {monthTotals.map((t, i) => <td key={i} style={{ textAlign: 'center', fontWeight: 800, color: '#fff' }}>{fmt(t)}</td>)}
                        <td></td>
                        <td style={{ textAlign: 'center', fontWeight: 800, color: '#fff' }}>{fmt(grandTotal)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <h3 style={{ marginBottom: 12 }}>العمليات التفصيلية{q ? ` — «${query}»` : ''}</h3>
          <DataTable columns={txColumns} rows={tx} meta={meta} onPage={setPage} />
        </>
      )}
    </div>
  );
}
