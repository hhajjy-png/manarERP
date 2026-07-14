import type { ReactNode } from 'react';

// ── Shared shapes for the Executive Command Center ───────────────────────────
// Mirror the real backend output of GET /executive/decision-center
// (see backend/src/modules/executive/executive.service.ts) and GET /dashboard/activity.

export interface MonthFin { revenue: number; expenses: number; collections: number; profit: number }

export interface MonthOnMonthChanges {
  revenue: number | null;
  expenses: number | null;
  collections: number | null;
  profit: number | null;
}

export interface FinancialSummary {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  totalCollected: number;
  totalOutstanding: number;
  overallProfitMargin: number | null;
  overallCollectionRate: number | null;
  thisMonth: MonthFin;
  lastMonth: MonthFin;
  monthOnMonthChanges: MonthOnMonthChanges;
  topDebtors: { customerId: number; name: string; outstanding: number; oldestDays: number }[];
  topCustomersByRevenue: { customerId: number; name: string; revenue: number; collected: number }[];
  topContractsByProfit: {
    id: number; code: string; asphaltPlant: string;
    revenue: number; expenses: number; profit: number;
    profitMargin: number | null; collectionRate: number | null;
  }[];
  activeContracts: number;
  totalContracts: number;
}

export interface HealthScoreData {
  total: number;
  label: 'EXCELLENT' | 'GOOD' | 'WATCH' | 'RISK';
  labelAr: string;
  explanation: string;
  components: {
    collections: number;
    profitability: number;
    outstanding: number;
    cashFlow: number;
    contracts: number;
    stability: number;
  };
}

export interface DecisionCard {
  id: string;
  title: string;
  value: string;
  explanation: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  recommendedAction: string;
  relatedId?: number;
  relatedType?: 'CUSTOMER' | 'CONTRACT';
  amount?: number;
}

export interface AlertV3 {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  type: string;
  title: string;
  description: string;
  amount: number | null;
  relatedId?: number;
  relatedType?: string;
  actionLabel?: string;
}

/**
 * ما يرسله `/executive/decision-center` **فعلًا** (قِيس من الاستجابة الحيّة):
 *   { id, priority, title, reason, expectedImpact, suggestedAction, metric }
 *
 * كان هذا النوع يُعلن `message` و`actionHint` **إلزاميين**، ولا وجود لهما في الاستجابة.
 * الردّ يُصنَّف (`as`) بلا تحقّق وقت التشغيل، فلم يرَ المُصرِّف الفرق، وظلّ
 * `{rec.message}` يُصيَّر `undefined` — أي **متن بطاقة فارغ بصمت** في الإنتاج.
 *
 * الحقول الغائبة صارت اختيارية ليعكس النوع الواقع، وأُضيفت الحقول التي ترسلها الخلفية.
 * **أيّها يُعرض للمستخدم قرارٌ منتَج، ولم يُغيَّر هنا شيء من العرض ولا من المنطق.**
 */
export interface RecommendationV2 {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  metric: string;
  /** لا ترسله الخلفية حاليًا. */
  message?: string;
  /** لا ترسله الخلفية حاليًا. */
  actionHint?: string;
  /** ترسله الخلفية. */
  reason?: string;
  /** ترسله الخلفية. */
  expectedImpact?: string;
  /** ترسله الخلفية. */
  suggestedAction?: string;
}

/**
 * متن بطاقة التوصية.
 *
 * الواجهة كانت تقرأ `message` وحده، والخلفية **لا ترسله** — فبقي المتن فارغًا بصمت.
 * الحقول التي ترسلها فعلًا هي `reason` و`suggestedAction` و`expectedImpact`.
 *
 * نأخذ **أوّل نصّ صالح** بالترتيب المعتمد؛ ولا نجمع الحقول في فقرة واحدة، ولا نخترع
 * نصًّا بديلًا: غياب كل النصوص ⇒ `undefined`، فلا يُصيَّر شيء (لا شرطة ولا حشو).
 *
 * الفراغات وحدها ليست نصًّا: حقل قيمته `'   '` يُتخطّى إلى التالي.
 */
export function getRecommendationBody(rec: RecommendationV2): string | undefined {
  for (const field of [rec.message, rec.reason, rec.suggestedAction, rec.expectedImpact]) {
    if (typeof field === 'string' && field.trim() !== '') return field;
  }
  return undefined;
}

export interface DecisionCenterData {
  financialSummary: FinancialSummary;
  decisionCards: DecisionCard[];
  alertsV3: AlertV3[];
  healthScore: HealthScoreData;
  recommendations: RecommendationV2[];
}

export interface ActivityRow {
  id: number;
  action: string;
  module: string;
  entityId: string | null;
  createdAt: string;
  user: { fullName: string } | null;
}

export interface RevenueSlice { name: string; value: number }

/** Registry entry for the composition layer — enables future hide/show/reorder. */
export interface DashboardSection {
  id: string;
  title?: string;
  permission?: string;
  node: ReactNode;
}
