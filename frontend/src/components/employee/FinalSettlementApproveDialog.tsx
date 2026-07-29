import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useT } from '../../lib/i18n';
import { dateText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { TERMINATION_REASON_LABEL, daysText, type FinalSettlement } from './entitlementsShared';

interface Props {
  employeeId: number;
  employeeName: string;
  settlement: FinalSettlement;
  onClose: () => void;
  onApproved: () => void;
}

/**
 * تأكيد اعتماد التصفية النهائية.
 *
 * الاعتماد يجمّد النتيجة نهائيًا، فيُعرض هنا الملخّص الكامل الذي سيُجمَّد قبل التأكيد:
 * الموظف، يوم العمل الأخير، سبب انتهاء الخدمة، قيمة رصيد الإجازة، ما دُفع سابقًا، متبقي
 * مكوّن الإجازة، مكافأة نهاية الخدمة، وإجمالي التصفية. كل الأرقام من الخادم.
 */
export default function FinalSettlementApproveDialog({ employeeId, employeeName, settlement, onClose, onApproved }: Props) {
  const { t } = useT();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const c = settlement.computation;

  const approve = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post(`/employees/${employeeId}/final-settlement/approve`);
      onApproved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  const money = (v: number | null) => (v !== null ? <PrivateAmount value={v} level={1} /> : '—');

  return (
    <Dialog
      icon="verified"
      title={t('action.ent.approve_settlement')}
      subtitle={t('msg.ent.approve_settlement_subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="verified" onClick={approve} busy={saving}>
            {t('action.ent.approve_settlement')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <DialogSection>
        <dl className="entc-group-grid">
          <div className="entc-datum"><dt>{t('col.sal.employee')}</dt><dd>{employeeName}</dd></div>
          <div className="entc-datum"><dt>{t('field.ent.last_working_day')}</dt><dd>{dateText(settlement.lastWorkingDay)}</dd></div>
          <div className="entc-datum"><dt>{t('field.ent.termination_reason')}</dt><dd>{t(TERMINATION_REASON_LABEL[settlement.terminationReason])}</dd></div>
          <div className="entc-datum"><dt>{t('field.ent.current_leave_balance')}</dt><dd>{c.leaveDays !== null ? daysText(c.leaveDays, t) : '—'}</dd></div>
        </dl>
      </DialogSection>

      {/* معادلة التصفية كاملة كما ستُجمَّد */}
      <div className="entc-settlement-lines">
        <div className="entc-settlement-line">
          <span>{t('field.ent.leave_allowance_value')}</span>
          <span>{money(c.leaveValue)}</span>
        </div>
        <div className="entc-settlement-line entc-settlement-line--deduct">
          <span>{t('field.ent.prior_leave_paid')}</span>
          <span>{money(c.priorLeavePaid)}</span>
        </div>
        <div className="entc-settlement-line entc-settlement-line--subtotal">
          <span>{t('field.ent.leave_remaining_component')}</span>
          <span>{money(c.leaveRemaining)}</span>
        </div>
        <div className="entc-settlement-line">
          <span>{t('field.ent.eos')}</span>
          <span>{money(c.eosAmount)}</span>
        </div>
        <div className="entc-settlement-line entc-settlement-line--total">
          <span>{t('field.ent.settlement_total')}</span>
          <span>{money(c.totalAmount)}</span>
        </div>
      </div>

      <p className="entc-inline-note">{t('msg.ent.approve_freezes_note')}</p>
    </Dialog>
  );
}
