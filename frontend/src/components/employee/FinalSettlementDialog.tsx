import { useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { todayDateOnly } from '../../lib/date';
import { useT } from '../../lib/i18n';
import DateInput from '../DateInput';
import { Dialog, DialogSection, Button, ErrorBanner } from '../explorer/ExplorerKit';
import { TERMINATION_REASON_LABEL, type FinalSettlement, type TerminationReason } from './entitlementsShared';

const REASONS: TerminationReason[] = ['RESIGNATION', 'EMPLOYER_TERMINATION'];

interface Props {
  employeeId: number;
  /** التصفية القائمة عند التعديل — غيابها يعني إنشاء مسودة جديدة. */
  settlement?: FinalSettlement | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * إنشاء/تعديل مسودة التصفية النهائية.
 *
 * مدخلات المستخدم هنا **يوم العمل الأخير وسبب انتهاء الخدمة فقط** — لا مبالغ، ولا مكوّنات،
 * ولا بنود يدوية. الخادم يشتقّ مكوّني التصفية (متبقي رصيد الإجازة + مكافأة نهاية الخدمة)
 * من المحرّك القانوني الوحيد عند التاريخ المُدخل.
 */
export default function FinalSettlementDialog({ employeeId, settlement, onClose, onSaved }: Props) {
  const { t } = useT();
  const isEdit = !!settlement;

  const [lastWorkingDay, setLastWorkingDay] = useState<string>(
    settlement ? String(settlement.lastWorkingDay).slice(0, 10) : todayDateOnly(new Date()),
  );
  const [terminationReason, setTerminationReason] = useState<TerminationReason>(
    settlement?.terminationReason ?? 'RESIGNATION',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    if (!lastWorkingDay) { setError(t('msg.ent.date_required')); return; }
    setSaving(true);
    setError('');
    try {
      const body = { lastWorkingDay, terminationReason };
      if (isEdit) await api.patch(`/employees/${employeeId}/final-settlement`, body);
      else await api.post(`/employees/${employeeId}/final-settlement`, body);
      onSaved();
    } catch (e) {
      setError(errorMessage(e));
      setSaving(false);
    }
  };

  return (
    <Dialog
      icon="assignment_turned_in"
      title={isEdit ? t('action.ent.edit_settlement') : t('action.ent.create_settlement')}
      subtitle={t('msg.ent.settlement_dialog_subtitle')}
      size="sm"
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
          <label>{t('field.ent.last_working_day')}</label>
          <DateInput
            className="xpl-input"
            value={lastWorkingDay}
            onChange={(v) => setLastWorkingDay(v)}
            ariaLabel={t('field.ent.last_working_day')}
          />
        </div>
        <div className="xpl-field">
          <label>{t('field.ent.termination_reason')}</label>
          <select
            className="xpl-select"
            value={terminationReason}
            onChange={(e) => setTerminationReason(e.target.value as TerminationReason)}
            aria-label={t('field.ent.termination_reason')}
          >
            {REASONS.map((v) => (
              <option key={v} value={v}>{t(TERMINATION_REASON_LABEL[v])}</option>
            ))}
          </select>
        </div>
      </DialogSection>
      <p className="entc-inline-note">{t('msg.ent.settlement_inputs_note')}</p>
    </Dialog>
  );
}
