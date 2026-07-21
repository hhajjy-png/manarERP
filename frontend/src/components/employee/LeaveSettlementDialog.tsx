import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import { useT } from '../../lib/i18n';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { SETTLEMENT_METHOD_LABEL } from './entitlementsShared';

/** خيارات طريقة الدفع — تطابق ENUMS.leaveSettlementPaymentMethod في الخادم. */
const PAYMENT_METHODS: { value: string; labelKey: string }[] = [
  { value: 'CASH', labelKey: SETTLEMENT_METHOD_LABEL.CASH },
  { value: 'BANK_TRANSFER', labelKey: SETTLEMENT_METHOD_LABEL.BANK_TRANSFER },
  { value: 'CHEQUE', labelKey: SETTLEMENT_METHOD_LABEL.CHEQUE },
  { value: 'OTHER', labelKey: SETTLEMENT_METHOD_LABEL.OTHER },
];

interface Props {
  employeeId: number;
  /** يُعبّأ تلقائيًا من الرصيد المحتسَب الحالي (قابل للتعديل). */
  defaultDays: number | null;
  /** يُعبّأ تلقائيًا من قيمة بدل الإجازة المحتسَبة الحالية (قابل للتعديل). */
  defaultAmount: number | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * حوار «تسجيل دفعة مقدَّمة على الإجازة» — تسجيل يدوي/تاريخي فقط (POST
 * /employees/:id/leave-settlements). لا ينشئ أي قيد محاسبي/حركة بنكية/شيك/سند/راتب،
 * ولا يُسقط أو يُنقص استحقاق الإجازة القانوني المحتسَب (المادتان 73/74 — لا يجوز
 * التنازل عن الإجازة السنوية بمقابل أثناء الخدمة؛ الصرف النقدي فقط عند انتهاء العقد).
 * يعيد ExplorerKit استخدام نفس الحوار/الحقول القياسية (RTL، الوضع الداكن، متجاوب).
 */
export default function LeaveSettlementDialog({ employeeId, defaultDays, defaultAmount, onClose, onSaved }: Props) {
  const { t } = useT();
  const [settlementDate, setSettlementDate] = useState<string>(todayDateOnly(new Date()));
  const [leaveDaysSettled, setLeaveDaysSettled] = useState<string>(defaultDays != null ? String(defaultDays) : '');
  const [settlementAmount, setSettlementAmount] = useState<string>(defaultAmount != null ? String(defaultAmount) : '');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!settlementDate) { setError(t('msg.ent.date_required')); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/employees/${employeeId}/leave-settlements`, {
        settlementDate,
        leaveDaysSettled: Number(leaveDaysSettled || 0),
        settlementAmount: Number(settlementAmount || 0),
        paymentMethod,
        notes: notes.trim() || undefined,
      });
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      icon="savings"
      title={t('page.ent.record_leave_advance')}
      subtitle={t('msg.ent.leave_advance_dialog_subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="check" onClick={save} busy={saving}>{t('action.save')}</Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <DialogSection>
        <div className="xpl-field">
          <label>{t('field.date')}</label>
          <DateInput className="xpl-input" value={settlementDate} onChange={(v) => setSettlementDate(v)} ariaLabel={t('field.date')} />
        </div>
        <div className="xpl-field">
          <label>{t('field.ent.days_count')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.01"
            value={leaveDaysSettled}
            onChange={(e) => setLeaveDaysSettled(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label={t('field.ent.days_count')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.ent.value')}</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={settlementAmount}
            onChange={(e) => setSettlementAmount(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label={t('field.ent.value')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.payment_method')}</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label={t('field.payment_method')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.notes_optional')}</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('ph.ent.settlement_notes')} aria-label={t('field.notes')} />
        </div>
      </DialogSection>
    </Dialog>
  );
}
