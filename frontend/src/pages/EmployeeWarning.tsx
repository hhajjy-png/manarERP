import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import EmployeeWarningTemplate from '../forms/EmployeeWarningTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';

export default function EmployeeWarning() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('employee-warning'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState({ warningReason: '', violationDetails: '', correctiveAction: '', additionalNotes: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employee-warning/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'employee-warning',
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
      title="إنذار موظف"
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'employee-warning',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>سبب الإنذار</label><input title="سبب الإنذار" value={printFields.warningReason} onChange={(e) => setPrintFields(p => ({ ...p, warningReason: e.target.value }))} /></div>
          <div className="field"><label>تفاصيل المخالفة</label><input title="تفاصيل المخالفة" value={printFields.violationDetails} onChange={(e) => setPrintFields(p => ({ ...p, violationDetails: e.target.value }))} /></div>
          <div className="field"><label>الإجراء التصحيحي</label><input title="الإجراء التصحيحي" value={printFields.correctiveAction} onChange={(e) => setPrintFields(p => ({ ...p, correctiveAction: e.target.value }))} /></div>
          <div className="field"><label>ملاحظات إضافية</label><input title="ملاحظات إضافية" value={printFields.additionalNotes} onChange={(e) => setPrintFields(p => ({ ...p, additionalNotes: e.target.value }))} /></div>
        </div>
      </div>
      <EmployeeWarningTemplate employee={data.employee} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
