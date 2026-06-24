import { normalizeMoney } from './balance.utils';

export interface AgingBucket {
  key: string;
  min: number;
  max: number;
  label: string;
}

export const DEFAULT_AGING_BUCKETS: AgingBucket[] = [
  { key: 'current',  min: -Infinity, max: -1,      label: 'جاري'       },
  { key: '0_30',     min: 0,         max: 30,       label: '0–30 يوم'   },
  { key: '31_60',    min: 31,        max: 60,       label: '31–60 يوم'  },
  { key: '61_90',    min: 61,        max: 90,       label: '61–90 يوم'  },
  { key: '91_120',   min: 91,        max: 120,      label: '91–120 يوم' },
  { key: 'over_120', min: 121,       max: Infinity, label: '+120 يوم'   },
];

export type AgingBuckets = Record<string, number> & { total: number };

export function calculateAgingBuckets(
  invoices: { dueDate: Date; outstandingAmount: number }[],
  asOfDate: Date,
  buckets: AgingBucket[] = DEFAULT_AGING_BUCKETS
): AgingBuckets {
  const result: AgingBuckets = { total: 0 };
  for (const b of buckets) result[b.key] = 0;

  for (const inv of invoices) {
    if (inv.outstandingAmount <= 0) continue;
    const daysOverdue = differenceInDays(asOfDate, inv.dueDate);
    const bucket = buckets.find(b => daysOverdue >= b.min && daysOverdue <= b.max);
    if (bucket) {
      result[bucket.key] = normalizeMoney(result[bucket.key] + inv.outstandingAmount);
      result.total = normalizeMoney(result.total + inv.outstandingAmount);
    }
  }
  return result;
}

function differenceInDays(dateA: Date, dateB: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((dateA.getTime() - dateB.getTime()) / msPerDay);
}
