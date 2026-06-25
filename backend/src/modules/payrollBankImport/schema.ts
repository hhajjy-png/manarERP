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

export const ReportExportSchema = z.object({
  format: z.enum(['excel', 'pdf']),
  report: z.any(),
});
