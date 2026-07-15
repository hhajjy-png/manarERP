import { useCallback, useEffect, useMemo, useState } from 'react';
import { printCurrentView } from '../utils/print';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { tafqeetKWD } from '../lib/tafqeet';
import { formatDate, todayDateOnly, formatDisplayDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { PageMeta } from '../components/DataTable';
import DateInput from '../components/DateInput';
import ConfirmModal from '../components/ConfirmModal';
import ForceDeleteChequeModal from '../components/ForceDeleteChequeModal';
import ChequeCalibrator from '../components/ChequeCalibrator';
import gulfBankImg from '../assets/cheakv1.png';
import {
  DEFAULT_TEMPLATE,
  cloneDefaultTemplate,
  fmtChequeAmount,
  templateFromSettings,
  REPRINT_REASONS,
  REPRINT_REASON_LABELS,
} from '../utils/chequeTemplate';
import type { ChequeTemplate, ChequePrintLogRow, ReprintReason } from '../utils/chequeTemplate';
import {
  ExecutiveHeader,
  IdChip,
  HeroMetric,
  MetricCard,
  StatusChip,
  SearchBox,
  FilterChip,
  SectionCard,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Drawer,
  DrawerSection,
  DrawerField,
  DrawerQuickActions,
  Dialog,
  DialogSection,
  Button,
  type QuickAction,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './Cheques.css';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { useFinancialPeriod } from '../context/FinancialPeriodContext';
import PeriodControl from '../components/period/PeriodControl';
import { periodToReportParams } from '../lib/financialPeriod';
import { moneyParts, MoneyText } from '../config/modules';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Cheque {
  id: number;
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  description: string | null;
  bankName: string;
  status: string;
  printedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  paymentVoucherNumber: string | null;
  createdAt: string;
}

interface ChequeStats { total: number; draft: number; printed: number; cancelled: number; }

interface FormState {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string;
  currency: string;
  description: string;
  bankName: string;
  notes: string;
}

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultForm(): FormState {
  const today = todayDateOnly();
  return { chequeNumber: '', chequeDate: today, beneficiaryName: '', amount: '', currency: 'KWD', description: '', bankName: 'بنك الخليج', notes: '' };
}

const KUWAITI_BANKS = [
  'بنك الكويت الوطني', 'بيت التمويل الكويتي', 'بنك الخليج', 'البنك التجاري الكويتي', 'بنك برقان',
  'بنك بوبيان', 'بنك وربة', 'البنك الأهلي الكويتي', 'البنك الأهلي المتحد', 'بنك الكويت الدولي',
] as const;

const STATUS_META: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'cheque.status.draft', tone: 'orange', icon: 'edit_note' },
  PRINTED: { key: 'cheque.status.printed', tone: 'green', icon: 'print' },
  CANCELLED: { key: 'cheque.status.cancelled', tone: 'red', icon: 'block' },
};
function chequeChip(status: string, t: (k: string) => string) {
  const m = STATUS_META[status] ?? { key: status, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
}

// تاريخ الشيك المطبوع. كان ISO («2026-01-31») — صيغة داخلية لا تُعرض للمستخدم.
// صار DD/MM/YYYY عبر المُنسّق المشترك (string-safe: لا يُبنى Date على تاريخ فقط، فلا
// انزياح يوم). **عدد المحارف نفسه (10)**، فلا يتغيّر عرض النصّ ولا تنزاح هندسة الشيك.
function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  return formatDisplayDate(v);
}

// الرمز من الإعداد (KWD / د.ك) لا من ثابت في الشيفرة؛ الأرقام غربية دائمًا.
function fmtAmount(v: number | string, currency = moneyParts(0).currency): string {
  return formatNumber(v) + ' ' + currency;
}

/** Arabic label for a stored reprint-reason key; falls back to the raw value. */
function reprintReasonLabel(reason: string): string {
  return (REPRINT_REASON_LABELS as Record<string, string>)[reason] ?? reason;
}

// ── ChequePrintOutput (print engine — UNCHANGED) ───────────────────────────────

const CHEQUE_PAGE_OFFSET_X_MM: number = 0;
const CHEQUE_PAGE_OFFSET_Y_MM: number = 40;

interface PreviewData {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string | number;
  currency: string;
  description: string | null;
  bankName: string;
}

function ChequePrintOutput({ data, template }: { data: PreviewData; template: ChequeTemplate }) {
  const raw = Number(data.amount ?? 0);
  const amount = isNaN(raw) ? 0 : raw;
  const d = new Date(data.chequeDate);
  const chequeDate =
    !data.chequeDate || isNaN(d.getTime())
      ? ''
      : `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;

  function fieldStyle(key: keyof ChequeTemplate): React.CSSProperties {
    const cfg = template[key];
    return {
      position: 'absolute',
      top: `${cfg.top}%`,
      left: `${cfg.left}%`,
      width: `${cfg.width}%`,
      fontSize: `${cfg.fontSize}pt`,
      fontFamily: cfg.fontFamily === 'monospace' ? 'monospace, monospace' : `'${cfg.fontFamily}', Arial, sans-serif`,
      fontWeight: cfg.fontWeight,
      fontStyle: cfg.fontStyle,
      textAlign: cfg.textAlign,
      color: cfg.color,
      lineHeight: 1.55,
      boxSizing: 'border-box',
    };
  }

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '700 / 272', fontFamily: '"IBM Plex Sans Arabic", "Cairo", "Tajawal", Arial, sans-serif', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', inset: 0 }}>
        <img src={gulfBankImg} className="cheque-bg-img" alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'fill' }} />
        <div style={fieldStyle('beneficiary')}>{data.beneficiaryName}</div>
        <div style={{ ...fieldStyle('date'), letterSpacing: 0.5 }}>{chequeDate}</div>
        <div style={{ ...fieldStyle('tafqeet'), direction: 'rtl' }}>{amount > 0 ? tafqeetKWD(amount) : ''}</div>
        <div style={{ ...fieldStyle('numeric'), letterSpacing: 0.5 }}>{amount > 0 ? fmtChequeAmount(amount) : ''}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Cheques() {
  const { hasPermission, user } = useAuth();
  const { t } = useT();
  const { period } = useFinancialPeriod();
  const navigate = useNavigate();

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<ChequeStats>({ total: 0, draft: 0, printed: 0, cancelled: 0 });
  const [form, setForm] = useState<FormState>(defaultForm());
  const [editId, setEditId] = useState<number | null>(null);
  const [printTarget, setPrintTarget] = useState<Cheque | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pvLoading, setPvLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [showCalibrator, setShowCalibrator] = useState(false);
  const [allTemplates, setAllTemplates] = useState<Record<string, ChequeTemplate>>({});
  const [busy, setBusy] = useState(false);
  const [restoringDefault, setRestoringDefault] = useState(false);
  const [cancelConfirmCheque, setCancelConfirmCheque] = useState<Cheque | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewing, setViewing] = useState<Cheque | null>(null);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintReason, setReprintReason] = useState<ReprintReason | ''>('');
  const [reprintNote, setReprintNote] = useState('');
  const [reprintBusy, setReprintBusy] = useState(false);
  const [printLogs, setPrintLogs] = useState<ChequePrintLogRow[]>([]);
  const [printLogsLoading, setPrintLogsLoading] = useState(false);
  const canCreate = hasPermission('cheques.create');
  const canUpdate = hasPermission('cheques.update');
  const canPrint = hasPermission('cheques.print');
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const canCancel = hasPermission('cheques.cancel');
  const canCalibrate = hasPermission('settings.update');

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async (p = 1) => {
    setLoading(true);
    // الفترة العالمية على chequeDate — القائمة والإحصاء يتشاركان نفس النطاق.
    const { from, to } = periodToReportParams(period);
    const dateParams = { from, to };
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/cheques', { params: { page: p, pageSize: 20, search: historySearch || undefined, status: historyStatus || undefined, ...dateParams } }),
        api.get('/cheques/stats', { params: dateParams }),
      ]);
      setCheques(listRes.data.data.data ?? []);
      setMeta(listRes.data.data.meta ?? null);
      setStats(statsRes.data.data ?? { total: 0, draft: 0, printed: 0, cancelled: 0 });
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [historySearch, historyStatus, period.fromDate, period.toDate, period.isAllPeriods]);

  useEffect(() => { loadData(1); }, [loadData]);

  useEffect(() => {
    if (!success) return;
    const id = setTimeout(() => setSuccess(''), 3500);
    return () => clearTimeout(id);
  }, [success]);

  // ── Load cheque templates from Settings on mount ───────────────────────────

  useEffect(() => {
    api.get('/settings').then((res) => {
      const settings: { key: string; value: string }[] = res.data?.data?.settings ?? [];
      const result: Record<string, ChequeTemplate> = {};
      for (const bank of KUWAITI_BANKS) result[bank] = templateFromSettings(settings, bank);
      setAllTemplates(result);
    }).catch(() => {
      const result: Record<string, ChequeTemplate> = {};
      for (const bank of KUWAITI_BANKS) result[bank] = cloneDefaultTemplate();
      setAllTemplates(result);
    });
  }, []);

  const currentTemplate: ChequeTemplate = allTemplates[form.bankName] ?? DEFAULT_TEMPLATE;

  // ── Form handlers ─────────────────────────────────────────────────────────

  function field(name: keyof FormState, value: string) { setForm((f) => ({ ...f, [name]: value })); }

  function resetForm() {
    setForm(defaultForm());
    setEditId(null);
    setPrintTarget(null);
    setFormError('');
    setSuccess('');
  }

  function loadChequeIntoForm(cheque: Cheque) {
    setForm({
      chequeNumber: cheque.chequeNumber,
      chequeDate: fmtDate(cheque.chequeDate),
      beneficiaryName: cheque.beneficiaryName,
      amount: String(cheque.amount),
      currency: cheque.currency,
      description: cheque.description ?? '',
      bankName: cheque.bankName,
      notes: cheque.notes ?? '',
    });
    setEditId(cheque.id);
    setPrintTarget(cheque);
    setFormError('');
    setSuccess('');
  }

  function validateForm(): string {
    if (!form.chequeNumber.trim()) return t('error.cheque.number_required');
    if (!form.chequeDate) return t('error.cheque.date_required');
    if (!form.beneficiaryName.trim()) return t('error.cheque.beneficiary_required');
    if (!form.amount || Number(form.amount) <= 0) return t('error.cheque.amount_required');
    if (!form.bankName.trim()) return t('error.cheque.bank_required');
    if (!form.currency.trim()) return t('error.cheque.currency_required');
    return '';
  }

  // ── Save (returns saved cheque or null) ────────────────────────────────────

  async function handleSave(): Promise<Cheque | null> {
    const err = validateForm();
    if (err) { setFormError(err); return null; }
    setFormError('');
    setSaving(true);
    try {
      const payload = {
        chequeNumber: form.chequeNumber.trim(),
        chequeDate: form.chequeDate,
        beneficiaryName: form.beneficiaryName.trim(),
        amount: Number(form.amount),
        currency: form.currency.trim(),
        description: form.description.trim() || null,
        bankName: form.bankName.trim(),
        notes: form.notes.trim() || null,
      };
      let saved: Cheque;
      if (editId) {
        const res = await api.put(`/cheques/${editId}`, payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.updated'));
      } else {
        const res = await api.post('/cheques', payload);
        saved = res.data.data;
        setSuccess(t('msg.cheque.saved'));
      }
      setEditId(saved.id);
      setPrintTarget(saved);
      await loadData(page);
      return saved;
    } catch (e) {
      setFormError(errorMessage(e));
      return null;
    } finally {
      setSaving(false);
    }
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  async function handlePrint() {
    if (!printTarget) {
      const err = validateForm();
      if (err) { setFormError(err); return; }
      setFormError('');
      setSaving(true);
      try {
        const payload = {
          chequeNumber: form.chequeNumber.trim(),
          chequeDate: form.chequeDate,
          beneficiaryName: form.beneficiaryName.trim(),
          amount: Number(form.amount),
          currency: form.currency.trim(),
          description: form.description.trim() || null,
          bankName: form.bankName.trim(),
          notes: form.notes.trim() || null,
        };
        const res = await api.post('/cheques', payload);
        const saved: Cheque = res.data.data;
        setEditId(saved.id);
        setPrintTarget(saved);
        await loadData(page);
        printCurrentView();
        setShowPrintConfirm(true);
      } catch (e) {
        setFormError(errorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    // Reprinting an already-PRINTED cheque must be justified and logged. Collect
    // a reason first; the actual print happens after the reprint is recorded.
    if (printTarget.status === 'PRINTED') {
      setReprintReason('');
      setReprintNote('');
      setShowReprintModal(true);
      return;
    }
    printCurrentView();
    if (printTarget.status === 'DRAFT') setShowPrintConfirm(true);
  }

  // ── Reprint (logged) ───────────────────────────────────────────────────────

  async function handleConfirmReprint() {
    if (!printTarget || !reprintReason) return;
    if (reprintBusy) return;
    setReprintBusy(true);
    try {
      await api.post(`/cheques/${printTarget.id}/reprint`, {
        reason: reprintReason,
        note: reprintNote.trim() || null,
      });
      setShowReprintModal(false);
      printCurrentView();
      setSuccess('تم تسجيل إعادة الطباعة');
      const res = await api.get(`/cheques/${printTarget.id}`);
      setPrintTarget(res.data.data);
      await loadData(page);
      if (viewing?.id === printTarget.id) loadPrintLogs(printTarget.id);
    } catch (e) {
      setFormError(errorMessage(e));
      setShowReprintModal(false);
    } finally {
      setReprintBusy(false);
    }
  }

  // ── Print history ──────────────────────────────────────────────────────────

  const loadPrintLogs = useCallback(async (id: number) => {
    setPrintLogsLoading(true);
    try {
      const res = await api.get(`/cheques/${id}/print-logs`);
      setPrintLogs((res.data?.data ?? []) as ChequePrintLogRow[]);
    } catch {
      setPrintLogs([]);
    } finally {
      setPrintLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewing) loadPrintLogs(viewing.id);
    else setPrintLogs([]);
  }, [viewing, loadPrintLogs]);

  // ── Print Payment Voucher ─────────────────────────────────────────────────

  async function handlePrintPaymentVoucher() {
    if (!printTarget) return;
    if (pvLoading) return;
    setPvLoading(true);
    setFormError('');
    try {
      const res = await api.post(`/cheques/${printTarget.id}/payment-voucher-number`);
      const { voucherNumber } = res.data.data as { voucherNumber: string };
      setPrintTarget((prev) => prev ? { ...prev, paymentVoucherNumber: voucherNumber } : prev);
      setCheques((prev) => prev.map((c) => c.id === printTarget.id ? { ...c, paymentVoucherNumber: voucherNumber } : c));
      navigate(`/forms/payment-voucher/${printTarget.id}`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setPvLoading(false);
    }
  }

  async function handleMarkPrinted() {
    if (!printTarget) { setFormError(t('error.cheque.save_first')); setShowPrintConfirm(false); return; }
    if (busy) return; setBusy(true);
    try {
      await api.post(`/cheques/${printTarget.id}/mark-printed`);
      setSuccess(t('msg.cheque.printed'));
      setShowPrintConfirm(false);
      const res = await api.get(`/cheques/${printTarget.id}`);
      setPrintTarget(res.data.data);
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
      setShowPrintConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  // ── Cancel ────────────────────────────────────────────────────────────────

  async function executeCancel(cheque: Cheque) {
    setCancelConfirmCheque(null);
    if (busy) return; setBusy(true);
    try {
      await api.post(`/cheques/${cheque.id}/cancel`);
      setSuccess(t('msg.cheque.cancelled'));
      if (printTarget?.id === cheque.id) {
        const res = await api.get(`/cheques/${cheque.id}`);
        setPrintTarget(res.data.data);
      }
      setViewing((v) => v && v.id === cheque.id ? null : v);
      await loadData(page);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ── Restore default template for current bank ─────────────────────────────

  async function executeRestoreDefault() {
    setShowRestoreConfirm(false);
    if (restoringDefault) return;
    setRestoringDefault(true);
    try {
      // Route through the versioning endpoint (same service as calibration
      // saves/restores) so restoring defaults appends an immutable version and
      // updates the active template inside that transaction — never a silent,
      // unrecoverable overwrite. Previous versions are preserved.
      await api.post('/cheques/template-versions', {
        bankName: form.bankName,
        template: DEFAULT_TEMPLATE,
        note: 'استعادة القالب الافتراضي',
      });
      setAllTemplates((prev) => ({ ...prev, [form.bankName]: cloneDefaultTemplate() }));
      setSuccess(`تم استعادة القالب الافتراضي لبنك ${form.bankName} (حُفظ كنسخة جديدة)`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setRestoringDefault(false);
    }
  }

  // ── Preview data ──────────────────────────────────────────────────────────

  const previewData: PreviewData = printTarget
    ? { chequeNumber: printTarget.chequeNumber, chequeDate: printTarget.chequeDate, beneficiaryName: printTarget.beneficiaryName, amount: printTarget.amount, currency: printTarget.currency, description: printTarget.description, bankName: printTarget.bankName }
    : { chequeNumber: form.chequeNumber, chequeDate: form.chequeDate, beneficiaryName: form.beneficiaryName, amount: form.amount, currency: form.currency, description: form.description || null, bankName: form.bankName };

  const isPrintable =
    (!!printTarget && printTarget.status !== 'CANCELLED') ||
    (!printTarget && !!form.chequeNumber && !!form.beneficiaryName && !!form.amount && !!form.bankName);
  const isPrintedCheque = !!printTarget && printTarget.status === 'PRINTED';

  function handleCalibSaved(bank: string, template: ChequeTemplate) {
    setAllTemplates((prev) => ({ ...prev, [bank]: template }));
  }

  const calibPreviewData = {
    beneficiaryName: printTarget?.beneficiaryName ?? 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
    chequeDate: (() => {
      const src = printTarget?.chequeDate ?? new Date().toISOString();
      const d = new Date(src);
      return isNaN(d.getTime()) ? '18 / 06 / 2026' : `${String(d.getDate()).padStart(2, '0')} / ${String(d.getMonth() + 1).padStart(2, '0')} / ${d.getFullYear()}`;
    })(),
    tafqeetText: printTarget ? tafqeetKWD(Number(printTarget.amount)) : 'خمسة آلاف دينار كويتي لا غير',
    numericText: printTarget ? fmtChequeAmount(Number(printTarget.amount)) : '#5,000#',
  };

  // ── KPIs (computed from loaded data — no backend change) ───────────────────

  const valueKpis = useMemo(() => {
    const amounts = cheques.map((c) => Number(c.amount) || 0);
    const totalValue = amounts.reduce((s, a) => s + a, 0);
    const highest = amounts.length ? Math.max(...amounts) : 0;
    const average = amounts.length ? totalValue / amounts.length : 0;
    return { totalValue, highest, average };
  }, [cheques]);

  const STATUS_CHIPS: [string, string][] = [['', t('opt.all')], ['DRAFT', t('cheque.status.draft')], ['PRINTED', t('cheque.status.printed')], ['CANCELLED', t('cheque.status.cancelled')]];
  const hasFilters = !!(historySearch || historyStatus);

  function openNew() { resetForm(); setEditorOpen(true); }
  function openEditor(cheque: Cheque) { loadChequeIntoForm(cheque); setViewing(null); setEditorOpen(true); }
  function selectForPreview(cheque: Cheque) { loadChequeIntoForm(cheque); setViewing(null); }

  // أزرار العمليات أعلى Drawer الشيك — كانت سابقًا شريط أزرار سفلي، تجمّعت هنا
  // بنفس الأيقونات/الوظائف/الصلاحيات/ترتيب التنفيذ (Drawer Actions Consistency Pack v1).
  const chequeQuickActions: QuickAction[] = viewing ? [
    { key: 'preview', icon: 'visibility', label: 'معاينة وطباعة', onClick: () => selectForPreview(viewing) },
    ...(canUpdate && viewing.status !== 'CANCELLED' ? [{ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary' as const, onClick: () => openEditor(viewing) }] : []),
    ...(canCancel && viewing.status === 'DRAFT' ? [{ key: 'cancel', icon: 'block', label: t('page.cheques.cancel_cheque'), onClick: () => setCancelConfirmCheque(viewing), disabled: busy }] : []),
    ...(isSystemAdmin ? [{ key: 'delete', icon: 'delete_forever', label: 'حذف نهائي', tone: 'danger' as const, onClick: () => { const id = viewing.id; setViewing(null); setForceDeleteId(id); } }] : []),
  ] : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page" dir="rtl">
      {/* Calibration overlay — UNCHANGED */}
      {showCalibrator && (
        <ChequeCalibrator banks={KUWAITI_BANKS} initialBank={form.bankName} loadedTemplates={allTemplates} previewData={calibPreviewData} onSaved={handleCalibSaved} onClose={() => setShowCalibrator(false)} isSystemAdmin={isSystemAdmin} />
      )}

      {/* Hidden print area + print CSS — print output UNCHANGED.
          INK ISOLATION: webContents.print() prints the whole window, so any mounted
          print layer competes for the page. While the calibrator is open its test
          sheet must be the ONLY print surface — so the real-cheque layer is not
          mounted at all. Unmounting beats CSS suppression: no !important tie to lose
          on document order, and no z-index/stacking-context to fight. Outside the
          calibrator this mounts and prints exactly as before. */}
      {!showCalibrator && (
        <div className="cheque-print-only" style={{ display: 'none' }}>
          <div style={{ transform: `translate(${CHEQUE_PAGE_OFFSET_X_MM}mm, ${CHEQUE_PAGE_OFFSET_Y_MM}mm)` }}>
            <ChequePrintOutput data={previewData} template={currentTemplate} />
          </div>
        </div>
      )}
      <style>{`
        @page { size: A4 landscape; }
        @media print {
          /* Collapse the in-flow app shell to zero height so only the fixed cheque
             occupies the print layout. visibility:hidden alone kept #root at full
             height, which paginated an extra blank page. #root is not a fixed-
             positioning containing block, so overflow:hidden here does NOT clip the
             position:fixed cheque below. */
          body > * { visibility: hidden !important; height: 0 !important; overflow: hidden !important; }
          .cheque-print-only {
            display: block !important;
            visibility: visible !important;
            position: fixed;
            inset: 0;
            background: white;
            z-index: 9999;
          }
          .cheque-print-only * { visibility: visible !important; }
          .cheque-bg-img { display: none !important; }
        }
      `}</style>

      {/* Executive header */}
      <ExecutiveHeader
        icon="payments"
        title={t('page.cheques.title')}
        subtitle={t('page.cheques.subtitle')}
        chips={
          <>
            <IdChip icon="account_balance" tone="indigo">{form.bankName}</IdChip>
            <IdChip icon="receipt_long" tone="indigo">{stats.total} شيك</IdChip>
            <IdChip icon="print" tone="green">{stats.printed} مطبوع</IdChip>
            {stats.draft > 0 && <IdChip icon="edit_note" tone="orange">{stats.draft} مسودة</IdChip>}
          </>
        }
        aside={(
          <>
            <PeriodControl />
            {canCreate && <Button variant="primary" icon="add" onClick={openNew}>{t('page.cheques.new')}</Button>}
          </>
        )}
      />

      {/* Alerts */}
      {formError && <ErrorBanner>{formError} <button type="button" className="xpl-clear-link" onClick={() => setFormError('')}>إغلاق</button></ErrorBanner>}
      {success && <div className="chqx-success"><span className="material-symbols-outlined">check_circle</span>{success}<button type="button" className="xpl-clear-link" onClick={() => setSuccess('')}>إغلاق</button></div>}

      {/* Hero + KPIs
          ملاحظة نطاق: قيمة الإجمالي/الأعلى/المتوسط تُحسب من الشيكات المحمّلة في هذه الصفحة فقط
          (valueKpis)، بينما عدّادات الحالة (مسودة/مطبوع/ملغى) إجمالية من الخادم (stats).
          نوضّح ذلك في العناوين حتى لا تُقرأ الأرقام كإجمالي عام. */}
      <div className="chqx-metrics">
        <HeroMetric icon="account_balance_wallet" label="قيمة الشيكات في هذه الصفحة" value={<MoneyText value={valueKpis.totalValue} />} sub={<><span className="material-symbols-outlined">receipt_long</span>{`${cheques.length} شيك معروض · ${stats.total} إجمالاً`}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="edit_note" tone="orange" label={t('stat.cheques.draft')} value={stats.draft} />
          <MetricCard icon="print" tone="green" label={t('stat.cheques.printed')} value={stats.printed} />
          <MetricCard icon="block" tone="red" label={t('stat.cheques.cancelled')} value={stats.cancelled} />
          <MetricCard icon="trending_up" tone="blue" label="أعلى شيك (هذه الصفحة)" value={<MoneyText value={valueKpis.highest} />} />
          <MetricCard icon="functions" tone="indigo" label="متوسط الشيك (هذه الصفحة)" value={<MoneyText value={valueKpis.average} />} />
        </div>
      </div>

      {/* Preview workspace */}
      <SectionCard title="معاينة الشيك" icon="visibility" actions={printTarget ? chequeChip(printTarget.status, t) : undefined}>
        {/* On-screen preview shown at 65% of natural size (presentation-only). Scales the
            whole preview — background + absolutely-positioned overlay fields — together, so
            template %/pt coordinates, the hidden print output (.cheque-print-only), and the
            calibration page are all unchanged. */}
        <div className="chqx-preview-scale">
          <div className="chqx-preview-scale-inner">
            <ChequePrintOutput data={previewData} template={currentTemplate} />
          </div>
        </div>
        {/* تجميع بصري فقط: إجراءات الإصدار الأساسية مقابل أدوات الطباعة/المعايرة —
            لا تغيير على المعالِجات (handlePrint / printCurrentView / المعايرة). */}
        <div className="chqx-preview-actions">
          <div className="chqx-action-group">
            {canPrint && <Button variant="primary" icon="print" busy={saving} disabled={!isPrintable} onClick={handlePrint}>طباعة الشيك</Button>}
            {canPrint && isPrintedCheque && <Button variant="secondary" icon="receipt_long" busy={pvLoading} onClick={handlePrintPaymentVoucher}>طباعة سند الصرف</Button>}
          </div>
          <div className="chqx-action-group chqx-action-group--tools">
            {canCalibrate && <Button variant="ghost" icon="tune" onClick={() => setShowCalibrator(true)}>معايرة الطباعة</Button>}
            {canCalibrate && <Button variant="ghost" icon="restart_alt" busy={restoringDefault} onClick={() => setShowRestoreConfirm(true)}>استعادة الافتراضي</Button>}
            {canCancel && printTarget && printTarget.status === 'DRAFT' && <Button variant="danger" icon="block" busy={busy} onClick={() => setCancelConfirmCheque(printTarget)}>{t('page.cheques.cancel_cheque')}</Button>}
          </div>
        </div>
        {!printTarget && <p className="chqx-preview-hint">احفظ الشيك أولاً لتفعيل الطباعة الرسمية وإنشاء سند الصرف.</p>}
        {printTarget?.status === 'DRAFT' && <p className="chqx-preview-hint">تلميح: تأكّد من محاذاة الطباعة على ورق الشيك عبر «معايرة الطباعة» قبل الطباعة الفعلية.</p>}
        {printTarget?.status === 'CANCELLED' && <p className="chqx-preview-hint warn">{t('error.cheque.is_cancelled')}</p>}
        {printTarget?.status === 'PRINTED' && <p className="chqx-preview-hint">{printTarget.paymentVoucherNumber ? `رقم سند الصرف: ${printTarget.paymentVoucherNumber}` : 'اضغط «طباعة سند الصرف» لإنشاء السند الرسمي المرتبط بهذا الشيك.'}</p>}
      </SectionCard>

      {/* Sticky filters */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={historySearch} onChange={(v) => { setHistorySearch(v); setPage(1); }} placeholder={t('action.search_placeholder')} ariaLabel={t('action.search_placeholder')} />
          {hasFilters && <button type="button" className="xpl-clear-link" onClick={() => { setHistorySearch(''); setHistoryStatus(''); setPage(1); }}>{t('action.reset_filters')}</button>}
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={historyStatus === v} onClick={() => { setHistoryStatus(v); setPage(1); }}>{l}</FilterChip>)}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? cheques.length} شيك</span>
        </div>
      </div>

      {/* History table */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : cheques.length === 0 ? (
          <EmptyState icon="receipt_long" tone="neutral" title={t('empty.cheques')}
            message={hasFilters ? 'لا توجد شيكات مطابقة للفلاتر.' : undefined}
            action={hasFilters ? <Button variant="secondary" icon="restart_alt" onClick={() => { setHistorySearch(''); setHistoryStatus(''); setPage(1); }}>{t('action.reset_filters')}</Button>
              : canCreate ? <Button variant="primary" icon="add" onClick={openNew}>{t('page.cheques.new')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th>{t('col.cheque.number')}</th>
                    <th>{t('col.cheque.beneficiary')}</th>
                    <th>{t('col.cheque.bank')}</th>
                    <th>{t('col.cheque.amount')}</th>
                    <th>{t('col.cheque.date')}</th>
                    <th>{t('col.cheque.status')}</th>
                    <th>{t('col.cheque.pv_number')}</th>
                    <th aria-label="فتح" />
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((r) => (
                    <tr key={r.id} className="xpl-row--click" tabIndex={0} role="button"
                      aria-label={`تفاصيل الشيك ${r.chequeNumber}`}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      <td><span className="chqx-mono"><strong>{r.chequeNumber}</strong></span></td>
                      <td><strong>{r.beneficiaryName}</strong></td>
                      <td>{r.bankName}</td>
                      <td><span className="chqx-amount">{fmtAmount(r.amount, r.currency)}</span></td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{formatDate(r.chequeDate)}</td>
                      <td>
                        {chequeChip(r.status, t)}
                        {r.printedAt && <span className="chqx-print-badge" style={{ marginInlineStart: 6 }}><span className="material-symbols-outlined">print</span></span>}
                      </td>
                      <td>{r.paymentVoucherNumber ? <span className="chqx-pv-badge"><span className="material-symbols-outlined">receipt_long</span>{r.paymentVoucherNumber}</span> : <span style={{ color: 'var(--xpl-muted)' }}>—</span>}</td>
                      <td className="xpl-col-chevron"><span className="material-symbols-outlined" aria-hidden="true">chevron_left</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination meta={meta} onPage={(p) => { setPage(p); loadData(p); }} />
          </>
        )}
      </section>

      {/* ── Cheque drawer ── */}
      {viewing && (
        <Drawer
          title={`${t('col.cheque.number')} ${viewing.chequeNumber}`}
          onClose={() => setViewing(null)}
          hero={
            <>
              <div className="xpl-drawer-hero">
                <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">payments</span></div>
                <div className="xpl-drawer-hero-body">
                  {/* عملة الشيك من **سجلّه** لا من إعداد العرض — استثناء صحيح؛ العزل وحده
                      هو ما يلزم كي لا ينقلب ترتيب الرقم والرمز في الواجهة العربية. */}
                  <span className="xpl-drawer-hero-title money-cell">{fmtAmount(viewing.amount, viewing.currency)}</span>
                  <span className="xpl-drawer-hero-sub">{viewing.beneficiaryName} · {viewing.bankName}</span>
                  <div style={{ marginTop: 4 }}>{chequeChip(viewing.status, t)}</div>
                </div>
              </div>
              <DrawerQuickActions actions={chequeQuickActions} />
            </>
          }
        >
          <DrawerSection title="المعلومات الأساسية">
            <DrawerField label={t('col.cheque.number')} value={viewing.chequeNumber} mono />
            <DrawerField label={t('col.cheque.date')} value={formatDate(viewing.chequeDate)} />
            <DrawerField label={t('col.cheque.beneficiary')} value={viewing.beneficiaryName} />
            <DrawerField label={t('col.cheque.amount')} value={<span className="money-cell">{fmtAmount(viewing.amount, viewing.currency)}</span>} />
          </DrawerSection>
          {viewing.currency === 'KWD' && Number(viewing.amount) > 0 && (
            <DrawerSection title="التفقيط">
              <div className="chqx-tafqeet">{tafqeetKWD(Number(viewing.amount))}</div>
            </DrawerSection>
          )}
          <DrawerSection title="بيانات البنك">
            <DrawerField label={t('col.cheque.bank')} value={viewing.bankName} />
            <DrawerField label={t('field.cheque.currency')} value={viewing.currency} />
          </DrawerSection>
          <DrawerSection title="الطباعة">
            <DrawerField label={t('col.cheque.status')} value={chequeChip(viewing.status, t)} />
            <DrawerField label="تاريخ الطباعة" value={viewing.printedAt ? formatDate(viewing.printedAt) : '—'} />
            <DrawerField label={t('col.cheque.pv_number')} value={viewing.paymentVoucherNumber ?? '—'} mono />
          </DrawerSection>
          <DrawerSection title="سجل الطباعة وإعادة الطباعة">
            {printLogsLoading ? (
              <DrawerField label="—" value="جارٍ التحميل…" />
            ) : printLogs.length === 0 ? (
              <DrawerField label="—" value="لا يوجد سجل طباعة لهذا الشيك." />
            ) : (
              <div className="chqx-printlog">
                {printLogs.map((log) => (
                  <div key={log.id} className="chqx-printlog-row">
                    <span className="chqx-printlog-seq">{log.sequence === 1 ? 'طباعة أولى' : `إعادة ${log.sequence - 1}`}</span>
                    <span className="chqx-printlog-meta">
                      {formatDate(log.printedAt)}
                      {log.printedByName ? ` · ${log.printedByName}` : ''}
                      {log.reason ? ` · ${reprintReasonLabel(log.reason)}` : ''}
                      {log.note ? ` · ${log.note}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <DrawerSection title="السجل">
            <DrawerField label={t('col.created_at')} value={formatDate(viewing.createdAt)} />
            {viewing.cancelledAt && <DrawerField label="تاريخ الإلغاء" value={formatDate(viewing.cancelledAt)} />}
          </DrawerSection>
          {(viewing.description || viewing.notes) && (
            <DrawerSection title="ملاحظات">
              {viewing.description && <DrawerField label={t('field.cheque.description')} value={viewing.description} />}
              {viewing.notes && <DrawerField label={t('field.cheque.notes')} value={viewing.notes} />}
            </DrawerSection>
          )}
          <DrawerSection title="بيانات تقنية">
            <DrawerField label="المعرّف الداخلي" value={`#${viewing.id}`} mono />
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Editor dialog ── */}
      {editorOpen && (
        <Dialog
          icon={editId ? 'edit' : 'add_card'}
          title={editId ? `${t('page.cheques.form')} #${editId}` : t('page.cheques.new')}
          subtitle={editId ? form.chequeNumber : 'إنشاء شيك جديد'}
          size="lg"
          onClose={() => setEditorOpen(false)}
          footer={
            <>
              {((canCreate && !editId) || (editId && canUpdate)) && (
                <Button variant="primary" icon="save" busy={saving} onClick={async () => { const ok = await handleSave(); if (ok) setEditorOpen(false); }}>{t('page.cheques.save')}</Button>
              )}
              <Button variant="ghost" onClick={() => setEditorOpen(false)}>{t('action.cancel')}</Button>
            </>
          }
        >
          {formError && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{formError}</div>}
          <DialogSection title="المعلومات الأساسية" icon="badge">
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.beneficiary')} <span className="req">*</span></label>
              <input className="xpl-input" value={form.beneficiaryName} onChange={(e) => field('beneficiaryName', e.target.value)} placeholder={t('ph.cheque.beneficiary')} disabled={!!editId && !canUpdate} aria-label={t('field.cheque.beneficiary')} />
            </div>
            <div className="xpl-field">
              <label>{t('field.cheque.number')} <span className="req">*</span></label>
              <input className="xpl-input chqx-mono" value={form.chequeNumber} onChange={(e) => field('chequeNumber', e.target.value)} placeholder={t('ph.cheque.number')} disabled={!!editId && !canUpdate} aria-label={t('field.cheque.number')} />
            </div>
            <div className="xpl-field">
              <label>{t('field.cheque.date')} <span className="req">*</span></label>
              <DateInput className="xpl-input" value={form.chequeDate} onChange={(v) => field('chequeDate', v)} disabled={!!editId && !canUpdate} ariaLabel={t('field.cheque.date')} />
              {/* الشيك لا يُرحَّل محاسبيًا — تنبيه تاريخي فقط، بلا رسالة قفل. */}
              <HistoricalDateNotice date={form.chequeDate} enforcesLock={false} />
            </div>
          </DialogSection>

          <DialogSection title="المبالغ" icon="payments">
            <div className="xpl-field">
              <label>{t('field.cheque.amount')} <span className="req">*</span></label>
              <input className="xpl-input chqx-mono" type="number" min="0" step="0.001" value={form.amount} onChange={(e) => field('amount', e.target.value)} disabled={!!editId && !canUpdate} style={{ direction: 'ltr' }} aria-label={t('field.cheque.amount')} />
            </div>
            <div className="xpl-field">
              <label>{t('field.cheque.currency')} <span className="req">*</span></label>
              <select className="xpl-select" value={form.currency} onChange={(e) => field('currency', e.target.value)} disabled={!!editId && !canUpdate} aria-label={t('field.cheque.currency')}>
                <option value="KWD">KWD</option>
                <option value="USD">USD</option>
                <option value="SAR">SAR</option>
                <option value="AED">AED</option>
              </select>
            </div>
            {form.currency === 'KWD' && Number(form.amount) > 0 && (
              <div className="xpl-field xpl-field--full">
                <label>التفقيط</label>
                <div className="chqx-tafqeet">{tafqeetKWD(Number(form.amount))}</div>
              </div>
            )}
          </DialogSection>

          <DialogSection title="البنك" icon="account_balance">
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.bank')} <span className="req">*</span></label>
              <select className="xpl-select" value={form.bankName} onChange={(e) => field('bankName', e.target.value)} disabled aria-label={t('field.cheque.bank')}>
                {KUWAITI_BANKS.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
              </select>
            </div>
          </DialogSection>

          <DialogSection title="ملاحظات" icon="sticky_note_2">
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.description')}</label>
              <input className="xpl-input" value={form.description} onChange={(e) => field('description', e.target.value)} placeholder={t('ph.cheque.description')} disabled={!!editId && !canUpdate} aria-label={t('field.cheque.description')} />
            </div>
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.notes')}</label>
              <textarea className="xpl-textarea" rows={2} value={form.notes} onChange={(e) => field('notes', e.target.value)} placeholder={t('ph.cheque.notes')} disabled={!!editId && !canUpdate} aria-label={t('field.cheque.notes')} />
            </div>
          </DialogSection>
        </Dialog>
      )}

      {/* Mark-as-printed confirm */}
      {showPrintConfirm && printTarget && (
        <ConfirmModal
          title={t('page.cheques.mark_printed')}
          message={t('page.cheques.confirm_printed')}
          confirmLabel={t('page.cheques.mark_printed')}
          variant="warning"
          onConfirm={canPrint ? handleMarkPrinted : () => setShowPrintConfirm(false)}
          onCancel={() => setShowPrintConfirm(false)}
        />
      )}
      {forceDeleteId !== null && (
        <ForceDeleteChequeModal
          chequeId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); setSuccess('تم حذف الشيك نهائياً'); loadData(page); }}
        />
      )}

      {/* Reprint reason — required before re-printing an already-printed cheque */}
      {showReprintModal && printTarget && (
        <Dialog
          icon="print"
          title="إعادة طباعة الشيك"
          subtitle={`${printTarget.chequeNumber} · ${printTarget.beneficiaryName}`}
          size="sm"
          onClose={() => setShowReprintModal(false)}
          footer={
            <>
              <Button variant="primary" icon="print" busy={reprintBusy} disabled={!reprintReason} onClick={handleConfirmReprint}>تسجيل وإعادة الطباعة</Button>
              <Button variant="ghost" onClick={() => setShowReprintModal(false)}>{t('action.cancel')}</Button>
            </>
          }
        >
          <DialogSection title="سبب إعادة الطباعة" icon="help">
            <p className="chqx-preview-hint" style={{ textAlign: 'start', margin: '0 0 8px' }}>
              هذا الشيك مطبوع مسبقاً. إعادة الطباعة مسموحة لكنها تُسجَّل في سجل الطباعة. اختر السبب:
            </p>
            <div className="xpl-field xpl-field--full">
              <label>السبب <span className="req">*</span></label>
              <select className="xpl-select" value={reprintReason} onChange={(e) => setReprintReason(e.target.value as ReprintReason)} aria-label="سبب إعادة الطباعة">
                <option value="">— اختر السبب —</option>
                {REPRINT_REASONS.map((r) => <option key={r} value={r}>{REPRINT_REASON_LABELS[r]}</option>)}
              </select>
            </div>
            <div className="xpl-field xpl-field--full">
              <label>ملاحظة (اختياري)</label>
              <input className="xpl-input" value={reprintNote} onChange={(e) => setReprintNote(e.target.value)} placeholder="تفاصيل إضافية" maxLength={300} aria-label="ملاحظة إعادة الطباعة" />
            </div>
          </DialogSection>
        </Dialog>
      )}

      {cancelConfirmCheque !== null && (
        <ConfirmModal title={t('page.cheques.cancel_cheque')} message={t('page.cheques.confirm_cancel')} variant="warning" onConfirm={() => executeCancel(cancelConfirmCheque)} onCancel={() => setCancelConfirmCheque(null)} />
      )}
      {showRestoreConfirm && (
        <ConfirmModal message={`استعادة القالب الافتراضي لبنك "${form.bankName}"؟ سيُحفظ ذلك كنسخة جديدة ويصبح القالب الافتراضي هو الفعّال — والنسخ السابقة تبقى متاحة للاستعادة.`} variant="warning" onConfirm={executeRestoreDefault} onCancel={() => setShowRestoreConfirm(false)} />
      )}
    </div>
  );
}
