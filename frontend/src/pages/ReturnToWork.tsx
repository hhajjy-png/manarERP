import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ReturnToWorkTemplate from '../forms/ReturnToWorkTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';

export default function ReturnToWork() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('return-to-work'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState({ actualReturnDate: '', medicalNotes: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/return-to-work/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'return-to-work',
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
      title="إشعار العودة إلى العمل"
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>تاريخ العودة الفعلية</label><input type="date" title="تاريخ العودة الفعلية" value={printFields.actualReturnDate} onChange={(e) => setPrintFields(p => ({ ...p, actualReturnDate: e.target.value }))} /></div>
          <div className="field"><label>ملاحظات طبية / تقرير الطبيب</label><input title="ملاحظات طبية" value={printFields.medicalNotes} onChange={(e) => setPrintFields(p => ({ ...p, medicalNotes: e.target.value }))} /></div>
        </div>
      </div>
      <ReturnToWorkTemplate employee={data.employee} latestLeave={data.latestLeave} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
