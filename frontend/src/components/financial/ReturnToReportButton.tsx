import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { FinancialDrillDownState } from './DrillDownLink';

export function ReturnToReportButton() {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const highlight      = searchParams.get('highlight');

  const returnState = useMemo((): FinancialDrillDownState | null => {
    try {
      const raw = sessionStorage.getItem('app.drilldown.returnState');
      return raw ? (JSON.parse(raw) as FinancialDrillDownState) : null;
    } catch {
      return null;
    }
  }, []);

  if (!highlight || !returnState) return null;

  function handleReturn() {
    // M5 FIX: build full URL from sessionStorage params — survives page refresh
    const params = new URLSearchParams();
    params.set('tab', returnState!.tab);
    if (returnState!.subTab)     params.set('subTab',     returnState!.subTab);
    if (returnState!.entityType) params.set('entityType', returnState!.entityType);
    if (returnState!.entityId)   params.set('entityId',   String(returnState!.entityId));
    if (returnState!.accountId)  params.set('accountId',  String(returnState!.accountId));
    if (returnState!.fromDate)   params.set('fromDate',   returnState!.fromDate);
    if (returnState!.toDate)     params.set('toDate',     returnState!.toDate);
    if (returnState!.mode)       params.set('mode',       returnState!.mode);
    sessionStorage.removeItem('app.drilldown.returnState');
    navigate(`${returnState!.returnTo}?${params.toString()}`, {
      state: { scrollY: returnState!.scrollY },
    });
  }

  return (
    <button onClick={handleReturn} className="return-to-report-btn" type="button">
      ← العودة إلى {returnState.reportLabel ?? 'التقرير'}
    </button>
  );
}
