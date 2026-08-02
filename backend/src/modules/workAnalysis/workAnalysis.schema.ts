import { z } from 'zod';
import { ENUMS } from '@config/constants';
import { dateOnlySchema } from '@core/utils/dateOnly';

/**
 * عقد التحقق لوحدة «تحليل الشغل والعمولة».
 *
 * ملاحظة مقصودة على اللقطة: `customerPrice` و`itemLabel` و`unit` و`priceAgreementName`
 * تصل من العميل (الواجهة) لأنها **لقطة لحظة الاختيار** لا قيمة حيّة. لا تُقرأ الخدمة
 * من `project_prices` عند الحفظ إطلاقًا — وهذا هو بيت القصيد: لو قرأت الخدمة السعر
 * حيًّا لانهار عقد التجميد وتغيّرت التحاليل القديمة كلّما عُدِّلت الاتفاقية.
 * `priceId` مرجع تتبّع فقط ولا يُستخدم في أي حساب.
 */

const lineSchema = z.object({
  priceId: z.number().int().positive().nullable().optional(),
  priceAgreementName: z.string().min(1, 'اسم الاتفاقية مطلوب').max(300),
  itemLabel: z.string().min(1, 'البند مطلوب').max(300),
  unit: z.string().min(1, 'الوحدة مطلوبة').max(50),
  customerPrice: z.coerce.number().nonnegative('سعر العميل يجب ألا يكون سالبًا'),
  quantity: z.coerce.number().nonnegative('الكمية يجب ألا تكون سالبة'),
  ownerPrice: z.coerce.number().nonnegative('سعر صاحب المعدة يجب ألا يكون سالبًا'),
  sortOrder: z.coerce.number().int().nonnegative().optional(),
});

const headerShape = {
  analysisDate: dateOnlySchema,
  status: z.enum(ENUMS.workAnalysisStatus).optional(),
  customerId: z.number().int().positive().nullable().optional(),
  customerName: z.string().min(1, 'اسم العميل مطلوب').max(300),
  contractId: z.number().int().positive().nullable().optional(),
  contractName: z.string().max(300).nullable().optional(),
  asphaltPlant: z.string().max(300).nullable().optional(),
  ownerName: z.string().min(1, 'صاحب المعدة مطلوب').max(300),
  notes: z.string().max(2000).nullable().optional(),
};

export const createWorkAnalysisSchema = z.object({
  body: z.object({
    ...headerShape,
    lines: z.array(lineSchema).min(1, 'يجب إضافة بند واحد على الأقل'),
  }),
});

export const updateWorkAnalysisSchema = z.object({
  body: z.object({
    analysisDate: dateOnlySchema.optional(),
    status: z.enum(ENUMS.workAnalysisStatus).optional(),
    customerId: z.number().int().positive().nullable().optional(),
    customerName: z.string().min(1).max(300).optional(),
    contractId: z.number().int().positive().nullable().optional(),
    contractName: z.string().max(300).nullable().optional(),
    asphaltPlant: z.string().max(300).nullable().optional(),
    ownerName: z.string().min(1).max(300).optional(),
    notes: z.string().max(2000).nullable().optional(),
    // حين تُرسَل، تحلّ محلّ كل البنود (استبدال كامل). حذفها يُبقي البنود كما هي.
    lines: z.array(lineSchema).min(1, 'يجب إضافة بند واحد على الأقل').optional(),
  }),
});

export type WorkAnalysisLineInput = z.infer<typeof lineSchema>;
export type CreateWorkAnalysisInput = z.infer<typeof createWorkAnalysisSchema>['body'];
export type UpdateWorkAnalysisInput = z.infer<typeof updateWorkAnalysisSchema>['body'];
