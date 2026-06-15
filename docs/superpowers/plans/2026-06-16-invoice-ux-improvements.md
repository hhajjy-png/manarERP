# Invoice UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Six targeted UX improvements to the invoice module — price filtering by customer (with DB schema addition), action button cleanup, trash-icon force-delete, column headers, and default unit 'درب'.

**Architecture:** One Prisma schema change (nullable `customerId` on `ProjectPrice`, required in Zod for new prices). Backend prices module gets customerId filter. Prices page gets customer column + selector. Invoice forms load prices only for the selected customer with no fallback.

**Tech Stack:** Prisma (SQLite), Express/Zod, React 18 + TypeScript, Vite

**Spec:** `docs/superpowers/specs/2026-06-16-invoice-ux-improvements-design.md`

---

## File Map

| File | Change |
|---|---|
| `backend/prisma/schema.prisma` | Add `customerId Int?` + relation to `ProjectPrice`; add `projectPrices ProjectPrice[]` to `Customer` |
| `backend/src/modules/prices/prices.schema.ts` | Add `customerId` — required in create, optional in update |
| `backend/src/modules/prices/prices.service.ts` | Add `customerId` to list filter, create, update; include `customer` in results |
| `backend/src/modules/prices/prices.controller.ts` | Parse `customerId` query param |
| `frontend/src/pages/Prices.tsx` | Customer column in table; customer selector + filter |
| `frontend/src/pages/Invoices.tsx` | All 6 improvements |

---

## Task 1: Git Setup

**Files:** none

- [ ] **Step 1: Verify clean state**

```bash
git status
git log --oneline -3
```

Expected: no uncommitted changes, on `production` branch.

- [ ] **Step 2: Create checkpoint tag**

```bash
git tag pre-invoice-ux-improvements
git tag -l | grep pre-invoice
```

Expected: `pre-invoice-ux-improvements` in the list.

- [ ] **Step 3: Create and switch to feature branch**

```bash
git checkout -b feature/invoice-ux-improvements
git branch
```

Expected: `* feature/invoice-ux-improvements` active.

---

## Task 2: Prisma Schema — Add Customer Relation to ProjectPrice

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Add `projectPrices` reverse relation to Customer model**

In `backend/prisma/schema.prisma`, locate the `Customer` model (line ~95). After `invoices Invoice[]` and before `createdAt DateTime`, add:

```prisma
  contracts     Contract[]
  invoices      Invoice[]
  projectPrices ProjectPrice[]
```

(Replace the existing `contracts Contract[]` and `invoices Invoice[]` lines — just add `projectPrices ProjectPrice[]` after `invoices Invoice[]`.)

- [ ] **Step 2: Add `customerId` and relation to ProjectPrice model**

Locate `model ProjectPrice` (line ~1027). Add after `isArchived Boolean @default(false)`:

```prisma
  isArchived       Boolean @default(false)
  customerId       Int?
  customer         Customer? @relation(fields: [customerId], references: [id])
```

Add `@@index([customerId])` in the index block:

```prisma
  @@index([isArchived])
  @@index([asphaltPlant])
  @@index([companyName])
  @@index([customerId])
  @@map("project_prices")
```

- [ ] **Step 3: Run migration**

```bash
npm run db:migrate
```

When prompted for migration name, enter: `add-customer-to-project-price`

Expected output ends with: `✔ Generated Prisma Client`

If it asks for a name inline, run:
```bash
cd backend && npx prisma migrate dev --name add-customer-to-project-price
```

- [ ] **Step 4: Regenerate Prisma Client**

```bash
npm run db:generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 5: Verify migration SQL**

Open `backend/prisma/migrations/` — find the new migration folder ending in `add_customer_to_project_price`. Check that its `migration.sql` contains:

```sql
ALTER TABLE "project_prices" ADD COLUMN "customer_id" INTEGER;
```

(SQLite adds nullable column — existing rows get NULL automatically. This is correct.)

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations/
git commit -m "chore(db): add customerId to ProjectPrice — add-customer-to-project-price migration"
```

---

## Task 3: Backend — Update Prices Module

**Files:**
- Modify: `backend/src/modules/prices/prices.schema.ts`
- Modify: `backend/src/modules/prices/prices.service.ts`
- Modify: `backend/src/modules/prices/prices.controller.ts`

- [ ] **Step 1: Update prices.schema.ts**

Replace the entire contents of `backend/src/modules/prices/prices.schema.ts`:

```typescript
import { z } from 'zod';
import { ENUMS } from '../../config/constants';

export const createPriceSchema = z.object({
  body: z.object({
    asphaltPlant: z.string().min(1, 'مصنع الأسفلت مطلوب'),
    companyName: z.string().min(1, 'اسم الشركة مطلوب'),
    contractLocation: z.string().min(1, 'مكان العقد مطلوب'),
    contractUnit: z.enum(ENUMS.invoiceUnit, { errorMap: () => ({ message: 'وحدة العقد غير صحيحة' }) }),
    unitPrice: z.coerce.number().nonnegative('السعر يجب ألا يكون سالبًا'),
    customerId: z.number().int().positive('يجب اختيار عميل'),
  }),
});

export const updatePriceSchema = z.object({
  body: z.object({
    asphaltPlant: z.string().min(1).optional(),
    companyName: z.string().min(1).optional(),
    contractLocation: z.string().min(1).optional(),
    contractUnit: z.enum(ENUMS.invoiceUnit).optional(),
    unitPrice: z.coerce.number().nonnegative().optional(),
    isArchived: z.boolean().optional(),
    customerId: z.number().int().positive().optional(),
  }),
});

export type CreatePriceInput = z.infer<typeof createPriceSchema>['body'];
export type UpdatePriceInput = z.infer<typeof updatePriceSchema>['body'];
```

- [ ] **Step 2: Update prices.service.ts**

Replace the entire contents of `backend/src/modules/prices/prices.service.ts`:

```typescript
import { Request } from 'express';
import { prisma } from '@config/database';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import type { CreatePriceInput, UpdatePriceInput } from './prices.schema';

const customerSelect = { select: { id: true, name: true } } as const;

export async function listPrices(params: {
  page: number;
  pageSize: number;
  search?: string;
  asphaltPlant?: string;
  companyName?: string;
  contractUnit?: string;
  customerId?: number;
}) {
  const { page, pageSize, search, asphaltPlant, companyName, contractUnit, customerId } = params;
  const skip = (page - 1) * pageSize;

  const where = {
    isArchived: false,
    ...(asphaltPlant ? { asphaltPlant: { contains: asphaltPlant } } : {}),
    ...(companyName ? { companyName: { contains: companyName } } : {}),
    ...(contractUnit ? { contractUnit } : {}),
    ...(customerId ? { customerId } : {}),
    ...(search
      ? {
          OR: [
            { asphaltPlant: { contains: search } },
            { companyName: { contains: search } },
            { contractLocation: { contains: search } },
          ],
        }
      : {}),
  };

  const [data, total] = await Promise.all([
    prisma.projectPrice.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { customer: customerSelect },
    }),
    prisma.projectPrice.count({ where }),
  ]);

  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

export async function createPrice(input: CreatePriceInput) {
  return prisma.projectPrice.create({
    data: input,
    include: { customer: customerSelect },
  });
}

export async function updatePrice(id: number, input: UpdatePriceInput) {
  return prisma.projectPrice.update({
    where: { id },
    data: input,
    include: { customer: customerSelect },
  });
}

export async function deletePrice(id: number) {
  return prisma.projectPrice.update({ where: { id }, data: { isArchived: true } });
}

export async function forceRemovePreview(id: number) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');
  return {
    price,
    childCounts: {},
    totalChildRecords: 0,
    willBeDeleted: ['projectPrice'],
    willBeNullified: [],
  };
}

export async function forceRemove(id: number, req: Request) {
  const price = await prisma.projectPrice.findUnique({ where: { id } });
  if (!price) throw AppError.notFound('السعر غير موجود');

  await prisma.$transaction(async (tx) => {
    await tx.projectPrice.delete({ where: { id } });
  });

  await recordAudit({
    req,
    action: 'DELETE',
    module: 'prices',
    entityId: id,
    oldValue: {
      forceDelete: true,
      deletedEntity: {
        id: price.id,
        asphaltPlant: price.asphaltPlant,
        companyName: price.companyName,
        contractLocation: price.contractLocation,
        contractUnit: price.contractUnit,
        unitPrice: price.unitPrice,
        isArchived: price.isArchived,
      },
      childCounts: {},
      totalChildRecords: 0,
      willBeDeleted: ['projectPrice'],
      willBeNullified: [],
    },
  });

  return { deleted: true, impact: { childCounts: {}, totalChildRecords: 0 } };
}
```

- [ ] **Step 3: Update prices.controller.ts — add customerId to list**

Replace the `list` handler only (lines 6-18) in `backend/src/modules/prices/prices.controller.ts`:

```typescript
export const list = asyncHandler(async (req: Request, res: Response) => {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const customerId = req.query.customerId ? Number(req.query.customerId) : undefined;
  const result = await service.listPrices({
    page,
    pageSize,
    search: req.query.search as string | undefined,
    asphaltPlant: req.query.asphaltPlant as string | undefined,
    companyName: req.query.companyName as string | undefined,
    contractUnit: req.query.contractUnit as string | undefined,
    customerId,
  });
  ok(res, result);
});
```

- [ ] **Step 4: TypeScript check — backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors. If you see errors about `ProjectPrice` types (like `customer` not existing), ensure `npm run db:generate` was run in Task 2.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/prices/
git commit -m "feat(prices): add customerId filter — required on create, optional on update"
```

---

## Task 4: Frontend — Prices.tsx

**Files:**
- Modify: `frontend/src/pages/Prices.tsx`

- [ ] **Step 1: Replace Prices.tsx with the full updated version**

Replace the entire contents of `frontend/src/pages/Prices.tsx`:

```typescript
import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client';
import { useAuth } from '../stores/authStore';
import { useT } from '../lib/i18n';
import DataTable, { PageMeta } from '../components/DataTable';
import Modal from '../components/Modal';
import { money } from '../config/modules';
import ForceDeleteProjectPriceModal from '../components/ForceDeleteProjectPriceModal';

const contractUnits = ['طن', 'درب', 'يومية', 'مقطوعية'] as const;

export default function Prices() {
  const { hasPermission, user } = useAuth();
  const isSystemAdmin = user?.role.name === 'SYSTEM_ADMIN';
  const { t } = useT();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [rows, setRows] = useState<any[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [filterPlant, setFilterPlant] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterUnit, setFilterUnit] = useState('');
  const [filterCustomer, setFilterCustomer] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customers, setCustomers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editing, setEditing] = useState<any | null>(null);
  const [creating, setCreating] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [forceDeleteCandidate, setForceDeleteCandidate] = useState<{ id: number; asphaltPlant: string } | null>(null);

  useEffect(() => {
    api.get('/customers', { params: { pageSize: 200 } })
      .then((res) => setCustomers(res.data.data.data ?? []))
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/prices', {
        params: {
          page,
          pageSize: 20,
          search: search || undefined,
          asphaltPlant: filterPlant || undefined,
          companyName: filterCompany || undefined,
          contractUnit: filterUnit || undefined,
          customerId: filterCustomer || undefined,
        },
      });
      setRows(res.data.data.data ?? []);
      setMeta(res.data.data.meta ?? null);
    } finally {
      setLoading(false);
    }
  }, [page, search, filterPlant, filterCompany, filterUnit, filterCustomer]);

  useEffect(() => { load(); }, [load]);

  async function exportExcel() {
    if (!hasPermission('reports.export')) return;
    setExportBusy(true);
    try {
      const res = await api.get('/reports/prices/export', {
        params: { format: 'excel' },
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'prices-export.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setExportBusy(false);
    }
  }

  async function archiveRow(id: number) {
    if (!confirm(t('confirm.archive_price'))) return;
    try { await api.delete(`/prices/${id}`); load(); } catch (e) { alert(errorMessage(e)); }
  }

  const columns = [
    { key: 'customer', label: 'العميل', render: (r: Record<string, unknown>) => {
      const c = r.customer as { name: string } | null | undefined;
      return c?.name ?? <span style={{ color: 'var(--text-muted)' }}>—</span>;
    }},
    { key: 'asphaltPlant', label: 'col.prices.plant', render: (r: Record<string, unknown>) => <strong>{String(r.asphaltPlant)}</strong> },
    { key: 'companyName', label: 'col.prices.company' },
    { key: 'contractLocation', label: 'col.prices.location' },
    { key: 'contractUnit', label: 'col.prices.unit' },
    { key: 'unitPrice', label: 'col.prices.unit_price', render: (r: Record<string, unknown>) => money(r.unitPrice) },
  ];

  function resetFilters() {
    setSearch(''); setFilterPlant(''); setFilterCompany(''); setFilterUnit(''); setFilterCustomer(''); setPage(1);
  }

  const hasFilters = search || filterPlant || filterCompany || filterUnit || filterCustomer;

  return (
    <div>
      <div className="page-head">
        <div><h2>{t('page.prices.title')}</h2><p>{t('page.prices.subtitle')}</p></div>
        <>
          {hasPermission('reports.export') && (
            <button type="button" className="btn secondary" onClick={exportExcel} disabled={exportBusy}>
              {exportBusy ? '...' : 'تصدير الكل Excel'}
            </button>
          )}
          {hasPermission('prices.create') && (
            <button type="button" className="btn" onClick={() => setCreating(true)}>＋ {t('page.prices.create')}</button>
          )}
        </>
      </div>

      <div className="toolbar" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <input
          placeholder={t('page.prices.search')}
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={inp}
        />
        <select
          value={filterCustomer}
          onChange={(e) => { setFilterCustomer(e.target.value); setPage(1); }}
          title="العميل"
          style={{ ...inp, maxWidth: 200 }}
        >
          <option value="">كل العملاء</option>
          {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <input
          placeholder={t('filter.prices.plant')}
          value={filterPlant}
          onChange={(e) => { setFilterPlant(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 200 }}
        />
        <input
          placeholder={t('filter.prices.company')}
          value={filterCompany}
          onChange={(e) => { setFilterCompany(e.target.value); setPage(1); }}
          style={{ ...inp, maxWidth: 200 }}
        />
        <select
          value={filterUnit}
          onChange={(e) => { setFilterUnit(e.target.value); setPage(1); }}
          title={t('filter.prices.unit')}
          style={{ ...inp, maxWidth: 150 }}
        >
          <option value="">{t('opt.all')}</option>
          {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
        </select>
        {hasFilters && (
          <button type="button" className="btn secondary sm" onClick={resetFilters}>
            {t('action.reset_filters')}
          </button>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        loading={loading}
        meta={meta}
        onPage={setPage}
        emptyText={t('empty.prices')}
        isFiltered={!!hasFilters}
        onResetFilters={resetFilters}
        actions={(row) => (
          <>
            {hasPermission('prices.update') && (
              <button className="btn sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
            )}{' '}
            {hasPermission('prices.delete') && (
              <button className="btn secondary sm" onClick={() => archiveRow(row.id)}>{t('action.delete')}</button>
            )}{' '}
            {isSystemAdmin && (
              <button type="button" className="btn danger sm" onClick={() => setForceDeleteCandidate({ id: row.id, asphaltPlant: row.asphaltPlant })}>حذف نهائي</button>
            )}
          </>
        )}
      />

      {creating && <PriceForm customers={customers} onClose={() => setCreating(false)} onSaved={load} />}
      {editing && <PriceForm customers={customers} price={editing} onClose={() => setEditing(null)} onSaved={load} />}

      {forceDeleteCandidate && (
        <ForceDeleteProjectPriceModal
          priceId={forceDeleteCandidate.id}
          onClose={() => setForceDeleteCandidate(null)}
          onDeleted={() => { setForceDeleteCandidate(null); load(); }}
        />
      )}
    </div>
  );
}

// ===== نموذج إنشاء / تعديل سعر =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PriceForm({ price, customers, onClose, onSaved }: { price?: any; customers: any[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useT();
  const isEdit = !!price;

  const [asphaltPlant, setAsphaltPlant] = useState(price?.asphaltPlant ?? '');
  const [companyName, setCompanyName] = useState(price?.companyName ?? '');
  const [contractLocation, setContractLocation] = useState(price?.contractLocation ?? '');
  const [contractUnit, setContractUnit] = useState<(typeof contractUnits)[number]>((price?.contractUnit ?? 'درب') as (typeof contractUnits)[number]);
  const [unitPrice, setUnitPrice] = useState<number>(price?.unitPrice ?? 0);
  const [customerId, setCustomerId] = useState<number | ''>(price?.customerId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!asphaltPlant.trim()) { setError(t('error.prices.plant_required')); return; }
    if (!companyName.trim()) { setError(t('error.prices.company_required')); return; }
    if (!contractLocation.trim()) { setError(t('error.prices.location_required')); return; }
    if (unitPrice < 0) { setError(t('error.price_negative')); return; }
    if (!isEdit && !customerId) { setError('يجب اختيار عميل'); return; }

    setSaving(true);
    try {
      const payload = {
        asphaltPlant: asphaltPlant.trim(),
        companyName: companyName.trim(),
        contractLocation: contractLocation.trim(),
        contractUnit,
        unitPrice,
        ...(customerId !== '' ? { customerId: Number(customerId) } : {}),
      };
      if (isEdit) {
        await api.patch(`/prices/${price.id}`, payload);
      } else {
        await api.post('/prices', payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={isEdit ? t('modal.edit_price') : t('modal.new_price')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={submit} disabled={saving}>{saving ? t('msg.saving') : t('action.save')}</button>
          <button className="btn secondary" onClick={onClose}>{t('action.cancel')}</button>
        </>
      }
    >
      {error && <div className="alert error">⚠️ {error}</div>}
      <div className="form-grid">
        <div className="field">
          <label>العميل {!isEdit && '*'}</label>
          <select
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value ? Number(e.target.value) : '')}
            title="العميل"
          >
            <option value="">— اختر عميل —</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('col.prices.plant')} *</label>
          <input value={asphaltPlant} onChange={(e) => setAsphaltPlant(e.target.value)} placeholder={t('ph.prices.plant')} style={inp} />
        </div>
        <div className="field">
          <label>{t('col.prices.company')} *</label>
          <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder={t('ph.prices.company')} style={inp} />
        </div>
        <div className="field">
          <label>{t('col.prices.location')} *</label>
          <input value={contractLocation} onChange={(e) => setContractLocation(e.target.value)} placeholder={t('ph.prices.location')} style={inp} />
        </div>
        <div className="field">
          <label>{t('col.prices.unit')}</label>
          <select value={contractUnit} onChange={(e) => setContractUnit(e.target.value as (typeof contractUnits)[number])} title={t('col.prices.unit')}>
            {contractUnits.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="field">
          <label>{t('col.prices.unit_price')} *</label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={unitPrice}
            onChange={(e) => setUnitPrice(Number(e.target.value))}
            placeholder="0.000"
            style={inp}
          />
        </div>
      </div>
    </Modal>
  );
}

const inp: React.CSSProperties = { padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 10, background: 'var(--bg)', color: 'var(--text)', fontFamily: 'inherit', fontWeight: 600, fontSize: 14, outline: 'none' };
```

- [ ] **Step 2: TypeScript check — frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Prices.tsx
git commit -m "feat(prices): add customer column, selector, and filter"
```

---

## Task 5: Frontend — Invoices.tsx Quick UX Fixes (Improvements #2, #3, #5, #6)

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`

All 4 changes below are in `frontend/src/pages/Invoices.tsx`. Make them in one editing session.

- [ ] **Step 1: Change default unit from 'طن' to 'درب' — 4 occurrences**

**Occurrence 1** — `CreateInvoice` initial state (~line 286):
```typescript
// Before
const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'طن', unitPrice: 0 }]);
// After
const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'درب', unitPrice: 0 }]);
```

**Occurrence 2** — `CreateInvoice` add-item button (~line 621):
```typescript
// Before
onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'طن', unitPrice: 0 }])
// After
onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'درب', unitPrice: 0 }])
```

**Occurrence 3** — `EditInvoice` initial state (~line 668):
```typescript
// Before
const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'طن', unitPrice: 0 }]);
// After
const [items, setItems] = useState<Item[]>([{ description: '', quantity: 1, unit: 'درب', unitPrice: 0 }]);
```

**Occurrence 4** — `EditInvoice` add-item button (~line 956):
```typescript
// Before
onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'طن', unitPrice: 0 }])
// After
onClick={() => setItems((p) => [...p, { description: '', quantity: 1, unit: 'درب', unitPrice: 0 }])
```

- [ ] **Step 2: Add column headers above items grid in CreateInvoice**

Locate the items label in `CreateInvoice` (~line 532):
```typescript
<label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
{items.map((it, i) => (
```

Replace with:
```typescript
<label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
<div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px' }}>
  {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
    <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
  ))}
  <div />
</div>
{items.map((it, i) => (
```

- [ ] **Step 3: Add column headers above items grid in EditInvoice**

Locate the same items label in `EditInvoice` (~line 908):
```typescript
<label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
{items.map((it, i) => (
```

Replace with:
```typescript
<label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
<div style={{ display: 'grid', gridTemplateColumns: '2fr .9fr .9fr 1fr 1fr auto', gap: 8, marginBottom: 4, padding: '0 2px' }}>
  {['البنود', 'الكمية', 'الوحدة', 'السعر', 'الإجمالي'].map((h) => (
    <div key={h} style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>{h}</div>
  ))}
  <div />
</div>
{items.map((it, i) => (
```

- [ ] **Step 4: Remove Preview + Delete buttons from actions; remove dead code**

**4a — Remove `deleting` state** (~line 79):
```typescript
// Remove this line:
const [deleting, setDeleting] = useState<any | null>(null);
```

**4b — Remove Preview and Delete buttons from the `actions` prop** (~lines 229-246). Replace the entire actions block:

```typescript
// Before (full actions block):
actions={(row) => (
  <>
    {hasPermission('invoices.read') && (
      <button type="button" className="btn secondary sm" onClick={() => navigate(`/invoices/${row.id}/preview`)}>{t('btn.inv.preview')}</button>
    )}{' '}
    {hasPermission('invoices.read') && (
      <button type="button" className="btn secondary sm" onClick={() => navigate(`/invoices/${row.id}/preview?print=1`)}>{t('btn.inv.print_invoice')}</button>
    )}{' '}
    {hasPermission('invoices.update') && (row.status === 'UNPAID' || (row.status === 'OVERDUE' && Number(row.paidAmount) === 0)) && (
      <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
    )}{' '}
    {hasPermission('invoices.update') && row.status !== 'PAID' && row.status !== 'CANCELLED' && (
      <button className="btn sm" onClick={() => setPaying(row)}>{t('page.invoices.collect')}</button>
    )}{' '}
    {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
      <button className="btn secondary sm" onClick={() => cancel(row.id)}>{t('page.invoices.cancel_inv')}</button>
    )}{' '}
    {hasPermission('invoices.delete') && Number(row.paidAmount) === 0 && (row.status === 'UNPAID' || row.status === 'OVERDUE' || row.status === 'CANCELLED') && (
      <button type="button" className="btn danger sm" onClick={() => setDeleting(row)}>{t('action.delete')}</button>
    )}{' '}
    {isSystemAdmin && (
      <button type="button" className="btn danger sm" onClick={() => setForceDeleteId(row.id as number)}>حذف نهائي</button>
    )}
  </>
)}

// After:
actions={(row) => (
  <>
    {hasPermission('invoices.read') && (
      <button type="button" className="btn secondary sm" onClick={() => navigate(`/invoices/${row.id}/preview?print=1`)}>{t('btn.inv.print_invoice')}</button>
    )}{' '}
    {hasPermission('invoices.update') && (row.status === 'UNPAID' || (row.status === 'OVERDUE' && Number(row.paidAmount) === 0)) && (
      <button type="button" className="btn secondary sm" onClick={() => setEditing(row)}>{t('action.edit')}</button>
    )}{' '}
    {hasPermission('invoices.update') && row.status !== 'PAID' && row.status !== 'CANCELLED' && (
      <button className="btn sm" onClick={() => setPaying(row)}>{t('page.invoices.collect')}</button>
    )}{' '}
    {hasPermission('invoices.update') && row.status !== 'CANCELLED' && Number(row.paidAmount) === 0 && (
      <button className="btn secondary sm" onClick={() => cancel(row.id)}>{t('page.invoices.cancel_inv')}</button>
    )}{' '}
    {isSystemAdmin && (
      <button type="button" className="btn danger sm" title="حذف نهائي" style={{ padding: '4px 8px', lineHeight: 1 }} onClick={() => setForceDeleteId(row.id as number)}>🗑️</button>
    )}
  </>
)}
```

**4c — Remove `DeleteInvoiceConfirm` usage** (~line 256). Remove this line:
```typescript
{deleting && <DeleteInvoiceConfirm invoice={deleting} onClose={() => setDeleting(null)} onDeleted={load} />}
```

**4d — Remove `DeleteInvoiceConfirm` function** (~lines 970-1001). Remove the entire `DeleteInvoiceConfirm` function:
```typescript
// Remove everything from:
// ===== تأكيد حذف الفاتورة =====
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DeleteInvoiceConfirm({ invoice, onClose, onDeleted }: { invoice: any; onClose: () => void; onDeleted: () => void }) {
  ...
}
// To the closing brace.
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Invoices.tsx
git commit -m "feat(invoices): default unit درب, column headers, remove preview/delete buttons, trash icon"
```

---

## Task 6: Frontend — Invoices.tsx Price Filtering by Customer (Improvement #1)

**Files:**
- Modify: `frontend/src/pages/Invoices.tsx`

Both `CreateInvoice` and `EditInvoice` have a price-loading `useEffect`. Update both.

- [ ] **Step 1: Update price useEffect in CreateInvoice**

Locate in `CreateInvoice` (~line 310):
```typescript
useEffect(() => {
  api.get('/prices', { params: { pageSize: 200 } })
    .then((res) => setPrices(res.data?.data?.data ?? []))
    .catch((e) => { console.warn('[CreateInvoice] prices fetch failed:', e); });
}, []);
```

Replace with:
```typescript
useEffect(() => {
  if (effectivePartySource !== 'SALES' || !partyId) {
    setPrices([]);
    return;
  }
  api.get('/prices', { params: { pageSize: 200, customerId: partyId } })
    .then((res) => setPrices(res.data?.data?.data ?? []))
    .catch((e) => { console.warn('[CreateInvoice] prices fetch failed:', e); });
}, [partyId, effectivePartySource]);
```

- [ ] **Step 2: Add "no prices" message in CreateInvoice items area**

Locate in `CreateInvoice`, after the items label block (right before `{items.map(...)`):
```typescript
<label style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 700, display: 'block', margin: '8px 0' }}>{t('lbl.items')}</label>
<div style={{ display: 'grid', ...
```

Add between the header row and `{items.map(`:
```typescript
{effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontStyle: 'italic' }}>
    لا توجد أسعار معرفة لهذا العميل
  </p>
)}
{items.map((it, i) => (
```

- [ ] **Step 3: Update price useEffect in EditInvoice**

Locate in `EditInvoice` (~line 728):
```typescript
useEffect(() => {
  api.get('/prices', { params: { pageSize: 200 } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((res: any) => setPrices(res.data?.data?.data ?? []))
    .catch((e: unknown) => { console.warn('[EditInvoice] prices fetch failed:', e); });
}, []);
```

Replace with:
```typescript
useEffect(() => {
  if (effectivePartySource !== 'SALES' || !partyId) {
    setPrices([]);
    return;
  }
  api.get('/prices', { params: { pageSize: 200, customerId: partyId } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .then((res: any) => setPrices(res.data?.data?.data ?? []))
    .catch((e: unknown) => { console.warn('[EditInvoice] prices fetch failed:', e); });
}, [partyId, effectivePartySource]);
```

- [ ] **Step 4: Add "no prices" message in EditInvoice items area**

Same location as Step 2 but inside `EditInvoice`. Add between the header row and `{items.map(`:
```typescript
{effectivePartySource === 'SALES' && partyId && prices.length === 0 && (
  <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '0 0 8px', fontStyle: 'italic' }}>
    لا توجد أسعار معرفة لهذا العميل
  </p>
)}
{items.map((it, i) => (
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Invoices.tsx
git commit -m "feat(invoices): filter price picker by selected customer — no fallback"
```

---

## Task 7: Full Build Validation

**Files:** none (validation only)

- [ ] **Step 1: Backend TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2: Frontend TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Electron TypeScript check**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: no errors.

- [ ] **Step 4: Prisma validate**

```bash
cd backend && npx prisma validate
```

Expected: `The schema at ... is valid 🚀`

- [ ] **Step 5: Build backend**

```bash
npm run build:back
```

Expected: exits 0, `backend/dist/` updated.

- [ ] **Step 6: Build frontend**

```bash
npm run build:front
```

Expected: exits 0, `frontend/dist/` updated. Vite prints bundle stats with no errors.

- [ ] **Step 7: Final commit (if any outstanding changes)**

```bash
git status
```

If clean, nothing to do. All changes should be in the previous commits.

---

## Self-Review Checklist

- [x] **#1 Price filtering by customer:** Schema (Task 2) ✓, Backend service/schema/controller (Task 3) ✓, Prices.tsx customer selector + filter (Task 4) ✓, Invoices.tsx useEffect by customerId + no-prices message (Task 6) ✓
- [x] **#2 Remove Preview + Delete:** Task 5, Step 4 ✓
- [x] **#3 Force delete → 🗑️:** Task 5, Step 4 (in actions block after) ✓
- [x] **#4 Column order:** Already correct order; covered by headers (#6) ✓
- [x] **#5 Default unit 'درب':** Task 5, Step 1 (4 occurrences) ✓
- [x] **#6 Column headers:** Task 5, Steps 2-3 ✓
- [x] **Dead code removal:** `deleting` state, `DeleteInvoiceConfirm` usage + function — Task 5, Steps 4a-4d ✓
- [x] **No fallback:** Price useEffect returns early with `setPrices([])` when no customer or PURCHASE ✓
- [x] **Existing prices migration:** Admin maps via updated Prices.tsx UI (customer selector in edit form) ✓
- [x] **Git setup:** Task 1 ✓
- [x] **Build validation:** Task 7 ✓
