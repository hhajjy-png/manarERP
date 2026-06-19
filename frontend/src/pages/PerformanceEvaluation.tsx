import { useMemo, useState, useEffect } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getPrintMode } from '../forms/shared/printMode';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import PerformanceEvaluationTemplate from '../forms/PerformanceEvaluationTemplate';
import LanguageToggle from '../forms/shared/LanguageToggle';

export default function PerformanceEvaluation() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const printMode = getPrintMode(search);
  const formNumber = useMemo(() => generateFormNumber('performance-evaluation'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<{ scores: string[]; reviewerComments: string }>({ scores: ['', '', '', '', ''], reviewerComments: '' });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/performance-evaluation/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'performance-evaluation',
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
      title="تقييم أداء الموظف"
      printMode={printMode}
      toolbarExtra={<LanguageToggle lang={lang} onChange={setLang} />}
      qrData={{
        formType: 'performance-evaluation',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
          {['جودة العمل', 'الالتزام والانضباط', 'العمل الجماعي', 'المبادرة والإبداع', 'الانضباط في المواعيد'].map((label, i) => (
            <div key={i} className="field">
              <label>{label} (من 20)</label>
              <input type="number" min="0" max="20" title={label} value={printFields.scores[i]} onChange={(e) => setPrintFields(p => { const s = [...p.scores]; s[i] = e.target.value; return { ...p, scores: s }; })} />
            </div>
          ))}
        </div>
        <div className="field">
          <label>ملاحظات المقيِّم والتوصيات</label>
          <input title="ملاحظات المقيِّم" value={printFields.reviewerComments} onChange={(e) => setPrintFields(p => ({ ...p, reviewerComments: e.target.value }))} />
        </div>
      </div>
      <PerformanceEvaluationTemplate
        employee={data.employee}
        latestReview={data.latestReview}
        lang={lang}
        printFields={printFields}
      />
    </FormLayout>
  );
}
