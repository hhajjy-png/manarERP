import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';

/** أنواع المستحق — تطابق ENUMS.entitlementLedgerType في الخادم. */
const ENTRY_TYPES: { value: string; label: string }[] = [
  { value: 'LEAVE_ALLOWANCE', label: 'بدل الإجازة' },
  { value: 'END_OF_SERVICE', label: 'مكافأة نهاية الخدمة' },
  { value: 'OTHER', label: 'مستحق آخر' },
];

/** طرق الدفع — تطابق ENUMS.leaveSettlementPaymentMethod. */
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'CASH', label: 'نقدًا' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
  { value: 'CHEQUE', label: 'شيك' },
  { value: 'OTHER', label: 'أخرى' },
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
  const changeType = (t: string) => {
    setEntryType(t);
    setAmount(defaultAmountFor(t));
    if (t === 'LEAVE_ALLOWANCE') setLeaveDays(numStr(leaveBalanceDays));
  };

  const isLeaveAllowance = entryType === 'LEAVE_ALLOWANCE';

  const save = async () => {
    if (!entryDate) { setError('التاريخ مطلوب'); return; }
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
      title="إضافة مستحق"
      subtitle="سجل تاريخي فقط — لا يغيّر الاحتساب ولا يُنشئ قيودًا محاسبية أو حركات بنكية أو رواتب"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" icon="check" onClick={save} busy={saving}>حفظ</Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <DialogSection>
        <div className="xpl-field">
          <label>نوع المستحق</label>
          <select className="xpl-select" value={entryType} onChange={(e) => changeType(e.target.value)} aria-label="نوع المستحق">
            {ENTRY_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field">
          <label>التاريخ</label>
          <DateInput className="xpl-input" value={entryDate} onChange={(v) => setEntryDate(v)} ariaLabel="التاريخ" />
        </div>
        {isLeaveAllowance && (
          <div className="xpl-field">
            <label>عدد الأيام</label>
            <input
              className="xpl-input"
              type="number"
              min="0"
              step="0.01"
              value={leaveDays}
              onChange={(e) => setLeaveDays(e.target.value)}
              style={{ direction: 'ltr' }}
              aria-label="عدد الأيام"
            />
          </div>
        )}
        <div className="xpl-field">
          <label>المبلغ</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label="المبلغ"
          />
        </div>
        <div className="xpl-field">
          <label>طريقة الدفع</label>
          <select className="xpl-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} aria-label="طريقة الدفع">
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
        <div className="xpl-field xpl-field--full">
          <label>الوصف (اختياري)</label>
          <input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف المستحق" aria-label="الوصف" />
        </div>
        <div className="xpl-field xpl-field--full">
          <label>ملاحظات (اختياري)</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات" aria-label="ملاحظات" />
        </div>
      </DialogSection>
    </Dialog>
  );
}
