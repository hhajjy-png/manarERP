export interface DrillDownRef {
  entityType: 'INVOICE' | 'EXPENSE' | 'PAYMENT' | 'JOURNAL_ENTRY' | 'CONTRACT' | 'CUSTOMER' | 'SUPPLIER' | 'GL_ACCOUNT';
  entityId: number;
  route?: string;
  label: string;
}

const DRILL_DOWN_ROUTES: Partial<Record<DrillDownRef['entityType'], string>> = {
  INVOICE:       '/invoices',
  EXPENSE:       '/expenses',
  PAYMENT:       '/invoices',
  JOURNAL_ENTRY: '/accounting',
  CONTRACT:      '/contracts',
  CUSTOMER:      '/customers',
  SUPPLIER:      '/suppliers',
  GL_ACCOUNT:    '/financial',
};

export function buildDrillDownRef(
  entityType: DrillDownRef['entityType'],
  entityId: number,
  labelOverride?: string
): DrillDownRef {
  return {
    entityType,
    entityId,
    route: DRILL_DOWN_ROUTES[entityType],
    label: labelOverride ?? `${entityType}-${entityId}`,
  };
}
