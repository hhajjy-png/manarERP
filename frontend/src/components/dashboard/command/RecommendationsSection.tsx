import { Skeleton } from '../Skeleton';
import type { RecommendationV2 } from './types';
import { getRecommendationBody } from './types';
import { TextWithMoney } from '../../../config/modules';
import { useT } from '../../../lib/i18n';

const PRI_META: Record<RecommendationV2['priority'], { color: string; icon: string; labelKey: string }> = {
  HIGH:   { color: 'var(--db-red)', icon: '⚠️', labelKey: 'recsec.priority.high' },
  MEDIUM: { color: 'var(--db-amber)', icon: '📌', labelKey: 'recsec.priority.medium' },
  LOW:    { color: 'var(--db-green)', icon: '💡', labelKey: 'recsec.priority.low' },
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
  const { t } = useT();
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
        <div className="db-empty-text">{t('recsec.empty')}</div>
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
              <span className="db-rec-pri" style={{ color: meta.color, background: `color-mix(in srgb, ${meta.color} 11%, transparent)` }}>
                {t(meta.labelKey)}
              </span>
            </div>
            <div className="db-rec-title">{rec.title}</div>
            <div className="db-rec-msg"><TextWithMoney text={getRecommendationBody(rec)} /></div>
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
