import { useEffect, useState } from 'react';
import { money } from '../../config/modules';
import { roundMoney } from '../../lib/money';
import { useT } from '../../lib/i18n';
import { WORK_TYPES, DEFAULT_WORK_TYPE, composeDescription } from '../../utils/invoiceDescription';
import { CategoryGroup } from '../../constants/kuwaitLocations';
import { addRecentLocation, computeDropdown } from '../../utils/recentLocations';

// ─────────────────────────────────────────────────────────────────────────
//  محرّر بنود الفاتورة — مصدر واحد يستهلكه نموذج «فاتورة جديدة» وحوار الإدخال
//  السريع. مُستخرَج حرفيًا من CreateInvoice دون أي تغيير سلوكي (refactor بحت).
// ─────────────────────────────────────────────────────────────────────────

export interface Item {
  uid: string;
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  priceTouched?: boolean;
  workType?: string;
  location?: string;
}

export type PriceOption = {
  id: number;
  asphaltPlant?: string | null;
  companyName?: string | null;
  contractLocation?: string | null;
  contractUnit: string;
  unitPrice: number;
};

export const STANDARD_UNITS = ['طن', 'درب', 'معالجات', 'يومية', 'مقطوعية'] as const;
export type StandardUnit = (typeof STANDARD_UNITS)[number];
export const UNIT_OTHER = 'أخرى';

export function unitSelectValue(unit: string): string {
  return (STANDARD_UNITS as readonly string[]).includes(unit) ? unit : UNIT_OTHER;
}
export function isCustomUnit(unit: string): boolean {
  return !(STANDARD_UNITS as readonly string[]).includes(unit);
}

/**
 * إجمالي البند = الكمية × السعر، **مقرَّبًا** إلى 3 خانات (مصدر واحد لحساب المجموع الفرعي).
 *
 * الخادم يخزّن `round3(quantity × unitPrice)` لكل بند (`invoices.calc.ts`)؛ فبقاء هذه
 * الدالة خامًا كان يجعل البند المعروض ومجموع الشاشة يخالفان المخزَّن عند الأسعار ذات
 * الخانة الرابعة.
 */
export function invoiceLineTotal(it: Item): number {
  return roundMoney(Number(it.quantity) * Number(it.unitPrice));
}

// ===== الإكمال التلقائي للموقع =====
export function LocationAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useT();
  const [topLocations, setTopLocations] = useState<string[]>([]);
  const [recentMatches, setRecentMatches] = useState<string[]>([]);
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [open, setOpen] = useState(false);

  function refresh(query: string) {
    const { topLocations: tl, recentMatches: rm, catalogGroups } = computeDropdown(query);
    setTopLocations(tl);
    setRecentMatches(rm);
    setGroups(catalogGroups);
    setOpen(tl.length > 0 || rm.length > 0 || catalogGroups.length > 0);
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    onChange(v);
    refresh(v);
  }

  function pick(name: string) {
    onChange(name);
    addRecentLocation(name);
    setRecentMatches([]);
    setGroups([]);
    setOpen(false);
  }

  function handleBlur() {
    setTimeout(() => {
      setOpen(false);
      if (value.trim()) addRecentLocation(value.trim());
    }, 120);
  }

  const topSet = new Set(topLocations);
  const filteredRecent = recentMatches.filter((r) => !topSet.has(r));
  const hasContent = topLocations.length > 0 || filteredRecent.length > 0 || groups.some((g) => g.items.length > 0);

  return (
    <div style={{ position: 'relative' }}>
      <input
        placeholder={t('ph.location_area')}
        value={value}
        onChange={handleChange}
        onFocus={() => refresh(value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setOpen(false);
            e.stopPropagation();
          }
        }}
        className="line-input"
        style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
        autoComplete="off"
      />
      {open && hasContent && (
        <div style={{ position: 'absolute', top: '100%', insetInlineEnd: 0, insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 300, maxHeight: 240, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)' }}>
          {topLocations.length > 0 && (
            <div>
              <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #888)', background: 'var(--bg-subtle, var(--bg))', borderBottom: '1px solid var(--border)', letterSpacing: 0.5 }}>
                {t('lbl.most_used_locations')}
              </div>
              {topLocations.map((name) => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(name); }}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)' }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {filteredRecent.length > 0 && (
            <div>
              <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #888)', background: 'var(--bg-subtle, var(--bg))', borderBottom: '1px solid var(--border)', letterSpacing: 0.5 }}>
                {t('lbl.recent_locations')}
              </div>
              {filteredRecent.map((name) => (
                <button
                  key={name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(name); }}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)' }}
                >
                  {name}
                </button>
              ))}
            </div>
          )}
          {groups.map((group) => (
            <div key={group.category}>
              <div style={{ padding: '4px 12px', fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #888)', background: 'var(--bg-subtle, var(--bg))', borderBottom: '1px solid var(--border)', letterSpacing: 0.5 }}>
                {group.label}
              </div>
              {group.items.map((loc) => (
                <button
                  key={loc.name}
                  type="button"
                  onMouseDown={(e) => { e.preventDefault(); pick(loc.name); }}
                  style={{ display: 'block', width: '100%', textAlign: 'start', padding: '8px 16px', background: 'none', border: 'none', borderBottom: '1px solid var(--border)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', color: 'var(--text)' }}
                >
                  {loc.name}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ===== محرّر البنود =====
export interface InvoiceLineItemsEditorProps {
  items: Item[];
  setItems: React.Dispatch<React.SetStateAction<Item[]>>;
  displayPrices: PriceOption[];
  prices: PriceOption[];
  effectivePartySource: string;
  partyId: string;
  filterAsphaltPlant: string | null;
}

export function InvoiceLineItemsEditor({
  items, setItems, displayPrices, prices, effectivePartySource, partyId, filterAsphaltPlant,
}: InvoiceLineItemsEditorProps) {
  const { t } = useT();
  const [pickerSearch, setPickerSearch] = useState('');
  const [openPickerIdx, setOpenPickerIdx] = useState<number | null>(null);

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

  function setItem(i: number, key: keyof Item | 'workType' | 'location', value: string | number) {
    if (key === 'workType' || key === 'location') {
      setItems((prev) => prev.map((it, idx) => {
        if (idx !== i) return it;
        const newWorkType = key === 'workType' ? String(value) : (it.workType ?? DEFAULT_WORK_TYPE);
        const newLocation = key === 'location' ? String(value) : (it.location ?? '');
        return { ...it, workType: newWorkType, location: newLocation, description: composeDescription(newWorkType, newLocation) };
      }));
      return;
    }
    if (key === 'unit') {
      const newUnit = String(value);
      setOpenPickerIdx(null);
      setPickerSearch('');
      if (newUnit === UNIT_OTHER) {
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
            const matches = displayPrices.filter((p) => p.contractUnit === newUnit);
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
    setPickerSearch('');
  }

  return (
    <>
      <label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px', borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        {[t('lbl.items'), t('ph.qty'), t('col.inv.unit'), t('agreements.usage.col.price'), t('col.inv.total')].map((h) => (
          <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
        ))}
        <div />
      </div>
      {effectivePartySource === 'SALES' && !partyId && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px', fontStyle: 'italic' }}>
          {t('msg.select_customer_first_prices')}
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 8px', fontStyle: 'italic' }}>
          {t('msg.no_price_agreements')}
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && displayPrices.length === 0 && prices.length > 0 && (
        <p style={{ fontSize: 12, color: '#b45309', margin: '4px 0 8px', fontStyle: 'italic' }}>
          {t('msg.no_matching_price_agreements')}
        </p>
      )}
      {effectivePartySource === 'SALES' && partyId && displayPrices.length > 0 && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '10px 14px', marginBottom: 10, fontSize: 13 }}>
          <div style={{ fontWeight: 800, color: '#1e40af', marginBottom: 6, fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('lbl.price_agreements')}
            {filterAsphaltPlant && (
              <span style={{ background: '#dbeafe', color: '#1e40af', borderRadius: 6, padding: '1px 8px', fontSize: 11, fontWeight: 600 }}>
                {t('lbl.filtered_by', { plant: filterAsphaltPlant })}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
            {displayPrices.map(p => (
              <span key={p.id} style={{ fontSize: 12, color: '#1e3a5f' }}>
                <strong>{p.contractUnit}</strong>: {money(p.unitPrice)}
                {p.asphaltPlant ? ` — ${p.asphaltPlant}` : ''}
                {p.contractLocation ? ` (${p.contractLocation})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}
      {items.map((it, i) => (
        <div key={it.uid} className="invoice-item-row" style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 8, alignItems: 'start', width: '100%' }}>
          <div className="invoice-cell description-cell" style={{ minWidth: 0, overflow: 'visible' }}>
            <select
              value={it.workType ?? DEFAULT_WORK_TYPE}
              onChange={(e) => setItem(i, 'workType', e.target.value)}
              title={t('field.work_type')}
              className="line-input"
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginBottom: 4 }}
            >
              {(WORK_TYPES as readonly string[]).map((wt) => <option key={wt} value={wt}>{wt}</option>)}
            </select>
            <LocationAutocomplete value={it.location ?? ''} onChange={(v) => setItem(i, 'location', v)} />
          </div>
          <div className="invoice-cell quantity-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <input type="number" min="0.001" step="0.001" placeholder={t('ph.qty')} value={it.quantity} onChange={(e) => setItem(i, 'quantity', e.target.value)} className="line-input" style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }} />
          </div>
          <div className="invoice-cell unit-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <select
              value={unitSelectValue(it.unit)}
              onChange={(e) => setItem(i, 'unit', e.target.value)}
              title={t('col.inv.unit')}
              className="line-input"
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box' }}
            >
              {(STANDARD_UNITS as readonly string[]).map((u) => <option key={u} value={u}>{u}</option>)}
              <option value={UNIT_OTHER}>{UNIT_OTHER}</option>
            </select>
            {unitSelectValue(it.unit) === UNIT_OTHER && (
              <input
                value={it.unit}
                onChange={(e) => setItem(i, 'unit', e.target.value)}
                placeholder={t('ph.enter_unit')}
                className="line-input"
                style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', marginTop: 4 }}
              />
            )}
          </div>
          <div className="invoice-cell price-cell" style={{ minWidth: 0, overflow: 'visible', position: 'relative' }}>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              <input type="number" min="0" step="0.001" placeholder={t('ph.unit_price')} value={it.unitPrice} onChange={(e) => setItem(i, 'unitPrice', e.target.value)} className="line-input" style={{ flex: 1, minWidth: 0, boxSizing: 'border-box' }} />
              {(() => {
                const unitPrices = displayPrices.filter((p) => p.contractUnit === it.unit);
                const searchTerm = pickerSearch.trim().toLowerCase();
                const filtered = searchTerm
                  ? unitPrices.filter((p) => [p.asphaltPlant, p.companyName, p.contractLocation].some((f) => f?.toLowerCase().includes(searchTerm)))
                  : unitPrices;
                return unitPrices.length > 0 ? (
                  <>
                    <button
                      type="button"
                      className="btn secondary sm"
                      style={{ flexShrink: 0, padding: '0 8px', fontSize: 14 }}
                      title={t('ph.prices.picker_btn')}
                      aria-label={t('ph.prices.picker_btn')}
                      aria-haspopup="listbox"
                      aria-expanded={openPickerIdx === i}
                      onClick={(e) => { e.stopPropagation(); setOpenPickerIdx(openPickerIdx === i ? null : i); setPickerSearch(''); }}
                    >
                      📋
                    </button>
                    {openPickerIdx === i && (
                      <div
                        onMouseDown={(e) => e.stopPropagation()}
                        style={{ position: 'absolute', top: '100%', insetInlineStart: 0, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, zIndex: 200, minWidth: 300, maxHeight: 320, overflowY: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,.18)', marginTop: 2 }}
                      >
                        <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
                          <input
                            autoFocus
                            placeholder={t('ph.search_plant_location_company')}
                            value={pickerSearch}
                            onChange={(e) => setPickerSearch(e.target.value)}
                            onMouseDown={(e) => e.stopPropagation()}
                            style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 6, fontFamily: 'inherit', background: 'var(--surface-2)', color: 'var(--text)' }}
                          />
                        </div>
                        <div role="listbox" aria-label={t('ph.prices.picker_list')}>
                          <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', fontWeight: 700, userSelect: 'none' }}>
                            {t('ph.prices.picker_unit')}: {it.unit}
                          </div>
                          {filtered.length === 0 ? (
                            <div style={{ padding: '12px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center' }}>
                              {t('msg.no_matching_price_agreements')}
                            </div>
                          ) : filtered.map((p) => (
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
                      </div>
                    )}
                  </>
                ) : null;
              })()}
            </div>
          </div>
          <div className="invoice-cell total-cell" style={{ minWidth: 0, overflow: 'hidden' }}>
            <div className="line-input" style={{ color: 'var(--text-muted)', display: 'flex', alignItems: 'center', background: 'var(--surface-2)', cursor: 'default', width: '100%', boxSizing: 'border-box' }}>{money(invoiceLineTotal(it))}</div>
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
      <button className="btn secondary sm" type="button" onClick={() => setItems((p) => [...p, { uid: crypto.randomUUID(), description: DEFAULT_WORK_TYPE, quantity: 1, unit: 'درب', unitPrice: 0, workType: DEFAULT_WORK_TYPE, location: '' }])}>{t('btn.inv.add_material')}</button>
    </>
  );
}
