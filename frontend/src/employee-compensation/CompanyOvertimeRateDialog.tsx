/**
 * إعداد **الافتراضي العام لسعر ساعة الإضافي** — حوار واحد تستعمله شاشتان.
 *
 * ═══ لماذا مكوّن مشترك لا نسخة في كل صفحة ═══
 * الإعداد يُفتح من موضعين طبيعيين: قائمة الوحدة (حيث تُدار إعداداتها)، ومحرّر الشهر
 * (حيث يكتشف المستخدم أنه يريد تغييره). نسختان من الحوار كانتا ستفترقان أول مرة يُعدَّل
 * نصّ أو حدّ، فيرى المستخدم قاعدتين مختلفتين للشيء نفسه.
 *
 * ═══ ما لا يفعله هذا الحوار ═══
 * **لا يحسب سعرًا واحدًا بنفسه.** جدول الأنواع الثلاثة يصل من الخادم في كل قراءة وفي
 * استجابة الحفظ. معاملات السياسة (١٫٠٠ / ١٫٥٠ / ٢٫٠٠) لا تُكتب في هذا الملف ولا في أي
 * ملف React — مصدرها الوحيد `policy/companyOvertimePolicy.ts` (المتطلب ١٠).
 *
 * ولا يمسّ أي شهر محفوظ: الخادم لا يُصدر تحديثًا واحدًا على أي حسبة عند تغيير الافتراضي،
 * وهذا ما يقوله النصّ للمستخدم صراحةً بدل أن يتركه يخمّن.
 */
import { useEffect, useState } from 'react';
import { errorMessage } from '../api/client';
import { Button, Dialog, ErrorBanner, SkeletonRows } from '../components/explorer/ExplorerKit';
import { money } from '../config/modules';
import { useT } from '../lib/i18n';
import { compensationApi } from './api';
import { OVERTIME_LABEL_AR } from './labels';
import type { CompanyOvertimeSettings, OvertimeType } from './types';

/** الاختصارات المعروضة — **اقتراحات لا خيارات وحيدة**: الإدخال الحر يبقى متاحًا دائمًا. */
export const RATE_PRESETS = [3, 4, 5];

/** يقبل الرقم الموجب المحدود وحده — نفس شرط الخادم، معروضًا قبل إرسال الطلب. */
export function isValidRateText(text: string, min: number, max: number): boolean {
  const value = Number(String(text).trim());
  return text.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
}

export default function CompanyOvertimeRateDialog({
  onClose,
  onSaved,
  canEdit,
}: {
  onClose: () => void;
  /** يُستدعى بالإعداد بعد حفظه — تستعمله الشاشات لتحديث ما تعرضه بلا إعادة تحميل. */
  onSaved?: (settings: CompanyOvertimeSettings) => void;
  canEdit: boolean;
}) {
  const { t } = useT();
  const [settings, setSettings] = useState<CompanyOvertimeSettings | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    compensationApi
      .overtimeRateSettings()
      .then((res) => {
        if (cancelled) return;
        setSettings(res);
        setText(String(res.baseRate));
      })
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => { cancelled = true; };
  }, []);

  const valid = settings != null && isValidRateText(text, settings.minBaseRate, settings.maxBaseRate);

  const save = () => {
    if (!settings || !valid) return;
    setBusy(true);
    setError('');
    compensationApi
      .setOvertimeRateSettings(Number(text))
      .then((res) => {
        setSettings(res);
        onSaved?.(res);
        onClose();
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      icon="tune"
      title={t('ecmp.rate.settings_title')}
      subtitle={t('ecmp.rate.settings_subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="save" busy={busy} disabled={!canEdit || !valid} onClick={save}>
            {t('ecmp.rate.save_default')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}
      {!settings ? (
        <SkeletonRows rows={3} />
      ) : (
        <>
          {!settings.isConfigured && (
            <p className="ecmp-rate-hint">{t('ecmp.rate.not_configured', { amount: money(settings.fallbackBaseRate) })}</p>
          )}

          <div className="ecmp-rate-editor">
            <label className="ecmp-field">
              <span>{t('ecmp.rate.base_label')}</span>
              <input
                type="number" lang="en" inputMode="decimal" step="0.001"
                min={settings.minBaseRate} max={settings.maxBaseRate}
                value={text} disabled={!canEdit}
                onChange={(e) => setText(e.target.value)}
              />
            </label>
            <div className="ecmp-rate-presets" role="group" aria-label={t('ecmp.rate.presets')}>
              {RATE_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  className={`ecmp-rate-preset${Number(text) === preset ? ' is-active' : ''}`}
                  disabled={!canEdit}
                  onClick={() => setText(String(preset))}
                >
                  {money(preset)}
                </button>
              ))}
            </div>
          </div>

          {!valid && text.trim() !== '' && (
            <ErrorBanner>{t('ecmp.rate.invalid', { min: money(settings.minBaseRate), max: money(settings.maxBaseRate) })}</ErrorBanner>
          )}

          {/* معاينة الأسعار المشتقّة — من الخادم، ولا معامل مكتوب هنا. */}
          <RateTablePreview
            baseText={text}
            saved={settings}
          />

          <p className="ecmp-rate-note">{t('ecmp.rate.settings_note')}</p>
          <p className="ecmp-rate-meta">{t('ecmp.rate.policy_version', { version: settings.policyVersion })}</p>
        </>
      )}
    </Dialog>
  );
}

/**
 * جدول الأنواع الثلاثة.
 *
 * يعرض الجدول **المحفوظ** كما وصل من الخادم. حين يكتب المستخدم قيمة مختلفة قبل الحفظ
 * يُعرض تنبيه بأن المعاينة تخصّ القيمة المحفوظة — بدل أن يضرب هذا المكوّن السعر الجديد
 * في معاملات يكتبها بنفسه، فيصير في النظام مصدران للسياسة.
 */
function RateTablePreview({ baseText, saved }: { baseText: string; saved: CompanyOvertimeSettings }) {
  const { t } = useT();
  const isDirty = Number(baseText) !== saved.baseRate;
  const types = Object.keys(saved.rates) as OvertimeType[];

  return (
    <div className="ecmp-rate-table">
      <div className="ecmp-rate-table-head">
        {t('ecmp.rate.derived_for', { amount: money(saved.baseRate) })}
      </div>
      {types.map((type) => (
        <div className="ecmp-rate-row" key={type}>
          <span>{OVERTIME_LABEL_AR[type]}</span>
          <strong>{money(saved.rates[type])}</strong>
        </div>
      ))}
      {isDirty && <p className="ecmp-rate-hint">{t('ecmp.rate.preview_after_save')}</p>}
    </div>
  );
}
