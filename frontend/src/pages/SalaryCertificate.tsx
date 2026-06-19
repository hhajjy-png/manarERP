import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LanguageToggle from '../forms/shared/LanguageToggle';
import SalaryCertificateTemplate from '../forms/SalaryCertificateTemplate';

type Lang = 'ar' | 'en';

export default function SalaryCertificate() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('salary-certificate'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/salary-certificate/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'salary-certificate',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, printMode]);

  if (error)
    return <div className="center-msg">تعذّر تحميل بيانات الشهادة: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ تجهيز الشهادة…
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'Salary Certificate' : 'شـهـادة راتـب'}
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'salary-certificate',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <SalaryCertificateTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
      />
    </FormLayout>
  );
}
