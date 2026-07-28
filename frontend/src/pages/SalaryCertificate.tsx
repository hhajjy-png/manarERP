import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { useT, t as translate } from '../lib/i18n';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import SalaryCertificateTemplate, { PrintOverrides } from '../forms/SalaryCertificateTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

type Lang = 'ar' | 'en';

const FORM_KEY = 'salary-certificate';

const INITIAL_PRINT_OVERRIDES: PrintOverrides = {
  purpose: '',
  jobTitle: '',
  department: '',
  salaryText: '',
  issueDate: '',
  notes: '',
};

export default function SalaryCertificate() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('salary-certificate'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<Lang>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const [printOverrides, setPrintOverrides] = useState<PrintOverrides>({ ...INITIAL_PRINT_OVERRIDES });

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
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintOverrides() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintOverrides({ ...INITIAL_PRINT_OVERRIDES }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'salary-certificate', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  /**
   * المعاينة الدقيقة (True Chromium WYSIWYG) — **إضافية بحتة**.
   *
   * تستهلك **نفس** العقدة المطبوعة (`.form-page`) و**نفس** دالة الطباعة القديمة
   * (`FormLayout.doPrint`) اللتين ينشرهما `onPrintApiReady`. لا قالب بديل، ولا HTML
   * مختلف، ولا محرّك طباعة جديد. المعاينة القديمة وزر الطباعة ومسارهما: كما هي.
   *
   * العلم مطفأ ⇒ لا زر ولا حوار إطلاقًا.
   */
  const printApiRef = useRef<{ getNode: () => HTMLElement | null; print: () => void } | null>(null);
  const accurate = useAccurateFormPreview({
    enabled: isFlagEnabled(UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1),
    getNode: () => printApiRef.current?.getNode() ?? null,
    onPrint: () => printApiRef.current?.print(),
    title: translate('page.salaryCert.title', lang),
    documentLabel: `${t('page.salaryCert.doc_label')} · ${formNumber}`,
  });


  if (error)
    return <div className="center-msg">{t('page.salaryCert.err_load_failed')} {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('page.salaryCert.loading')}
      </div>
    );

  return (
    <>
    {accurate.dialog}
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      ready
      formNumber={formNumber}
      title={translate('page.salaryCert.title', lang)}
      profile={profile}
      // Overflows the official-letterhead band by a few mm — reclaim the 10mm
      // bottom margin so it stays on one page (letterhead only; top unchanged).
      letterheadCompactFooter
      // Signature section visual polish v1: no printed date, stamp inline with signature.
      approvalHideDate
      approvalStampInline
      // Final content polish v1: certificate number no longer printed above the title.
      hideFormNumber
      toolbarExtra={
        <>
          <LanguageToggle lang={lang} onChange={setLang} />
          <PrintProfileToggle profile={profile} onChange={setProfile} />
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12, padding: '4px 8px' }}
            title={t('page.warning.save_draft_title')}
            onClick={() => saveDraft(FORM_KEY, printOverrides as unknown as Record<string, unknown>)}
          >
            💾
          </button>
          {draftEntry && (
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '4px 8px', color: 'var(--primary)' }}
              title={t('page.warning.load_draft_title')}
              onClick={() => setPrintOverrides(draftEntry.state as PrintOverrides)}
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
        {accurate.button}
        </>
      }
      qrData={{
        formType: 'salary-certificate',
        formNumber,
        entityName: data.employee.fullName,
        entityId: Number(employeeId),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
          {t('page.salaryCert.print_overrides_header')}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', maxWidth: 700 }}>
          <div className="field">
            <label>{t('page.salaryCert.field.purpose')}</label>
            <input
              maxLength={120}
              value={printOverrides.purpose ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, purpose: e.target.value }))}
              placeholder={t('page.salaryCert.ph.purpose')}
            />
          </div>
          <div className="field">
            <label>{t('page.salaryCert.field.job_title')}</label>
            <input
              maxLength={100}
              value={printOverrides.jobTitle ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, jobTitle: e.target.value }))}
              placeholder={data.employee.jobTitle ?? ''}
            />
          </div>
          <div className="field">
            <label>{t('page.salaryCert.field.department')}</label>
            <input
              maxLength={100}
              value={printOverrides.department ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, department: e.target.value }))}
              placeholder={data.employee.department ?? ''}
            />
          </div>
          <div className="field">
            <label>{t('page.salaryCert.field.salary_text')}</label>
            <input
              maxLength={120}
              value={printOverrides.salaryText ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, salaryText: e.target.value }))}
              placeholder={t('page.salaryCert.ph.salary_text')}
            />
          </div>
          <div className="field">
            <label>{t('page.salaryCert.field.issue_date')}</label>
            <input
              maxLength={60}
              value={printOverrides.issueDate ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, issueDate: e.target.value }))}
              placeholder={t('page.salaryCert.ph.issue_date')}
            />
          </div>
          <div className="field">
            <label>{t('field.notes')}</label>
            <input
              maxLength={200}
              value={printOverrides.notes ?? ''}
              onChange={(e) => setPrintOverrides(p => ({ ...p, notes: e.target.value }))}
              placeholder={t('page.salaryCert.ph.notes')}
            />
          </div>
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 12 }}
            onClick={resetPrintOverrides}
          >
            {t('page.salaryCert.clear_overrides_btn')}
          </button>
        </div>
      </div>
      <SalaryCertificateTemplate
        employee={data.employee}
        latestPayroll={data.latestPayroll}
        lang={lang}
        printOverrides={printOverrides}
      />
      {showClearConfirm && (
        <ConfirmModal message={t('page.salaryCert.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
