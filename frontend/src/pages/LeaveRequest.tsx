import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { useParams, useLocation } from 'react-router-dom';
import { useT, t as translate } from '../lib/i18n';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import { useLegacyFormPreview, isLegacyFormsPreviewEnabled, PRINT_PREVIEW_LEGACY_FORMS_HR, useAccurateFormPreview, isFlagEnabled, UNIVERSAL_TRUE_CHROMIUM_WYSIWYG_PREVIEW_V1 } from '../printing';
import LeaveRequestTemplate from '../forms/LeaveRequestTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

const FORM_KEY = 'leave-request';

const INITIAL_PRINT_FIELDS = {
  expectedReturnDate: '',
  leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
  startDate: '',
  endDate: '',
  days: '',
  reason: '',
};

function calcDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

export default function LeaveRequest() {
  const { t } = useT();
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('leave-request'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY, getProfileIdFromSearch(search));
  const daysManuallyEdited = useRef(false);
  const [printFields, setPrintFields] = useState({
    expectedReturnDate: '',
    leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
    startDate: '',
    endDate: '',
    days: '',
    reason: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/leave-request/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  useEffect(() => {
    const { startDate, endDate } = printFields;
    if (!startDate || !endDate) {
      daysManuallyEdited.current = false;
      return;
    }
    if (daysManuallyEdited.current) return;
    const computed = calcDays(startDate, endDate);
    setPrintFields(p => ({ ...p, days: String(computed) }));
  }, [printFields.startDate, printFields.endDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); daysManuallyEdited.current = false; setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'leave-request', formNumber, employeeName: data.employee.fullName, printProfile: profile });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [data, formNumber, addPrintLog, profile]);

  /* معاينة قبل الطباعة — طبقة عرض فوق مسار FormLayout القديم. العلم مطفأ ⇒ لا اعتراض
     ولا حوار، فيبقى زر الطباعة على onClick={doPrint} كما هو. */
  const preview = useLegacyFormPreview({
    enabled: isLegacyFormsPreviewEnabled(PRINT_PREVIEW_LEGACY_FORMS_HR),
    title: translate('page.leaveReq.title', lang),
    documentLabel: `${translate('page.leaveReq.title', lang)} · ${formNumber}`,
    lang,
  });

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
    title: translate('page.leaveReq.title', lang),
    documentLabel: `${translate('page.leaveReq.title', lang)} · ${formNumber}`,
  });


  if (error) return <div className="center-msg">{t('msg.error')}: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        {t('msg.loading')}
      </div>
    );

  const latestLeave = data.latestLeave;

  return (
    <>
    {preview.dialog}
    {accurate.dialog}
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      printIntercept={preview.printIntercept}
      onPrintApiReady={(api) => { printApiRef.current = api; }}
      ready
      formNumber={formNumber}
      title={translate('page.leaveReq.title', lang)}
      profile={profile}
      // HR Print Templates – Shared Visual Consistency Pack v1: reuse the Salary
      // Certificate's opt-in ApprovalSection/FormLayout behavior.
      approvalHideDate
      approvalStampInline
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
        {accurate.button}
        </>
      }
      qrData={{
        formType: 'leave-request',
        formNumber,
        entityName: data.employee.fullName,
        entityId: Number(employeeId),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('page.warning.print_fields_header')}</div>

        {!latestLeave && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>{t('page.leaveReq.field.leave_type')}</label>
              <select
                title={t('page.leaveReq.field.leave_type')}
                value={printFields.leaveType}
                onChange={(e) => setPrintFields(p => ({ ...p, leaveType: e.target.value as typeof printFields.leaveType }))}
              >
                <option value="">{t('msg.select_placeholder')}</option>
                <option value="ANNUAL">{t('page.leaveReq.opt.annual')}</option>
                <option value="SICK">{t('page.leaveReq.opt.sick')}</option>
                <option value="UNPAID">{t('page.leaveReq.opt.unpaid')}</option>
                <option value="EMERGENCY">{t('page.leaveReq.opt.emergency')}</option>
              </select>
            </div>
            <div className="field">
              <label>{t('page.leaveReq.field.days')}</label>
              <input
                type="number"
                lang="en"
                min="1"
                title={t('page.leaveReq.field.days')}
                value={printFields.days}
                onChange={(e) => {
                  daysManuallyEdited.current = true;
                  setPrintFields(p => ({ ...p, days: e.target.value }));
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                {t('page.leaveReq.days_hint')}
              </span>
            </div>
            <div className="field">
              <label>{t('field.start_date')}</label>
              <DateInput
                title={t('field.start_date')}
                value={printFields.startDate}
                onChange={(v) => setPrintFields(p => ({ ...p, startDate: v }))}
              />
            </div>
            <div className="field">
              <label>{t('field.end_date')}</label>
              <DateInput
                title={t('field.end_date')}
                value={printFields.endDate}
                onChange={(v) => setPrintFields(p => ({ ...p, endDate: v }))}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>{t('page.leaveReq.field.reason')}</label>
              <input
                title={t('page.leaveReq.field.reason')}
                value={printFields.reason}
                onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="field" style={{ maxWidth: 280 }}>
          <label>{t('page.leaveReq.field.expected_return')}</label>
          <DateInput
            title={t('page.leaveReq.field.expected_return')}
            value={printFields.expectedReturnDate}
            onChange={(v) => setPrintFields(p => ({ ...p, expectedReturnDate: v }))}
          />
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
      <LeaveRequestTemplate employee={data.employee} latestLeave={latestLeave} lang={lang} printFields={printFields} />
      {showClearConfirm && (
        <ConfirmModal message={t('page.warning.clear_confirm')} confirmLabel={t('page.warning.clear_confirm_btn')} variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
    </>
  );
}
