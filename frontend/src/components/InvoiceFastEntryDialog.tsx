import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { money } from '../config/modules';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import { useToast } from '../stores/toastStore';
import { Dialog, DialogSection, Button } from './explorer/ExplorerKit';
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
  const toast = useToast();
  const now = new Date();
  const [shared, setShared] = useState<InvoiceSharedFields>({
    entryMode: 'SINGLE',
    direction: 'SALES',
    invoiceType: 'نقل اسفلت',
    issueDate: now.toISOString().slice(0, 10),
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

  const customerOptions: SearchableOption[] = customers.map((c) => ({ value: String(c.id), label: c.name }));

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
    if (isInvoiceRowDirty(row) && !window.confirm('تغيير نمط الإدخال سيتجاهل الفاتورة الحالية غير المحفوظة. هل تريد المتابعة؟')) return;
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
    const validationError = validateInvoiceRow(shared, row);
    if (validationError) { setError(validationError); return { ok: false, nextNumber: row.invoiceNumber }; }
    if (pricesLoading) { setError('يرجى الانتظار حتى تحميل أسعار العميل'); return { ok: false, nextNumber: row.invoiceNumber }; }
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
    toast.ok(`✓ تم إنشاء الفاتورة ${row.invoiceNumber} بنجاح`);
    setRow(makeEmptyRow(nextNumber));
    focusFirstItem();
  }

  async function saveAndFinish() {
    const { ok } = await saveCurrentRow();
    if (!ok) return;
    toast.ok(`✓ تم إنشاء الفاتورة ${row.invoiceNumber} بنجاح`);
    onSaved();
    onClose();
  }

  function requestClose() {
    if (isInvoiceRowDirty(row)) {
      if (!window.confirm('لديك فاتورة غير محفوظة في الصف الحالي. الإغلاق سيتجاهلها. هل تريد المتابعة؟')) return;
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
      title="إدخال فواتير سريع"
      subtitle={`مبيعات · ${isMulti ? 'عملاء متعددون' : 'عميل واحد للجلسة'} — كل فاتورة تُحفظ كفاتورة عادية`}
      size="xl"
      onClose={requestClose}
      footer={
        <>
          <Button variant="primary" icon="playlist_add" busy={saving} disabled={pricesLoading} onClick={saveAndNext}>حفظ وإضافة التالي</Button>
          <Button variant="secondary" icon="save" busy={saving} disabled={pricesLoading} onClick={saveAndFinish}>حفظ وإنهاء</Button>
          <Button variant="ghost" onClick={requestClose}>إلغاء</Button>
        </>
      }
    >
      <div onKeyDown={onKeyDown} ref={bodyRef}>
        {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}

        {/* ── نمط الإدخال (اختيار أول) ── */}
        <DialogSection title="اختر نمط الإدخال" icon="tune">
          <div className="xpl-field xpl-field--full">
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="fe-mode" checked={!isMulti} onChange={() => switchMode('SINGLE')} />
                <span>عميل واحد <span style={{ color: 'var(--xpl-muted)', fontSize: 12 }}>(موصى به)</span></span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" name="fe-mode" checked={isMulti} onChange={() => switchMode('MULTI')} />
                <span>عملاء متعددون</span>
              </label>
              <span className="xpl-chip xpl-chip--indigo" style={{ marginInlineStart: 'auto' }}>
                {isMulti
                  ? 'عملاء متعددون'
                  : (customers.find((c) => String(c.id) === shared.customerId)?.name
                      ? `عميل: ${customers.find((c) => String(c.id) === shared.customerId)?.name}`
                      : 'عميل واحد')}
              </span>
            </div>
          </div>
        </DialogSection>

        {/* ── حقول مشتركة ثابتة ── */}
        <DialogSection title="حقول مشتركة (ثابتة للجلسة)" icon="push_pin">
          {!isMulti && (
            <div className="xpl-field xpl-field--full">
              <label>العميل (ثابت للجلسة) <span className="req">*</span></label>
              <SearchableSelect
                options={customerOptions}
                value={shared.customerId}
                onChange={(v) => patchShared({ customerId: v })}
                ariaLabel="العميل"
                placeholder="اختر العميل…"
                searchPlaceholder="ابحث عن عميل…"
              />
            </div>
          )}
          {!isMulti && contracts.length > 0 && (
            <div className="xpl-field">
              <label>العقد (لتصفية الأسعار)</label>
              <select className="xpl-select" value={shared.contractId} onChange={(e) => patchShared({ contractId: e.target.value })} aria-label="العقد">
                <option value="">كل العقود</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.asphaltPlant ?? `#${c.id}`}</option>)}
              </select>
            </div>
          )}
          <div className="xpl-field">
            <label>نوع الفاتورة</label>
            <select className="xpl-select" value={shared.invoiceType} onChange={(e) => patchShared({ invoiceType: e.target.value })} aria-label="نوع الفاتورة">
              {INVOICE_TYPES.map((it) => <option key={it} value={it}>{it}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>تاريخ الفاتورة</label>
            <input className="xpl-input" type="date" value={shared.issueDate} onChange={(e) => {
              const v = e.target.value;
              const patch: Partial<InvoiceSharedFields> = { issueDate: v };
              if (v) {
                const d = new Date(v);
                patch.billingMonth = d.getMonth() + 1;
                patch.billingYear = d.getFullYear();
                // سنة رقم الفاتورة تتبع تاريخ الإصدار في الإدخال السريع أيضًا.
                patch.numberYear = deriveInvoiceYearFromIssueDate(v, d.getFullYear());
              }
              patchShared(patch);
            }} aria-label="تاريخ الفاتورة" />
            <HistoricalDateNotice date={shared.issueDate} />
          </div>
          <div className="xpl-field">
            <label>شهر الحساب</label>
            <select className="xpl-select" value={shared.billingMonth} onChange={(e) => patchShared({ billingMonth: Number(e.target.value) })} aria-label="شهر الحساب">
              {ARABIC_MONTHS.map((n, i) => <option key={i + 1} value={i + 1}>{n}</option>)}
            </select>
          </div>
          <div className="xpl-field">
            <label>سنة الحساب</label>
            <select className="xpl-select" value={shared.billingYear} onChange={(e) => patchShared({ billingYear: Number(e.target.value) })} aria-label="سنة الحساب">
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </DialogSection>

        {/* ── الفاتورة الحالية ── */}
        <DialogSection title="الفاتورة الحالية" icon="receipt_long">
          {isMulti && (
            <div className="xpl-field xpl-field--full">
              <label>العميل (لهذه الفاتورة) <span className="req">*</span></label>
              <SearchableSelect
                options={customerOptions}
                value={row.customerId}
                onChange={(v) => setRow((r) => ({ ...r, customerId: v }))}
                ariaLabel="العميل"
                placeholder="اختر العميل…"
                searchPlaceholder="ابحث عن عميل…"
              />
            </div>
          )}
          {isMulti && contracts.length > 0 && (
            <div className="xpl-field">
              <label>العقد (لتصفية الأسعار)</label>
              <select className="xpl-select" value={row.contractId} onChange={(e) => setRow((r) => ({ ...r, contractId: e.target.value }))} aria-label="العقد">
                <option value="">كل العقود</option>
                {contracts.map((c) => <option key={c.id} value={c.id}>{c.asphaltPlant ?? `#${c.id}`}</option>)}
              </select>
            </div>
          )}
          <div className="xpl-field">
            <label>رقم الفاتورة <span className="req">*</span></label>
            <input className="xpl-input" value={row.invoiceNumber} onChange={(e) => setRow((r) => ({ ...r, invoiceNumber: e.target.value }))} placeholder="MN-INV-YYYY-…" style={{ direction: 'ltr' }} aria-label="رقم الفاتورة" />
          </div>
          <div className="xpl-field">
            <label>تاريخ التسليم</label>
            <input className="xpl-input" type="date" value={row.deliveryDate} onChange={(e) => setRow((r) => ({ ...r, deliveryDate: e.target.value }))} aria-label="تاريخ التسليم" />
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
            <label>الخصم (د.ك)</label>
            <input className="xpl-input" type="number" min="0" step="0.001" value={row.discount} onChange={(e) => setRow((r) => ({ ...r, discount: Number(e.target.value) }))} style={{ direction: 'ltr' }} aria-label="الخصم" />
          </div>
          <div className="xpl-field">
            <label>الإجمالي</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-primary)' }}>{money(total)}</div>
          </div>
          <p className="xpl-field--full" style={{ margin: 0, fontSize: 11.5, color: 'var(--xpl-muted)' }}>
            اختصارات: Ctrl+Enter = حفظ وإضافة التالي · Ctrl+Shift+Enter = حفظ وإنهاء
          </p>
        </DialogSection>

        {/* ── ملخص الجلسة (للعرض فقط) ── */}
        <DialogSection title="ملخص الجلسة" icon="summarize">
          <div className="xpl-field">
            <label>عدد الفواتير</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-text)' }}>{summary.count}</div>
          </div>
          <div className="xpl-field">
            <label>إجمالي الجلسة</label>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--xpl-primary)' }}>{money(summary.total)}</div>
          </div>
          <div className="xpl-field">
            <label>آخر رقم فاتورة</label>
            <div style={{ fontSize: 13, color: 'var(--xpl-muted)', direction: 'ltr', textAlign: 'right' }}>{summary.lastNumber ?? '—'}</div>
          </div>
          <div className="xpl-field">
            <label>الرقم التالي المقترح</label>
            <div style={{ fontSize: 13, color: 'var(--xpl-muted)', direction: 'ltr', textAlign: 'right' }}>{summary.nextNumber ?? '—'}</div>
          </div>
        </DialogSection>
      </div>
    </Dialog>
  );
}
