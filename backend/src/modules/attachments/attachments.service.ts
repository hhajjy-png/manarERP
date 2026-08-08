import fs from 'fs';
import path from 'path';
import type { Request } from 'express';
import { prisma } from '@config/database';
import { env } from '@config/env';
import { AppError } from '@core/errors/AppError';
import { recordAudit } from '@core/middleware/audit';
import { hasRolePermission } from '@core/middleware/rbac.middleware';
import { logger } from '@core/utils/logger';

const ALLOWED_ENTITY_TYPES = new Set([
  'CUSTOMER', 'CONTRACT', 'INVOICE', 'EMPLOYEE', 'SUPPLIER', 'EXPENSE', 'EQUIPMENT',
]);

/** Entity-type → minimum permission required for read access to its attachments. */
export const ENTITY_READ_PERM: Record<string, string> = {
  CUSTOMER:  'customers.read',
  CONTRACT:  'contracts.read',
  INVOICE:   'invoices.read',
  EMPLOYEE:  'employees.read',
  SUPPLIER:  'suppliers.read',
  EXPENSE:   'expenses.read',
  EQUIPMENT: 'equipment.read',
};

/** Entity-type → minimum permission required for write/delete access to its attachments. */
export const ENTITY_WRITE_PERM: Record<string, string> = {
  CUSTOMER:  'customers.update',
  CONTRACT:  'contracts.update',
  INVOICE:   'invoices.update',
  EMPLOYEE:  'employees.update',
  SUPPLIER:  'suppliers.update',
  EXPENSE:   'expenses.update',
  EQUIPMENT: 'equipment.update',
};

export class AttachmentsService {
  /** Throws AppError.forbidden if the actor lacks the entity-module permission required to read this entity type's attachments. */
  assertReadPermission(entityType: string, roleName: string, permissions: string[] | undefined): void {
    const perm = ENTITY_READ_PERM[entityType];
    if (perm && !hasRolePermission(roleName, permissions, perm)) {
      throw AppError.forbidden('ليست لديك صلاحية لعرض مرفقات هذا النوع');
    }
  }

  /** Throws AppError.forbidden if the actor lacks the entity-module permission required to write/delete this entity type's attachments. */
  assertWritePermission(entityType: string, roleName: string, permissions: string[] | undefined, message: string): void {
    const perm = ENTITY_WRITE_PERM[entityType];
    if (perm && !hasRolePermission(roleName, permissions, perm)) {
      throw AppError.forbidden(message);
    }
  }

  /** The entityType of an existing attachment, or null if it doesn't exist — used to authorize a delete before touching the file/row. */
  async findEntityType(id: number): Promise<string | null> {
    const attachment = await prisma.attachment.findUnique({ where: { id }, select: { entityType: true } });
    return attachment?.entityType ?? null;
  }

  storageDir(entityType: string, entityId: number): string {
    if (!ALLOWED_ENTITY_TYPES.has(entityType)) throw new Error('invalid entityType');
    const base = path.resolve(process.cwd(), env.ATTACHMENTS_DIR);
    const dir = path.resolve(path.join(base, entityType, String(entityId)));
    if (!dir.startsWith(base + path.sep)) throw new Error('invalid storage path');
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  /**
   * المسار الذي يجب أن يعيش فيه المرفق **على هذا الجهاز الآن** — يُشتقّ دائمًا من
   * `ATTACHMENTS_DIR` الحالي، ولا يُقرأ من العمود `filePath` أبدًا.
   *
   * العمود يخزّن مسارًا **مطلقًا** كُتب على جهاز الرفع (`C:\Users\<اسم>\AppData\…`).
   * بعد استعادة نسخة على جهاز آخر — أو بعد تغيير `productName`/`appId` الذي ينقل
   * مجلد `userData` — لا يوجد ذلك المسار، وحارس المسار في `attachments:openPath`
   * يرفضه لأنه خارج مجلد المرفقات الحالي. الاشتقاق يجعل الصف صالحًا على أي جهاز.
   */
  currentPath(entityType: string, entityId: number, fileName: string): string {
    return path.join(this.storageDir(entityType, entityId), path.basename(fileName));
  }

  /**
   * يكتب بايتات المرفق إلى القرص إن لم تكن هناك — ذاتيّ الشفاء بلا تكلفة في الحالة
   * الطبيعية (الملف موجود ⇒ لا عمل إطلاقًا).
   *
   * هذه هي اللحظة التي «تعود» فيها المرفقات بعد استعادة نسخة احتياطية أو مزامنة
   * من جهاز آخر: القاعدة وصلت ومعها البايتات، ويكفي أول عرض لقائمة المرفقات كي
   * تُكتب الملفات في مكانها الصحيح على الجهاز الجديد.
   *
   * الكتابة عبر ملف مؤقت ثم `rename` — حتى لا يرى `shell.openPath` ملفًا نصف مكتوب
   * إن تزامن الفتح مع الكتابة، ولا يبقى ملف مبتور إذا انقطعت الكهرباء أثناءها.
   */
  private materializeIfMissing(att: {
    entityType: string;
    entityId: number;
    fileName: string;
    content: Buffer | Uint8Array | null;
  }): string | null {
    let target: string;
    try {
      target = this.currentPath(att.entityType, att.entityId, att.fileName);
    } catch {
      return null; // entityType غير مسموح (بيانات قديمة تالفة) — لا يُشتقّ مسار
    }

    if (fs.existsSync(target)) return target;
    if (!att.content) return target; // لا بايتات محفوظة — الملف مفقود فعلًا

    const tmp = `${target}.${process.pid}.tmp`;
    try {
      fs.writeFileSync(tmp, Buffer.from(att.content));
      fs.renameSync(tmp, target);
    } catch (err) {
      try { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); } catch { /* تنظيف أفضل جهد */ }
      logger.warn(`[Attachments] تعذّرت كتابة المرفق ${att.fileName} إلى القرص`, { error: err });
    }
    return target;
  }

  /**
   * قائمة المرفقات — تُعيد `filePath` **المشتقّ لهذا الجهاز**، وتُنشئ الملف من
   * القاعدة إن كان غائبًا.
   *
   * `select` صريح لا `include`: بلا ذلك يُدرج Prisma كل الحقول القياسية ومنها
   * `content`، فتُرسل بايتات كل مرفقات الكيان في استجابة JSON واحدة عند كل فتح
   * للوحة المرفقات. البايتات لا تغادر الخادم إطلاقًا.
   */
  async list(entityType: string, entityId: number) {
    const rows = await prisma.attachment.findMany({
      where: { entityType, entityId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true,
        entityType: true,
        entityId: true,
        title: true,
        fileName: true,
        originalName: true,
        filePath: true,
        fileSize: true,
        mimeType: true,
        uploadedById: true,
        uploadedAt: true,
        content: true,
        uploadedBy: { select: { username: true, fullName: true } },
      },
    });

    return rows.map(({ content, ...row }) => ({
      ...row,
      filePath: this.materializeIfMissing({ ...row, content }) ?? row.filePath,
      /** هل بايتات هذا المرفق محفوظة داخل القاعدة (⇒ تنتقل مع النسخ والمزامنة)؟ */
      isPortable: content !== null,
    }));
  }

  /**
   * Persists an uploaded file's metadata row. `file` is the multer-handled disk file
   * (already validated/stored by the route's upload middleware). Cleans up the
   * on-disk file if the DB insert fails, so a failed upload never leaves an orphan.
   */
  async create(
    entityType: string,
    entityId: number,
    title: string,
    file: { filename: string; originalname: string; path: string; size: number; mimetype: string },
    uploadedById: number,
    req: Request,
  ) {
    // البايتات تُقرأ من الملف الذي كتبه multer وتُخزَّن **داخل القاعدة**، لأنها
    // وحدة النسخ والمزامنة الوحيدة في هذا المشروع. الملف على القرص يبقى كما هو
    // (مخبّأ محلي يُستخدم للفتح بالتطبيق الافتراضي)، لكنه لم يعد المصدر الوحيد.
    // فشل القراءة هنا خطأ قاتل للرفع: تسجيل مرفق بلا بايتات يعيد إنتاج نفس
    // الفقدان الصامت الذي جاءت هذه الحزمة لإغلاقه.
    let content: Buffer;
    try {
      content = fs.readFileSync(file.path);
    } catch (err) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      logger.error('[Attachments] تعذّرت قراءة الملف المرفوع لتخزينه في قاعدة البيانات', { error: err });
      throw AppError.internal('تعذّر حفظ المرفق');
    }

    let att;
    try {
      att = await prisma.attachment.create({
        data: {
          entityType,
          entityId,
          title,
          fileName:     file.filename,
          originalName: file.originalname,
          filePath:     file.path,
          fileSize:     file.size,
          mimeType:     file.mimetype,
          uploadedById,
          content,
        },
      });
    } catch (err) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
      throw err;
    }

    await recordAudit({
      req,
      action: 'CREATE',
      module: 'attachments',
      entityId: att.id,
      newValue: JSON.stringify({ entityType, entityId, fileName: att.originalName }),
    });

    return att;
  }

  async remove(id: number, userId: number, req: Request): Promise<void> {
    const att = await prisma.attachment.findUnique({
      where: { id },
      // بلا `content` عمدًا: الحذف لا يحتاج البايتات، وقراءتها تُحمّل ملفًا كاملًا
      // في الذاكرة بلا سبب.
      select: {
        id: true, entityType: true, entityId: true,
        fileName: true, originalName: true, filePath: true,
      },
    });
    if (!att) throw AppError.notFound('المرفق غير موجود');

    // يُحذف كلا الموقعين: المسار المشتقّ لهذا الجهاز (الملف الفعلي الآن) والمسار
    // المطلق القديم المخزَّن في الصف. على جهاز الرفع الأصلي هما نفس الملف، وعلى
    // أي جهاز آخر يوجد الأول فقط — فحذفهما معًا لا يترك ملفًا يتيمًا في الحالتين.
    let derived: string | null = null;
    try { derived = this.currentPath(att.entityType, att.entityId, att.fileName); } catch { /* نوع كيان غير صالح */ }
    for (const p of new Set([derived, att.filePath].filter((v): v is string => !!v))) {
      try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch { /* أفضل جهد — الصف يُحذف بأي حال */ }
    }

    await prisma.attachment.delete({ where: { id } });

    await recordAudit({
      req,
      action: 'DELETE',
      module: 'attachments',
      entityId: id,
      oldValue: JSON.stringify({
        entityType: att.entityType,
        entityId:   att.entityId,
        fileName:   att.originalName,
      }),
    });
  }
}

export const attachmentsService = new AttachmentsService();
