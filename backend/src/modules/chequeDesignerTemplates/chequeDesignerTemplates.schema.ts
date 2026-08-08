import { z } from 'zod';

/**
 * Cheque Designer Templates — request validation (Cheque Template Persistence
 * Migration Pack v1).
 *
 * The layout payload (`fields`) used to be an unvalidated `JSON.stringify` blob
 * in `localStorage`: a corrupt write was indistinguishable from a valid one and
 * only surfaced as a silent `catch → []` at read time, i.e. as a template that
 * had quietly lost every field. Every write now passes through these schemas
 * before it can reach the database.
 *
 * `.passthrough()` on the field object is DELIBERATE and load-bearing. Zod's
 * default strips unknown keys, so a strict object would silently DELETE any
 * designer property this backend does not yet know about — exactly the data loss
 * this pack exists to end. The known properties are validated; anything else is
 * carried through untouched.
 */

/** One positioned, styled box on the design surface (frontend `DesignerField`). */
export const designerFieldSchema = z
  .object({
    id: z.string().min(1),
    label: z.string(),
    value: z.string(),
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite(),
    height: z.number().finite(),
    rotation: z.number().finite(),
    fontSize: z.number().finite(),
    fontWeight: z.number().finite(),
    textAlign: z.enum(['left', 'center', 'right']),
    color: z.string(),
    zIndex: z.number().finite(),
    visible: z.boolean(),
    binding: z.string().optional(),
  })
  .passthrough();

/** Physical surface the layout maps onto, in centimetres. */
export const designerSurfaceSchema = z.object({
  widthCm: z.number().finite().positive(),
  heightCm: z.number().finite().positive(),
});

const nameSchema = z.string().trim().min(1, 'اسم القالب مطلوب').max(120);

/** Template id: preserved verbatim from the legacy store (`tpl-<uuid>`). */
const idSchema = z.string().trim().min(1).max(80);

export const createTemplateSchema = z.object({
  body: z.object({
    name: nameSchema,
    surface: designerSurfaceSchema,
    fields: z.array(designerFieldSchema),
    makeDefault: z.boolean().optional(),
  }),
});

export const updateTemplateSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
    surface: designerSurfaceSchema,
    fields: z.array(designerFieldSchema),
  }),
});

export const renameTemplateSchema = z.object({
  body: z.object({ name: nameSchema }),
});

/**
 * One-time import of the legacy `localStorage` store. Timestamps are carried
 * over so the user's own history — and the `updatedAt`-descending order the
 * "Open" dialog lists templates in — survives the move byte-for-byte.
 */
export const importLegacyTemplatesSchema = z.object({
  body: z.object({
    templates: z
      .array(
        z.object({
          id: idSchema,
          name: nameSchema,
          isDefault: z.boolean(),
          surface: designerSurfaceSchema,
          fields: z.array(designerFieldSchema),
          createdAt: z.string().datetime().optional(),
          updatedAt: z.string().datetime().optional(),
        }),
      )
      .min(1, 'لا توجد قوالب للترحيل')
      .max(500),
  }),
});

/**
 * One-time recovery from a PREVIOUS `userData` folder (Legacy Cheque Template
 * Recovery Pack v1). Identical template shape to the import above — the same
 * `.passthrough()` guarantee therefore applies, so unknown field properties
 * survive the move — plus an optional provenance record kept in the marker and
 * the audit log so the recovery is explainable after the fact.
 */
export const recoverLegacyTemplatesSchema = z.object({
  body: importLegacyTemplatesSchema.shape.body.extend({
    source: z
      .object({
        userDataName: z.string().max(200).optional(),
        leveldbPath: z.string().max(1000).optional(),
        origin: z.string().max(300).optional(),
        file: z.string().max(200).optional(),
      })
      .optional(),
  }),
});

export type CreateTemplateInput = z.infer<typeof createTemplateSchema>['body'];
export type UpdateTemplateInput = z.infer<typeof updateTemplateSchema>['body'];
export type ImportLegacyInput = z.infer<typeof importLegacyTemplatesSchema>['body'];
