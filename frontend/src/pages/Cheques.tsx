import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChequeTrackingInfo } from '../utils/chequePrintTracking';
import { useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { amountToWordsKWD } from '../lib/tafqeet';
import { formatDate, todayDateOnly } from '../lib/date';
import { normalizeDateOnly } from '../lib/dateInput';
import { formatNumber } from '../lib/format';
import { PageMeta } from '../components/DataTable';
import { useTableSort } from '../hooks/useTableSort';
import SortableHeader from '../components/SortableHeader';
import DateInput from '../components/DateInput';
import ConfirmModal from '../components/ConfirmModal';
import ForceDeleteChequeModal from '../components/ForceDeleteChequeModal';
import ChequeStudioOverlay from '../components/ChequeStudioOverlay';
import {
  buildChequePrintJob,
  chequeProfilePrintability,
  PROFILE_NOT_CALIBRATED_MESSAGE,
  CALIBRATION_PROFILES,
  CALIBRATION_PROFILE_LABELS,
  DEFAULT_CALIBRATION_PROFILE,
  DEFAULT_PROFILE_SETTING_KEY,
  GULF_A4_CALIBRATION_SETTING_GROUP,
  profileDocumentFromSettings,
  readDefaultCalibrationProfile,
  profilePlacementMm,
  resolveBankChequeProfile,
} from '../modules/chequePrint';
import type { BankChequeProfileDefinition, CalibrationProfileId, GulfA4Profile } from '../modules/chequePrint';
import { buildChequeRuntimeData } from '../components/chequeTemplateManager/chequeRuntimeData';
import type { ChequeRecordInput } from '../components/chequeTemplateManager/chequeRuntimeData';
import { fetchAllRows, downloadTableExcel } from '../utils/exportUtils';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { listBankAccounts, PRINT_PROFILE_MISSING_MESSAGE } from '../api/banks';
import type { BankAccount } from '../api/banks';
import { REPRINT_REASON_KEYS, bankLabel } from '../utils/chequeTemplate';
import type { ChequePrintLogRow } from '../utils/chequeTemplate';
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
import { UI_FONT_STACK } from '../styles/fontRegistry';

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
  /** الحساب البنكي المُصدِر — `null` لشيكات Legacy التي لم تُربَط بحساب. */
  bankAccountId: number | null;
  bankAccount: { id: number; accountName: string; bankNameAr: string; label: string; isActive: boolean } | null;
  /** هل لحساب هذا الشيك قالب طباعة معتمد؟ يقرّره الخادم، والواجهة تحرس به فقط. */
  printEnabled: boolean;
  status: string;
  printedAt: string | null;
  cancelledAt: string | null;
  notes: string | null;
  paymentVoucherNumber: string | null;
  createdAt: string;
}

interface ChequeStats { total: number; draft: number; printed: number; cancelled: number; printedTotal?: number; }

interface FormState {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: string;
  currency: string;
  description: string;
  /** هوية البنك في النموذج — الحساب، لا اسم بنك نصي. '' = لم يُختَر بعد. */
  bankAccountId: string;
  notes: string;
}

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';

/**
 * الشيكات تُطبع بقالب واحد معتمد لا غير: «قالب شيك الخليج» (`gulf-a4`).
 *
 * لم يعد هناك منتقي «طريقة الطباعة»: القوالب البديلة (Classic، قالب الشيك
 * 178×89، قالب A4 العام، قوالب المصمّم) أُزيلت من مسار عمل الشيكات، فالمعاينة
 * والمعايرة والطباعة تعمل جميعها مباشرة على هذا القالب.
 *
 * ما دون ذلك لم يتغيّر: نفس محرك التشغيل، نفس سطح الرسم، نفس صفحة الطباعة،
 * نفس Print IPC، ونفس استوديو المعايرة الاحترافي.
 */

/**
 * قالب كل بنك يُحسم من سجل البنوك، لا من اسم نصّي.
 *
 * «قالب شيك الخليج» هو القالب المعتمد الوحيد اليوم؛ قالبا بيت التمويل والوطني
 * مسجّلان لكنهما بلا شيك أصلي مقيس بعد، فيُرفضان للطباعة برسالة صريحة بدل
 * السقوط على هندسة الخليج — انظر `bankChequeProfiles`.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────

function defaultForm(): FormState {
  const today = todayDateOnly();
  // لا بنك افتراضي مثبّت بعد الآن: الحساب يُختار من البيانات الفعلية، ويُملأ
  // تلقائيًا حين يوجد حساب نشط واحد لا غير (انظر `useEffect` التعبئة التلقائية).
  return { chequeNumber: '', chequeDate: today, beneficiaryName: '', amount: '', currency: 'KWD', description: '', bankAccountId: '', notes: '' };
}

const STATUS_META: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'cheque.status.draft', tone: 'orange', icon: 'edit_note' },
  PRINTED: { key: 'cheque.status.printed', tone: 'green', icon: 'print' },
  CANCELLED: { key: 'cheque.status.cancelled', tone: 'red', icon: 'block' },
};
function chequeChip(status: string, t: (k: string) => string) {
  const m = STATUS_META[status] ?? { key: status, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
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

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Cheques() {
  const { hasPermission, isSystemAdmin: getIsSystemAdmin } = useAuth();
  const { t } = useT();
  const { period } = useFinancialPeriod();
  const navigate = useNavigate();

  const [cheques, setCheques] = useState<Cheque[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [stats, setStats] = useState<ChequeStats>({ total: 0, draft: 0, printed: 0, cancelled: 0, printedTotal: 0 });
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
  const [showCalibrator, setShowCalibrator] = useState(false);
  // 'loading' until /settings resolves; production printing is blocked until then
  // so an unconfirmed calibration can never be used as an accidental production
  // fallback.
  const [printConfigState, setPrintConfigState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [exportingExcel, setExportingExcel] = useState(false);
  // ── سجل البنوك والحسابات (Multi-Bank Cheques Foundation v1) ────────────────
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [accountsState, setAccountsState] = useState<'loading' | 'ready' | 'error'>('loading');
  /** إعدادات الخادم الخام — منها تُقرأ معايرة «قالب شيك الخليج» المحفوظة. */
  const [rawSettings, setRawSettings] = useState<{ key: string; value: string }[]>([]);
  /** ما حُفظ من معايرات في هذه الجلسة — مفهرسة بـ«البنك:البروفايل» ليظهر فورًا. */
  const [savedCalibrations, setSavedCalibrations] = useState<Record<string, GulfA4Profile>>({});
  /**
   * بروفايل المعايرة المختار (المكتب / البيت / أخرى).
   *
   * الاختيار يدوي دائمًا — لا ربط بطابعة ولا اكتشاف تلقائي — لكنه **يُحفظ**:
   * الصفحة تبدأ بآخر بروفايل اختاره المستخدم، ولا تعود إلى «المكتب» من تلقائها.
   * «المكتب» قيمة أول تشغيل فقط، إلى أن يُحفظ اختيار.
   *
   * هذه الحالة الواحدة تخدم الصفحة والاستوديو معًا (يُمرَّر إليه أدنى الملف)،
   * فلا يمكن أن تعاين ببروفايل وتطبع بآخر.
   */
  const [printCalibrationProfile, setPrintCalibrationProfile] =
    useState<CalibrationProfileId>(DEFAULT_CALIBRATION_PROFILE);
  const [busy, setBusy] = useState(false);
  const [cancelConfirmCheque, setCancelConfirmCheque] = useState<Cheque | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [viewing, setViewing] = useState<Cheque | null>(null);
  const [forceDeleteId, setForceDeleteId] = useState<number | null>(null);
  const [printLogs, setPrintLogs] = useState<ChequePrintLogRow[]>([]);
  const [printLogsLoading, setPrintLogsLoading] = useState(false);
  // ── Multi-selection & batch printing (Cheque Multi-Selection & Batch Printing Pack v1) ──
  // Selection is an id Set independent of the loaded page, so it survives sorting/
  // filtering/pagination; batch actions operate on whichever selected rows are
  // currently loaded in `cheques`. The batch itself drives the EXISTING single-print
  // handlers (handlePrint branches, handleMarkPrinted, handleConfirmReprint) one
  // cheque at a time — no parallel print jobs, no duplicated print logic.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
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
      setStats(statsRes.data.data ?? { total: 0, draft: 0, printed: 0, cancelled: 0, printedTotal: 0 });
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

  // ── Load the saved cheque calibration from Settings on mount ───────────────

  useEffect(() => {
    api.get('/settings').then((res) => {
      const settings = res.data?.data?.settings ?? [];
      setRawSettings(settings);
      // البروفايل الافتراضي المحفوظ — آخر ما اختاره المستخدم، أو «المكتب» في
      // أول تشغيل وعند أي قيمة غير صالحة.
      setPrintCalibrationProfile(readDefaultCalibrationProfile(settings));
      setPrintConfigState('ready');
    }).catch(() => {
      // Printing stays blocked with a visible error rather than falling back to
      // an unconfirmed calibration — see `assertPrintReady`.
      setRawSettings([]);
      setPrintConfigState('error');
    });
  }, []);

  // ── سجل الحسابات البنكية (منتقي نموذج الشيك) ────────────────────────────────
  //
  // مستقل عن بوابة الطباعة عمدًا: الطباعة تُحرَس بـ`printEnabled` الذي يرسله
  // الخادم مع كل شيك، فتعذّر تحميل هذه القائمة يعطّل **إنشاء** شيك جديد فقط
  // ولا يفتح أي ثغرة طباعة، ولا يمنع طباعة شيك قائم.
  const loadAccounts = useCallback(async () => {
    setAccountsState('loading');
    try {
      setAccounts(await listBankAccounts({ activeOnly: true }));
      setAccountsState('ready');
    } catch {
      setAccounts([]);
      setAccountsState('error');
    }
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  /** معرّف الحساب حين يوجد حساب نشط واحد لا غير — وإلا '' فيختار المستخدم. */
  const soleActiveAccountId = accounts.length === 1 ? String(accounts[0].id) : '';

  // حساب نشط واحد فقط ⇒ يُحدَّد تلقائيًا، فلا خطوة إضافية على المستخدم في
  // الحالة الشائعة (حساب بنك الخليج الرئيسي وحده). أكثر من حساب ⇒ يختار.
  // هذا التأثير يغطي وصول الحسابات **بعد** فتح النموذج؛ فتحه بعد وصولها يغطيه
  // `resetForm` أدناه.
  useEffect(() => {
    if (!soleActiveAccountId) return;
    setForm((f) => (f.bankAccountId ? f : { ...f, bankAccountId: soleActiveAccountId }));
  }, [soleActiveAccountId]);

  /**
   * وثيقة معايرة قالب بنكٍ ما على بروفايل الطباعة المختار.
   *
   * الهوية «قالب البنك + بروفايل المعايرة»: تُقرأ من صفّ الإعدادات الخاص بهذا
   * الزوج وحده، مع أولوية لما حُفظ في هذه الجلسة حتى يُطبَّق فورًا على المعاينة
   * والطباعة بلا إعادة تحميل. حين لا يوجد صفّ محفوظ تبقى الهندسة الأساسية
   * المقيسة للبنك نفسه — لا استعارة من بنك ولا من بروفايل آخر.
   */
  function calibrationDocumentFor(
    bankProfile: BankChequeProfileDefinition | null,
    calibrationProfile: CalibrationProfileId,
  ): GulfA4Profile | null {
    if (!bankProfile) return null;
    return savedCalibrations[`${bankProfile.bankCode}:${calibrationProfile}`]
      ?? profileDocumentFromSettings(bankProfile, rawSettings, calibrationProfile);
  }

  /**
   * اختيار بروفايل المعايرة — من الصفحة أو من الاستوديو، فالمصدر واحد.
   *
   * يُطبَّق فورًا على المعاينة والطباعة، ويُحفظ كالافتراضي الدائم في صفّ إعدادات
   * واحد لا يحمل أي هندسة. تعذّر الحفظ لا يُلغي الاختيار في هذه الجلسة — يبقى
   * ما اختاره المستخدم فاعلاً، ولا يُستبدل بصمت ببروفايل آخر.
   */
  function chooseCalibrationProfile(next: CalibrationProfileId) {
    setPrintCalibrationProfile(next);
    setRawSettings((prev) => [
      ...prev.filter((s) => s.key !== DEFAULT_PROFILE_SETTING_KEY),
      { key: DEFAULT_PROFILE_SETTING_KEY, value: next },
    ]);
    api.put('/settings', {
      settings: [{
        key: DEFAULT_PROFILE_SETTING_KEY,
        value: next,
        group: GULF_A4_CALIBRATION_SETTING_GROUP,
      }],
    }).catch(() => setFormError('تعذّر حفظ بروفايل الطباعة الافتراضي.'));
  }

  /** الحساب المختار في النموذج (لشيك جديد أو أثناء التعديل). */
  const selectedAccount = useMemo(
    () => accounts.find((a) => String(a.id) === form.bankAccountId) ?? null,
    [accounts, form.bankAccountId],
  );

  /**
   * هل الطباعة/المعاينة مسموحة للشيك الذي بين اليدين؟
   *
   * لشيك محفوظ: من `printEnabled` الذي يرسله الخادم مع الشيك نفسه — فلا تعتمد
   * البوابة على قائمة الحسابات وقد تفشل. لمسودة غير محفوظة: من الحساب المختار.
   *
   * حساب بلا قالب طباعة معتمد لا يطبع ولا يعاين، ولا يرث قالب بنك الخليج ولا
   * صورته ولا مقاساته ولا معايرته — لا يوجد fallback من أي نوع.
   */
  const printEnabledForTarget = printTarget ? printTarget.printEnabled : (selectedAccount?.printEnabled ?? false);

  // ── Print configuration readiness (settings load race) ──────────────────────
  // The saved calibration is filled asynchronously from /settings. A print issued
  // in that window would use the factory geometry rather than the operator's saved
  // calibration — geometry chosen by timing. Production printing is gated on this
  // until the real configuration is known.
  const printReady = printConfigState === 'ready';

  function assertPrintReady(cheque?: Cheque): boolean {
    if (!printReady) {
      setFormError(printConfigState === 'error'
        ? 'تعذّر تحميل إعدادات الطباعة. أعد تحميل الصفحة قبل الطباعة — لن تتم الطباعة بإعدادات غير مؤكدة.'
        : 'جارٍ تحميل إعدادات الطباعة… حاول بعد لحظة.');
      return false;
    }
    return assertAccountPrintable(cheque);
  }

  /**
   * بوابة الحساب البنكي (Multi-Bank Cheques Foundation v1).
   *
   * حساب بلا قالب طباعة معتمد لا يطبع ولا يعاين — فلا تسريب لقالب بنك الخليج
   * ولا لصورته ولا لمقاساته إلى أي بنك آخر. المصدر يختلف بحسب ما بين اليدين:
   *   • شيك محفوظ ⇒ `printEnabled` الذي أرسله الخادم مع الشيك نفسه؛
   *   • مسودة غير محفوظة اختير لها حساب ⇒ رايةُ ذلك الحساب؛
   *   • مسودة بلا حساب مختار ⇒ تمرّ من هنا عمدًا: لا يوجد حساب غير مهيأ لتحرسه
   *     هذه البوابة، و`validateForm` هو من يرفض بالرسالة الصحيحة («الحساب
   *     البنكي مطلوب») بدل رسالة قالب طباعة لا تصف المشكلة.
   */
  function assertAccountPrintable(cheque?: Cheque): boolean {
    const target = cheque ?? printTarget;
    const enabled = target
      ? target.printEnabled
      : (form.bankAccountId ? (selectedAccount?.printEnabled ?? false) : true);
    if (!enabled) {
      setFormError(PRINT_PROFILE_MISSING_MESSAGE);
      return false;
    }
    return true;
  }


  // ── Form handlers ─────────────────────────────────────────────────────────

  function field(name: keyof FormState, value: string) { setForm((f) => ({ ...f, [name]: value })); }

  function resetForm() {
    // الحساب الوحيد يُحدَّد هنا أيضًا لا في التأثير وحده: التأثير يعمل حين تصل
    // الحسابات، أما فتح نموذج جديد **بعد** وصولها فيمرّ من هذا المسار فقط، وكان
    // يفرغ الاختيار فيضطر المستخدم لإعادة انتقاء حسابه الوحيد في كل شيك.
    setForm({ ...defaultForm(), bankAccountId: soleActiveAccountId });
    setEditId(null);
    setPrintTarget(null);
    setFormError('');
    setSuccess('');
  }

  function loadChequeIntoForm(cheque: Cheque) {
    setForm({
      chequeNumber: cheque.chequeNumber,
      // Printed Cheque Edit Data & Date Integrity Fix v1 — `form.chequeDate` is the
      // canonical 'YYYY-MM-DD' contract `DateInput` and `handleSave`'s payload both
      // require (see lib/dateInput.ts). It used to be seeded with a DD/MM/YYYY DISPLAY
      // string (via the shared display formatter), meant for read-only rendering. Fed
      // into `DateInput` as `value`, that string doesn't match the ISO shape `DateInput`
      // expects, so the visible field rendered blank on every open. Worse: if the user
      // never touched the
      // date, `handleSave` forwarded that DD/MM/YYYY string to the API completely
      // unconverted, and the backend's `z.coerce.date()` parses a non-ISO slash-separated
      // string as the browser/Node's ambiguous MM/DD/YYYY — silently rewriting, e.g.,
      // 02/08/2026 (2 August) to 8 February on nothing more than an amount-only edit.
      // `normalizeDateOnly` is the project's existing pure-string ISO extractor (no
      // `Date` construction on the value path, so no timezone-driven day shift either).
      chequeDate: normalizeDateOnly(cheque.chequeDate),
      beneficiaryName: cheque.beneficiaryName,
      amount: String(cheque.amount),
      currency: cheque.currency,
      description: cheque.description ?? '',
      // شيك Legacy بلا حساب مربوط يفتح بمنتقٍ فارغ: لا يُخمَّن له حساب، ويختاره
      // المستخدم بنفسه إن أراد ربطه.
      bankAccountId: cheque.bankAccountId != null ? String(cheque.bankAccountId) : '',
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
    if (!form.bankAccountId) return t('error.cheque.bank_account_required');
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
        bankAccountId: Number(form.bankAccountId),
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

  // Batch cheque printing hands the whole queue to the existing
  // ChequeTemplatePrintPage in ONE navigation; that page browses the items
  // in-page and carries tracking gated on the real print result — see it.
  async function handlePrintSelectedCheques() {
    // Settings gate — see `printReady`. Never print before the saved calibration
    // has loaded.
    if (!assertPrintReady()) return;
    const items = cheques.filter((c) => selectedIds.has(c.id) && c.status !== 'CANCELLED');
    if (!items.length) { setFormError(t('error.cheque.batch_none_printable')); return; }

    // بوابة الحساب البنكي على مستوى الدفعة كاملة.
    // الرفض صريح ولا تُسقَط العناصر غير القابلة للطباعة بصمت: إسقاطها كان
    // سيطبع البقية ويترك المستخدم يظن أن كل ما اختاره طُبع.
    const blocked = items.filter((c) => !c.printEnabled);
    if (blocked.length) {
      setFormError(`${PRINT_PROFILE_MISSING_MESSAGE} (${blocked.map((c) => c.chequeNumber).join('، ')})`);
      return;
    }

    // القالب والمعايرة يُحسمان مرة واحدة للدفعة كلها، فلا تنزلق الهندسة من عنصر
    // إلى آخر وتطابق تمامًا طباعة أي من هذه الشيكات منفردًا — لا يتغير إلا
    // runtimeData. الدفعة تُرفض كاملة ولا تُطبع جزئيًا.
    const uncalibrated = items.filter((c) => !chequePrintability(c).ok);
    if (uncalibrated.length) {
      const first = chequePrintability(uncalibrated[0]);
      const reason = first.ok ? PROFILE_NOT_CALIBRATED_MESSAGE : first.message;
      setFormError(`${reason} (${uncalibrated.map((c) => c.chequeNumber).join('، ')})`);
      return;
    }
    const batchBankProfile = bankProfileForCheque(items[0])!;
    // دفعة واحدة = قالب بنك واحد. خلط بنكين يعني طباعة أحدهما بهندسة الآخر،
    // فالرفض هنا صريح بدل أن يُطبع شيك بمعايرة لا تخصّه.
    const foreign = items.filter((c) => bankProfileForCheque(c)?.bankCode !== batchBankProfile.bankCode);
    if (foreign.length) {
      setFormError(`لا يمكن طباعة دفعة تجمع قوالب بنوك مختلفة (${foreign.map((c) => c.chequeNumber).join('، ')})`);
      return;
    }
    const batchDocument = calibrationDocumentFor(batchBankProfile, printCalibrationProfile);
    if (!batchDocument) { setFormError(PROFILE_NOT_CALIBRATED_MESSAGE); return; }
    const gulfJob = buildChequePrintJob({
      purpose: 'production',
      template: { id: null, name: batchBankProfile.displayName, source: 'default-template' },
      surface: batchDocument.surface,
      fields: batchDocument.fields,
      paperMode: 'a4',
      items: items.map((c) => ({
        runtimeData: buildChequeRuntimeData(chequeDataForTemplate(c)),
        tracking: trackingInfoFor(c) as ChequeTrackingInfo,
      })),
    });
    clearSelection();
    setFormError('');
    navigate('/cheque-template/print', {
      state: {
        surface: gulfJob.surface,
        fields: gulfJob.fields,
        paperMode: gulfJob.paperMode,
        placement: profilePlacementMm(batchBankProfile, batchDocument.calibration),
        showPreviewBackground: true,
        purpose: gulfJob.purpose,
        templateName: gulfJob.template.name,
        ctppBatchItems: gulfJob.items,
      },
    });
  }

  // ── Print ─────────────────────────────────────────────────────────────────

  // ── Provider routing ────────────────────────────────────────────────────────
  // The cheque data printed — from an explicit cheque (batch),
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
          // بيانات عرض لمحرّك القالب — اسم البنك مشتق من الحساب المختار، لا نص حر.
          bankName: selectedAccount?.bankNameAr ?? '',
        };
  }

  /** The tracking identity (see chequePrintTracking.ts) — undefined
   *  when there is no saved DB record yet (unsaved form draft), so the template
   *  print page attempts no tracking in that case, unchanged from before this pack. */
  function trackingInfoFor(cheque?: Cheque): ChequeTrackingInfo | undefined {
    const source = cheque ?? printTarget;
    return source ? { id: source.id, status: source.status, chequeNumber: source.chequeNumber, beneficiaryName: source.beneficiaryName } : undefined;
  }

  // ── «قالب شيك الخليج» — Gulf Bank A4 profile ────────────────────────────────

  /**
   * Is the cheque at hand drawn on GULF BANK stock?
   *
   * Answered from the EXISTING Multi-Bank registry, not from a new table or a new
   * field: the cheque's own bank account is looked up in the `accounts` list the
   * page already loads, and its `bankCode` decides. Legacy cheques that were never
   * linked to an account (`bankAccountId === null`) fall back to the stored bank
   * name — the same fallback the rest of this page uses for them. No Bank and no
   * BankAccount is created, and the account picker is not touched.
   */
  function bankProfileForCheque(cheque?: Cheque): BankChequeProfileDefinition | null {
    const target = cheque ?? printTarget;
    const accountId = target ? target.bankAccountId : (form.bankAccountId ? Number(form.bankAccountId) : null);
    const account = accountId != null ? accounts.find((a) => a.id === accountId) : null;
    return resolveBankChequeProfile({
      bankCode: account?.bankCode ?? null,
      bankNameAr: target?.bankName ?? selectedAccount?.bankNameAr ?? null,
    });
  }

  /** هل يملك هذا الشيك قالبًا معتمدًا فعلًا (أبعاد + موضع + الحقول الأربعة)؟ */
  function chequePrintability(cheque?: Cheque) {
    return chequeProfilePrintability(bankProfileForCheque(cheque));
  }

  /**
   * Print one cheque with the Gulf Bank A4 profile.
   *
   * Structurally identical to `handleTemplatePrint` — same job builder, same
   * runtime-data builder, same tracking identity, same route, same page. The two
   * differences are deliberate and are the whole point of the profile:
   *   • the surface + fields come from the built-in measured profile rather than
   *     from `resolveDefaultPrintTemplate` (so this print does not depend on which
   *     designer template happens to be flagged default, and cannot be disturbed
   *     by editing one);
   *   • the A4 sheet is given the profile's own cheque-area placement, and the
   *     print page is asked for the screen-only alignment preview.
   */
  function handleGulfA4Print(cheque?: Cheque) {
    // بوابة القالب: لا طباعة إلا بقالب معتمد لبنك هذا الشيك تحديدًا، ولا سقوط
    // على قالب بنك آخر مهما كان.
    const printable = chequePrintability(cheque);
    if (!printable.ok) { setFormError(printable.message); return; }
    // القالب من بنك الشيك، والمعايرة من بروفايل الطباعة المختار — نفس الوثيقة
    // التي تراها المعاينة.
    const bankProfile = bankProfileForCheque(cheque)!;
    const document = calibrationDocumentFor(bankProfile, printCalibrationProfile);
    if (!document) { setFormError(PROFILE_NOT_CALIBRATED_MESSAGE); return; }
    const job = buildChequePrintJob({
      purpose: 'production',
      template: { id: null, name: bankProfile.displayName, source: 'default-template' },
      surface: document.surface,
      fields: document.fields,
      paperMode: 'a4',
      items: [{
        runtimeData: buildChequeRuntimeData(chequeDataForTemplate(cheque)),
        tracking: trackingInfoFor(cheque),
      }],
    });
    setFormError('');
    navigate('/cheque-template/print', {
      state: {
        surface: job.surface,
        fields: job.fields,
        paperMode: job.paperMode,
        placement: profilePlacementMm(bankProfile, document.calibration),
        showPreviewBackground: true,
        purpose: job.purpose,
        templateName: job.template.name,
        runtimeData: job.items[0].runtimeData,
        tracking: job.items[0].tracking,
      },
    });
  }

  async function handlePrint() {
    // Settings gate — never print with an unconfirmed provider/calibration.
    if (!assertPrintReady()) return;
    // Provider-selection layer — dispatch to the chosen existing print system.
    // مسودة لم تُحفظ بعد: تُحفظ أولًا ثم تُطبع — نفس تسلسل الإنشاء السابق تمامًا،
    // فالطباعة لا تتم أبدًا على سجل غير موجود ولا تفوت تتبّع الطباعة.
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
          bankAccountId: Number(form.bankAccountId),
          notes: form.notes.trim() || null,
        };
        const res = await api.post('/cheques', payload);
        const saved: Cheque = res.data.data;
        setEditId(saved.id);
        setPrintTarget(saved);
        await loadData(page);
        handleGulfA4Print(saved);
      } catch (e) {
        setFormError(errorMessage(e));
      } finally {
        setSaving(false);
      }
      return;
    }
    handleGulfA4Print();
  }

  // ── Reprint (logged) ───────────────────────────────────────────────────────

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

  /** قالب البنك الذي سيطبع هذا الشيك فعلًا، وحالته — يقودان الشارة والبوابة معًا. */
  const activeProfile = bankProfileForCheque();
  const activeProfilePrintable = chequeProfilePrintability(activeProfile).ok;

  const isPrintable =
    activeProfilePrintable &&
    printEnabledForTarget &&
    ((!!printTarget && printTarget.status !== 'CANCELLED') ||
      (!printTarget && !!form.chequeNumber && !!form.beneficiaryName && !!form.amount && !!form.bankAccountId));
  const isPrintedCheque = !!printTarget && printTarget.status === 'PRINTED';

  /**
   * حُفظت معايرة زوج «بنك + بروفايل» من الاستوديو.
   *
   * تُخزَّن بمفتاح الزوج نفسه، فتظهر فورًا في الطباعة حين يكون بروفايل الطباعة
   * المختار هو نفسه — ولا تلمس أي زوج آخر.
   */
  function handleProfileSaved(
    bankCode: string,
    calibrationProfile: CalibrationProfileId,
    profile: GulfA4Profile,
  ) {
    setSavedCalibrations((prev) => ({ ...prev, [`${bankCode}:${calibrationProfile}`]: profile }));
  }

  // ── KPIs (computed from loaded data — no backend change) ───────────────────

  const valueKpis = useMemo(() => {
    const amounts = cheques.map((c) => Number(c.amount) || 0);
    const totalValue = amounts.reduce((s, a) => s + a, 0);
    const average = amounts.length ? totalValue / amounts.length : 0;
    return { totalValue, average };
  }, [cheques]);

  const STATUS_CHIPS: [string, string][] = [['', t('opt.all')], ['DRAFT', t('cheque.status.draft')], ['PRINTED', t('cheque.status.printed')], ['CANCELLED', t('cheque.status.cancelled')]];
  const hasFilters = !!(historySearch || historyStatus);

  // ── Excel export (Cheques Reporting & Excel Export Pack v1) ─────────────────
  //
  // The exported columns are the business-visible columns of the table below, in
  // the same order and with the same meaning: cheque number, beneficiary, bank,
  // amount, cheque date, status, payment-voucher number. UI-only columns (the
  // selection checkbox and the chevron) and internal fields (id, createdAt,
  // updatedAt, printedAt) are deliberately not exported.
  //
  // Values reuse the very helpers the cells use — `bankLabel`, `formatDate`,
  // `t(STATUS_META[...].key)` — so a label can never drift between screen and file.
  // The amount is exported as a RAW NUMBER (`money: true`), matching the project's
  // Excel contract: the cell keeps the `#,##0.000` dinar format and stays
  // calculable, never a pre-rendered string, and never the `#…#` cheque-print form.
  // The cheque DATE is `chequeDate` — the date the user entered — rendered through
  // the shared `formatDate` as `DD/MM/YYYY`, so `02/08/2026` is 2 August 2026 with
  // no timezone drift and no day/month inversion.
  const chequeExportColumns = [
    { header: t('col.cheque.number'), value: (r: Cheque) => r.chequeNumber ?? '' },
    { header: t('col.cheque.beneficiary'), value: (r: Cheque) => r.beneficiaryName ?? '' },
    { header: t('col.cheque.bank'), value: (r: Cheque) => bankLabel(r.bankName, t) },
    { header: t('col.cheque.amount'), value: (r: Cheque) => Number(r.amount ?? 0), money: true },
    { header: t('col.cheque.date'), value: (r: Cheque) => formatDate(r.chequeDate) },
    { header: t('col.cheque.status'), value: (r: Cheque) => t((STATUS_META[r.status] ?? { key: r.status }).key) },
    { header: t('col.cheque.pv_number'), value: (r: Cheque) => r.paymentVoucherNumber ?? '' },
  ];

  /**
   * Exports EVERY cheque matching the current filters — not the visible page.
   *
   * `fetchAllRows` walks `/cheques` page by page with the exact same parameters
   * the table itself sends (period → `from`/`to` on `chequeDate`, search, status,
   * sort), so if the filters match 53 cheques spread over three pages the file
   * contains all 53. The total appended at the end is therefore the total of the
   * whole filtered dataset, and matches the Cheques report's total for the same
   * filters — both sum `amount` over the same server-side selection.
   */
  async function exportExcel() {
    setExportingExcel(true);
    try {
      const { from, to } = periodToReportParams(period);
      const allRows = await fetchAllRows<Cheque>('/cheques', {
        search: historySearch || undefined,
        status: historyStatus || undefined,
        from,
        to,
        ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}),
      });
      const total = allRows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
      downloadTableExcel(
        allRows,
        chequeExportColumns,
        generateExportFileName({
          reportName: ReportName.Cheques,
          period: { from: from || undefined, to: to || undefined, allPeriods: !from && !to },
          extension: 'xlsx',
        }),
        'Sheet1',
        {
          labelColumnHeader: t('col.cheque.bank'),
          label: t('cheques.export.total'),
          valueColumnHeader: t('col.cheque.amount'),
          value: total,
        },
      );
    } catch (e) { setFormError(errorMessage(e)); }
    finally { setExportingExcel(false); }
  }

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
      {/* Professional calibration studio — «قالب شيك الخليج» is the one template it calibrates. */}
      {showCalibrator && (
        <ChequeStudioOverlay
          onClose={() => setShowCalibrator(false)}
          chequeRecord={printTarget}
          settings={rawSettings}
          calibrationProfile={printCalibrationProfile}
          onCalibrationProfileChange={chooseCalibrationProfile}
          onProfileSaved={handleProfileSaved}
        />
      )}

      {/* Executive header — .chqx-header scopes the compact-density override in
          Cheques.css to this page only; ExecutiveHeader itself (shared across
          Reports Center / Document Expiry Center / Data Import Center) is untouched. */}
      <div className="chqx-header">
        <ExecutiveHeader
          icon="payments"
          title={t('page.cheques.title')}
          subtitle={t('page.cheques.subtitle')}
          chips={
            <>
              {/* على مستوى الصفحة لم يعد هناك «بنك واحد» يُعرض: النظام صار متعدد
                  البنوك، فالشريحة تعرض عدد الحسابات البنكية المتاحة للإصدار. */}
              <IdChip icon="account_balance" tone="indigo">{accounts.length} {t('unit.bank_account')}</IdChip>
              {/* عدّادات الفترة: مصدرها `/cheques/stats` الذي يتقيّد بـ`from/to` وحدهما
                  ولا يرى بحث الجدول ولا فلتر حالته — إجمالٌ للفترة لا مجموع نتائج
                  الجدول. الشريحة تصرّح بذلك كي لا تُقرأ كملخّص للصفوف المعروضة. */}
              <IdChip icon="receipt_long" tone="indigo">
                {stats.total} {t('unit.cheque')} · {t('cheque.chips.period_scope')}
              </IdChip>
              <IdChip icon="print" tone="green">{stats.printed} {t('cheque.status.printed')}</IdChip>
              {stats.draft > 0 && <IdChip icon="edit_note" tone="orange">{stats.draft} {t('cheque.status.draft')}</IdChip>}
            </>
          }
          aside={(
            <>
              <PeriodControl hideLabelPrefix />
              {canCreate && <Button variant="primary" icon="add" onClick={openNew}>{t('page.cheques.new')}</Button>}
            </>
          )}
        />
      </div>

      {/* Alerts */}
      {formError && <ErrorBanner>{formError} <button type="button" className="xpl-clear-link" onClick={() => setFormError('')}>{t('action.close')}</button></ErrorBanner>}
      {success && <div className="chqx-success"><span className="material-symbols-outlined">check_circle</span>{success}<button type="button" className="xpl-clear-link" onClick={() => setSuccess('')}>{t('action.close')}</button></div>}

      {/* Hero + KPIs
          ملاحظة نطاق: الـHero (printedTotal) إجمالي محسوب في قاعدة البيانات عبر كل
          صفحات الـPagination ضمن الفترة الحالية — من stats، وليس من الشيكات المحمّلة
          في الصفحة. أما «قيمة الشيكات في هذه الصفحة» والمتوسط (valueKpis) فمن الشيكات
          المحمّلة في هذه الصفحة فقط. عدّادات الحالة (مسودة/مطبوع/ملغى) إجمالية من
          الخادم (stats) أيضًا. نوضّح ذلك في العناوين حتى لا تُقرأ الأرقام كمصدر واحد. */}
      <div className="chqx-metrics">
        <HeroMetric icon="account_balance_wallet" label={t('kpi.cheques.printed_total_label')} value={<MoneyText value={stats.printedTotal ?? 0} />} sub={<><span className="material-symbols-outlined">receipt_long</span>{t('kpi.cheques.printed_total_sub', { count: stats.printed })}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="edit_note" tone="orange" label={t('stat.cheques.draft')} value={stats.draft} />
          <MetricCard icon="print" tone="green" label={t('stat.cheques.printed')} value={stats.printed} />
          <MetricCard icon="block" tone="red" label={t('stat.cheques.cancelled')} value={stats.cancelled} />
          <MetricCard icon="receipt_long" tone="blue" label={t('kpi.cheques.page_value_label')} value={<MoneyText value={valueKpis.totalValue} />} />
          <MetricCard icon="functions" tone="indigo" label={t('kpi.cheques.average_page')} value={<MoneyText value={valueKpis.average} />} />
        </div>
      </div>

      {/* Printing & actions toolbar. The template is not chosen — it is RESOLVED
          from the cheque's own bank through the profile registry, so the chip
          below names the profile that would actually print and says plainly when
          that bank's cheque has not been measured yet. */}
      <SectionCard title={t('sec.printing')} icon="print" actions={printTarget ? chequeChip(printTarget.status, t) : undefined}>
        <div className="chqx-print-toolbar">
          <span
            className={`chqx-active-template${activeProfilePrintable ? '' : ' chqx-active-template--pending'}`}
            title={activeProfilePrintable ? 'القالب المعتمد لطباعة هذا الشيك' : PROFILE_NOT_CALIBRATED_MESSAGE}
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              {activeProfilePrintable ? 'description' : 'rule'}
            </span>
            {activeProfile?.displayName ?? 'لا يوجد قالب لهذا البنك'}
            {!activeProfilePrintable && <em className="chqx-active-template-state">غير معاير — يلزم شيك أصلي</em>}
          </span>
          {canPrint && (
            <label className="chqx-print-profile" title="معايرة أي طابعة تُستخدم — تُختار يدويًا">
              <span className="chqx-print-profile-label">بروفايل الطباعة</span>
              <select
                className="xpl-select"
                aria-label="بروفايل الطباعة"
                value={printCalibrationProfile}
                onChange={(e) => chooseCalibrationProfile(e.target.value as CalibrationProfileId)}
              >
                {CALIBRATION_PROFILES.map((id) => (
                  <option key={id} value={id}>{CALIBRATION_PROFILE_LABELS[id]}</option>
                ))}
              </select>
            </label>
          )}
          {canPrint && <Button variant="primary" icon="print" busy={saving} disabled={!isPrintable} onClick={handlePrint}>{t('page.cheques.print')}</Button>}
          {canPrint && isPrintedCheque && <Button variant="secondary" icon="receipt_long" busy={pvLoading} onClick={handlePrintPaymentVoucher}>{t('action.cheque.print_voucher')}</Button>}
          {canCalibrate && (
            <div className="chqx-print-utility">
              <span className="chqx-toolbar-sep" aria-hidden="true" />
              <Button variant="ghost" small icon="tune" onClick={() => setShowCalibrator(true)}>{t('action.cheque.calibrate_print')}</Button>
            </div>
          )}
          {canCancel && printTarget && printTarget.status === 'DRAFT' && <Button variant="danger" icon="block" busy={busy} onClick={() => setCancelConfirmCheque(printTarget)}>{t('page.cheques.cancel_cheque')}</Button>}
        </div>
        {!printTarget && <p className="chqx-preview-hint">{t('hint.cheque.save_first')}</p>}
        {printTarget?.status === 'DRAFT' && <p className="chqx-preview-hint">{t('hint.cheque.check_alignment')}</p>}
        {printTarget?.status === 'CANCELLED' && <p className="chqx-preview-hint warn">{t('error.cheque.is_cancelled')}</p>}
        {printTarget?.status === 'PRINTED' && <p className="chqx-preview-hint">{printTarget.paymentVoucherNumber ? t('lbl.cheque.pv_number_prefix', { number: printTarget.paymentVoucherNumber }) : t('hint.cheque.create_voucher')}</p>}
      </SectionCard>

      {/* Sticky filters — chqx-filterbar scopes the reduced-height override in
          Cheques.css to this page only; the shared .xpl-toolbar classes are untouched. */}
      <div className="xpl-toolbar xpl-toolbar--sticky chqx-filterbar">
        <div className="xpl-toolbar-row">
          <SearchBox value={historySearch} onChange={(v) => { setHistorySearch(v); setPage(1); }} placeholder={t('action.search_placeholder')} ariaLabel={t('action.search_placeholder')} />
          {hasFilters && <button type="button" className="xpl-clear-link" onClick={() => { setHistorySearch(''); setHistoryStatus(''); sort.reset(); setPage(1); }}>{t('action.reset_filters')}</button>}
          {/* Same Excel affordance the other list screens use (see Expenses.tsx):
              same Button component, `table_view` icon, secondary variant, busy
              state and the project's Excel green — no new button design. */}
          {hasPermission('reports.export') && (
            <Button variant="secondary" icon="table_view" busy={exportingExcel} onClick={exportExcel} style={exportingExcel ? undefined : { color: '#217346', marginInlineStart: 'auto' }}>Excel</Button>
          )}
        </div>
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={historyStatus === v} onClick={() => { setHistoryStatus(v); setPage(1); }}>{l}</FilterChip>)}
          <span className="xpl-result-count" style={{ marginInlineStart: 'auto' }}>{meta?.total ?? cheques.length} {t('unit.cheque')}</span>
        </div>
      </div>

      {/* Selection toolbar — shown once at least one row is checked. Batch actions
          reuse the EXISTING print path (see handlePrintSelectedCheques /
          handlePrintSelectedVouchers); the "single vs multiple" wording is cosmetic only. */}
      {selectedIds.size > 0 && (
        <div className="chqx-batch-bar">
          <span className="material-symbols-outlined" aria-hidden="true">checklist</span>
          <span>{t('msg.cheque.selected_count', { count: selectedIds.size })}</span>
          <div className="chqx-toolbar-sep" aria-hidden="true" />
          {/* Batch cheque printing uses «قالب شيك الخليج» like every other print
              on this page. See handlePrintSelectedCheques. */}
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
              <table className="xpl-table chqx-cheques-table">
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
                      <td><span className={`chqx-mono chqx-cheque-id chqx-num--${(STATUS_META[r.status] ?? { tone: 'neutral' as Tone }).tone}`}><strong>{r.chequeNumber}</strong></span></td>
                      <td><strong className="chqx-beneficiary-cell" title={r.beneficiaryName}>{r.beneficiaryName}</strong></td>
                      <td>{bankLabel(r.bankName, t)}</td>
                      <td><span className="chqx-amount">{fmtAmount(r.amount, r.currency)}</span></td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{formatDate(r.chequeDate)}</td>
                      <td>
                        {chequeChip(r.status, t)}
                        {/* The PRINTED chip already carries its own green print icon (STATUS_META) —
                            showing this badge too would just duplicate it. It stays for every OTHER
                            status (e.g. a cancelled cheque that was printed beforehand), where it is
                            the only signal that the cheque was, historically, printed. */}
                        {r.printedAt && r.status !== 'PRINTED' && <span className="chqx-print-badge" style={{ marginInlineStart: 6 }}><span className="material-symbols-outlined">print</span></span>}
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

          {/* الحساب البنكي — هوية البنك الحقيقية للشيك.
              يُحمَّل من سجل الحسابات الفعلي، ويُعرض بصيغة «اسم البنك — اسم الحساب»
              فقط: لا رقم حساب ولا IBAN ولا معرّف بنك في نموذج الشيك. */}
          <DialogSection title={t('sec.bank')} icon="account_balance">
            <div className="xpl-field xpl-field--full">
              <label>{t('field.cheque.bank_account')} <span className="req">*</span></label>
              <select
                className="xpl-select"
                value={form.bankAccountId}
                onChange={(e) => field('bankAccountId', e.target.value)}
                disabled={(!!editId && !canUpdate) || accountsState !== 'ready' || accounts.length === 0}
                aria-label={t('field.cheque.bank_account')}
              >
                <option value="">{t('ph.cheque.bank_account')}</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.label}</option>
                ))}
              </select>
              {accountsState === 'loading' && <div className="xpl-field-hint">{t('msg.bank_accounts.loading')}</div>}
              {accountsState === 'error' && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{t('error.bank_accounts.load_failed')}</div>}
              {accountsState === 'ready' && accounts.length === 0 && (
                <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{t('error.bank_accounts.none')}</div>
              )}
              {/* تنبيه صريح لا منع للحفظ: تسجيل الشيك مسموح على أي حساب، والطباعة
                  وحدها هي المحجوبة حتى تُعتمد أبعاد الشيك الفعلية لهذا الحساب. */}
              {selectedAccount && !selectedAccount.printEnabled && (
                <div className="chqx-print-notice">
                  <span className="material-symbols-outlined">info</span>
                  {PRINT_PROFILE_MISSING_MESSAGE}
                </div>
              )}
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

      {forceDeleteId !== null && (
        <ForceDeleteChequeModal
          chequeId={forceDeleteId}
          onClose={() => setForceDeleteId(null)}
          onDeleted={() => { setForceDeleteId(null); setSuccess(t('msg.cheque.force_deleted')); loadData(page); }}
        />
      )}

      {cancelConfirmCheque !== null && (
        <ConfirmModal title={t('page.cheques.cancel_cheque')} message={t('page.cheques.confirm_cancel')} variant="warning" onConfirm={() => executeCancel(cancelConfirmCheque)} onCancel={() => setCancelConfirmCheque(null)} />
      )}
    </div>
  );
}
