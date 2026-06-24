import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { DrillDownRef } from '../../types/financial.types';

export interface FinancialDrillDownState {
  returnTo:    string;
  reportLabel: string;
  tab:         string;
  subTab?:     string;
  entityType?: string;
  entityId?:   number;
  accountId?:  number;
  fromDate?:   string;
  toDate?:     string;
  mode?:       string;
  page?:       number;
  scrollY?:    number;
}

interface Props {
  drillDown?: DrillDownRef;
  currentState: FinancialDrillDownState;
  children: ReactNode;
}

export function DrillDownLink({ drillDown, currentState, children }: Props) {
  const navigate = useNavigate();

  if (!drillDown?.route) return <span className="drill-down-text">{children}</span>;

  function handleClick() {
    sessionStorage.setItem('app.drilldown.returnState', JSON.stringify({
      ...currentState,
      scrollY: window.scrollY,
    }));
    navigate(`${drillDown!.route}?highlight=${drillDown!.entityId}`);
  }

  return (
    <button onClick={handleClick} className="drill-down-link" type="button">
      {children}
    </button>
  );
}
