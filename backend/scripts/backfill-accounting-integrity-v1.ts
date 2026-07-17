/**
 * Backfill — Accounting Integrity Pack v1
 *
 * يُرحّل إلى الأستاذ العام الأحداث التي سبقت وجود مسار الترحيل المزدوج، فيصبح GL هو
 * المصدر الوحيد الكامل:
 *   1) فواتير المبيعات/المشتريات التي لا تملك قيد INVOICE/PURCHASE_INVOICE (خصوصًا
 *      الفاتورتان اللتان أُنشئتا قبل تفعيل الترحيل).
 *
 * ملاحظة (قرار العمل النهائي — Payroll GL Removal Pack v1): أُزيل ترحيل صرف الرواتب
 * (salary_payments → SALARY_PAYMENT) من هذا الـBackfill. الرواتب وحدة تشغيلية فقط ولا
 * تُنشئ أي قيد محاسبي؛ مصروف الرواتب يُسجَّل يدويًا عبر وحدة المصروفات وحدها. إعادة
 * الترحيل التلقائي هنا كانت ستُبطل التنظيف التاريخي، فحُذفت نهائيًا.
 *
 * idempotent بالكامل: يعيد استخدام دالة الترحيل الإنتاجية (postInvoiceToGL) التي تتخطّى
 * أي قيد موجود مسبقًا. تشغيله مرّتين لا يُكرّر قيدًا. كل عنصر في معاملته الخاصة.
 *
 * التشغيل:  npx tsx scripts/backfill-accounting-integrity-v1.ts
 */
import { prisma } from '../src/config/database';
import { postInvoiceToGL } from '../src/modules/invoices/invoices.accounting';

async function backfillInvoices(): Promise<{ scanned: number; posted: number }> {
  const invoices = await prisma.invoice.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: { id: true, direction: true, invoiceNumber: true },
    orderBy: { id: 'asc' },
  });
  let posted = 0;
  for (const inv of invoices) {
    const baseTypes = inv.direction === 'PURCHASE' ? ['PURCHASE_INVOICE'] : ['INVOICE'];
    await prisma.$transaction(async (tx) => {
      const before = await tx.journalEntry.count({ where: { referenceType: { in: baseTypes }, referenceId: inv.id } });
      await postInvoiceToGL(tx, inv.id);
      const after = await tx.journalEntry.count({ where: { referenceType: { in: baseTypes }, referenceId: inv.id } });
      if (after > before) {
        posted++;
        console.log(`  + فاتورة ${inv.invoiceNumber} (#${inv.id}) — رُحِّلت إلى GL`);
      }
    });
  }
  return { scanned: invoices.length, posted };
}

async function main() {
  console.log('── Backfill: Accounting Integrity Pack v1 ──');
  const inv = await backfillInvoices();
  console.log(`فواتير: فُحِص ${inv.scanned}، رُحِّل الناقص ${inv.posted}`);
  // ترحيل صرف الرواتب أُزيل نهائيًا — الرواتب لا تُنشئ قيودًا محاسبية (قرار العمل النهائي).
  console.log('── تم ──');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('فشل الـBackfill:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
