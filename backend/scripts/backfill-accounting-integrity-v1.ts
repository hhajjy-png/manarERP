/**
 * Backfill — Accounting Integrity Pack v1
 *
 * يُرحّل إلى الأستاذ العام الأحداث التي سبقت وجود مسار الترحيل المزدوج، فيصبح GL هو
 * المصدر الوحيد الكامل:
 *   1) فواتير المبيعات/المشتريات التي لا تملك قيد INVOICE/PURCHASE_INVOICE (خصوصًا
 *      الفاتورتان اللتان أُنشئتا قبل تفعيل الترحيل).
 *   2) صرف الرواتب (salary_payments) — رواتب السائقين التي كانت غائبة عن كل التقارير.
 *
 * idempotent بالكامل: يعيد استخدام دوال الترحيل الإنتاجية نفسها (postInvoiceToGL /
 * postSalaryPaymentToGL) التي تتخطّى أي قيد موجود مسبقًا. تشغيله مرّتين لا يُكرّر قيدًا.
 * كل عنصر في معاملته الخاصة (عزل الفشل + أرقام تقرير دقيقة).
 *
 * التشغيل:  npx tsx scripts/backfill-accounting-integrity-v1.ts
 */
import { prisma } from '../src/config/database';
import { postInvoiceToGL } from '../src/modules/invoices/invoices.accounting';
import { postSalaryPaymentToGL } from '../src/modules/payrollBankImport/salaryPayment.accounting';

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

async function backfillSalaryPayments(): Promise<{ scanned: number; posted: number }> {
  const payments = await prisma.salaryPayment.findMany({
    select: { id: true, beneficiaryName: true, amount: true },
    orderBy: { id: 'asc' },
  });
  let posted = 0;
  for (const sp of payments) {
    await prisma.$transaction(async (tx) => {
      const before = await tx.journalEntry.count({ where: { referenceType: 'SALARY_PAYMENT', referenceId: sp.id } });
      await postSalaryPaymentToGL(tx, sp.id);
      const after = await tx.journalEntry.count({ where: { referenceType: 'SALARY_PAYMENT', referenceId: sp.id } });
      if (after > before) posted++;
    });
  }
  return { scanned: payments.length, posted };
}

async function main() {
  console.log('── Backfill: Accounting Integrity Pack v1 ──');
  const inv = await backfillInvoices();
  console.log(`فواتير: فُحِص ${inv.scanned}، رُحِّل الناقص ${inv.posted}`);
  const sal = await backfillSalaryPayments();
  console.log(`رواتب: فُحِص ${sal.scanned}، رُحِّل ${sal.posted}`);
  console.log('── تم ──');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('فشل الـBackfill:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
