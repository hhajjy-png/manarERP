import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import { useT } from '../../lib/i18n';
import DateInput from '../DateInput';
import PrivateAmount from '../PrivateAmount';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { PAYMENT_METHOD_LABEL, type FinalSettlement, type SettlementPaymentRow } from './entitlementsShared';

/** طرق الدفع — نفس القائمة المعتمدة في دفعات المستحقات. */
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER'];

interface Props {
  employeeId: number;
  settlement: FinalSettlement;
  /** الدفعة قيد التصحيح — غيابها يعني تسجيل دفعة جديدة. */
  payment?: SettlementPaymentRow | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * تسجيل دفعة على التصفية النهائية المعتمدة.
 *
 * المستخدم يُدخل المبلغ والتاريخ فقط (وطريقة الدفع ومرجع/ملاحظة اختياريان)؛ المدفوع
 * والمتبقي يشتقّهما الخادم من دفعات التصفية المسجَّلة مقابل الإجمالي المجمَّد. المعاينة
 * أدناه عرضٌ فوري فقط — الخادم يبقى الحَكَم ويرفض أي تجاوز بلا قصّ.
 */
export default function SettlementPaymentDialog({ employeeId, settlement, payment, onClose, onSaved }: Props) {
  const { t } = useT();
  const isEdit = !!payment;

  const [paymentDate, setPaymentDate] = useState<string>(
    payment ? String(payment.paymentDate).slice(0, 10) : todayDateOnly(new Date()),
  );
  const [amount, setAmount] = useState<string>(payment ? String(payment.amount) : '');
  const [paymentMethod, setPaymentMethod] = useState<string>(payment?.paymentMethod ?? 'CASH');
  const [reference, setReference] = useState<string>(payment?.reference ?? '');
  const [notes, setNotes] = useState<string>(payment?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entered = Number(amount || 0);
  const total = settlement.computation.totalAmount;

  // عند التصحيح تُستبعد الدفعة نفسها من «المدفوع سابقًا»، وإلا لصادمت نفسها فبدت كل زيادة
  // تجاوزًا. نفس قاعدة الخادم — والخادم يبقى الحَكَم النهائي.
  const paidExcludingThis = isEdit ? Math.round((settlement.paid - payment!.amount) * 1000) / 1000 : settlement.paid;
  const availableForThis = total !== null ? Math.round((total - paidExcludingThis) * 1000) / 1000 : null;
  const remainingAfter =
    availableForThis !== null && Number.isFinite(entered)
      ? Math.round((availableForThis - entered) * 1000) / 1000
      : null;
  const exceedsRemaining = remainingAfter !== null && remainingAfter < 0;

  const save = async () => {
    if (!paymentDate) { setError(t('msg.ent.date_required')); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        paymentDate,
        amount: entered,
        paymentMethod,
        reference: reference.trim() || undefined,
        notes: notes.trim() || undefined,
      };
      if (isEdit) await api.patch(`/employees/${employeeId}/final-settlement/payments/${payment!.id}`, body);
      else await api.post(`/employees/${employeeId}/final-settlement/payments`, body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      icon="payments"
      title={isEdit ? t('action.ent.edit_settlement_payment') : t('action.ent.record_settlement_payment')}
      subtitle={t('msg.ent.settlement_payment_subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" onClick={save} busy={saving} disabled={!(entered > 0)}>
            {t('action.save')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="ent-pay-preview">
        <div className="ent-pay-preview-row">
          <span>{t('field.ent.settlement_total')}</span>
          <span>{total !== null ? <PrivateAmount value={total} level={1} /> : '—'}</span>
        </div>
        <div className="ent-pay-preview-row">
          <span>{isEdit ? t('field.ent.paid_other_payments') : t('field.ent.already_paid')}</span>
          <span><PrivateAmount value={paidExcludingThis} level={1} /></span>
        </div>
        <div className="ent-pay-preview-row ent-pay-preview-row--total">
          <span>{t('field.ent.remaining_after_payment')}</span>
          <span className={exceedsRemaining ? 'ent-pay-preview-over' : undefined}>
            {remainingAfter !== null ? <PrivateAmount value={remainingAfter} level={1} /> : '—'}
          </span>
        </div>
        {exceedsRemaining && (
          <div className="ent-recon-note ent-recon-note--warn">
            <span className="material-symbols-outlined" aria-hidden="true">warning</span>
            <span>{t('msg.ent.payment_exceeds_remaining')}</span>
          </div>
        )}
      </div>

      <DialogSection>
        <div className="xpl-field">
          <label>{t('col.amount')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label={t('col.amount')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.ent.payment_date')}</label>
          <DateInput className="xpl-input" value={paymentDate} onChange={(v) => setPaymentDate(v)} ariaLabel={t('field.ent.payment_date')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.payment_method')}</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label={t('field.payment_method')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{t(PAYMENT_METHOD_LABEL[m])}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.reference_optional')}</label>
          <input className="xpl-input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('ph.ent.payment_reference')} aria-label={t('field.ent.reference_optional')} />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.notes_optional')}</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('field.notes')} aria-label={t('field.notes')} />
        </div>
      </DialogSection>
    </Dialog>
  );
}
