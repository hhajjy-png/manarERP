import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
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
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('leave-request'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
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

  if (error) return <div className="center-msg">خطأ: {error}</div>;
  if (!data)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  const latestLeave = data.latestLeave;

  return (
    <FormLayout
      ready
      formNumber={formNumber}
      title="طلب إجازة"
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
        formType: 'leave-request',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>

        {!latestLeave && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>نوع الإجازة</label>
              <select
                title="نوع الإجازة"
                value={printFields.leaveType}
                onChange={(e) => setPrintFields(p => ({ ...p, leaveType: e.target.value as typeof printFields.leaveType }))}
              >
                <option value="">— اختر —</option>
                <option value="ANNUAL">إجازة سنوية</option>
                <option value="SICK">إجازة مرضية</option>
                <option value="UNPAID">إجازة بدون راتب</option>
                <option value="EMERGENCY">إجازة طارئة</option>
              </select>
            </div>
            <div className="field">
              <label>عدد الأيام</label>
              <input
                type="number"
                lang="en"
                min="1"
                title="عدد الأيام"
                value={printFields.days}
                onChange={(e) => {
                  daysManuallyEdited.current = true;
                  setPrintFields(p => ({ ...p, days: e.target.value }));
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                يُحسب تلقائياً من التاريخين — يمكن التعديل يدوياً
              </span>
            </div>
            <div className="field">
              <label>تاريخ البداية</label>
              <input
                type="date"
                lang="en"
                title="تاريخ البداية"
                value={printFields.startDate}
                onChange={(e) => setPrintFields(p => ({ ...p, startDate: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>تاريخ النهاية</label>
              <input
                type="date"
                lang="en"
                title="تاريخ النهاية"
                value={printFields.endDate}
                onChange={(e) => setPrintFields(p => ({ ...p, endDate: e.target.value }))}
              />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>سبب الطلب</label>
              <input
                title="سبب الطلب"
                value={printFields.reason}
                onChange={(e) => setPrintFields(p => ({ ...p, reason: e.target.value }))}
              />
            </div>
          </div>
        )}

        <div className="field" style={{ maxWidth: 280 }}>
          <label>تاريخ العودة المتوقعة</label>
          <input
            type="date"
            lang="en"
            title="تاريخ العودة المتوقعة"
            value={printFields.expectedReturnDate}
            onChange={(e) => setPrintFields(p => ({ ...p, expectedReturnDate: e.target.value }))}
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
      <LeaveRequestTemplate employee={data.employee} latestLeave={latestLeave} lang={lang} printFields={printFields} />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
