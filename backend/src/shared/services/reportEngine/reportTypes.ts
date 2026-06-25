/** Types shared across the unified HTML report engine. */

export type PrintProfile =
  | 'a4-landscape' // default — financial reports, wide tables
  | 'a4-portrait'  // employees, attendance, narrow tables
  | 'statement'    // customer/supplier statements, A4 portrait
  | 'journal'      // journal book, A4 landscape
  | 'receipt'      // A5 portrait, compact
  | 'letter';      // A4 portrait, wide margins

export type WatermarkType =
  | 'draft'
  | 'copy'
  | 'original'
  | 'cancelled'
  | 'approved'
  | 'rejected'
  | 'confidential';

export interface ReportBranding {
  companyNameAr: string;
  companyNameEn?: string;
  /** Base64-encoded PNG/JPG — future use. */
  logoBase64?: string;
  primaryColor?: string;    // default #1d4e6f
  secondaryColor?: string;  // default #2563eb
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  commercialReg?: string;
  footer?: string;
}

export interface ReportOptions {
  /** Page size and orientation. Default: 'a4-landscape'. */
  profile?: PrintProfile;
  /** Company branding shown in document header. */
  branding?: ReportBranding;
  /** Diagonal overlay text. */
  watermark?: WatermarkType;
  /** Username of the person who generated the report. */
  generatedBy?: string;
  /** Timestamp override — defaults to now. */
  generatedAt?: Date;
  /** Date range shown below the title. */
  dateRange?: { from?: string; to?: string };
  /** Free-text notes shown below the table. */
  notes?: string;
  /** Render two signature lines (accountant + manager). */
  showSignatureArea?: boolean;
  /** Show page x / y in the page footer. Default true. */
  showPageNumbers?: boolean;
}
