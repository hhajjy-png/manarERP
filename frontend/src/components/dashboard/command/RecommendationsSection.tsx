import { Skeleton } from '../Skeleton';
import type { RecommendationV2 } from './types';

const PRI_META: Record<RecommendationV2['priority'], { color: string; icon: string; label: string }> = {
  HIGH:   { color: '#EF4444', icon: '⚠️', label: 'أولوية عالية' },
  MEDIUM: { color: '#F59E0B', icon: '📌', label: 'أولوية متوسطة' },
  LOW:    { color: '#10B981', icon: '💡', label: 'للمتابعة' },
};
const PRI_RANK: Record<RecommendationV2['priority'], number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

/**
 * "التوصيات الذكية" — real rule-based recommendations from decisionCenter.recommendations
 * (backend _buildRecommendations derives these from alerts, collections, expenses and
 * contract stats). No AI backend, no fabricated data. Empty state when there is nothing
 * to recommend.
 */
export default function RecommendationsSection({
  recommendations,
  loading,
}: {
  recommendations: RecommendationV2[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="db-rec-grid">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={128} style={{ borderRadius: 12 }} />
        ))}
      </div>
    );
  }

  if (!recommendations.length) {
    return (
      <div className="db-empty">
        <div className="db-empty-icon">💡</div>
        <div className="db-empty-text">لا توجد توصيات حالياً — لا مؤشرات تستدعي إجراءً</div>
      </div>
    );
  }

  const ordered = [...recommendations].sort((a, b) => PRI_RANK[a.priority] - PRI_RANK[b.priority]);

  return (
    <div className="db-rec-grid">
      {ordered.map((rec) => {
        const meta = PRI_META[rec.priority];
        return (
          <div key={rec.id} className="db-rec-card" style={{ ['--rec-color' as string]: meta.color }}>
            <div className="db-rec-head">
              <span className="db-rec-icon">{meta.icon}</span>
              <span className="db-rec-pri" style={{ color: meta.color, background: `${meta.color}1c` }}>
                {meta.label}
              </span>
            </div>
            <div className="db-rec-title">{rec.title}</div>
            <div className="db-rec-msg">{rec.message}</div>
            <div className="db-rec-foot">
              {rec.metric && <span className="db-rec-metric">{rec.metric}</span>}
              {rec.actionHint && <span className="db-rec-hint">{rec.actionHint}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
