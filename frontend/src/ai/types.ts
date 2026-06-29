// ─── AI-2 Safe Intelligence Engine — shared types ─────────────────────────────
// All skills return SkillResult. No LLM, no SQL, no AI provider.

export type SkillStatus   = 'stable' | 'experimental' | 'coming_soon';
export type SkillCategory = 'finance' | 'hr' | 'operations' | 'analytics';
export type ValueKind     = 'money' | 'count' | 'percent' | 'date' | 'text';
export type WarningSeverity = 'info' | 'warning' | 'danger';

// ── Skill metadata (used by registry, future LLM router) ─────────────────────

export interface SkillMeta {
  id: string;
  titleAr: string;
  titleEn: string;
  descriptionAr: string;
  icon: string;
  iconColor: string;
  category: SkillCategory;
  status: SkillStatus;
  priority: 'high' | 'medium' | 'low';
  futureLLMCompatible: true;
}

// ── SkillResult sub-types ─────────────────────────────────────────────────────

export interface SkillStatistic {
  labelAr: string;
  value: string | number;
  unit?: string;
  kind?: ValueKind;
  trend?: 'up' | 'down' | 'neutral';
}

export interface SkillHighlight {
  icon: string;
  labelAr: string;
  value: string;
  kind?: ValueKind;
}

export interface SkillWarning {
  message: string;
  severity: WarningSeverity;
}

export interface SkillSource {
  icon: string;
  labelAr: string;
  routePath?: string;
}

export interface SkillDataCardRow {
  labelAr: string;
  value: string | number;
  kind?: ValueKind;
}

export interface SkillDataCard {
  titleAr: string;
  rows: SkillDataCardRow[];
}

// ── SkillResult — the universal return type for every skill ───────────────────
// highlights and cards are optional so that compact snapshots stored in
// localStorage (which strip these large arrays) still satisfy this type.

export interface SkillResult {
  skillId: string;
  skillTitleAr: string;
  intent: string;    // sub-intent matched (e.g. 'withdrawals', 'summary')
  prompt: string;    // original user prompt

  title: string;
  summary: string;

  // Always persisted (small)
  statistics: SkillStatistic[];
  warnings: SkillWarning[];
  sources: SkillSource[];
  suggestedQuestions: string[];

  // Stripped in localStorage snapshot (may be absent when loading history)
  highlights?: SkillHighlight[];
  cards?: SkillDataCard[];

  // State flags
  isComingSoon?: boolean;
  isInsufficientData?: boolean;
  isError?: boolean;
  errorMessage?: string;

  executedAt: number;
  executionMs: number;
}

// ── RouterDecision — output of route(), also displayed in Dev Panel ───────────

export interface RouterDecision {
  skillId: string | null;
  intent: string;
  matchedKeywords: string[];
  confidence: number;
  fallback: boolean;
}
