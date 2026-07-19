import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';

/** خيارات طريقة الدفع — تطابق ENUMS.leaveSettlementPaymentMethod في الخادم. */
const PAYMENT_METHODS: { value: string; label: string }[] = [
  { value: 'CASH', label: 'نقدًا' },
  { value: 'BANK_TRANSFER', label: 'تحويل بنكي' },
  { value: 'CHEQUE', label: 'شيك' },
  { value: 'OTHER', label: 'أخرى' },
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
 * حوار «تسوية رصيد الإجازة» — تسجيل يدوي فقط. الحفظ ينشئ سجل تسوية واحدًا (POST
 * /employees/:id/leave-settlements) ولا ينشئ أي قيد محاسبي/حركة بنكية/شيك/سند/راتب.
 * يعيد ExplorerKit استخدام نفس الحوار/الحقول القياسية (RTL، الوضع الداكن، متجاوب).
 */
export default function LeaveSettlementDialog({ employeeId, defaultDays, defaultAmount, onClose, onSaved }: Props) {
  const [settlementDate, setSettlementDate] = useState<string>(todayDateOnly(new Date()));
  const [leaveDaysSettled, setLeaveDaysSettled] = useState<string>(defaultDays != null ? String(defaultDays) : '');
  const [settlementAmount, setSettlementAmount] = useState<string>(defaultAmount != null ? String(defaultAmount) : '');
  const [paymentMethod, setPaymentMethod] = useState<string>('CASH');
  const [notes, setNotes] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!settlementDate) { setError('تاريخ التسوية مطلوب'); return; }
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
      title="تسوية رصيد الإجازة"
      subtitle="تسجيل يدوي فقط — لا يُنشئ قيودًا محاسبية أو حركات بنكية أو رواتب"
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>إلغاء</Button>
          <Button variant="primary" icon="check" onClick={save} busy={saving}>حفظ التسوية</Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      <DialogSection>
        <div className="xpl-field">
          <label>تاريخ التسوية</label>
          <DateInput className="xpl-input" value={settlementDate} onChange={(v) => setSettlementDate(v)} ariaLabel="تاريخ التسوية" />
        </div>
        <div className="xpl-field">
          <label>عدد الأيام</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.01"
            value={leaveDaysSettled}
            onChange={(e) => setLeaveDaysSettled(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label="عدد الأيام"
          />
        </div>
        <div className="xpl-field">
          <label>القيمة</label>
          <input
            className="xpl-input"
            type="number"
            min="0"
            step="0.001"
            value={settlementAmount}
            onChange={(e) => setSettlementAmount(e.target.value)}
            style={{ direction: 'ltr' }}
            aria-label="القيمة"
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
          <label>ملاحظات (اختياري)</label>
          <input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات التسوية" aria-label="ملاحظات" />
        </div>
      </DialogSection>
    </Dialog>
  );
}
