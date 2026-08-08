import fs from 'fs';
import { prisma } from '@config/database';
import { logger } from '@core/utils/logger';
import { attachmentsService } from './attachments.service';

/**
 * ترحيل بايتات المرفقات القديمة من القرص إلى قاعدة البيانات — مرّة واحدة، عند الإقلاع.
 *
 * ── لماذا يلزم هذا ─────────────────────────────────────────────────────────────
 * ترحيل `20260808150000_attachment_content_blob` يضيف عمود `content` فارغًا (NULL)
 * لكل مرفق رُفع قبل هذه الحزمة. تلك الصفوف ما زالت تعتمد على ملفات موجودة على قرص
 * هذا الجهاز وحده — أي أنها ما زالت **خارج** النسخ الاحتياطي والمزامنة. نقل بايتاتها
 * إلى القاعدة هنا هو ما يجعل التثبيتات القائمة تلحق بالضمانة الجديدة بدل أن تقتصر
 * على المرفقات المرفوعة بعد الترقية.
 *
 * ── لماذا عند الإقلاع لا في ترحيل SQL ──────────────────────────────────────────
 * SQL لا يستطيع قراءة ملفات من نظام الملفات، والمسار الصحيح لا يُعرف إلا وقت التشغيل
 * (يعتمد على `ATTACHMENTS_DIR` الذي تمرّره طبقة Electron). لذلك هو ترحيل بيانات في
 * طبقة التطبيق، على نمط `reconcileSequencesOnStartup()` نفسه.
 *
 * ── العقد ──────────────────────────────────────────────────────────────────────
 * • **لا يرمي أبدًا.** شبكة أمان لا شرط بدء تشغيل: تعذُّر ترحيل مرفق قديم لا يجوز
 *   أن يمنع النظام كله من العمل.
 * • **إضافي بحت.** يكتب `content` للصفوف الفارغة فقط، ولا يحذف أي ملف من القرص،
 *   ولا يعدّل أي حقل آخر — فالتراجع إلى إصدار أقدم يبقى ممكنًا بلا فقدان شيء.
 * • **رخيص بعد أول تشغيل.** بعد اكتمال الترحيل لا يبقى صف بـ NULL، فالاستعلام
 *   الأول يعود فارغًا وتنتهي الدالة فورًا.
 * • **صف بصف.** الملفات تصل إلى 10 ميغابايت لكل مرفق؛ تحميلها دفعةً واحدة كان
 *   سيرفع استهلاك الذاكرة بلا داعٍ عند أول إقلاع بعد الترقية.
 */
export async function backfillAttachmentContent(): Promise<{
  scanned: number;
  filled: number;
  missing: number;
}> {
  const result = { scanned: 0, filled: 0, missing: 0 };

  let pending: Array<{
    id: number;
    entityType: string;
    entityId: number;
    fileName: string;
    filePath: string;
  }>;

  try {
    pending = await prisma.attachment.findMany({
      where: { content: null },
      select: { id: true, entityType: true, entityId: true, fileName: true, filePath: true },
      orderBy: { id: 'asc' },
    });
  } catch (err) {
    logger.warn('[Attachments] تعذّر فحص المرفقات القديمة — يُتخطّى الترحيل', { error: err });
    return result;
  }

  if (pending.length === 0) return result;

  result.scanned = pending.length;
  logger.info(`[Attachments] ترحيل بايتات ${pending.length} مرفقًا قديمًا إلى قاعدة البيانات…`);

  for (const att of pending) {
    // المسار المشتقّ أولًا (الصحيح على هذا الجهاز)، ثم المسار المطلق القديم
    // المخزَّن في الصف (يصيب حين يعمل النظام على جهاز الرفع الأصلي نفسه).
    let derived: string | null = null;
    try {
      derived = attachmentsService.currentPath(att.entityType, att.entityId, att.fileName);
    } catch {
      /* نوع كيان غير مسموح — يُجرَّب المسار المخزَّن وحده */
    }

    const candidate = [derived, att.filePath].find((p): p is string => !!p && fs.existsSync(p));
    if (!candidate) {
      result.missing++;
      continue;
    }

    try {
      const content = fs.readFileSync(candidate);
      await prisma.attachment.update({ where: { id: att.id }, data: { content } });
      result.filled++;
    } catch (err) {
      result.missing++;
      logger.warn(`[Attachments] تعذّر ترحيل المرفق ${att.id} (${att.fileName})`, { error: err });
    }
  }

  logger.info(
    `[Attachments] اكتمل الترحيل — ${result.filled} مرفقًا أصبح داخل النسخ الاحتياطي، ` +
      `${result.missing} ملفًا مفقودًا على القرص (لا بايتات تُنقل).`,
  );

  return result;
}
