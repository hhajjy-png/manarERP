import { useRef, useState } from 'react';
import { api, errorMessage } from '../api/client';
import DateInput from '../components/DateInput';
import { deriveInvoiceYearFromIssueDate } from '../lib/invoiceNumber';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import { useT } from '../lib/i18n';
import Modal from '../components/Modal';
import { Dialog, DialogSection, Button as XplButton, DrawerField } from '../components/explorer/ExplorerKit';
import { MoneyText, dateText } from '../config/modules';
import { todayDateOnly } from '../lib/date';
import { DEFAULT_WORK_TYPE } from '../utils/invoiceDescription';
import { toInvoiceItemPayload } from '../utils/invoicePayload';
import {
  InvoiceLineItemsEditor,
  invoiceLineTotal,
  type Item,
} from '../components/invoices/InvoiceLineItemsEditor';
import { ARABIC_MONTHS, billingYearOptions } from '../utils/dateUtils';
import { invoiceTypes, INVOICE_YEAR_OPTIONS, DEFAULT_INVOICE_YEAR } from '../utils/invoiceFormConstants';
import { useInvoicePartyPricing } from '../hooks/useInvoicePartyPricing';

// ===== إنشاء فاتورة =====
export default function CreateInvoice({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [invoiceYear, setInvoiceYear] = useState<string>(DEFAULT_INVOICE_YEAR);
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState('');
  const [issueDate, setIssueDate] = useState<string>(todayDateOnly());
  const [billingMonth, setBillingMonth] = useState<number>(new Date().getMonth() + 1);
  const [billingYear, setBillingYear] = useState<number>(new Date().getFullYear());
  const [directionChoice, setDirectionChoice] = useState('SALES'); // SALES | PURCHASE | OTHER
  const [customDirection, setCustomDirection] = useState('');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<(typeof invoiceTypes)[number]>('نقل اسفلت');
  const [customInvoiceType, setCustomInvoiceType] = useState('');
  // for custom direction: which party type to link
  const [customPartyType, setCustomPartyType] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [partyId, setPartyId] = useState('');
  const [items, setItems] = useState<Item[]>([{ uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [pendingPayload, setPendingPayload] = useState<Record<string, any> | null>(null);
  const submittingRef = useRef(false);

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

  const subtotal = items.reduce((s, it) => s + invoiceLineTotal(it), 0);
  const total = Math.max(0, subtotal - Number(discount));
  const invoiceNumber = `MN-INV-${invoiceYear}-${invoiceNumberSuffix.trim()}`;
  const partyName = parties.find((p) => String(p.id) === partyId)?.name ?? '—';

  /** يتحقق من كل حقول الفاتورة، ثم — بدل الإنشاء الفوري — يجهّز الحمولة ويعرض حوار التأكيد. */
  function submit() {
    if (submittingRef.current) return; // حارس مزامن ضد النقر المزدوج قبل إعادة رسم React
    submittingRef.current = true;
    setError('');
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

    setPendingPayload({
      invoiceNumber,
      direction: resolvedDirection,
      invoiceType: resolvedInvoiceType,
      customerId: effectivePartySource === 'SALES' ? Number(partyId) : undefined,
      supplierId: effectivePartySource === 'PURCHASE' ? Number(partyId) : undefined,
      issueDate: issueDate || undefined,
      deliveryDate: deliveryDate || null,
      billingMonth,
      billingYear,
      discount: Number(discount),
      items: items.map(toInvoiceItemPayload),
    });
    submittingRef.current = false;
    setConfirming(true);
  }

  /** يُستدعى فقط بعد التأكيد الصريح من حوار المراجعة — هنا فقط يُنشأ السجل فعليًا. */
  async function confirmCreate() {
    if (!pendingPayload || saving) return;
    setSaving(true);
    try {
      await api.post('/invoices', pendingPayload);
      setConfirming(false);
      onSaved();
      onClose();
    } catch (err) {
      setConfirming(false);
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  function cancelConfirm() {
    if (saving) return;
    setConfirming(false);
  }

  return (
    <>
    {/* onClose is inert while the confirmation dialog is open — Escape is a
        document-level listener in both Modal and Dialog, so without this guard
        a single Escape press would close both stacked layers at once instead
        of just the top-most confirmation. */}
    <Modal title={t('modal.new_invoice')} size="xl" onClose={confirming ? () => {} : onClose} footer={
      <>
        <button type="button" className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.save_invoice')}</button>
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
          <DateInput
            value={issueDate}
            onChange={(v) => {
              setIssueDate(v);
              if (v) {
                const [yy, mm] = v.split('-');
                setBillingMonth(Number(mm));
                setBillingYear(Number(yy));
                // سنة رقم الفاتورة تتبع تاريخ الإصدار (فاتورة 2024 → MN-INV-2024-…).
                setInvoiceYear(String(deriveInvoiceYearFromIssueDate(v, Number(yy))));
              }
            }}
            title={t('lbl.inv.issue_date')}
            max={todayDateOnly()}
          />
          <HistoricalDateNotice date={issueDate} />
        </div>
        <div className="field">
          <label>{t('field.inv.delivery_date')}</label>
          <DateInput
            value={deliveryDate}
            onChange={setDeliveryDate}
            title={t('title.inv.delivery_date')}
          />
        </div>
        <div className="field">
          <label>{t('lbl.inv.billing_period')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <select
              value={billingMonth}
              onChange={(e) => setBillingMonth(Number(e.target.value))}
              title={t('lbl.inv.billing_period')}
              style={{ flex: 1 }}
            >
              {ARABIC_MONTHS.map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
            <select
              value={billingYear}
              onChange={(e) => setBillingYear(Number(e.target.value))}
              title={t('field.inv.billing_year')}
              style={{ width: 90 }}
            >
              {billingYearOptions().map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
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
            <input
              value={customInvoiceType}
              onChange={(e) => setCustomInvoiceType(e.target.value)}
              placeholder={t('ph.inv.custom_type')}
            />
          </div>
        )}
        <div className="field">
          <label>{t('col.inv.direction')}</label>
          <select value={directionChoice} onChange={(e) => { setDirectionChoice(e.target.value); setPartyId(''); }}>
            <option value="SALES">{t('opt.direction.sales_full')}</option>
            <option value="PURCHASE">{t('opt.direction.purchase_full')}</option>
            <option value="OTHER">{t('opt.direction.other')}</option>
          </select>
        </div>
        {directionChoice === 'OTHER' && (
          <>
            <div className="field">
              <label>{t('field.inv.custom_direction')} *</label>
              <input
                value={customDirection}
                onChange={(e) => setCustomDirection(e.target.value)}
                placeholder={t('ph.inv.custom_direction')}
              />
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

      {/* Financial Summary */}
      <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'end' }}>
        <div className="field">
          <label>{t('field.inv.discount_kd')}</label>
          <input type="number" title={t('field.inv.discount_kd')} value={discount} onChange={(e) => setDiscount(Number(e.target.value))} />
        </div>
        <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('lbl.inv.subtotal')}</span>
            <span style={{ fontWeight: 600 }}>{<MoneyText value={subtotal} />}</span>
          </div>
          {Number(discount) > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('field.inv.discount_kd')}</span>
              <span style={{ fontWeight: 600, color: '#dc2626' }}>−{<MoneyText value={discount} />}</span>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 800, borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 4, color: 'var(--accent)' }}>
            <span>{t('lbl.inv.grand_total')}</span>
            <span>{<MoneyText value={total} />}</span>
          </div>
        </div>
      </div>
    </Modal>
    {confirming && pendingPayload && (
      <Dialog
        icon="fact_check"
        title={t('dlg.confirm_invoice.title')}
        subtitle={t('dlg.confirm_invoice.subtitle')}
        size="sm"
        elevated
        onClose={cancelConfirm}
        footer={
          <>
            <XplButton variant="primary" icon="check_circle" busy={saving} onClick={confirmCreate}>
              {t('dlg.confirm_invoice.confirm_btn')}
            </XplButton>
            <XplButton variant="ghost" onClick={cancelConfirm} disabled={saving}>
              {t('action.cancel')}
            </XplButton>
          </>
        }
      >
        <DialogSection>
          <DrawerField label={t('col.inv.number')} value={invoiceNumber} mono />
          <DrawerField label={effectivePartySource === 'SALES' ? t('col.customer') : t('col.supplier')} value={partyName} />
          <DrawerField label={t('lbl.inv.issue_date')} value={dateText(issueDate)} />
          <DrawerField label={t('dlg.confirm_invoice.items_count')} value={items.length} />
          <DrawerField label={t('lbl.inv.grand_total')} value={<MoneyText value={total} />} />
        </DialogSection>
      </Dialog>
    )}
    </>
  );
}
