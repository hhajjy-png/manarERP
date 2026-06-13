export type PrintMode = 'full-template' | 'letterhead';

export function getPrintMode(search: string): PrintMode {
  return new URLSearchParams(search).get('printMode') === 'letterhead' ? 'letterhead' : 'full-template';
}

export const PRINT_MODE_LABELS: Record<PrintMode, string> = {
  'full-template': 'طباعة القالب كامل',
  letterhead: 'طباعة على ورق الشركة الرسمي',
};
