import { useEffect, useMemo, useState } from 'react';
import { api } from '../../../api/client';
import { computeCashFlow, buildRevenueDistribution } from './commandData';
import type { CommandData } from './CommandCenter';
import type { ActivityRow, DecisionCenterData } from './types';

/**
 * Fetches the Executive Command Center data from existing endpoints and derives the
 * approved real-data values (cash flow, revenue-by-customer distribution).
 *
 * Both fetches are isolated: a failure resolves to a null/empty result so the main
 * dashboard is never broken by this hook.
 */
export function useDashboardCommandData(
  refreshKey: number,
  periodParams: { fromDate?: string; toDate?: string } = {},
): CommandData {
  const [decisionCenter, setDecisionCenter] = useState<DecisionCenterData | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  const { fromDate, toDate } = periodParams;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    Promise.all([
      // مؤشرات الحركة والذمم اللحظية تتبع الفترة؛ النشاط الحديث يبقى قائمة حالية منفصلة.
      api.get('/executive/decision-center', { params: { fromDate, toDate } }).then((r) => r.data?.data ?? null).catch(() => null),
      api.get('/dashboard/activity', { params: { limit: 8 } }).then((r) => r.data?.data ?? []).catch(() => []),
    ]).then(([dc, act]) => {
      if (cancelled) return;
      setDecisionCenter(dc as DecisionCenterData | null);
      setActivity(Array.isArray(act) ? (act as ActivityRow[]) : []);
      setLoading(false);
    });

    return () => { cancelled = true; };
  }, [refreshKey, fromDate, toDate]);

  const cashFlowThisMonth = useMemo(
    () => (decisionCenter ? computeCashFlow(decisionCenter.financialSummary.thisMonth) : null),
    [decisionCenter],
  );

  const revenueDistribution = useMemo(
    () => (decisionCenter ? buildRevenueDistribution(decisionCenter.financialSummary.topCustomersByRevenue) : []),
    [decisionCenter],
  );

  return { decisionCenter, activity, cashFlowThisMonth, revenueDistribution, loading };
}
