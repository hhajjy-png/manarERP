import { useMemo, useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_HR } from '../printing';
import PerformanceEvaluationTemplate from '../forms/PerformanceEvaluationTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

const FORM_KEY = 'performance-evaluation';

function makePrintFields() {
  return {
    scores: ['', '', '', '', ''] as string[],
    reviewerComments: '',
    periodFrom: '',
    periodTo: '',
    overrideRating: '',
  };
}

export default function PerformanceEvaluation() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('performance-evaluation'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState<{
    scores: string[];
    reviewerComments: string;
    periodFrom: string;
    periodTo: string;
    overrideRating: string;
  }>(makePrintFields);

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
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields(makePrintFields()); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'performance-evaluation', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR),
    title: 'تقييم أداء الموظف',
    documentLabel: `تقييم أداء · ${formNumber}`,
    lang,
  });

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  return (
    <>
    {preview.dialog}
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      printIntercept={preview.printIntercept}
      ready
      formNumber={formNumber}
      title="تقييم أداء الموظف"
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title="حفظ مسودة"
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title="استعادة المسودة"
              onClick={() => setPrintFields(draftEntry.state as typeof printFields)}
            >
              ↩
            </button>
          )}
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px' }}
              title="مسح المسودة"
              onClick={() => clearDraft(FORM_KEY)}
            >
              ✕
            </button>
          )}
        </>
      }
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="field">
            <label>فترة التقييم من</label>
            <DateInput title="فترة التقييم من" value={printFields.periodFrom} onChange={(v) => setPrintFields(p => ({ ...p, periodFrom: v }))} />
          </div>
          <div className="field">
            <label>فترة التقييم إلى</label>
            <DateInput title="فترة التقييم إلى" value={printFields.periodTo} onChange={(v) => setPrintFields(p => ({ ...p, periodTo: v }))} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 10 }}>
          {['جودة العمل', 'الالتزام والانضباط', 'العمل الجماعي', 'المبادرة والإبداع', 'الانضباط في المواعيد'].map((label, i) => (
            <div key={i} className="field">
              <label>{label} (من 20)</label>
              <input type="number" lang="en" min="0" max="20" title={label} value={printFields.scores[i]} onChange={(e) => setPrintFields(p => { const s = [...p.scores]; s[i] = e.target.value; return { ...p, scores: s }; })} />
            </div>
          ))}
        </div>
        {(() => {
          const allFilled = printFields.scores.length === 5 && printFields.scores.every(s => s?.trim());
          const autoTotal = allFilled ? printFields.scores.reduce((a, s) => a + (parseFloat(s) || 0), 0) : null;
          return autoTotal !== null ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
              المجموع التلقائي: <strong>{autoTotal}</strong> / 100
            </div>
          ) : null;
        })()}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div className="field">
            <label>التقدير اليدوي (يتجاوز الحساب التلقائي)</label>
            <select title="التقدير اليدوي" value={printFields.overrideRating} onChange={(e) => setPrintFields(p => ({ ...p, overrideRating: e.target.value }))}>
              <option value="">— (تلقائي) —</option>
              <option value="excellent">ممتاز</option>
              <option value="very_good">جيد جداً</option>
              <option value="good">جيد</option>
              <option value="acceptable">مقبول</option>
              <option value="poor">ضعيف</option>
            </select>
          </div>
          <div className="field">
            <label>ملاحظات المقيِّم والتوصيات</label>
            <input title="ملاحظات المقيِّم" value={printFields.reviewerComments} onChange={(e) => setPrintFields(p => ({ ...p, reviewerComments: e.target.value }))} />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintFields}
          >
            ↺ مسح حقول الطباعة
          </button>
        </div>
      </div>
      <PerformanceEvaluationTemplate
        employee={data.employee}
        latestReview={data.latestReview}
        lang={lang}
        printFields={printFields}
      />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
