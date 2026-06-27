import { useMemo, useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import ToWhomItMayConcernTemplate from '../forms/ToWhomItMayConcernTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

type Lang = 'ar' | 'en';

const FORM_KEY = 'to-whom-it-may-concern';

const INITIAL_PRINT_FIELDS = { certPurpose: '' };

export default function ToWhomItMayConcern() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('to-whom-it-may-concern'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({ certPurpose: '' });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

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
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'to-whom-it-may-concern', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

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
      formType={FORM_KEY}
      ready
      formNumber={formNumber}
      title={lang === 'en' ? 'To Whom It May Concern' : 'إلى من يهمه الأمر'}
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
        formType: 'to-whom-it-may-concern',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        <div className="field" style={{ maxWidth: 400 }}>
          <label>الغرض من الشهادة / Purpose</label>
          <input
            value={printFields.certPurpose}
            onChange={(e) => setPrintFields(p => ({ ...p, certPurpose: e.target.value }))}
            placeholder="مثال: السفارة الهندية / Indian Embassy"
          />
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
      <ToWhomItMayConcernTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
        printFields={printFields}
      />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
