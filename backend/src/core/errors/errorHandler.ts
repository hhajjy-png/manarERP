import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from './AppError';
import { logger } from '../utils/logger';

/** استجابة موحّدة للأخطاء عبر كل النظام. */
interface ErrorResponse {
  success: false;
  message: string;
  details?: unknown;
}

/**
 * معالج الأخطاء المركزي (Express error middleware).
 * يحوّل كل أنواع الأخطاء إلى استجابة موحّدة ويسجّلها.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  let statusCode = 500;
  let message = 'حدث خطأ داخلي في النظام';
  let details: unknown;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    message = 'بيانات غير صحيحة';
    details = err.flatten().fieldErrors;
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    // أخطاء Prisma الشائعة
    if (err.code === 'P2002') {
      statusCode = 409;
      const target = (err.meta?.target as string[] | undefined) ?? [];
      // تحديد نوع التعارض بدقة لتسهيل التشخيص
      if (target.includes('invoiceNumber') || target.includes('number')) {
        message = 'رقم الفاتورة مُستخدم من قبل';
        details = { code: 'DUPLICATE_INVOICE_NUMBER', fields: target };
      } else if (target.includes('entryNumber')) {
        message = 'رقم قيد اليومية مُستخدم من قبل — يرجى المحاولة مرة أخرى';
        details = { code: 'DUPLICATE_ENTRY_NUMBER', fields: target };
      } else if (target.includes('referenceType') && target.includes('referenceId')) {
        message = 'قيد محاسبي موجود مسبقاً لهذا المستند (ترحيل مزدوج)';
        details = { code: 'DUPLICATE_JOURNAL_ENTRY', fields: target };
      } else {
        message = `تعارض في البيانات — الحقل: ${target.join(', ') || 'غير محدد'}`;
        details = { code: 'DUPLICATE_VALUE', fields: target };
      }
      logger.warn('P2002 unique constraint violation', { target, model: err.meta?.modelName });
    } else if (err.code === 'P2025') {
      statusCode = 404;
      message = 'السجل غير موجود';
    } else if (err.code === 'P2003') {
      statusCode = 409;
      message = 'لا يمكن إتمام العملية بسبب ارتباط هذا السجل بسجلات أخرى';
    } else {
      statusCode = 400;
      message = 'خطأ في قاعدة البيانات';
    }
  }

  // الأخطاء غير المتوقعة تُسجّل بكامل تفاصيلها
  if (statusCode >= 500) {
    logger.error('Unhandled error', { error: err });
  }

  const body: ErrorResponse = { success: false, message };
  if (details) body.details = details;
  res.status(statusCode).json(body);
}

/** معالج المسارات غير الموجودة (404). */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ success: false, message: 'المسار المطلوب غير موجود' });
}
