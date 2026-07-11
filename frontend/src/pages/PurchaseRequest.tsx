import { useState, useEffect } from 'react';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import { todayDateOnly } from '../lib/date';
import { DEFAULT_PROFILE_ID, ProfileId } from '../forms/shared/printProfiles';
import { usePrintProfileMemory } from '../forms/shared/usePrintProfileMemory';
import { generateFormNumber } from '../forms/shared/formNumber';
import FormLayout from '../forms/shared/FormLayout';
import PrintProfileToggle from '../forms/shared/PrintProfileToggle';
import LanguageToggle from '../forms/shared/LanguageToggle';
import PurchaseRequestTemplate, {
  type PurchaseRequestItem,
  type PurchaseRequestPrintFields,
  type PriorityLevel,
} from '../forms/PurchaseRequestTemplate';
import { usePrintLogStore } from '../stores/printLogStore';
import { usePrintDraftStore } from '../stores/printDraftStore';

const FORM_KEY = 'purchase-request';

function newItem(): PurchaseRequestItem {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    description: '',
    qty: '',
    unit: '',
    specification: '',
  };
}

function makeInitial(): PurchaseRequestPrintFields {
  return {
    requestNumber: generateFormNumber(FORM_KEY),
    date: todayDateOnly(),
    requiredDate: '',
    requesterName: '',
    department: '',
    priority: '',
    reason: '',
    items: [newItem()],
    notes: '',
    requestedBy: '',
    reviewedBy: '',
    approvedBy: '',
  };
}

const inp: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 4,
  color: 'var(--text-muted)',
};

export default function PurchaseRequest() {
  const [profile, setProfile] = usePrintProfileMemory(FORM_KEY);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [printFields, setPrintFields] = useState<PurchaseRequestPrintFields>(makeInitial);

  const draftEntry = usePrintDraftStore((s) => s.drafts[FORM_KEY] ?? null);
  const saveDraft = usePrintDraftStore((s) => s.saveDraft);
  const clearDraft = usePrintDraftStore((s) => s.clearDraft);

  const addPrintLog = usePrintLogStore((s) => s.addEntry);
  useEffect(() => {
    const handler = () =>
      addPrintLog({
        formType: FORM_KEY,
        formNumber: printFields.requestNumber,
        employeeName: printFields.requesterName || '—',
        printProfile: profile,
      });
    window.addEventListener('beforeprint', handler);
    return () => window.removeEventListener('beforeprint', handler);
  }, [printFields.requestNumber, printFields.requesterName, profile, addPrintLog]);

  function addItem() {
    setPrintFields((prev) => ({ ...prev, items: [...prev.items, newItem()] }));
  }

  function removeItem(id: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.length > 1 ? prev.items.filter((i) => i.id !== id) : prev.items,
    }));
  }

  function updateItem(id: string, field: keyof Omit<PurchaseRequestItem, 'id'>, value: string) {
    setPrintFields((prev) => ({
      ...prev,
      items: prev.items.map((i) => (i.id === id ? { ...i, [field]: value } : i)),
    }));
  }

  function set<K extends keyof Omit<PurchaseRequestPrintFields, 'items'>>(
    key: K,
    value: PurchaseRequestPrintFields[K],
  ) {
    setPrintFields((prev) => ({ ...prev, [key]: value }));
  }

  const [showClearConfirm, setShowClearConfirm] = useState(false);
  function resetForm() { setShowClearConfirm(true); }
  function executeClear() { setShowClearConfirm(false); setPrintFields(makeInitial()); }

  return (
    <FormLayout
      formType={FORM_KEY}
      lang={lang}
      ready={false}
      formNumber={printFields.requestNumber || generateFormNumber(FORM_KEY)}
      title={lang === 'ar' ? 'طلب شراء' : 'Purchase Request'}
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
              onClick={() => setPrintFields(draftEntry.state as PurchaseRequestPrintFields)}
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
        formType: FORM_KEY,
        formNumber: printFields.requestNumber,
        employeeId: 0,
        employeeName: printFields.requesterName || '—',
        issueDate: new Date().toISOString(),
      }}
    >
      {/* No-print panel */}
      <div
        className="no-print"
        style={{
          marginBottom: 16,
          padding: '14px 18px',
          background: 'var(--surface-2)',
          border: '1px dashed var(--border)',
          borderRadius: 10,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          حقول الطباعة فقط — لن تُحفظ
        </div>

        {/* Row 1: number, date, requiredDate, priority */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>رقم الطلب</label>
            <input
              style={inp}
              value={printFields.requestNumber}
              onChange={(e) => set('requestNumber', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>التاريخ</label>
            <DateInput
              style={inp}
              value={printFields.date}
              onChange={(v) => set('date', v)}
            />
          </div>
          <div>
            <label style={lbl}>التاريخ المطلوب</label>
            <DateInput
              style={inp}
              value={printFields.requiredDate}
              onChange={(v) => set('requiredDate', v)}
            />
          </div>
          <div>
            <label style={lbl}>الأولوية</label>
            <select
              title="الأولوية"
              style={inp}
              value={printFields.priority}
              onChange={(e) => set('priority', e.target.value as PriorityLevel)}
            >
              <option value="">— اختر —</option>
              <option value="LOW">منخفضة / Low</option>
              <option value="MEDIUM">متوسطة / Medium</option>
              <option value="HIGH">عالية / High</option>
              <option value="URGENT">عاجل / Urgent</option>
            </select>
          </div>
        </div>

        {/* Row 2: requesterName, department, reason */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>اسم مقدم الطلب</label>
            <input
              style={inp}
              value={printFields.requesterName}
              onChange={(e) => set('requesterName', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>القسم</label>
            <input
              style={inp}
              value={printFields.department}
              onChange={(e) => set('department', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>سبب الطلب</label>
            <input
              style={inp}
              value={printFields.reason}
              onChange={(e) => set('reason', e.target.value)}
            />
          </div>
        </div>

        {/* Items */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <label style={lbl}>المواد المطلوبة</label>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 12, padding: '3px 8px' }}
              onClick={addItem}
            >
              + إضافة مادة
            </button>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'var(--surface-2)' }}>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)', width: '30%' }}>الوصف</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الكمية</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', border: '1px solid var(--border)', width: '12%' }}>الوحدة</th>
                <th style={{ padding: '4px 6px', fontWeight: 700, color: 'var(--text-muted)', textAlign: 'right', border: '1px solid var(--border)' }}>المواصفات</th>
                <th style={{ border: '1px solid var(--border)', width: '8%' }} />
              </tr>
            </thead>
            <tbody>
              {printFields.items.map((item) => (
                <tr key={item.id}>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input
                      style={{ ...inp, padding: '3px 6px' }}
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input
                      type="number"
                      lang="en"
                      min="0"
                      style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                      value={item.qty}
                      onChange={(e) => updateItem(item.id, 'qty', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input
                      style={{ ...inp, padding: '3px 6px', textAlign: 'center' }}
                      value={item.unit}
                      onChange={(e) => updateItem(item.id, 'unit', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3 }}>
                    <input
                      style={{ ...inp, padding: '3px 6px' }}
                      value={item.specification}
                      onChange={(e) => updateItem(item.id, 'specification', e.target.value)}
                    />
                  </td>
                  <td style={{ border: '1px solid var(--border)', padding: 3, textAlign: 'center' }}>
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 16 }}
                      disabled={printFields.items.length === 1}
                      onClick={() => removeItem(item.id)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Approval names */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
          <div>
            <label style={lbl}>طلب بواسطة</label>
            <input
              style={inp}
              value={printFields.requestedBy}
              onChange={(e) => set('requestedBy', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>مراجعة بواسطة</label>
            <input
              style={inp}
              value={printFields.reviewedBy}
              onChange={(e) => set('reviewedBy', e.target.value)}
            />
          </div>
          <div>
            <label style={lbl}>اعتماد بواسطة</label>
            <input
              style={inp}
              value={printFields.approvedBy}
              onChange={(e) => set('approvedBy', e.target.value)}
            />
          </div>
        </div>

        {/* Notes */}
        <div style={{ marginBottom: 10 }}>
          <label style={lbl}>ملاحظات</label>
          <textarea
            style={{ ...inp, minHeight: 52, resize: 'vertical' }}
            value={printFields.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </div>

        {/* Reset */}
        <button type="button" className="btn secondary" style={{ fontSize: 12 }} onClick={resetForm}>
          ↺ إعادة تعيين
        </button>
      </div>

      {/* Print template */}
      <PurchaseRequestTemplate printFields={printFields} lang={lang} />
      {showClearConfirm && (
        <ConfirmModal message="سيتم مسح جميع الحقول. هل تريد المتابعة؟" confirmLabel="مسح" variant="warning" onConfirm={executeClear} onCancel={() => setShowClearConfirm(false)} />
      )}
    </FormLayout>
  );
}
