interface Card {
  label: string;
  value?: number;
  variant?: 'neutral' | 'green' | 'red' | 'blue';
}

interface Props { cards: Card[]; }

function fmt(n?: number) {
  if (n === undefined || n === null) return '—';
  return n.toLocaleString('ar-KW', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

export function SummaryCards({ cards }: Props) {
  return (
    <div className="financial-summary-cards">
      {cards.map((c, i) => (
        <div key={i} className={`summary-card ${c.variant ?? 'neutral'}`}>
          <div className="card-label">{c.label}</div>
          <div className="card-value">
            {fmt(c.value)} <span className="currency">د.ك</span>
          </div>
        </div>
      ))}
    </div>
  );
}
