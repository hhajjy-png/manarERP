import './ResultCard.css';
import type { SkillResult, SkillStatistic, SkillHighlight, SkillDataCard, SkillWarning, RouterDecision } from './types';

// ─── Value formatter ─────────────────────────────────────────────────────────

function fmt(value: string | number, kind?: string): string {
  if (kind === 'money') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!isNaN(n)) return `${n.toFixed(3)} د.ك`;
  }
  return String(value);
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatBox({ stat }: { stat: SkillStatistic }) {
  const trendIcon = stat.trend === 'up' ? '↑' : stat.trend === 'down' ? '↓' : null;
  return (
    <div className="ai-rc-stat">
      <div className="ai-rc-stat-value">
        {fmt(stat.value, stat.kind)}
        {stat.unit && <span className="ai-rc-stat-unit"> {stat.unit}</span>}
        {trendIcon && (
          <span className={`ai-rc-stat-trend ${stat.trend ?? ''}`}>{trendIcon}</span>
        )}
      </div>
      <div className="ai-rc-stat-label">{stat.labelAr}</div>
    </div>
  );
}

function HighlightRow({ h }: { h: SkillHighlight }) {
  return (
    <div className="ai-rc-highlight-row">
      <span className="ai-rc-highlight-icon">{h.icon}</span>
      <span className="ai-rc-highlight-label">{h.labelAr}</span>
      <span className="ai-rc-highlight-value">{fmt(h.value, h.kind)}</span>
    </div>
  );
}

function DataCardBlock({ card }: { card: SkillDataCard }) {
  return (
    <div className="ai-rc-card">
      {card.titleAr && <div className="ai-rc-card-title">{card.titleAr}</div>}
      <div className="ai-rc-card-rows">
        {card.rows.map((row, i) => (
          <div key={i} className="ai-rc-card-row">
            <span className="ai-rc-card-row-label">{row.labelAr}</span>
            <span className="ai-rc-card-row-value">{fmt(row.value, row.kind)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WarnBanner({ w }: { w: SkillWarning }) {
  return (
    <div className={`ai-rc-warning ai-rc-warning--${w.severity}`}>
      <span className="ai-rc-warning-icon">
        {w.severity === 'danger' ? '🔴' : w.severity === 'warning' ? '⚠️' : 'ℹ️'}
      </span>
      <span>{w.message}</span>
    </div>
  );
}

function FollowUps({ questions, onFollowUp }: { questions: string[]; onFollowUp: (q: string) => void }) {
  if (!questions.length) return null;
  return (
    <div className="ai-rc-followups">
      <div className="ai-rc-followups-label">أسئلة متابعة مقترحة:</div>
      <div className="ai-rc-followups-grid">
        {questions.map((q, i) => (
          <button
            key={i}
            type="button"
            className="ai-rc-followup-btn"
            onClick={() => onFollowUp(q)}
          >
            <span className="ai-rc-followup-arrow">→</span>
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

function DevPanel({ result, decision }: { result: SkillResult; decision?: RouterDecision | null }) {
  return (
    <div className="ai-rc-dev">
      <div className="ai-rc-dev-title">🔧 Dev Panel</div>
      <div className="ai-rc-dev-grid">
        <span className="ai-rc-dev-key">Skill:</span>
        <span className="ai-rc-dev-val">{result.skillId}</span>
        <span className="ai-rc-dev-key">Intent:</span>
        <span className="ai-rc-dev-val">{result.intent}</span>
        <span className="ai-rc-dev-key">Exec:</span>
        <span className="ai-rc-dev-val">{result.executionMs}ms</span>
        {decision && (
          <>
            <span className="ai-rc-dev-key">Keywords:</span>
            <span className="ai-rc-dev-val">{decision.matchedKeywords.join(', ') || '—'}</span>
            <span className="ai-rc-dev-key">Confidence:</span>
            <span className="ai-rc-dev-val">{decision.confidence}</span>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface ResultCardProps {
  result: SkillResult;
  onFollowUp: (q: string) => void;
  routerDecision?: RouterDecision | null;
}

export default function ResultCard({ result, onFollowUp, routerDecision }: ResultCardProps) {
  const isDev = import.meta.env.DEV;

  // ── Insufficient data / coming soon ───────────────────────────────────────
  if (result.isInsufficientData || result.isComingSoon) {
    return (
      <div className="ai-rc-root ai-rc-root--insufficient">
        <div className="ai-rc-header">
          <div className="ai-rc-title">{result.title}</div>
          <span className="ai-rc-badge ai-rc-badge--soon">قريباً</span>
        </div>
        <p className="ai-rc-summary">{result.summary}</p>

        {result.warnings.map((w, i) => <WarnBanner key={i} w={w} />)}

        {result.sources.length > 0 && (
          <div className="ai-rc-sources">
            <span className="ai-rc-sources-label">الانتقال إلى:</span>
            {result.sources.map((s, i) => (
              <span key={i} className="ai-rc-source-chip">{s.icon} {s.labelAr}</span>
            ))}
          </div>
        )}

        <FollowUps questions={result.suggestedQuestions} onFollowUp={onFollowUp} />
        {isDev && <DevPanel result={result} decision={routerDecision} />}
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (result.isError) {
    return (
      <div className="ai-rc-root ai-rc-root--error">
        <div className="ai-rc-header">
          <div className="ai-rc-title">{result.title}</div>
          <span className="ai-rc-badge ai-rc-badge--error">خطأ</span>
        </div>
        <p className="ai-rc-summary">{result.summary}</p>
        {result.warnings.map((w, i) => <WarnBanner key={i} w={w} />)}
        <FollowUps questions={result.suggestedQuestions} onFollowUp={onFollowUp} />
        {isDev && <DevPanel result={result} decision={routerDecision} />}
      </div>
    );
  }

  // ── Normal result ─────────────────────────────────────────────────────────
  const highlights      = result.highlights ?? [];
  const cards           = result.cards ?? [];
  const hasHighlights   = highlights.length > 0;
  const hasCards        = cards.length > 0;
  const hasStats        = result.statistics.length > 0;
  const hasWarnings     = result.warnings.length > 0;
  const hasSources      = result.sources.length > 0;

  return (
    <div className="ai-rc-root">
      {/* Header */}
      <div className="ai-rc-header">
        <div className="ai-rc-title">{result.title}</div>
        <div className="ai-rc-header-chips">
          <span className="ai-rc-badge ai-rc-badge--skill">{result.skillTitleAr}</span>
        </div>
      </div>

      {/* Summary */}
      <p className="ai-rc-summary">{result.summary}</p>

      {/* Statistics row */}
      {hasStats && (
        <div className="ai-rc-stats-row">
          {result.statistics.map((stat, i) => (
            <StatBox key={i} stat={stat} />
          ))}
        </div>
      )}

      {/* Highlights */}
      {hasHighlights && (
        <div className="ai-rc-highlights">
          {highlights.map((h, i) => <HighlightRow key={i} h={h} />)}
        </div>
      )}

      {/* Data cards */}
      {hasCards && (
        <div className="ai-rc-cards">
          {cards.map((card, i) => <DataCardBlock key={i} card={card} />)}
        </div>
      )}

      {/* Warnings */}
      {hasWarnings && (
        <div className="ai-rc-warnings">
          {result.warnings.map((w, i) => <WarnBanner key={i} w={w} />)}
        </div>
      )}

      {/* Sources */}
      {hasSources && (
        <div className="ai-rc-sources">
          <span className="ai-rc-sources-label">المصادر:</span>
          {result.sources.map((s, i) => (
            <span key={i} className="ai-rc-source-chip">{s.icon} {s.labelAr}</span>
          ))}
        </div>
      )}

      {/* Follow-ups */}
      <FollowUps questions={result.suggestedQuestions} onFollowUp={onFollowUp} />

      {/* Exec time chip */}
      <div className="ai-rc-footer">
        <span className="ai-rc-exec-time">{result.executionMs}ms</span>
      </div>

      {/* Dev panel — DEV only */}
      {isDev && <DevPanel result={result} decision={routerDecision} />}
    </div>
  );
}
