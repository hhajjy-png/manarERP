import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import StatCard from '../components/StatCard';
import { money, dateText } from '../config/modules';

// ── Domain Types ──────────────────────────────────────────────────────────────

interface MaterialCategory {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  _count?: { materials: number };
}

interface Material {
  id: number;
  code: string;
  name: string;
  unit: string;
  categoryId: number;
  category?: { name: string };
  currentStock: number;
  minimumStock: number;
  unitCost: number;
  notes?: string | null;
  isActive: boolean;
}

interface PurchaseOrder {
  id: number;
  number: string;
  supplierId: number;
  supplier?: { name: string };
  date: string;
  expectedDate?: string | null;
  status: string;
  totalAmount: number;
  notes?: string | null;
}

interface GoodsReceipt {
  id: number;
  number: string;
  supplierId: number;
  supplier?: { name: string };
  purchaseOrderId?: number | null;
  purchaseOrder?: { number: string } | null;
  date: string;
  status: string;
  totalCost: number;
  notes?: string | null;
}

interface MaterialIssueItem {
  id: number;
  materialId: number;
  quantity: number;
  unitCostSnapshot: number;
  totalCost: number;
  material?: { name: string; unit: string };
}

interface MaterialIssue {
  id: number;
  number: string;
  contractId?: number | null;
  contract?: { code: string } | null;
  date: string;
  status: string;
  totalCost: number;
  notes?: string | null;
  items?: MaterialIssueItem[];
}

interface Supplier {
  id: number;
  name: string;
}

interface Contract {
  id: number;
  code: string;
  asphaltPlant: string;
}

interface DetailItem {
  id: number;
  quantity: number;
  unitCost?: number;
  unitCostSnapshot?: number;
  totalCost: number;
  material?: { name: string; unit: string };
}

interface DetailRecord {
  notes?: string | null;
  items?: DetailItem[];
  totalCost?: number;
  totalAmount?: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNITS = ['طن', 'كيلو', 'لتر', 'قطعة', 'متر', 'كيس', 'برميل', 'صندوق'] as const;

const poPill: Record<string, [string, string]> = {
  DRAFT: ['مسوّد', 'gray'], SUBMITTED: ['مُرسَل', 'blue'],
  RECEIVED: ['مستلَم', 'green'], CANCELLED: ['ملغي', 'red'],
};
const grPill: Record<string, [string, string]> = {
  DRAFT: ['مسوّد', 'gray'], POSTED: ['مُرحَّل', 'green'],
};
const miPill: Record<string, [string, string]> = {
  DRAFT: ['مسوّد', 'gray'], POSTED: ['مُرحَّل', 'green'], CANCELLED: ['ملغي', 'red'],
};

function statusBadge(map: Record<string, [string, string]>, status: string) {
  const [label, cls] = map[status] ?? [status, 'gray'];
  return <span className={`pill ${cls}`}>{label}</span>;
}

const inp: React.CSSProperties = {
  padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10,
  background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit',
  fontWeight: 600, fontSize: 14, outline: 'none', width: '100%', boxSizing: 'border-box',
};

// ── Tab Types ─────────────────────────────────────────────────────────────────

type Tab = 'balance' | 'materials' | 'categories' | 'purchase-orders' | 'goods-receipts' | 'material-issues';
interface LineItem { materialId: string; quantity: number; unitCost: number; }

const TABS: { key: Tab; label: string }[] = [
  { key: 'balance', label: 'tab.inventory.balance' },
  { key: 'materials', label: 'tab.inventory.materials' },
  { key: 'categories', label: 'tab.inventory.categories' },
  { key: 'purchase-orders', label: 'tab.inventory.purchase_orders' },
  { key: 'goods-receipts', label: 'tab.inventory.goods_receipts' },
  { key: 'material-issues', label: 'tab.inventory.material_issues' },
];

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Inventory() {
  const [tab, setTab] = useState<Tab>('balance');
  const { t } = useT();

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.inventory.title')}</h2><p>{t('page.inventory.subtitle')}</p></div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
        {TABS.map((tabItem) => (
          <button key={tabItem.key} className={`btn${tab === tabItem.key ? '' : ' secondary'} sm`} onClick={() => setTab(tabItem.key)}>
            {t(tabItem.label)}
          </button>
        ))}
      </div>
      {tab === 'balance'          && <BalanceTab />}
      {tab === 'categories'       && <CategoriesTab />}
      {tab === 'materials'        && <MaterialsTab />}
      {tab === 'purchase-orders'  && <PurchaseOrdersTab />}
      {tab === 'goods-receipts'   && <GoodsReceiptsTab />}
      {tab === 'material-issues'  && <MaterialIssuesTab />}
    </div>
  );
}

// ── رصيد المخزون ──────────────────────────────────────────────────────────────

function BalanceTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/inventory/materials', { params: { pageSize: 500 } }),
      api.get('/inventory/categories', { params: { pageSize: 200 } }),
    ])
      .then(([mRes, cRes]) => {
        setMaterials(mRes.data.data.data ?? []);
        setCategories(cRes.data.data.data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const totalValue = materials.reduce((s, m) => s + m.currentStock * m.unitCost, 0);
  const lowStock   = materials.filter((m) => m.currentStock <= m.minimumStock);
  const activeCats = categories.filter((c) => c.isActive).length;

  const columns = [
    { key: 'code',         label: 'الرمز',         render: (r: Material) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
    { key: 'name',         label: 'المادة',         render: (r: Material) => <strong>{r.name}</strong> },
    { key: 'unit',         label: 'الوحدة' },
    { key: 'category',     label: 'التصنيف',        render: (r: Material) => r.category?.name ?? '—' },
    { key: 'currentStock', label: 'المتوفر',        render: (r: Material) => <strong style={{ color: r.currentStock <= r.minimumStock ? '#ef4444' : 'inherit' }}>{r.currentStock}</strong> },
    { key: 'minimumStock', label: 'الحد الأدنى' },
    { key: 'unitCost',     label: 'تكلفة الوحدة',   render: (r: Material) => money(r.unitCost) },
    { key: 'totalValue',   label: 'إجمالي القيمة',  render: (r: Material) => money(r.currentStock * r.unitCost) },
    { key: 'stockStatus',  label: 'الحالة',         render: (r: Material) => r.currentStock <= r.minimumStock ? <span className="pill red">منخفض</span> : <span className="pill green">كافٍ</span> },
  ];

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <StatCard label="إجمالي المواد"   value={materials.length}  icon="📦" color="#3b82f6" bg="#dbeafe" />
        <StatCard label="قيمة المخزون"    value={money(totalValue)} icon="💰" color="#10b981" bg="#d1fae5" />
        <StatCard label="مواد منخفضة"     value={lowStock.length}   icon="⚠️" color="#f59e0b" bg="#fef3c7"
          sub={lowStock.length > 0 ? 'تحتاج إعادة تموين' : undefined} dir={lowStock.length > 0 ? 'down' : ''} />
        <StatCard label="تصنيفات نشطة"   value={activeCats}        icon="🏷️" color="#8b5cf6" bg="#ede9fe" />
      </div>
      <DataTable columns={columns} rows={materials} loading={loading} emptyText="لا توجد مواد مسجّلة" />
    </div>
  );
}

// ── التصنيفات ─────────────────────────────────────────────────────────────────

function CategoriesTab() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MaterialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<MaterialCategory> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/categories', { params: { pageSize: 200 } });
      setRows(res.data.data.data ?? []);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function remove(id: number) {
    if (!confirm('حذف هذا التصنيف؟')) return;
    try { await api.delete(`/inventory/categories/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'name',        label: 'اسم التصنيف', render: (r: MaterialCategory) => <strong>{r.name}</strong> },
    { key: 'description', label: 'الوصف',       render: (r: MaterialCategory) => r.description ?? '—' },
    { key: '_count',      label: 'عدد المواد',  render: (r: MaterialCategory) => r._count?.materials ?? 0 },
    { key: 'isActive',    label: 'الحالة',      render: (r: MaterialCategory) => r.isActive ? <span className="pill green">نشط</span> : <span className="pill gray">موقوف</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {hasPermission('inventory.create') && <button className="btn" onClick={() => setEditing({})}>＋ تصنيف جديد</button>}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} emptyText="لا توجد تصنيفات"
        actions={(row: MaterialCategory) => (
          <>
            {hasPermission('inventory.update') && <button className="btn secondary sm" onClick={() => setEditing(row)}>تعديل</button>}{' '}
            {hasPermission('inventory.delete') && <button className="btn secondary sm" onClick={() => remove(row.id)}>حذف</button>}
          </>
        )}
      />
      {editing !== null && (
        <CategoryForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

// ── المواد ────────────────────────────────────────────────────────────────────

function MaterialsTab() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<Material[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Partial<Material> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/materials', { params: { page, pageSize: 15, search: search || undefined } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally { setLoading(false); }
  }, [page, search]);
  useEffect(() => { load(); }, [load]);

  async function remove(id: number) {
    if (!confirm('حذف هذه المادة؟')) return;
    try { await api.delete(`/inventory/materials/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'code',         label: 'الرمز',        render: (r: Material) => <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>{r.code}</span> },
    { key: 'name',         label: 'المادة',        render: (r: Material) => <strong>{r.name}</strong> },
    { key: 'category',     label: 'التصنيف',       render: (r: Material) => r.category?.name ?? '—' },
    { key: 'unit',         label: 'الوحدة' },
    { key: 'currentStock', label: 'المتوفر',       render: (r: Material) => <span style={{ fontWeight: 700, color: r.currentStock <= r.minimumStock ? '#ef4444' : 'inherit' }}>{r.currentStock}</span> },
    { key: 'unitCost',     label: 'تكلفة/وحدة',   render: (r: Material) => money(r.unitCost) },
    { key: 'isActive',     label: 'الحالة',        render: (r: Material) => r.isActive ? <span className="pill green">نشط</span> : <span className="pill gray">موقوف</span> },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        <input placeholder="بحث بالاسم أو الرمز…" value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 280 }} />
        {hasPermission('inventory.create') && <button className="btn" onClick={() => setEditing({})}>＋ مادة جديدة</button>}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} meta={meta} onPage={setPage} emptyText="لا توجد مواد"
        actions={(row: Material) => (
          <>
            {hasPermission('inventory.update') && <button className="btn secondary sm" onClick={() => setEditing(row)}>تعديل</button>}{' '}
            {hasPermission('inventory.delete') && <button className="btn secondary sm" onClick={() => remove(row.id)}>حذف</button>}
          </>
        )}
      />
      {editing !== null && (
        <MaterialForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
    </div>
  );
}

// ── أوامر الشراء ──────────────────────────────────────────────────────────────

function PurchaseOrdersTab() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<PurchaseOrder[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/purchase-orders', { params: { page, pageSize: 15, status: statusFilter || undefined } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally { setLoading(false); }
  }, [page, statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function doPost(endpoint: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    try { await api.post(endpoint); load(); } catch (e) { alert(errorMessage(e)); }
  }

  async function remove(id: number) {
    if (!confirm('حذف أمر الشراء؟')) return;
    try { await api.delete(`/inventory/purchase-orders/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'number',       label: 'الرقم',          render: (r: PurchaseOrder) => <strong style={{ fontFamily: 'monospace' }}>{r.number}</strong> },
    { key: 'supplier',     label: 'المورّد',         render: (r: PurchaseOrder) => r.supplier?.name ?? '—' },
    { key: 'date',         label: 'التاريخ',         render: (r: PurchaseOrder) => dateText(r.date) },
    { key: 'expectedDate', label: 'التاريخ المتوقع', render: (r: PurchaseOrder) => dateText(r.expectedDate) },
    { key: 'status',       label: 'الحالة',          render: (r: PurchaseOrder) => statusBadge(poPill, r.status) },
    { key: 'totalAmount',  label: 'الإجمالي',        render: (r: PurchaseOrder) => money(r.totalAmount) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 180 }}>
          <option value="">كل الحالات</option>
          <option value="DRAFT">مسوّد</option>
          <option value="SUBMITTED">مُرسَل</option>
          <option value="RECEIVED">مستلَم</option>
          <option value="CANCELLED">ملغي</option>
        </select>
        {hasPermission('inventory.create') && <button className="btn" onClick={() => setCreating(true)}>＋ أمر شراء</button>}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} meta={meta} onPage={setPage} emptyText="لا توجد أوامر شراء"
        actions={(row: PurchaseOrder) => (
          <>
            <button className="btn secondary sm" onClick={() => setDetailId(row.id)}>عرض</button>{' '}
            {hasPermission('inventory.update') && row.status === 'DRAFT' && (
              <button className="btn sm" onClick={() => doPost(`/inventory/purchase-orders/${row.id}/submit`, 'إرسال أمر الشراء للمورّد؟')}>إرسال</button>
            )}{' '}
            {hasPermission('inventory.update') && ['DRAFT', 'SUBMITTED'].includes(row.status) && (
              <button className="btn secondary sm" onClick={() => doPost(`/inventory/purchase-orders/${row.id}/cancel`, 'إلغاء أمر الشراء؟')}>إلغاء</button>
            )}{' '}
            {hasPermission('inventory.delete') && row.status === 'DRAFT' && (
              <button className="btn secondary sm" onClick={() => remove(row.id)}>حذف</button>
            )}
          </>
        )}
      />
      {creating && <PurchaseOrderForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {detailId !== null && (
        <DetailModal title="تفاصيل أمر الشراء" id={detailId} endpoint="/inventory/purchase-orders" onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ── سندات الاستلام ────────────────────────────────────────────────────────────

function GoodsReceiptsTab() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<GoodsReceipt[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/goods-receipts', { params: { page, pageSize: 15 } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally { setLoading(false); }
  }, [page]);
  useEffect(() => { load(); }, [load]);

  async function post(id: number) {
    if (!confirm('ترحيل سند الاستلام؟ سيتم تحديث المخزون وترحيل قيد محاسبي.')) return;
    try { await api.post(`/inventory/goods-receipts/${id}/post`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  async function remove(id: number) {
    if (!confirm('حذف سند الاستلام؟')) return;
    try { await api.delete(`/inventory/goods-receipts/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'number',        label: 'الرقم',      render: (r: GoodsReceipt) => <strong style={{ fontFamily: 'monospace' }}>{r.number}</strong> },
    { key: 'supplier',      label: 'المورّد',     render: (r: GoodsReceipt) => r.supplier?.name ?? '—' },
    { key: 'purchaseOrder', label: 'أمر الشراء', render: (r: GoodsReceipt) => r.purchaseOrder?.number ?? '—' },
    { key: 'date',          label: 'التاريخ',     render: (r: GoodsReceipt) => dateText(r.date) },
    { key: 'status',        label: 'الحالة',      render: (r: GoodsReceipt) => statusBadge(grPill, r.status) },
    { key: 'totalCost',     label: 'الإجمالي',    render: (r: GoodsReceipt) => money(r.totalCost) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        {hasPermission('inventory.create') && <button className="btn" onClick={() => setCreating(true)}>＋ سند استلام</button>}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} meta={meta} onPage={setPage} emptyText="لا توجد سندات استلام"
        actions={(row: GoodsReceipt) => (
          <>
            <button className="btn secondary sm" onClick={() => setDetailId(row.id)}>عرض</button>{' '}
            {hasPermission('inventory.approve') && row.status === 'DRAFT' && (
              <button className="btn sm" onClick={() => post(row.id)}>ترحيل</button>
            )}{' '}
            {hasPermission('inventory.delete') && row.status === 'DRAFT' && (
              <button className="btn secondary sm" onClick={() => remove(row.id)}>حذف</button>
            )}
          </>
        )}
      />
      {creating && <GoodsReceiptForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {detailId !== null && (
        <DetailModal title="تفاصيل سند الاستلام" id={detailId} endpoint="/inventory/goods-receipts" onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ── سندات الصرف ───────────────────────────────────────────────────────────────

function MaterialIssuesTab() {
  const { hasPermission } = useAuth();
  const [rows, setRows] = useState<MaterialIssue[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Partial<MaterialIssue> | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/inventory/material-issues', { params: { page, pageSize: 15, status: statusFilter || undefined } });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally { setLoading(false); }
  }, [page, statusFilter]);
  useEffect(() => { load(); }, [load]);

  async function post(id: number) {
    if (!confirm('ترحيل سند الصرف؟ سيتم خصم المواد من المخزون وترحيل قيد محاسبي.')) return;
    try { await api.post(`/inventory/material-issues/${id}/post`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  async function cancel(id: number) {
    if (!confirm('إلغاء سند الصرف؟ سيتم إعادة الكميات إلى المخزون وحذف القيد المحاسبي.')) return;
    try { await api.post(`/inventory/material-issues/${id}/cancel`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  async function remove(id: number) {
    if (!confirm('حذف سند الصرف؟')) return;
    try { await api.delete(`/inventory/material-issues/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'number',    label: 'الرقم',    render: (r: MaterialIssue) => <strong style={{ fontFamily: 'monospace' }}>{r.number}</strong> },
    { key: 'contract',  label: 'العقد',    render: (r: MaterialIssue) => r.contract ? r.contract.code : '—' },
    { key: 'date',      label: 'التاريخ',  render: (r: MaterialIssue) => dateText(r.date) },
    { key: 'status',    label: 'الحالة',   render: (r: MaterialIssue) => statusBadge(miPill, r.status) },
    { key: 'totalCost', label: 'الإجمالي', render: (r: MaterialIssue) => money(r.totalCost) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 8 }}>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} style={{ ...inp, maxWidth: 180 }}>
          <option value="">كل الحالات</option>
          <option value="DRAFT">مسوّد</option>
          <option value="POSTED">مُرحَّل</option>
          <option value="CANCELLED">ملغي</option>
        </select>
        {hasPermission('inventory.create') && <button className="btn" onClick={() => setCreating(true)}>＋ سند صرف</button>}
      </div>
      <DataTable columns={columns} rows={rows} loading={loading} meta={meta} onPage={setPage} emptyText="لا توجد سندات صرف"
        actions={(row: MaterialIssue) => (
          <>
            <button className="btn secondary sm" onClick={() => setDetailId(row.id)}>عرض</button>{' '}
            {hasPermission('inventory.approve') && row.status === 'DRAFT' && (
              <button className="btn sm" onClick={() => post(row.id)}>ترحيل</button>
            )}{' '}
            {hasPermission('inventory.cancel') && row.status === 'POSTED' && (
              <button className="btn secondary sm" onClick={() => cancel(row.id)}>إلغاء</button>
            )}{' '}
            {hasPermission('inventory.update') && row.status === 'DRAFT' && (
              <button className="btn secondary sm" onClick={() => setEditing(row)}>تعديل</button>
            )}{' '}
            {hasPermission('inventory.delete') && row.status === 'DRAFT' && (
              <button className="btn secondary sm" onClick={() => remove(row.id)}>حذف</button>
            )}
          </>
        )}
      />
      {creating && <MaterialIssueForm onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing !== null && <MaterialIssueForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {detailId !== null && (
        <DetailModal title="تفاصيل سند الصرف" id={detailId} endpoint="/inventory/material-issues" onClose={() => setDetailId(null)} />
      )}
    </div>
  );
}

// ── Shared: Line Item Builder ─────────────────────────────────────────────────

function LineItemBuilder({
  items, onChange, materials, showCost,
}: {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
  materials: Material[];
  showCost: boolean;
}) {
  function updateItem(i: number, patch: Partial<LineItem>) {
    onChange(items.map((it, idx) => idx === i ? { ...it, ...patch } : it));
  }
  const total = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  return (
    <div>
      {items.map((it, i) => (
        <div key={i} style={{
          display: 'grid',
          gridTemplateColumns: showCost ? '2fr 1fr 1fr 1fr auto' : '3fr 1fr auto',
          gap: 6, marginBottom: 6, alignItems: 'center',
        }}>
          <select value={it.materialId} onChange={(e) => updateItem(i, { materialId: e.target.value })} style={inp}>
            <option value="">— اختر مادة —</option>
            {materials.map((m) => <option key={m.id} value={String(m.id)}>{m.name} ({m.unit})</option>)}
          </select>
          <input type="number" min="0.001" step="0.001" placeholder="الكمية" value={it.quantity}
            onChange={(e) => updateItem(i, { quantity: Number(e.target.value) })} style={inp} />
          {showCost && (
            <>
              <input type="number" min="0" step="0.001" placeholder="التكلفة/وحدة" value={it.unitCost}
                onChange={(e) => updateItem(i, { unitCost: Number(e.target.value) })} style={inp} />
              <div style={{ ...inp, background: 'var(--surface-2)', cursor: 'default' }}>
                {money(it.quantity * it.unitCost)}
              </div>
            </>
          )}
          {items.length > 1 && (
            <button className="btn secondary sm" type="button"
              onClick={() => onChange(items.filter((_, idx) => idx !== i))}>✕</button>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
        <button className="btn secondary sm" type="button"
          onClick={() => onChange([...items, { materialId: '', quantity: 1, unitCost: 0 }])}>
          ＋ إضافة مادة
        </button>
        {showCost && (
          <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>
            الإجمالي: {money(total)}
          </span>
        )}
      </div>
    </div>
  );
}

// ── Shared: Detail Modal ──────────────────────────────────────────────────────

function DetailModal({ title, id, endpoint, onClose }: { title: string; id: number; endpoint: string; onClose: () => void }) {
  const [detail, setDetail] = useState<DetailRecord | null>(null);

  useEffect(() => {
    api.get(`${endpoint}/${id}`)
      .then((res) => setDetail(res.data.data as DetailRecord))
      .catch(() => {});
  }, [endpoint, id]);

  return (
    <Modal title={title} onClose={onClose}>
      {!detail ? (
        <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>جارٍ التحميل…</div>
      ) : (
        <div>
          {detail.notes && <p style={{ color: 'var(--text-muted)', marginBottom: 12 }}>{detail.notes}</p>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid var(--border)' }}>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>المادة</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>الكمية</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>التكلفة/وحدة</th>
                <th style={{ textAlign: 'right', padding: '6px 8px' }}>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {detail.items?.map((it) => (
                <tr key={it.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px 8px' }}>
                    {it.material?.name} <small style={{ color: 'var(--text-muted)' }}>({it.material?.unit})</small>
                  </td>
                  <td style={{ padding: '6px 8px' }}>{it.quantity}</td>
                  <td style={{ padding: '6px 8px' }}>{money(it.unitCost ?? it.unitCostSnapshot ?? 0)}</td>
                  <td style={{ padding: '6px 8px' }}>{money(it.totalCost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 12, textAlign: 'left', fontWeight: 700 }}>
            الإجمالي الكلي: {money(detail.totalCost ?? detail.totalAmount ?? 0)}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ── Forms ─────────────────────────────────────────────────────────────────────

function CategoryForm({ initial, onClose, onSaved }: { initial: Partial<MaterialCategory>; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial?.id;
  const [name, setName] = useState<string>(initial?.name ?? '');
  const [description, setDescription] = useState<string>(initial?.description ?? '');
  const [isActive, setIsActive] = useState<boolean>(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!name.trim()) { setError('اسم التصنيف مطلوب'); return; }
    setSaving(true);
    try {
      const body = { name: name.trim(), description: description || null, isActive };
      if (isNew) await api.post('/inventory/categories', body);
      else await api.put(`/inventory/categories/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={isNew ? 'تصنيف جديد' : 'تعديل التصنيف'} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'حفظ'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field"><label>اسم التصنيف *</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field"><label>الوصف</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="cat-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <label htmlFor="cat-active">نشط</label>
        </div>
      </div>
    </Modal>
  );
}

function MaterialForm({ initial, onClose, onSaved }: { initial: Partial<Material>; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial?.id;
  const [categories, setCategories] = useState<MaterialCategory[]>([]);
  const [code, setCode]               = useState<string>(initial?.code ?? '');
  const [name, setName]               = useState<string>(initial?.name ?? '');
  const [categoryId, setCategoryId]   = useState<string>(String(initial?.categoryId ?? ''));
  const [unit, setUnit]               = useState<string>(initial?.unit ?? UNITS[0]);
  const [unitCost, setUnitCost]       = useState<string>(String(initial?.unitCost ?? '0'));
  const [minimumStock, setMinimumStock] = useState<string>(String(initial?.minimumStock ?? '0'));
  const [notes, setNotes]             = useState<string>(initial?.notes ?? '');
  const [isActive, setIsActive]       = useState<boolean>(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/inventory/categories', { params: { pageSize: 200 } })
      .then((res) => setCategories(res.data.data.data ?? []))
      .catch(() => {});
  }, []);

  async function submit() {
    setError('');
    if (isNew && !code.trim()) { setError('رمز المادة مطلوب'); return; }
    if (!name.trim()) { setError('اسم المادة مطلوب'); return; }
    if (!categoryId) { setError('التصنيف مطلوب'); return; }
    setSaving(true);
    try {
      const body = {
        ...(isNew ? { code: code.trim() } : {}),
        name: name.trim(), categoryId: Number(categoryId), unit,
        unitCost: Number(unitCost), minimumStock: Number(minimumStock),
        notes: notes || null, isActive,
      };
      if (isNew) await api.post('/inventory/materials', body);
      else await api.put(`/inventory/materials/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={isNew ? 'مادة جديدة' : 'تعديل المادة'} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'حفظ'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        {isNew && <div className="field"><label>رمز المادة *</label><input value={code} onChange={(e) => setCode(e.target.value)} /></div>}
        <div className="field"><label>اسم المادة *</label><input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="field">
          <label>التصنيف *</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">— اختر —</option>
            {categories.map((c) => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>وحدة القياس</label>
          <select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field"><label>تكلفة الوحدة (د.ك)</label><input type="number" min="0" step="0.001" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} /></div>
        <div className="field"><label>الحد الأدنى للمخزون</label><input type="number" min="0" step="0.001" value={minimumStock} onChange={(e) => setMinimumStock(e.target.value)} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>ملاحظات</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        <div className="field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="checkbox" id="mat-active" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <label htmlFor="mat-active">نشط</label>
        </div>
      </div>
    </Modal>
  );
}

function PurchaseOrderForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate]             = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes]           = useState('');
  const [items, setItems]           = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/suppliers', { params: { pageSize: 200 } }),
      api.get('/inventory/materials', { params: { pageSize: 500 } }),
    ]).then(([sRes, mRes]) => {
      setSuppliers(sRes.data.data.data ?? []);
      setMaterials(mRes.data.data.data ?? []);
    }).catch(() => {});
  }, []);

  async function submit() {
    setError('');
    if (!supplierId) { setError('المورّد مطلوب'); return; }
    if (items.some((it) => !it.materialId)) { setError('اختر مادة لكل بند'); return; }
    if (items.some((it) => it.quantity <= 0)) { setError('الكمية يجب أن تكون أكبر من صفر'); return; }
    setSaving(true);
    try {
      await api.post('/inventory/purchase-orders', {
        supplierId: Number(supplierId),
        date: date || undefined, expectedDate: expectedDate || undefined, notes: notes || null,
        items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity, unitCost: it.unitCost })),
      });
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="أمر شراء جديد" onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'حفظ'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>المورّد *</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— اختر —</option>
            {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        </div>
        <div className="field"><label>تاريخ الأمر</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field"><label>تاريخ الاستلام المتوقع</label><input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>ملاحظات</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div style={{ margin: '12px 0 6px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>البنود</div>
      <LineItemBuilder items={items} onChange={setItems} materials={materials} showCost />
    </Modal>
  );
}

function GoodsReceiptForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [supplierId, setSupplierId]           = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [date, setDate]                       = useState('');
  const [notes, setNotes]                     = useState('');
  const [items, setItems]                     = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/suppliers', { params: { pageSize: 200 } }),
      api.get('/inventory/purchase-orders', { params: { pageSize: 200, status: 'SUBMITTED' } }),
      api.get('/inventory/materials', { params: { pageSize: 500 } }),
    ]).then(([sRes, poRes, mRes]) => {
      setSuppliers(sRes.data.data.data ?? []);
      setPurchaseOrders(poRes.data.data.data ?? []);
      setMaterials(mRes.data.data.data ?? []);
    }).catch(() => {});
  }, []);

  async function submit() {
    setError('');
    if (!supplierId) { setError('المورّد مطلوب'); return; }
    if (items.some((it) => !it.materialId)) { setError('اختر مادة لكل بند'); return; }
    if (items.some((it) => it.quantity <= 0)) { setError('الكمية يجب أن تكون أكبر من صفر'); return; }
    setSaving(true);
    try {
      await api.post('/inventory/goods-receipts', {
        supplierId: Number(supplierId),
        purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : undefined,
        date: date || undefined, notes: notes || null,
        items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity, unitCost: it.unitCost })),
      });
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title="سند استلام جديد" onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'حفظ'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>المورّد *</label>
          <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">— اختر —</option>
            {suppliers.map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>أمر الشراء (اختياري)</label>
          <select value={purchaseOrderId} onChange={(e) => setPurchaseOrderId(e.target.value)}>
            <option value="">— بدون أمر شراء —</option>
            {purchaseOrders.map((po) => <option key={po.id} value={String(po.id)}>{po.number}</option>)}
          </select>
        </div>
        <div className="field"><label>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>ملاحظات</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div style={{ margin: '12px 0 6px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>البنود</div>
      <LineItemBuilder items={items} onChange={setItems} materials={materials} showCost />
    </Modal>
  );
}

function MaterialIssueForm({ initial, onClose, onSaved }: { initial?: Partial<MaterialIssue>; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial?.id;
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [contractId, setContractId] = useState<string>(String(initial?.contractId ?? ''));
  const [date, setDate]             = useState<string>(initial?.date ? String(initial.date).slice(0, 10) : '');
  const [notes, setNotes]           = useState<string>(initial?.notes ?? '');
  const [items, setItems]           = useState<LineItem[]>([{ materialId: '', quantity: 1, unitCost: 0 }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/contracts', { params: { pageSize: 200, status: 'ACTIVE' } }),
      api.get('/inventory/materials', { params: { pageSize: 500 } }),
    ]).then(([cRes, mRes]) => {
      setContracts(cRes.data.data.data ?? []);
      setMaterials(mRes.data.data.data ?? []);
    }).catch(() => {});

    if (!isNew && initial?.id) {
      api.get(`/inventory/material-issues/${initial.id}`)
        .then((res) => {
          const detail = res.data.data as MaterialIssue;
          if (detail.items?.length) {
            setItems(detail.items.map((it) => ({
              materialId: String(it.materialId), quantity: it.quantity, unitCost: 0,
            })));
          }
        })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError('');
    if (items.some((it) => !it.materialId)) { setError('اختر مادة لكل بند'); return; }
    if (items.some((it) => it.quantity <= 0)) { setError('الكمية يجب أن تكون أكبر من صفر'); return; }
    setSaving(true);
    try {
      const body = {
        contractId: contractId ? Number(contractId) : undefined,
        date: date || undefined, notes: notes || null,
        items: items.map((it) => ({ materialId: Number(it.materialId), quantity: it.quantity })),
      };
      if (isNew) await api.post('/inventory/material-issues', body);
      else await api.put(`/inventory/material-issues/${initial.id}`, body);
      onSaved();
    } catch (err) { setError(errorMessage(err)); }
    finally { setSaving(false); }
  }

  return (
    <Modal title={isNew ? 'سند صرف جديد' : 'تعديل سند الصرف'} onClose={onClose} footer={
      <>
        <button className="btn" onClick={submit} disabled={saving}>{saving ? 'جارٍ…' : 'حفظ'}</button>
        <button className="btn secondary" onClick={onClose}>إلغاء</button>
      </>
    }>
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>العقد (اختياري)</label>
          <select value={contractId} onChange={(e) => setContractId(e.target.value)}>
            <option value="">— بدون عقد —</option>
            {contracts.map((c) => <option key={c.id} value={String(c.id)}>{c.code} — {c.asphaltPlant}</option>)}
          </select>
        </div>
        <div className="field"><label>التاريخ</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>ملاحظات</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      </div>
      <div style={{ margin: '12px 0 6px', fontWeight: 700, fontSize: 13, color: 'var(--text-muted)' }}>
        البنود
        <small style={{ fontWeight: 400, marginRight: 8 }}>التكلفة تُحسب تلقائيًا بسعر المتوسط المرجح عند الترحيل</small>
      </div>
      <LineItemBuilder items={items} onChange={setItems} materials={materials} showCost={false} />
    </Modal>
  );
}
