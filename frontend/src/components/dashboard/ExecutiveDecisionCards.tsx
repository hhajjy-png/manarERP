export interface DecisionCard {
  id: string;
  title: string;
  value: string;
  explanation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedAction: string;
  relatedId?: number;
  relatedType?: 'CUSTOMER' | 'CONTRACT';
  amount?: number;
}

const PRI_COLOR = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#10B981' };
const PRI_BG    = { HIGH: 'rgba(239,68,68,0.08)', MEDIUM: 'rgba(245,158,11,0.08)', LOW: 'rgba(16,185,129,0.08)' };
const PRI_LABEL = { HIGH: 'أولوية عالية', MEDIUM: 'أولوية متوسطة', LOW: 'أولوية منخفضة' };

const CARD_ICONS: Record<string, string> = {
  'dc-highest-outstanding':   '💰',
  'dc-largest-profit':        '📈',
  'dc-largest-loss':          '📉',
  'dc-needs-invoicing':       '🧾',
  'dc-weak-collections':      '⚠️',
  'dc-top-expense-project':   '💸',
  'dc-no-recent-payment':     '🕐',
  'dc-top-revenue':           '⭐',
};

interface Props { cards: DecisionCard[] }

export default function ExecutiveDecisionCards({ cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <div>
      <h3 style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>
        🃏 بطاقات القرار التنفيذي
      </h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 14,
      }}>
        {cards.map(card => {
          const color = PRI_COLOR[card.priority];
          const bg    = PRI_BG[card.priority];
          const icon  = CARD_ICONS[card.id] ?? '📋';
          return (
            <div key={card.id} style={{
              background: 'var(--db-card)',
              border: `1px solid ${color}44`,
              borderTop: `3px solid ${color}`,
              borderRadius: 'var(--db-radius)',
              padding: '16px',
              display: 'flex', flexDirection: 'column', gap: 8,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 18 }}>{icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--db-text)' }}>{card.title}</span>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, color,
                  background: bg, padding: '2px 8px', borderRadius: 10,
                  whiteSpace: 'nowrap',
                }}>{PRI_LABEL[card.priority]}</span>
              </div>

              {/* Value */}
              <div style={{ fontSize: 22, fontWeight: 800, color, fontFamily: 'monospace' }}>{card.value}</div>

              {/* Explanation */}
              <div style={{ fontSize: 12, color: 'var(--db-muted)', lineHeight: 1.5 }}>{card.explanation}</div>

              {/* Divider */}
              <div style={{ borderTop: '1px solid var(--db-border)', paddingTop: 8, marginTop: 2 }}>
                <div style={{ fontSize: 11, color: '#60A5FA', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                  <span style={{ flexShrink: 0 }}>💡</span>
                  <span>{card.recommendedAction}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
