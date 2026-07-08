import { Request } from 'express';
import { prisma } from '../../config/database';
import { AppError } from '../../core/errors/AppError';
import { recordAudit } from '../../core/middleware/audit';
import { GL_REFERENCE_TYPES } from '../../shared/services/gl.service';
import { CorrectCollectionDateInput } from './payments.schema';

/**
 * مقارنة على مستوى اليوم — تاريخ التحصيل يوميّ الدقة؛ فرق الوقت داخل نفس اليوم ليس تصحيحًا.
 * تستخدم مكوّنات اليوم المحلية لتطابق `formatFileDate` في الواجهة (نفس getFullYear/Month/Date)؛
 * الخادم يعمل على نفس جهاز المستخدم (Electron/localhost) فتتطابق المنطقة الزمنية.
 */
function isSameCollectionDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** بداية اليوم المحلي — للمقارنة اليومية بين تاريخ التحصيل وتاريخ الفاتورة (تجاهل الوقت). */
function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export const paymentsService = {
  /**
   * تصحيح تاريخ التحصيل الرسمي (Payment.date) لدفعة محصّلة تاريخيًا — إجراء إداري بحت
   * للسجلات التاريخية فقط. لا ينشئ دفعة جديدة ولا يمثّل مسار تحصيل جديد.
   *
   * يُحدَّث فقط:
   *   - Payment.date — تاريخ التحصيل الرسمي (تاريخ العمل).
   *   - JournalEntry.date للقيد الأصلي المرتبط — لأن تاريخ القيد نسخة من Payment.date تُؤخذ
   *     لحظة الترحيل ولا تتتبّع التغييرات لاحقًا (invoices.accounting.ts). تحديثهما معًا يمنع
   *     تباعد تقارير التحصيل (تقرأ Payment.date) عن الأستاذ العام (يقرأ JournalEntry.date).
   *
   * لا يُمسّ إطلاقًا: Payment.createdAt (ختم التدقيق)، المبلغ، طريقة الدفع، إجماليات الفاتورة،
   * حالتها، بنودها، ولا قيود العكس (*_REVERSAL) التي تمثّل حدث عكس مستقلًّا بتاريخه الخاص.
   */
  async correctCollectionDate(paymentId: number, input: CorrectCollectionDateInput, req: Request) {
    // استعلام واحد للدفعة مع رقم الفاتورة (يُعاد استخدامه في التدقيق) — بلا استعلامات زائدة.
    // ملاحظة: نموذج Payment لا يدعم الحذف الناعم (لا يوجد deletedAt/isDeleted في المخطط)،
    // لذا لا يوجد ما يُتحقق منه هنا — وجود الصف كافٍ.
    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { invoice: { select: { id: true, invoiceNumber: true, issueDate: true } } },
    });
    if (!payment) throw AppError.notFound('الدفعة غير موجودة');

    const oldDate = payment.date;
    const newDate = input.date; // Zod z.coerce.date() يرفض القيم الفارغة/غير الصالحة (Invalid Date/NaN).
    // تنظيف السبب الاختياري: تشذيب المسافات وتخزين NULL بدل السلسلة الفارغة (السلسلة الفارغة falsy).
    const reason = input.reason?.trim() || null;

    // حماية عدم التغيير (No-Op): إذا كان التاريخ الجديد ضمن نفس يوم التحصيل الحالي، لا نكتب شيئًا
    // إطلاقًا — لا تحديث للدفعة، ولا للقيد، ولا سجل تدقيق. المقارنة يومية (لا بالمللي ثانية) حتى لا
    // يُعامل حفظُ نفس اليوم لدفعة تحمل وقتًا (مثل دفعة أُنشئت بـ new Date()) كتغيير وهمي.
    if (isSameCollectionDay(oldDate, newDate)) {
      return {
        changed: false,
        message: 'لم يتم إجراء أي تعديل لأن تاريخ التحصيل الجديد مطابق للتاريخ الحالي.',
        payment,
      };
    }

    // حماية تاريخ الفاتورة: لا يجوز أن يسبق تاريخُ التحصيل تاريخَ إصدار الفاتورة (مقارنة يومية).
    // لا توجد قاعدة تحقق كهذه في المشروع (لا في addPayment ولا في المخطط)، فنطبّقها هنا فقط
    // على التغييرات الفعلية. issueDate قد يكون null (نتجاهل التحقق حينها).
    const issueDate = payment.invoice?.issueDate ?? null;
    if (issueDate && startOfLocalDay(newDate) < startOfLocalDay(issueDate)) {
      throw AppError.badRequest('لا يمكن أن يكون تاريخ التحصيل أقدم من تاريخ إصدار الفاتورة.');
    }

    // TODO(closed-period): لا يوجد نظام إقفال فترات محاسبية في المشروع حاليًا (تحقّق من ذلك).
    // عند إضافته لاحقًا، يجب رفض التصحيح إذا وقع التاريخ القديم أو الجديد داخل فترة مقفلة.

    // معاملة ذرّية: يتحرك تاريخ الدفعة وتاريخ القيد المحاسبي معًا أو لا يتحرك أيٌّ منهما.
    // أي فشل في أي خطوة يُلغي المعاملة بالكامل — لا تحديثات جزئية.
    const updated = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.update({
        where: { id: paymentId },
        data: { date: newDate },
      });
      // مزامنة تاريخ قيد اليومية الأصلي (تحصيل مبيعات PAYMENT أو سداد مورد PURCHASE_PAYMENT).
      // القيد يُحدَّد حصريًا عبر العلاقة القائمة (referenceType, referenceId) — لا مطابقة بالتاريخ
      // ولا أي مطابقة تقديرية. القيد الأصلي 1:1 مع الدفعة (قيد فريد على مستوى القاعدة).
      const glResult = await tx.journalEntry.updateMany({
        where: {
          referenceType: { in: [GL_REFERENCE_TYPES.PAYMENT, GL_REFERENCE_TYPES.PURCHASE_PAYMENT] },
          referenceId: paymentId,
        },
        data: { date: newDate },
      });
      // اتساق محاسبي: يجب أن يتحرك القيد المرتبط مع الدفعة. إن كان مفقودًا بشكل غير متوقع،
      // نُجهض المعاملة بالكامل (rollback لتحديث الدفعة) بدل تحديث الدفعة وحدها.
      if (glResult.count === 0) {
        throw AppError.badRequest(
          'لا يمكن تصحيح تاريخ التحصيل: لا يوجد قيد محاسبي مرتبط بهذه الدفعة. تم التراجع عن العملية للحفاظ على اتساق الحسابات.',
        );
      }
      return p;
    });

    // سجل تدقيق كامل الأثر — يُخزَّن السبب واسم المستخدم ضمن JSON لأن نموذج AuditLog لا يملك عمودًا لهما.
    // action محدَّد وذاتي التعريف (على غرار سابقة 'PAYMENT' لتسجيل الدفعات) — لا يحتاج مخطط/enum جديدًا،
    // وواجهة سجل التدقيق تعرض أي action عبر fallback نصّي مباشر.
    await recordAudit({
      req,
      action: 'COLLECTION_DATE_CORRECTION',
      module: 'payments',
      entityId: paymentId,
      oldValue: { collectionDate: oldDate },
      newValue: {
        collectionDate: newDate,
        reason,
        invoiceId: payment.invoiceId,
        invoiceNumber: payment.invoice?.invoiceNumber ?? null,
        username: req.user?.username ?? null,
      },
    });

    return { changed: true, message: 'تم تصحيح تاريخ التحصيل', payment: updated };
  },
};
