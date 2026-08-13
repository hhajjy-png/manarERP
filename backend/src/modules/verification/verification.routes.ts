import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { validate } from '../../core/middleware/validate.middleware';
import { verifyByUuidSchema } from './verification.schema';
import { verifyByUuidHandler } from './verification.controller';

const router = Router();

// مسار عام بلا مصادقة — يُحدّ من معدل الطلبات لمنع تعداد UUIDs من صفحات خارجية
// (المسار قابل للوصول من أي عملية محلية بما فيها متصفح عادي عبر Origin: null).
const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'عدد طلبات التحقق تجاوز الحد المسموح. حاول مجدداً لاحقاً.' },
});

// Public endpoint — no authentication required for document verification
router.get('/:uuid', verifyLimiter, validate(verifyByUuidSchema), verifyByUuidHandler);

export default router;
