import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import Modal from '../components/Modal';
import { formatFileDate } from '../lib/date';

/**
 * تصحيح تاريخ التحصيل الرسمي لدفعة تاريخية — مدير النظام فقط.
 * إجراء إداري تصحيحي بحت: يُعدّل تاريخ التحصيل الرسمي فقط (Payment.date) دون المساس
 * بالمبلغ أو طريقة الدفع أو حالة الفاتورة. تُسجَّل العملية بالكامل في سجل التدقيق.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CorrectCollectionDate({ payment, onClose, onSaved }: { payment: any; onClose: () => void; onSaved: (message?: string) => void }) {
  const currentDate = formatFileDate(payment.date);
  const [newDate, setNewDate] = useState(currentDate);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!newDate) { setError('تاريخ التحصيل الجديد مطلوب'); return; }
    if (saving) return;
    setSaving(true);
    try {
      const res = await api.patch(`/payments/${payment.id}/collection-date`, {
        date: newDate,
        ...(reason.trim() && { reason: reason.trim() }),
      });
      onSaved(res?.data?.message);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`تصحيح تاريخ التحصيل${payment.invoiceNumber ? ' — ' + payment.invoiceNumber : ''}`} size="md" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ الحفظ…' : 'حفظ'}</button>
        <button type="button" className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="alert invcx-correct-note">
        سيتم تعديل تاريخ التحصيل الرسمي فقط.<br />
        لن يتم تعديل مبلغ التحصيل أو حالة الفاتورة أو بيانات السداد.<br />
        سيتم تسجيل العملية بالكامل في سجل التدقيق.
      </div>
      <div className="field">
        <label>تاريخ التحصيل الحالي</label>
        <DateInput value={currentDate} onChange={() => {}} readOnly disabled ariaLabel="تاريخ التحصيل الحالي" />
      </div>
      <div className="field">
        <label>تاريخ التحصيل الجديد *</label>
        <DateInput value={newDate} onChange={setNewDate} ariaLabel="تاريخ التحصيل الجديد" />
      </div>
      <div className="field">
        <label>السبب (اختياري)</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} aria-label="سبب التصحيح" />
      </div>
    </Modal>
  );
}
