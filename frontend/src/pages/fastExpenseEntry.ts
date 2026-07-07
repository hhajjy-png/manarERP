// ─────────────────────────────────────────────────────────────────────────
//  منطق «تسجيل مصروفات شهرية» (مسرّع إدخال) — دوال صافية قابلة للاختبار.
//
//  ⚠️ ليس نظام دفعات ولا استيراد: كل صف يُحفظ كمصروف فردي عادي عبر POST /expenses
//     نفس مسار الإنشاء العادي. لا سجل أب، لا حالة دفعة، لا تجميع خفي.
//
//  الحقول المشتركة (تاريخ/شهر/سنة/طريقة دفع/مورد/بادئة ملاحظات) تبقى ثابتة،
//  وتُمسح الحقول الخاصة بالصف فقط بعد كل حفظ.
// ─────────────────────────────────────────────────────────────────────────

/** الحقول المشتركة الثابتة أعلى الحوار. */
export interface FastSharedFields {
  date: string;
  billingMonth: number;
  billingYear: number;
  paymentMethod: string;
  /** '' = بدون · 'OTHER' = مورد حر · 'PER_ROW' = لكل صف · '<id>' = مورد مسجّل */
  supplierId: string;
  supplierName: string; // يُستخدم عند supplierId === 'OTHER'
  notesPrefix: string;
}

/** الحقول الخاصة بالصف الواحد. */
export interface FastRowFields {
  category: string;
  description: string;
  amount: string;
  supplierId: string; // يُستخدم فقط عندما تكون الحقول المشتركة supplierId === 'PER_ROW'
  supplierName: string;
  notes: string;
}

/** ملخص الجلسة (لراحة المستخدم فقط — لا يُخزَّن ككيان). */
export interface FastSessionSummary {
  count: number;
  total: number;
  lastCode: string | null;
  lastDescription: string | null;
}

export const EMPTY_SUMMARY: FastSessionSummary = { count: 0, total: 0, lastCode: null, lastDescription: null };

/** صف فارغ جديد — يمسح كل الحقول الخاصة بالصف. */
export function makeEmptyRow(): FastRowFields {
  return { category: '', description: '', amount: '', supplierId: '', supplierName: '', notes: '' };
}

function resolveOneSupplier(id: string, name: string): { supplierId: number | null; supplierName: string | null } {
  if (id === 'OTHER') return { supplierId: null, supplierName: name.trim() || null };
  if (id && id !== '' && id !== 'PER_ROW') return { supplierId: Number(id), supplierName: null };
  return { supplierId: null, supplierName: null };
}

/** يحدّد المورد الفعّال: المشترك، أو الخاص بالصف عندما يكون الوضع «لكل صف». */
export function resolveFastSupplier(shared: FastSharedFields, row: FastRowFields) {
  if (shared.supplierId === 'PER_ROW') return resolveOneSupplier(row.supplierId, row.supplierName);
  return resolveOneSupplier(shared.supplierId, shared.supplierName);
}

/**
 * يبني حمولة الإنشاء — مطابقة تمامًا لحمولة نموذج المصروف العادي (ExpenseForm)،
 * حتى يُصبح كل صف مصروفًا عاديًا لا يختلف عن الإدخال الفردي.
 */
export function buildFastExpensePayload(shared: FastSharedFields, row: FastRowFields): Record<string, unknown> {
  const sup = resolveFastSupplier(shared, row);
  const notes = [shared.notesPrefix.trim(), row.notes.trim()].filter(Boolean).join(' — ');
  return {
    category: row.category,
    description: row.description.trim(),
    amount: Number(row.amount),
    date: shared.date || undefined,
    billingMonth: shared.billingMonth,
    billingYear: shared.billingYear,
    notes: notes || undefined,
    supplierId: sup.supplierId,
    supplierName: sup.supplierName,
    paymentMethod: shared.paymentMethod,
  };
}

/**
 * يتحقق من صحة الصف بنفس قواعد الإنشاء العادي. يعيد رسالة الخطأ أو null.
 */
export function validateFastRow(row: FastRowFields): string | null {
  if (!row.category) return 'التصنيف مطلوب';
  if (!row.description.trim()) return 'الوصف مطلوب';
  const amountNum = Number(row.amount);
  if (!row.amount || isNaN(amountNum) || amountNum <= 0) return 'المبلغ يجب أن يكون موجبًا';
  return null;
}

/** يُحدّث ملخص الجلسة بعد حفظ ناجح. لا يُخزَّن — للعرض فقط. */
export function addToSummary(
  prev: FastSessionSummary,
  amount: number,
  savedCode: string | null,
  savedDescription: string | null,
): FastSessionSummary {
  return {
    count: prev.count + 1,
    total: prev.total + (isFinite(amount) ? amount : 0),
    lastCode: savedCode ?? prev.lastCode,
    lastDescription: savedDescription ?? prev.lastDescription,
  };
}

/** هل يوجد إدخال غير محفوظ في الصف الحالي؟ (لتأكيد الإغلاق). */
export function isRowDirty(row: FastRowFields): boolean {
  return !!(row.category || row.description.trim() || row.amount || row.notes.trim() || row.supplierId || row.supplierName.trim());
}
