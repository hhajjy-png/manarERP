import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useT } from '../../lib/i18n';
import { dateText } from '../../config/modules';
import PrivateAmount from '../PrivateAmount';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { TERMINATION_REASON_LABEL, type FinalSettlement } from './entitlementsShared';

interface Props {
  employeeId: number;
  settlement: FinalSettlement;
  onClose: () => void;
  onCancelled: () => void;
}

/**
 * تأكيد إلغاء تصفية معتمدة/مسدَّدة.
 *
 * الإلغاء **ليس حذفًا**: يبقى السجل واللقطة المجمَّدة وكل الدفعات المسجَّلة كما هي، وتتحوّل
 * التصفية إلى حالة تاريخية لا تقبل أي عملية. لذلك يعرض الحوار ما سيُحفَظ وما سيتوقّف
 * صراحةً، ويشترط سببًا مكتوبًا يُخزَّن مع الإلغاء.
 */
export default function FinalSettlementCancelDialog({ employeeId, settlement, onClose, onCancelled }: Props) {
  const { t } = useT();
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const trimmed = reason.trim();

  const submit = async () => {
    if (!trimmed) { setError(t('msg.ent.cancel_reason_required')); return; }
    setSaving(true);
    setError('');
    try {
      await api.post(`/employees/${employeeId}/final-settlement/cancel`, { cancellationReason: trimmed });
      onCancelled();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      icon="cancel"
      title={t('action.ent.cancel_settlement')}
      subtitle={t('msg.ent.cancel_settlement_subtitle')}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>{t('action.cancel')}</Button>
          <Button variant="danger" icon="cancel" onClick={submit} busy={saving} disabled={!trimmed}>
            {t('action.ent.cancel_settlement')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <DialogSection>
        <dl className="entc-group-grid">
          <div className="entc-datum"><dt>{t('field.ent.last_working_day')}</dt><dd>{dateText(settlement.lastWorkingDay)}</dd></div>
          <div className="entc-datum"><dt>{t('field.ent.termination_reason')}</dt><dd>{t(TERMINATION_REASON_LABEL[settlement.terminationReason])}</dd></div>
          <div className="entc-datum">
            <dt>{t('field.ent.settlement_total')}</dt>
            <dd>{settlement.computation.totalAmount !== null ? <PrivateAmount value={settlement.computation.totalAmount} level={1} /> : '—'}</dd>
          </div>
          <div className="entc-datum"><dt>{t('field.ent.total_paid')}</dt><dd><PrivateAmount value={settlement.paid} level={1} /></dd></div>
        </dl>
      </DialogSection>

      <div className="ent-recon-note ent-recon-note--warn">
        <span className="material-symbols-outlined" aria-hidden="true">warning</span>
        <span>{t('msg.ent.cancel_settlement_warning')}</span>
      </div>

      <DialogSection>
        <div className="xpl-field xpl-field--full">
          <label>{t('field.ent.cancellation_reason')}</label>
          <input
            className="xpl-input"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('ph.ent.cancellation_reason')}
            aria-label={t('field.ent.cancellation_reason')}
          />
        </div>
      </DialogSection>
    </Dialog>
  );
}
