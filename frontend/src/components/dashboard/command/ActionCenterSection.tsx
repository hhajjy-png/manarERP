import { useNavigate } from 'react-router-dom';
import { Skeleton } from '../Skeleton';
import type { DecisionCard } from './types';

const PRI_COLOR: Record<DecisionCard['priority'], string> = {
  HIGH: 'var(--db-red)',
  MEDIUM: 'var(--db-amber)',
  LOW: 'var(--db-green)',
};
const PRI_LABEL: Record<DecisionCard['priority'], string> = {
  HIGH: 'عاجل',
  MEDIUM: 'مهم',
  LOW: 'متابعة',
};
const PRI_RANK: Record<DecisionCard['priority'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

// Existing routes only — no new routes are introduced.
const RELATED_ROUTE: Record<string, string> = {
  CUSTOMER: '/customers',
  CONTRACT: '/contracts',
};

/**
 * "يحتاج إجراءً الآن" — the real action list from decisionCenter.decisionCards
 * (highest outstanding, weak collections, needs invoicing, loss-making, etc.).
 * Sorted by priority. Each item can jump to the related existing page. Empty state
 * shown when there is nothing to act on.
 */
export default function ActionCenterSection({
  cards,
  loading,
}: {
  cards: DecisionCard[];
  loading: boolean;
}) {
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="db-ac">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} height={64} style={{ borderRadius: 10 }} />
        ))}
      </div>
    );
  }

  if (!cards.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">✅</div>
        <div className="db-empty-text">لا توجد إجراءات عاجلة الآن — الوضع تحت السيطرة</div>
      </div>
    );
  }

  const ordered = [...cards].sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority]);

  return (
    <div className="db-ac">
      {ordered.map((card) => {
        const color = PRI_COLOR[card.priority];
        const route = card.relatedType ? RELATED_ROUTE[card.relatedType] : undefined;
        return (
          <div key={card.id} className="db-ac-item" style={{ ['--ac-color' as string]: color }}>
            <span className="db-ac-dot" />
            <div className="db-ac-body">
              <div className="db-ac-title-row">
                <span className="db-ac-title">{card.title}</span>
                <span className="db-ac-pri" style={{ color, background: `color-mix(in srgb, ${color} 11%, transparent)` }}>{PRI_LABEL[card.priority]}</span>
              </div>
              {card.explanation && <div className="db-ac-explain">{card.explanation}</div>}
              <div className="db-ac-meta">
                {card.value && <span className="db-ac-value">{card.value}</span>}
                {card.recommendedAction && <span className="db-ac-hint">{card.recommendedAction}</span>}
              </div>
            </div>
            {route && (
              <button type="button" className="db-ac-btn" onClick={() => navigate(route)}>
                عرض
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
