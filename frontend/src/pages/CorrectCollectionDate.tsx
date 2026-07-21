import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import Modal from '../components/Modal';
import { formatFileDate } from '../lib/date';
import { useT } from '../lib/i18n';

/**
 * تصحيح تاريخ التحصيل الرسمي لدفعة تاريخية — مدير النظام فقط.
 * إجراء إداري تصحيحي بحت: يُعدّل تاريخ التحصيل الرسمي فقط (Payment.date) دون المساس
 * بالمبلغ أو طريقة الدفع أو حالة الفاتورة. تُسجَّل العملية بالكامل في سجل التدقيق.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function CorrectCollectionDate({ payment, onClose, onSaved }: { payment: any; onClose: () => void; onSaved: (message?: string) => void }) {
  const { t } = useT();
  const currentDate = formatFileDate(payment.date);
  const [newDate, setNewDate] = useState(currentDate);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!newDate) { setError(t('error.new_collection_date_required')); return; }
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
    <Modal title={`${t('dlg.correct_collection_date.title')}${payment.invoiceNumber ? ' — ' + payment.invoiceNumber : ''}`} size="md" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="alert invcx-correct-note">
        {t('msg.correct_date.scope')}<br />
        {t('msg.correct_date.no_change')}<br />
        {t('msg.correct_date.audit_logged')}
      </div>
      <div className="field">
        <label>{t('field.current_collection_date')}</label>
        <DateInput value={currentDate} onChange={() => {}} readOnly disabled ariaLabel={t('field.current_collection_date')} />
      </div>
      <div className="field">
        <label>{t('field.new_collection_date')} *</label>
        <DateInput value={newDate} onChange={setNewDate} ariaLabel={t('field.new_collection_date')} />
      </div>
      <div className="field">
        <label>{t('field.correction_reason_optional')}</label>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} aria-label={t('aria.correction_reason')} />
      </div>
    </Modal>
  );
}
