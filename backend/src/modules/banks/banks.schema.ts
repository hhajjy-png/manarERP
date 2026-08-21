import { z } from 'zod';

/**
 * سجل البنوك والحسابات البنكية — Multi-Bank Cheques Foundation v1.
 *
 * ملاحظتان تعاقديتان مقصودتان:
 *
 *  1. `printProfileKey` غير موجود في أي مخطط هنا. قالب الطباعة لكل حساب حزمة
 *     لاحقة تُبنى على نموذج شيك حقيقي وأبعاد فعلية بالمليمتر من مالك المنتج.
 *     تركه خارج الـAPI يعني أنه لا يوجد أي مسار — لا واجهة ولا طلب — يمنح
 *     حسابًا جديدًا قالبًا وهميًا أو يورّثه قالب بنك الخليج.
 *
 *  2. لا `accountNumber` ولا `iban`. الحساب يُعرَّف للمستخدم بـ
 *     «اسم البنك — اسم الحساب» فقط، و`accountName` هو المميِّز عند تعدد
 *     حسابات البنك الواحد.
 */

/** معرّف البنك الداخلي: أحرف إنجليزية كبيرة وأرقام وشرطة سفلية — لا يعتمد على
 *  الاسم العربي إطلاقًا، فإعادة تسمية البنك لا تكسر أي ربط. */
const bankCodeSchema = z
  .string()
  .trim()
  .min(2, 'معرّف البنك يجب أن يكون حرفين على الأقل')
  .max(32, 'معرّف البنك طويل جدًا')
  .regex(/^[A-Z0-9_]+$/, 'معرّف البنك يجب أن يتكوّن من أحرف إنجليزية كبيرة وأرقام وشرطة سفلية فقط');

export const createBankSchema = z.object({
  body: z.object({
    code: bankCodeSchema,
    nameAr: z.string().trim().min(1, 'اسم البنك بالعربية مطلوب').max(120),
    nameEn: z.string().trim().max(120).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

/** التعديل لا يشمل `code`: المعرّف الداخلي مرساة ثابتة، وتغييره يعني تغيير هوية
 *  البنك تحت شيكات مُصدَرة بالفعل. الاسم قابل للتعديل، المعرّف لا. */
export const updateBankSchema = z.object({
  body: z.object({
    nameAr: z.string().trim().min(1, 'اسم البنك بالعربية مطلوب').max(120).optional(),
    nameEn: z.string().trim().max(120).nullable().optional(),
    isActive: z.boolean().optional(),
  }),
});

export const createBankAccountSchema = z.object({
  body: z.object({
    bankId: z.coerce.number().int().positive('البنك مطلوب'),
    accountName: z.string().trim().min(1, 'اسم الحساب مطلوب').max(120),
    isActive: z.boolean().optional(),
    /** جسر اختياري إلى `accountKey` في كشوف البنوك — يجعل مطابقة حركات الكشف
     *  بالشيكات واعية بالحساب. فارغ = لا ربط (السلوك القديم غير الملتبس). */
    statementAccountKey: z.string().trim().max(200).nullable().optional(),
  }),
});

export const updateBankAccountSchema = z.object({
  body: z.object({
    accountName: z.string().trim().min(1, 'اسم الحساب مطلوب').max(120).optional(),
    isActive: z.boolean().optional(),
    statementAccountKey: z.string().trim().max(200).nullable().optional(),
  }),
});

export type CreateBankInput = z.infer<typeof createBankSchema>['body'];
export type UpdateBankInput = z.infer<typeof updateBankSchema>['body'];
export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>['body'];
export type UpdateBankAccountInput = z.infer<typeof updateBankAccountSchema>['body'];
