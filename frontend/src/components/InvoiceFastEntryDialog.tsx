import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import { useT } from '../lib/i18n';
import { useUI } from '../stores/uiStore';
import { resolveName } from '../lib/resolveName';
import { useToast } from '../stores/toastStore';
import { Dialog, DialogSection, Button } from './explorer/ExplorerKit';
import DateInput from './DateInput';
import { todayDateOnly } from '../lib/date';
import SearchableSelect, { SearchableOption } from './SearchableSelect';
import { InvoiceLineItemsEditor, invoiceLineTotal, type Item, type PriceOption } from './invoices/InvoiceLineItemsEditor';
import {
  InvoiceSharedFields,
  InvoiceRowFields,
  InvoiceSessionSummary,
  EMPTY_INVOICE_SUMMARY,
  makeEmptyRow,
  buildInvoiceCreatePayload,
  validateInvoiceRow,
  clientNextInvoiceNumber,
  addToInvoiceSummary,
  isInvoiceRowDirty,
} from '../pages/invoiceFastEntry';
import { deriveInvoiceYearFromIssueDate } from '../lib/invoiceNumber';
import HistoricalDateNotice from './period/HistoricalDateNotice';

interface Customer { id: number; name: string }
interface ContractLite { id: number; asphaltPlant?: string | null }

const INVOICE_TYPES = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت'] as const;

interface Props {
  onClose: () => void;
  /** يُستدعى عند إغلاق الحوار بعد حفظ فاتورة واحدة على الأقل — لتحديث القائمة. */
  onSaved: () => void;
}

/**
 * «إدخال فواتير سريع» — مسرّع إدخال (ليس دفعة ولا استيراد). v1: مبيعات + عميل واحد.
 * كل حفظ يُنشئ فاتورة عادية عبر POST /invoices (نفس المسار)، ثم يمسح حقول الفاتورة
 * مع إبقاء الحقول المشتركة، ويقترح الرقم التالي تلقائيًا. لا كيان جلسة، لا دفعة.
 */
export default function InvoiceFastEntryDialog({ onClose, onSaved }: Props) {
  const { t } = useT();
  const lang = useUI((s) => s.lang);
  const toast = useToast();
  const now = new Date();
  const [shared, setShared] = useState<InvoiceSharedFields>({
    entryMode: 'SINGLE',
    direction: 'SALES',
    invoiceType: 'نقل اسفلت',
    issueDate: todayDateOnly(now),
    billingMonth: now.getMonth() + 1,
    billingYear: now.getFullYear(),
    numberYear: now.getFullYear(),
    customerId: '',
    contractId: '',
  });
  const [row, setRow] = useState<InvoiceRowFields>(makeEmptyRow(''));
  const [summary, setSummary] = useState<InvoiceSessionSummary>(EMPTY_INVOICE_SUMMARY);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [contracts, setContracts] = useState<ContractLite[]>([]);
  const [saving, setSaving] = useState(false);
  const [pricesLoading, setPricesLoading] = useState(false);
  const [error, setError] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);

  const isMulti = shared.entryMode === 'MULTI';
  const activeCustomerId = isMulti ? row.customerId : shared.customerId;
  const activeContractId = isMulti ? row.contractId : shared.contractId;
  const activeContract = contracts.find((c) => String(c.id) === activeContractId);
  const filterAsphaltPlant = activeContract?.asphaltPlant ?? null;
  const displayPrices = filterAsphaltPlant ? prices.filter((p) => p.asphaltPlant === filterAsphaltPlant) : prices;

  const subtotal = row.items.reduce((s, it) => s + invoiceLineTotal(it as Item), 0);
  const total = Math.max(0, subtotal - Number(row.discount));

  const customerOptions: SearchableOption[] = customers.map((c) => ({ value: String(c.id), label: resolveName(c, lang) }));

  // إعداد الرقم المقترح + تحميل العملاء عند الفتح.
  useEffect(() => {
    api.get('/customers', { params: { pageSize: 200 } })
      .then((res) => setCustomers(res.data?.data?.data ?? []))
      .catch(() => {});
    api.get('/invoices/next-number', { params: { year: shared.numberYear } })
      .then((res) => {
        const n = res.data?.data?.nextNumber ?? '';
        setRow(makeEmptyRow(n));
        setSummary((s) => ({ ...s, nextNumber: n || null }));
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // عند تغيّر العميل الفعّال (المشترك أو لكل فاتورة): جلب الأسعار/العقود وإعادة تصفير
  // أسعار البنود وعقد التصفية. يُفعَّل قفل الحفظ حتى تُحمَّل أسعار العميل (منعًا لأسعار قديمة).
  useEffect(() => {
    setShared((s) => ({ ...s, contractId: '' }));
    setRow((r) => ({ ...r, contractId: '', items: r.items.map((it) => ({ ...it, unitPrice: 0, priceTouched: false })) }));
    if (!activeCustomerId) { setPrices([]); setContracts([]); setPricesLoading(false); return; }
    setPricesLoading(true);
    Promise.allSettled([
      api.get('/prices/for-invoice', { params: { customerId: activeCustomerId } }).then((res) => setPrices(res.data?.data ?? [])),
      api.get('/contracts', { params: { customerId: activeCustomerId, pageSize: 100 } }).then((res) => setContracts(res.data?.data?.data ?? [])),
    ]).finally(() => setPricesLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCustomerId]);

  const setItems: React.Dispatch<React.SetStateAction<Item[]>> = (action) => {
    setRow((r) => {
      const current = r.items as Item[];
      const next = typeof action === 'function' ? (action as (p: Item[]) => Item[])(current) : action;
      return { ...r, items: next };
    });
  };

  function patchShared(p: Partial<InvoiceSharedFields>) { setShared((s) => ({ ...s, ...p })); }
  function switchMode(mode: InvoiceSharedFields['entryMode']) {
    if (mode === shared.entryMode) return;
    if (isInvoiceRowDirty(row) && !window.confirm(t('confirm.discard_current_invoice'))) return;
    // انقل موقع حقل العميل حسب الوضع وأعد ضبط سياق العميل.
    setShared((s) => ({ ...s, entryMode: mode, customerId: '', contractId: '' }));
    setRow((r) => ({ ...r, customerId: '', contractId: '', items: r.items.map((it) => ({ ...it, unitPrice: 0, priceTouched: false })) }));
  }
  function focusFirstItem() {
    setTimeout(() => bodyRef.current?.querySelector<HTMLElement>('.quantity-cell input, .description-cell select')?.focus(), 30);
  }

  async function fetchNextNumber(): Promise<string> {
    try {
      const res = await api.get('/invoices/next-number', { params: { year: shared.numberYear } });
      return res.data?.data?.nextNumber ?? clientNextInvoiceNumber(row.invoiceNumber);
    } catch {
      return clientNextInvoiceNumber(row.invoiceNumber);
    }
  }

  /** يحفظ الفاتورة الحالية عبر مسار الإنشاء العادي. يعيد نجاحًا + الرقم التالي المقترح. */
  async function saveCurrentRow(): Promise<{ ok: boolean; nextNumber: string }> {
    setError('');
    const validationError = validateInvoiceRow(shared, row, t);
    if (validationError) { setError(validationError); return { ok: false, nextNumber: row.invoiceNumber }; }
    if (pricesLoading) { setError(t('msg.wait_customer_prices')); return { ok: false, nextNumber: row.invoiceNumber }; }
    if (saving) return { ok: false, nextNumber: row.invoiceNumber };
    setSaving(true);
    try {
      await api.post('/invoices', buildInvoiceCreatePayload(shared, row));
      const nextNumber = await fetchNextNumber();
      const custName = customers.find((c) => String(c.id) === activeCustomerId)?.name ?? null;
      setSummary((s) => addToInvoiceSummary(s, total, row.invoiceNumber, custName, nextNumber));
      return { ok: true, nextNumber };
    } catch (e) {
      // فشل الحفظ (رقم مكرّر / خطأ) — أبقِ الصف كما هو ولا تتقدّم.
      setError(errorMessage(e));
      try {
        const suggested = await fetchNextNumber();
        setSummary((s) => ({ ...s, nextNumber: suggested }));
      } catch { /* تجاهل */ }
      return { ok: false, nextNumber: row.invoiceNumber };
    } finally {
      setSaving(false);
    }
  }

  async function saveAndNext() {
    const { ok, nextNumber } = await saveCurrentRow();
    if (!ok) return;
    toast.ok(t('toast.inv.fast_created', { number: row.invoiceNumber }));
    setRow(makeEmptyRow(nextNumber));
    focusFirstItem();
  }

  async function saveAndFinish() {
    const { ok } = await saveCurrentRow();
    if (!ok) return;
    toast.ok(t('toast.inv.fast_created', { number: row.invoiceNumber }));
    onSaved();
    onClose();
  }

  function requestClose() {
    if (isInvoiceRowDirty(row)) {
      if (!window.confirm(t('confirm.discard_unsaved_invoice'))) return;
    }
    if (summary.count > 0) onSaved();
    onClose();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (e.shiftKey) saveAndFinish(); else saveAndNext();
    }
  }

  return (
    <Dialog
      icon="receipt_long"
      title={t('btn.inv.fast_entry')}
      subtitle={t('dlg.fast_entry.subtitle', { mode: isMulti ? t('opt.multi_customers') : t('opt.single_customer_session') })}
      size="xl"
      onClose={requestClose}
      footer={
        <>
          <Button variant="primary" icon="playlist_add" busy={saving} disabled={pricesLoading} onClick={saveAndNext}>{t('btn.save_and_next')}</Button>
          <Button variant="secondary" icon="save" busy={saving} disabled={pricesLoading} onClick={saveAndFinish}>{t('btn.save_and_finish')}</Button>
          <Button variant="ghost" onClick={requestClose}>{t('action.cancel')}</Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown} ref={bodyRef}>
        {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

        {/* ── نمط الإدخال (اختيار أول) ── */}
        <DialogSection title={t('dlg.section.choose_entry_mode')} icon="tune">
          <div className="xpl-field xpl-field--full">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="fe-mode" checked={!isMulti} onChange={() => switchMode('SINGLE')} />
                <span>{t('opt.single_customer')} <span style={{ color: 'var(--xpl-muted)', fontSize: 12 }}>{t('lbl.recommended')}</span></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="fe-mode" checked={isMulti} onChange={() => switchMode('MULTI')} />
                <span>{t('opt.multi_customers')}</span>
              </label>
              <span className="xpl-chip xpl-chip--indigo" style={{ marginInlineStart: 'auto' }}>
                {(() => {
                  if (isMulti) return t('opt.multi_customers');
                  const activeSharedCustomerName = customers.find((c) => String(c.id) === shared.customerId)?.name;
                  return activeSharedCustomerName ? t('lbl.customer_colon', { name: activeSharedCustomerName }) : t('opt.single_customer');
                })()}
              </span>
            </div>
          </div>
        </DialogSection>

        {/* ── حقول مشتركة ثابتة ── */}
        <DialogSection title={t('dlg.section.shared_fields')} icon="push_pin">
          {!isMulti && (
            <div className="xpl-field xpl-field--full">
              <label>{t('field.customer_session')} <span className="req">*</span></label>
              <SearchableSelect
                options={customerOptions}
                value={shared.customerId}
                onChange={(v) => patchShared({ customerId: v })}
                ariaLabel={t('aria.customer')}
                placeholder={t('ph.select_customer')}
                searchPlaceholder={t('ph.search_customer')}
              />
            </div>
          )}
          {!isMulti && contracts.length > 0 && (
            <div className="xpl-field">
              <label>{t('field.contract_price_filter')}</label>
              <select className="xpl-select" value={shared.contractId} onChange={(e) => patchShared({ contractId: e.target.value })} aria-label={t('aria.contract')}>
                <option value="">{t('opt.all_contracts')}</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.asphaltPlant ?? `#${c.id}`}</option>)}
              </select>
            </div>
          )}
          <div className="xpl-field">
            <label>{t('col.inv.type')}</label>
            <select className="xpl-select" value={shared.invoiceType} onChange={(e) => patchShared({ invoiceType: e.target.value })} aria-label={t('col.inv.type')}>
              {INVOICE_TYPES.map((it) => <option key={it} value={it}>{it}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>{t('lbl.inv.issue_date')}</label>
            <DateInput className="xpl-input" value={shared.issueDate} onChange={(v) => {
              const patch: Partial<InvoiceSharedFields> = { issueDate: v };
              if (v) {
                const [yy, mm] = v.split('-');
                patch.billingMonth = Number(mm);
                patch.billingYear = Number(yy);
                // سنة رقم الفاتورة تتبع تاريخ الإصدار في الإدخال السريع أيضًا.
                patch.numberYear = deriveInvoiceYearFromIssueDate(v, Number(yy));
              }
              patchShared(patch);
            }} ariaLabel={t('lbl.inv.issue_date')} max={todayDateOnly()} />
            <HistoricalDateNotice date={shared.issueDate} />
          </div>
          <div className="xpl-field">
            <label>{t('lbl.inv.billing_period')}</label>
            <select className="xpl-select" value={shared.billingMonth} onChange={(e) => patchShared({ billingMonth: Number(e.target.value) })} aria-label={t('lbl.inv.billing_period')}>
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>{t('field.inv.billing_year')}</label>
            <select className="xpl-select" value={shared.billingYear} onChange={(e) => patchShared({ billingYear: Number(e.target.value) })} aria-label={t('field.inv.billing_year')}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </DialogSection>

        {/* ── الفاتورة الحالية ── */}
        <DialogSection title={t('dlg.section.current_invoice')} icon="receipt_long">
          {isMulti && (
            <div className="xpl-field xpl-field--full">
              <label>{t('field.customer_this_invoice')} <span className="req">*</span></label>
              <SearchableSelect
                options={customerOptions}
                value={row.customerId}
                onChange={(v) => setRow((r) => ({ ...r, customerId: v }))}
                ariaLabel={t('aria.customer')}
                placeholder={t('ph.select_customer')}
                searchPlaceholder={t('ph.search_customer')}
              />
            </div>
          )}
          {isMulti && contracts.length > 0 && (
            <div className="xpl-field">
              <label>{t('field.contract_price_filter')}</label>
              <select className="xpl-select" value={row.contractId} onChange={(e) => setRow((r) => ({ ...r, contractId: e.target.value }))} aria-label={t('aria.contract')}>
                <option value="">{t('opt.all_contracts')}</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.asphaltPlant ?? `#${c.id}`}</option>)}
              </select>
            </div>
          )}
          <div className="xpl-field">
            <label>{t('col.inv.number')} <span className="req">*</span></label>
            <input className="xpl-input" value={row.invoiceNumber} onChange={(e) => setRow((r) => ({ ...r, invoiceNumber: e.target.value }))} placeholder="MN-INV-YYYY-…" style={{ direction: 'ltr' }} aria-label={t('col.inv.number')} />
          </div>
          <div className="xpl-field">
            <label>{t('field.inv.delivery_date')}</label>
            <DateInput className="xpl-input" value={row.deliveryDate} onChange={(v) => setRow((r) => ({ ...r, deliveryDate: v }))} ariaLabel={t('field.inv.delivery_date')} />
          </div>
          <div className="xpl-field--full">
            <InvoiceLineItemsEditor
              items={row.items as Item[]}
              setItems={setItems}
              displayPrices={displayPrices}
              prices={prices}
              effectivePartySource="SALES"
              partyId={activeCustomerId}
              filterAsphaltPlant={filterAsphaltPlant}
            />
          </div>
          <div className="xpl-field">
            <label>{t('field.inv.discount_kd')}</label>
            <input className="xpl-input" type="number" min="0" step="0.001" value={row.discount} onChange={(e) => setRow((r) => ({ ...r, discount: Number(e.target.value) }))} style={{ direction: 'ltr' }} aria-label={t('lbl.inv.discount_plain')} />
          </div>
          <div className="xpl-field">
            <label>{t('col.inv.total')}</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-primary)' }}>{money(total)}</div>
          </div>
          <p className="xpl-field--full" style={{ margin: 0, fontSize: 11.5, color: 'var(--xpl-muted)' }}>
            {t('msg.fast_entry_shortcuts', { next: t('btn.save_and_next'), finish: t('btn.save_and_finish') })}
          </p>
        </DialogSection>

        {/* ── ملخص الجلسة (للعرض فقط) ── */}
        <DialogSection title={t('dlg.section.session_summary')} icon="summarize">
          <div className="xpl-field">
            <label>{t('inv.stats.count')}</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-text)' }}>{summary.count}</div>
          </div>
          <div className="xpl-field">
            <label>{t('lbl.session_total')}</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-primary)' }}>{money(summary.total)}</div>
          </div>
          <div className="xpl-field">
            <label>{t('lbl.last_invoice_number')}</label>
            <div style={{ fontSize: 13, color: 'var(--xpl-muted)', direction: 'ltr', textAlign: 'right' }}>{summary.lastNumber ?? '—'}</div>
          </div>
          <div className="xpl-field">
            <label>{t('lbl.suggested_next_number')}</label>
            <div style={{ fontSize: 13, color: 'var(--xpl-muted)', direction: 'ltr', textAlign: 'right' }}>{summary.nextNumber ?? '—'}</div>
          </div>
        </DialogSection>
      </div>
    </Dialog>
  );
}
