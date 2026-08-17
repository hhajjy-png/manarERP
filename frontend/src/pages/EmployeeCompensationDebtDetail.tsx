/**
 * تفاصيل مديونية + دفترها الزمني.
 *
 * الدفتر هو **مصدر الرصيد**، لا العكس: كل سطر هنا حركة حقيقية، ومجموعها مطروحًا من
 * الأصل هو الرصيد المعروض أعلى الصفحة. لذلك لا يوجد في هذه الشاشة حقل رصيد قابل
 * للتحرير — الرصيد نتيجة لا مدخل.
 *
 * حركات «حسبة شهرية» **لا تُعدَّل من هنا**: مصدرها حسبة الشهر، وتعديلها يقع بفتحها.
 * إتاحة تحريرها في مكانين كان سيجعل لكل حركة مصدرَي حقيقة متنافسين.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import {
  DEBT_SOURCE_LABEL_AR,
  DEBT_STATUS_LABEL_AR,
  DEBT_TYPE_LABEL_AR,
  monthNameAr,
} from '../employee-compensation/labels';
import type { DebtDetail, DebtPayment } from '../employee-compensation/types';
import {
  Button,
  Dialog,
  ErrorBanner,
  ExecutiveHeader,
  IdChip,
  MetricCard,
  SectionCard,
  SkeletonRows,
  StatusChip,
} from '../components/explorer/ExplorerKit';
import ConfirmModal from '../components/ConfirmModal';
import DateInput from '../components/DateInput';
import '../components/explorer/explorer-kit.css';
import './EmployeeCompensation.css';
import { kd as money } from '../employee-compensation/units';
import { formatDate, toLocalDateOnly } from '../lib/date';
import { useT } from '../lib/i18n';

interface PaymentFormState {
  id: number | null;
  amount: string;
  paymentDate: string;
  notes: string;
}

export default function EmployeeCompensationDebtDetail() {
  const { t } = useT();
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const debtId = Number(id);

  const [debt, setDebt] = useState<DebtDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<PaymentFormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<DebtPayment | null>(null);

  const load = useCallback(() => {
    if (!Number.isFinite(debtId)) return;
    setLoading(true);
    setError('');
    compensationApi
      .debt(debtId)
      .then(setDebt)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [debtId]);

  useEffect(load, [load]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const submitPayment = () =>
    run(async () => {
      if (!form) return;
      const body = { amount: Number(form.amount), paymentDate: form.paymentDate, notes: form.notes.trim() || null };
      const updated = form.id
        ? await compensationApi.updateManualPayment(form.id, body)
        : await compensationApi.addManualPayment(debtId, body);
      setDebt(updated);
      setForm(null);
    });

  const doDeletePayment = () =>
    run(async () => {
      if (!confirmDelete) return;
      setDebt(await compensationApi.deleteManualPayment(confirmDelete.id));
      setConfirmDelete(null);
    });

  if (loading) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <SectionCard><SkeletonRows rows={5} /></SectionCard>
      </div>
    );
  }

  if (!debt) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <ErrorBanner>{error || t('ecmp.debt.load_failed')}</ErrorBanner>
      </div>
    );
  }

  return (
    <div className="xpl-scope xpl-page ecmp-page">
      <ExecutiveHeader
        icon="receipt_long"
        title={debt.label}
        subtitle={debt.employee?.fullName ?? ''}
        onBack={() => navigate(`/employee-compensation/${debt.employeeId}/debts`)}
        chips={
          <>
            <IdChip icon="category">{DEBT_TYPE_LABEL_AR[debt.type]}</IdChip>
            {debt.employee && <IdChip icon="badge">{debt.employee.code}</IdChip>}
            <IdChip icon="event">{formatDate(debt.debtDate)}</IdChip>
            <StatusChip tone={debt.status === 'SETTLED' ? 'green' : 'orange'}>
              {DEBT_STATUS_LABEL_AR[debt.status]}
            </StatusChip>
          </>
        }
        aside={
          <Button
            variant="primary" icon="add_card" disabled={debt.status === 'SETTLED'}
            title={debt.status === 'SETTLED' ? t('ecmp.debt.settled_no_payment') : undefined}
            onClick={() => setForm({ id: null, amount: '', paymentDate: toLocalDateOnly(new Date()), notes: '' })}
          >
            {t('ecmp.debt.add_manual_payment')}
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="ecmp-metrics">
        <MetricCard icon="payments" tone="blue" label={t('ecmp.debt.col.original')} value={money(debt.originalAmount)} />
        <MetricCard icon="task_alt" tone="green" label={t('ecmp.debt.col.paid')} value={money(debt.paidAmount)} />
        <MetricCard icon="account_balance" tone="red" label={t('ecmp.debt.col.remaining')} value={money(debt.remainingAmount)} />
        <MetricCard icon="receipt" tone="indigo" label={t('ecmp.debt.metric.movements')} value={debt.payments.length} />
      </div>

      <SectionCard title={t('ecmp.debt.ledger_section')} icon="history" padded={false}>
        {debt.payments.length === 0 ? (
          <div className="xpl-card--pad" style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--xpl-muted)', fontSize: 12.5 }}>
            <span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18 }}>history</span>
            <span>{t('ecmp.debt.ledger_empty')}</span>
          </div>
        ) : (
          <div className="ecmp-table-wrap">
            <table className="ecmp-table">
              <thead>
                <tr>
                  <th>{t('ecmp.debt.col.payment_date')}</th>
                  <th>{t('ecmp.debt.col.source')}</th>
                  <th>{t('ecmp.debt.col.period')}</th>
                  <th className="ecmp-col-num">{t('ecmp.col.amount')}</th>
                  <th>{t('ecmp.col.notes')}</th>
                  <th aria-label={t('ecmp.col.actions')} />
                </tr>
              </thead>
              <tbody>
                {debt.payments.map((p) => {
                  const monthly = p.sourceType === 'MONTHLY_COMPENSATION';
                  return (
                    <tr key={p.id}>
                      <td>{formatDate(p.paymentDate)}</td>
                      <td>
                        <StatusChip tone={monthly ? 'blue' : 'neutral'}>{DEBT_SOURCE_LABEL_AR[p.sourceType]}</StatusChip>
                      </td>
                      <td>
                        {p.calculationPeriod
                          ? `${monthNameAr(p.calculationPeriod.month)} ${p.calculationPeriod.year}`
                          : '—'}
                      </td>
                      <td className="ecmp-money ecmp-amount">{money(p.amount)}</td>
                      <td>{p.notes ?? '—'}</td>
                      <td className="ecmp-row-action">
                        {monthly && p.calculationPeriod ? (
                          <Button
                            small variant="secondary" icon="open_in_new"
                            onClick={() =>
                              navigate(
                                `/employee-compensation/${debt.employeeId}/${p.calculationPeriod!.year}/${p.calculationPeriod!.month}`,
                              )
                            }
                          >
                            {t('ecmp.debt.open_calculation')}
                          </Button>
                        ) : (
                          <>
                            <Button
                              small variant="secondary" iconOnly icon="edit" aria-label={t('action.edit')}
                              onClick={() =>
                                setForm({
                                  id: p.id,
                                  amount: String(p.amount),
                                  paymentDate: toLocalDateOnly(new Date(p.paymentDate)),
                                  notes: p.notes ?? '',
                                })
                              }
                            />
                            <Button small variant="ghost" iconOnly icon="delete" aria-label={t('action.delete')} onClick={() => setConfirmDelete(p)} />
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="ecmp-scope-note">{t('ecmp.debt.ledger_note')}</p>
      </SectionCard>

      {debt.notes && (
        <SectionCard title={t('ecmp.col.notes')} icon="sticky_note_2">
          <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.65 }}>{debt.notes}</p>
        </SectionCard>
      )}

      {form && (
        <Dialog
          icon="add_card"
          title={form.id ? t('ecmp.debt.edit_payment_title') : t('ecmp.debt.add_manual_payment')}
          subtitle={t('ecmp.debt.remaining_hint', { amount: money(debt.remainingAmount) })}
          onClose={() => setForm(null)}
          footer={
            <>
              <Button onClick={() => setForm(null)}>{t('action.cancel')}</Button>
              <Button variant="primary" icon="save" busy={busy} disabled={!(Number(form.amount) > 0)} onClick={submitPayment}>
                {t('ecmp.action.save')}
              </Button>
            </>
          }
        >
          <div className="ecmp-reverse-form">
            <label className="ecmp-field">
              <span>{t('ecmp.col.amount')}</span>
              <input
                type="number" lang="en" min="0" step="0.001" inputMode="decimal" placeholder="0.000"
                value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </label>
            <div className="ecmp-field">
              <span>{t('ecmp.debt.col.payment_date')}</span>
              <DateInput title={t('ecmp.debt.col.payment_date')} value={form.paymentDate} onChange={(v) => setForm({ ...form, paymentDate: v })} />
            </div>
          </div>
          <label className="ecmp-field" style={{ marginTop: 12 }}>
            <span>{t('ecmp.col.notes')}</span>
            <input type="text" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          <p className="ecmp-reverse-note">{t('ecmp.debt.manual_note')}</p>
        </Dialog>
      )}

      {confirmDelete && (
        <ConfirmModal
          message={t('ecmp.debt.confirm_delete_payment', { amount: money(confirmDelete.amount) })}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={doDeletePayment}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
