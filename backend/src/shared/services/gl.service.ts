import { Prisma } from '@prisma/client';
import { AppError } from '../../core/errors/AppError';
import { assertPeriodOpen } from './periodLock.service';
import { roundMoney, sumMoney, moneyEquals } from '../utils/money';

type Tx = Prisma.TransactionClient;

export type JournalLine = {
  accountId: number;
  debit: number;
  credit: number;
  description: string;
};

/**
 * مُعاد تصديرها من وحدة النقود القانونية — لا تعريف ثانٍ.
 * السياسة الآن واحدة عبر النظام: نصف بعيدًا عن الصفر، ثلاث خانات.
 * (السلوك على القيم الموجبة مطابق حرفيًا لما كان — مُثبَت على 400,000 قيمة.)
 */
export const round3 = roundMoney;

/**
 * توليد رقم قيد يومية فريد بصيغة JRN-<سنة القيد>-<تسلسل>.
 * يستخدم أقصى id موجود (MAX عبر orderBy id desc) بدلاً من COUNT
 * لتجنّب التعارض عند حذف قيود وسطية وإعادة الترحيل.
 *
 * السنة تُشتق من تاريخ القيد لا من ساعة الجهاز: قيد بتاريخ 15/12/2024 يُدخَل
 * في 2026 يأخذ الرقم JRN-2024-… ويكمل تسلسل 2024، فلا ينكسر ترقيم السنة.
 */
export async function generateEntryNumber(tx: Tx, entryDate: Date = new Date()): Promise<string> {
  const year = entryDate.getFullYear();
  const prefix = `JRN-${year}-`;
  const last = await tx.journalEntry.findFirst({
    where: { entryNumber: { startsWith: prefix } },
    orderBy: { id: 'desc' },
    select: { entryNumber: true },
  });
  const lastSeq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) : 0;
  const nextSeq = isNaN(lastSeq) ? 1 : lastSeq + 1;
  return `${prefix}${String(nextSeq).padStart(5, '0')}`;
}

/**
 * يُميّز خطأ P2002 على حقل entryNumber في journal_entries عن بقية أخطاء التعارض.
 * يُستخدم لإعادة المحاولة عند تعارض ترقيم القيود المحاسبية (race condition على رقم تسلسلي)
 * دون إعادة المحاولة على تعارض رقم الفاتورة أو أي حقل آخر.
 */
export function isEntryNumberCollision(err: unknown): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== 'P2002') return false;
  const target = err.meta?.target;
  if (!target) return false;
  const t = Array.isArray(target) ? target.join(',') : String(target);
  // يُعيد true فقط عند تعارض entryNumber في journal_entries (النظام الجديد).
  // transactions_entryNumber_key (النظام القديم) لا يستحق retry — مشكلته في generateEntryNumber.
  if (t.includes('invoiceNumber')) return false;
  if (t.includes('transactions')) return false;
  return t.includes('entryNumber');
}

const MAX_ENTRY_NUMBER_ATTEMPTS = 3;

/**
 * ينشئ قيد يومية مزدوجًا بعد التحقق من توازنه (إجمالي المدين = إجمالي الدائن).
 * يرمي خطأً قبل الكتابة إذا لم يتساوَ الطرفان **بدقّة الدينار** (`moneyEquals`) — أي أن
 * فارق فلس واحد (0.001) يُرفض، ولا يُتسامح إلا مع ضجيج التمثيل الثنائي.
 * يُستخدم من جميع وحدات GL (المصروفات، الفواتير، الرواتب، المخزون).
 *
 * هذه هي النقطة المركزية لحارس قفل الفترة: كل قيد محاسبي **مُشتقّ من مستند عمل**
 * (فاتورة، دفعة، راتب، مصروف) يمرّ من هنا، فلا حاجة لتكرار الحارس في كل وحدة.
 *
 * **الاستثناء الوحيد الموثَّق:** القيد اليدوي (`accounting.service.ts` —
 * `createJournalEntry`/`reverseJournalEntry`) يكتب مباشرة عبر `tx.journalEntry.create`
 * لا عبر هذه الدالة، لأنه يحتاج دلالات لا تدعمها هذه الدالة كما هي (referenceType
 * 'MANUAL'/'MANUAL_REVERSAL' بلا مستند مصدر، ونوع عكس مختلف عن `reverseGL`). هذا
 * المسار **ليس بابًا ثانيًا بمعيار مختلف**: يستدعي نفس `assertPeriodOpen`
 * (حارس قفل الفترة) ونفس `roundMoney`/`moneyEquals` (عبر `validateJournalBalance`
 * في `accounting.utils.ts`) صراحةً بنفسه. تعديل مستقبلي على حارس التوازن أو قفل
 * الفترة هنا **يجب** أن يُطبَّق أيضًا هناك — الملفان مرتبطان بهذا التعليق عمدًا.
 *
 * **حارس تعارض ترقيم القيد مركزي هنا أيضًا** — `generateEntryNumber` يعتمد على
 * MAX(id)+1، وهو عرضة للتعارض عند ترحيل قيدين شبه متزامنين (كدفعة رواتب أو استيراد
 * مصروفات بالجملة). عند تعارض P2002 على entryNumber فقط (`isEntryNumberCollision`)
 * تُعاد المحاولة حتى 3 مرات — إعادة توليد الرقم وإدراجه ضمن نفس المعاملة المفتوحة،
 * دون الحاجة لإعادة تشغيل معاملة المستدعي بأكملها (SQLite لا "يُسمّم" المعاملة بعد فشل
 * عبارة واحدة بخلاف Postgres — تم التحقق تجريبيًا). كل مستدعٍ (فواتير، رواتب، مصروفات)
 * يرث هذه الحماية تلقائيًا دون تكرارها.
 */
export async function createBalancedJournal(
  tx: Tx,
  data: {
    date: Date;
    description: string;
    referenceType: string;
    referenceId: number;
    /** نسخة الترحيل — 1 للترحيل الأول، وتتزايد عند كل تصحيح غير حذفي (انظر supersedeBalancedJournal). */
    revision?: number;
    lines: JournalLine[];
  },
): Promise<void> {
  const totalDebit = sumMoney(data.lines.map((l) => l.debit));
  const totalCredit = sumMoney(data.lines.map((l) => l.credit));

  /**
   * التوازن يُقاس **بدقّة الدينار**، لا بتسامح فلس كامل.
   *
   * كان الحارس `Math.abs(d - c) > 0.001` — أي أنه يسمح بفارق **يساوي أصغر وحدة نقدية
   * موجودة**: قيد مختلّ بفلس واحد كان يمرّ صامتًا ويستقرّ في الدفتر. `moneyEquals` تقرّب
   * الطرفين ثم تقارن بتسامح تنفيذي (1e-6) لضجيج الثنائي وحده:
   *   • فارق 0.0000001 (أثر 0.1+0.2) → متوازن.
   *   • فارق 0.001 (فلس) → **مرفوض**.
   */
  if (!moneyEquals(totalDebit, totalCredit)) {
    throw new AppError(
      `قيد محاسبي غير متوازن: المدين ${totalDebit} ≠ الدائن ${totalCredit}`,
      500,
    );
  }

  await assertPeriodOpen(tx, data.date, {
    operation: 'ترحيل قيد محاسبي',
    module: 'accounting',
    entityId: `${data.referenceType}#${data.referenceId}`,
  });

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ENTRY_NUMBER_ATTEMPTS; attempt++) {
    try {
      await tx.journalEntry.create({
        data: {
          entryNumber: await generateEntryNumber(tx, data.date),
          date: data.date,
          description: data.description,
          referenceType: data.referenceType,
          referenceId: data.referenceId,
          revision: data.revision ?? 1,
          status: 'POSTED',
          lines: { create: data.lines },
        },
      });
      return;
    } catch (err) {
      if (attempt < MAX_ENTRY_NUMBER_ATTEMPTS - 1 && isEntryNumberCollision(err)) {
        // console.warn عمدًا لا logger: استيراد Winston هنا يُنشئ مجلدات عند تحميل
        // الوحدة ويكسر اختبارات الوحدة (نفس المفاضلة الموثّقة في approval.service).
        console.warn(`[GL] entryNumber collision on attempt ${attempt + 1} — retrying`);
        lastErr = err;
        continue;
      }
      throw err;
    }
  }
  throw lastErr!; // يُصل هنا فقط إذا استُنفدت المحاولات على تعارض entryNumber
}

/**
 * يتحقق من وجود قيد سابق لنفس (referenceType, referenceId).
 * يُعيد true إذا كان الترحيل موجودًا (يجب تجاهل الترحيل المزدوج).
 */
export async function checkDuplicatePosting(
  tx: Tx,
  referenceType: string,
  referenceId: number,
): Promise<boolean> {
  const existing = await tx.journalEntry.findFirst({
    where: { referenceType, referenceId },
    select: { id: true },
  });
  return existing !== null;
}

/**
 * ينشئ قيدًا عكسيًا متوازنًا لقيد أصلي موجود.
 * - لا يحذف القيد الأصلي (للحفاظ على أثر التدقيق).
 * - محمي من التكرار: لا ينشئ العكس إذا كان موجودًا مسبقًا.
 * - يُعيد بصمت إذا لم يُرحَّل القيد الأصلي أصلًا.
 *
 * تاريخ العكس = تاريخ القيد الأصلي افتراضيًا، لا تاريخ اليوم. عكس قيد 2024
 * كان يهبط في السنة الجارية فيُظهر مصروفًا سالبًا في سنة لم تحدث فيها العملية،
 * ويترك السنة الأصلية منفوخة. المستدعي يستطيع تمرير `reversalDate` صراحةً
 * عندما يكون العكس حدثًا محاسبيًا مستقلًا (تصحيح في فترة لاحقة مفتوحة).
 *
 * @param referenceType   نوع المرجع الأصلي (مثلاً 'EXPENSE')
 * @param referenceId     معرّف المرجع الأصلي
 * @param reversalType    نوع القيد العكسي (مثلاً 'EXPENSE_REVERSAL')
 * @param options.reversalDate  تاريخ العكس الصريح — يتجاوز تاريخ القيد الأصلي
 */
export async function reverseGL(
  tx: Tx,
  referenceType: string,
  referenceId: number,
  reversalType: string,
  options: { reversalDate?: Date } = {},
): Promise<void> {
  // النسخة الحيّة الحالية = أعلى رقم نسخة مُرحَّلة من النوع الأساس. بعد التصحيحات
  // (supersedeBalancedJournal) قد توجد عدّة نُسَخ؛ نعكس الأحدث لا الأقدم.
  const original = await tx.journalEntry.findFirst({
    where: { referenceType, referenceId, status: 'POSTED' },
    orderBy: { revision: 'desc' },
    include: { lines: { select: { accountId: true, debit: true, credit: true, description: true } } },
  });
  if (!original) return; // لم يُرحَّل — لا شيء للعكس

  // عكس موجود بالفعل لنفس النسخة؟ لا تُكرّر (حماية التكرار على مستوى النسخة).
  const existingReversal = await tx.journalEntry.findFirst({
    where: { referenceType: reversalType, referenceId, revision: original.revision },
    select: { id: true },
  });
  if (existingReversal) return;

  await createBalancedJournal(tx, {
    date: options.reversalDate ?? original.date,
    description: `عكس قيد ${referenceType} #${referenceId}`,
    referenceType: reversalType,
    referenceId,
    revision: original.revision, // العكس يحمل رقم نسخة القيد المعكوس
    lines: original.lines.map((line) => ({
      accountId: line.accountId,
      debit: line.credit,   // مقلوب
      credit: line.debit,   // مقلوب
      description: `عكس: ${line.description ?? ''}`.trim(),
    })),
  });
}

/** أعلى رقم نسخة مُرحَّلة لمرجع من النوع الأساس، أو 0 إن لم يُرحَّل قط. */
export async function currentRevision(
  tx: Tx,
  baseType: string,
  referenceId: number,
): Promise<number> {
  const last = await tx.journalEntry.findFirst({
    where: { referenceType: baseType, referenceId },
    orderBy: { revision: 'desc' },
    select: { revision: true },
  });
  return last?.revision ?? 0;
}

/**
 * تصحيح **غير حذفي** لقيد مستند بعد تعديله.
 *
 * يعكس النسخة الحيّة الحالية (إن وُجدت) ثم يُرحّل نسخة جديدة بالقيم المصحّحة. لا يُحذف
 * أي قيد مُرحَّل أبدًا: الأصل (نسخة N) + عكسه (نسخة N) + النسخة الجديدة (N+1) تتعايش في
 * الدفتر، وصافيها المحاسبي = القيد المصحّح. هذا هو البديل المُلزَم عن الحذف+إعادة الترحيل
 * (deleteMany) الذي كان يمحو تاريخ الدفتر. يُستخدم من مسارات تعديل الفاتورة/المصروف.
 */
export async function supersedeBalancedJournal(
  tx: Tx,
  params: {
    baseType: string;
    reversalType: string;
    referenceId: number;
    date: Date;
    description: string;
    lines: JournalLine[];
  },
): Promise<void> {
  // 1) اعكس النسخة الحيّة الحالية (لا شيء يحدث إن لم يكن هناك ترحيل سابق).
  await reverseGL(tx, params.baseType, params.referenceId, params.reversalType);
  // 2) رحّل النسخة الجديدة برقم نسخة أعلى من كل ما سبق.
  const rev = await currentRevision(tx, params.baseType, params.referenceId);
  await createBalancedJournal(tx, {
    date: params.date,
    description: params.description,
    referenceType: params.baseType,
    referenceId: params.referenceId,
    revision: rev + 1,
    lines: params.lines,
  });
}

/**
 * دليل تسمية أنواع مرجع GL المستخدمة في النظام.
 * يُستخدم للتوثيق والتحقق المستقبلي.
 */
export const GL_REFERENCE_TYPES = {
  EXPENSE: 'EXPENSE',
  EXPENSE_REVERSAL: 'EXPENSE_REVERSAL',
  INVOICE: 'INVOICE',
  INVOICE_REVERSAL: 'INVOICE_REVERSAL',
  PURCHASE_INVOICE: 'PURCHASE_INVOICE',
  PURCHASE_INVOICE_REVERSAL: 'PURCHASE_INVOICE_REVERSAL',
  PAYMENT: 'PAYMENT',
  PAYMENT_REVERSAL: 'PAYMENT_REVERSAL',
  PURCHASE_PAYMENT: 'PURCHASE_PAYMENT',
  PURCHASE_PAYMENT_REVERSAL: 'PURCHASE_PAYMENT_REVERSAL',
  PAYROLL: 'PAYROLL',
  PAYROLL_REVERSAL: 'PAYROLL_REVERSAL',
  SALARY_PAYMENT: 'SALARY_PAYMENT',
  SALARY_PAYMENT_REVERSAL: 'SALARY_PAYMENT_REVERSAL',
} as const;
