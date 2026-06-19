import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ResignationTemplate from '../forms/ResignationTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';

export default function Resignation() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('resignation'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState({ lastWorkingDay: '', noticePeriod: '', resignationReason: '', handoverObligations: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/resignation/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'resignation',
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
      title="طلب استقالة"
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'resignation',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>آخر يوم عمل</label><input type="date" title="آخر يوم عمل" value={printFields.lastWorkingDay} onChange={(e) => setPrintFields(p => ({ ...p, lastWorkingDay: e.target.value }))} /></div>
          <div className="field"><label>فترة الإشعار</label><input value={printFields.noticePeriod} onChange={(e) => setPrintFields(p => ({ ...p, noticePeriod: e.target.value }))} placeholder="مثال: شهر واحد" /></div>
          <div className="field"><label>سبب الاستقالة</label><input title="سبب الاستقالة" value={printFields.resignationReason} onChange={(e) => setPrintFields(p => ({ ...p, resignationReason: e.target.value }))} /></div>
          <div className="field"><label>التزامات التسليم</label><input title="التزامات التسليم" value={printFields.handoverObligations} onChange={(e) => setPrintFields(p => ({ ...p, handoverObligations: e.target.value }))} /></div>
        </div>
      </div>
      <ResignationTemplate employee={data.employee} lang={lang} printFields={printFields} />
    </FormLayout>
  );
}
