import { formatFileDate } from '../lib/date';

/** Fixed product prefix for every exported file. */
const PREFIX = 'manarERP';

/** Illegal on Windows/most filesystems, plus ASCII control characters. */
const ILLEGAL_CHARS = /[\\/:*?"<>|\x00-\x1f]/g;

/** Canonical, type-safe report-name vocabulary — spelled ONE way everywhere. */
export const ReportName = {
  Invoice: 'Invoice',
  Quotation: 'Quotation',
  CustomerStatement: 'CustomerStatement',
  SupplierStatement: 'SupplierStatement',
  ARAging: 'ARAging',
  APAging: 'APAging',
  GeneralLedger: 'GeneralLedger',
  GeneralLedgerReport: 'GeneralLedgerReport',
  TrialBalance: 'TrialBalance',
  JournalBook: 'JournalBook',
  FinancialSummary: 'FinancialSummary',
  BankStatement: 'BankStatement',
  BankAnalytics: 'BankAnalytics',
  BankAccountTimeline: 'BankAccountTimeline',
  BankAccountLedger: 'BankAccountLedger',
  PayrollReport: 'PayrollReport',
  PayrollImport: 'PayrollImport',
  ExecutiveReport: 'ExecutiveReport',
  DocumentExpirations: 'DocumentExpirations',
  Report: 'Report',
  Expenses: 'Expenses',
  InvoicesList: 'InvoicesList', // list/table export, distinct from single-invoice `Invoice`
  MonthlyReport: 'MonthlyReport',
  PriceAgreements: 'PriceAgreements',
  // Generic data-module (ResourcePage) list exports:
  Customers: 'Customers',
  Suppliers: 'Suppliers',
  Equipment: 'Equipment',
  Employees: 'Employees',
  Contracts: 'Contracts',
  Users: 'Users',
} as const;

export type ReportNameValue = (typeof ReportName)[keyof typeof ReportName];

/**
 * Maps a data-module key (as used by ResourcePage / the reports export endpoint)
 * to its canonical ReportName. Keeps generic-CRUD exports in the same PascalCase
 * vocabulary as every other report, instead of leaking raw lowercase module keys.
 */
const RESOURCE_REPORT_NAMES: Record<string, string> = {
  contracts: ReportName.Contracts,
  customers: ReportName.Customers,
  suppliers: ReportName.Suppliers,
  equipment: ReportName.Equipment,
  employees: ReportName.Employees,
  expenses: ReportName.Expenses,
  users: ReportName.Users,
};

/** PascalCase a module key: 'bank-accounts' → 'BankAccounts'. */
function pascalCaseKey(key: string): string {
  return key
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Resolve a data-module key to a canonical report name for ResourcePage exports.
 * Known modules map to a fixed ReportName; any unmapped (e.g. future) module
 * falls back to a PascalCase of its key so the export is never left with a raw
 * lowercase key or an empty report-name segment.
 */
export function resourceReportName(moduleKey: string): string {
  return RESOURCE_REPORT_NAMES[moduleKey] ?? pascalCaseKey(moduleKey);
}

export interface ExportFileNameParts {
  /** Canonical report name. Prefer a ReportName.* value. */
  reportName: string;
  /** Best available identifier; omitted from the name when empty after sanitizing. */
  identifier?: string | number | null;
  /** Defaults to now. Formatted YYYY-MM-DD (local) via lib/date.formatFileDate. */
  date?: Date | string | number;
  /** Extension WITHOUT the leading dot ('pdf' | 'xlsx' | 'csv'). */
  extension: string;
}

/** Sanitize a single filename segment per the manarERP export standard. */
export function sanitizeFilenameSegment(
  input: string | number | null | undefined,
): string {
  if (input === null || input === undefined) return '';
  return String(input)
    .replace(ILLEGAL_CHARS, '')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
}

function normalizeExtension(ext: string): string {
  return sanitizeFilenameSegment(ext.replace(/^\.+/, '')).toLowerCase();
}

/** Build a filename following the official manarERP export standard. */
export function generateExportFileName(parts: ExportFileNameParts): string {
  const dateStr = formatFileDate(parts.date);
  const base = [PREFIX, parts.reportName, parts.identifier, dateStr]
    .map(sanitizeFilenameSegment)
    .filter((segment) => segment.length > 0)
    .join('_')
    .replace(/_+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '');
  const ext = normalizeExtension(parts.extension);
  return ext ? `${base}.${ext}` : base;
}
