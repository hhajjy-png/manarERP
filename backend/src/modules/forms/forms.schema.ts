import { z } from 'zod';

/**
 * تسجيل طباعة نموذج إداري.
 *
 * كان `POST /forms/print-log` يمرّر `req.body` كما وصل إلى `recordAudit` ليُخزَّن في
 * `AuditLog.oldValue`، بلا أي مخطط عند أي طبقة: فأي كائن JSON بأي شكل وبأي حجم (حتى
 * حدّ `express.json`) كان يُكتب في سجل التدقيق. توقيع الدالة في الخدمة كان يصف حقولًا
 * لا شيء يفرضها. المخطط هنا يقصّ الحمولة على الحقول المعروفة فقط — `strict` يرفض أي
 * حقل زائد بدل تمريره صامتًا — ويحدّ أطوال النصوص.
 */
export const logPrintSchema = z.object({
  body: z
    .object({
      formType: z.string().min(1).max(100),
      formNumber: z.string().max(100),
      employeeId: z.coerce.number().int().positive(),
      employeeName: z.string().max(200),
      issueDate: z.string().max(40),
      printMode: z.string().max(60),
    })
    .strict(),
});
