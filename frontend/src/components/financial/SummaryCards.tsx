import type { ReactNode } from 'react';
import PrivateAmount from '../PrivateAmount';

interface Card {
  label:           string;
  value?:          number;
  formattedValue?: ReactNode;
  variant?:        'neutral' | 'green' | 'red' | 'blue';
}

interface Props { cards: Card[]; }

export function SummaryCards({ cards }: Props) {
  return (
    <div className="financial-summary-cards">
      {cards.map((c, i) => (
        <div key={i} className={`summary-card ${c.variant ?? 'neutral'}`}>
          <div className="card-label">{c.label}</div>
          <div className="card-value">
            {c.formattedValue ?? (
              c.value !== undefined
                ? <PrivateAmount value={c.value} />
                : '—'
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
