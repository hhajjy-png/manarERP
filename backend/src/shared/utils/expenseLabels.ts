/* ════════════════════════════════════════════════════════════════════════════
   Expenses — backend presentation-only Arabic labels (Single Source of Truth).

   PURPOSE: one place for the Arabic labels used at backend *presentation edges*
   only — Excel/PDF report cells, and GL journal-entry descriptions. Business logic,
   API responses, and stored data keep using the English enum CODES; Arabic never
   becomes an API contract or a persisted value.

   ⚠️ Keys MUST match ENUMS.expenseCategory / expenseStatus / expensePaymentMethod
      in backend/src/config/constants.ts, and stay in sync with the frontend SoT
      frontend/src/config/expenseCategories.ts (categories) and
      frontend/src/config/expensePresentation.ts (status / payment).
   ════════════════════════════════════════════════════════════════════════════ */

// ── Expense category → Arabic (display / journal-label only) ──────────────────
export const EXPENSE_CATEGORY_AR: Record<string, string> = {
  // تشغيل عام
  FUEL: 'وقود',
  OILS: 'زيوت وتشحيم',
  PURCHASES: 'مشتريات',
  SERVICES: 'خدمات',
  RENT: 'إيجارات',
  EQUIPMENT: 'معدات',
  EQUIPMENT_RENT: 'إيجار معدات',
  TRUCK_RENT: 'إيجار شاحنات',
  SALARIES: 'رواتب',
  // مركبات
  MAINTENANCE: 'صيانة',
  TIRES: 'إطارات وتواير',
  BATTERY: 'شراء بطارية',
  VEHICLE_PAINT: 'صبغ سيارة',
  VEHICLE_BODYWORK: 'حدادة سيارة',
  VEHICLE_ELECTRICAL: 'كهرباء سيارة',
  TOW_TRUCK: 'كرين سحب',
  VEHICLE_INSURANCE: 'رسوم تأمين دفتر مركبة',
  VEHICLE_REGISTRATION: 'رسوم تجديد دفتر مركبة',
  // رسوم حكومية
  GOVERNMENT_FEES: 'رسوم شؤون',
  RESIDENCY: 'رسوم إقامة',
  LABOR_INSURANCE: 'رسوم تأمين عمالة',
  TOLL: 'رسوم مرور',
  TRAFFIC_VIOLATIONS: 'مخالفات مرورية',
  COURT_FEES: 'رسوم قضائية',
  // عن طريق أشخاص
  HASSAN: 'مصروف عن طريق حسن',
  GHANEM: 'مصروف عن طريق غانم',
  NATHEER: 'مصروف عن طريق نظير',
  HAROON: 'مصروف عن طريق هارون',
  BILLS_NAZEER: 'فواتير عن طريق نظير',
  DRIVER_EXPENSES: 'مصروف عن طريق سائق',
  DRIVER_MEALS: 'أكل للسواق',
  // أخرى
  CHARITY: 'صدقة شهرية',
  GIFTS: 'هدايا',
  MISC: 'مصروفات متفرقة',
  OTHER: 'أخرى',
};

/** Arabic label for an expense category code — falls back to the raw code. */
export function expenseCategoryAr(code: string | null | undefined): string {
  if (!code) return '';
  return EXPENSE_CATEGORY_AR[code] ?? code;
}

// ── Expense status → Arabic (display only) ────────────────────────────────────
export const EXPENSE_STATUS_AR: Record<string, string> = {
  PENDING: 'معلّق',
  APPROVED: 'معتمد',
  REJECTED: 'مرفوض',
  REVERSED: 'مُلغى الاعتماد',
  CANCELLED: 'ملغى',
};

/** Arabic label for an expense status code — falls back to the raw code. */
export function expenseStatusAr(status: string | null | undefined): string {
  if (!status) return '';
  return EXPENSE_STATUS_AR[status] ?? status;
}

// ── GL payment method → Arabic (journal-description only) ──────────────────────
// Uses the GL vocabulary (CASH / BANK / ACCOUNTS_PAYABLE). Defaults to cash.
export const GL_PAYMENT_METHOD_AR: Record<string, string> = {
  CASH: 'صرف نقدي',
  BANK: 'تحويل بنكي',
  ACCOUNTS_PAYABLE: 'ذمم مورد',
};

/** Arabic label for a GL payment method — defaults to "صرف نقدي". */
export function glPaymentMethodAr(method: string | null | undefined): string {
  return (method && GL_PAYMENT_METHOD_AR[method]) || GL_PAYMENT_METHOD_AR.CASH;
}
