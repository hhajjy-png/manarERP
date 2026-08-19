/**
 * حوار **الطباعة الجماعية** — اختيار موظف وسنة، لا أكثر.
 *
 * ═══ لماذا لا يعرض الحوار كل الموظفين ولا كل السنوات ═══
 * القوائم تُبنى من فهرس الطباعة (`printIndex`) لا من قائمة الموظفين ولا من مبدّل
 * السنة العام: موظف بلا كشف واحد لا يظهر إطلاقًا، وسنةٌ بلا كشف لهذا الموظف بالذات
 * لا تُعرض. فكل اختيار متاح في هذا الحوار اختيارٌ يُنتج مستندات فعلًا — بدل أن يصل
 * المستخدم إلى شاشة الطباعة فيجدها فارغة.
 *
 * ═══ ما لا يفعله هذا الحوار ═══
 * لا يجلب كشفًا، ولا يحسب مبلغًا، ولا يقرّر أي شهر له سند صرف. «طباعة» تنتقل إلى
 * شاشة الطباعة الجماعية وحدها؛ التجهيز والتنبيه بالأشهر التي لا سند لها يجريان هناك،
 * قبل بدء الطباعة.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { Button, Dialog, EmptyState, ErrorBanner, SkeletonRows } from '../components/explorer/ExplorerKit';
import { useT } from '../lib/i18n';
import { compensationApi } from './api';
import type { PrintIndexEmployee } from './types';

export default function BatchPrintDialog({ onClose }: { onClose: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();

  const [employees, setEmployees] = useState<PrintIndexEmployee[] | null>(null);
  const [error, setError] = useState('');
  const [employeeId, setEmployeeId] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  /** يُرفع مع النقرة الأولى ولا يُخفض: الانتقال يفكّ الحوار، فلا نقرة ثانية ممكنة. */
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    compensationApi
      .printIndex()
      .then((res) => !cancelled && setEmployees(res.employees))
      .catch((e) => !cancelled && setError(errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = useMemo(
    () => employees?.find((e) => e.id === employeeId) ?? null,
    [employees, employeeId],
  );

  /** سنوات الموظف المختار وحدها. بلا موظف ⇒ قائمة فارغة ومعطَّلة. */
  const years = selected?.years ?? [];

  const canPrint = employeeId !== null && year !== null && !starting;

  const start = () => {
    if (!canPrint) return;
    setStarting(true);
    navigate(`/employee-compensation/batch-print/${employeeId}/${year}`);
  };

  return (
    <Dialog
      icon="print"
      title={t('ecmp.batch.dialog_title')}
      subtitle={t('ecmp.batch.dialog_subtitle')}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>{t('action.cancel')}</Button>
          <Button variant="primary" icon="print" busy={starting} disabled={!canPrint} onClick={start}>
            {t('ecmp.batch.print')}
          </Button>
        </>
      }
    >
      {error && <ErrorBanner>{error}</ErrorBanner>}

      {employees === null ? (
        <SkeletonRows rows={2} withAvatar={false} />
      ) : employees.length === 0 ? (
        <EmptyState
          icon="print_disabled"
          title={t('ecmp.batch.no_employees')}
          message={t('ecmp.batch.no_employees_hint')}
        />
      ) : (
        <div className="ecmp-batch-fields">
          <label className="ecmp-field">
            <span>{t('ecmp.col.employee')}</span>
            <select
              value={employeeId ?? ''}
              onChange={(e) => {
                const next = e.target.value === '' ? null : Number(e.target.value);
                setEmployeeId(next);
                // السنة تتبع الموظف: إبقاء سنةٍ مختارة من موظف سابق كان قد يُنتج
                // اختيارًا لا كشوف له إطلاقًا.
                setYear(null);
              }}
            >
              <option value="">{t('ecmp.batch.pick_employee')}</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} — {e.code}
                </option>
              ))}
            </select>
          </label>

          <label className="ecmp-field">
            <span>{t('ecmp.year')}</span>
            <select
              value={year ?? ''}
              disabled={selected === null}
              onChange={(e) => setYear(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">
                {selected === null ? t('ecmp.batch.pick_employee_first') : t('ecmp.batch.pick_year')}
              </option>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <p className="ecmp-batch-note">{t('ecmp.batch.note')}</p>
        </div>
      )}
    </Dialog>
  );
}
