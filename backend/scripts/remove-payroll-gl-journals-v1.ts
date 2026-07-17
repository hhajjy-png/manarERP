/**
 * Payroll Automatic GL Posting Removal & Historical Cleanup Pack v1 — Historical Cleanup
 *
 * قرار العمل النهائي: الرواتب وحدة تشغيلية فقط ولا تُنشئ أي قيد محاسبي. مصروف الرواتب
 * يُسجَّل يدويًا عبر وحدة المصروفات وحدها. هذا السكربت يُزيل القيود المحاسبية التاريخية
 * التي أنشأها الترحيل التلقائي للرواتب.
 *
 * يحذف **فقط** قيود الأستاذ العام حيث:  referenceType = 'SALARY_PAYMENT'
 * (وأسطرها تُحذف تلقائيًا عبر onDelete: Cascade؛ ومع ذلك نحذفها صراحةً أولًا لضمان
 *  الحتمية بصرف النظر عن حالة تطبيق قيود المفاتيح الأجنبية).
 *
 * لا يمسّ إطلاقًا:
 *   • قيود المصروفات (EXPENSE) / الفواتير (INVOICE) / التحصيلات (PAYMENT)
 *   • القيود اليدوية (MANUAL) / التسويات / الأرصدة الافتتاحية / أي referenceType آخر
 *   • جدول salary_payments أو payroll أو أي بيانات رواتب تشغيلية
 *
 * حتمي ومتكرر الأمان (idempotent): تشغيله عدة مرات لا يُتلف أي بيانات — التشغيل الثاني
 * لا يجد شيئًا ليحذفه. آمن افتراضيًا: يعرض ما سيُحذف فقط (dry-run) ما لم يُمرَّر --apply.
 *
 * التشغيل:
 *   معاينة فقط:   npx tsx scripts/remove-payroll-gl-journals-v1.ts
 *   تنفيذ الحذف:  npx tsx scripts/remove-payroll-gl-journals-v1.ts --apply
 */
import { prisma } from '../src/config/database';
import { GL_REFERENCE_TYPES } from '../src/shared/services/gl.service';

const REF = GL_REFERENCE_TYPES.SALARY_PAYMENT; // 'SALARY_PAYMENT' — نطاق الحذف الوحيد
const APPLY = process.argv.includes('--apply');

async function main() {
  const journals = await prisma.journalEntry.findMany({
    where: { referenceType: REF },
    select: { id: true },
  });
  const ids = journals.map((j) => j.id);
  const lineCount = ids.length
    ? await prisma.journalEntryLine.count({ where: { journalEntryId: { in: ids } } })
    : 0;

  console.log(`[cleanup] referenceType نطاق الحذف = '${REF}'`);
  console.log(`[cleanup] قيود مطابقة: ${ids.length} | أسطر مرتبطة: ${lineCount}`);

  // إثبات عدم المساس بالبقية — عدّ ما سيبقى دون تغيير.
  const preserved = await prisma.journalEntry.groupBy({
    by: ['referenceType'],
    _count: { _all: true },
    where: { referenceType: { not: REF } },
  });
  console.log('[cleanup] قيود ستبقى دون مساس:');
  for (const g of preserved) {
    console.log(`           ${g.referenceType ?? 'NULL'} → ${g._count._all}`);
  }

  if (ids.length === 0) {
    console.log('[cleanup] لا يوجد ما يُحذف — النظام نظيف بالفعل (idempotent).');
    return;
  }

  if (!APPLY) {
    console.log('\n[cleanup] وضع المعاينة (dry-run). لم يُحذف شيء.');
    console.log('[cleanup] لتنفيذ الحذف فعليًا: أضف الوسيط --apply');
    return;
  }

  // حذف حتمي داخل معاملة: الأسطر أولًا ثم القيود (الترتيب آمن مع/بدون Cascade).
  const result = await prisma.$transaction(async (tx) => {
    const linesDeleted = await tx.journalEntryLine.deleteMany({
      where: { journalEntryId: { in: ids } },
    });
    const journalsDeleted = await tx.journalEntry.deleteMany({
      where: { referenceType: REF },
    });
    return { linesDeleted: linesDeleted.count, journalsDeleted: journalsDeleted.count };
  });

  // تحقّق ما بعد الحذف: يجب ألا يبقى أي قيد SALARY_PAYMENT.
  const remaining = await prisma.journalEntry.count({ where: { referenceType: REF } });

  console.log(`\n[cleanup] تم الحذف: ${result.journalsDeleted} قيد | ${result.linesDeleted} سطر.`);
  console.log(`[cleanup] المتبقي من '${REF}' بعد الحذف: ${remaining} (يجب أن يكون 0).`);
  if (remaining !== 0) {
    throw new Error(`[cleanup] فشل التحقق: ما زال هناك ${remaining} قيد SALARY_PAYMENT.`);
  }
  console.log('[cleanup] اكتمل التنظيف التاريخي بنجاح.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
