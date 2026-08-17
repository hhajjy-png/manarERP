/**
 * سجل المديونيات والسلف — شاشة الموظف.
 *
 * ═══ السجل غير مرتبط بسنة ═══
 * لا مبدّل سنة هنا ولا مسار سنة: مديونية بدأت في ٢٠٢٦ وبقي منها رصيد تظهر كما هي في
 * ٢٠٢٧ (المتطلب ٢٢). النسخ إلى كل سنة كان سينتج سجلات متعدّدة لدَين واحد.
 *
 * ═══ الرصيد يصل محسوبًا ═══
 * `remainingAmount` و`paidAmount` و`status` تُشتقّ على الخادم من دفتر الحركات. لا معادلة
 * في هذا الملف، ولا رصيد يُخزَّن في أي حالة محلية.
 *
 * `xpl-scope` على الجذر إلزامي — حامل توكينات ألوان الأزرار.
 */
import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { errorMessage } from '../api/client';
import { compensationApi } from '../employee-compensation/api';
import { DEBT_STATUS_LABEL_AR, DEBT_TYPE_LABEL_AR } from '../employee-compensation/labels';
import type { Debt, DebtLedger, DebtType } from '../employee-compensation/types';
import {
  Button,
  Dialog,
  EmptyState,
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

interface DebtFormState {
  id: number | null;
  type: DebtType;
  label: string;
  originalAmount: string;
  debtDate: string;
  notes: string;
}

const emptyForm = (): DebtFormState => ({
  id: null,
  type: 'ADVANCE',
  label: '',
  originalAmount: '',
  debtDate: toLocalDateOnly(new Date()),
  notes: '',
});

export default function EmployeeCompensationDebts() {
  const { t } = useT();
  const navigate = useNavigate();
  const { employeeId } = useParams<{ employeeId: string }>();
  const employeeIdNum = Number(employeeId);

  const [ledger, setLedger] = useState<DebtLedger | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<DebtFormState | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Debt | null>(null);

  const load = useCallback(() => {
    if (!Number.isFinite(employeeIdNum)) return;
    setLoading(true);
    setError('');
    compensationApi
      .debts(employeeIdNum)
      .then(setLedger)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, [employeeIdNum]);

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

  const submitForm = () =>
    run(async () => {
      if (!form) return;
      const body = {
        type: form.type,
        label: form.label.trim(),
        originalAmount: Number(form.originalAmount),
        debtDate: form.debtDate,
        notes: form.notes.trim() || null,
      };
      if (form.id) await compensationApi.updateDebt(form.id, body);
      else await compensationApi.createDebt(employeeIdNum, body);
      setForm(null);
      load();
    });

  const doDelete = () =>
    run(async () => {
      if (!confirmDelete) return;
      // الخادم يرفض حذف سجل عليه حركات ويعيد رسالة صريحة — لا حذف صامت هنا ولا هناك.
      await compensationApi.deleteDebt(confirmDelete.id);
      setConfirmDelete(null);
      load();
    });

  if (loading) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <SectionCard><SkeletonRows rows={5} /></SectionCard>
      </div>
    );
  }

  if (!ledger) {
    return (
      <div className="xpl-scope xpl-page ecmp-page">
        <ErrorBanner>{error || t('ecmp.debt.load_failed')}</ErrorBanner>
        <Button icon="arrow_forward" onClick={() => navigate('/employee-compensation')}>{t('ecmp.action.back_to_list')}</Button>
      </div>
    );
  }

  const { employee, debts, summary } = ledger;
  const currentYear = new Date().getFullYear();

  return (
    <div className="xpl-scope xpl-page ecmp-page">
      <ExecutiveHeader
        icon="account_balance_wallet"
        title={t('ecmp.debt.title')}
        subtitle={employee.fullName}
        onBack={() => navigate(`/employee-compensation/${employeeIdNum}/${currentYear}`)}
        chips={
          <>
            <IdChip icon="badge">{employee.code}</IdChip>
            {employee.jobTitle && <IdChip icon="work">{employee.jobTitle}</IdChip>}
            <IdChip icon="running_with_errors" tone={summary.totalRemaining > 0 ? 'orange' : 'green'}>
              {t('ecmp.debt.open_chip', { count: summary.openDebts, amount: money(summary.totalRemaining) })}
            </IdChip>
          </>
        }
        aside={
          <Button variant="primary" icon="add" onClick={() => setForm(emptyForm())}>
            {t('ecmp.debt.add')}
          </Button>
        }
      />

      {error && <ErrorBanner>{error}</ErrorBanner>}

      <div className="ecmp-metrics">
        <MetricCard icon="receipt_long" tone="indigo" label={t('ecmp.debt.metric.total')} value={summary.totalDebts} />
        <MetricCard icon="pending_actions" tone="orange" label={t('ecmp.debt.metric.open')} value={summary.openDebts} />
        <MetricCard icon="payments" tone="blue" label={t('ecmp.debt.metric.original')} value={money(summary.totalOriginal)} />
        <MetricCard icon="task_alt" tone="green" label={t('ecmp.debt.metric.paid')} value={money(summary.totalPaid)} />
        <MetricCard icon="account_balance" tone="red" label={t('ecmp.debt.metric.remaining')} value={money(summary.totalRemaining)} />
      </div>

      <SectionCard title={t('ecmp.debt.section')} icon="list_alt" padded={false}>
        {debts.length === 0 ? (
          <EmptyState
            icon="account_balance_wallet"
            title={t('ecmp.debt.empty')}
            message={t('ecmp.debt.empty_hint')}
            action={<Button variant="primary" icon="add" onClick={() => setForm(emptyForm())}>{t('ecmp.debt.add')}</Button>}
          />
        ) : (
          <div className="ecmp-table-wrap">
            <table className="ecmp-table">
              <thead>
                <tr>
                  <th>{t('ecmp.col.type')}</th>
                  <th>{t('ecmp.debt.col.label')}</th>
                  <th>{t('ecmp.debt.col.date')}</th>
                  <th className="ecmp-col-num">{t('ecmp.debt.col.original')}</th>
                  <th className="ecmp-col-num">{t('ecmp.debt.col.paid')}</th>
                  <th className="ecmp-col-num">{t('ecmp.debt.col.remaining')}</th>
                  <th>{t('ecmp.col.emp_status')}</th>
                  <th aria-label={t('ecmp.col.actions')} />
                </tr>
              </thead>
              <tbody>
                {debts.map((d) => (
                  <tr key={d.id} onDoubleClick={() => navigate(`/employee-compensation/debts/${d.id}`)}>
                    <td>{DEBT_TYPE_LABEL_AR[d.type]}</td>
                    <td className="ecmp-name">{d.label}</td>
                    <td>{formatDate(d.debtDate)}</td>
                    <td className="ecmp-money">{money(d.originalAmount)}</td>
                    <td className="ecmp-money">{money(d.paidAmount)}</td>
                    <td className="ecmp-money ecmp-amount">{money(d.remainingAmount)}</td>
                    <td>
                      <StatusChip tone={d.status === 'SETTLED' ? 'green' : 'orange'}>
                        {DEBT_STATUS_LABEL_AR[d.status]}
                      </StatusChip>
                    </td>
                    <td className="ecmp-row-action">
                      <Button small variant="primary" icon="visibility" onClick={() => navigate(`/employee-compensation/debts/${d.id}`)}>
                        {t('ecmp.debt.open')}
                      </Button>
                      <Button
                        small variant="secondary" iconOnly icon="edit" aria-label={t('action.edit')}
                        onClick={() =>
                          setForm({
                            id: d.id,
                            type: d.type,
                            label: d.label,
                            originalAmount: String(d.originalAmount),
                            debtDate: toLocalDateOnly(new Date(d.debtDate)),
                            notes: d.notes ?? '',
                          })
                        }
                      />
                      <Button small variant="ghost" iconOnly icon="delete" aria-label={t('action.delete')} onClick={() => setConfirmDelete(d)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="ecmp-scope-note">{t('ecmp.debt.scope_note')}</p>
      </SectionCard>

      {form && (
        <Dialog
          icon={form.id ? 'edit' : 'add_card'}
          title={form.id ? t('ecmp.debt.edit_title') : t('ecmp.debt.add_title')}
          subtitle={employee.fullName}
          onClose={() => setForm(null)}
          footer={
            <>
              <Button onClick={() => setForm(null)}>{t('action.cancel')}</Button>
              <Button
                variant="primary" icon="save" busy={busy}
                disabled={!form.label.trim() || !(Number(form.originalAmount) > 0)}
                onClick={submitForm}
              >
                {t('ecmp.action.save')}
              </Button>
            </>
          }
        >
          <div className="ecmp-reverse-form">
            <label className="ecmp-field">
              <span>{t('ecmp.col.type')}</span>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as DebtType })}>
                {(Object.keys(DEBT_TYPE_LABEL_AR) as DebtType[]).map((k) => (
                  <option key={k} value={k}>{DEBT_TYPE_LABEL_AR[k]}</option>
                ))}
              </select>
            </label>
            <label className="ecmp-field">
              <span>{t('ecmp.debt.col.label')}</span>
              <input type="text" value={form.label} placeholder={t('ecmp.debt.ph.label')} onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
            <label className="ecmp-field">
              <span>{t('ecmp.debt.col.original')}</span>
              <input
                type="number" lang="en" min="0" step="0.001" inputMode="decimal" placeholder="0.000"
                value={form.originalAmount} onChange={(e) => setForm({ ...form, originalAmount: e.target.value })}
              />
            </label>
            <div className="ecmp-field">
              <span>{t('ecmp.debt.col.date')}</span>
              <DateInput title={t('ecmp.debt.col.date')} value={form.debtDate} onChange={(v) => setForm({ ...form, debtDate: v })} />
            </div>
          </div>
          <label className="ecmp-field" style={{ marginTop: 12 }}>
            <span>{t('ecmp.col.notes')}</span>
            <textarea className="ecmp-notes" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {form.id && <p className="ecmp-reverse-note">{t('ecmp.debt.edit_note')}</p>}
        </Dialog>
      )}

      {confirmDelete && (
        <ConfirmModal
          message={t('ecmp.debt.confirm_delete', { label: confirmDelete.label })}
          confirmLabel={t('action.delete')}
          variant="danger"
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
