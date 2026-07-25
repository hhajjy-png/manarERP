import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { printCurrentViewWithResult } from '../utils/print';
import { markChequePrinted, reprintCheque, printOutcomeMessage, type ChequeTrackingInfo } from '../utils/chequePrintTracking';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { amountToWordsKWD } from '../lib/tafqeet';
import { formatDate, todayDateOnly, formatDisplayDate } from '../lib/date';
import { formatNumber } from '../lib/format';
import { PageMeta } from '../components/DataTable';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import DateInput from '../components/DateInput';
import ConfirmModal from '../components/ConfirmModal';
import ForceDeleteChequeModal from '../components/ForceDeleteChequeModal';
import ChequeStudioOverlay from '../components/ChequeStudioOverlay';
import { getDefaultTemplate, listTemplates } from '../components/chequeTemplateManager/chequeDesignerStore';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';
import type { ChequeRecordInput } from '../components/chequeTemplateManager/chequeRuntimeData';
import gulfBankImg from '../assets/cheakv1.png';
import {
  DEFAULT_TEMPLATE,
  cloneDefaultTemplate,
  fmtChequeAmount,
  templateFromSettings,
  REPRINT_REASONS,
  REPRINT_REASON_KEYS,
  bankLabel,
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

// Print provider — a lightweight selection layer over the existing, unchanged
// printing systems. 'classic' = the current ChequePrintOutput path; the two
// 'template-*' options route to the Official Cheque Template print route
// (Runtime Engine + ChequeRenderSurface) in Real Cheque / A4 surface modes.
type PrintProvider = 'classic' | 'template-real' | 'template-a4';

const PRINT_PROVIDERS: PrintProvider[] = ['classic', 'template-real', 'template-a4'];
/** Application-config setting (backed up with the DB) for the default cheque print provider. */
const DEFAULT_PRINT_PROVIDER_SETTING = 'cheques.defaultPrintProvider';
function isPrintProvider(v: string): v is PrintProvider {
  return (PRINT_PROVIDERS as string[]).includes(v);
}

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

/** Localized label for a stored reprint-reason key; falls back to the raw value. */
function reprintReasonLabel(reason: string, t: (k: string) => string): string {
  const key = (REPRINT_REASON_KEYS as Record<string, string>)[reason];
  return key ? t(key) : reason;
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
        <div style={{ ...fieldStyle('tafqeet'), direction: 'rtl' }}>{amount > 0 ? amountToWordsKWD(amount, 'ar') : ''}</div>
        <div style={{ ...fieldStyle('numeric'), letterSpacing: 0.5 }}>{amount > 0 ? fmtChequeAmount(amount) : ''}</div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Cheques() {
  const { hasPermission, isSystemAdmin: getIsSystemAdmin } = useAuth();
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
  // فرز خادمي موحّد (Enterprise Data Grid Foundation) — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('cheques', () => setPage(1));
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState('');
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [showPrintConfirm, setShowPrintConfirm] = useState(false);
  const [showCalibrator, setShowCalibrator] = useState(false);
  const [printProvider, setPrintProvider] = useState<PrintProvider>('classic');
  const [makeDefault, setMakeDefault] = useState(false);
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
  // ── Multi-selection & batch printing (Cheque Multi-Selection & Batch Printing Pack v1) ──
  // Selection is an id Set independent of the loaded page, so it survives sorting/
  // filtering/pagination; batch actions operate on whichever selected rows are
  // currently loaded in `cheques`. The batch itself drives the EXISTING single-print
  // handlers (handlePrint branches, handleMarkPrinted, handleConfirmReprint) one
  // cheque at a time — no parallel print jobs, no duplicated print logic.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [batchTotal, setBatchTotal] = useState(0);
  const [batchCurrent, setBatchCurrent] = useState(0);
  const batchRef = useRef<{ items: Cheque[]; index: number; succeeded: number } | null>(null);
  const canCreate = hasPermission('cheques.create');
  const canUpdate = hasPermission('cheques.update');
  const canPrint = hasPermission('cheques.print');
  const isSystemAdmin = getIsSystemAdmin();
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
        api.get('/cheques', { params: { page: p, pageSize: 20, search: historySearch || undefined, status: historyStatus || undefined, ...dateParams, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } }),
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
  }, [historySearch, historyStatus, period.fromDate, period.toDate, period.isAllPeriods, sort.sortBy, sort.sortDir]);

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
      // Restore the saved default print provider (absent → 'classic', unchanged behavior).
      const providerRow = settings.find((s) => s.key === DEFAULT_PRINT_PROVIDER_SETTING);
      if (providerRow && isPrintProvider(providerRow.value)) setPrintProvider(providerRow.value);
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

  // ── Selection (row checkboxes + select-all-on-page) ────────────────────────

  const toggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const visibleSelectedCount = useMemo(
    () => cheques.reduce((n, c) => n + (selectedIds.has(c.id) ? 1 : 0), 0),
    [cheques, selectedIds],
  );
  const allVisibleSelected = cheques.length > 0 && visibleSelectedCount === cheques.length;
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected;

  const toggleSelectAllVisible = useCallback(() => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSelected = cheques.length > 0 && cheques.every((c) => next.has(c.id));
      cheques.forEach((c) => { if (allSelected) next.delete(c.id); else next.add(c.id); });
      return next;
    });
  }, [cheques]);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // ── Batch printing — orchestrates the EXISTING single-cheque tracking calls
  // (markChequePrinted / reprintCheque, via their confirm/reprint-reason modals)
  // sequentially, one cheque at a time. Sequence per item: print → real print
  // result → tracking only if the result was 'success' → continue. Never runs a
  // second print job before the current one has resolved. On any non-'success'
  // result the batch STOPS — nothing after the failed/cancelled item is processed,
  // and nothing is ever marked printed for it. ───────────────────────────────────

  async function runChequeBatchStep() {
    const job = batchRef.current;
    if (!job) return;
    if (job.index >= job.items.length) { finishChequeBatch('done'); return; }
    setBatchCurrent(job.index + 1);
    const cheque = job.items[job.index];
    setPrintTarget(cheque);
    setEditId(cheque.id);
    // Two rAF ticks so the hidden `.cheque-print-only` layer (which reads
    // `previewData`/`printTarget`) has actually repainted with this cheque's data
    // before printing captures the page — same requirement `handlePrint` already
    // relies on via React's own render/commit timing for a single cheque.
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const result = await printCurrentViewWithResult();
    if (result.outcome !== 'success') {
      setFormError(printOutcomeMessage(result, t));
      finishChequeBatch('stopped');
      return;
    }
    // Print succeeded — now, and only now, offer the same tracking step the
    // single-item flow uses (mark-printed confirm for DRAFT, reprint-reason for
    // PRINTED). Note: for PRINTED cheques this asks the reprint reason AFTER the
    // physical print (per this pack's print→result→tracking sequencing), unlike
    // the single-item flow which asks first — the reprint's justification/logging
    // requirement itself is unchanged either way; only the batch step ordering differs.
    if (cheque.status === 'PRINTED') {
      setReprintReason('');
      setReprintNote('');
      setShowReprintModal(true);
    } else {
      setShowPrintConfirm(true);
    }
  }

  function advanceChequeBatch() {
    const job = batchRef.current;
    if (!job) return;
    batchRef.current = { ...job, index: job.index + 1, succeeded: job.succeeded + 1 };
    runChequeBatchStep();
  }

  function finishChequeBatch(reason: 'done' | 'stopped') {
    const job = batchRef.current;
    batchRef.current = null;
    setBatchTotal(0);
    setBatchCurrent(0);
    if (job) {
      setSuccess(reason === 'done'
        ? t('msg.cheque.batch_done', { count: job.succeeded, total: job.items.length })
        : t('msg.cheque.batch_stopped', { count: job.succeeded, total: job.items.length }));
    }
    loadData(page);
  }

  // Batch cheque printing now works through whichever provider is CURRENTLY
  // selected — it never switches provider or touches print settings/calibration.
  // Classic stays in-page (runChequeBatchStep). Template Real/A4 hand the queue to
  // the existing ChequeTemplatePrintPage (one navigation per item, same as the
  // single-item `handleTemplatePrint` path), which now carries tracking + a
  // Next/Finish control gated on the real print result — see that page.
  function handlePrintSelectedCheques() {
    const items = cheques.filter((c) => selectedIds.has(c.id) && c.status !== 'CANCELLED');
    if (!items.length) { setFormError(t('error.cheque.batch_none_printable')); return; }

    if (printProvider === 'classic') {
      clearSelection();
      setFormError('');
      batchRef.current = { items, index: 0, succeeded: 0 };
      setBatchTotal(items.length);
      setBatchCurrent(1);
      runChequeBatchStep();
      return;
    }

    const tpl = getDefaultTemplate() ?? listTemplates()[0] ?? null;
    if (!tpl) {
      setFormError('لا يوجد قالب شيك محفوظ — أنشئ قالباً من «قالب الشيك» أولاً.');
      return;
    }
    clearSelection();
    setFormError('');
    const paperMode: 'real-cheque' | 'a4' = printProvider === 'template-a4' ? 'a4' : 'real-cheque';
    // Build every batch item's runtime data + tracking identity up front, reusing
    // the exact same helpers the single-item path uses — no duplicated mapping logic.
    // The whole list is handed to the page ONCE; it stays on this one navigation
    // and browses items via an in-page index (Batch Preview Navigator) — no
    // same-route navigate() calls between items.
    const batchItems = items.map((c) => ({
      runtimeData: buildChequeRuntimeData(chequeDataForTemplate(c)),
      tracking: trackingInfoFor(c) as ChequeTrackingInfo,
    }));
    navigate('/cheque-template/print', {
      state: {
        surface: tpl.surface,
        fields: tpl.fields,
        paperMode,
        ctppBatchItems: batchItems,
      },
    });
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  // ── Provider routing ────────────────────────────────────────────────────────
  // The cheque data printed by a template provider — from an explicit cheque (batch),
  // the selected saved cheque (single-item), or the current form when composing a new
  // one (no id yet ⇒ untracked, exactly as before this pack).
  function chequeDataForTemplate(cheque?: Cheque): ChequeRecordInput {
    const source = cheque ?? printTarget;
    return source
      ? {
          chequeNumber: source.chequeNumber,
          chequeDate: source.chequeDate,
          beneficiaryName: source.beneficiaryName,
          amount: Number(source.amount),
          currency: source.currency,
          bankName: source.bankName,
        }
      : {
          chequeNumber: form.chequeNumber.trim(),
          chequeDate: form.chequeDate,
          beneficiaryName: form.beneficiaryName.trim(),
          amount: Number(form.amount),
          currency: form.currency.trim(),
          bankName: form.bankName.trim(),
        };
  }

  /** Same tracking identity Classic uses (see chequePrintTracking.ts) — undefined
   *  when there is no saved DB record yet (unsaved form draft), so the template
   *  print page attempts no tracking in that case, unchanged from before this pack. */
  function trackingInfoFor(cheque?: Cheque): ChequeTrackingInfo | undefined {
    const source = cheque ?? printTarget;
    return source ? { id: source.id, status: source.status, chequeNumber: source.chequeNumber, beneficiaryName: source.beneficiaryName } : undefined;
  }

  // Route the print request to the EXISTING Official Cheque Template print page
  // (Runtime Engine → ChequeRenderSurface). Real Cheque = 178×89mm; A4 = A4 sheet.
  // Uses the user's default saved template (or the most recent one).
  function handleTemplatePrint(paperMode: 'real-cheque' | 'a4', cheque?: Cheque) {
    const tpl = getDefaultTemplate() ?? listTemplates()[0] ?? null;
    if (!tpl) {
      setFormError('لا يوجد قالب شيك محفوظ — أنشئ قالباً من «قالب الشيك» أولاً.');
      return;
    }
    const runtimeData = buildChequeRuntimeData(chequeDataForTemplate(cheque));
    navigate('/cheque-template/print', {
      state: { surface: tpl.surface, fields: tpl.fields, runtimeData, paperMode, tracking: trackingInfoFor(cheque) },
    });
  }

  // Persist the chosen provider as the application default (backed up with the DB).
  // Best-effort and silent — no modal, no confirmation message (per spec).
  async function saveDefaultProvider(provider: PrintProvider) {
    try {
      await api.put('/settings', {
        settings: [{ key: DEFAULT_PRINT_PROVIDER_SETTING, value: provider, group: 'cheques' }],
      });
    } catch {
      /* best-effort persistence */
    }
  }

  function handleProviderChange(value: PrintProvider) {
    setPrintProvider(value);
    if (makeDefault) saveDefaultProvider(value);
  }

  function handleMakeDefaultToggle(checked: boolean) {
    setMakeDefault(checked);
    if (checked) saveDefaultProvider(printProvider);
  }

  async function handlePrint() {
    // Provider-selection layer — dispatch to the chosen existing print system.
    if (printProvider === 'template-real') { handleTemplatePrint('real-cheque'); return; }
    if (printProvider === 'template-a4') { handleTemplatePrint('a4'); return; }
    // 'classic' — the existing ChequePrintOutput path, entirely unchanged below.
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
        // Only offer "mark as printed" once printing actually reached a trustworthy
        // success point — never before (see printCurrentViewWithResult in utils/print.ts).
        const result = await printCurrentViewWithResult();
        if (result.outcome === 'success') setShowPrintConfirm(true);
        else setFormError(printOutcomeMessage(result, t));
      } catch (e) {
        setFormError(errorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    // Reprinting an already-PRINTED cheque must be justified and logged. Collect
    // a reason first; the actual print happens after the reprint is recorded.
    // (Single-item ordering — unchanged; see runChequeBatchStep for the batch's
    // print-first ordering, which differs deliberately.)
    if (printTarget.status === 'PRINTED') {
      setReprintReason('');
      setReprintNote('');
      setShowReprintModal(true);
      return;
    }
    const result = await printCurrentViewWithResult();
    if (printTarget.status === 'DRAFT') {
      if (result.outcome === 'success') setShowPrintConfirm(true);
      else setFormError(printOutcomeMessage(result, t));
    }
  }

  // ── Reprint (logged) ───────────────────────────────────────────────────────

  async function handleConfirmReprint() {
    if (!printTarget || !reprintReason) return;
    if (reprintBusy) return;
    setReprintBusy(true);
    const inBatch = !!batchRef.current;
    try {
      const updated = await reprintCheque(printTarget.id, reprintReason, reprintNote.trim() || null);
      setShowReprintModal(false);
      if (inBatch) {
        // The physical print already happened in runChequeBatchStep, BEFORE this
        // modal opened (batch's print→result→tracking order) — this call only
        // records the justified reprint; printing a second time here would print
        // the same cheque twice.
        advanceChequeBatch();
      } else {
        // Single-item semantics unchanged: log the reprint reason first, then print.
        const result = await printCurrentViewWithResult();
        if (result.outcome === 'success') setSuccess(t('msg.cheque.reprint_logged'));
        else setFormError(printOutcomeMessage(result, t));
        setPrintTarget(updated as unknown as Cheque);
        await loadData(page);
        if (viewing?.id === printTarget.id) loadPrintLogs(printTarget.id);
      }
    } catch (e) {
      setFormError(errorMessage(e));
      setShowReprintModal(false);
      if (inBatch) finishChequeBatch('stopped');
    } finally {
      setReprintBusy(false);
    }
  }

  /** Cancelling the reprint-reason dialog mid-batch stops the batch (never bypasses
   *  the justification requirement, never silently skips to the next cheque). */
  function cancelReprintModal() {
    setShowReprintModal(false);
    if (batchRef.current) finishChequeBatch('stopped');
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

  // Single-item "طباعة سند الصرف" path — unchanged. The batch action below no
  // longer calls this (it doesn't pre-assign a number or navigate per item);
  // it opens PaymentVoucher ONCE and that page allocates numbers lazily itself.
  async function goToPaymentVoucher(cheque: Cheque) {
    if (pvLoading) return;
    setPvLoading(true);
    setFormError('');
    try {
      const res = await api.post(`/cheques/${cheque.id}/payment-voucher-number`);
      const { voucherNumber } = res.data.data as { voucherNumber: string };
      setPrintTarget((prev) => prev && prev.id === cheque.id ? { ...prev, paymentVoucherNumber: voucherNumber } : prev);
      setCheques((prev) => prev.map((c) => c.id === cheque.id ? { ...c, paymentVoucherNumber: voucherNumber } : c));
      navigate(`/forms/payment-voucher/${cheque.id}`);
    } catch (e) {
      setFormError(errorMessage(e));
    } finally {
      setPvLoading(false);
    }
  }

  async function handlePrintPaymentVoucher() {
    if (!printTarget) return;
    await goToPaymentVoucher(printTarget);
  }

  /** Batch voucher printing opens PaymentVoucher ONCE with the full list — the
   *  page browses it in-page (Batch Preview Navigator, same pattern as
   *  ChequeTemplatePrintPage) instead of navigating route-to-route per item.
   *  Voucher-number allocation is NOT done here for the batch case; each item
   *  keeps whatever number it already had (possibly none), and PaymentVoucher.tsx
   *  lazily assigns one — via the same endpoint — the first time that item
   *  becomes the active preview. Printing itself stays the existing, unchanged,
   *  manual FormLayout print button. */
  function handlePrintSelectedVouchers() {
    const items = cheques.filter((c) => selectedIds.has(c.id) && c.status === 'PRINTED');
    if (!items.length) { setFormError(t('error.cheque.batch_no_vouchers')); return; }
    clearSelection();
    navigate(`/forms/payment-voucher/${items[0].id}`, { state: { pvBatchItems: items } });
  }

  async function handleMarkPrinted() {
    if (!printTarget) { setFormError(t('error.cheque.save_first')); setShowPrintConfirm(false); return; }
    if (busy) return; setBusy(true);
    const inBatch = !!batchRef.current;
    try {
      const updated = await markChequePrinted(printTarget.id);
      setShowPrintConfirm(false);
      if (inBatch) {
        advanceChequeBatch();
      } else {
        setSuccess(t('msg.cheque.printed'));
        setPrintTarget(updated as unknown as Cheque);
        await loadData(page);
      }
    } catch (e) {
      setFormError(errorMessage(e));
      setShowPrintConfirm(false);
      if (inBatch) finishChequeBatch('stopped');
    } finally {
      setBusy(false);
    }
  }

  /** Cancelling the mark-printed confirm mid-batch stops the batch — selection never
   *  marks records as printed, and the batch never silently skips ahead. */
  function cancelPrintConfirm() {
    setShowPrintConfirm(false);
    if (batchRef.current) finishChequeBatch('stopped');
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
      setSuccess(t('msg.cheque.template_restored', { bank: bankLabel(form.bankName, t) }));
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
    tafqeetText: printTarget ? amountToWordsKWD(Number(printTarget.amount), 'ar') : 'خمسة آلاف دينار كويتي لا غير',
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
    { key: 'preview', icon: 'visibility', label: t('action.preview_and_print'), onClick: () => selectForPreview(viewing) },
    ...(canUpdate && viewing.status !== 'CANCELLED' ? [{ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary' as const, onClick: () => openEditor(viewing) }] : []),
    ...(canCancel && viewing.status === 'DRAFT' ? [{ key: 'cancel', icon: 'block', label: t('page.cheques.cancel_cheque'), onClick: () => setCancelConfirmCheque(viewing), disabled: busy }] : []),
    ...(isSystemAdmin ? [{ key: 'delete', icon: 'delete_forever', label: t('action.force_delete'), tone: 'danger' as const, onClick: () => { const id = viewing.id; setViewing(null); setForceDeleteId(id); } }] : []),
  ] : [];

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="xpl-scope xpl-page">
      {/* Calibration overlay — UNCHANGED */}
      {showCalibrator && (
        <ChequeStudioOverlay banks={KUWAITI_BANKS} initialBank={form.bankName} loadedTemplates={allTemplates} previewData={calibPreviewData} onSaved={handleCalibSaved} onClose={() => setShowCalibrator(false)} isSystemAdmin={isSystemAdmin} chequeRecord={printTarget} />
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
            <IdChip icon="account_balance" tone="indigo">{bankLabel(form.bankName, t)}</IdChip>
            <IdChip icon="receipt_long" tone="indigo">{stats.total} {t('unit.cheque')}</IdChip>
            <IdChip icon="print" tone="green">{stats.printed} {t('cheque.status.printed')}</IdChip>
            {stats.draft > 0 && <IdChip icon="edit_note" tone="orange">{stats.draft} {t('cheque.status.draft')}</IdChip>}
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
      {formError && <ErrorBanner>{formError} <button type="button" className="xpl-clear-link" onClick={() => setFormError('')}>{t('action.close')}</button></ErrorBanner>}
      {success && <div className="chqx-success"><span className="material-symbols-outlined">check_circle</span>{success}<button type="button" className="xpl-clear-link" onClick={() => setSuccess('')}>{t('action.close')}</button></div>}

      {/* Batch print progress — shown only while a batch (started from the selection
          toolbar below) is stepping through its queue. Cancelling here stops the
          batch and leaves any remaining cheques unprinted, same as dismissing the
          per-cheque confirm/reprint-reason modal mid-batch. */}
      {batchTotal > 0 && (
        <div className="chqx-batch-bar">
          <span className="xpl-spin" aria-hidden="true" />
          <span>{t('msg.cheque.batch_progress', { current: batchCurrent, total: batchTotal })}</span>
          <Button variant="ghost" small icon="close" onClick={() => finishChequeBatch('stopped')} style={{ marginInlineStart: 'auto' }}>
            {t('action.cheque.batch_cancel')}
          </Button>
        </div>
      )}

      {/* Hero + KPIs
          ملاحظة نطاق: قيمة الإجمالي/الأعلى/المتوسط تُحسب من الشيكات المحمّلة في هذه الصفحة فقط
          (valueKpis)، بينما عدّادات الحالة (مسودة/مطبوع/ملغى) إجمالية من الخادم (stats).
          نوضّح ذلك في العناوين حتى لا تُقرأ الأرقام كإجمالي عام. */}
      <div className="chqx-metrics">
        <HeroMetric icon="account_balance_wallet" label={t('kpi.cheques.page_value_label')} value={<MoneyText value={valueKpis.totalValue} />} sub={<><span className="material-symbols-outlined">receipt_long</span>{t('kpi.cheques.page_value_sub', { shown: cheques.length, total: stats.total })}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="edit_note" tone="orange" label={t('stat.cheques.draft')} value={stats.draft} />
          <MetricCard icon="print" tone="green" label={t('stat.cheques.printed')} value={stats.printed} />
          <MetricCard icon="block" tone="red" label={t('stat.cheques.cancelled')} value={stats.cancelled} />
          <MetricCard icon="trending_up" tone="blue" label={t('kpi.cheques.highest_page')} value={<MoneyText value={valueKpis.highest} />} />
          <MetricCard icon="functions" tone="indigo" label={t('kpi.cheques.average_page')} value={<MoneyText value={valueKpis.average} />} />
        </div>
      </div>

      {/* Printing & actions toolbar — the decorative on-screen cheque preview was
          removed to reclaim the workspace; the hidden print layer (.cheque-print-only)
          and every handler (handlePrint / printProvider / calibration) are unchanged. */}
      <SectionCard title={t('sec.printing')} icon="print" actions={printTarget ? chequeChip(printTarget.status, t) : undefined}>
        {/* إجراءات الطباعة والمعايرة في شريط أدوات واحد متماسك — لا تغيير على المعالِجات
            (handlePrint / printProvider / printCurrentView / المعايرة). */}
        <div className="chqx-print-toolbar">
          {canPrint && (
            <label className="chqx-print-method">
              <span className="chqx-print-method-label">طريقة الطباعة</span>
              <select
                className="xpl-select"
                value={printProvider}
                onChange={(e) => handleProviderChange(e.target.value as PrintProvider)}
                aria-label="طريقة الطباعة"
              >
                <option value="classic">النظام الكلاسيكي</option>
                <option value="template-real">قالب الشيك (178 × 89 مم)</option>
                <option value="template-a4">قالب A4</option>
              </select>
            </label>
          )}
          {canPrint && canCalibrate && (
            <label className="chqx-default-provider" title="حفظ طريقة الطباعة المختارة كافتراضي دائم للنظام">
              <input
                type="checkbox"
                checked={makeDefault}
                onChange={(e) => handleMakeDefaultToggle(e.target.checked)}
              />
              <span>تعيين كافتراضي</span>
            </label>
          )}
          {canPrint && <Button variant="primary" icon="print" busy={saving} disabled={!isPrintable} onClick={handlePrint}>{t('page.cheques.print')}</Button>}
          {canPrint && isPrintedCheque && <Button variant="secondary" icon="receipt_long" busy={pvLoading} onClick={handlePrintPaymentVoucher}>{t('action.cheque.print_voucher')}</Button>}
          {canCalibrate && <span className="chqx-toolbar-sep" aria-hidden="true" />}
          {canCalibrate && <Button variant="ghost" icon="tune" onClick={() => setShowCalibrator(true)}>{t('action.cheque.calibrate_print')}</Button>}
          {canCalibrate && <Button variant="ghost" icon="restart_alt" busy={restoringDefault} onClick={() => setShowRestoreConfirm(true)}>{t('action.restore_default')}</Button>}
          {canCancel && printTarget && printTarget.status === 'DRAFT' && <Button variant="danger" icon="block" busy={busy} onClick={() => setCancelConfirmCheque(printTarget)}>{t('page.cheques.cancel_cheque')}</Button>}
        </div>
        {!printTarget && <p className="chqx-preview-hint">{t('hint.cheque.save_first')}</p>}
        {printTarget?.status === 'DRAFT' && <p className="chqx-preview-hint">{t('hint.cheque.check_alignment')}</p>}
        {printTarget?.status === 'CANCELLED' && <p className="chqx-preview-hint warn">{t('error.cheque.is_cancelled')}</p>}
        {printTarget?.status === 'PRINTED' && <p className="chqx-preview-hint">{printTarget.paymentVoucherNumber ? t('lbl.cheque.pv_number_prefix', { number: printTarget.paymentVoucherNumber }) : t('hint.cheque.create_voucher')}</p>}
      </SectionCard>

      {/* Sticky filters */}
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={historySearch} onChange={(v) => { setHistorySearch(v); setPage(1); }} placeholder={t('action.search_placeholder')} ariaLabel={t('action.search_placeholder')} />
          {hasFilters && <button type="button" className="xpl-clear-link" onClick={() => { setHistorySearch(''); setHistoryStatus(''); sort.reset(); setPage(1); }}>{t('action.reset_filters')}</button>}
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={historyStatus === v} onClick={() => { setHistoryStatus(v); setPage(1); }}>{l}</FilterChip>)}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? cheques.length} {t('unit.cheque')}</span>
        </div>
      </div>

      {/* Selection toolbar — shown once at least one row is checked. Batch actions
          orchestrate the EXISTING single-print path sequentially (see handlePrintSelectedCheques /
          handlePrintSelectedVouchers); the "single vs multiple" wording is cosmetic only. */}
      {selectedIds.size > 0 && batchTotal === 0 && (
        <div className="chqx-batch-bar">
          <span className="material-symbols-outlined" aria-hidden="true">checklist</span>
          <span>{t('msg.cheque.selected_count', { count: selectedIds.size })}</span>
          <div className="chqx-toolbar-sep" aria-hidden="true" />
          {/* Batch cheque printing now works through whichever provider is currently
              selected (Classic / Template Real 178×89 / Template A4) — it never
              switches provider itself. See handlePrintSelectedCheques. */}
          {canPrint && (
            <Button variant="primary" icon="print" onClick={handlePrintSelectedCheques}>
              {selectedIds.size === 1 ? t('page.cheques.print') : t('action.cheque.print_selected')}
            </Button>
          )}
          {canPrint && (
            <Button variant="secondary" icon="receipt_long" onClick={handlePrintSelectedVouchers}>
              {selectedIds.size === 1 ? t('action.cheque.print_voucher') : t('action.cheque.print_selected_vouchers')}
            </Button>
          )}
          <Button variant="ghost" icon="close" onClick={clearSelection} style={{ marginInlineStart: 'auto' }}>
            {t('action.clear_selection')}
          </Button>
        </div>
      )}

      {/* History table */}
      <section className="xpl-card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div>
        ) : cheques.length === 0 ? (
          <EmptyState icon="receipt_long" tone="neutral" title={t('empty.cheques')}
            message={hasFilters ? t('empty.cheques.no_match_filters') : undefined}
            action={hasFilters ? <Button variant="secondary" icon="restart_alt" onClick={() => { setHistorySearch(''); setHistoryStatus(''); sort.reset(); setPage(1); }}>{t('action.reset_filters')}</Button>
              : canCreate ? <Button variant="primary" icon="add" onClick={openNew}>{t('page.cheques.new')}</Button> : undefined} />
        ) : (
          <>
            <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="xpl-table">
                <thead>
                  <tr>
                    <th style={{ width: 36, textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => { if (el) el.indeterminate = someVisibleSelected; }}
                        onChange={toggleSelectAllVisible}
                        aria-label={t('a11y.cheque_select_all')}
                      />
                    </th>
                    <SortableHeader label={t('col.cheque.number')} title={t('col.cheque.number')} state={sort.getState('chequeNumber')} onToggle={() => sort.toggle('chequeNumber')} />
                    <SortableHeader label={t('col.cheque.beneficiary')} title={t('col.cheque.beneficiary')} state={sort.getState('beneficiaryName')} onToggle={() => sort.toggle('beneficiaryName')} />
                    <SortableHeader label={t('col.cheque.bank')} title={t('col.cheque.bank')} state={sort.getState('bankName')} onToggle={() => sort.toggle('bankName')} />
                    <SortableHeader label={t('col.cheque.amount')} title={t('col.cheque.amount')} state={sort.getState('amount')} onToggle={() => sort.toggle('amount')} />
                    <SortableHeader label={t('col.cheque.date')} title={t('col.cheque.date')} state={sort.getState('chequeDate')} onToggle={() => sort.toggle('chequeDate')} />
                    <SortableHeader label={t('col.cheque.status')} title={t('col.cheque.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
                    <SortableHeader label={t('col.cheque.pv_number')} title={t('col.cheque.pv_number')} state={sort.getState('paymentVoucherNumber')} onToggle={() => sort.toggle('paymentVoucherNumber')} />
                    <th aria-label={t('a11y.open_row')} />
                  </tr>
                </thead>
                <tbody>
                  {cheques.map((r) => (
                    <tr key={r.id} className={`xpl-row--click${selectedIds.has(r.id) ? ' chqx-row--selected' : ''}`} tabIndex={0} role="button"
                      aria-label={t('a11y.cheque_details', { number: r.chequeNumber })}
                      onClick={() => setViewing(r)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setViewing(r); } }}>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          aria-label={t('a11y.cheque_select_row', { number: r.chequeNumber })}
                        />
                      </td>
                      <td><span className="chqx-mono"><strong>{r.chequeNumber}</strong></span></td>
                      <td><strong>{r.beneficiaryName}</strong></td>
                      <td>{bankLabel(r.bankName, t)}</td>
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
                  <span className="xpl-drawer-hero-sub">{viewing.beneficiaryName} · {bankLabel(viewing.bankName, t)}</span>
                  <div style={{ marginTop: 4 }}>{chequeChip(viewing.status, t)}</div>
                </div>
              </div>
              <DrawerQuickActions actions={chequeQuickActions} />
            </>
          }
        >
          <DrawerSection title={t('sec.basic_info')}>
            <DrawerField label={t('col.cheque.number')} value={viewing.chequeNumber} mono />
            <DrawerField label={t('col.cheque.date')} value={formatDate(viewing.chequeDate)} />
            <DrawerField label={t('col.cheque.beneficiary')} value={viewing.beneficiaryName} />
            <DrawerField label={t('col.cheque.amount')} value={<span className="money-cell">{fmtAmount(viewing.amount, viewing.currency)}</span>} />
          </DrawerSection>
          {viewing.currency === 'KWD' && Number(viewing.amount) > 0 && (
            <DrawerSection title={t('lbl.cheque.tafqeet')}>
              <div className="chqx-tafqeet">{amountToWordsKWD(Number(viewing.amount), 'ar')}</div>
            </DrawerSection>
          )}
          <DrawerSection title={t('sec.cheque.bank_info')}>
            <DrawerField label={t('col.cheque.bank')} value={bankLabel(viewing.bankName, t)} />
            <DrawerField label={t('field.cheque.currency')} value={viewing.currency} />
          </DrawerSection>
          <DrawerSection title={t('sec.printing')}>
            <DrawerField label={t('col.cheque.status')} value={chequeChip(viewing.status, t)} />
            <DrawerField label={t('field.cheque.printed_at')} value={viewing.printedAt ? formatDate(viewing.printedAt) : '—'} />
            <DrawerField label={t('col.cheque.pv_number')} value={viewing.paymentVoucherNumber ?? '—'} mono />
          </DrawerSection>
          <DrawerSection title={t('sec.cheque.print_log')}>
            {printLogsLoading ? (
              <DrawerField label="—" value={t('msg.loading')} />
            ) : printLogs.length === 0 ? (
              <DrawerField label="—" value={t('empty.cheque.print_log')} />
            ) : (
              <div className="chqx-printlog">
                {printLogs.map((log) => (
                  <div key={log.id} className="chqx-printlog-row">
                    <span className="chqx-printlog-seq">{log.sequence === 1 ? t('lbl.cheque.first_print') : t('lbl.cheque.reprint_n', { n: log.sequence - 1 })}</span>
                    <span className="chqx-printlog-meta">
                      {formatDate(log.printedAt)}
                      {log.printedByName ? ` · ${log.printedByName}` : ''}
                      {log.reason ? ` · ${reprintReasonLabel(log.reason, t)}` : ''}
                      {log.note ? ` · ${log.note}` : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <DrawerSection title={t('sec.record_history')}>
            <DrawerField label={t('col.created_at')} value={formatDate(viewing.createdAt)} />
            {viewing.cancelledAt && <DrawerField label={t('field.cheque.cancelled_at')} value={formatDate(viewing.cancelledAt)} />}
          </DrawerSection>
          {(viewing.description || viewing.notes) && (
            <DrawerSection title={t('field.notes')}>
              {viewing.description && <DrawerField label={t('field.cheque.description')} value={viewing.description} />}
              {viewing.notes && <DrawerField label={t('field.cheque.notes')} value={viewing.notes} />}
            </DrawerSection>
          )}
          <DrawerSection title={t('sec.technical_info')}>
            <DrawerField label={t('field.internal_id')} value={`#${viewing.id}`} mono />
          </DrawerSection>
        </Drawer>
      )}

      {/* ── Editor dialog ── */}
      {editorOpen && (
        <Dialog
          icon={editId ? 'edit' : 'add_card'}
          title={editId ? `${t('page.cheques.form')} #${editId}` : t('page.cheques.new')}
          subtitle={editId ? form.chequeNumber : t('page.cheques.new_subtitle')}
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
          <DialogSection title={t('sec.basic_info')} icon="badge">
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

          <DialogSection title={t('sec.amounts')} icon="payments">
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
                <label>{t('lbl.cheque.tafqeet')}</label>
                <div className="chqx-tafqeet">{amountToWordsKWD(Number(form.amount), 'ar')}</div>
              </div>
            )}
          </DialogSection>

          <DialogSection title={t('sec.bank')} icon="account_balance">
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.bank')} <span className="req">*</span></label>
              <select className="xpl-select" value={form.bankName} onChange={(e) => field('bankName', e.target.value)} disabled aria-label={t('field.cheque.bank')}>
                {KUWAITI_BANKS.map((bank) => <option key={bank} value={bank}>{bankLabel(bank, t)}</option>)}
              </select>
            </div>
          </DialogSection>

          <DialogSection title={t('field.notes')} icon="sticky_note_2">
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
          message={batchTotal > 0 ? `${t('msg.cheque.batch_progress', { current: batchCurrent, total: batchTotal })} — ${t('page.cheques.confirm_printed')}` : t('page.cheques.confirm_printed')}
          confirmLabel={t('page.cheques.mark_printed')}
          variant="warning"
          onConfirm={canPrint ? handleMarkPrinted : cancelPrintConfirm}
          onCancel={cancelPrintConfirm}
        />
      )}
      {forceDeleteId !== null && (
        <ForceDeleteChequeModal
          chequeId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); setSuccess(t('msg.cheque.force_deleted')); loadData(page); }}
        />
      )}

      {/* Reprint reason — required before re-printing an already-printed cheque */}
      {showReprintModal && printTarget && (
        <Dialog
          icon="print"
          title={t('page.cheques.reprint_title')}
          subtitle={batchTotal > 0 ? `${t('msg.cheque.batch_progress', { current: batchCurrent, total: batchTotal })} · ${printTarget.chequeNumber} · ${printTarget.beneficiaryName}` : `${printTarget.chequeNumber} · ${printTarget.beneficiaryName}`}
          size="sm"
          onClose={cancelReprintModal}
          footer={
            <>
              <Button variant="primary" icon="print" busy={reprintBusy} disabled={!reprintReason} onClick={handleConfirmReprint}>{t('action.cheque.record_reprint')}</Button>
              <Button variant="ghost" onClick={cancelReprintModal}>{t('action.cancel')}</Button>
            </>
          }
        >
          <DialogSection title={t('sec.cheque.reprint_reason')} icon="help">
            <p className="chqx-preview-hint" style={{ textAlign: 'start', margin: '0 0 8px' }}>
              {t('msg.cheque.reprint_notice')}
            </p>
            <div className="xpl-field xpl-field--full">
              <label>{t('field.reason')} <span className="req">*</span></label>
              <select className="xpl-select" value={reprintReason} onChange={(e) => setReprintReason(e.target.value as ReprintReason)} aria-label={t('sec.cheque.reprint_reason')}>
                <option value="">{t('opt.select_reason')}</option>
                {REPRINT_REASONS.map((r) => <option key={r} value={r}>{t(REPRINT_REASON_KEYS[r])}</option>)}
              </select>
            </div>
            <div className="xpl-field xpl-field--full">
              <label>{t('field.note_optional')}</label>
              <input className="xpl-input" value={reprintNote} onChange={(e) => setReprintNote(e.target.value)} placeholder={t('ph.additional_details')} maxLength={300} aria-label={t('a11y.cheque_reprint_note')} />
            </div>
          </DialogSection>
        </Dialog>
      )}

      {cancelConfirmCheque !== null && (
        <ConfirmModal title={t('page.cheques.cancel_cheque')} message={t('page.cheques.confirm_cancel')} variant="warning" onConfirm={() => executeCancel(cancelConfirmCheque)} onCancel={() => setCancelConfirmCheque(null)} />
      )}
      {showRestoreConfirm && (
        <ConfirmModal message={t('confirm.cheque.restore_default', { bank: bankLabel(form.bankName, t) })} variant="warning" onConfirm={executeRestoreDefault} onCancel={() => setShowRestoreConfirm(false)} />
      )}
    </div>
  );
}
