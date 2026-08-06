import { useNavigate } from 'react-router-dom';
import PrivateAmount from '../PrivateAmount';
import { Button, Drawer, ErrorBanner, SkeletonRows, StatusChip } from '../explorer/ExplorerKit';
import { handoffToModule } from '../../lib/drilldownHandoff';
import { useT } from '../../lib/i18n';
import { CollectionInvoiceTable } from './CollectionInvoiceList';
import { useCollectionDrilldown } from './useCollectionDrilldown';
import type { CollectionDrilldownRequest, CollectionFilters } from './collectionTypes';

/* ════════════════════════════════════════════════════════════════════════════
   درج التفصيل — **نفس نظام الدرج المعتمد** (`ExplorerKit.Drawer`) بلا أي تصميم
   جديد: نفس الغطاء، نفس فخّ التركيز، نفس الترويسة والتذييل.

   المحتوى هو نفسه جسم توسيع الصفوف (`CollectionInvoiceList`)، فالمستخدم يرى
   البنية ذاتها سواء وسّع صفًّا داخل الجدول أو ضغط على مبلغ: فاتورة ⇐ عميل ⇐
   مشروع ⇐ خطّ زمن التحصيلات ⇐ الرصيد بعد كل دفعة ⇐ أيام التحصيل ⇐ الحالة.

   زرّ التذييل يفتح مستعرض الفواتير بنفس تصفية العميل عبر `drilldownHandoff`
   القائمة — لا آلية تسليم ثانية.
   ════════════════════════════════════════════════════════════════════════════ */

interface CollectionDrawerProps {
  request: CollectionDrilldownRequest;
  filters: CollectionFilters;
  onClose: () => void;
}

export default function CollectionDrawer({ request, filters, onClose }: CollectionDrawerProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const { title, subtitle, ...scope } = request;
  const { data, loading, errorKey } = useCollectionDrilldown(filters, scope);

  function openInvoices() {
    handoffToModule({
      kind: 'collections',
      customerId: scope.dimension === 'customer' ? scope.dimensionId || undefined : filters.customerId,
    });
    navigate('/invoices');
  }

  return (
    <Drawer
      title={t('ca.drill.title')}
      onClose={onClose}
      hero={
        <div className="xpl-drawer-hero">
          <div className="xpl-drawer-hero-icon">
            <span className="material-symbols-outlined" aria-hidden="true">receipt_long</span>
          </div>
          <div className="xpl-drawer-hero-body">
            <span className="xpl-drawer-hero-title">{title}</span>
            <span className="xpl-drawer-hero-sub">
              {subtitle ? `${subtitle} · ` : ''}
              {data ? t('ca.drill.invoice_count', { count: data.count }) : t('msg.loading')}
            </span>
            {data && (
              <div className="ca-drawer-chips">
                <StatusChip tone="blue" icon="receipt_long">
                  <PrivateAmount value={data.totals.invoiced} level={1} />
                </StatusChip>
                <StatusChip tone="green" icon="task_alt">
                  <PrivateAmount value={data.totals.collected} level={1} />
                </StatusChip>
                <StatusChip tone="orange" icon="pending_actions">
                  <PrivateAmount value={data.totals.outstanding} level={1} />
                </StatusChip>
              </div>
            )}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="primary" icon="open_in_new" onClick={openInvoices}>
            {t('ca.drill.open_invoices')}
          </Button>
          <Button variant="ghost" icon="close" onClick={onClose}>
            {t('action.close')}
          </Button>
        </>
      }
    >
      {errorKey && <ErrorBanner>{t(errorKey)}</ErrorBanner>}
      {loading && <SkeletonRows rows={6} withAvatar={false} />}
      {!loading && !errorKey && <CollectionInvoiceTable data={data} maxRows={12} />}
    </Drawer>
  );
}
