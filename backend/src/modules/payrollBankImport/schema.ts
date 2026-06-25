import { z } from 'zod';

const ParsedBankRowSchema = z.object({
  employeeCode:   z.string().nullable(),
  civilId:        z.string().nullable(),
  iban:           z.string().nullable(),
  bankAccount:    z.string().nullable(),
  beneficiaryName: z.string(),
  amount:         z.number(),
  currency:       z.string(),
  transactionId:  z.string().nullable(),
  paymentDate:    z.string().nullable(),
  paymentStatus:  z.string().nullable(),
  payrollMonth:   z.number().int().min(0).max(12),
  payrollYear:    z.number().int().min(0).max(2200),
  _rowIndex:      z.number().int(),
  _sheetName:     z.string(),
});

export const PreviewInputSchema = z.object({
  templateName: z.string().min(1).max(64),
  rows: z.array(ParsedBankRowSchema).min(1).max(2000),
});

export const ExecuteInputSchema = z.object({
  templateName: z.string().min(1).max(64),
  rows: z.array(ParsedBankRowSchema).min(1).max(2000),
  confirm: z.literal(true),
});

const ImportReportRowSchema = z.object({
  employeeCode:  z.string().max(64).nullable(),
  employeeName:  z.string().max(256).nullable(),
  civilId:       z.string().max(32).nullable(),
  amount:        z.number().nonnegative(),
  currency:      z.string().max(8),
  transactionId: z.string().max(128).nullable(),
  paymentDate:   z.string().max(64).nullable(),
  payrollMonth:  z.number().int().min(1).max(12),
  payrollYear:   z.number().int().min(2000).max(2100),
  status:        z.enum(['imported', 'skipped']),
  reason:        z.string().max(512).optional(),
});

const ImportReportSchema = z.object({
  templateName: z.string().max(64),
  importedAt:   z.string().max(64),
  importedBy:   z.string().max(128),
  imported:     z.number().int().nonnegative(),
  skipped:      z.number().int().nonnegative(),
  withWarnings: z.number().int().nonnegative(),
  totalAmount:  z.number().nonnegative(),
  rows:         z.array(ImportReportRowSchema).max(2000),
});

export const ReportExportSchema = z.object({
  format: z.enum(['excel', 'pdf']),
  report: ImportReportSchema,
});
