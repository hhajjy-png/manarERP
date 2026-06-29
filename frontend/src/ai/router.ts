// ─── AI-2 Prompt Router — deterministic keyword matching only ─────────────────
// No NLP, no ML, no SQL, no AI provider.
// Each rule: { skillId, intent, keywords[], weight }
// Score = matchedKeywords.length × weight. Highest score wins.

import type { RouterDecision } from './types';

interface RoutingRule {
  skillId: string;
  intent: string;
  keywords: string[];
  weight: number;
}

// Rules are ordered from most specific (highest weight) to least specific.
// weight 3 = precise intent keyword, weight 2 = module keyword, weight 1 = fallback

const ROUTING_TABLE: RoutingRule[] = [
  // ── Bank Statement ─────────────────────────────────────────────────────────
  { skillId: 'bank-statement', intent: 'withdrawals', weight: 3, keywords: ['أكبر السحوبات', 'أكبر عمليات السحب', 'سحوبات', 'السحوبات'] },
  { skillId: 'bank-statement', intent: 'deposits',    weight: 3, keywords: ['أكبر الإيداعات', 'عمليات الإيداع', 'إيداعات', 'الإيداعات'] },
  { skillId: 'bank-statement', intent: 'fees',        weight: 3, keywords: ['رسوم البنك', 'رسوم', 'عمولات', 'الرسوم'] },
  { skillId: 'bank-statement', intent: 'warnings',    weight: 3, keywords: ['العمليات المشبوهة', 'مشبوهة', 'التنبيهات', 'تنبيهات', 'مخالفات'] },
  { skillId: 'bank-statement', intent: 'summary',     weight: 2, keywords: ['كشف الحساب', 'كشف حساب', 'كشف', 'بنك', 'بنكي', 'معاملات بنكية'] },

  // ── Payroll ────────────────────────────────────────────────────────────────
  { skillId: 'payroll', intent: 'highest',    weight: 3, keywords: ['أعلى الرواتب', 'أكبر راتب', 'أعلى راتب', 'أعلى الرواتب'] },
  { skillId: 'payroll', intent: 'lowest',     weight: 3, keywords: ['أدنى الرواتب', 'أقل راتب', 'أدنى راتب', 'أدنى الرواتب'] },
  { skillId: 'payroll', intent: 'average',    weight: 3, keywords: ['متوسط الراتب', 'متوسط الرواتب', 'المتوسط'] },
  { skillId: 'payroll', intent: 'comparison', weight: 3, keywords: ['مقارنة الرواتب', 'مقارنة آخر', 'الأشهر الماضية', 'مقارنة شهرية'] },
  { skillId: 'payroll', intent: 'summary',    weight: 2, keywords: ['رواتب', 'راتب', 'مرتبات', 'الرواتب', 'كشف الرواتب'] },

  // ── Expenses ───────────────────────────────────────────────────────────────
  { skillId: 'expenses', intent: 'top',     weight: 3, keywords: ['أكبر المصروفات', 'أعلى المصروفات', 'أكبر نفقة', 'أعلى نفقة'] },
  { skillId: 'expenses', intent: 'trends',  weight: 3, keywords: ['اتجاهات المصروفات', 'تطور المصروفات', 'اتجاهات'] },
  { skillId: 'expenses', intent: 'summary', weight: 2, keywords: ['مصاريف', 'مصروفات', 'نفقات', 'المصروفات', 'المصاريف'] },

  // ── Contracts ──────────────────────────────────────────────────────────────
  { skillId: 'contracts', intent: 'active',   weight: 3, keywords: ['العقود النشطة', 'العقود السارية', 'عقود فعالة', 'العقود الفعالة', 'العقود النشطة'] },
  { skillId: 'contracts', intent: 'expiring', weight: 3, keywords: ['انتهاء', 'قريبة من الانتهاء', 'تنتهي قريباً', 'انتهاء العقد', 'تنتهي'] },
  { skillId: 'contracts', intent: 'top',      weight: 3, keywords: ['أكبر العقود', 'أعلى قيمة', 'أكبر العملاء', 'أعلى عقد', 'العقود الأعلى'] },
  { skillId: 'contracts', intent: 'summary',  weight: 2, keywords: ['عقد', 'عقود', 'مشاريع', 'العقود'] },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  { skillId: 'dashboard', intent: 'revenue', weight: 3, keywords: ['الإيرادات', 'إيرادات', 'الإيراد', 'المبيعات', 'الدخل'] },
  { skillId: 'dashboard', intent: 'profit',  weight: 3, keywords: ['الأرباح', 'صافي الربح', 'الربح', 'أرباح', 'ربحية'] },
  { skillId: 'dashboard', intent: 'alerts',  weight: 3, keywords: ['تنبيهات النظام', 'معلّقة', 'معلق', 'العمليات المعلقة', 'الفواتير المعلقة'] },
  { skillId: 'dashboard', intent: 'kpi',     weight: 2, keywords: ['مؤشرات', 'لوحة التحكم', 'نظرة عامة', 'ملخص عام', 'إجمالي', 'ملخص اللوحة'] },

  // ── Reports (fallback — lowest weight) ────────────────────────────────────
  { skillId: 'reports', intent: 'explain',  weight: 2, keywords: ['اشرح', 'شرح', 'وضّح', 'تفسير', 'فسّر'] },
  { skillId: 'reports', intent: 'compare',  weight: 2, keywords: ['قارن تقرير', 'مقارنة تقرير', 'قارن الفترات'] },
  { skillId: 'reports', intent: 'summary',  weight: 1, keywords: ['تقرير', 'تقارير', 'ملخص التقرير'] },
];

export function route(prompt: string): RouterDecision {
  const normalized = prompt.trim();
  if (!normalized) {
    return { skillId: null, intent: '', matchedKeywords: [], confidence: 0, fallback: true };
  }

  // Aggregate per-intent scores
  const scores = new Map<
    string,
    { skillId: string; intent: string; score: number; matched: string[] }
  >();

  for (const rule of ROUTING_TABLE) {
    const matched = rule.keywords.filter(k => normalized.includes(k));
    if (!matched.length) continue;

    const key   = `${rule.skillId}:${rule.intent}`;
    const score = matched.length * rule.weight;
    const prev  = scores.get(key);

    if (!prev || score > prev.score) {
      scores.set(key, { skillId: rule.skillId, intent: rule.intent, score, matched });
    }
  }

  if (!scores.size) {
    return { skillId: null, intent: '', matchedKeywords: [], confidence: 0, fallback: true };
  }

  const best = [...scores.values()].reduce((a, b) => (b.score > a.score ? b : a));

  return {
    skillId:        best.skillId,
    intent:         best.intent,
    matchedKeywords: best.matched,
    confidence:     best.score,
    fallback:       false,
  };
}
