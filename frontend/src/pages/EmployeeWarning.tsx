import { useMemo, useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { useT } from '../lib/i18n';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import EmployeeWarningTemplate from '../forms/EmployeeWarningTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

type WarningLevel = '' | 'first' | 'second' | 'final';

const FORM_KEY = 'employee-warning';

const INITIAL_PRINT_FIELDS = {
  warningLevel: '' as WarningLevel,
  warningReason: '',
  violationDetails: '',
  correctiveAction: '',
  additionalNotes: '',
  warningDate: '',
};

export default function EmployeeWarning() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('employee-warning'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const [printFields, setPrintFields] = useState({
    warningLevel: '' as WarningLevel,
    warningReason: '',
    violationDetails: '',
    correctiveAction: '',
    additionalNotes: '',
    warningDate: '',
  });

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
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'employee-warning', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  if (error) return <div className="center-msg">{t('msg.error')}: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.loading')}
      </div>
    );

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title={t('page.warning.title')}
      profile={profile}
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title={t('page.warning.save_draft_title')}
            onClick={() => saveDraft(FORM_KEY, printFields as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title={t('page.warning.load_draft_title')}
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
              title={t('page.warning.clear_draft_title')}
              onClick={() => clearDraft(FORM_KEY)}
            >
              ✕
            </button>
          )}
        </>
      }
      qrData={{
        formType: 'employee-warning',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('page.warning.print_fields_header')}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>{t('page.warning.field.date')}</label><input type="date" lang="en" title={t('page.warning.field.date')} value={printFields.warningDate} onChange={(e) => setPrintFields(p => ({ ...p, warningDate: e.target.value }))} /></div>
          <div className="field"><label>{t('page.warning.field.reason')}</label><input title={t('page.warning.field.reason')} value={printFields.warningReason} onChange={(e) => setPrintFields(p => ({ ...p, warningReason: e.target.value }))} /></div>
          <div className="field"><label>{t('page.warning.field.violation')}</label><input title={t('page.warning.field.violation')} value={printFields.violationDetails} onChange={(e) => setPrintFields(p => ({ ...p, violationDetails: e.target.value }))} /></div>
          <div className="field"><label>{t('page.warning.field.corrective')}</label><input title={t('page.warning.field.corrective')} value={printFields.correctiveAction} onChange={(e) => setPrintFields(p => ({ ...p, correctiveAction: e.target.value }))} /></div>
          <div className="field"><label>{t('page.warning.field.notes')}</label><input title={t('page.warning.field.notes')} value={printFields.additionalNotes} onChange={(e) => setPrintFields(p => ({ ...p, additionalNotes: e.target.value }))} /></div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintFields}
          >
            {t('page.warning.clear_fields_btn')}
          </button>
        </div>
      </div>
      <EmployeeWarningTemplate
        employee={data.employee}
        lang={lang}
        printFields={printFields}
        onWarningLevelChange={(level) =>
          setPrintFields(p => ({ ...p, warningLevel: level }))
        }
      />
      {showClearConfirm && (
        <ConfirmModal message={t('page.warning.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
