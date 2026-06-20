import { CSSProperties, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { useT } from '../lib/i18n';

type PayrollLine = {
  id: number;
  type: string;
  label: string;
  amount: number;
  quantity?: number | null;
  rate?: number | null;
};
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
  employee: {
    code: string;
    fullName: string;
    civilId?: string | null;
    jobTitle?: string | null;
    department?: string | null;
  };
  lines: PayrollLine[];
};

const th: CSSProperties = {
  border: '1px solid #cbd5e1',
  padding: '8px 10px',
  background: '#1d4e6f',
  color: '#fff',
  textAlign: 'start',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};
const td: CSSProperties = { border: '1px solid #e2e8f0', padding: '7px 10px', textAlign: 'start' };

export default function PayrollPayslip() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { t } = useT();
  const [data, setData] = useState<Payslip | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/payroll/${id}/payslip`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [id]);

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => window.print(), 500);
      return () => clearTimeout(timer);
    }
  }, [data]);

  if (error)
    return (
      <div className="center-msg">
        {t('msg.payslip.error')}: {error}
      </div>
    );
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.payslip.loading')}
      </div>
    );

  return (
    <div
      style={{
        padding: 28,
        fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif',
        maxWidth: 900,
        margin: '0 auto',
        color: '#0f172a',
        background: '#fff',
        minHeight: '100vh',
      }}
    >
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className="btn" onClick={() => window.print()}>
          {t('btn.payslip.print')}
        </button>
        <button className="btn secondary" onClick={() => navigate(-1)}>
          {t('btn.payslip.back')}
        </button>
      </div>

      <div style={{ textAlign: 'center', marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, color: '#1d4e6f', margin: 0 }}>{t('page.payslip.title')}</h1>
        <p style={{ margin: '6px 0', color: '#64748b', fontWeight: 700 }}>
          {t('page.payslip.company')} · {data.month}/{data.year}
        </p>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginBottom: 18 }}>
        <tbody>
          <tr>
            <td style={td}>{t('lbl.payslip.employee')}</td>
            <td style={td}>
              <strong>{data.employee.fullName}</strong>
            </td>
            <td style={td}>{t('lbl.payslip.emp_code')}</td>
            <td style={td}>{data.employee.code}</td>
          </tr>
          <tr>
            <td style={td}>{t('lbl.payslip.civil_id')}</td>
            <td style={td}>{data.employee.civilId ?? ''}</td>
            <td style={td}>{t('lbl.payslip.job_title')}</td>
            <td style={td}>{data.employee.jobTitle ?? ''}</td>
          </tr>
          <tr>
            <td style={td}>{t('lbl.payslip.status')}</td>
            <td style={td}>{data.status}</td>
            <td style={td}>{t('lbl.payslip.department')}</td>
            <td style={td}>{data.employee.department ?? ''}</td>
          </tr>
        </tbody>
      </table>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            <th style={th}>{t('col.payslip.type')}</th>
            <th style={th}>{t('col.payslip.description')}</th>
            <th style={th}>{t('col.payslip.qty')}</th>
            <th style={th}>{t('col.payslip.rate')}</th>
            <th style={th}>{t('col.payslip.amount')}</th>
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
          <tr>
            <td style={td} colSpan={4}>
              {t('lbl.payslip.gross')}
            </td>
            <td style={td}>
              <strong>{money(data.grossSalary)}</strong>
            </td>
          </tr>
          <tr>
            <td style={td} colSpan={4}>
              {t('lbl.payslip.deductions')}
            </td>
            <td style={td}>
              <strong>{money((data.totalDeductions ?? 0) + (data.totalAdvances ?? 0))}</strong>
            </td>
          </tr>
          <tr>
            <td style={{ ...td, background: '#f0f3f7', fontWeight: 800 }} colSpan={4}>
              {t('lbl.payslip.net')}
            </td>
            <td style={{ ...td, background: '#f0f3f7', fontWeight: 800 }}>
              {money(data.netSalary)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
