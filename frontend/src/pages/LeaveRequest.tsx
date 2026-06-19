import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LeaveRequestTemplate from '../forms/LeaveRequestTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';

export default function LeaveRequest() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('leave-request'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState({ expectedReturnDate: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/leave-request/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, printMode]);

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="طلب إجازة"
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div className="field" style={{ maxWidth: 280 }}>
          <label>تاريخ العودة المتوقعة</label>
          <input type="date" title="تاريخ العودة المتوقعة" value={printFields.expectedReturnDate} onChange={(e) => setPrintFields(p => ({ ...p, expectedReturnDate: e.target.value }))} />
        </div>
      </div>
      <LeaveRequestTemplate employee={data.employee} latestLeave={data.latestLeave} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
