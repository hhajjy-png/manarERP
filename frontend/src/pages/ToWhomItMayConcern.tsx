import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ToWhomItMayConcernTemplate from '../forms/ToWhomItMayConcernTemplate';

type Lang = 'ar' | 'en';

export default function ToWhomItMayConcern() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('to-whom-it-may-concern'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/to-whom-it-may-concern/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'to-whom-it-may-concern',
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

  const langToggle = (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      {(['ar', 'en'] as Lang[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          style={{
            padding: '4px 12px',
            fontSize: 12,
            border: 'none',
            cursor: 'pointer',
            background: lang === l ? 'var(--primary)' : 'transparent',
            color: lang === l ? '#fff' : 'var(--text-muted)',
            fontWeight: lang === l ? 700 : 400,
          }}
        >
          {l === 'ar' ? 'عربي' : 'English'}
        </button>
      ))}
    </div>
  );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'To Whom It May Concern' : 'إلى من يهمه الأمر'}
      printMode={printMode}
      toolbarExtra={langToggle}
      qrData={{
        formType: 'to-whom-it-may-concern',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <ToWhomItMayConcernTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
      />
    </FormLayout>
  );
}
