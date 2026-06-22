export interface RecommendationV2 {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  reason: string;
  expectedImpact: string;
  suggestedAction: string;
  metric?: string;
}

const PRI_COLOR = { HIGH: '#EF4444', MEDIUM: '#F59E0B', LOW: '#10B981' };
const PRI_LABEL = { HIGH: 'عالية', MEDIUM: 'متوسطة', LOW: 'منخفضة' };
const PRI_ICON  = { HIGH: '🔴', MEDIUM: '🟡', LOW: '🟢' };

interface Props { recommendations: RecommendationV2[] }

export default function ExecutiveRecommendationsPanel({ recommendations }: Props) {
  if (recommendations.length === 0) {
    return (
      <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
        <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>💡 التوصيات التنفيذية</h3>
        <div style={{ color: '#10B981', fontSize: 13, textAlign: 'center', padding: '16px 0' }}>
          ✅ لا توصيات حرجة — الأداء ضمن المؤشرات الطبيعية
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'var(--db-card)', borderRadius: 'var(--db-radius)', padding: '20px', border: '1px solid var(--db-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--db-text)' }}>💡 التوصيات التنفيذية</h3>
        <span style={{ fontSize: 12, color: 'var(--db-muted)' }}>{recommendations.length} توصية</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {recommendations.map((rec, idx) => {
          const color = PRI_COLOR[rec.priority];
          return (
            <div key={rec.id} style={{
              background: 'var(--db-inner)',
              borderRadius: 8, padding: '12px 14px',
              borderRight: `3px solid ${color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13 }}>{PRI_ICON[rec.priority]}</span>
                <span style={{
                  fontSize: 11, color: 'var(--db-muted)',
                  background: 'var(--db-border)', padding: '1px 7px', borderRadius: 8,
                }}>#{idx + 1}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--db-text)' }}>{rec.title}</span>
                <span style={{
                  fontSize: 10, fontWeight: 700, color,
                  background: `${color}22`, padding: '1px 7px', borderRadius: 10,
                }}>{PRI_LABEL[rec.priority]}</span>
                {rec.metric && (
                  <span style={{ fontSize: 11, color: '#9CA3AF', marginRight: 'auto' }}>{rec.metric}</span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 16px' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--db-muted)', marginBottom: 2 }}>السبب</div>
                  <div style={{ fontSize: 12, color: 'var(--db-text)' }}>{rec.reason}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--db-muted)', marginBottom: 2 }}>التأثير المتوقع</div>
                  <div style={{ fontSize: 12, color: 'var(--db-text)' }}>{rec.expectedImpact}</div>
                </div>
              </div>

              <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(96,165,250,0.08)', borderRadius: 6 }}>
                <span style={{ fontSize: 11, color: '#60A5FA' }}>💡 الإجراء المقترح: </span>
                <span style={{ fontSize: 12, color: 'var(--db-text)' }}>{rec.suggestedAction}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
