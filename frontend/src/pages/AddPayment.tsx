import { useState } from 'react';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { useT } from '../lib/i18n';
import Modal from '../components/Modal';
import { MoneyText } from '../config/modules';
import { formatFileDate } from '../lib/date';

// ===== تسجيل دفعة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function AddPayment({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const remaining = Number(invoice.total) - Number(invoice.paidAmount);
  const [amount, setAmount] = useState(remaining);
  // الطريقة الافتراضية = شيك (CHEQUE) — تغيير اختيار افتراضي فقط؛ تبقى جميع الطرق متاحة.
  const [method, setMethod] = useState('CHEQUE');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [transferNumber, setTransferNumber] = useState('');
  // تاريخ التحصيل — official collection date, defaults to today (shared local, timezone-safe formatter).
  const [collectionDate, setCollectionDate] = useState(() => formatFileDate());

  function handleMethodChange(newMethod: string) {
    setMethod(newMethod);
    setChequeNumber('');
    setRecipientName('');
    setTransferNumber('');
  }

  async function submit() {
    setError('');
    if (Number(amount) <= 0) { setError(t('error.amount_gt_zero')); return; }
    if (Number(amount) > remaining) { setError(t('error.amount_exceeds_remaining')); return; }
    if (method === 'CHEQUE' && !chequeNumber.trim()) { setError(t('error.cheque.number_required')); return; }
    if (method === 'CASH' && !recipientName.trim()) { setError(t('error.recipient_name_required')); return; }
    if (method === 'TRANSFER' && !transferNumber.trim()) { setError(t('error.transfer_number_required')); return; }
    if (!collectionDate) { setError(t('error.collection_date_required')); return; }
    if (saving) return;
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, {
        amount: Number(amount),
        method,
        date: collectionDate,
        ...(method === 'CHEQUE'   && { reference: chequeNumber }),
        ...(method === 'CASH'     && { notes: recipientName }),
        ...(method === 'TRANSFER' && { reference: transferNumber }),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${t('modal.collect_payment')} — ${invoice.invoiceNumber ?? invoice.number}`} size="lg" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.record_payment')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontWeight: 600 }}>{t('lbl.remaining')} {<MoneyText value={remaining} />}</p>
      <div className="form-grid">
        <div className="field"><label>{t('field.amount_kd')}</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="field">
          <label>{t('field.payment_method')}</label>
          <select value={method} onChange={(e) => handleMethodChange(e.target.value)}>
            <option value="CASH">{t('opt.payment.cash')}</option>
            <option value="BANK">{t('opt.payment.bank')}</option>
            <option value="CHEQUE">{t('opt.payment.cheque')}</option>
            <option value="TRANSFER">{t('opt.payment.transfer')}</option>
          </select>
        </div>
        <div className="field">
          <label>{t('field.collection_date')} *</label>
          <DateInput value={collectionDate} onChange={setCollectionDate} ariaLabel={t('field.collection_date')} />
          <HistoricalDateNotice date={collectionDate} />
        </div>
      </div>
      {method === 'CHEQUE' && (
        <div className="field">
          <label>{t('field.cheque.number')} *</label>
          <input className="line-input" value={chequeNumber} onChange={(e) => setChequeNumber(e.target.value)} autoFocus={false} />
        </div>
      )}
      {method === 'CASH' && (
        <div className="field">
          <label>{t('field.recipient_name')} *</label>
          <input className="line-input" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </div>
      )}
      {method === 'TRANSFER' && (
        <div className="field">
          <label>{t('col.sal.transaction')} *</label>
          <input className="line-input" value={transferNumber} onChange={(e) => setTransferNumber(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}
