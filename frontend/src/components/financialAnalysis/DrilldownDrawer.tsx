import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import PrivateAmount from '../PrivateAmount';
import { Drawer, Button, ErrorBanner, SkeletonRows, EmptyState, StatusChip } from '../explorer/ExplorerKit';
import { formatDate } from '../../lib/date';
import { handoffToModule } from '../../lib/drilldownHandoff';
import { useT } from '../../lib/i18n';
import type { DrilldownRequest, DrilldownResult } from './analysisTypes';

/* ════════════════════════════════════════════════════════════════════════════
   نافذة التنقّل التفصيلي (Drill-down).

   أي قيمة مالية في الصفحة تفتح هذه النافذة على **سجلاتها الفعلية**، مُستعلَمة
   بنفس شروط التقرير حرفيًا (نفس المدى، نفس قواعد الإيراد/المصروف/التحصيل)، فلا
   يمكن أن يختلف مجموع النافذة عن الرقم الذي فُتحت منه.

   ثم يفتح زرّ الأسفل المستعرض الكامل للوحدة (فواتير / مصروفات) مع تطبيق الفلاتر
   نفسها هناك — انظر `lib/drilldownHandoff.ts`.
   ════════════════════════════════════════════════════════════════════════════ */

const KIND_META: Record<DrilldownRequest['kind'], { icon: string; route: string; openKey: string }> = {
  revenue: { icon: 'receipt_long', route: '/invoices', openKey: 'fac.drill.open_invoices' },
  expenses: { icon: 'payments', route: '/expenses', openKey: 'fac.drill.open_expenses' },
  collections: { icon: 'account_balance_wallet', route: '/invoices', openKey: 'fac.drill.open_collections' },
};

interface DrilldownDrawerProps {
  request: DrilldownRequest;
  /** نطاق الفترة النشط — يُرسَل كما هو فيبقى التفصيل داخل نفس الفلتر. */
  range: { from?: string; to?: string };
  onClose: () => void;
}

export default function DrilldownDrawer({ request, range, onClose }: DrilldownDrawerProps) {
  const { t } = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<DrilldownResult | null>(null);
  const [loading, setLoading] = useState(true);
  /** مفتاح الرسالة لا نصّها — يُخرج `t` غير المستقرّة من اعتماديات التأثير. */
  const [errorKey, setErrorKey] = useState('');

  // قيمٌ أوّلية فقط في مصفوفة الاعتماديات — لا كائن `request` ولا `range` ولا `t`.
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorKey('');
    api
      .get<{ data: DrilldownResult }>('/financial-analysis/drilldown', {
        signal: controller.signal,
        params: {
          kind: request.kind,
          from: range.from,
          to: range.to,
          month: request.month,
          category: request.category,
          customerId: request.customerId,
        },
      })
      .then((r) => setData(r.data.data))
      .catch(() => {
        if (!controller.signal.aborted) setErrorKey('fac.drill.error');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [request.kind, request.month, request.category, request.customerId, range.from, range.to]);

  const meta = KIND_META[request.kind];

  function openModule() {
    handoffToModule({ kind: request.kind, category: request.category, customerId: request.customerId });
    navigate(meta.route);
  }

  return (
    <Drawer
      title={t('fac.drill.title')}
      onClose={onClose}
      hero={
        <div className="xpl-drawer-hero">
          <div className="xpl-drawer-hero-icon">
            <span className="material-symbols-outlined" aria-hidden="true">{meta.icon}</span>
          </div>
          <div className="xpl-drawer-hero-body">
            <span className="xpl-drawer-hero-title">{request.title}</span>
            <span className="xpl-drawer-hero-sub">
              {data ? t('fac.drill.record_count', { count: data.count }) : t('msg.loading')}
            </span>
            {data && (
              <div style={{ marginTop: 4 }}>
                <StatusChip tone="indigo" icon="functions">
                  <PrivateAmount value={data.total} level={1} />
                </StatusChip>
              </div>
            )}
          </div>
        </div>
      }
      footer={
        <>
          <Button variant="primary" icon="open_in_new" onClick={openModule}>
            {t(meta.openKey)}
          </Button>
          <Button variant="ghost" icon="close" onClick={onClose}>
            {t('action.close')}
          </Button>
        </>
      }
    >
      {errorKey && <ErrorBanner>{t(errorKey)}</ErrorBanner>}
      {loading && <SkeletonRows rows={6} withAvatar={false} />}

      {!loading && !errorKey && data && data.rows.length === 0 && (
        <EmptyState icon="search_off" title={t('msg.empty')} message={t('fac.drill.empty')} tone="neutral" />
      )}

      {!loading && !errorKey && data && data.rows.length > 0 && (
        <>
          {data.truncated && (
            <p className="fac-drill-note">{t('fac.drill.truncated', { shown: data.rows.length, total: data.count })}</p>
          )}
          {/* نفس عقد الجداول: صنف محاذاة على الرأس والخليّة معًا، وعمود «البيان»
              وحده قابل للاقتطاع — الأوصاف مفتوحة الطول وكانت تُخرج تمريرًا أفقيًا
              داخل درج ضيّق. المبلغ والتاريخ يبقيان بعرض محتواهما كاملًا. */}
          <div className="xpl-table-wrap">
            <table className="xpl-table xpl-table--zebra fac-table fac-table--compact fac-table--truncating">
              <thead>
                <tr>
                  <th scope="col" className="fac-al-start">{t('fac.drill.col.date')}</th>
                  <th scope="col" className="fac-al-start">{t('fac.drill.col.reference')}</th>
                  <th scope="col" className="fac-al-start fac-truncate">{t('fac.drill.col.label')}</th>
                  <th scope="col" className="fac-al-end">{t('fac.drill.col.amount')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="fac-al-start fac-mono">{formatDate(r.date)}</td>
                    <td className="fac-al-start fac-mono">{r.reference || '—'}</td>
                    <td className="fac-al-start fac-truncate" title={r.label || undefined}>{r.label || '—'}</td>
                    <td className="fac-al-end fac-money">
                      <PrivateAmount value={r.amount} level={1} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Drawer>
  );
}
