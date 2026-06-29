// ─── AI-2 / AI-2.5 Safe Intelligence Engine — shared types ────────────────────
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

// ── AI-2.5 expansion types ────────────────────────────────────────────────────

export type CapabilityLevel = 'complete' | 'partial' | 'preview' | 'comingSoon';

export type RichSourceType = 'primary' | 'derived' | 'aggregated' | 'historical';

export interface RichSource {
  module: string;
  datasetName: string;
  recordCount?: number;
  dateRange?: string;
  dataCompleteness: number;
  sourceType: RichSourceType;
}

export interface ExplanationStep {
  step: number;
  labelAr: string;
  detailAr?: string;
}

export interface QualityIssue {
  severity: 'info' | 'warning' | 'danger';
  messageAr: string;
}

export interface RelatedSkill {
  skillId: string;
  labelAr: string;
  promptSuggestion: string;
}

export interface RelatedPage {
  path: string;
  labelAr: string;
  icon: string;
}

export type ActionKind = 'openModule' | 'copySummary' | 'exportResult' | 'print' | 'placeholder';

export interface SkillAction {
  kind: ActionKind;
  labelAr: string;
  icon: string;
  available: boolean;
  payload?: string | Record<string, unknown>;
}

export type SkillGeneration = 'AI-2.5-deterministic' | 'AI-3-local-llm' | 'AI-4-rag' | 'AI-5-multimodal';

export interface SkillMetadata {
  version: string;
  status: SkillStatus;
  capabilities: string[];
  dependentModules: string[];
  lastUpdated: string;
  skillGeneration: SkillGeneration;
}

export interface DevDiagnostics {
  routerMs: number;
  skillMs: number;
  apiMs: number;
  recordsAnalyzed: number;
  cardsRendered: number;
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

  // AI-2.5 enrichment fields (all optional — stripped in localStorage snapshot)
  capabilityLevel?: CapabilityLevel;
  richSources?: RichSource[];
  explanationSteps?: ExplanationStep[];
  qualityScore?: number;
  qualityIssues?: QualityIssue[];
  relatedSkills?: RelatedSkill[];
  relatedPages?: RelatedPage[];
  actions?: SkillAction[];
  skillMetadata?: SkillMetadata;
  diagnostics?: DevDiagnostics;

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
  blocked?: boolean;
  blockedMessage?: string;
}
