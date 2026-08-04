/**
 * سياسة مركز التحليل المالي كما تراها الواجهة.
 *
 * قيمة واحدة فقط تحتاج الواجهة معرفتها من سياسة المحرّك التشغيلي: حالة المصروف
 * المعتمدة رسميًا. مصدرها الوحيد هو `EXPENSE_OPERATIONAL_STATUS` في
 * `backend/src/shared/services/operational.reporting.ts`؛ تُعاد كتابتها هنا لأن
 * الواجهة لا تستورد من الخادم، ويجب أن تبقى مطابقة له.
 */
export const EXPENSE_OPERATIONAL_STATUS = 'APPROVED';
