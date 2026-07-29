// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ROUTER_FUTURE } from './helpers/router';

vi.mock('../api/client', () => ({
  api: { get: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
import { api } from '../api/client';
import CustomerHub from '../components/explorer/hubs/CustomerHub';
import EquipmentHub from '../components/explorer/hubs/EquipmentHub';
import { buildInfoItems, type EntityHubProps } from '../components/explorer/hubs/hubTypes';

const cfg = {
  key: 'customers', title: 'nav.customers', explorerIcon: 'groups',
  columns: [{ key: 'type', label: 'col.type', render: () => 'خاص' }],
  fields: [
    { name: 'code', label: 'field.code' },
    { name: 'type', label: 'field.type' },
    { name: 'phone', label: 'field.phone' },
  ],
} as any;

function renderHub(over: Partial<EntityHubProps> = {}) {
  const props: EntityHubProps = {
    entity: { id: 1, name: 'عميل تجريبي', code: 'C-1', phone: '', type: 'PRIVATE' },
    cfg, onEdit: vi.fn(), onDelete: vi.fn(), canUpdate: true, canDelete: true, busy: false,
    ...over,
  };
  return render(<MemoryRouter future={ROUTER_FUTURE}><CustomerHub {...props} /></MemoryRouter>);
}

describe('CustomerHub', () => {
  beforeEach(() => { (api.get as any).mockReset(); });

  it('hides Related/Activity when all fetches return empty', async () => {
    (api.get as any).mockResolvedValue({ data: { data: [] } });
    renderHub();
    expect(await screen.findByText('عميل تجريبي')).toBeInTheDocument(); // header title
    await waitFor(() => {
      expect(screen.queryByText('أحدث الفواتير')).toBeNull();
      expect(screen.queryByText('العقود')).toBeNull();
    });
  });

  it('renders recent invoices when the invoices endpoint returns rows', async () => {
    (api.get as any).mockImplementation((url: string) => {
      if (url === '/invoices')
        return Promise.resolve({ data: { data: { data: [{ id: 9, invoiceNumber: 'INV-9', issueDate: '2026-07-07', total: 5, status: 'UNPAID' }] } } });
      return Promise.resolve({ data: { data: [] } });
    });
    renderHub();
    expect(await screen.findByText('INV-9')).toBeInTheDocument();
  });

  it('does not crash when a fetch rejects (shows no thrown error)', async () => {
    (api.get as any).mockRejectedValue(new Error('boom'));
    renderHub();
    expect(await screen.findByText('عميل تجريبي')).toBeInTheDocument();
  });
});

describe('buildInfoItems', () => {
  it('flags English-name fields as LTR and leaves the rest plain', () => {
    const items = buildInfoItems(
      { ...cfg, fields: [{ name: 'nameEn', label: 'field.customer_name_en' }, { name: 'phone', label: 'field.phone' }] } as any,
      { nameEn: 'National Contracting Co.', phone: '99887766' },
      (k) => k,
    );
    expect(items.find((i) => i.value === 'National Contracting Co.')?.ltr).toBe(true);
    expect(items.find((i) => i.value === '99887766')?.ltr).toBe(false);
  });
});

const eqCfg = {
  key: 'equipment', title: 'nav.equipment', explorerIcon: 'construction',
  columns: [{ key: 'status', label: 'col.status', render: () => 'تعمل' }],
  fields: [
    { name: 'code', label: 'field.code' },
    { name: 'type', label: 'field.type' },
    { name: 'plateNumber', label: 'field.plate' },
  ],
} as any;

describe('EquipmentHub', () => {
  beforeEach(() => { (api.get as any).mockReset(); });

  it('hides Related/Activity when maintenance & fuel are empty', async () => {
    (api.get as any).mockResolvedValue({ data: { data: [] } });
    render(<MemoryRouter future={ROUTER_FUTURE}><EquipmentHub
      entity={{ id: 5, code: 'EQ-5', type: 'شاحنة', status: 'WORKING', registration: { remainingText: '183 يوم', expiry: '2027-01-06' } }}
      cfg={eqCfg} onEdit={vi.fn()} onDelete={vi.fn()} canUpdate canDelete busy={false}
    /></MemoryRouter>);
    // buildInfoItems omits code/type/plateNumber here since they're already shown
    // in the header title/subtitle, so "EQ-5" is unique — but scope to the header
    // title element anyway to keep the assertion resilient to future info-grid fields.
    expect(await screen.findByText('EQ-5', { selector: '.xpl-drawer-headcard-title' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('سجل الصيانة')).toBeNull();
      expect(screen.queryByText('سجل الوقود')).toBeNull();
    });
  });

  it('renders maintenance records when the endpoint returns rows', async () => {
    // Envelope verified against Maintenance.tsx load(): `res.data.data ?? []` is
    // the plain array (findMany result wrapped once by successResponse), not a
    // paginated `{ data: { data: [] } }` shape.
    (api.get as any).mockImplementation((url: string) => {
      if (url.includes('/maintenance/records'))
        return Promise.resolve({ data: { data: [{ id: 3, type: 'زيت', date: '2026-06-17', status: 'DONE' }] } });
      return Promise.resolve({ data: { data: [] } });
    });
    render(<MemoryRouter future={ROUTER_FUTURE}><EquipmentHub
      entity={{ id: 5, code: 'EQ-5', status: 'WORKING', registration: { remainingText: '183 يوم' } }}
      cfg={eqCfg} onEdit={vi.fn()} onDelete={vi.fn()} canUpdate canDelete busy={false}
    /></MemoryRouter>);
    expect(await screen.findByText('سجل الصيانة')).toBeInTheDocument();
  });
});
