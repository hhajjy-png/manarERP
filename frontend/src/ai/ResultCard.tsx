import './ResultCard.css';
import { formatCurrency } from '../lib/format';
import { useState } from 'react';
import { printCurrentView } from '../utils/print';
import { useNavigate } from 'react-router-dom';
import type {
  SkillResult, SkillStatistic, SkillHighlight, SkillDataCard, SkillWarning,
  RouterDecision, RichSource, ExplanationStep, SkillAction, RelatedSkill,
  RelatedPage, CapabilityLevel,
} from './types';

// ─── Value formatter ──────────────────────────────────────────────────────────

function fmt(value: string | number, kind?: string): string {
  if (kind === 'money') {
    const n = typeof value === 'number' ? value : parseFloat(String(value));
    if (!isNaN(n)) return formatCurrency(n);
  }
  return String(value);
}

// ─── Download helper ──────────────────────────────────────────────────────────

function downloadResultTxt(result: SkillResult): void {
  const lines: string[] = [
    result.title,
    '─'.repeat(40),
    result.summary,
    '',
  ];
  if (result.statistics.length) {
    lines.push('الإحصائيات:');
    for (const s of result.statistics) lines.push(`  ${s.labelAr}: ${fmt(s.value, s.kind)}`);
    lines.push('');
  }
  if (result.cards?.length) {
    for (const card of result.cards) {
      lines.push(card.titleAr + ':');
      for (const row of card.rows) lines.push(`  ${row.labelAr}: ${fmt(row.value, row.kind)}`);
      lines.push('');
    }
  }
  lines.push(`تم التنفيذ: ${new Date(result.executedAt).toLocaleString('ar-KW')}`);

  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ai-result-${result.skillId}-${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CapabilityBadge({ level }: { level: CapabilityLevel }) {
  const MAP: Record<CapabilityLevel, { label: string; mod: string }> = {
    complete:   { label: 'مكتملة',     mod: 'complete'  },
    partial:    { label: 'جزئية',      mod: 'partial'   },
    preview:    { label: 'معاينة',     mod: 'preview'   },
    comingSoon: { label: 'قريباً',     mod: 'soon'      },
  };
  const { label, mod } = MAP[level];
  return <span className={`ai-rc-capability ai-rc-capability--${mod}`}>{label}</span>;
}

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

function QualityGauge({ score, issues }: { score: number; issues?: Array<{ severity: string; messageAr: string }> }) {
  const fillClass = score >= 80 ? 'high' : score >= 60 ? 'medium' : 'low';
  const label = score >= 80 ? 'جيدة' : score >= 60 ? 'مقبولة' : 'تحتاج مراجعة';
  return (
    <div className="ai-rc-quality">
      <div className="ai-rc-quality-header">
        <span className="ai-rc-quality-label">جودة البيانات</span>
        <span className={`ai-rc-quality-score ai-rc-quality-score--${fillClass}`}>{score}% — {label}</span>
      </div>
      <div className="ai-rc-quality-bar">
        <div
          className={`ai-rc-quality-fill ai-rc-quality-fill--${fillClass}`}
          style={{ '--rc-fill-width': `${score}%` } as React.CSSProperties}
        />
      </div>
      {issues && issues.length > 0 && (
        <div className="ai-rc-quality-issues">
          {issues.map((iss, i) => (
            <span key={i} className={`ai-rc-quality-issue ai-rc-quality-issue--${iss.severity}`}>
              {iss.severity === 'danger' ? '🔴' : iss.severity === 'warning' ? '⚠️' : 'ℹ️'} {iss.messageAr}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ExplainPanel({ steps }: { steps: ExplanationStep[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ai-rc-explain">
      <button
        type="button"
        className="ai-rc-explain-toggle"
        onClick={() => setOpen(v => !v)}
      >
        <span>⚙</span>
        <span>كيف تم إعداد هذه النتيجة؟</span>
        <span className="ai-rc-explain-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ai-rc-explain-body">
          {steps.map(s => (
            <div key={s.step} className="ai-rc-explain-step">
              <span className="ai-rc-explain-step-num">{s.step}</span>
              <div className="ai-rc-explain-step-content">
                <span className="ai-rc-explain-step-label">{s.labelAr}</span>
                {s.detailAr && <span className="ai-rc-explain-step-detail">{s.detailAr}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const SOURCE_TYPE_AR: Record<string, string> = {
  primary:    'أساسي',
  derived:    'مشتق',
  aggregated: 'مجمّع',
  historical: 'تاريخي',
};

function RichSourcesPanel({ sources }: { sources: RichSource[] }) {
  return (
    <div className="ai-rc-rich-sources">
      <div className="ai-rc-rich-sources-title">مصادر البيانات</div>
      {sources.map((s, i) => (
        <div key={i} className="ai-rc-rich-source-row">
          <div className="ai-rc-rich-source-main">
            <span className="ai-rc-rich-source-name">{s.datasetName}</span>
            <span className="ai-rc-source-type-chip">{SOURCE_TYPE_AR[s.sourceType] ?? s.sourceType}</span>
          </div>
          <div className="ai-rc-rich-source-meta">
            {s.recordCount !== undefined && (
              <span className="ai-rc-rich-source-count">{s.recordCount.toLocaleString('ar-KW')} سجل</span>
            )}
            {s.dateRange && <span className="ai-rc-rich-source-range">{s.dateRange}</span>}
            <div className="ai-rc-completeness-mini">
              <div
                className="ai-rc-completeness-fill"
                style={{ '--rc-fill-width': `${s.dataCompleteness}%` } as React.CSSProperties}
              />
            </div>
            <span className="ai-rc-rich-source-pct">{s.dataCompleteness}%</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ActionCards({
  actions,
  result,
  onNavigate,
}: {
  actions: SkillAction[];
  result: SkillResult;
  onNavigate: (path: string) => void;
}) {
  const handleAction = (action: SkillAction) => {
    if (!action.available) return;
    switch (action.kind) {
      case 'openModule':
        if (typeof action.payload === 'string') onNavigate(action.payload);
        break;
      case 'copySummary':
        void navigator.clipboard.writeText(result.summary);
        break;
      case 'exportResult':
        downloadResultTxt(result);
        break;
      case 'print':
        printCurrentView();
        break;
    }
  };
  return (
    <div className="ai-rc-actions">
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          className={`ai-rc-action-btn${!a.available ? ' ai-rc-action-btn--disabled' : ''}`}
          onClick={() => handleAction(a)}
          disabled={!a.available}
          title={!a.available ? 'غير متاح حالياً' : undefined}
        >
          <span>{a.icon}</span>
          <span>{a.labelAr}</span>
        </button>
      ))}
    </div>
  );
}

function RelatedPanel({
  relatedSkills,
  relatedPages,
  onFollowUp,
  onNavigate,
}: {
  relatedSkills?: RelatedSkill[];
  relatedPages?: RelatedPage[];
  onFollowUp: (q: string) => void;
  onNavigate: (path: string) => void;
}) {
  const hasSkills = relatedSkills && relatedSkills.length > 0;
  const hasPages  = relatedPages && relatedPages.length > 0;
  if (!hasSkills && !hasPages) return null;
  return (
    <div className="ai-rc-related">
      <div className="ai-rc-related-label">🔗 تحليلات ذات صلة</div>
      {hasSkills && (
        <div className="ai-rc-related-row">
          {relatedSkills!.map((s, i) => (
            <button
              key={i}
              type="button"
              className="ai-rc-related-chip ai-rc-related-chip--skill"
              onClick={() => onFollowUp(s.promptSuggestion)}
            >
              {s.labelAr}
            </button>
          ))}
        </div>
      )}
      {hasPages && (
        <div className="ai-rc-related-row">
          {relatedPages!.map((p, i) => (
            <button
              key={i}
              type="button"
              className="ai-rc-related-chip ai-rc-related-chip--page"
              onClick={() => onNavigate(p.path)}
            >
              {p.icon} {p.labelAr}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MetaPanel({ meta }: { meta: NonNullable<SkillResult['skillMetadata']> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ai-rc-meta">
      <button type="button" className="ai-rc-meta-toggle" onClick={() => setOpen(v => !v)}>
        <span>ⓘ</span>
        <span>بيانات المهارة</span>
        <span className="ai-rc-meta-arrow">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="ai-rc-meta-body">
          <span className="ai-rc-meta-chip ai-rc-meta-chip--version">v{meta.version}</span>
          <span className="ai-rc-meta-chip ai-rc-meta-chip--generation">{meta.skillGeneration}</span>
          <span className="ai-rc-meta-chip">{meta.status}</span>
          {meta.capabilities.map((c, i) => (
            <span key={i} className="ai-rc-meta-chip ai-rc-meta-chip--capability">{c}</span>
          ))}
          {meta.dependentModules.map((m, i) => (
            <span key={i} className="ai-rc-meta-chip">{m}</span>
          ))}
          <span className="ai-rc-meta-chip">{meta.lastUpdated}</span>
        </div>
      )}
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
        {result.capabilityLevel && (
          <>
            <span className="ai-rc-dev-key">Capability:</span>
            <span className="ai-rc-dev-val">{result.capabilityLevel}</span>
          </>
        )}
        {result.qualityScore !== undefined && (
          <>
            <span className="ai-rc-dev-key">Quality:</span>
            <span className="ai-rc-dev-val">{result.qualityScore}%</span>
          </>
        )}
        {result.diagnostics && (
          <>
            <span className="ai-rc-dev-key">routerMs:</span>
            <span className="ai-rc-dev-val">{result.diagnostics.routerMs}ms</span>
            <span className="ai-rc-dev-key">skillMs:</span>
            <span className="ai-rc-dev-val">{result.diagnostics.skillMs}ms</span>
            <span className="ai-rc-dev-key">apiMs:</span>
            <span className="ai-rc-dev-val">{result.diagnostics.apiMs}ms</span>
            <span className="ai-rc-dev-key">records:</span>
            <span className="ai-rc-dev-val">{result.diagnostics.recordsAnalyzed}</span>
          </>
        )}
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
  const isDev    = import.meta.env.DEV;
  const navigate = useNavigate();

  const onNavigate = (path: string) => navigate(path);

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
  const highlights    = result.highlights ?? [];
  const cards         = result.cards ?? [];
  const hasHighlights = highlights.length > 0;
  const hasCards      = cards.length > 0;
  const hasStats      = result.statistics.length > 0;
  const hasWarnings   = result.warnings.length > 0;
  const hasSources    = result.sources.length > 0;

  return (
    <div className="ai-rc-root">
      {/* 1. Header + capability badge */}
      <div className="ai-rc-header">
        <div className="ai-rc-title">{result.title}</div>
        <div className="ai-rc-header-chips">
          {result.capabilityLevel && <CapabilityBadge level={result.capabilityLevel} />}
          <span className="ai-rc-badge ai-rc-badge--skill">{result.skillTitleAr}</span>
        </div>
      </div>

      {/* 2. Summary */}
      <p className="ai-rc-summary">{result.summary}</p>

      {/* 3. Statistics */}
      {hasStats && (
        <div className="ai-rc-stats-row">
          {result.statistics.map((stat, i) => <StatBox key={i} stat={stat} />)}
        </div>
      )}

      {/* 4. Highlights */}
      {hasHighlights && (
        <div className="ai-rc-highlights">
          {highlights.map((h, i) => <HighlightRow key={i} h={h} />)}
        </div>
      )}

      {/* 5. Data cards */}
      {hasCards && (
        <div className="ai-rc-cards">
          {cards.map((card, i) => <DataCardBlock key={i} card={card} />)}
        </div>
      )}

      {/* 6. Data Quality Gauge */}
      {result.qualityScore !== undefined && (
        <QualityGauge score={result.qualityScore} issues={result.qualityIssues} />
      )}

      {/* 7. Explainability Panel */}
      {result.explanationSteps && result.explanationSteps.length > 0 && (
        <ExplainPanel steps={result.explanationSteps} />
      )}

      {/* 8. Rich Sources Panel */}
      {result.richSources && result.richSources.length > 0 && (
        <RichSourcesPanel sources={result.richSources} />
      )}

      {/* 9. Warnings */}
      {hasWarnings && (
        <div className="ai-rc-warnings">
          {result.warnings.map((w, i) => <WarnBanner key={i} w={w} />)}
        </div>
      )}

      {/* 10. Action Cards */}
      {result.actions && result.actions.length > 0 && (
        <ActionCards actions={result.actions} result={result} onNavigate={onNavigate} />
      )}

      {/* 11. Related Skills/Pages */}
      {(result.relatedSkills?.length || result.relatedPages?.length) && (
        <RelatedPanel
          relatedSkills={result.relatedSkills}
          relatedPages={result.relatedPages}
          onFollowUp={onFollowUp}
          onNavigate={onNavigate}
        />
      )}

      {/* 12. Skill Metadata */}
      {result.skillMetadata && <MetaPanel meta={result.skillMetadata} />}

      {/* 13. Sources chips */}
      {hasSources && (
        <div className="ai-rc-sources">
          <span className="ai-rc-sources-label">المصادر:</span>
          {result.sources.map((s, i) => (
            <span key={i} className="ai-rc-source-chip">{s.icon} {s.labelAr}</span>
          ))}
        </div>
      )}

      {/* 14. Follow-ups */}
      <FollowUps questions={result.suggestedQuestions} onFollowUp={onFollowUp} />

      {/* 15. Footer */}
      <div className="ai-rc-footer">
        <span className="ai-rc-exec-time">{result.executionMs}ms</span>
      </div>

      {/* 16. Dev panel */}
      {isDev && <DevPanel result={result} decision={routerDecision} />}
    </div>
  );
}
