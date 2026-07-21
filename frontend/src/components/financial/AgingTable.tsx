import { useNavigate } from 'react-router-dom';
import type { ArAgingRow, ApAgingRow } from '../../types/financial.types';
import type { FinancialDrillDownState } from './DrillDownLink';
import { fcCurrency } from './financialLabels';
import SortableHeader from '../SortableHeader';
import { useTableSort } from '../../hooks/useTableSort';
import { sortRowsClient } from '../../lib/clientSort';
import { useT } from '../../lib/i18n';

type AgingRow = ArAgingRow | ApAgingRow;

const BUCKETS: { key: string; labelKey: string | null }[] = [
  { key: 'current',  labelKey: 'fc.aging.current' },
  { key: '0_30',     labelKey: null               },
  { key: '31_60',    labelKey: null               },
  { key: '61_90',    labelKey: null               },
  { key: '91_120',   labelKey: null               },
  { key: 'over_120', labelKey: 'fc.aging.over_120' },
];

// أرقام ومدى (0–30، 31–60…) بلا حروف عربية — عرضها ثابت بلا ترجمة.
const BUCKET_RAW_LABEL: Record<string, string> = {
  '0_30':   '0–30',
  '31_60':  '31–60',
  '61_90':  '61–90',
  '91_120': '91–120',
};

function fmt(n: number) {
  return n ? fcCurrency(n) : '';
}

function bucketClass(key: string, amount: number): string {
  if (!amount) return '';
  if (key === 'over_120' || key === '91_120') return 'aging-critical';
  if (key === '61_90')  return 'aging-warning';
  if (key === '31_60')  return 'aging-caution';
  return '';
}

interface Props {
  rows:         AgingRow[];
  type:         'ar' | 'ap';
  currentState: FinancialDrillDownState;
}

export function AgingTable({ rows, type, currentState }: Props) {
  const navigate = useNavigate();
  const { t } = useT();
  const buckets = BUCKETS.map(b => ({ key: b.key, label: b.labelKey ? t(b.labelKey) : BUCKET_RAW_LABEL[b.key] }));
  // أساس الشبكة الموحّد (كان لهذا الجدول فرز محلي خاص — استُبدل بالتنفيذ الواحد).
  // البيانات محمَّلة بكاملها بلا ترقيم خادمي → الفرز المحلي فوق المجموعة الكاملة صحيح.
  // الافتراضي التاريخي للجدول (الإجمالي تنازليًا) محفوظ عندما لا يوجد عمود نشط.
  const sort = useTableSort(`aging-${type}`);
  const sorted = sortRowsClient(
    rows,
    sort.sortBy ?? 'total',
    sort.sortBy ? sort.sortDir : 'desc',
    (row, key) => ((row as Record<string, unknown>)[key] as number) ?? 0,
  );

  function handleEntityClick(row: AgingRow) {
    const entityType = type === 'ar' ? 'customer' : 'supplier';
    const entityId   = type === 'ar' ? (row as ArAgingRow).customerId : (row as ApAgingRow).supplierId;
    navigate(`/financial?tab=statement&entityType=${entityType}&entityId=${entityId}`);
  }

  function handleBucketClick(row: AgingRow, bucketKey: string, amount: number) {
    if (!amount) return;
    sessionStorage.setItem('app.drilldown.returnState', JSON.stringify({
      ...currentState,
      scrollY: window.scrollY,
    }));
    const entityId = type === 'ar' ? (row as ArAgingRow).customerId : (row as ApAgingRow).supplierId;
    const paramKey = type === 'ar' ? 'customerId' : 'supplierId';
    navigate(`/invoices?${paramKey}=${entityId}&agingBucket=${bucketKey}&status=UNPAID`);
  }

  const nameKey = type === 'ar' ? 'customerName' : 'supplierName';
  const codeKey = type === 'ar' ? 'customerCode' : 'supplierCode';

  if (rows.length === 0) {
    return <p className="fc-empty">{t('fc.msg.no_aging_data')}</p>;
  }

  return (
    <div className="aging-table-container table-responsive">
      {type === 'ap' && (
        <div className="aging-note">
          {t('fc.aging.ap_note')}
        </div>
      )}
      <table className="financial-table aging-table">
        <thead>
          <tr>
            <th>{t('col.acc.code')}</th>
            <th>{t('col.fullname')}</th>
            {buckets.map(b => (
              <SortableHeader
                key={b.key}
                label={b.label}
                title={b.label}
                className="num"
                state={sort.getState(b.key)}
                onToggle={() => sort.toggle(b.key)}
              />
            ))}
            <SortableHeader
              label={t('msg.total')}
              title={t('msg.total')}
              className="num aging-total-col"
              state={sort.getState('total')}
              onToggle={() => sort.toggle('total')}
            />
          </tr>
        </thead>
        <tbody>
          {sorted.map(row => {
            const name = (row as Record<string, unknown>)[nameKey] as string;
            const code = (row as Record<string, unknown>)[codeKey] as string;
            return (
              <tr key={row.id}>
                <td>{code}</td>
                <td>
                  <button className="aging-entity-link" onClick={() => handleEntityClick(row)}>
                    {name}
                  </button>
                </td>
                {buckets.map(b => {
                  const amount = (row as Record<string, unknown>)[b.key] as number ?? 0;
                  return (
                    <td key={b.key} className={`num ${bucketClass(b.key, amount)}`}>
                      {amount > 0 ? (
                        <button
                          className="aging-bucket-link"
                          onClick={() => handleBucketClick(row, b.key, amount)}
                        >
                          {fmt(amount)}
                        </button>
                      ) : ''}
                    </td>
                  );
                })}
                <td className="num aging-total-col">{fmt(row.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
