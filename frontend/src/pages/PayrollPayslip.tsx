import { CSSProperties, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';

type PayrollLine = { id: number; type: string; label: string; amount: number; quantity?: number | null; rate?: number | null };
type Payslip = {
  id: number;
  month: number;
  year: number;
  snapshotBaseSalary: number;
  grossSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalAdvances: number;
  overtimeHours: number;
  overtimeAmount: number;
  netSalary: number;
  status: string;
  employee: { code: string; fullName: string; civilId?: string | null; jobTitle?: string | null; department?: string | null };
  lines: PayrollLine[];
};

const th: CSSProperties = { border: '1px solid #cbd5e1', padding: '8px 10px', background: '#1d4e6f', color: '#fff', textAlign: 'right', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '7px 10px', textAlign: 'right' };

export default function PayrollPayslip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<Payslip | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/payroll/${id}/payslip`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => window.print(), 500);
      return () => clearTimeout(t);
    }
  }, [data]);

  if (error) return <div className="center-msg">تعذّر تحميل قسيمة الراتب: {error}</div>;
  if (!data) return <div className="center-msg"><div className="spinner" />جاري تحميل قسيمة الراتب...</div>;

  return (
    <div style={{ padding: 28, fontFamily: "'Cairo', sans-serif", maxWidth: 900, margin: '0 auto', color: '#0f172a', background: '#fff', minHeight: '100vh' }}>
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className="btn" onClick={() => window.print()}>طباعة / حفظ PDF</button>
        <button className="btn secondary" onClick={() => navigate(-1)}>رجوع</button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, color: '#1d4e6f', margin: 0 }}>قسيمة الراتب</h1>
        <p style={{ margin: '6px 0', color: '#64748b', fontWeight: 700 }}>شركة المنار · {data.month}/{data.year}</p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}>
        <tbody>
          <tr><td style={td}>الموظف</td><td style={td}><strong>{data.employee.fullName}</strong></td><td style={td}>الرقم الوظيفي</td><td style={td}>{data.employee.code}</td></tr>
          <tr><td style={td}>الرقم المدني</td><td style={td}>{data.employee.civilId ?? ''}</td><td style={td}>المسمى الوظيفي</td><td style={td}>{data.employee.jobTitle ?? ''}</td></tr>
          <tr><td style={td}>الحالة</td><td style={td}>{data.status}</td><td style={td}>القسم</td><td style={td}>{data.employee.department ?? ''}</td></tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>النوع</th>
            <th style={th}>الوصف</th>
            <th style={th}>الكمية</th>
            <th style={th}>السعر</th>
            <th style={th}>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {data.lines.map((line) => (
            <tr key={line.id}>
              <td style={td}>{line.type}</td>
              <td style={td}>{line.label}</td>
              <td style={td}>{line.quantity ?? ''}</td>
              <td style={td}>{line.rate != null ? money(line.rate) : ''}</td>
              <td style={{ ...td, fontWeight: 700 }}>{money(line.amount)}</td>
            </tr>
          ))}
          <tr><td style={td} colSpan={4}>إجمالي الراتب</td><td style={td}><strong>{money(data.grossSalary)}</strong></td></tr>
          <tr><td style={td} colSpan={4}>الخصومات والسلف</td><td style={td}><strong>{money((data.totalDeductions ?? 0) + (data.totalAdvances ?? 0))}</strong></td></tr>
          <tr><td style={{ ...td, background: '#f0f3f7', fontWeight: 800 }} colSpan={4}>صافي الراتب</td><td style={{ ...td, background: '#f0f3f7', fontWeight: 800 }}>{money(data.netSalary)}</td></tr>
        </tbody>
      </table>
    </div>
  );
}
