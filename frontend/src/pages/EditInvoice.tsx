import { useEffect, useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { useT } from '../lib/i18n';
import Modal from '../components/Modal';
import { MoneyText, dateText } from '../config/modules';
import { todayDateOnly } from '../lib/date';
import { DEFAULT_WORK_TYPE, parseDescription } from '../utils/invoiceDescription';
import { toInvoiceItemPayload } from '../utils/invoicePayload';
import {
  InvoiceLineItemsEditor,
  type Item,
} from '../components/invoices/InvoiceLineItemsEditor';
import { computeInvoiceTotals } from '../lib/money';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import { invoiceTypes, INVOICE_YEAR_OPTIONS, DEFAULT_INVOICE_YEAR } from '../utils/invoiceFormConstants';
import { useInvoicePartyPricing } from '../hooks/useInvoicePartyPricing';
import AttachmentsPanel from '../components/AttachmentsPanel';

function parseInvoiceNumber(invNum: string): { year: string; suffix: string } {
  const match = invNum.match(/^MN-INV-(\d{4})-(.+)$/);
  if (match) return { year: match[1], suffix: match[2] };
  return { year: DEFAULT_INVOICE_YEAR, suffix: invNum };
}

// ===== تعديل فاتورة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function EditInvoice({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const parsed = parseInvoiceNumber(invoice.invoiceNumber ?? '');
  const [invoiceYear, setInvoiceYear] = useState<string>(parsed.year);
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState(parsed.suffix);
  const [issueDate, setIssueDate] = useState<string>(
    invoice.issueDate ? String(invoice.issueDate).slice(0, 10) : todayDateOnly()
  );
  const [billingMonth, setBillingMonth] = useState<number>(Number(invoice.billingMonth) || (new Date().getMonth() + 1));
  const [billingYear, setBillingYear] = useState<number>(Number(invoice.billingYear) || new Date().getFullYear());

  const [directionChoice, setDirectionChoice] = useState<string>(
    invoice.direction === 'SALES' || invoice.direction === 'PURCHASE' ? invoice.direction : 'OTHER'
  );
  const [customDirection, setCustomDirection] = useState<string>(
    invoice.direction !== 'SALES' && invoice.direction !== 'PURCHASE' ? (invoice.direction ?? '') : ''
  );

  const standardInvTypes = invoiceTypes.slice(0, -1) as readonly string[];
  const isStandardType = standardInvTypes.includes(invoice.invoiceType ?? '');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<(typeof invoiceTypes)[number]>(
    isStandardType ? (invoice.invoiceType as (typeof invoiceTypes)[number]) : 'أخرى'
  );
  const [customInvoiceType, setCustomInvoiceType] = useState<string>(isStandardType ? '' : (invoice.invoiceType ?? ''));

  const [customPartyType, setCustomPartyType] = useState<'SALES' | 'PURCHASE'>(
    invoice.supplierId ? 'PURCHASE' : 'SALES'
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [partyId, setPartyId] = useState<string>(String((invoice as any).customerId ?? (invoice as any).supplierId ?? ''));

  const [items, setItems] = useState<Item[]>([{ uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState<string>(
    invoice.deliveryDate ? String(invoice.deliveryDate).slice(0, 10) : ''
  );
  const [discount, setDiscount] = useState<number>(Number(invoice.discount) || 0);
  const [notes, setNotes] = useState<string>(invoice.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const submittingRef = useRef(false);
  const [loadError, setLoadError] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [payments, setPayments] = useState<any[]>([]);

  const {
    effectivePartySource,
    parties,
    prices,
    contracts,
    contractId,
    setContractId,
    filterAsphaltPlant,
    displayPrices,
  } = useInvoicePartyPricing({ directionChoice, customPartyType, partyId, setPartyId, setItems });

  // Load full invoice data (items, notes)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    api.get(`/invoices/${invoice.id as number}`).then((res: any) => {
      const inv = res.data.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setItems(inv.items.map((it: any) => {
        const { workType, location } = parseDescription(it.description ?? '');
        return { uid: crypto.randomUUID(), description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice, workType, location };
      }));
      setDiscount(Number(inv.discount));
      setNotes(inv.notes ?? '');
      if (inv.issueDate) setIssueDate(String(inv.issueDate).slice(0, 10));
      if (inv.billingMonth) setBillingMonth(Number(inv.billingMonth));
      if (inv.billingYear) setBillingYear(Number(inv.billingYear));
      if (inv.deliveryDate) setDeliveryDate(String(inv.deliveryDate).slice(0, 10));
      if (Array.isArray(inv.payments)) setPayments(inv.payments);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    }).catch((e: any) => { setLoadError(errorMessage(e)); }).finally(() => { setLoadingData(false); });
  }, [invoice.id]);

  // نسبة الضريبة المخزَّنة تدخل الحساب: التعديل لا يرسل `taxRate`، فالخادم يُبقيها كما هي.
  // إغفالها هنا كان يعرض إجماليًا أقل من المخزَّن على أي فاتورة ضريبتها > 0 (تُنشأ عبر
  // الاستيراد أو الـAPI) — على فاتورة لم يمسّها المستخدم أصلًا.
  const { subtotal, total } = computeInvoiceTotals(items, Number(invoice.taxRate ?? 0), Number(discount));

  async function submit() {
    if (submittingRef.current) return; // حارس مزامن ضد النقر المزدوج قبل إعادة رسم React
    submittingRef.current = true;
    setError('');
    const invoiceNumber = `MN-INV-${invoiceYear}-${invoiceNumberSuffix.trim()}`;
    if (!invoiceNumberSuffix.trim()) { submittingRef.current = false; setError(t('error.inv_number_required')); return; }
    const resolvedDirection = directionChoice === 'OTHER' ? customDirection.trim() : directionChoice;
    if (directionChoice === 'OTHER' && !customDirection.trim()) { submittingRef.current = false; setError(t('error.custom_direction_required')); return; }
    const resolvedInvoiceType = invoiceTypeChoice === 'أخرى' ? customInvoiceType.trim() : invoiceTypeChoice;
    if (invoiceTypeChoice === 'أخرى' && !customInvoiceType.trim()) { submittingRef.current = false; setError(t('error.custom_invoice_type_required')); return; }
    if (!partyId) { submittingRef.current = false; setError(effectivePartySource === 'SALES' ? t('error.select_customer') : t('error.select_supplier')); return; }
    if (items.some((it) => !it.description)) { submittingRef.current = false; setError(t('error.item_desc_required')); return; }
    if (items.some((it) => !it.unit)) { submittingRef.current = false; setError(t('error.select_unit')); return; }
    if (items.some((it) => Number(it.quantity) <= 0)) { submittingRef.current = false; setError(t('error.qty_positive')); return; }
    if (items.some((it) => Number(it.unitPrice) < 0)) { submittingRef.current = false; setError(t('error.price_negative')); return; }
    // فاتورة مستقبلية التاريخ ممنوعة — الخادم يتحقق أيضًا؛ هذا فحص واجهة مبكر فقط.
    if (issueDate && issueDate > todayDateOnly()) { submittingRef.current = false; setError(t('error.future_issue_date')); return; }
    setSaving(true);
    try {
      await api.put(`/invoices/${invoice.id as number}`, {
        invoiceNumber,
        direction: resolvedDirection,
        invoiceType: resolvedInvoiceType,
        customerId: effectivePartySource === 'SALES' ? Number(partyId) : null,
        supplierId: effectivePartySource === 'PURCHASE' ? Number(partyId) : null,
        issueDate: issueDate || undefined,
        deliveryDate: deliveryDate || null,
        billingMonth,
        billingYear,
        discount: Number(discount),
        notes: notes.trim() || undefined,
        items: items.map(toInvoiceItemPayload),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  if (loadingData) return (
    <Modal title={t('modal.edit_invoice')} size="xl" onClose={onClose} footer={<button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>{t('msg.loading')}</div>
    </Modal>
  );

  if (loadError) return (
    <Modal title={t('modal.edit_invoice')} size="xl" onClose={onClose} footer={<button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>}>
      <div className="alert error">⚠️ {loadError}</div>
    </Modal>
  );

  return (
    <Modal title={`${t('modal.edit_invoice')} — ${String(invoice.invoiceNumber ?? invoice.number)}`} size="xl" onClose={onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
        <button type="button" className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>{t('col.inv.number')} *</label>
          <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
            <select
              value={invoiceYear}
              onChange={(e) => setInvoiceYear(e.target.value)}
              title={t('col.inv.number')}
              className="line-input"
              style={{ borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}
            >
              {INVOICE_YEAR_OPTIONS.map((y) => (
                <option key={y} value={String(y)}>MN-INV-{y}</option>
              ))}
            </select>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
              className="line-input"
              style={{ borderRadius: '0 10px 10px 0', direction: 'ltr' }}
            />
          </div>
        </div>
        <div className="field">
          <label>{t('lbl.inv.issue_date')}</label>
          <DateInput value={issueDate} onChange={(v) => {
            setIssueDate(v);
            if (v) {
              const [yy, mm] = v.split('-');
              setBillingMonth(Number(mm));
              setBillingYear(Number(yy));
            }
          }} title={t('lbl.inv.issue_date')} max={todayDateOnly()} />
          <HistoricalDateNotice date={issueDate} />
        </div>
        <div className="field">
          <label>{t('field.inv.delivery_date')}</label>
          <DateInput value={deliveryDate} onChange={setDeliveryDate} title={t('title.inv.delivery_date')} />
        </div>
        <div className="field">
          <label>{t('lbl.inv.billing_period')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={billingMonth} onChange={(e) => setBillingMonth(Number(e.target.value))} title={t('lbl.inv.billing_period')} style={{ flex: 1 }}>
              {ARABIC_MONTHS.map((name, idx) => <option key={idx + 1} value={idx + 1}>{name}</option>)}
            </select>
            <select value={billingYear} onChange={(e) => setBillingYear(Number(e.target.value))} title={t('field.inv.billing_year')} style={{ width: 90 }}>
              {billingYearOptions().map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div className="field">
          <label>{t('col.inv.type')}</label>
          <select value={invoiceTypeChoice} onChange={(e) => setInvoiceTypeChoice(e.target.value as (typeof invoiceTypes)[number])}>
            {invoiceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
        </div>
        {invoiceTypeChoice === 'أخرى' && (
          <div className="field">
            <label>{t('field.inv.custom_type')} *</label>
            <input value={customInvoiceType} onChange={(e) => setCustomInvoiceType(e.target.value)} placeholder={t('ph.inv.custom_type')} />
          </div>
        )}
        <div className="field">
          <label>{t('col.inv.direction')}</label>
          <select value={directionChoice} onChange={(e) => setDirectionChoice(e.target.value)}>
            <option value="SALES">{t('opt.direction.sales_full')}</option>
            <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
            <option value="OTHER">{t('opt.direction.other')}</option>
          </select>
        </div>
        {directionChoice === 'OTHER' && (
          <>
            <div className="field">
              <label>{t('field.inv.custom_direction')} *</label>
              <input value={customDirection} onChange={(e) => setCustomDirection(e.target.value)} placeholder={t('ph.inv.custom_direction')} />
            </div>
            <div className="field">
              <label>{t('field.inv.party_type')}</label>
              <select value={customPartyType} onChange={(e) => setCustomPartyType(e.target.value as 'SALES' | 'PURCHASE')} title={t('field.inv.party_type')}>
                <option value="SALES">{t('opt.direction.sales_full')}</option>
                <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
              </select>
            </div>
          </>
        )}
        <div className="field">
          <label>{effectivePartySource === 'SALES' ? t('col.customer') : t('col.supplier')} *</label>
          <select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
            <option value="">{t('msg.select_placeholder')}</option>
            {parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {effectivePartySource === 'SALES' && partyId && contracts.length > 0 && (
          <div className="field">
            <label>{t('field.inv.contract_filter')}</label>
            <select aria-label={t('aria.select_contract')} value={contractId} onChange={(e) => setContractId(e.target.value)}>
              <option value="">{t('opt.all_contracts')}</option>
              {contracts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}{c.asphaltPlant ? ` — ${c.asphaltPlant}` : ''}{c.companyName ? ` (${c.companyName})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <InvoiceLineItemsEditor
        items={items}
        setItems={setItems}
        displayPrices={displayPrices}
        prices={prices}
        effectivePartySource={effectivePartySource}
        partyId={partyId}
        filterAsphaltPlant={filterAsphaltPlant}
      />

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>{t('field.inv.discount_kd')}</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>{t('col.inv.total')}</label><div className="line-input" style={{ display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{<MoneyText value={total} />}</div></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}>
          <label>{t('field.notes')}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ resize: 'vertical' }} placeholder={t('field.notes')} />
        </div>
      </div>

      {/* Collection Summary */}
      {Number(invoice.total ?? 0) > 0 && (() => {
        const paid = Number(invoice.paidAmount ?? 0);
        const invTotal = Number(invoice.total ?? 0);
        const remaining = invTotal - paid;
        const pct = invTotal > 0 ? Math.round((paid / invTotal) * 100) : 0;
        const latestPmt = payments[0] ?? null;
        const statusLabel: Record<string, string> = { PENDING: t('inv.status_edit.pending'), PARTIAL: t('inv.status_alt.partial'), PAID: t('inv.status_edit.paid_full'), CANCELLED: t('inv.status.cancelled') };
        return (
          <div style={{ marginTop: 14, padding: '12px 16px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>{t('lbl.inv.collection_panel_title')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 10 }}>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('lbl.inv.invoice_total')}</div>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{<MoneyText value={invTotal} />}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('lbl.inv.collected_amount')}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: '#065f46' }}>{<MoneyText value={paid} />}</div>
              </div>
              <div style={{ textAlign: 'center', padding: '8px 10px', background: 'var(--bg)', borderRadius: 8, border: '1px solid var(--border)' }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3 }}>{t('lbl.inv.remaining_amount')}</div>
                <div style={{ fontWeight: 800, fontSize: 14, color: remaining > 0 ? '#dc2626' : '#065f46' }}>{<MoneyText value={remaining} />}</div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: payments.length > 0 ? 8 : 0 }}>
              <div style={{ flex: 1, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: pct >= 100 ? '#065f46' : pct >= 50 ? '#d97706' : '#dc2626', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', minWidth: 36, textAlign: 'end' }}>{pct}%</span>
              {invoice.status && <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 12, background: 'var(--bg)', border: '1px solid var(--border)', color: 'var(--text-muted)' }}>{statusLabel[invoice.status as string] ?? invoice.status}</span>}
            </div>
            {payments.length > 0 && (
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                <span>{t('lbl.inv.payment_count')} <strong style={{ color: 'var(--text)' }}>{payments.length}</strong></span>
                {latestPmt && <span>{t('lbl.inv.last_payment')} <strong style={{ color: 'var(--text)' }}>{<MoneyText value={latestPmt.amount} />}</strong></span>}
                {latestPmt?.date && <span>{t('lbl.inv.last_payment_date')} <strong style={{ color: 'var(--text)' }}>{dateText(latestPmt.date)}</strong></span>}
              </div>
            )}
          </div>
        );
      })()}

      <AttachmentsPanel entityType="INVOICE" entityId={invoice.id as number} />
    </Modal>
  );
}
