import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePersistedState } from '../hooks/usePersistedState';
import { useTableSort } from '../hooks/useTableSort';
import { sortRowsClient } from '../lib/clientSort';
import SortableHeader from '../components/SortableHeader';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import { useToast } from '../stores/toastStore';
import { PageMeta } from '../components/DataTable';
import DateInput from '../components/DateInput';
import ConfirmModal from '../components/ConfirmModal';
import { money, dateText, MoneyText, MoneyCell } from '../config/modules';
import {
  ExecutiveHeader,
  HeroMetric,
  MetricCard,
  Tabs,
  StatusChip,
  SearchBox,
  FilterChip,
  EmptyState,
  ErrorBanner,
  SkeletonRows,
  Pagination,
  Drawer,
  DrawerSection,
  DrawerField,
  Dialog,
  DialogSection,
  Button,
} from '../components/explorer/ExplorerKit';
import '../components/explorer/explorer-kit.css';
import HistoricalDateNotice from '../components/period/HistoricalDateNotice';
import './Inventory.css';
import { fcMoneyHeader } from '../components/financial/financialLabels';

// ── Domain Types ──────────────────────────────────────────────────────────────

interface MaterialCategory { id: number; name: string; description?: string | null; isActive: boolean; _count?: { materials: number }; }
interface Material { id: number; code: string; name: string; unit: string; categoryId: number; category?: { name: string }; currentStock: number; minimumStock: number; unitCost: number; notes?: string | null; isActive: boolean; }
interface PurchaseOrder { id: number; number: string; supplierId: number; supplier?: { name: string }; date: string; expectedDate?: string | null; status: string; totalAmount: number; notes?: string | null; }
interface GoodsReceipt { id: number; number: string; supplierId: number; supplier?: { name: string }; purchaseOrderId?: number | null; purchaseOrder?: { number: string } | null; date: string; status: string; totalCost: number; notes?: string | null; }
interface MaterialIssueItem { id: number; materialId: number; quantity: number; unitCostSnapshot: number; totalCost: number; material?: { name: string; unit: string }; }
interface MaterialIssue { id: number; number: string; contractId?: number | null; contract?: { code: string } | null; date: string; status: string; totalCost: number; notes?: string | null; items?: MaterialIssueItem[]; }
interface Supplier { id: number; name: string; }
interface Contract { id: number; code: string; asphaltPlant: string; }
interface DetailItem { id: number; quantity: number; unitCost?: number; unitCostSnapshot?: number; totalCost: number; material?: { name: string; unit: string }; }
interface DetailRecord { notes?: string | null; items?: DetailItem[]; totalCost?: number; totalAmount?: number; }

type Tone = 'neutral' | 'green' | 'red' | 'orange' | 'blue' | 'indigo';
const UNITS = ['طن', 'كيلو', 'لتر', 'قطعة', 'متر', 'كيس', 'برميل', 'صندوق'] as const;

const poTone: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'inv.po.status.draft', tone: 'neutral', icon: 'edit_note' },
  SUBMITTED: { key: 'inv.po.status.submitted', tone: 'blue', icon: 'send' },
  RECEIVED: { key: 'inv.po.status.received', tone: 'green', icon: 'check_circle' },
  CANCELLED: { key: 'inv.po.status.cancelled', tone: 'red', icon: 'block' },
};
const grTone: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'inv.gr.status.draft', tone: 'neutral', icon: 'edit_note' },
  POSTED: { key: 'inv.gr.status.posted', tone: 'green', icon: 'check_circle' },
};
const miTone: Record<string, { key: string; tone: Tone; icon: string }> = {
  DRAFT: { key: 'inv.mi.status.draft', tone: 'neutral', icon: 'edit_note' },
  POSTED: { key: 'inv.mi.status.posted', tone: 'green', icon: 'check_circle' },
  CANCELLED: { key: 'inv.mi.status.cancelled', tone: 'red', icon: 'block' },
};
function chip(map: Record<string, { key: string; tone: Tone; icon: string }>, status: string, t: (k: string) => string) {
  const m = map[status] ?? { key: status, tone: 'neutral' as Tone, icon: 'help' };
  return <StatusChip tone={m.tone} icon={m.icon}>{t(m.key)}</StatusChip>;
}

type Tab = 'balance' | 'materials' | 'categories' | 'purchase-orders' | 'goods-receipts' | 'material-issues';
interface LineItem { materialId: string; quantity: number; unitCost: number; }

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Inventory() {
  const [tab, setTab] = usePersistedState<Tab>('invt:tab', 'balance');
  const { t } = useT();

  return (
    <div className="xpl-scope xpl-page">
      <ExecutiveHeader icon="inventory_2" title={t('page.inventory.title')} subtitle={t('page.inventory.subtitle')} />
      <Tabs<Tab>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'balance', label: t('tab.inventory.balance'), icon: 'inventory' },
          { key: 'materials', label: t('tab.inventory.materials'), icon: 'category' },
          { key: 'categories', label: t('tab.inventory.categories'), icon: 'label' },
          { key: 'purchase-orders', label: t('tab.inventory.purchase_orders'), icon: 'shopping_cart' },
          { key: 'goods-receipts', label: t('tab.inventory.goods_receipts'), icon: 'inventory_2' },
          { key: 'material-issues', label: t('tab.inventory.material_issues'), icon: 'output' },
        ]}
      />
      {tab === 'balance' && <BalanceTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'materials' && <MaterialsTab />}
      {tab === 'purchase-orders' && <PurchaseOrdersTab />}
      {tab === 'goods-receipts' && <GoodsReceiptsTab />}
      {tab === 'material-issues' && <MaterialIssuesTab />}
    </div>
  );
}

// ── Shared: detail items (read-only) inside a drawer ───────────────────────────

function DetailItemsSection({ endpoint, id }: { endpoint: string; id: number }) {
  const { t } = useT();
  const [detail, setDetail] = useState<DetailRecord | null>(null);
  useEffect(() => {
    api.get(`${endpoint}/${id}`).then((res) => setDetail(res.data.data as DetailRecord)).catch(() => {});
  }, [endpoint, id]);

  if (!detail) return <DrawerSection title={t('lbl.inv.items')}><SkeletonRows rows={3} withAvatar={false} /></DrawerSection>;
  return (
    <>
      {detail.notes && <DrawerSection title={t('field.notes')}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: 'var(--xpl-text)' }}>{detail.notes}</p></DrawerSection>}
      <DrawerSection title={t('lbl.inv.items')}>
        <table className="invx-detail-table">
          <thead>
            <tr>
              <th>{t('col.inv.material')}</th>
              <th>{t('col.qty')}</th>
              <th>{fcMoneyHeader(t('col.inv.unit_cost_per'))}</th>
              <th>{fcMoneyHeader(t('col.inv.total'))}</th>
            </tr>
          </thead>
          <tbody>
            {detail.items?.map((it) => (
              <tr key={it.id}>
                <td>{it.material?.name} <small style={{ color: 'var(--xpl-muted)' }}>({it.material?.unit})</small></td>
                <td>{it.quantity}</td>
                <td>{<MoneyCell value={it.unitCost ?? it.unitCostSnapshot ?? 0} />}</td>
                <td>{<MoneyCell value={it.totalCost} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="invx-detail-grand"><span>{t('lbl.inv.grand_total')}</span><span>{<MoneyText value={detail.totalCost ?? detail.totalAmount ?? 0} />}</span></div>
      </DrawerSection>
    </>
  );
}

// ── Shared: line-item builder ──────────────────────────────────────────────────

function LineItemBuilder({ items, onChange, materials, showCost }: { items: LineItem[]; onChange: (items: LineItem[]) => void; materials: Material[]; showCost: boolean; }) {
  const { t } = useT();
  function updateItem(i: number, patch: Partial<LineItem>) { onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it)); }
  const total = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  return (
    <div className="invx-lines">
      {items.map((it, i) => (
        <div key={i} className={`invx-line ${showCost ? 'invx-line--cost' : 'invx-line--nocost'}`}>
          <select className="xpl-select" value={it.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value })} aria-label={t('ph.inv.select_material')}>
            <option value="">{t('ph.inv.select_material')}</option>
            {materials.map((m) => <option key={m.id} value={String(m.id)}>{m.name} ({m.unit})</option>)}
          </select>
          <input className="xpl-input" type="number" min="0.001" step="0.001" placeholder={t('ph.inv.qty')} value={it.quantity} onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} aria-label={t('ph.inv.qty')} />
          {showCost && (
            <>
              <input className="xpl-input" type="number" min="0" step="0.001" placeholder={t('ph.inv.unit_cost')} value={it.unitCost} onChange={(e) => updateItem(i, { unitCost: Number(e.target.value) })} aria-label={t('ph.inv.unit_cost')} />
              <div className="invx-line-total">{<MoneyText value={it.quantity * it.unitCost} />}</div>
            </>
          )}
          {items.length > 1 && (
            <button className="invx-line-remove" type="button" onClick={() => onChange(items.filter((_, idx) => idx !== i))} aria-label={t('a11y.remove_item')}><span className="material-symbols-outlined">close</span></button>
          )}
        </div>
      ))}
      <div className="invx-line-foot">
        <Button variant="ghost" icon="add" small onClick={() => onChange([...items, { materialId: '', quantity: 1, unitCost: 0 }])}>{t('btn.inv.add_material')}</Button>
        {showCost && <span className="invx-line-grand">{t('lbl.inv.grand_total')} {<MoneyText value={total} />}</span>}
      </div>
    </div>
  );
}

// ── Reusable shells ────────────────────────────────────────────────────────────

function TableShell({ loading, empty, children }: { loading: boolean; empty: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="xpl-card" style={{ overflow: 'hidden' }}>
      {loading ? <div style={{ padding: 16 }}><SkeletonRows rows={6} /></div> : empty ? empty : children}
    </section>
  );
}

function clickRow(handler: () => void) {
  return {
    className: 'xpl-row--click',
    tabIndex: 0,
    role: 'button' as const,
    onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(); } },
  };
}
const Chevron = () => <td className="decx-col-chevron" style={{ width: 32, textAlign: 'center' }}><span className="material-symbols-outlined" aria-hidden="true" style={{ fontSize: 18, color: 'var(--xpl-muted)' }}>chevron_left</span></td>;

// ── رصيد المخزون ──────────────────────────────────────────────────────────────

function BalanceTab() {
  const { t } = useT();
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<Material | null>(null);
  // فرز محلي (Enterprise Data Grid Foundation) — الجدول محمّل بكامله فلا إعادة جلب.
  const sort = useTableSort('inventory-balance');

  useEffect(() => {
    Promise.all([
      api.get('/inventory/materials', { params: { pageSize: 500 } }),
      api.get('/inventory/categories', { params: { pageSize: 200 } }),
    ]).then(([mRes, cRes]) => {
      setMaterials(mRes.data.data.data ?? []);
      setCategories(cRes.data.data.data ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const totalValue = materials.reduce((s, m) => s + m.currentStock * m.unitCost, 0);
  const lowStock = materials.filter((m) => m.currentStock <= m.minimumStock);
  const activeCats = categories.filter((c) => c.isActive).length;

  // مستخرجات القيم المشتقة/المتداخلة — القيمة الإجمالية تطابق الخلية المحسوبة.
  const sortedMaterials = useMemo(
    () => sortRowsClient(materials, sort.sortBy, sort.sortDir, (r, key) => {
      if (key === 'category') return r.category?.name;
      if (key === 'totalValue') return r.currentStock * r.unitCost;
      return r[key as keyof Material];
    }),
    [materials, sort.sortBy, sort.sortDir],
  );

  return (
    <>
      <div className="invx-metrics">
        <HeroMetric icon="account_balance_wallet" label={t('stat.inv.stock_value')} value={<MoneyText value={totalValue} />} sub={<><span className="material-symbols-outlined">inventory</span>{`${materials.length} ${t('unit.material')}`}</>} />
        <div className="xpl-kpi-grid">
          <MetricCard icon="inventory" tone="indigo" label={t('stat.inv.total_materials')} value={materials.length} />
          <MetricCard icon="warning" tone={lowStock.length > 0 ? 'orange' : 'green'} label={t('stat.inv.low_stock')} value={lowStock.length} sub={lowStock.length > 0 ? t('stat.inv.needs_restock') : undefined} />
          <MetricCard icon="label" tone="blue" label={t('stat.inv.active_cats')} value={activeCats} />
        </div>
      </div>

      <TableShell loading={loading} empty={!loading && materials.length === 0 && <EmptyState icon="inventory" tone="neutral" title={t('empty.inv.materials_balance')} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.code')} title={t('col.code')} state={sort.getState('code')} onToggle={() => sort.toggle('code')} />
              <SortableHeader label={t('col.inv.material')} title={t('col.inv.material')} state={sort.getState('name')} onToggle={() => sort.toggle('name')} />
              <SortableHeader label={t('col.category')} title={t('col.category')} state={sort.getState('category')} onToggle={() => sort.toggle('category')} />
              <SortableHeader label={t('col.inv.current_stock')} title={t('col.inv.current_stock')} state={sort.getState('currentStock')} onToggle={() => sort.toggle('currentStock')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.unit_cost'))} title={t('col.inv.unit_cost')} state={sort.getState('unitCost')} onToggle={() => sort.toggle('unitCost')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.total_value'))} title={t('col.inv.total_value')} state={sort.getState('totalValue')} onToggle={() => sort.toggle('totalValue')} />
              {/* الحالة مشتقة من مقارنة الرصيد بالحد الأدنى — غير قابلة للفرز */}
              <th>{t('col.status')}</th>
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {sortedMaterials.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_name', { name: r.name })}>
                  <td><span className="invx-code">{r.code}</span></td>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.category?.name ?? '—'}</td>
                  <td><span className={`invx-stock${r.currentStock <= r.minimumStock ? ' invx-stock--low' : ''}`}>{r.currentStock}</span> {r.unit}</td>
                  <td>{<MoneyCell value={r.unitCost} />}</td>
                  <td>{<MoneyCell value={r.currentStock * r.unitCost} />}</td>
                  <td>{r.currentStock <= r.minimumStock ? <StatusChip tone="red" icon="warning">{t('pill.low_stock')}</StatusChip> : <StatusChip tone="green" icon="check_circle">{t('pill.adequate')}</StatusChip>}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && <MaterialDrawer material={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}

function MaterialDrawer({ material, onClose, footer }: { material: Material; onClose: () => void; footer?: React.ReactNode }) {
  const { t } = useT();
  return (
    <Drawer
      title={material.name}
      onClose={onClose}
      footer={footer}
      hero={
        <div className="xpl-drawer-hero">
          <div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">inventory</span></div>
          <div className="xpl-drawer-hero-body">
            <span className="xpl-drawer-hero-title">{material.name}</span>
            <span className="xpl-drawer-hero-sub">{material.code} · {material.category?.name ?? '—'}</span>
            <div style={{ marginTop: 4 }}>{material.currentStock <= material.minimumStock ? <StatusChip tone="red" icon="warning">{t('pill.low_stock')}</StatusChip> : <StatusChip tone="green" icon="check_circle">{t('pill.adequate')}</StatusChip>}</div>
          </div>
        </div>
      }
    >
      <DrawerSection title={t('sec.identity')}>
        <DrawerField label={t('col.code')} value={material.code} mono />
        <DrawerField label={t('col.inv.material')} value={material.name} />
        <DrawerField label={t('col.category')} value={material.category?.name ?? '—'} />
        <DrawerField label={t('col.inv.unit')} value={material.unit} />
      </DrawerSection>
      <DrawerSection title={t('sec.inv.stock_and_cost')}>
        <DrawerField label={t('col.inv.current_stock')} value={<span className={material.currentStock <= material.minimumStock ? 'invx-stock--low' : ''}>{material.currentStock} {material.unit}</span>} />
        <DrawerField label={t('col.inv.min_stock')} value={`${material.minimumStock} ${material.unit}`} />
        <DrawerField label={t('col.inv.unit_cost')} value={<MoneyText value={material.unitCost} />} />
        <DrawerField label={t('col.inv.total_value')} value={<MoneyText value={material.currentStock * material.unitCost} />} />
      </DrawerSection>
      {material.notes && <DrawerSection title={t('field.notes')}><p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{material.notes}</p></DrawerSection>}
    </Drawer>
  );
}

// ── التصنيفات ─────────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<MaterialCategory> | null>(null);
  const [viewing, setViewing] = useState<MaterialCategory | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);

  // فرز محلي (Enterprise Data Grid Foundation) — الجدول محمّل بكامله فلا إعادة جلب.
  const sort = useTableSort('inventory-categories');

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/inventory/categories', { params: { pageSize: 200 } }); setRows(res.data.data.data ?? []); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const sortedRows = useMemo(
    () => sortRowsClient(rows, sort.sortBy, sort.sortDir, (r, key) => {
      if (key === 'materials') return r._count?.materials ?? 0;
      return r[key as keyof MaterialCategory];
    }),
    [rows, sort.sortBy, sort.sortDir],
  );

  async function executeDeleteCategory(id: number) {
    setDeleteCategoryId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/inventory/categories/${id}`); toast.ok(t('msg.deleted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <span className="xpl-result-count">{rows.length} {t('unit.category')}</span>
          {hasPermission('inventory.create') && <Button variant="primary" icon="add" style={{ marginInlineStart: 'auto' }} onClick={() => setEditing({})}>{t('btn.inv.new_category')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="label" tone="neutral" title={t('empty.inv.categories')} action={hasPermission('inventory.create') ? <Button variant="primary" icon="add" onClick={() => setEditing({})}>{t('btn.inv.new_category')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.inv.cat_name')} title={t('col.inv.cat_name')} state={sort.getState('name')} onToggle={() => sort.toggle('name')} />
              <SortableHeader label={t('col.description')} title={t('col.description')} state={sort.getState('description')} onToggle={() => sort.toggle('description')} />
              <SortableHeader label={t('col.inv.mat_count')} title={t('col.inv.mat_count')} state={sort.getState('materials')} onToggle={() => sort.toggle('materials')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('isActive')} onToggle={() => sort.toggle('isActive')} />
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {sortedRows.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_name', { name: r.name })}>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.description ?? '—'}</td>
                  <td>{r._count?.materials ?? 0}</td>
                  <td>{r.isActive ? <StatusChip tone="green">{t('pill.active')}</StatusChip> : <StatusChip tone="neutral">{t('pill.inactive')}</StatusChip>}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </TableShell>

      {viewing && (
        <Drawer
          title={viewing.name}
          onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">label</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{viewing.name}</span><span className="xpl-drawer-hero-sub">{viewing._count?.materials ?? 0} {t('unit.material')}</span><div style={{ marginTop: 4 }}>{viewing.isActive ? <StatusChip tone="green">{t('pill.active')}</StatusChip> : <StatusChip tone="neutral">{t('pill.inactive')}</StatusChip>}</div></div></div>}
          footer={<>
            {hasPermission('inventory.update') && <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
            {hasPermission('inventory.delete') && <Button variant="danger" icon="delete" busy={busy} onClick={() => setDeleteCategoryId(viewing.id)}>{t('action.delete')}</Button>}
          </>}
        >
          <DrawerSection title={t('sec.inv.category_info')}>
            <DrawerField label={t('col.inv.cat_name')} value={viewing.name} />
            <DrawerField label={t('col.description')} value={viewing.description ?? '—'} />
            <DrawerField label={t('col.inv.mat_count')} value={viewing._count?.materials ?? 0} />
          </DrawerSection>
        </Drawer>
      )}

      {editing !== null && <CategoryForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('msg.saved_success')); setEditing(null); load(); }} />}
      {deleteCategoryId !== null && <ConfirmModal message={t('confirm.delete_category')} onConfirm={() => executeDeleteCategory(deleteCategoryId)} onCancel={() => setDeleteCategoryId(null)} />}
    </>
  );
}

// ── المواد ────────────────────────────────────────────────────────────────────

function MaterialsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Material[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('invt:mat:page', 1);
  const [search, setSearch] = usePersistedState('invt:mat:search', '');
  const [editing, setEditing] = useState<Partial<Material> | null>(null);
  const [viewing, setViewing] = useState<Material | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleteMaterialId, setDeleteMaterialId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('inventory-materials', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/inventory/materials', { params: { page, pageSize: 15, search: search || undefined, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } }); setRows(res.data.data.data ?? []); setMeta(res.data.data.meta ?? null); } finally { setLoading(false); }
  }, [page, search, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  async function executeDeleteMaterial(id: number) {
    setDeleteMaterialId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/inventory/materials/${id}`); toast.ok(t('msg.deleted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <SearchBox value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder={t('ph.search_material')} ariaLabel={t('ph.search_material')} />
          <Button variant="ghost" icon="refresh" busy={loading} onClick={load}>{t('action.refresh')}</Button>
          {hasPermission('inventory.create') && <Button variant="primary" icon="add" onClick={() => setEditing({})}>{t('btn.inv.new_material')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="category" tone="neutral" title={t('empty.inv.materials')} action={hasPermission('inventory.create') ? <Button variant="primary" icon="add" onClick={() => setEditing({})}>{t('btn.inv.new_material')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.code')} title={t('col.code')} state={sort.getState('code')} onToggle={() => sort.toggle('code')} />
              <SortableHeader label={t('col.inv.material')} title={t('col.inv.material')} state={sort.getState('name')} onToggle={() => sort.toggle('name')} />
              <SortableHeader label={t('col.category')} title={t('col.category')} state={sort.getState('category')} onToggle={() => sort.toggle('category')} />
              <SortableHeader label={t('col.inv.unit')} title={t('col.inv.unit')} state={sort.getState('unit')} onToggle={() => sort.toggle('unit')} />
              <SortableHeader label={t('col.inv.current_stock')} title={t('col.inv.current_stock')} state={sort.getState('currentStock')} onToggle={() => sort.toggle('currentStock')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.unit_cost'))} title={t('col.inv.unit_cost')} state={sort.getState('unitCost')} onToggle={() => sort.toggle('unitCost')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('isActive')} onToggle={() => sort.toggle('isActive')} />
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_name', { name: r.name })}>
                  <td><span className="invx-code">{r.code}</span></td>
                  <td><strong>{r.name}</strong></td>
                  <td>{r.category?.name ?? '—'}</td>
                  <td>{r.unit}</td>
                  <td><span className={`invx-stock${r.currentStock <= r.minimumStock ? ' invx-stock--low' : ''}`}>{r.currentStock}</span></td>
                  <td>{<MoneyCell value={r.unitCost} />}</td>
                  <td>{r.isActive ? <StatusChip tone="green">{t('pill.active')}</StatusChip> : <StatusChip tone="neutral">{t('pill.inactive')}</StatusChip>}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPage={setPage} />
      </TableShell>

      {viewing && (
        <MaterialDrawer material={viewing} onClose={() => setViewing(null)} footer={<>
          {hasPermission('inventory.update') && <Button variant="primary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
          {hasPermission('inventory.delete') && <Button variant="danger" icon="delete" busy={busy} onClick={() => setDeleteMaterialId(viewing.id)}>{t('action.delete')}</Button>}
        </>} />
      )}
      {editing !== null && <MaterialForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('msg.saved_success')); setEditing(null); load(); }} />}
      {deleteMaterialId !== null && <ConfirmModal message={t('confirm.delete_material')} onConfirm={() => executeDeleteMaterial(deleteMaterialId)} onCancel={() => setDeleteMaterialId(null)} />}
    </>
  );
}

// ── أوامر الشراء ──────────────────────────────────────────────────────────────

function PurchaseOrdersTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('invt:po:page', 1);
  const [statusFilter, setStatusFilter] = usePersistedState('invt:po:filter', '');
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<PurchaseOrder | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingPost, setPendingPost] = useState<{ endpoint: string; confirmMsg: string; successMsg: string } | null>(null);
  const [deletePOId, setDeletePOId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('inventory-po', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/inventory/purchase-orders', { params: { page, pageSize: 15, status: statusFilter || undefined, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } }); setRows(res.data.data.data ?? []); setMeta(res.data.data.meta ?? null); } finally { setLoading(false); }
  }, [page, statusFilter, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  async function executePost(endpoint: string, successMsg: string) {
    setPendingPost(null);
    if (busy) return; setBusy(true);
    try { await api.post(endpoint); toast.ok(successMsg); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function executeDeletePO(id: number) {
    setDeletePOId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/inventory/purchase-orders/${id}`); toast.ok(t('msg.deleted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  const STATUS_CHIPS = [['', t('opt.all_statuses')], ['DRAFT', t('inv.po.status.draft')], ['SUBMITTED', t('inv.po.status.submitted')], ['RECEIVED', t('inv.po.status.received')], ['CANCELLED', t('inv.po.status.cancelled')]];

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={statusFilter === v} onClick={() => { setStatusFilter(v); setPage(1); }}>{l}</FilterChip>)}
          {hasPermission('inventory.create') && <Button variant="primary" icon="add" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(true)}>{t('btn.inv.new_po')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="shopping_cart" tone="neutral" title={t('empty.inv.po')} action={hasPermission('inventory.create') ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('btn.inv.new_po')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.number')} title={t('col.number')} state={sort.getState('number')} onToggle={() => sort.toggle('number')} />
              <SortableHeader label={t('col.supplier')} title={t('col.supplier')} state={sort.getState('supplier')} onToggle={() => sort.toggle('supplier')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <SortableHeader label={t('col.inv.expected_date')} title={t('col.inv.expected_date')} state={sort.getState('expectedDate')} onToggle={() => sort.toggle('expectedDate')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.total'))} title={t('col.inv.total')} state={sort.getState('totalAmount')} onToggle={() => sort.toggle('totalAmount')} />
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_number', { number: r.number })}>
                  <td><span className="invx-code">{r.number}</span></td>
                  <td>{r.supplier?.name ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.expectedDate)}</td>
                  <td>{chip(poTone, r.status, t)}</td>
                  <td style={{ fontWeight: 700 }}>{<MoneyCell value={r.totalAmount} />}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPage={setPage} />
      </TableShell>

      {viewing && (
        <Drawer
          title={`${t('modal.inv.detail_po')} — ${viewing.number}`}
          onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">shopping_cart</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{<MoneyText value={viewing.totalAmount} />}</span><span className="xpl-drawer-hero-sub">{viewing.number} · {viewing.supplier?.name ?? '—'}</span><div style={{ marginTop: 4 }}>{chip(poTone, viewing.status, t)}</div></div></div>}
          footer={<>
            {hasPermission('inventory.update') && viewing.status === 'DRAFT' && <Button variant="primary" icon="send" busy={busy} onClick={() => setPendingPost({ endpoint: `/inventory/purchase-orders/${viewing.id}/submit`, confirmMsg: t('confirm.submit_po'), successMsg: t('msg.posted_success') })}>{t('btn.inv.submit_po')}</Button>}
            {hasPermission('inventory.update') && ['DRAFT', 'SUBMITTED'].includes(viewing.status) && <Button variant="secondary" icon="block" busy={busy} onClick={() => setPendingPost({ endpoint: `/inventory/purchase-orders/${viewing.id}/cancel`, confirmMsg: t('confirm.cancel_po'), successMsg: t('msg.cancelled_success') })}>{t('action.cancel')}</Button>}
            {hasPermission('inventory.delete') && viewing.status === 'DRAFT' && <Button variant="danger" icon="delete" busy={busy} onClick={() => setDeletePOId(viewing.id)}>{t('action.delete')}</Button>}
          </>}
        >
          <DrawerSection title={t('sec.info')}>
            <DrawerField label={t('col.supplier')} value={viewing.supplier?.name ?? '—'} />
            <DrawerField label={t('col.date')} value={dateText(viewing.date)} />
            <DrawerField label={t('col.inv.expected_date')} value={dateText(viewing.expectedDate)} />
          </DrawerSection>
          <DetailItemsSection endpoint="/inventory/purchase-orders" id={viewing.id} />
        </Drawer>
      )}
      {creating && <PurchaseOrderForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('msg.saved_success')); setCreating(false); load(); }} />}
      {pendingPost !== null && <ConfirmModal message={pendingPost.confirmMsg} onConfirm={() => executePost(pendingPost!.endpoint, pendingPost!.successMsg)} onCancel={() => setPendingPost(null)} />}
      {deletePOId !== null && <ConfirmModal message={t('confirm.delete_po')} onConfirm={() => executeDeletePO(deletePOId)} onCancel={() => setDeletePOId(null)} />}
    </>
  );
}

// ── سندات الاستلام ────────────────────────────────────────────────────────────

function GoodsReceiptsTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('invt:gr:page', 1);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<GoodsReceipt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postGRId, setPostGRId] = useState<number | null>(null);
  const [deleteGRId, setDeleteGRId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('inventory-gr', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/inventory/goods-receipts', { params: { page, pageSize: 15, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } }); setRows(res.data.data.data ?? []); setMeta(res.data.data.meta ?? null); } finally { setLoading(false); }
  }, [page, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  async function executePostGR(id: number) {
    setPostGRId(null);
    if (busy) return; setBusy(true);
    try { await api.post(`/inventory/goods-receipts/${id}/post`); toast.ok(t('msg.posted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function executeDeleteGR(id: number) {
    setDeleteGRId(null);
    if (busy) return; setBusy(true);
    try { await api.delete(`/inventory/goods-receipts/${id}`); toast.ok(t('msg.deleted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          <span className="xpl-result-count">{meta?.total ?? rows.length} {t('unit.voucher')}</span>
          {hasPermission('inventory.create') && <Button variant="primary" icon="add" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(true)}>{t('btn.inv.new_gr')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="inventory_2" tone="neutral" title={t('empty.inv.gr')} action={hasPermission('inventory.create') ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('btn.inv.new_gr')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.number')} title={t('col.number')} state={sort.getState('number')} onToggle={() => sort.toggle('number')} />
              <SortableHeader label={t('col.supplier')} title={t('col.supplier')} state={sort.getState('supplier')} onToggle={() => sort.toggle('supplier')} />
              <SortableHeader label={t('col.inv.po_ref')} title={t('col.inv.po_ref')} state={sort.getState('purchaseOrder')} onToggle={() => sort.toggle('purchaseOrder')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.total'))} title={t('col.inv.total')} state={sort.getState('totalCost')} onToggle={() => sort.toggle('totalCost')} />
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_number', { number: r.number })}>
                  <td><span className="invx-code">{r.number}</span></td>
                  <td>{r.supplier?.name ?? '—'}</td>
                  <td>{r.purchaseOrder?.number ?? '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <td>{chip(grTone, r.status, t)}</td>
                  <td style={{ fontWeight: 700 }}>{<MoneyCell value={r.totalCost} />}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPage={setPage} />
      </TableShell>

      {viewing && (
        <Drawer
          title={`${t('modal.inv.detail_gr')} — ${viewing.number}`}
          onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">inventory_2</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{<MoneyText value={viewing.totalCost} />}</span><span className="xpl-drawer-hero-sub">{viewing.number} · {viewing.supplier?.name ?? '—'}</span><div style={{ marginTop: 4 }}>{chip(grTone, viewing.status, t)}</div></div></div>}
          footer={<>
            {hasPermission('inventory.approve') && viewing.status === 'DRAFT' && <Button variant="primary" icon="check_circle" busy={busy} onClick={() => setPostGRId(viewing.id)}>{t('btn.inv.post')}</Button>}
            {hasPermission('inventory.delete') && viewing.status === 'DRAFT' && <Button variant="danger" icon="delete" busy={busy} onClick={() => setDeleteGRId(viewing.id)}>{t('action.delete')}</Button>}
          </>}
        >
          <DrawerSection title={t('sec.info')}>
            <DrawerField label={t('col.supplier')} value={viewing.supplier?.name ?? '—'} />
            <DrawerField label={t('col.inv.po_ref')} value={viewing.purchaseOrder?.number ?? '—'} />
            <DrawerField label={t('col.date')} value={dateText(viewing.date)} />
          </DrawerSection>
          <DetailItemsSection endpoint="/inventory/goods-receipts" id={viewing.id} />
        </Drawer>
      )}
      {creating && <GoodsReceiptForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('msg.saved_success')); setCreating(false); load(); }} />}
      {postGRId !== null && <ConfirmModal message={t('confirm.post_gr')} onConfirm={() => executePostGR(postGRId)} onCancel={() => setPostGRId(null)} />}
      {deleteGRId !== null && <ConfirmModal message={t('confirm.delete_gr')} onConfirm={() => executeDeleteGR(deleteGRId)} onCancel={() => setDeleteGRId(null)} />}
    </>
  );
}

// ── سندات الصرف ───────────────────────────────────────────────────────────────

function MaterialIssuesTab() {
  const { t } = useT();
  const { hasPermission } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<MaterialIssue[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = usePersistedState('invt:mi:page', 1);
  const [statusFilter, setStatusFilter] = usePersistedState('invt:mi:filter', '');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Partial<MaterialIssue> | null>(null);
  const [viewing, setViewing] = useState<MaterialIssue | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [postMIId, setPostMIId] = useState<number | null>(null);
  const [cancelMIId, setCancelMIId] = useState<number | null>(null);
  const [deleteMIId, setDeleteMIId] = useState<number | null>(null);
  // فرز خادمي — تغيير الفرز استعلام جديد فيعود للصفحة الأولى.
  const sort = useTableSort('inventory-mi', () => setPage(1));

  const load = useCallback(async () => {
    setLoading(true);
    try { const res = await api.get('/inventory/material-issues', { params: { page, pageSize: 15, status: statusFilter || undefined, ...(sort.sortBy ? { sortBy: sort.sortBy, sortDir: sort.sortDir } : {}) } }); setRows(res.data.data.data ?? []); setMeta(res.data.data.meta ?? null); } finally { setLoading(false); }
  }, [page, statusFilter, sort.sortBy, sort.sortDir]);
  useEffect(() => { load(); }, [load]);

  async function executePostMI(id: number) { setPostMIId(null); if (busy) return; setBusy(true); try { await api.post(`/inventory/material-issues/${id}/post`); toast.ok(t('msg.posted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function executeCancelMI(id: number) { setCancelMIId(null); if (busy) return; setBusy(true); try { await api.post(`/inventory/material-issues/${id}/cancel`); toast.ok(t('msg.cancelled_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  async function executeDeleteMI(id: number) { setDeleteMIId(null); if (busy) return; setBusy(true); try { await api.delete(`/inventory/material-issues/${id}`); toast.ok(t('msg.deleted_success')); setViewing(null); load(); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }

  const STATUS_CHIPS = [['', t('opt.all_statuses')], ['DRAFT', t('inv.mi.status.draft')], ['POSTED', t('inv.mi.status.posted')], ['CANCELLED', t('inv.mi.status.cancelled')]];

  return (
    <>
      <div className="xpl-toolbar xpl-toolbar--sticky">
        <div className="xpl-toolbar-row">
          {STATUS_CHIPS.map(([v, l]) => <FilterChip key={v} active={statusFilter === v} onClick={() => { setStatusFilter(v); setPage(1); }}>{l}</FilterChip>)}
          {hasPermission('inventory.create') && <Button variant="primary" icon="add" style={{ marginInlineStart: 'auto' }} onClick={() => setCreating(true)}>{t('btn.inv.new_mi')}</Button>}
        </div>
      </div>
      {error && <ErrorBanner>{error}</ErrorBanner>}

      <TableShell loading={loading} empty={!loading && rows.length === 0 && <EmptyState icon="output" tone="neutral" title={t('empty.inv.mi')} action={hasPermission('inventory.create') ? <Button variant="primary" icon="add" onClick={() => setCreating(true)}>{t('btn.inv.new_mi')}</Button> : undefined} />}>
        <div className="xpl-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="xpl-table">
            <thead><tr>
              <SortableHeader label={t('col.number')} title={t('col.number')} state={sort.getState('number')} onToggle={() => sort.toggle('number')} />
              <SortableHeader label={t('col.contract_no')} title={t('col.contract_no')} state={sort.getState('contract')} onToggle={() => sort.toggle('contract')} />
              <SortableHeader label={t('col.date')} title={t('col.date')} state={sort.getState('date')} onToggle={() => sort.toggle('date')} />
              <SortableHeader label={t('col.status')} title={t('col.status')} state={sort.getState('status')} onToggle={() => sort.toggle('status')} />
              <SortableHeader label={fcMoneyHeader(t('col.inv.total'))} title={t('col.inv.total')} state={sort.getState('totalCost')} onToggle={() => sort.toggle('totalCost')} />
              <th aria-label={t('a11y.open_row')} />
            </tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} {...clickRow(() => setViewing(r))} aria-label={t('a11y.details_of_number', { number: r.number })}>
                  <td><span className="invx-code">{r.number}</span></td>
                  <td>{r.contract ? r.contract.code : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: 'var(--xpl-muted)' }}>{dateText(r.date)}</td>
                  <td>{chip(miTone, r.status, t)}</td>
                  <td style={{ fontWeight: 700 }}>{<MoneyCell value={r.totalCost} />}</td>
                  <Chevron />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination meta={meta} onPage={setPage} />
      </TableShell>

      {viewing && (
        <Drawer
          title={`${t('modal.inv.detail_mi')} — ${viewing.number}`}
          onClose={() => setViewing(null)}
          hero={<div className="xpl-drawer-hero"><div className="xpl-drawer-hero-icon"><span className="material-symbols-outlined" aria-hidden="true">output</span></div><div className="xpl-drawer-hero-body"><span className="xpl-drawer-hero-title">{<MoneyText value={viewing.totalCost} />}</span><span className="xpl-drawer-hero-sub">{viewing.number}{viewing.contract ? ` · ${viewing.contract.code}` : ''}</span><div style={{ marginTop: 4 }}>{chip(miTone, viewing.status, t)}</div></div></div>}
          footer={<>
            {hasPermission('inventory.approve') && viewing.status === 'DRAFT' && <Button variant="primary" icon="check_circle" busy={busy} onClick={() => setPostMIId(viewing.id)}>{t('btn.inv.post')}</Button>}
            {hasPermission('inventory.cancel') && viewing.status === 'POSTED' && <Button variant="secondary" icon="block" busy={busy} onClick={() => setCancelMIId(viewing.id)}>{t('action.cancel')}</Button>}
            {hasPermission('inventory.update') && viewing.status === 'DRAFT' && <Button variant="secondary" icon="edit" onClick={() => { setEditing(viewing); setViewing(null); }}>{t('action.edit')}</Button>}
            {hasPermission('inventory.delete') && viewing.status === 'DRAFT' && <Button variant="danger" icon="delete" busy={busy} onClick={() => setDeleteMIId(viewing.id)}>{t('action.delete')}</Button>}
          </>}
        >
          <DrawerSection title={t('sec.info')}>
            <DrawerField label={t('col.contract_no')} value={viewing.contract ? viewing.contract.code : '—'} />
            <DrawerField label={t('col.date')} value={dateText(viewing.date)} />
          </DrawerSection>
          <DetailItemsSection endpoint="/inventory/material-issues" id={viewing.id} />
        </Drawer>
      )}
      {creating && <MaterialIssueForm onClose={() => setCreating(false)} onSaved={() => { toast.ok(t('msg.saved_success')); setCreating(false); load(); }} />}
      {editing !== null && <MaterialIssueForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { toast.ok(t('msg.saved_success')); setEditing(null); load(); }} />}
      {postMIId !== null && <ConfirmModal message={t('confirm.post_mi')} onConfirm={() => executePostMI(postMIId)} onCancel={() => setPostMIId(null)} />}
      {cancelMIId !== null && <ConfirmModal message={t('confirm.cancel_mi')} variant="warning" onConfirm={() => executeCancelMI(cancelMIId)} onCancel={() => setCancelMIId(null)} />}
      {deleteMIId !== null && <ConfirmModal message={t('confirm.delete_mi')} onConfirm={() => executeDeleteMI(deleteMIId)} onCancel={() => setDeleteMIId(null)} />}
    </>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function CategoryForm({ initial, onClose, onSaved }: { initial: Partial<MaterialCategory>; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isNew = !initial?.id;
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!name.trim()) { setError(t('error.cat_name_required')); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description || null, isActive };
      if (isNew) await api.post('/inventory/categories', body);
      else await api.put(`/inventory/categories/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <Dialog icon="label" title={isNew ? t('modal.inv.new_category') : t('modal.inv.edit_category')} size="md" onClose={onClose}
      footer={<><Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button><Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button></>}>
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('sec.inv.category_info')} icon="label">
        <div className="xpl-field xpl-field--full"><label>{t('field.inv.cat_name')} <span className="req">*</span></label><input className="xpl-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-label={t('field.inv.cat_name')} /></div>
        <div className="xpl-field xpl-field--full"><label>{t('col.description')}</label><input className="xpl-input" value={description} onChange={(e) => setDescription(e.target.value)} aria-label={t('col.description')} /></div>
        <div className="xpl-field xpl-field--full"><label className="invx-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />{t('field.inv.active_check')}</label></div>
      </DialogSection>
    </Dialog>
  );
}

function MaterialForm({ initial, onClose, onSaved }: { initial: Partial<Material>; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isNew = !initial?.id;
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [code, setCode] = useState<string>(initial?.code ?? '');
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [categoryId, setCategoryId] = useState<string>(String(initial?.categoryId ?? ''));
  const [unit, setUnit] = useState<string>(initial?.unit ?? UNITS[0]);
  const [unitCost, setUnitCost] = useState<string>(String(initial?.unitCost ?? '0'));
  const [minimumStock, setMinimumStock] = useState<string>(String(initial?.minimumStock ?? '0'));
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api.get('/inventory/categories', { params: { pageSize: 200 } }).then((res) => setCategories(res.data.data.data ?? [])).catch(() => {}); }, []);

  async function submit() {
    setError('');
    if (isNew && !code.trim()) { setError(t('error.mat_code_required')); return; }
    if (!name.trim()) { setError(t('error.mat_name_required')); return; }
    if (!categoryId) { setError(t('error.category_required')); return; }
    setSaving(true);
    try {
      const body = { ...(isNew ? { code: code.trim() } : {}), name: name.trim(), categoryId: Number(categoryId), unit, unitCost: Number(unitCost), minimumStock: Number(minimumStock), notes: notes || null, isActive };
      if (isNew) await api.post('/inventory/materials', body);
      else await api.put(`/inventory/materials/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <Dialog icon="category" title={isNew ? t('modal.inv.new_material') : t('modal.inv.edit_material')} subtitle={!isNew ? initial.code : undefined} size="lg" onClose={onClose}
      footer={<><Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button><Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button></>}>
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('sec.identity')} icon="badge">
        {isNew && <div className="xpl-field"><label>{t('field.inv.mat_code')} <span className="req">*</span></label><input className="xpl-input" value={code} onChange={(e) => setCode(e.target.value)} autoFocus aria-label={t('field.inv.mat_code')} /></div>}
        <div className="xpl-field"><label>{t('field.inv.mat_name')} <span className="req">*</span></label><input className="xpl-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus={!isNew} aria-label={t('field.inv.mat_name')} /></div>
        <div className="xpl-field"><label>{t('col.category')} <span className="req">*</span></label><select className="xpl-select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label={t('col.category')}><option value="">{t('msg.select_placeholder')}</option>{categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}</select></div>
        <div className="xpl-field"><label>{t('field.inv.mat_unit')}</label><select className="xpl-select" value={unit} onChange={(e) => setUnit(e.target.value)} aria-label={t('field.inv.mat_unit')}>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></div>
      </DialogSection>
      <DialogSection title={t('sec.inv.stock')} icon="inventory">
        <div className="xpl-field"><label>{t('field.inv.min_stock')}</label><input className="xpl-input" type="number" min="0" step="0.001" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} style={{ direction: 'ltr' }} aria-label={t('field.inv.min_stock')} /></div>
      </DialogSection>
      <DialogSection title={t('sec.inv.cost')} icon="payments">
        <div className="xpl-field"><label>{t('field.inv.unit_cost_kd')}</label><input className="xpl-input" type="number" min="0" step="0.001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} style={{ direction: 'ltr' }} aria-label={t('field.inv.unit_cost_kd')} /></div>
      </DialogSection>
      <DialogSection title={t('field.notes')} icon="sticky_note_2">
        <div className="xpl-field xpl-field--full"><label>{t('field.notes')}</label><input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('field.notes')} /></div>
        <div className="xpl-field xpl-field--full"><label className="invx-check"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />{t('field.inv.active_check')}</label></div>
      </DialogSection>
    </Dialog>
  );
}

function PurchaseOrderForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/suppliers', { params: { pageSize: 200 } }), api.get('/inventory/materials', { params: { pageSize: 500 } })])
      .then(([sRes, mRes]) => { setSuppliers(sRes.data.data.data ?? []); setMaterials(mRes.data.data.data ?? []); }).catch(() => {});
  }, []);

  async function submit() {
    setError('');
    if (!supplierId) { setError(t('error.supplier_required')); return; }
    if (items.some((it) => !it.materialId)) { setError(t('error.select_material')); return; }
    if (items.some((it) => it.quantity <= 0)) { setError(t('error.qty_positive')); return; }
    setSaving(true);
    try {
      await api.post('/inventory/purchase-orders', { supplierId: Number(supplierId), date: date || undefined, expectedDate: expectedDate || undefined, notes: notes || null, items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity, unitCost: it.unitCost })) });
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <Dialog icon="shopping_cart" title={t('modal.inv.new_po')} size="xl" onClose={onClose}
      footer={<><Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button><Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button></>}>
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('sec.inv.supplier_dates')} icon="local_shipping">
        <div className="xpl-field"><label>{t('col.supplier')} <span className="req">*</span></label><select className="xpl-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t('col.supplier')}><option value="">{t('msg.select_placeholder')}</option>{suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</select></div>
        <div className="xpl-field"><label>{t('field.inv.po_date')}</label><DateInput className="xpl-input" value={date} onChange={setDate} autoFocus ariaLabel={t('field.inv.po_date')} /></div>
        <div className="xpl-field"><label>{t('field.inv.expected_date')}</label><DateInput className="xpl-input" value={expectedDate} onChange={setExpectedDate} ariaLabel={t('field.inv.expected_date')} /></div>
        <div className="xpl-field xpl-field--full"><label>{t('field.notes')}</label><input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('field.notes')} /></div>
      </DialogSection>
      <section className="xpl-dialog-section"><div className="xpl-dialog-section-title"><span className="material-symbols-outlined">list_alt</span>{t('lbl.inv.items')}</div><LineItemBuilder items={items} onChange={setItems} materials={materials} showCost /></section>
    </Dialog>
  );
}

function GoodsReceiptForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [date, setDate] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/suppliers', { params: { pageSize: 200 } }), api.get('/inventory/purchase-orders', { params: { pageSize: 200, status: 'SUBMITTED' } }), api.get('/inventory/materials', { params: { pageSize: 500 } })])
      .then(([sRes, poRes, mRes]) => { setSuppliers(sRes.data.data.data ?? []); setPurchaseOrders(poRes.data.data.data ?? []); setMaterials(mRes.data.data.data ?? []); }).catch(() => {});
  }, []);

  async function submit() {
    setError('');
    if (!supplierId) { setError(t('error.supplier_required')); return; }
    if (items.some((it) => !it.materialId)) { setError(t('error.select_material')); return; }
    if (items.some((it) => it.quantity <= 0)) { setError(t('error.qty_positive')); return; }
    setSaving(true);
    try {
      await api.post('/inventory/goods-receipts', { supplierId: Number(supplierId), purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined, date: date || undefined, notes: notes || null, items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity, unitCost: it.unitCost })) });
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <Dialog icon="inventory_2" title={t('modal.inv.new_gr')} size="xl" onClose={onClose}
      footer={<><Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button><Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button></>}>
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('sec.inv.source_dates')} icon="local_shipping">
        <div className="xpl-field"><label>{t('col.supplier')} <span className="req">*</span></label><select className="xpl-select" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label={t('col.supplier')}><option value="">{t('msg.select_placeholder')}</option>{suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}</select></div>
        <div className="xpl-field"><label>{t('field.inv.po_optional')}</label><select className="xpl-select" value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)} aria-label={t('field.inv.po_optional')}><option value="">— {t('opt.no_po')} —</option>{purchaseOrders.map((po) => <option key={po.id} value={String(po.id)}>{po.number}</option>)}</select></div>
        <div className="xpl-field"><label>{t('col.date')}</label><DateInput className="xpl-input" value={date} onChange={setDate} autoFocus ariaLabel={t('col.date')} /><HistoricalDateNotice date={date} /></div>
        <div className="xpl-field xpl-field--full"><label>{t('field.notes')}</label><input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('field.notes')} /></div>
      </DialogSection>
      <section className="xpl-dialog-section"><div className="xpl-dialog-section-title"><span className="material-symbols-outlined">list_alt</span>{t('lbl.inv.items')}</div><LineItemBuilder items={items} onChange={setItems} materials={materials} showCost /></section>
    </Dialog>
  );
}

function MaterialIssueForm({ initial, onClose, onSaved }: { initial?: Partial<MaterialIssue>; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isNew = !initial?.id;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [contractId, setContractId] = useState<string>(String(initial?.contractId ?? ''));
  const [date, setDate] = useState<string>(initial?.date ? String(initial.date).slice(0, 10) : '');
  const [notes, setNotes] = useState<string>(initial?.notes ?? '');
  const [items, setItems] = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/contracts', { params: { pageSize: 200, status: 'ACTIVE' } }), api.get('/inventory/materials', { params: { pageSize: 500 } })])
      .then(([cRes, mRes]) => { setContracts(cRes.data.data.data ?? []); setMaterials(mRes.data.data.data ?? []); }).catch(() => {});
    if (!isNew && initial?.id) {
      api.get(`/inventory/material-issues/${initial.id}`).then((res) => {
        const detail = res.data.data as MaterialIssue;
        if (detail.items?.length) setItems(detail.items.map((it) => ({ materialId: String(it.materialId), quantity: it.quantity, unitCost: 0 })));
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError('');
    if (items.some((it) => !it.materialId)) { setError(t('error.select_material')); return; }
    if (items.some((it) => it.quantity <= 0)) { setError(t('error.qty_positive')); return; }
    setSaving(true);
    try {
      const body = { contractId: contractId ? Number(contractId) : undefined, date: date || undefined, notes: notes || null, items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity })) };
      if (isNew) await api.post('/inventory/material-issues', body);
      else await api.put(`/inventory/material-issues/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); } finally { setSaving(false); }
  }

  return (
    <Dialog icon="output" title={isNew ? t('modal.inv.new_mi') : t('modal.inv.edit_mi')} size="xl" onClose={onClose}
      footer={<><Button variant="primary" icon="save" busy={saving} onClick={submit}>{t('action.save')}</Button><Button variant="ghost" onClick={onClose}>{t('action.cancel')}</Button></>}>
      {error && <div className="xpl-form-error"><span className="material-symbols-outlined">error</span>{error}</div>}
      <DialogSection title={t('sec.inv.contract_date')} icon="description">
        <div className="xpl-field"><label>{t('field.inv.contract_optional')}</label><select className="xpl-select" value={contractId} onChange={(e) => setContractId(e.target.value)} aria-label={t('field.inv.contract_optional')}><option value="">— {t('opt.no_contract')} —</option>{contracts.map((c) => <option key={c.id} value={String(c.id)}>{c.code} — {c.asphaltPlant}</option>)}</select></div>
        <div className="xpl-field"><label>{t('col.date')}</label><DateInput className="xpl-input" value={date} onChange={setDate} autoFocus ariaLabel={t('col.date')} /><HistoricalDateNotice date={date} /></div>
        <div className="xpl-field xpl-field--full"><label>{t('field.notes')}</label><input className="xpl-input" value={notes} onChange={(e) => setNotes(e.target.value)} aria-label={t('field.notes')} /></div>
      </DialogSection>
      <section className="xpl-dialog-section">
        <div className="xpl-dialog-section-title"><span className="material-symbols-outlined">list_alt</span>{t('lbl.inv.items')} <small style={{ fontWeight: 400, color: 'var(--xpl-muted)' }}>{t('lbl.inv.items_note')}</small></div>
        <LineItemBuilder items={items} onChange={setItems} materials={materials} showCost={false} />
      </section>
    </Dialog>
  );
}
