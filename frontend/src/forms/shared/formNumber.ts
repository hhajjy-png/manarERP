const PREFIXES: Record<string, string> = {
  'salary-certificate': 'SAL',
  'to-whom-it-may-concern': 'TWM',
  'leave-request': 'LV',
  'return-to-work': 'RTW',
  'salary-advance': 'ADV',
  resignation: 'RES',
  'employee-warning': 'WRN',
  'performance-evaluation': 'EVA',
  'employment-contract': 'EMP',
  quotation: 'QTN',
  'purchase-request': 'PR',
  'payment-voucher': 'PV',
};

export function generateFormNumber(formType: string): string {
  const prefix = PREFIXES[formType] ?? 'FRM';
  const year = new Date().getFullYear();
  const seq = String((Math.floor(Date.now() / 100) % 9000) + 1000);
  return `${prefix}-${year}-${seq}`;
}
