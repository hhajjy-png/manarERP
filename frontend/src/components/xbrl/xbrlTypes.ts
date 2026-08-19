/**
 * أنواع واجهة جاهزية XBRL — مرآة لما يُرجعه `/api/xbrl`.
 *
 * ⚠ لا يوجد نوع اسمه `QaydCompliance` ولا حقل `qaydReady`. أقصى ما يصفه هذا الملف هو
 *   «جاهزية داخلية بانتظار تصنيف رسمي».
 */

export type XbrlSeverity = 'ERROR' | 'WARNING' | 'INFO';
export type XbrlMappingStatus = 'MAPPED' | 'UNMAPPED' | 'NEEDS_REVIEW' | 'NOT_APPLICABLE';
export type XbrlReadinessStatus = 'NOT_READY' | 'IN_PROGRESS' | 'READY_PENDING_TAXONOMY';
export type XbrlStatementType = 'SFP' | 'IS' | 'CF' | 'SCE' | 'NOTES' | 'NONE';

export interface XbrlTaxonomy {
  id: number;
  code: string;
  nameAr: string;
  nameEn: string | null;
  jurisdiction: string;
  version: string;
  status: string;
  isOfficial: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  _count?: { concepts: number; accountMappings: number };
}

export interface XbrlConcept {
  id: number;
  taxonomyId: number;
  conceptCode: string;
  labelAr: string;
  labelEn: string | null;
  statementType: XbrlStatementType;
  balanceType: string;
  periodType: string;
  isRequired: boolean;
  displayOrder: number;
}

export interface XbrlStatementLine {
  id: number;
  taxonomyId: number;
  statementType: XbrlStatementType;
  lineCode: string;
  lineLabelAr: string;
  lineLabelEn: string | null;
  parentLineCode: string | null;
  conceptId: number | null;
  displayOrder: number;
  isTotal: boolean;
  isEnabled: boolean;
  concept?: { id: number; conceptCode: string; labelAr: string } | null;
}

export interface XbrlReportingContext {
  id: number | null;
  name: string;
  entityName: string;
  entityIdentifier: string | null;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  instantDate: string | null;
  comparativePeriodStart: string | null;
  comparativePeriodEnd: string | null;
  currency: string;
  decimals: number;
  reportingLanguage: string;
  isDefault: boolean;
}

export interface XbrlValidationFinding {
  code: string;
  severity: XbrlSeverity;
  category: 'ACCOUNTING' | 'REPORTING' | 'MAPPING' | 'EXPORT';
  messageAr: string;
  entityType?: string;
  entityIds?: number[];
  details?: Record<string, unknown>;
}

export interface XbrlValidationResult {
  findings: XbrlValidationFinding[];
  errorCount: number;
  warningCount: number;
  infoCount: number;
  isValid: boolean;
}

export interface XbrlReadinessScore {
  applicableAccounts: number;
  mapped: number;
  unmapped: number;
  needsReview: number;
  notApplicable: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  mappedPercentage: number;
  status: XbrlReadinessStatus;
  officialTaxonomyInstalled: boolean;
}

export interface XbrlAccountRow {
  accountId: number;
  code: string;
  name: string;
  type: string;
  balance: number;
  mappingStatus: XbrlMappingStatus;
  mappingId: number | null;
  conceptId: number | null;
  conceptCode: string | null;
  conceptLabelAr: string | null;
  notes: string | null;
}

export interface XbrlEquation {
  assets: number;
  liabilities: number;
  equity: number;
  revenue: number;
  expenses: number;
  netResult: number;
  totalEquityWithResult: number;
  difference: number;
  isBalanced: boolean;
  unclassifiedAccountIds: number[];
}

export interface XbrlReadinessReport {
  generatedAt: string;
  taxonomy: XbrlTaxonomy | null;
  context: XbrlReportingContext | null;
  company: { name: string | null; nameEn: string | null; country: string | null };
  trialBalance: { totalDebit: number; totalCredit: number; difference: number; isBalanced: boolean };
  equation: XbrlEquation;
  score: XbrlReadinessScore;
  validation: XbrlValidationResult;
  accounts: XbrlAccountRow[];
}

export interface XbrlSnapshotRow {
  id: number;
  snapshotNumber: string;
  taxonomyCode: string | null;
  taxonomyVersion: string | null;
  taxonomyIsOfficial: boolean;
  fiscalYear: number;
  periodStart: string;
  periodEnd: string;
  sourceHash: string;
  createdByName: string | null;
  createdAt: string;
}

/** ألوان الحالات — مرجع واحد يمنع اختلاف اللون بين تبويب وآخر. */
export const MAPPING_STATUS_TONE: Record<XbrlMappingStatus, 'green' | 'orange' | 'red' | 'neutral'> = {
  MAPPED: 'green',
  NEEDS_REVIEW: 'orange',
  UNMAPPED: 'red',
  NOT_APPLICABLE: 'neutral',
};

export const SEVERITY_TONE: Record<XbrlSeverity, 'red' | 'orange' | 'blue'> = {
  ERROR: 'red',
  WARNING: 'orange',
  INFO: 'blue',
};

export const STATEMENT_TYPES: XbrlStatementType[] = ['SFP', 'IS', 'CF', 'SCE', 'NOTES'];
