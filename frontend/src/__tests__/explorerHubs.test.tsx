// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../api/client', () => ({
  api: { get: vi.fn() },
  errorMessage: (e: unknown) => String(e),
}));
import { api } from '../api/client';
import CustomerHub from '../components/explorer/hubs/CustomerHub';
import type { EntityHubProps } from '../components/explorer/hubs/hubTypes';

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
  return render(<MemoryRouter><CustomerHub {...props} /></MemoryRouter>);
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
