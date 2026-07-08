import type { Request, Response } from 'express';
import { payrollBankImportService } from './service';
import { buildImportReportExcel, buildImportReportHtml } from './reportBuilder';
import { PreviewInputSchema, ExecuteInputSchema, ReportExportSchema } from './schema';
import { ok } from '../../core/utils/response';
import { sendExcel } from '../../core/utils/excelResponse';
import { AppError } from '../../core/errors/AppError';

export async function previewHandler(req: Request, res: Response): Promise<void> {
  const parsed = PreviewInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');
  const summary = await payrollBankImportService.preview(parsed.data);
  ok(res, summary);
}

export async function executeHandler(req: Request, res: Response): Promise<void> {
  const parsed = ExecuteInputSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات غير صحيحة');
  const report = await payrollBankImportService.execute(parsed.data, req);
  ok(res, report);
}

export async function reportExcelHandler(req: Request, res: Response): Promise<void> {
  const parsed = ReportExportSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات التقرير غير صحيحة');
  const buffer = await buildImportReportExcel(parsed.data.report);
  sendExcel(res, buffer, 'payroll-import-report.xlsx');
}

export async function reportPdfHandler(req: Request, res: Response): Promise<void> {
  const parsed = ReportExportSchema.safeParse(req.body);
  if (!parsed.success) throw AppError.badRequest(parsed.error.errors[0]?.message ?? 'بيانات التقرير غير صحيحة');
  const html = buildImportReportHtml(parsed.data.report);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="payroll-import-report.html"');
  res.setHeader('Content-Security-Policy', "sandbox; default-src 'none'");
  res.send(html);
}
