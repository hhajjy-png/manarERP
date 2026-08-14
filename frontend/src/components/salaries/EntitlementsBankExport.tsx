import { useEffect, useMemo, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  approveEntitlementsStatement,
  getEntitlementsMonth,
  getEntitlementsPreview,
  getEntitlementsProfiles,
  unapproveEntitlementsStatement,
  type EntitlementCandidateRow,
  type EntitlementEligibility,
  type EntitlementsMonth,
} from '../../api/entitlementsBankExport';
import type { ExportProfileInfo, PayrollBankExportResult } from '../../api/payrollBankExport';
import { downloadBankExportXls, bankExportFileName } from '../../utils/payrollBankExportXls';
import { downloadBlob } from '../../utils/exportUtils';
import { ARABIC_MONTHS, billingYearOptions } from '../../utils/dateUtils';
import { roundMoney } from '../../lib/money';
import { MoneyCell, MoneyText } from '../../config/modules';
import { fcMoneyHeader } from '../financial/financialLabels';
import { useT } from '../../lib/i18n';
import {
  SectionCard, Button, ErrorBanner, EmptyState, SkeletonRows, StatusChip,
} from '../explorer/ExplorerKit';

// ─────────────────────────────────────────────────────────────────────────
//  Monthly Entitlements Bank Export — generate a bank-ready transfer file for the
//  amounts an employee is owed ON TOP OF the basic salary, taken from the APPROVED
//  monthly Employee Compensation calculation:
//
//      transfer = netAmount − basicSalarySnapshot      (both from the SAME calculation)
//
//  Completely independent of the salary bank statement: separate month state, separate
//  approval, separate file. Approving or exporting one never touches the other, never
//  marks anyone paid in the other, and the two amounts are never merged into one file.
//
//  The produced workbook is intentionally IDENTICAL in layout to the salary file (same
//  backend engine, same sheets/columns/Bank Codes) so the bank ingests it the same way.
//  Only the file name differs: NBK_Entitlements_<year>_<MM>.xls.
//
//  Approval freezes the numbers. Employee Compensation stays editable after ITS approval,
//  so an approved bank statement reads from its own frozen snapshot — a later edit to the
//  calculation can never silently change a statement that already went to the bank.
//
//  Mirrors PayrollBankExport.tsx for the native-Excel generation path (Electron COM,
//  never a silent SheetJS fallback). Arabic / RTL / dark.
//
//  ── Presentation notes (UI Polish Pack) ──
//  Money is never rendered as bare Arabic-context text: table cells use `MoneyCell`
//  (number only, `.money-cell` LTR isolation) with the currency carried by the column
//  header via `fcMoneyHeader`, and the summary uses `MoneyText` (number + KWD, also
//  LTR-isolated) — the project's existing answer to BiDi reordering "200.000 KWD" into
//  "KWD 200.000". All styling lives in `.ebx-*` in Salaries.css; nothing here changes
//  behaviour, amounts, eligibility, approval, or the export rule.
// ─────────────────────────────────────────────────────────────────────────

const DEFAULT_PROFILE = 'nbk_entitlements_xls';
const FILE_PREFIX = 'NBK_Entitlements';

const ELIGIBILITY_TONE: Record<EntitlementEligibility, 'green' | 'orange' | 'red' | 'neutral'> = {
  READY: 'green',
  NOT_APPROVED: 'orange',
  NO_CALCULATION: 'neutral',
  NO_AMOUNT: 'neutral',
  BANK_DATA_INCOMPLETE: 'red',
};
const ELIGIBILITY_ICON: Record<EntitlementEligibility, string> = {
  READY: 'check_circle',
  NOT_APPROVED: 'pending',
  NO_CALCULATION: 'remove',
  NO_AMOUNT: 'money_off',
  BANK_DATA_INCOMPLETE: 'account_balance',
};
const ELIGIBILITY_KEY: Record<EntitlementEligibility, string> = {
  READY: 'entitlements_bank.state.ready',
  NOT_APPROVED: 'entitlements_bank.state.not_approved',
  NO_CALCULATION: 'entitlements_bank.state.no_calculation',
  NO_AMOUNT: 'entitlements_bank.state.no_amount',
  BANK_DATA_INCOMPLETE: 'entitlements_bank.state.bank_incomplete',
};

/**
 * الحالات التي تشرحها الشريحة وحدها ⇒ لا يُكرَّر نصّها أسفلها. يبقى السبب المفصَّل
 * معروضًا حين يحمل معلومة إضافية فعلية (أي حقل بنكي بالضبط هو الناقص).
 */
const SELF_EXPLANATORY: ReadonlySet<EntitlementEligibility> = new Set<EntitlementEligibility>([
  'READY', 'NO_CALCULATION', 'NOT_APPROVED', 'NO_AMOUNT',
]);

interface Props {
  /** Approving / unapproving the statement requires `employeeCompensation.approve`. */
  canApprove: boolean;
}

export default function EntitlementsBankExport({ canApprove }: Props) {
  const { t } = useT();
  const now = new Date();
  const [profiles, setProfiles] = useState<ExportProfileInfo[]>([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());

  const [data, setData] = useState<EntitlementsMonth | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // حارس ضد الاستجابات المتأخرة — نفس نمط reqIdRef في صفحة الرواتب: تبديل الشهر بسرعة
  // يُطلق طلبات متتالية وترتيب وصولها غير مضمون، ولا يُسمح لطلب أقدم بالكتابة فوق أحدث.
  const reqRef = useRef(0);

  useEffect(() => {
    getEntitlementsProfiles().then(setProfiles).catch(() => {});
  }, []);

  async function load() {
    const reqId = ++reqRef.current;
    setLoading(true);
    setError('');
    try {
      const res = await getEntitlementsMonth(month, year);
      if (reqId !== reqRef.current) return; // استجابة تجاوزها طلب أحدث — تُهمَل
      setData(res);
      // التحديد لا يعبر الفترات: موظف مُحدَّد في شهر لا يبقى محدَّدًا في شهر آخر.
      setSelectedIds(new Set());
    } catch (e) {
      if (reqId !== reqRef.current) return;
      setData(null);
      setSelectedIds(new Set());
      setError(errorMessage(e));
    } finally {
      if (reqId === reqRef.current) setLoading(false);
    }
  }

  useEffect(() => {
    setMessage('');
    load().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [month, year]);

  const statement = data?.statement ?? null;
  const approved = statement != null;
  const rows = data?.rows ?? [];
  const readyRows = useMemo(() => rows.filter((r) => r.eligibility === 'READY'), [rows]);

  const selectedRows = useMemo(
    () => readyRows.filter((r) => selectedIds.has(r.employeeId)),
    [readyRows, selectedIds],
  );
  const selectedTotal = useMemo(
    () => roundMoney(selectedRows.reduce((s, r) => s + (r.transferAmount ?? 0), 0)),
    [selectedRows],
  );

  const allReadySelected = readyRows.length > 0 && selectedRows.length === readyRows.length;
  const someReadySelected = selectedRows.length > 0 && !allReadySelected;
  /** عمود التحديد يظهر ما دام الكشف غير معتمد ولدى المستخدم صلاحية الاعتماد. */
  const selectable = canApprove && !approved;

  function toggleRow(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds(() => (allReadySelected ? new Set() : new Set(readyRows.map((r) => r.employeeId))));
  }

  async function runAction(fn: () => Promise<string>) {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const text = await fn();
      await load();
      setMessage(text);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function approveStatement() {
    // الاعتماد يشمل الموظفين المحددين فقط — ولا اعتماد بلا تحديد.
    if (selectedRows.length === 0) {
      setMessage('');
      setError(t('entitlements_bank.error.none_selected'));
      return;
    }
    const ids = selectedRows.map((r) => r.employeeId);
    runAction(async () => {
      const s = await approveEntitlementsStatement(month, year, ids, profile);
      return t('entitlements_bank.msg.approved', { count: s.employeeCount });
    });
  }

  function unapproveStatement() {
    runAction(async () => {
      await unapproveEntitlementsStatement(month, year);
      return t('entitlements_bank.msg.unapproved');
    });
  }

  /**
   * Fetches the bank rows from the APPROVED snapshot, then writes the .xls.
   * Native path (Electron): Microsoft Excel COM automation — the same bridge the salary
   * export uses, proven to avoid the Protected View / Office File Validation warning that
   * SheetJS's BIFF8 writer triggers. On failure, surface the error — NEVER silently fall
   * back to SheetJS and hand the user a file already known to trigger that warning.
   */
  async function generate() {
    if (!approved || generating) return;
    setGenerating(true);
    setError('');
    try {
      const result: PayrollBankExportResult = await getEntitlementsPreview(profile, month, year);
      if (!result.valid) {
        setError(result.errors[0]?.message || t('entitlements_bank.error.generation_failed'));
        return;
      }

      if (window.manar?.generateNbkSalaryXls) {
        const res = await window.manar.generateNbkSalaryXls(result.sheets);
        if (!res.success || !res.bytes) {
          setError(res.error || t('entitlements_bank.error.generation_failed'));
          return;
        }
        // IPC bytes may be typed over ArrayBufferLike — normalize to a plain
        // ArrayBuffer-backed Uint8Array first (same fix as the salary export).
        const bytes = new Uint8Array(res.bytes);
        const blob = new Blob([bytes], { type: 'application/vnd.ms-excel' });
        downloadBlob(blob, bankExportFileName(result, FILE_PREFIX));
        return;
      }

      // Dev/browser fallback only — no Electron bridge available at all.
      downloadBankExportXls(result, FILE_PREFIX);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="ebx-stack">
      <SectionCard title={t('entitlements_bank.title')} icon="savings">
        {/* وصف مختصر بسطر واحد؛ الشرح المفصَّل في tooltip أصلي على الأيقونة —
            نفس نمط `title` المعتمد في المشروع، بلا Component جديد. */}
        <p className="ebx-help">
          <span className="material-symbols-outlined" title={t('entitlements_bank.help_detail')} aria-hidden="true">info</span>
          <span>{t('entitlements_bank.help_short')}</span>
        </p>

        <div className="ebx-filters">
          <div className="xpl-field ebx-f-profile">
            <label>{t('entitlements_bank.field.bank_file')}</label>
            <select className="xpl-select" value={profile} onChange={(e) => setProfile(e.target.value)} aria-label={t('entitlements_bank.field.bank_file')}>
              {profiles.length === 0 && <option value={DEFAULT_PROFILE}>{t('entitlements_bank.profile_fallback')}</option>}
              {profiles.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </div>
          <div className="xpl-field ebx-f-month">
            <label>{t('entitlements_bank.field.month')}</label>
            <select className="xpl-select" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label={t('entitlements_bank.field.month')}>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field ebx-f-year">
            <label>{t('entitlements_bank.field.year')}</label>
            <select className="xpl-select" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t('entitlements_bank.field.year')}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="ebx-f-action">
            <Button variant="ghost" icon="refresh" busy={loading} onClick={() => load()}>{t('action.refresh')}</Button>
          </div>
        </div>
      </SectionCard>

      {error && <ErrorBanner>{error}</ErrorBanner>}
      {message && (
        <div className="ebx-alert ebx-alert--ok" role="status">
          <span className="material-symbols-outlined" aria-hidden="true">check_circle</span>
          <span>{message}</span>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
      ) : (
        <>
          {/* Approval state — compact alert. The export rule itself is unchanged: no
              approved statement ⇒ no file. */}
          {approved ? (
            <div className="ebx-alert ebx-alert--ok" role="status">
              <span className="material-symbols-outlined" aria-hidden="true">verified</span>
              <span>
                {t('entitlements_bank.approved_banner', { count: statement!.employeeCount })}
                {' '}
                <span className="ebx-alert-note">{t('entitlements_bank.approved_frozen_note')}</span>
              </span>
            </div>
          ) : (
            <div className="ebx-alert ebx-alert--warn" role="status">
              <span className="material-symbols-outlined" aria-hidden="true">info</span>
              <span>{t('entitlements_bank.not_approved_banner')}</span>
            </div>
          )}

          {/* Summary + actions — approve first (primary), then export. */}
          <div className="ebx-summary">
            <div className="ebx-stat">
              <span className="ebx-stat-label">{t('entitlements_bank.total.selected_count')}</span>
              <span className="ebx-stat-value">
                {(approved ? statement!.employeeCount : selectedRows.length).toLocaleString('en-US')}
              </span>
            </div>
            <span className="ebx-sep" aria-hidden="true" />
            <div className="ebx-stat ebx-stat--amount">
              <span className="ebx-stat-label">{t('entitlements_bank.total.transfer_total')}</span>
              <span className="ebx-stat-value"><MoneyText value={approved ? statement!.totalAmount : selectedTotal} /></span>
            </div>

            <div className="ebx-actions">
              {canApprove && !approved && (
                <Button variant="primary" icon="verified" busy={busy} onClick={approveStatement} disabled={busy || selectedRows.length === 0}>
                  {t('entitlements_bank.approve_btn')}
                </Button>
              )}
              {canApprove && approved && (
                <Button variant="ghost" icon="lock_open" busy={busy} onClick={unapproveStatement} disabled={busy}>
                  {t('entitlements_bank.unapprove_btn')}
                </Button>
              )}
              {/* قبل الاعتماد: ثانوي ومعطَّل — لا يسبق الاعتماد بصريًا.
                  بعد الاعتماد: هو الإجراء الرئيسي. */}
              <Button
                variant={approved ? 'primary' : 'secondary'}
                icon="download"
                busy={generating}
                onClick={generate}
                disabled={!approved || generating}
              >
                {t('entitlements_bank.export_btn')}
              </Button>
            </div>
          </div>

          {/* Employees table */}
          <SectionCard title={t('entitlements_bank.table_title')} icon="groups">
            {rows.length === 0 ? (
              <EmptyState icon="savings" tone="neutral" title={t('entitlements_bank.empty.title')} message={t('entitlements_bank.empty.message')} />
            ) : (
              <div className="xpl-table-wrap">
                <table className="xpl-table ebx-table">
                  <thead>
                    <tr>
                      {selectable && (
                        <th className="ebx-col-check">
                          <input
                            className="ebx-check"
                            type="checkbox"
                            checked={allReadySelected}
                            ref={(el) => { if (el) el.indeterminate = someReadySelected; }}
                            onChange={toggleSelectAll}
                            disabled={readyRows.length === 0}
                            aria-label={t('entitlements_bank.a11y.select_all')}
                          />
                        </th>
                      )}
                      <th>{t('col.sal.employee')}</th>
                      <th className="ebx-col-code">{t('col.code')}</th>
                      <th className="ebx-col-money">{fcMoneyHeader(t('entitlements_bank.col.net_amount'))}</th>
                      <th className="ebx-col-money">{fcMoneyHeader(t('entitlements_bank.col.basic_salary'))}</th>
                      <th className="ebx-col-money ebx-col-transfer">{fcMoneyHeader(t('entitlements_bank.col.transfer_amount'))}</th>
                      <th className="ebx-col-calc">{t('entitlements_bank.col.calc_status')}</th>
                      <th className="ebx-col-state">{t('entitlements_bank.col.state')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <Row
                        key={r.employeeId}
                        row={r}
                        selectable={selectable}
                        selected={selectedIds.has(r.employeeId)}
                        onToggle={() => toggleRow(r.employeeId)}
                        inApprovedStatement={approved && (data?.statementLines.some((l) => l.employeeId === r.employeeId) ?? false)}
                        t={t}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Frozen statement lines — what the bank file actually contains. */}
          {approved && (data?.statementLines.length ?? 0) > 0 && (
            <SectionCard title={t('entitlements_bank.statement_table_title')} icon="lock">
              <div className="xpl-table-wrap">
                <table className="xpl-table ebx-table">
                  <thead>
                    <tr>
                      <th className="ebx-col-serial">#</th>
                      <th>{t('col.sal.employee')}</th>
                      <th className="ebx-col-code">{t('col.code')}</th>
                      <th className="ebx-col-money">{fcMoneyHeader(t('entitlements_bank.col.net_amount'))}</th>
                      <th className="ebx-col-money">{fcMoneyHeader(t('entitlements_bank.col.basic_salary'))}</th>
                      <th className="ebx-col-money ebx-col-transfer">{fcMoneyHeader(t('entitlements_bank.col.transfer_amount'))}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data!.statementLines.map((l, i) => (
                      <tr key={l.employeeId}>
                        <td className="ebx-col-serial">{i + 1}</td>
                        <td><span className="ebx-emp-name">{l.employeeName}</span></td>
                        <td className="ebx-col-code xpl-mono">{l.employeeCode}</td>
                        <td className="ebx-col-money"><MoneyCell value={l.netAmount} /></td>
                        <td className="ebx-col-money"><MoneyCell value={l.basicSalary} /></td>
                        <td className="ebx-col-money ebx-col-transfer"><MoneyCell value={l.transferAmount} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

function Row({
  row, selectable, selected, onToggle, inApprovedStatement, t,
}: {
  row: EntitlementCandidateRow;
  selectable: boolean;
  selected: boolean;
  onToggle: () => void;
  inApprovedStatement: boolean;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const ready = row.eligibility === 'READY';
  // السبب يُعرض فقط حين يضيف معلومة لا تحملها الشريحة (أي حقل بنكي ناقص بالضبط).
  const reasons = SELF_EXPLANATORY.has(row.eligibility) ? [] : row.blockers;

  return (
    <tr className={`${ready ? 'ebx-row--ready' : 'ebx-row--muted'}${selected ? ' ebx-row--picked' : ''}`}>
      {selectable && (
        <td className="ebx-col-check">
          {/* الموظف غير المؤهل يبقى ظاهرًا وصندوقه معطَّل — لا يختفي، ولا يمكن ضمّه. */}
          <input
            className="ebx-check"
            type="checkbox"
            checked={ready && selected}
            onChange={onToggle}
            disabled={!ready}
            aria-label={t('entitlements_bank.a11y.select_row', { name: row.employeeName })}
            title={ready ? undefined : row.blockers.join(' · ') || t(ELIGIBILITY_KEY[row.eligibility])}
          />
        </td>
      )}
      <td>
        <span className="ebx-emp-name">{row.employeeName}</span>
        {inApprovedStatement && (
          <span style={{ marginInlineStart: 8, verticalAlign: 'middle' }}>
            <StatusChip tone="green" icon="lock">{t('entitlements_bank.chip.in_statement')}</StatusChip>
          </span>
        )}
      </td>
      <td className="ebx-col-code xpl-mono">{row.employeeCode}</td>
      <td className="ebx-col-money">{row.netAmount == null ? '—' : <MoneyCell value={row.netAmount} />}</td>
      <td className="ebx-col-money">{row.basicSalary == null ? '—' : <MoneyCell value={row.basicSalary} />}</td>
      <td className="ebx-col-money ebx-col-transfer">
        {row.transferAmount == null ? '—' : <MoneyCell value={row.transferAmount} />}
      </td>
      <td className="ebx-col-calc">
        {row.calculationStatus
          ? <StatusChip tone={row.calculationStatus === 'APPROVED' ? 'green' : 'orange'}>
              {t(row.calculationStatus === 'APPROVED' ? 'payroll.status.approved' : 'payroll.status.draft')}
            </StatusChip>
          : '—'}
      </td>
      <td className="ebx-col-state">
        <div className="ebx-state">
          <StatusChip tone={ELIGIBILITY_TONE[row.eligibility]} icon={ELIGIBILITY_ICON[row.eligibility]}>
            {t(ELIGIBILITY_KEY[row.eligibility])}
          </StatusChip>
          {reasons.length > 0 && (
            <div className="ebx-reason">
              {reasons.map((b, i) => <div key={i}>{b}</div>)}
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}
