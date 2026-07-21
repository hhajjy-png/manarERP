import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import { useT } from '../../lib/i18n';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { LEDGER_TYPE_LABEL, SETTLEMENT_METHOD_LABEL } from './entitlementsShared';

/** أنواع المستحق — تطابق ENUMS.entitlementLedgerType في الخادم. */
const ENTRY_TYPES: { value: string; labelKey: string }[] = [
  { value: 'LEAVE_ALLOWANCE', labelKey: LEDGER_TYPE_LABEL.LEAVE_ALLOWANCE },
  { value: 'END_OF_SERVICE', labelKey: LEDGER_TYPE_LABEL.END_OF_SERVICE },
  { value: 'OTHER', labelKey: LEDGER_TYPE_LABEL.OTHER },
];

/** طرق الدفع — تطابق ENUMS.leaveSettlementPaymentMethod. */
const PAYMENT_METHODS: { value: string; labelKey: string }[] = [
  { value: 'CASH', labelKey: SETTLEMENT_METHOD_LABEL.CASH },
  { value: 'BANK_TRANSFER', labelKey: SETTLEMENT_METHOD_LABEL.BANK_TRANSFER },
  { value: 'CHEQUE', labelKey: SETTLEMENT_METHOD_LABEL.CHEQUE },
  { value: 'OTHER', labelKey: SETTLEMENT_METHOD_LABEL.OTHER },
];

interface Props {
  employeeId: number;
  /** الرصيد المحتسَب الحالي — للتعبئة المسبقة لعدد الأيام عند «بدل الإجازة». */
  leaveBalanceDays: number | null;
  /** قيمة بدل الإجازة المحتسَبة — تعبئة المبلغ عند «بدل الإجازة». */
  leaveAllowanceValue: number | null;
  /** مكافأة نهاية الخدمة المحتسَبة — تعبئة المبلغ عند «مكافأة نهاية الخدمة». */
  eosValue: number | null;
  onClose: () => void;
  onSaved: () => void;
}

const numStr = (v: number | null): string => (v != null ? String(v) : '');

/**
 * حوار «إضافة مستحق» لسجل المستحقات المصروفة — تسجيل تاريخي فقط. الحفظ ينشئ صفًّا
 * واحدًا (POST /employees/:id/entitlement-ledger) ولا يغيّر أي احتساب ولا ينشئ أي
 * قيد محاسبي/حركة بنكية/شيك/سند/راتب. يعيد استخدام حوار وحقول ExplorerKit القياسية.
 */
export default function EntitlementLedgerDialog({ employeeId, leaveBalanceDays, leaveAllowanceValue, eosValue, onClose, onSaved }: Props) {
  const { t } = useT();
  const defaultAmountFor = (type: string): string =>
    type === 'LEAVE_ALLOWANCE' ? numStr(leaveAllowanceValue) : type === 'END_OF_SERVICE' ? numStr(eosValue) : '';

  const [entryType, setEntryType] = useState<string>('LEAVE_ALLOWANCE');
  const [entryDate, setEntryDate] = useState<string>(todayDateOnly(new Date()));
  const [description, setDescription] = useState<string>('');
  const [leaveDays, setLeaveDays] = useState<string>(numStr(leaveBalanceDays));
  const [amount, setAmount] = useState<string>(defaultAmountFor('LEAVE_ALLOWANCE'));
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // تغيير النوع يعيد تعبئة المبلغ (وعدد الأيام لبدل الإجازة) بالقيمة المناسبة — قابلة للتعديل.
  const changeType = (newType: string) => {
    setEntryType(newType);
    setAmount(defaultAmountFor(newType));
    if (newType === 'LEAVE_ALLOWANCE') setLeaveDays(numStr(leaveBalanceDays));
  };

  const isLeaveAllowance = entryType === 'LEAVE_ALLOWANCE';

  const save = async () => {
    if (!entryDate) { setError(t('msg.ent.date_required')); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/employees/${employeeId}/entitlement-ledger`, {
        entryType,
        entryDate,
        description: description.trim() || undefined,
        leaveDays: isLeaveAllowance ? Number(leaveDays || 0) : undefined,
        amount: Number(amount || 0),
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
      icon="history_edu"
      title={t('page.ent.add_ledger_entry')}
      subtitle={t('msg.ent.ledger_dialog_subtitle')}
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
          <label>{t('field.ent.ledger_type')}</label>
          <select className="xpl-select" value={entryType} onChange={(e) => changeType(e.target.value)} aria-label={t('field.ent.ledger_type')}>
            {ENTRY_TYPES.map((et) => (
              <option key={et.value} value={et.value}>{t(et.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field">
          <label>{t('field.date')}</label>
          <DateInput className="xpl-input" value={entryDate} onChange={(v) => setEntryDate(v)} ariaLabel={t('field.date')} />
        </div>
        {isLeaveAllowance && (
          <div className="xpl-field">
            <label>{t('field.ent.days_count')}</label>
            <input
              className="xpl-input"
              type="number"
              min="0"
              step="0.01"
              value={leaveDays}
              onChange={(e) => setLeaveDays(e.target.value)}
              style={{ direction: 'ltr' }}
              aria-label={t('field.ent.days_count')}
            />
          </div>
        )}
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
          <label>{t('field.payment_method')}</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label={t('field.payment_method')}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{t(m.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.description_optional')}</label>
          <input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('ph.ent.ledger_description')} aria-label={t('col.description')} />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.notes_optional')}</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('field.notes')} aria-label={t('field.notes')} />
        </div>
      </DialogSection>
    </Dialog>
  );
}
