import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { useAuth } from '../stores/authStore';
import { useToast } from '../stores/toastStore';
import { resolveName } from '../lib/resolveName';
import { formatDate, todayDateOnly } from '../lib/date';
import { calcTotals } from '../lib/workAnalysisCalc';
import { downloadBlob } from '../utils/exportUtils';
import { exportReportAsPdf } from '../utils/pdfExport';
import { generateExportFileName, ReportName } from '../utils/exportFilename';
import { printCurrentView } from '../utils/print';
import DateInput from '../components/DateInput';
import SearchableSelect, { type SearchableOption } from '../components/SearchableSelect';
import {
  ExecutiveHeader,
  IdChip,
  SectionCard,
  Drawer,
  EmptyState,
  SkeletonRows,
  StatusChip,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import './WorkAnalysis.css';
import WorkAnalysisKpis from '../components/workAnalysis/WorkAnalysisKpis';
import WorkAnalysisLinesEditor from '../components/workAnalysis/WorkAnalysisLinesEditor';
import WorkAnalysisBreakdown from '../components/workAnalysis/WorkAnalysisBreakdown';
import WorkAnalysisProfitability from '../components/workAnalysis/WorkAnalysisProfitability';
import WorkAnalysisSummaryBar from '../components/workAnalysis/WorkAnalysisSummaryBar';
import {
  emptyLine,
  lineAmountsInput,
  type ContractLite,
  type CustomerLite,
  type PriceAgreementOption,
  type SavedWorkAnalysis,
  type WorkAnalysisHeaderDraft,
  type WorkAnalysisLineDraft,
  type WorkAnalysisStatus,
} from './workAnalysis/types';

/**
 * ═══ تحليل الشغل والعمولة ═══
 *
 * ورقة عمل تشغيلية **خارج الدورة المحاسبية بالكامل**. تحسب الفرق بين سعر العميل
 * (من اتفاقيات الأسعار) وسعر صاحب المعدة الذي يُدخله المستخدم — أي عمولة الشركة —
 * قبل إصدار أي فاتورة.
 *
 * ما لا تفعله هذه الصفحة، بحكم التصميم لا بالمصادفة: لا تُنشئ فاتورة ولا مصروفًا
 * ولا دفعة ولا قيدًا ولا حركة، ولا تمسّ رصيد عميل ولا مخزونًا ولا راتبًا ولا تقريرًا.
 * نداءاتها الوحيدة للكتابة تذهب إلى `/api/work-analysis` (جدولاها الخاصان)، وما عداها
 * قراءة بحتة: `/customers`، `/contracts`، `/prices/for-invoice`، واقتراحات المُلاك.
 *
 * الحساب فوري ومحلّي: كل ضغطة مفتاح تعيد الاشتقاق من `lib/workAnalysisCalc` بلا أي
 * نداء شبكة وبلا حاجة إلى حفظ.
 */

const STATUS_TONE: Record<WorkAnalysisStatus, 'neutral' | 'blue' | 'green'> = {
  DRAFT: 'neutral',
  COMPLETED: 'green',
  ARCHIVED: 'blue',
};

function emptyHeader(): WorkAnalysisHeaderDraft {
  return {
    customerId: '',
    customerName: '',
    contractId: '',
    contractName: '',
    asphaltPlant: '',
    ownerName: '',
    analysisDate: todayDateOnly(new Date()),
    status: 'DRAFT',
    notes: '',
  };
}

export default function WorkAnalysis() {
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const toast = useToast();
  const { hasPermission } = useAuth();

  const canCreate = hasPermission('workAnalysis.create');
  const canUpdate = hasPermission('workAnalysis.update');
  const canExport = hasPermission('workAnalysis.export');

  const [header, setHeader] = useState<WorkAnalysisHeaderDraft>(emptyHeader);
  const [lines, setLines] = useState<WorkAnalysisLineDraft[]>([emptyLine()]);
  const [currentId, setCurrentId] = useState<number | null>(null);

  const [customers, setCustomers] = useState<CustomerLite[]>([]);
  const [contracts, setContracts] = useState<ContractLite[]>([]);
  const [prices, setPrices] = useState<PriceAgreementOption[]>([]);
  const [ownerOptions, setOwnerOptions] = useState<string[]>([]);
  const [saved, setSaved] = useState<SavedWorkAnalysis[]>([]);

  /** لوح «التحاليل المحفوظة» — يُفتح عند الطلب فلا يشغل مساحة دائمة. */
  const [savedOpen, setSavedOpen] = useState(false);
  /** طيّ بطاقة «بيانات الشغل» — يحرّر ارتفاعًا لصالح الشبكة على الشاشات القصيرة. */
  const [infoOpen, setInfoOpen] = useState(true);

  const [pricesLoading, setPricesLoading] = useState(false);
  const [listLoading, setListLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');

  /**
   * معرّف العميل الذي يجري تحميل تحليل محفوظ من أجله — يمنع مؤثّر «تغيّر العميل»
   * من مسح البنود التي حُمِّلت للتوّ.
   *
   * يخزّن المعرّف لا مجرّد راية منطقية: لو كان راية، وفُتِح تحليل لنفس العميل
   * المحدَّد أصلًا، لما فُعِّل المؤثّر ولبقيت الراية مرفوعة، فيبتلع أوّل تبديل عميل
   * حقيقي لاحق ويُبقي بنودًا بأسعار عميل آخر. المقارنة بالمعرّف تُغلق هذا الباب:
   * الراية القديمة لا تطابق العميل الجديد أبدًا.
   */
  const loadingForCustomerRef = useRef<string | null>(null);
  const isArchived = header.status === 'ARCHIVED';
  /** صلاحية الكتابة — مستقلّة عن التجميد، وإلا تعذّر إخراج التحليل من الأرشفة. */
  const canWrite = currentId === null ? canCreate : canUpdate;
  /** تجميد المحتوى: الأرشفة تُجمّد الحقول، لكنها لا تُجمّد حقل الحالة ولا زر الحفظ. */
  const readOnly = isArchived || !canWrite;

  const totals = useMemo(
    () => calcTotals(lines.filter((line) => line.itemLabel).map(lineAmountsInput)),
    [lines],
  );

  // ── تحميل أوّلي: العملاء واقتراحات المُلاك وقائمة التحاليل المحفوظة ──
  const loadSaved = useCallback(() => {
    setListLoading(true);
    api.get('/work-analysis', { params: { pageSize: 50 } })
      .then((res) => setSaved(res.data?.data?.data ?? []))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 200 } })
      .then((res) => setCustomers(res.data?.data?.data ?? []))
      .catch(() => {});
    api.get('/work-analysis/owner-suggestions')
      .then((res) => setOwnerOptions(res.data?.data ?? []))
      .catch(() => {});
    loadSaved();
  }, [loadSaved]);

  // ── عند تغيّر العميل: جلب اتفاقياته وعقوده، وتصفير البنود ──
  // البنود تحمل لقطات من اتفاقيات العميل السابق، فإبقاؤها بعد التبديل يُنتج تحليلًا
  // مبنيًا على أسعار عميل آخر — أخطر بكثير من إجبار المستخدم على إعادة الاختيار.
  useEffect(() => {
    const customerId = header.customerId;
    if (!customerId) {
      setPrices([]);
      setContracts([]);
      return;
    }
    setPricesLoading(true);
    Promise.allSettled([
      api.get('/prices/for-invoice', { params: { customerId } })
        .then((res) => setPrices(res.data?.data ?? [])),
      api.get('/contracts', { params: { customerId, pageSize: 100 } })
        .then((res) => setContracts(res.data?.data?.data ?? [])),
    ]).finally(() => setPricesLoading(false));

    if (loadingForCustomerRef.current === customerId) {
      loadingForCustomerRef.current = null;
      return;
    }
    // أي علامة تحميل قديمة لعميل آخر تسقط هنا — لا تنجو لتبتلع تبديلًا لاحقًا.
    loadingForCustomerRef.current = null;
    setLines([emptyLine()]);
  }, [header.customerId]);

  const customerOptions: SearchableOption[] = customers.map((c) => ({
    value: String(c.id),
    label: resolveName(c, lang),
  }));

  const plantOptions = useMemo(
    () => Array.from(new Set(prices.map((p) => p.asphaltPlant).filter(Boolean))).sort(),
    [prices],
  );

  // مصنع الأسفلت يُرشِّح الاتفاقيات المعروضة في الشبكة (نفس منطق شاشة الفواتير).
  const visiblePrices = useMemo(
    () => (header.asphaltPlant ? prices.filter((p) => p.asphaltPlant === header.asphaltPlant) : prices),
    [prices, header.asphaltPlant],
  );

  function patchHeader(patch: Partial<WorkAnalysisHeaderDraft>) {
    setHeader((h) => ({ ...h, ...patch }));
  }

  function selectCustomer(value: string) {
    const customer = customers.find((c) => String(c.id) === value);
    patchHeader({
      customerId: value,
      customerName: customer ? resolveName(customer, lang) : '',
      contractId: '',
      contractName: '',
      asphaltPlant: '',
    });
  }

  function selectContract(value: string) {
    const contract = contracts.find((c) => String(c.id) === value);
    patchHeader({
      contractId: value,
      contractName: contract ? (contract.contractNumber ?? contract.title ?? `#${contract.id}`) : '',
      ...(contract?.asphaltPlant ? { asphaltPlant: contract.asphaltPlant } : {}),
    });
  }

  function resetWorkspace() {
    loadingForCustomerRef.current = null;
    setCurrentId(null);
    setHeader(emptyHeader());
    setLines([emptyLine()]);
    setError('');
  }

  function openAnalysis(analysis: SavedWorkAnalysis) {
    // تُسجَّل علامة التحميل قبل تحديث الحالة، فمؤثّر العميل يجلب الأسعار دون مسح
    // البنود المحمَّلة.
    loadingForCustomerRef.current = analysis.customerId ? String(analysis.customerId) : '';
    setCurrentId(analysis.id);
    setHeader({
      customerId: analysis.customerId ? String(analysis.customerId) : '',
      customerName: analysis.customerName,
      contractId: analysis.contractId ? String(analysis.contractId) : '',
      contractName: analysis.contractName ?? '',
      asphaltPlant: analysis.asphaltPlant ?? '',
      ownerName: analysis.ownerName,
      analysisDate: analysis.analysisDate.slice(0, 10),
      status: analysis.status,
      notes: analysis.notes ?? '',
    });
    // اللقطات تُحمَّل كما خُزِّنت — لا إعادة قراءة من `/prices` ولا تحديث للأسعار.
    setLines(
      analysis.lines.map((line) => ({
        key: `saved-${line.id}`,
        priceId: line.priceId,
        priceAgreementName: line.priceAgreementName,
        itemLabel: line.itemLabel,
        unit: line.unit,
        customerPrice: line.customerPrice,
        quantity: String(line.quantity),
        ownerPrice: String(line.ownerPrice),
      })),
    );
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validate(): string | null {
    if (!header.customerName.trim()) return t('wa.err.customer_required');
    if (!header.ownerName.trim()) return t('wa.err.owner_required');
    if (!header.analysisDate) return t('wa.err.date_required');
    const filled = lines.filter((line) => line.itemLabel);
    if (filled.length === 0) return t('wa.err.lines_required');
    return null;
  }

  async function save() {
    const problem = validate();
    if (problem) { setError(problem); toast.error(problem); return; }

    setSaving(true);
    setError('');
    const payload = {
      analysisDate: header.analysisDate,
      status: header.status,
      customerId: header.customerId ? Number(header.customerId) : null,
      customerName: header.customerName,
      contractId: header.contractId ? Number(header.contractId) : null,
      contractName: header.contractName || null,
      asphaltPlant: header.asphaltPlant || null,
      ownerName: header.ownerName.trim(),
      notes: header.notes || null,
      lines: lines
        .filter((line) => line.itemLabel)
        .map((line, index) => ({
          priceId: line.priceId,
          priceAgreementName: line.priceAgreementName,
          itemLabel: line.itemLabel,
          unit: line.unit,
          customerPrice: line.customerPrice,
          quantity: Number(line.quantity) || 0,
          ownerPrice: Number(line.ownerPrice) || 0,
          sortOrder: index,
        })),
    };

    try {
      if (currentId === null) {
        const res = await api.post('/work-analysis', payload);
        setCurrentId(res.data?.data?.id ?? null);
      } else {
        await api.patch(`/work-analysis/${currentId}`, payload);
      }
      toast.ok(t('wa.msg.saved'));
      loadSaved();
      api.get('/work-analysis/owner-suggestions')
        .then((res) => setOwnerOptions(res.data?.data ?? []))
        .catch(() => {});
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  }

  /** التصدير يمرّ بمحرّك التقارير على الخادم، فيحتاج تحليلًا محفوظًا له معرّف. */
  function requireSaved(): boolean {
    if (currentId !== null) return true;
    toast.warn(t('wa.msg.save_before_export'));
    return false;
  }

  async function exportExcel() {
    if (!requireSaved()) return;
    setExporting(true);
    try {
      const res = await api.get(`/work-analysis/${currentId}/export`, {
        params: { format: 'excel' },
        responseType: 'blob',
      });
      downloadBlob(
        res.data as Blob,
        generateExportFileName({ reportName: ReportName.WorkAnalysis, identifier: currentId, extension: 'xlsx' }),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    if (!requireSaved()) return;
    setExporting(true);
    try {
      await exportReportAsPdf(
        `/work-analysis/${currentId}/export`,
        {},
        generateExportFileName({ reportName: ReportName.WorkAnalysis, identifier: currentId, extension: 'pdf' }),
      );
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  async function archive(id: number) {
    try {
      await api.post(`/work-analysis/${id}/archive`);
      toast.ok(t('wa.msg.archived'));
      if (id === currentId) patchHeader({ status: 'ARCHIVED' });
      loadSaved();
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    /*
     * `xpl-scope` إلزامي لا تجميلي: رموز ExplorerKit كلها (--xpl-primary،
     * --xpl-surface، --xpl-border، --xpl-muted…) مُعرَّفة على هذا الصنف وحده لا على
     * :root. بدونه كانت كل تلك الرموز غير مُعرَّفة داخل الصفحة، فتُسقِط المتصفّح
     * إعلاناتها — ومن ذلك `background: var(--xpl-primary)` في زرّ «حفظ»، فيبقى
     * الزرّ بخلفية فاتحة ونصّ أبيض غير مقروء. كل صفحات الطقم تبدأ بـ
     * `xpl-scope` (انظر Reports و Cheques و DocumentExpirationCenter).
     */
    <div className="xpl-scope wa-page">
      <ExecutiveHeader
        icon="query_stats"
        title={t('wa.title')}
        subtitle={t('wa.subtitle')}
        chips={
          <>
            <IdChip icon="lock" tone="orange">{t('wa.badge.internal')}</IdChip>
            {currentId !== null && <IdChip icon="tag">#{currentId}</IdChip>}
            <StatusChip tone={STATUS_TONE[header.status]}>{t(`wa.status.${header.status}`)}</StatusChip>
          </>
        }
        aside={
          /*
           * شريط الأدوات مجموعتان بوزن بصري مختلف عمدًا: الإجراءات التي تُغيّر
           * التحليل (جديد/حفظ/فتح) بارزة، وإجراءات الإخراج (طباعة/Excel/PDF)
           * خافتة `ghost`. تساوي الأزرار في الوزن كان يجعل «حفظ» و«PDF» نداءً
           * واحدًا، فيضيع الإجراء الأهمّ في الزحام.
           */
          <div className="wa-actions pm-ui-only">
            <div className="wa-actions-group wa-actions-group--primary">
              <Button icon="note_add" onClick={resetWorkspace}>{t('wa.action.new')}</Button>
              {/* الحفظ مرهون بالصلاحية وحدها — لا بالتجميد، وإلا تعذّر إخراج
                  التحليل من الأرشفة بعد إعادة حالته إلى «مسودة». */}
              <Button
                variant="primary"
                icon="save"
                busy={saving}
                disabled={!canWrite}
                onClick={save}
              >
                {t('action.save')}
              </Button>
              <Button icon="folder_open" onClick={() => setSavedOpen(true)}>
                {t('wa.action.open')}
              </Button>
            </div>
            <span className="wa-actions-sep" aria-hidden="true" />
            <div className="wa-actions-group">
              <Button variant="ghost" small icon="print" onClick={() => printCurrentView()}>
                {t('wa.action.print')}
              </Button>
              {canExport && (
                <>
                  <Button variant="ghost" small icon="table_view" busy={exporting} onClick={exportExcel}>Excel</Button>
                  <Button variant="ghost" small icon="picture_as_pdf" busy={exporting} onClick={exportPdf}>PDF</Button>
                </>
              )}
            </div>
          </div>
        }
      />

      {/* شريط الطباعة — لا يظهر على الشاشة إطلاقًا، ويتصدّر كل ورقة مطبوعة. */}
      <div className="wa-print-banner" aria-hidden="true">
        <strong>تحليل داخلي</strong>
        <span>ليس فاتورة — مستند تشغيلي لا أثر محاسبي له</span>
      </div>

      {/*
        تنبيه مدمج يُصيَّر فقط عند وجود خطأ فعلي — لا عنصر نائب ولا ارتفاع محجوز،
        فالصفحة لا تدفع مساحة رأسية ثمن خطأ لم يقع. وهو قابل للصرف يدويًا.
      */}
      {error && (
        <div className="wa-alert" role="alert">
          <span className="material-symbols-outlined" aria-hidden="true">error</span>
          <span className="wa-alert-text">{error}</span>
          <button
            type="button"
            className="wa-alert-close"
            onClick={() => setError('')}
            aria-label={t('action.close')}
          >
            ✕
          </button>
        </div>
      )}

      {/* المؤشرات مباشرةً تحت الترويسة وملتصقة أثناء التمرير — النتيجة تبقى في
          مجال الرؤية مهما طال العمل داخل الشبكة. */}
      <div className="wa-kpi-bar">
        <WorkAnalysisKpis totals={totals} />
      </div>

      <div className="wa-workspace">
      <SectionCard
        title={t('wa.section.header')}
        icon="assignment"
        actions={
          <Button
            variant="ghost"
            small
            icon={infoOpen ? 'unfold_less' : 'unfold_more'}
            onClick={() => setInfoOpen((v) => !v)}
          >
            {infoOpen ? t('wa.info.collapse') : t('wa.info.expand')}
          </Button>
        }
      >
        {/* مطويًا: سطر مكثّف بالحقول الحاسمة — يحرّر ارتفاعًا للشبكة على الشاشات
            القصيرة (1366×768) دون أن يُخفي سياق التحليل. */}
        {!infoOpen ? (
          <div className="wa-info-digest">
            <span><b>{t('wa.field.customer')}:</b> {header.customerName || '—'}</span>
            <span><b>{t('wa.field.owner')}:</b> {header.ownerName || '—'}</span>
            <span><b>{t('wa.field.date')}:</b> {header.analysisDate ? formatDate(header.analysisDate) : '—'}</span>
            {header.asphaltPlant && <span><b>{t('wa.field.plant')}:</b> {header.asphaltPlant}</span>}
          </div>
        ) : (
        <div className="wa-form">
          <label className="wa-field">
            <span>{t('wa.field.customer')}</span>
            <SearchableSelect
              value={header.customerId}
              onChange={selectCustomer}
              options={customerOptions}
              emptyLabel={t('msg.select_placeholder')}
              ariaLabel={t('wa.field.customer')}
              disabled={readOnly}
            />
          </label>

          <label className="wa-field">
            <span>{t('wa.field.contract')}</span>
            <select
              className="xpl-input"
              value={header.contractId}
              onChange={(e) => selectContract(e.target.value)}
              disabled={readOnly || contracts.length === 0}
            >
              <option value="">{t('msg.select_placeholder')}</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.contractNumber ?? c.title ?? `#${c.id}`}
                </option>
              ))}
            </select>
          </label>

          <label className="wa-field">
            <span>{t('wa.field.plant')}</span>
            <select
              className="xpl-input"
              value={header.asphaltPlant}
              onChange={(e) => patchHeader({ asphaltPlant: e.target.value })}
              disabled={readOnly || plantOptions.length === 0}
            >
              <option value="">{t('wa.field.plant_all')}</option>
              {plantOptions.map((plant) => (
                <option key={plant} value={plant}>{plant}</option>
              ))}
            </select>
          </label>

          {/*
            صاحب المعدة: نص حر مع اقتراحات. `datalist` لا `select` عمدًا — الاقتراحات
            تسهيل لا قيد، والمُلّاك أفراد قد لا يكون أحدهم مسجّلًا في أي جدول.
          */}
          <label className="wa-field">
            <span>{t('wa.field.owner')}</span>
            <input
              className="xpl-input"
              list="wa-owner-suggestions"
              value={header.ownerName}
              onChange={(e) => patchHeader({ ownerName: e.target.value })}
              placeholder={t('wa.field.owner_placeholder')}
              disabled={readOnly}
            />
            <datalist id="wa-owner-suggestions">
              {ownerOptions.map((name) => <option key={name} value={name} />)}
            </datalist>
          </label>

          <label className="wa-field">
            <span>{t('wa.field.date')}</span>
            <DateInput
              value={header.analysisDate}
              onChange={(value) => patchHeader({ analysisDate: value })}
              className="xpl-input"
              ariaLabel={t('wa.field.date')}
              disabled={readOnly}
            />
          </label>

          <label className="wa-field">
            <span>{t('wa.field.status')}</span>
            <select
              className="xpl-input"
              value={header.status}
              onChange={(e) => patchHeader({ status: e.target.value as WorkAnalysisStatus })}
              disabled={!canWrite}
            >
              <option value="DRAFT">{t('wa.status.DRAFT')}</option>
              <option value="COMPLETED">{t('wa.status.COMPLETED')}</option>
              <option value="ARCHIVED">{t('wa.status.ARCHIVED')}</option>
            </select>
          </label>

          <label className="wa-field wa-field--wide">
            <span>{t('wa.field.notes')}</span>
            <textarea
              className="xpl-input wa-notes"
              value={header.notes}
              onChange={(e) => patchHeader({ notes: e.target.value })}
              rows={2}
              disabled={readOnly}
            />
          </label>
        </div>
        )}
      </SectionCard>

      {/* عمود النتائج — الشبكة هي بطل الصفحة، فتأخذ المساحة المتبقية كلها. */}
      <div className="wa-results">
        <SectionCard
          title={t('wa.section.lines')}
          icon="edit_note"
          padded={false}
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {!header.customerId ? (
            <EmptyState
              icon="person_search"
              title={t('wa.lines.pick_customer')}
              message={t('wa.lines.pick_customer_hint')}
            />
          ) : (
            <>
              <WorkAnalysisLinesEditor
                lines={lines}
                onChange={setLines}
                priceOptions={visiblePrices}
                disabled={readOnly}
                pricesLoading={pricesLoading}
              />
              {/* الإجماليات ملتصقة بأسفل الشبكة — أثر كل رقم يُدخَل يظهر فورًا
                  في مجال النظر نفسه. */}
              <WorkAnalysisSummaryBar totals={totals} />
            </>
          )}
        </SectionCard>

        <SectionCard title={t('wa.section.breakdown')} icon="table_chart" padded={false}>
          <WorkAnalysisBreakdown lines={lines} />
        </SectionCard>

        <SectionCard title={t('wa.section.profitability')} icon="trending_up">
          <WorkAnalysisProfitability totals={totals} />
        </SectionCard>
      </div>
      </div>

      {/*
        التحاليل المحفوظة في لوح جانبي بدل قسم دائم أسفل الصفحة: قائمة تُستشار
        عند الحاجة لا تُقرأ باستمرار، وإبقاؤها مفتوحة كان يبتلع ثلث الصفحة
        ويدفع الشبكة — بطل الصفحة — خارج الشاشة الأولى.
      */}
      {savedOpen && (
        <Drawer title={t('wa.section.saved')} onClose={() => setSavedOpen(false)}>
          {listLoading ? (
            <SkeletonRows rows={4} withAvatar={false} />
          ) : saved.length === 0 ? (
            <EmptyState icon="folder_off" title={t('wa.saved.empty')} message={t('wa.saved.empty_hint')} />
          ) : (
            <div className="wa-saved-list">
              {saved.map((analysis) => (
                <div
                  key={analysis.id}
                  className={`wa-saved-item${analysis.id === currentId ? ' wa-saved-item--active' : ''}`}
                >
                  <div className="wa-saved-main">
                    <div className="wa-saved-title">
                      <span className="wa-saved-id">#{analysis.id}</span>
                      <span className="wa-saved-customer">{analysis.customerName}</span>
                      <StatusChip tone={STATUS_TONE[analysis.status]}>
                        {t(`wa.status.${analysis.status}`)}
                      </StatusChip>
                    </div>
                    <div className="wa-saved-meta">
                      <span>{formatDate(analysis.analysisDate)}</span>
                      <span>•</span>
                      <span>{analysis.ownerName}</span>
                    </div>
                  </div>
                  <div className="wa-saved-actions">
                    <Button
                      small
                      icon="open_in_new"
                      onClick={() => { openAnalysis(analysis); setSavedOpen(false); }}
                    >
                      {t('wa.saved.open')}
                    </Button>
                    {canUpdate && analysis.status !== 'ARCHIVED' && (
                      <Button small variant="ghost" icon="inventory_2" onClick={() => archive(analysis.id)}>
                        {t('wa.saved.archive')}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
