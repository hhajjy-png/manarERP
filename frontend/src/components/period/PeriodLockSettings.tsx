import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
import DateInput from '../DateInput';
import { useToast } from '../../stores/toastStore';
import { invalidatePeriodLock } from '../../hooks/usePeriodLock';
import { displayDate } from '../../lib/financialPeriod';
import { SectionCard, StatusChip, Button } from '../explorer/ExplorerKit';
import { useT } from '../../lib/i18n';
import './period-lock-settings.css';

/**
 * شاشة إعداد قفل الفترة المالية.
 *
 * القفل إعداد واحد (`finance.lockBeforeDate`) يُخزَّن في جدول Settings العام — لا Migration.
 * لا نظام فترات مغلقة شهريًا. لا تفعيل تلقائي ولا قيمة افتراضية.
 * التفعيل/التغيير يتطلب صلاحية `settings.update` وتأكيدًا قويًا. التجاوز عند الإدخال
 * التاريخي يتطلب `financial.overrideLock` (مبني سابقًا) ويُسجَّل في التدقيق.
 */
export default function PeriodLockSettings() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const canManage = hasPermission('settings.update');

  const [current, setCurrent] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState<null | 'set' | 'clear'>(null);

  useEffect(() => {
    api.get('/settings/period-lock')
      .then((r) => {
        const v = r.data?.data?.lockBeforeDate ?? null;
        setCurrent(v);
        setDraft(v ?? '');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function persist(value: string) {
    setSaving(true);
    try {
      await api.put('/settings', { settings: [{ key: 'finance.lockBeforeDate', value, group: 'finance' }] });
      setCurrent(value || null);
      invalidatePeriodLock(); // تُبطِل تخبئة النماذج فورًا
      toast.ok(value ? t('fc.lock.msg_set', { date: displayDate(value) }) : t('fc.lock.msg_cleared'));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
      setConfirming(null);
    }
  }

  return (
    <SectionCard
      title={t('fc.lock.title')}
      icon="lock_clock"
      actions={
        <StatusChip tone={current ? 'red' : 'neutral'} icon={current ? 'lock' : 'lock_open'}>
          {current ? t('fc.lock.locked_before', { date: displayDate(current) }) : t('fc.lock.none')}
        </StatusChip>
      }
    >
      <div className="plk">
        <p className="plk__desc">
          {t('fc.lock.desc_part1')}
          <code>financial.overrideLock</code>{t('fc.lock.desc_part2')}
        </p>

        {!canManage && (
          <div className="plk__note plk__note--warn">
            <span className="material-symbols-outlined" aria-hidden>info</span>
            {t('fc.lock.permission_required')}
          </div>
        )}

        {loading ? (
          <div className="plk__note">{t('msg.loading')}</div>
        ) : (
          <div className="plk__row">
            <label className="plk__field">
              <span>{t('fc.lock.field_label')}</span>
              <DateInput
                value={draft}
                disabled={!canManage || saving}
                onChange={setDraft}
                ariaLabel={t('fc.lock.field_aria')}
              />
            </label>
            <div className="plk__actions">
              <Button
                variant="primary"
                icon="lock"
                busy={saving}
                disabled={!canManage || !draft || draft === (current ?? '')}
                onClick={() => setConfirming('set')}
              >
                {current ? t('fc.lock.btn_update') : t('fc.lock.btn_activate')}
              </Button>
              {current && (
                <Button variant="danger" icon="lock_open" disabled={!canManage || saving} onClick={() => setConfirming('clear')}>
                  {t('fc.lock.btn_clear')}
                </Button>
              )}
            </div>
          </div>
        )}

        {confirming && (
          <div className="plk__confirm" role="alertdialog" aria-label={t('fc.lock.confirm_aria')}>
            <div className="plk__confirm-body">
              <span className="material-symbols-outlined" aria-hidden>warning</span>
              {confirming === 'set' ? (
                <span>
                  {t('fc.lock.confirm_set_part1')}<strong>{displayDate(draft)}</strong>{t('fc.lock.confirm_set_part2')}
                </span>
              ) : (
                <span>{t('fc.lock.confirm_clear')}</span>
              )}
            </div>
            <div className="plk__confirm-actions">
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={saving}>{t('action.cancel')}</Button>
              <Button
                variant={confirming === 'set' ? 'primary' : 'danger'}
                busy={saving}
                onClick={() => persist(confirming === 'set' ? draft : '')}
              >
                {t('page.salaries.confirm')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
