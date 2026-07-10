import { useEffect, useState } from 'react';
import { api, errorMessage } from '../../api/client';
import { useAuth } from '../../stores/authStore';
import { useToast } from '../../stores/toastStore';
import { invalidatePeriodLock } from '../../hooks/usePeriodLock';
import { displayDate } from '../../lib/financialPeriod';
import { SectionCard, StatusChip, Button } from '../explorer/ExplorerKit';
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
      toast.ok(value ? `تم قفل الفترة قبل ${displayDate(value)}` : 'تم إلغاء قفل الفترة');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSaving(false);
      setConfirming(null);
    }
  }

  return (
    <SectionCard
      title="قفل الفترة المالية"
      icon="lock_clock"
      actions={
        <StatusChip tone={current ? 'red' : 'neutral'} icon={current ? 'lock' : 'lock_open'}>
          {current ? `مقفلة قبل ${displayDate(current)}` : 'لا يوجد قفل'}
        </StatusChip>
      }
    >
      <div className="plk">
        <p className="plk__desc">
          يمنع القفل إنشاء أو تعديل أو حذف أو عكس أو ترحيل أي معاملة مالية بتاريخ أقدم من التاريخ المحدَّد.
          تجاوز القفل يتطلب صلاحية <code>financial.overrideLock</code>، وكل تجاوز يُسجَّل في سجل التدقيق.
        </p>

        {!canManage && (
          <div className="plk__note plk__note--warn">
            <span className="material-symbols-outlined" aria-hidden>info</span>
            إدارة قفل الفترة تتطلب صلاحية تعديل الإعدادات.
          </div>
        )}

        {loading ? (
          <div className="plk__note">جارٍ التحميل…</div>
        ) : (
          <div className="plk__row">
            <label className="plk__field">
              <span>يقفل قبل تاريخ</span>
              <input
                type="date"
                value={draft}
                disabled={!canManage || saving}
                onChange={(e) => setDraft(e.target.value)}
                aria-label="تاريخ قفل الفترة"
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
                {current ? 'تحديث القفل' : 'تفعيل القفل'}
              </Button>
              {current && (
                <Button variant="danger" icon="lock_open" disabled={!canManage || saving} onClick={() => setConfirming('clear')}>
                  إلغاء القفل
                </Button>
              )}
            </div>
          </div>
        )}

        {confirming && (
          <div className="plk__confirm" role="alertdialog" aria-label="تأكيد قفل الفترة">
            <div className="plk__confirm-body">
              <span className="material-symbols-outlined" aria-hidden>warning</span>
              {confirming === 'set' ? (
                <span>
                  تأكيد قفل كل المعاملات المالية قبل <strong>{displayDate(draft)}</strong>؟ لن يتمكّن المستخدمون من
                  إنشاء أو تعديل أو عكس أي معاملة أقدم من هذا التاريخ إلا بصلاحية التجاوز.
                </span>
              ) : (
                <span>تأكيد إلغاء قفل الفترة؟ ستُتاح المعاملات القديمة للتعديل للجميع حسب صلاحياتهم المعتادة.</span>
              )}
            </div>
            <div className="plk__confirm-actions">
              <Button variant="secondary" onClick={() => setConfirming(null)} disabled={saving}>إلغاء</Button>
              <Button
                variant={confirming === 'set' ? 'primary' : 'danger'}
                busy={saving}
                onClick={() => persist(confirming === 'set' ? draft : '')}
              >
                تأكيد
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
