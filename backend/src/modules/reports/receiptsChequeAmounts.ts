/* ════════════════════════════════════════════════════════════════════════════
   «قيمة الشيك الأصلية» في تقرير المقبوضات — قراءة فقط.

   شيك العميل الواحد قد يُسجَّل عدّة تحصيلات (`Payment`) موزَّعة على فواتير
   مختلفة. العمود يعرض على **كل** سطر من أسطر الشيك مجموع أجزائه كلها.

   ═══ مفتاح «نفس الشيك» ═══
   `method = CHEQUE` + `reference` + العميل + تاريخ القبض (`Payment.date`).
   رقم الشيك وحده لا يكفي — يتكرّر بين العملاء وبين دفاتر الشيكات. والتاريخ يُقارَن
   باليوم المحلي، أي نفس اليوم الذي يطبعه عمود «تاريخ القبض».

   ═══ مصدر المجموع: قاعدة البيانات لا الصفوف المعروضة ═══
   المجموع يُحسب من **كل** تحصيلات الشيك المسجَّلة، لا من صفوف التقرير: فلاتر
   حالة السداد أو المبلغ أو البحث قد تُخفي بعض أجزاء الشيك، ولا يجوز أن تُصغّر
   قيمته. الاستعلام يبقى داخل عالم المقبوضات نفسه (`SALES_INVOICE_ACTIVE`) ويتجاهل
   فلاتر التقرير عمدًا.

   ═══ الأداء ═══
   استعلام واحد لكل دفعة من أرقام الشيكات المعروضة (لا استعلام لكل صفّ)، ثم
   تجميع في الذاكرة. تقرير بلا شيكات لا يلمس قاعدة البيانات إطلاقًا.

   لا شيء هنا يكتب: لا `Payment.amount`، ولا `invoice.paidAmount`، ولا قيد.
   ════════════════════════════════════════════════════════════════════════════ */

import { prisma } from '../../config/database';
import { toLocalDateString } from '../../core/utils/dateWindows';
import { SALES_INVOICE_ACTIVE } from '../../shared/services/operational.reporting';
import { sumMoney } from '../../shared/utils/money';

/** أقصى عدد أرقام شيكات في استعلام واحد — يُبقي معاملات SQLite دون حدّها. */
const REFERENCE_BATCH_SIZE = 500;

export interface ChequePart {
  method: string;
  reference: string | null;
  customerId: number | null;
  date: Date;
}

/** قيمة الشيك الأصلية لكل مفتاح شيك. */
export type ChequeTotals = ReadonlyMap<string, number>;

/**
 * مفتاح «نفس الشيك»، أو `null` حين لا يكون السطر جزءًا من شيك قابل للتجميع:
 * وسيلة غير الشيك، أو شيك بلا رقم مرجع، أو بلا عميل.
 */
export function chequeGroupKey(part: ChequePart): string | null {
  if (part.method !== 'CHEQUE') return null;
  if (!part.reference?.trim() || part.customerId == null) return null;
  return `${part.customerId}|${toLocalDateString(part.date)}|${part.reference}`;
}

/** يجمع مبالغ الأجزاء لكل مفتاح شيك. */
export function sumChequeParts(parts: readonly (ChequePart & { amount: number })[]): ChequeTotals {
  const amountsByKey = new Map<string, number[]>();
  for (const part of parts) {
    const key = chequeGroupKey(part);
    if (!key) continue;
    amountsByKey.set(key, [...(amountsByKey.get(key) ?? []), part.amount]);
  }
  return new Map([...amountsByKey].map(([key, amounts]) => [key, sumMoney(amounts)]));
}

/**
 * قيمة الشيك الأصلية لسطر واحد:
 *   • غير شيك ⇒ `null` (يُعرض «—»).
 *   • شيك غير قابل للتجميع أو غائب عن الخريطة ⇒ مبلغ السطر نفسه (شيك بتحصيل واحد).
 */
export function originalChequeAmountOf(
  row: ChequePart & { amount: number },
  totals: ChequeTotals,
): number | null {
  if (row.method !== 'CHEQUE') return null;
  const key = chequeGroupKey(row);
  const total = key ? totals.get(key) : undefined;
  return total ?? row.amount;
}

/**
 * عدد عمليات القبض **الفعلية** في مجموعة صفوف.
 *
 * الشيك الموزَّع على عدّة فواتير عملية واحدة (مفتاح `chequeGroupKey`). أي وسيلة أخرى:
 * كل `Payment` عملية مستقلة — النموذج لا يحمل معرّفًا صريحًا يربط تحويلًا أو نقدًا
 * بدفعة واحدة، والدمج بالمبلغ/التاريخ/العميل تخمين قد يدمج دفعات مستقلة. وشيك بلا
 * رقم مرجع يُعدّ بدوره عملية مستقلة لكل سطر.
 */
export function countReceiptOperations(rows: readonly ChequePart[]): number {
  const chequeKeys = new Set<string>();
  let ungrouped = 0;
  for (const row of rows) {
    const key = chequeGroupKey(row);
    if (key) chequeKeys.add(key);
    else ungrouped++;
  }
  return chequeKeys.size + ungrouped;
}

/**
 * يحمّل قيمة الشيك الأصلية لكل شيك يظهر في الصفوف — من كامل تحصيلاته المسجَّلة.
 */
export async function loadChequeTotals(rows: readonly ChequePart[]): Promise<ChequeTotals> {
  const references = [
    ...new Set(rows.filter((r) => chequeGroupKey(r) !== null).map((r) => r.reference as string)),
  ];
  if (references.length === 0) return new Map();

  const batches: string[][] = [];
  for (let i = 0; i < references.length; i += REFERENCE_BATCH_SIZE) {
    batches.push(references.slice(i, i + REFERENCE_BATCH_SIZE));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      prisma.payment.findMany({
        where: { method: 'CHEQUE', reference: { in: batch }, invoice: SALES_INVOICE_ACTIVE },
        select: { amount: true, method: true, reference: true, date: true, invoice: { select: { customerId: true } } },
      }),
    ),
  );

  return sumChequeParts(
    results.flat().map((p) => ({
      amount: p.amount,
      method: p.method,
      reference: p.reference,
      date: p.date,
      customerId: p.invoice.customerId,
    })),
  );
}
