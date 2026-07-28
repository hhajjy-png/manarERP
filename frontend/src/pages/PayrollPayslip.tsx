import { CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { printCurrentView } from '../utils/print';
import {
  waitForPrintReady,
  useAccurateFormPreview,
  isFlagEnabled,
  UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1,
} from '../printing';
import { useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { useT } from '../lib/i18n';
import { DOC_FONT_STACK } from '../styles/fontRegistry';

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

  // Auto-print once the payslip has rendered. Print Center Foundation v1 replaced the
  // arbitrary `setTimeout(…, 500)` here with a real readiness signal (fonts loaded,
  // images decoded, layout painted) and a bounded fallback, so a slow machine can no
  // longer fire the print dialog over a half-rendered payslip. The transport is
  // unchanged: it still calls printCurrentView(), so the printed output is identical.
  /** الجذر القابل للطباعة — نفس العقدة التي يطبعها المسار القديم. */
  const printRootRef = useRef<HTMLDivElement>(null);

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** العقدة المطبوعة (`printRootRef`) و**نفس** دالة الطباعة القديمة
   * (`printCurrentView`) — بمرجعها، بلا تغليف. لا قالب بديل، ولا HTML مختلف، ولا محرّك جديد.
   * المعاينة القديمة وزر الطباعة ومسارهما باقون كما هم. العلم مطفأ ⇒ لا زر ولا حوار.
   */
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printRootRef.current,
    onPrint: () => printCurrentView(),
    title: t('page.payslip.doc_label'),
    documentLabel: data ? `${t('page.payslip.doc_label')} · ${data.employee.fullName} · ${data.month}/${data.year}` : '',
    // لا مبدّل لغة في هذا النموذج — قسيمة الراتب عربية دائمًا. 'ar' هنا صريحة لِما
    // كان ضمنيًا (افتراضي الخطّاف السابق) — لا تغيير سلوكي.
    lang: 'ar',
  });

  /** بوابة **واحدة** يمرّ بها **كلا** مساري الطباعة — الزر اليدوي والطباعة التلقائية
   * عند الجاهزية. تستدعي `printCurrentView` مباشرة — لا معترِض، ولا معاينة قبل الطباعة. */
  const requestPrint = useCallback(() => {
    printCurrentView();
  }, []);

  useEffect(() => {
    if (!data) return;
    let canceled = false;
    void waitForPrintReady().then(() => {
      if (!canceled) requestPrint();
    });
    return () => {
      canceled = true;
    };
  }, [data, requestPrint]);

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
    <>
    {/* الحوار خارج الجذر القابل للطباعة، فلا يدخل المستند المُركَّب. */}
    {accurate.dialog}
    <div
      ref={printRootRef}
      style={{
        padding: 28,
        fontFamily: DOC_FONT_STACK,
        maxWidth: 900,
        margin: '0 auto',
        color: '#0f172a',
        background: '#fff',
        minHeight: '100vh',
      }}
    >
      <div className="no-print" style={{ display: 'flex', gap: 10, marginBottom: 18 }}>
        <button className="btn" onClick={requestPrint}>
          {t('btn.payslip.print')}
        </button>
        {accurate.button}
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
    </>
  );
}
