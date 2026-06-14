import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money, dateText } from '../config/modules';
import { usePersistedState } from '../hooks/usePersistedState';

const statusPill: Record<string, [string, string]> = {
  UNPAID: ['inv.status.unpaid', 'red'], PARTIAL: ['inv.status.partial', 'amber'], PAID: ['inv.status.paid', 'green'],
  OVERDUE: ['inv.status.overdue', 'red'], CANCELLED: ['inv.status.cancelled', 'gray'],
};

const invoiceTypes = ['نقل اسفلت', 'يومية عمل مالينج', 'يومية نقل اسفلت', 'أخرى'] as const;
const STANDARD_UNITS = ['طن', 'درب', 'يومية', 'مقطوعية'] as const;
type StandardUnit = (typeof STANDARD_UNITS)[number];
const UNIT_OTHER = 'أخرى';

function unitSelectValue(unit: string): string {
  return (STANDARD_UNITS as readonly string[]).includes(unit) ? unit : UNIT_OTHER;
}
function isCustomUnit(unit: string): boolean {
  return !(STANDARD_UNITS as readonly string[]).includes(unit);
}
const invoicePrefix = `MN-INV-${new Date().getFullYear()}-`;

interface Item { description: string; quantity: number; unit: string; unitPrice: number; priceTouched?: boolean; }

interface InvStats { total: number; unpaid: number; unpaidAmount: number; }

type PriceOption = {
  id: number;
  asphaltPlant?: string | null;
  companyName?: string | null;
  contractLocation?: string | null;
  contractUnit: string;
  unitPrice: number;
};

export default function Invoices() {
  const { hasPermission } = useAuth();
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('inv:page', 1);
  const [search, setSearch] = usePersistedState('inv:search', '');
  const [statusFilter, setStatusFilter] = usePersistedState('inv:status', '');
  const [directionFilter, setDirectionFilter] = usePersistedState('inv:direction', '');
  const [creating, setCreating] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [paying, setPaying] = useState<any | null>(null);
  const [loadError, setLoadError] = useState('');
  const [stats, setStats] = useState<InvStats | null>(null);

  const isFiltered = !!(search || statusFilter || directionFilter);

  function resetFilters() {
    setSearch('');
    setStatusFilter('');
    setDirectionFilter('');
    setPage(1);
  }

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.get('/invoices', {
        params: {
          page,
          pageSize: 15,
          search: search || undefined,
          status: statusFilter || undefined,
          direction: directionFilter || undefined,
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } catch (e) {
      setLoadError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter, directionFilter]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    api.get('/dashboard/executive').then((res) => {
      const inv = res.data?.data?.kpis?.invoices;
      if (inv) setStats({ total: inv.total ?? 0, unpaid: inv.unpaid ?? 0, unpaidAmount: inv.unpaidAmount ?? 0 });
    }).catch(() => { /* stats are non-critical */ });
  }, []);

  async function cancel(id: number) {
    if (!confirm(t('confirm.cancel_invoice'))) return;
    try { await api.patch(`/invoices/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'invoiceNumber', label: 'col.inv.number', render: (r: Record<string, unknown>) => <strong style={{ fontFamily: 'monospace' }}>{String(r.invoiceNumber ?? r.number)}</strong> },
    { key: 'invoiceType', label: 'col.inv.type', render: (r: Record<string, unknown>) => String(r.invoiceType ?? '—') },
    { key: 'direction', label: 'col.inv.direction', render: (r: Record<string, unknown>) => {
      if (r.direction === 'SALES') return t('opt.direction.sales');
      if (r.direction === 'PURCHASE') return t('opt.direction.purchase');
      return String(r.direction ?? '—');
    } },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { key: 'party', label: 'col.inv.party', render: (r: any) => r.customer?.name ?? r.supplier?.name ?? '—' },
    { key: 'issueDate', label: 'col.date', render: (r: Record<string, unknown>) => dateText(r.issueDate) },
    { key: 'total', label: 'col.inv.total', render: (r: Record<string, unknown>) => money(r.total) },
    { key: 'paidAmount', label: 'col.inv.paid', render: (r: Record<string, unknown>) => money(r.paidAmount) },
    { key: 'status', label: 'col.status', render: (r: Record<string, unknown>) => { const [key, c] = statusPill[String(r.status)] ?? ['—', 'gray']; return <span className={`pill ${c}`}>{t(key)}</span>; } },
  ];

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.invoices.title')}</h2><p>{t('page.invoices.subtitle')}</p></div>
        {hasPermission('invoices.create') && <button className="btn" onClick={() => setCreating(true)}>＋ {t('page.invoices.create')}</button>}
      </div>

      {stats && (
        <div className="inv-stats-strip">
          <div className="inv-stat-chip">
            <span className="inv-stat-icon">📄</span>
            <span className="inv-stat-label">{t('inv.stats.total')}</span>
            <span className="inv-stat-value">{stats.total}</span>
          </div>
          <div className="inv-stat-chip red">
            <span className="inv-stat-icon">🔴</span>
            <span className="inv-stat-label">{t('inv.stats.unpaid')}</span>
            <span className="inv-stat-value">{stats.unpaid}</span>
          </div>
          <div className="inv-stat-chip amber">
            <span className="inv-stat-icon">💰</span>
            <span className="inv-stat-label">{t('inv.stats.unpaid_amount')}</span>
            <span className="inv-stat-value">{money(stats.unpaidAmount)}</span>
          </div>
        </div>
      )}

      {loadError && (
        <div className="alert error" role="alert" aria-live="assertive" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ flex: 1 }}>⚠️ {loadError}</span>
          <button type="button" className="btn secondary sm" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
        </div>
      )}
      <form className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }} onSubmit={(e) => e.preventDefault()}>
        <input
          placeholder={t('page.invoices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 280 }}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          title={t('filter.status')}
          style={{ ...inp, maxWidth: 180 }}
        >
          <option value="">{t('opt.all')}</option>
          <option value="UNPAID">{t('inv.status.unpaid')}</option>
          <option value="PARTIAL">{t('inv.status.partial')}</option>
          <option value="PAID">{t('inv.status.paid')}</option>
          <option value="OVERDUE">{t('inv.status.overdue')}</option>
          <option value="CANCELLED">{t('inv.status.cancelled')}</option>
        </select>
        <select
          value={directionFilter}
          onChange={(e) => { setDirectionFilter(e.target.value); setPage(1); }}
          title={t('filter.direction')}
          style={{ ...inp, maxWidth: 180 }}
        >
          <option value="">{t('opt.all')}</option>
          <option value="SALES">{t('opt.direction.sales')}</option>
          <option value="PURCHASE">{t('opt.direction.purchase')}</option>
        </select>
        {isFiltered && (
          <button type="button" className="btn secondary sm" onClick={resetFilters}>
            {t('action.reset_filters')}
          </button>
        )}
        <button type="button" className="btn secondary" onClick={load} disabled={loading}>↻ {t('action.refresh')}</button>
      </form>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.invoices')}
        isFiltered={isFiltered}
        onResetFilters={resetFilters}
        emptyAction={hasPermission('invoices.create') ? (
          <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('page.invoices.create')}</button>
        ) : undefined}
        actions={(row) => (
          <>
            {hasPermission('invoices.update') && row.status !== 'PAID' && row.status !== 'CANCELLED' && (
              <button className="btn sm" onClick={() => setPaying(row)}>{t('page.invoices.collect')}</button>
            )}{' '}
            {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
              <button className="btn secondary sm" onClick={() => cancel(row.id)}>{t('page.invoices.cancel_inv')}</button>
            )}
          </>
        )}
      />

      {creating && <CreateInvoice onClose={() => setCreating(false)} onSaved={load} />}
      {paying && <AddPayment invoice={paying} onClose={() => setPaying(null)} onSaved={load} />}
    </div>
  );
}

// ===== إنشاء فاتورة =====
function CreateInvoice({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [invoiceNumberSuffix, setInvoiceNumberSuffix] = useState('');
  const [directionChoice, setDirectionChoice] = useState('SALES'); // SALES | PURCHASE | OTHER
  const [customDirection, setCustomDirection] = useState('');
  const [invoiceTypeChoice, setInvoiceTypeChoice] = useState<(typeof invoiceTypes)[number]>('نقل اسفلت');
  const [customInvoiceType, setCustomInvoiceType] = useState('');
  // for custom direction: which party type to link
  const [customPartyType, setCustomPartyType] = useState<'SALES' | 'PURCHASE'>('SALES');
  const [partyId, setPartyId] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [parties, setParties] = useState<any[]>([]);
  const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'طن', unitPrice: 0 }]);
  const [discount, setDiscount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [prices, setPrices] = useState<PriceOption[]>([]);
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);

  // resolve the effective party source for fetching the list
  const effectivePartySource = directionChoice === 'OTHER' ? customPartyType : directionChoice;

  useEffect(() => {
    (async () => {
      const ep = effectivePartySource === 'SALES' ? '/customers' : '/suppliers';
      const res = await api.get(ep, { params: { pageSize: 200 } });
      setParties(res.data.data.data ?? []);
      setPartyId('');
    })();
  }, [effectivePartySource]);

  // reset party when switching party type inside OTHER
  useEffect(() => {
    if (directionChoice === 'OTHER') setPartyId('');
  }, [customPartyType, directionChoice]);

  useEffect(() => {
    api.get('/prices', { params: { pageSize: 200 } })
      .then((res) => setPrices(res.data?.data?.data ?? []))
      .catch((e) => { console.warn('[CreateInvoice] prices fetch failed:', e); });
  }, []);

  useEffect(() => {
    if (openPickerIdx === null) return;
    function handleOutsideClick() { setOpenPickerIdx(null); }
    function handleEscape(e: KeyboardEvent) { if (e.key === 'Escape') setOpenPickerIdx(null); }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openPickerIdx]);

  const lineTotal = (it: Item) => Number(it.quantity) * Number(it.unitPrice);
  const subtotal = items.reduce((s, it) => s + lineTotal(it), 0);
  const total = Math.max(0, subtotal - Number(discount));

  function setItem(i: number, key: keyof Item, value: string | number) {
    if (key === 'unit') {
      const newUnit = String(value);
      setOpenPickerIdx(null);
      if (newUnit === UNIT_OTHER) {
        // user switched dropdown to أخرى — keep existing custom text or clear to blank
        setItems((prev) =>
          prev.map((it, idx) => {
            if (idx !== i) return it;
            return { ...it, unit: isCustomUnit(it.unit) ? it.unit : '' };
          })
        );
        return;
      }
      setItems((prev) =>
        prev.map((it, idx) => {
          if (idx !== i) return it;
          const base = { ...it, unit: newUnit };
          if (!it.priceTouched) {
            const matches = prices.filter((p) => p.contractUnit === newUnit);
            if (matches.length === 1) return { ...base, unitPrice: matches[0].unitPrice };
          }
          return base;
        })
      );
      return;
    }
    setItems((prev) =>
      prev.map((it, idx) => {
        if (idx !== i) return it;
        const priceTouched = key === 'unitPrice' ? true : it.priceTouched;
        return { ...it, [key]: key === 'description' ? String(value) : Number(value), priceTouched };
      })
    );
  }

  function applyPrice(i: number, price: PriceOption) {
    setItems((p) => p.map((it, idx) => idx === i ? { ...it, unitPrice: price.unitPrice, unit: price.contractUnit, priceTouched: true } : it));
    setOpenPickerIdx(null);
  }

  async function submit() {
    setError('');
    const invoiceNumber = `${invoicePrefix}${invoiceNumberSuffix.trim()}`;
    if (!invoiceNumberSuffix.trim()) { setError(t('error.inv_number_required')); return; }

    const resolvedDirection = directionChoice === 'OTHER' ? customDirection.trim() : directionChoice;
    if (directionChoice === 'OTHER' && !customDirection.trim()) { setError(t('error.custom_direction_required')); return; }

    const resolvedInvoiceType = invoiceTypeChoice === 'أخرى' ? customInvoiceType.trim() : invoiceTypeChoice;
    if (invoiceTypeChoice === 'أخرى' && !customInvoiceType.trim()) { setError(t('error.custom_invoice_type_required')); return; }

    if (!partyId) { setError(effectivePartySource === 'SALES' ? t('error.select_customer') : t('error.select_supplier')); return; }
    if (items.some((it) => !it.description)) { setError(t('error.item_desc_required')); return; }
    if (items.some((it) => !it.unit)) { setError(t('error.select_unit')); return; }
    if (items.some((it) => Number(it.quantity) <= 0)) { setError(t('error.qty_positive')); return; }
    if (items.some((it) => Number(it.unitPrice) < 0)) { setError(t('error.price_negative')); return; }

    setSaving(true);
    try {
      await api.post('/invoices', {
        invoiceNumber,
        direction: resolvedDirection,
        invoiceType: resolvedInvoiceType,
        customerId: effectivePartySource === 'SALES' ? Number(partyId) : undefined,
        supplierId: effectivePartySource === 'PURCHASE' ? Number(partyId) : undefined,
        discount: Number(discount),
        items: items.map((it) => ({ description: it.description, quantity: it.quantity, unit: it.unit, unitPrice: it.unitPrice })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={t('modal.new_invoice')} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.save_invoice')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>{t('col.inv.number')} *</label>
          <div style={{ display: 'flex', alignItems: 'center', direction: 'ltr' }}>
            <span style={{ ...inp, borderRadius: '10px 0 0 10px', borderInlineEnd: 0, background: 'var(--surface-2)', whiteSpace: 'nowrap' }}>{invoicePrefix}</span>
            <input
              value={invoiceNumberSuffix}
              onChange={(e) => setInvoiceNumberSuffix(e.target.value)}
              placeholder="001"
              style={{ borderRadius: '0 10px 10px 0', direction: 'ltr' }}
            />
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
              style={inp}
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
                style={inp}
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
      </div>

      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
      {items.map((it, i) => (
        <div key={i} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'center', width: '100%' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input placeholder={t('col.description')} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder={t('ph.qty')} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select
              value={unitSelectValue(it.unit)}
              onChange={(e) => setItem(i, 'unit', e.target.value)}
              title="الوحدة"
              style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            >
              {(STANDARD_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={UNIT_OTHER}>{UNIT_OTHER}</option>
            </select>
            {unitSelectValue(it.unit) === UNIT_OTHER && (
              <input
                value={it.unit}
                onChange={(e) => setItem(i, 'unit', e.target.value)}
                placeholder="اكتب الوحدة"
                style={{ ...inp, width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 4 }}
              />
            )}
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'visible', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.001" placeholder={t('ph.unit_price')} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} style={{ ...inp, flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
              {(() => { const unitPrices = prices.filter((p) => p.contractUnit === it.unit); return unitPrices.length > 0 ? (
                <>
                  <button
                    type="button"
                    className="btn secondary sm"
                    style={{ flexShrink: 0, padding: '0 8px', fontSize: 14 }}
                    title={t('ph.prices.picker_btn')}
                    aria-label={t('ph.prices.picker_btn')}
                    aria-haspopup="listbox"
                    aria-expanded={openPickerIdx === i ? 'true' : 'false'}
                    onClick={(e) => { e.stopPropagation(); setOpenPickerIdx(openPickerIdx === i ? null : i); }}
                  >
                    📋
                  </button>
                  {openPickerIdx === i && (
                    <div
                      role="listbox"
                      aria-label={t('ph.prices.picker_list')}
                      onMouseDown={(e) => e.stopPropagation()}
                      style={{ position: 'absolute', top: '100%', insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 200, minWidth: 300, maxHeight: 260, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)', marginTop: 2 }}
                    >
                      <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 700, userSelect: 'none' }}>
                        {t('ph.prices.picker_unit')}: {it.unit}
                      </div>
                      {unitPrices.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="option"
                          aria-selected="false"
                          style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 12px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)', lineHeight: 1.5 }}
                          onClick={() => applyPrice(i, p)}
                        >
                          <strong>{p.asphaltPlant ?? '—'}</strong>{p.companyName ? ` — ${p.companyName}` : ''}{p.contractLocation ? ` — ${p.contractLocation}` : ''} — <strong>{money(p.unitPrice)}</strong>
                        </button>
                      ))}
                    </div>
                  )}
                </>
              ) : null; })()}
            </div>
          </div>
          <div className="invoice-cell total-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div style={{ ...inp, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(lineTotal(it))}</div>
          </div>
          <div className="invoice-cell delete-cell" style={{ minWidth: 0 }}>
            {items.length > 1 && (
              <button
                className="btn secondary sm"
                type="button"
                onClick={() => { if (openPickerIdx === i) setOpenPickerIdx(null); setItems((p) => p.filter((_, idx) => idx !== i)); }}
              >
                ✕
              </button>
            )}
          </div>
        </div>
      ))}
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'طن', unitPrice: 0 }])}>{t('btn.inv.add_material')}</button>

      <div className="form-grid" style={{ marginTop: 16 }}>
        <div className="field"><label>{t('field.inv.discount_kd')}</label><input type="number" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></div>
        <div className="field"><label>{t('col.inv.total')}</label><div style={{ ...inp, display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default' }}>{money(total)}</div></div>
      </div>
    </Modal>
  );
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' };

// ===== تسجيل دفعة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function AddPayment({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const remaining = Number(invoice.total) - Number(invoice.paidAmount);
  const [amount, setAmount] = useState(remaining);
  const [method, setMethod] = useState('CASH');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    setSaving(true);
    try {
      await api.post(`/invoices/${invoice.id}/payments`, { amount: Number(amount), method });
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`${t('modal.collect_payment')} — ${invoice.invoiceNumber ?? invoice.number}`} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('btn.record_payment')}</button>
        <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <p style={{ marginBottom: 16, color: 'var(--text-muted)', fontWeight: 600 }}>{t('lbl.remaining')} {money(remaining)}</p>
      <div className="form-grid">
        <div className="field"><label>{t('field.amount_kd')}</label><input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
        <div className="field">
          <label>{t('field.payment_method')}</label>
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="CASH">{t('opt.payment.cash')}</option>
            <option value="BANK">{t('opt.payment.bank')}</option>
            <option value="CHEQUE">{t('opt.payment.cheque')}</option>
            <option value="TRANSFER">{t('opt.payment.transfer')}</option>
          </select>
        </div>
      </div>
    </Modal>
  );
}
