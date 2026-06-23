import { useMemo, useState, useEffect, useRef } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import { useParams, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { getProfileIdFromSearch, ProfileId } from '../forms/shared/printProfiles';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import ReturnToWorkTemplate from '../forms/ReturnToWorkTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';

const FORM_KEY = 'return-to-work';

const INITIAL_PRINT_FIELDS = {
  leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
  leaveStartDate: '',
  leaveEndDate: '',
  leaveDays: '',
  actualReturnDate: '',
  medicalNotes: '',
};

function calcDays(start: string, end: string): number {
  const [sy, sm, sd] = start.split('-').map(Number);
  const [ey, em, ed] = end.split('-').map(Number);
  const s = new Date(sy, sm - 1, sd);
  const e = new Date(ey, em - 1, ed);
  return Math.max(1, Math.round((e.getTime() - s.getTime()) / 86400000) + 1);
}

export default function ReturnToWork() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { search } = useLocation();
  const formNumber = useMemo(() => generateFormNumber('return-to-work'), []);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [profile, setProfile] = useState<ProfileId>(() => getProfileIdFromSearch(search));
  const daysManuallyEdited = useRef(false);
  const [printFields, setPrintFields] = useState({
    leaveType: '' as '' | 'ANNUAL' | 'SICK' | 'UNPAID' | 'EMERGENCY',
    leaveStartDate: '',
    leaveEndDate: '',
    leaveDays: '',
    actualReturnDate: '',
    medicalNotes: '',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/return-to-work/${employeeId}`)
      .then((res) => setData(res.data.data))
      .catch((e) => setError(errorMessage(e)));
  }, [employeeId]);

  useEffect(() => {
    if (!data) return;
    api
      .post('/forms/print-log', {
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: profile,
      })
      .catch(() => {});
  }, [data, formNumber, employeeId, profile]);

  useEffect(() => {
    const { leaveStartDate, leaveEndDate } = printFields;
    if (!leaveStartDate || !leaveEndDate) {
      daysManuallyEdited.current = false;
      return;
    }
    if (daysManuallyEdited.current) return;
    const computed = calcDays(leaveStartDate, leaveEndDate);
    setPrintFields(p => ({ ...p, leaveDays: String(computed) }));
  }, [printFields.leaveStartDate, printFields.leaveEndDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetPrintFields() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); daysManuallyEdited.current = false; setPrintFields({ ...INITIAL_PRINT_FIELDS }); }

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    if (!data) return;
    const handler = () => addPrintLog({ formType: 'return-to-work', formNumber, employeeName: data.employee.fullName, printProfile: profile });
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
      ready
      formNumber={formNumber}
      title="إشعار العودة إلى العمل"
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
        formType: 'return-to-work',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: data.employee.fullName,
        issueDate: new Date().toISOString(),
      }}
    >
      <div className="no-print" style={{ marginBottom: 16, padding: '14px 18px', background: 'var(--surface-2)', border: '1px dashed var(--border)', borderRadius: 10 }}>
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>حقول الطباعة فقط — لن تُحفظ</div>
        {!data.latestLeave && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div className="field">
              <label>نوع الإجازة</label>
              <select title="نوع الإجازة" value={printFields.leaveType} onChange={(e) => setPrintFields(p => ({ ...p, leaveType: e.target.value as typeof printFields.leaveType }))}>
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
                value={printFields.leaveDays}
                onChange={(e) => {
                  daysManuallyEdited.current = true;
                  setPrintFields(p => ({ ...p, leaveDays: e.target.value }));
                }}
              />
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'block' }}>
                يُحسب تلقائياً من التاريخين — يمكن التعديل يدوياً
              </span>
            </div>
            <div className="field">
              <label>تاريخ بداية الإجازة</label>
              <input type="date" lang="en" title="تاريخ بداية الإجازة" value={printFields.leaveStartDate} onChange={(e) => setPrintFields(p => ({ ...p, leaveStartDate: e.target.value }))} />
            </div>
            <div className="field">
              <label>تاريخ نهاية الإجازة</label>
              <input type="date" lang="en" title="تاريخ نهاية الإجازة" value={printFields.leaveEndDate} onChange={(e) => setPrintFields(p => ({ ...p, leaveEndDate: e.target.value }))} />
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field"><label>تاريخ العودة الفعلية</label><input type="date" lang="en" title="تاريخ العودة الفعلية" value={printFields.actualReturnDate} onChange={(e) => setPrintFields(p => ({ ...p, actualReturnDate: e.target.value }))} /></div>
          <div className="field"><label>ملاحظات طبية / تقرير الطبيب</label><input title="ملاحظات طبية" value={printFields.medicalNotes} onChange={(e) => setPrintFields(p => ({ ...p, medicalNotes: e.target.value }))} /></div>
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
      <ReturnToWorkTemplate employee={data.employee} latestLeave={data.latestLeave} lang={lang} printFields={printFields} />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع حقول الطباعة. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
