import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useT } from '../../../lib/i18n';
import { money } from '../../../config/modules';
import { formatDate } from '../../../lib/date';
import {
  DrawerHeaderCard, DrawerQuickActions, DrawerInfoGrid, DrawerRelated, DrawerActivity,
  type DrawerKpi, type QuickAction, type RelatedItem, type ActivityItem,
} from '../ExplorerKit';
import { buildInfoItems, type EntityHubProps } from './hubTypes';

interface CustomerStats {
  count?: number;
  totalRemaining?: number;
}

export default function CustomerHub({ entity, cfg, onEdit, onDelete, canUpdate, canDelete, busy }: EntityHubProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const id = entity.id as number;

  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setStats(null);
    setBalance(null);
    setInvoices([]);
    setContracts([]);
    setActivity([]);

    // Endpoints mirrored 1:1 from existing callers:
    //  - /invoices/stats?customerId=  → Invoices.tsx (res.data.data is the stats object)
    //  - /statements/customers/:id    → api/statements.ts getCustomerStatement (res.data.data is StatementResult)
    //  - /invoices?customerId=        → Invoices.tsx contract lookup (res.data.data.data is the paginated array)
    //  - /contracts?customerId=       → Invoices.tsx contract lookup (res.data.data.data is the paginated array)
    Promise.allSettled([
      api.get('/invoices/stats', { params: { customerId: id } }),
      api.get(`/statements/customers/${id}`),
      api.get('/invoices', { params: { customerId: id, pageSize: 5 } }),
      api.get('/contracts', { params: { customerId: id, pageSize: 5 } }),
    ]).then(([statsRes, stmtRes, invRes, ctrRes]) => {
      if (!alive) return;

      if (statsRes.status === 'fulfilled') {
        const d = statsRes.value?.data?.data;
        if (d && !Array.isArray(d)) setStats({ count: d.count, totalRemaining: d.totalRemaining });
      }

      if (stmtRes.status === 'fulfilled') {
        const d = stmtRes.value?.data?.data;
        if (d && !Array.isArray(d)) {
          setBalance(d.summary?.closingBalance ?? null);
          const entries = Array.isArray(d.entries) ? d.entries : [];
          setActivity(entries.slice(0, 5).map((e: any): ActivityItem => ({
            key: String(e.id),
            icon: e.referenceType === 'PAYMENT' ? 'payments' : e.referenceType === 'EXPENSE' ? 'receipt_long' : 'description',
            title: e.description || e.reference,
            meta: e.reference,
            timestamp: formatDate(e.date),
          })));
        }
      }

      if (invRes.status === 'fulfilled') {
        const list = invRes.value?.data?.data?.data;
        if (Array.isArray(list)) setInvoices(list);
      }

      if (ctrRes.status === 'fulfilled') {
        const list = ctrRes.value?.data?.data?.data;
        if (Array.isArray(list)) setContracts(list);
      }

      setLoading(false);
    });

    return () => { alive = false; };
  }, [id]);

  const kpis: DrawerKpi[] = [
    ...(balance != null ? [{ label: t('hub.customer.kpi_balance'), value: money(balance) }] : []),
    ...(stats?.count != null ? [{ label: t('hub.customer.kpi_invoice_count'), value: stats.count }] : []),
    ...(stats?.totalRemaining != null ? [{ label: t('lbl.inv.remaining_amount'), value: money(stats.totalRemaining), tone: 'red' as const }] : []),
  ];

  const actions: QuickAction[] = [
    { key: 'statement', icon: 'receipt_long', label: t('hub.customer.action_statement'), onClick: () => navigate(`/financial?tab=statement&entityType=customer&entityId=${id}`) },
    { key: 'new-invoice', icon: 'note_add', label: t('hub.customer.action_new_invoice'), onClick: () => navigate('/invoices') },
    { key: 'add-contract', icon: 'description', label: t('hub.customer.action_new_contract'), onClick: () => navigate('/contracts') },
    ...(canUpdate ? [{ key: 'edit', icon: 'edit', label: t('action.edit'), tone: 'primary' as const, onClick: onEdit }] : []),
    ...(canDelete ? [{ key: 'delete', icon: 'delete', label: t('action.delete'), tone: 'danger' as const, onClick: onDelete, disabled: busy }] : []),
  ];

  const invoiceItems: RelatedItem[] = invoices.map((inv) => ({
    key: String(inv.id),
    icon: 'receipt',
    primary: inv.invoiceNumber ?? inv.number ?? `#${inv.id}`,
    secondary: formatDate(inv.issueDate),
    trailing: money(inv.total),
  }));
  const contractItems: RelatedItem[] = contracts.map((c) => ({
    key: String(c.id), icon: 'description', primary: c.code ?? `#${c.id}`, secondary: formatDate(c.startDate),
  }));

  return (
    <>
      <DrawerHeaderCard
        icon={cfg.explorerIcon ?? 'groups'}
        title={String(entity.name ?? entity.code ?? '')}
        subtitle={entity.code}
        kpis={kpis}
      />
      <DrawerQuickActions actions={actions} />
      <DrawerInfoGrid title={t('nav.customers')} items={buildInfoItems(cfg, entity, t, ['code'])} />
      <DrawerRelated title={t('hub.customer.related_invoices')} loading={loading} items={invoiceItems} />
      <DrawerRelated title={t('search.page.contracts')} loading={loading} items={contractItems} />
      <DrawerActivity loading={loading} items={activity} />
    </>
  );
}
