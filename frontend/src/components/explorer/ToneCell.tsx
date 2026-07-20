import { ReactNode } from 'react';
import './toneCell.css';

/**
 * Canonical soft status/remaining-period cell (Employee Table Executive Visual
 * Polish Pack v1.1 is the approved reference implementation). Every explorer
 * table's status or remaining-period column renders through this ONE component
 * so "healthy/warning/expired" reads identically everywhere — never a second,
 * independently-styled green/amber/red system.
 *
 * Presentation only: callers supply the already-computed tone (from their own,
 * unchanged business logic) and the content to display; this component owns
 * only how it looks.
 */
export type CellTone = 'green' | 'amber' | 'orange' | 'red';

export function ToneCell({ tone, children }: { tone: CellTone | null; children: ReactNode }) {
  return (
    <span className={tone ? `xpl-tone-cell xpl-tone--${tone}` : 'xpl-tone-cell'}>
      <span className={tone ? 'xpl-tone-text' : 'xpl-tone-text xpl-tone-text--muted'}>{children}</span>
    </span>
  );
}
