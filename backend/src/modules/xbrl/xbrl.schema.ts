/**
 * مخططات التحقق من مدخلات جاهزية XBRL.
 *
 * ⚠ لاحظ ما **ليس** هنا: لا حقل `isOfficial` في أي مخطط إنشاء أو تعديل تصنيف، ولا
 *   حقل `status` في مخطط الإنشاء. Zod هنا هو الحاجز الأول: ما لا يُقبَل في المخطط لا
 *   يصل إلى الخدمة أصلًا، فلا يعتمد منع ادّعاء الرسمية على يقظة الخدمة وحدها.
 */
import { z } from 'zod';
import { ENUMS } from '../../config/constants';
import { XBRL_EXPORT_FORMATS } from './xbrl.constants';

const idParam = z.coerce.number().int().positive();

/** تاريخ ISO اختياري → `Date` أو `null`. السلسلة الفارغة تعني «امسح القيمة». */
const optionalDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null || v === '' ? null : new Date(v)))
  .refine((v) => v == null || !Number.isNaN(v.getTime()), { message: 'تاريخ غير صالح' });

const requiredDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاريخ غير صالح' })
  .transform((v) => new Date(v));

export const idParamsSchema = z.object({ params: z.object({ id: idParam }) });

// ─── التصنيفات ───────────────────────────────────────────────────────────────

export const listTaxonomiesSchema = z.object({
  query: z.object({
    status: z.enum(ENUMS.xbrlTaxonomyStatus).optional(),
    jurisdiction: z.enum(ENUMS.xbrlJurisdiction).optional(),
  }),
});

export const createTaxonomySchema = z.object({
  body: z.object({
    code: z.string().trim().min(2).max(64).regex(/^[A-Za-z0-9._-]+$/, 'رمز التصنيف يقبل الحروف اللاتينية والأرقام و . _ - فقط'),
    nameAr: z.string().trim().min(2).max(200),
    nameEn: z.string().trim().max(200).nullish(),
    jurisdiction: z.enum(ENUMS.xbrlJurisdiction),
    version: z.string().trim().min(1).max(50),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    source: z.string().trim().max(500).nullish(),
    metadataJson: z.string().max(20000).nullish(),
    // `isOfficial` و `status` غير مقبولين هنا عمدًا — انظر رأس الملف.
  }),
});

export const updateTaxonomySchema = z.object({
  params: z.object({ id: idParam }),
  body: createTaxonomySchema.shape.body.omit({ code: true }).partial(),
});

export const setTaxonomyStatusSchema = z.object({
  params: z.object({ id: idParam }),
  body: z.object({ status: z.enum(ENUMS.xbrlTaxonomyStatus) }),
});

// ─── المفاهيم ────────────────────────────────────────────────────────────────

export const listConceptsSchema = z.object({
  query: z.object({
    taxonomyId: idParam.optional(),
    statementType: z.enum(ENUMS.xbrlStatementType).optional(),
    search: z.string().trim().max(200).optional(),
  }),
});

export const createConceptSchema = z.object({
  body: z.object({
    taxonomyId: idParam,
    conceptCode: z.string().trim().min(1).max(200),
    namespace: z.string().trim().max(500).nullish(),
    labelAr: z.string().trim().min(1).max(300),
    labelEn: z.string().trim().max(300).nullish(),
    dataType: z.enum(ENUMS.xbrlDataType).optional(),
    balanceType: z.enum(ENUMS.xbrlBalanceType).optional(),
    periodType: z.enum(ENUMS.xbrlPeriodType).optional(),
    statementType: z.enum(ENUMS.xbrlStatementType).optional(),
    parentConceptId: idParam.nullish(),
    isRequired: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(100000).optional(),
    metadataJson: z.string().max(20000).nullish(),
  }),
});

export const updateConceptSchema = z.object({
  params: z.object({ id: idParam }),
  body: createConceptSchema.shape.body.omit({ taxonomyId: true }).partial(),
});

// ─── ربط الحسابات ────────────────────────────────────────────────────────────

export const listAccountMappingsSchema = z.object({
  query: z.object({
    taxonomyId: idParam.optional(),
    accountId: idParam.optional(),
    conceptId: idParam.optional(),
    status: z.enum(ENUMS.xbrlMappingStatus).optional(),
  }),
});

export const createAccountMappingSchema = z.object({
  body: z.object({
    taxonomyId: idParam,
    accountId: idParam,
    conceptId: idParam,
    status: z.enum(ENUMS.xbrlMappingStatus).optional(),
    isEnabled: z.boolean().optional(),
    effectiveFrom: optionalDate,
    effectiveTo: optionalDate,
    source: z.enum(ENUMS.xbrlMappingSource).optional(),
    notes: z.string().trim().max(1000).nullish(),
  }),
});

export const updateAccountMappingSchema = z.object({
  params: z.object({ id: idParam }),
  body: createAccountMappingSchema.shape.body.omit({ taxonomyId: true, accountId: true }).partial(),
});

// ─── ربط بنود القوائم ────────────────────────────────────────────────────────

export const listStatementMappingsSchema = z.object({
  query: z.object({
    taxonomyId: idParam.optional(),
    statementType: z.enum(ENUMS.xbrlStatementType).optional(),
  }),
});

export const createStatementMappingSchema = z.object({
  body: z.object({
    taxonomyId: idParam,
    // NONE ليست قائمة مالية — بند القائمة يجب أن ينتمي إلى قائمة حقيقية.
    statementType: z.enum(['SFP', 'IS', 'CF', 'SCE', 'NOTES']),
    lineCode: z.string().trim().min(1).max(100),
    lineLabelAr: z.string().trim().min(1).max(300),
    lineLabelEn: z.string().trim().max(300).nullish(),
    parentLineCode: z.string().trim().max(100).nullish(),
    conceptId: idParam.nullish(),
    displayOrder: z.number().int().min(0).max(100000).optional(),
    isTotal: z.boolean().optional(),
    isEnabled: z.boolean().optional(),
    accountFilterJson: z.string().max(20000).nullish(),
    notes: z.string().trim().max(1000).nullish(),
  }),
});

export const updateStatementMappingSchema = z.object({
  params: z.object({ id: idParam }),
  body: createStatementMappingSchema.shape.body.omit({ taxonomyId: true }).partial(),
});

// ─── سياق التقرير ────────────────────────────────────────────────────────────

export const listContextsSchema = z.object({
  query: z.object({ fiscalYear: z.coerce.number().int().min(1900).max(2200).optional() }),
});

export const createContextSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(200),
    taxonomyId: idParam.nullish(),
    entityName: z.string().trim().min(2).max(300),
    entityNameEn: z.string().trim().max(300).nullish(),
    entityIdentifier: z.string().trim().max(100).nullish(),
    entityScheme: z.string().trim().max(200).nullish(),
    fiscalYear: z.number().int().min(1900).max(2200),
    periodStart: requiredDate,
    periodEnd: requiredDate,
    instantDate: optionalDate,
    comparativePeriodStart: optionalDate,
    comparativePeriodEnd: optionalDate,
    // رمز عملة ISO من ثلاثة أحرف كبيرة — الافتراضي KWD.
    currency: z.string().trim().regex(/^[A-Z]{3}$/, 'رمز العملة يجب أن يكون ثلاثة أحرف لاتينية كبيرة').optional(),
    decimals: z.number().int().min(0).max(6).optional(),
    reportingLanguage: z.enum(ENUMS.xbrlReportingLanguage).optional(),
    isDefault: z.boolean().optional(),
    notes: z.string().trim().max(1000).nullish(),
  }),
});

export const updateContextSchema = z.object({
  params: z.object({ id: idParam }),
  body: createContextSchema.shape.body.partial(),
});

// ─── الجاهزية والتحقق واللقطات والتصدير ──────────────────────────────────────

export const readinessQuerySchema = z.object({
  query: z.object({
    taxonomyId: idParam.optional(),
    contextId: idParam.optional(),
    fiscalYear: z.coerce.number().int().min(1900).max(2200).optional(),
    asOfDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاريخ غير صالح' }).optional(),
  }),
});

export const createSnapshotSchema = z.object({
  body: z.object({
    taxonomyId: idParam.optional(),
    contextId: idParam.optional(),
    fiscalYear: z.number().int().min(1900).max(2200).optional(),
    asOfDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاريخ غير صالح' }).optional(),
  }),
});

export const listSnapshotsSchema = z.object({
  query: z.object({ fiscalYear: z.coerce.number().int().min(1900).max(2200).optional() }),
});

export const exportSchema = z.object({
  body: z.object({
    format: z.enum([XBRL_EXPORT_FORMATS.INTERNAL_PREVIEW, XBRL_EXPORT_FORMATS.XBRL_INSTANCE]),
    taxonomyId: idParam.optional(),
    contextId: idParam.optional(),
    fiscalYear: z.number().int().min(1900).max(2200).optional(),
    asOfDate: z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'تاريخ غير صالح' }).optional(),
  }),
});
