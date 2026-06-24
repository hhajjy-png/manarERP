import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ArAgingRow, ApAgingRow } from '../../types/financial.types';
import type { FinancialDrillDownState } from './DrillDownLink';

type AgingRow = ArAgingRow | ApAgingRow;

const BUCKETS = [
  { key: 'current',  label: 'جاري'      },
  { key: '0_30',     label: '0–30'      },
  { key: '31_60',    label: '31–60'     },
  { key: '61_90',    label: '61–90'     },
  { key: '91_120',   label: '91–120'    },
  { key: 'over_120', label: '+120 يوم'  },
] as const;

type BucketKey = (typeof BUCKETS)[number]['key'] | 'total';

function fmt(n: number) {
  return n ? n.toLocaleString('ar-KW', { minimumFractionDigits: 3 }) : '';
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
  const navigate    = useNavigate();
  const [sortField, setSortField] = useState<BucketKey>('total');
  const [sortDir,   setSortDir]   = useState<'asc' | 'desc'>('desc');

  function toggleSort(field: BucketKey) {
    if (sortField === field) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = (a as Record<string, unknown>)[sortField] as number ?? 0;
    const bv = (b as Record<string, unknown>)[sortField] as number ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

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

  function sortIcon(field: BucketKey) {
    if (sortField !== field) return '';
    return sortDir === 'asc' ? ' ↑' : ' ↓';
  }

  if (rows.length === 0) {
    return <p className="fc-empty">لا توجد بيانات مديونية بالمعايير المحددة.</p>;
  }

  return (
    <div className="aging-table-container table-responsive" dir="rtl">
      {type === 'ap' && (
        <div className="aging-note">
          ملاحظة: يعرض أعمار الذمم فواتير المشتريات فقط. للرصيد الشامل بما يتضمن المصروفات، راجع كشف الحساب.
        </div>
      )}
      <table className="financial-table aging-table">
        <thead>
          <tr>
            <th>الكود</th>
            <th>الاسم</th>
            {BUCKETS.map(b => (
              <th
                key={b.key}
                className="sortable num"
                onClick={() => toggleSort(b.key)}
              >
                {b.label}{sortIcon(b.key)}
              </th>
            ))}
            <th className="sortable num" onClick={() => toggleSort('total')}>
              الإجمالي{sortIcon('total')}
            </th>
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
                {BUCKETS.map(b => {
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
