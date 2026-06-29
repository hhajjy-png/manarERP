// ─── AI-2 / AI-2.5 Prompt Router — deterministic keyword matching only ─────────
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

// Blocked patterns are checked BEFORE scoring.
// Returns a blocked RouterDecision with an informational message (not an error).
interface BlockedPattern {
  terms: string[];
  message: string;
}

const BLOCKED_PATTERNS: BlockedPattern[] = [
  {
    terms: ['مطابقة', 'تسوية', 'matched', 'unmatched', 'reconciliation'],
    message: 'هذا النطاق غير مدعوم حالياً — يمكنني مساعدتك في استكشاف وتحليل كشف الحساب فقط.',
  },
];

// Rules are ordered from most specific (highest weight) to least specific.
// weight 3 = precise intent keyword, weight 2 = module keyword, weight 1 = fallback

const ROUTING_TABLE: RoutingRule[] = [
  // ── Bank Statement ─────────────────────────────────────────────────────────
  { skillId: 'bank-statement', intent: 'withdrawals',        weight: 3, keywords: ['أكبر السحوبات', 'أكبر عمليات السحب', 'سحوبات', 'السحوبات'] },
  { skillId: 'bank-statement', intent: 'deposits',           weight: 3, keywords: ['أكبر الإيداعات', 'عمليات الإيداع', 'إيداعات', 'الإيداعات'] },
  { skillId: 'bank-statement', intent: 'fees',               weight: 3, keywords: ['رسوم البنك', 'رسوم', 'عمولات', 'الرسوم'] },
  { skillId: 'bank-statement', intent: 'warnings',           weight: 3, keywords: ['العمليات المشبوهة', 'مشبوهة', 'التنبيهات', 'تنبيهات', 'مخالفات'] },
  { skillId: 'bank-statement', intent: 'quality_issues',     weight: 3, keywords: ['تنبيهات الجودة', 'مشاكل البيانات', 'عمليات غير مصنفة', 'تحتاج مراجعة', 'بيانات ناقصة'] },
  { skillId: 'bank-statement', intent: 'statement_overview', weight: 3, keywords: ['نظرة عامة', 'ملخص الكشف', 'حالة الكشف', 'توزيع العمليات', 'جودة الكشف', 'إحصائيات الكشف'] },
  { skillId: 'bank-statement', intent: 'summary',            weight: 2, keywords: ['كشف الحساب', 'كشف حساب', 'كشف', 'بنك', 'بنكي', 'معاملات بنكية'] },

  // ── Payroll ────────────────────────────────────────────────────────────────
  { skillId: 'payroll', intent: 'highest',    weight: 3, keywords: ['أعلى الرواتب', 'أكبر راتب', 'أعلى راتب', 'أعلى الرواتب'] },
  { skillId: 'payroll', intent: 'lowest',     weight: 3, keywords: ['أدنى الرواتب', 'أقل راتب', 'أدنى راتب', 'أدنى الرواتب'] },
  { skillId: 'payroll', intent: 'average',    weight: 3, keywords: ['متوسط الراتب', 'متوسط الرواتب', 'المتوسط'] },
  { skillId: 'payroll', intent: 'comparison', weight: 3, keywords: ['مقارنة الرواتب', 'مقارنة آخر', 'الأشهر الماضية', 'مقارنة شهرية'] },
  { skillId: 'payroll', intent: 'department', weight: 3, keywords: ['حسب الإدارة', 'قسم', 'الأقسام', 'توزيع الرواتب', 'حسب القسم'] },
  { skillId: 'payroll', intent: 'status',     weight: 3, keywords: ['حالة الرواتب', 'رواتب معلقة', 'غير مدفوعة', 'رواتب مدفوعة', 'حالة الصرف'] },
  { skillId: 'payroll', intent: 'summary',    weight: 2, keywords: ['رواتب', 'راتب', 'مرتبات', 'الرواتب', 'كشف الرواتب'] },

  // ── Expenses ───────────────────────────────────────────────────────────────
  { skillId: 'expenses', intent: 'top',      weight: 3, keywords: ['أكبر المصروفات', 'أعلى المصروفات', 'أكبر نفقة', 'أعلى نفقة'] },
  { skillId: 'expenses', intent: 'trends',   weight: 3, keywords: ['اتجاهات المصروفات', 'تطور المصروفات', 'اتجاهات'] },
  { skillId: 'expenses', intent: 'supplier', weight: 3, keywords: ['حسب المورد', 'أكبر الموردين', 'الموردين', 'توزيع الموردين'] },
  { skillId: 'expenses', intent: 'summary',  weight: 2, keywords: ['مصاريف', 'مصروفات', 'نفقات', 'المصروفات', 'المصاريف'] },

  // ── Contracts ──────────────────────────────────────────────────────────────
  { skillId: 'contracts', intent: 'active',   weight: 3, keywords: ['العقود النشطة', 'العقود السارية', 'عقود فعالة', 'العقود الفعالة', 'العقود النشطة'] },
  { skillId: 'contracts', intent: 'expiring', weight: 3, keywords: ['انتهاء', 'قريبة من الانتهاء', 'تنتهي قريباً', 'انتهاء العقد', 'تنتهي'] },
  { skillId: 'contracts', intent: 'top',      weight: 3, keywords: ['أكبر العقود', 'أعلى قيمة', 'أكبر العملاء', 'أعلى عقد', 'العقود الأعلى'] },
  { skillId: 'contracts', intent: 'customer', weight: 3, keywords: ['عقود العميل', 'حسب العميل', 'أكبر العملاء', 'توزيع العقود', 'عملاء العقود'] },
  { skillId: 'contracts', intent: 'summary',  weight: 2, keywords: ['عقد', 'عقود', 'مشاريع', 'العقود'] },

  // ── Dashboard ──────────────────────────────────────────────────────────────
  { skillId: 'dashboard', intent: 'revenue',   weight: 3, keywords: ['الإيرادات', 'إيرادات', 'الإيراد', 'المبيعات', 'الدخل'] },
  { skillId: 'dashboard', intent: 'profit',    weight: 3, keywords: ['الأرباح', 'صافي الربح', 'الربح', 'أرباح', 'ربحية'] },
  { skillId: 'dashboard', intent: 'alerts',    weight: 3, keywords: ['تنبيهات النظام', 'معلّقة', 'معلق', 'العمليات المعلقة', 'الفواتير المعلقة'] },
  { skillId: 'dashboard', intent: 'equipment', weight: 3, keywords: ['المعدات', 'الآليات', 'معدات معطلة', 'حالة المعدات', 'أسطول'] },
  { skillId: 'dashboard', intent: 'customers', weight: 3, keywords: ['العملاء', 'عملاء حكوميون', 'عملاء خاصون', 'توزيع العملاء', 'قطاع'] },
  { skillId: 'dashboard', intent: 'kpi',       weight: 2, keywords: ['مؤشرات', 'لوحة التحكم', 'نظرة عامة', 'ملخص عام', 'إجمالي', 'ملخص اللوحة'] },

  // ── Reports ────────────────────────────────────────────────────────────────
  { skillId: 'reports', intent: 'recommend', weight: 3, keywords: ['أنصحني', 'ماذا أختار', 'أفضل تقرير', 'اقترح تقرير'] },
  { skillId: 'reports', intent: 'discover',  weight: 2, keywords: ['تقارير متاحة', 'ما التقارير', 'اعرض التقارير', 'قائمة التقارير', 'تقرير', 'تقارير'] },
  { skillId: 'reports', intent: 'explain',   weight: 2, keywords: ['اشرح', 'شرح', 'وضّح', 'تفسير', 'فسّر'] },
  { skillId: 'reports', intent: 'compare',   weight: 2, keywords: ['قارن تقرير', 'مقارنة تقرير', 'قارن الفترات'] },
];

export function route(prompt: string): RouterDecision {
  const normalized = prompt.trim();
  if (!normalized) {
    return { skillId: null, intent: '', matchedKeywords: [], confidence: 0, fallback: true };
  }

  // Check blocked patterns BEFORE scoring — returns informational result, not error
  for (const pattern of BLOCKED_PATTERNS) {
    const matched = pattern.terms.filter(t => normalized.includes(t));
    if (matched.length > 0) {
      return {
        skillId: null,
        intent: 'blocked',
        matchedKeywords: matched,
        confidence: 0,
        fallback: false,
        blocked: true,
        blockedMessage: pattern.message,
      };
    }
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
    skillId:         best.skillId,
    intent:          best.intent,
    matchedKeywords: best.matched,
    confidence:      best.score,
    fallback:        false,
  };
}
