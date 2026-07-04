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

export interface RecommendationV2 {
  id: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  message: string;
  metric: string;
  actionHint: string;
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
