/**
 * السجل اليومي — التحقّق من الأيام واشتقاق السطور الشهرية منها.
 *
 * دوال خالصة بلا Prisma وبلا استثناءات تطبيقية: تعيد أخطاءً موصوفة، والخدمة هي من
 * يحوّلها إلى `AppError`. هذا ما يجعل كل قاعدة هنا قابلة للاختبار بلا خادم ولا قاعدة
 * بيانات، ويمنع تسرّب `AppError` إلى طبقة يُفترض أن تكون حسابية.
 *
 * ═══ الدور المعماري ═══
 * هذا الملف هو الجسر بين **مصدر الحقيقة الجديد** (أيام العمل) و**حامل المال القديم**
 * (`OvertimeLine` لكل نوع). السطر الشهري لم يعد رقمًا يُدخله المستخدم، بل مجموعًا
 * مشتقًّا: `hours = Σ hours لأيام نوعه`. ما بقي للسطر هو ما يخصّ النوع فعلًا — لقطة
 * الأسعار والمبلغ والمرجع القانوني — لا العدد.
 */
import { OVERTIME_RULES, OVERTIME_TYPES, type OvertimeType } from '../legal/kuwaitLabourLaw';
import { isValidIsoDate, monthOf, yearOf, type OvertimeDayInput } from './overtimeComplianceEngine';
import type { OvertimeLineInput } from './overtimeCalculator';
import { normalizeHours } from './rounding';

/** يوم عمل إضافي كما يصل من الطلب — قبل أي تحقّق. */
export interface OvertimeDayRecord extends OvertimeDayInput {
  notes?: string | null;
  compensatoryRestStatus?: string | null;
  compensatoryRestDate?: string | null;
}

export interface DayLedgerError {
  code:
    | 'INVALID_DATE'
    | 'DATE_OUTSIDE_MONTH'
    | 'DUPLICATE_DAY_TYPE'
    | 'INVALID_COMPENSATORY_DATE'
    | 'COMPENSATORY_ON_REGULAR'
    /** أكثر من تصنيف قانوني لليوم الواحد — تصنيف مزدوج يؤدي إلى أجر مزدوج. */
    | 'SAME_DAY_TYPE_CONFLICT';
  messageAr: string;
  date?: string;
  overtimeType?: OvertimeType;
  /** `true` حين يكون سبب الرفض غموضًا قانونيًا يحتاج قرار مالك المنتج لا خطأ إدخال. */
  legalAmbiguity?: boolean;
}

/** `DD/MM/YYYY` للعرض. */
function display(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * يفحص أيام شهر واحد فحصًا كاملًا. يعيد **كل** الأخطاء لا أولها، فيرى المستخدم قائمة
 * ما يجب تصحيحه دفعةً واحدة بدل أن يصحّح سطرًا فيظهر له التالي.
 */
export function validateOvertimeDays(
  days: readonly OvertimeDayRecord[],
  year: number,
  month: number,
): DayLedgerError[] {
  const errors: DayLedgerError[] = [];
  const seen = new Set<string>();

  for (const day of days) {
    // ── تاريخ تقويمي صالح (يرفض ٢٠٢٦-٠٢-٣٠ التي تبتلعها `Date` صامتةً) ──
    if (!isValidIsoDate(day.date)) {
      errors.push({
        code: 'INVALID_DATE',
        date: day.date,
        messageAr: `تاريخ غير صالح: ${day.date}`,
      });
      continue;
    }

    // ── المتطلب ٢٦: التاريخ داخل شهر الحسبة ──
    // بلا هذا الفحص يمكن أن تُنسب ساعات يوليو إلى حسبة أغسطس، فتُحسب مرتين (مرة في
    // شهرها ومرة هنا) في العدّاد السنوي، ويُفحص الأسبوع بأيام لا تخصّ الشهر المفتوح.
    if (yearOf(day.date) !== year || monthOf(day.date) !== month) {
      errors.push({
        code: 'DATE_OUTSIDE_MONTH',
        date: day.date,
        messageAr:
          `${display(day.date)} خارج شهر الحسبة (${String(month).padStart(2, '0')}/${year}) — ` +
          'سجّله في حسبة شهره.',
      });
      continue;
    }

    // ── المتطلب ٢٥: لا تكرار لنفس (التاريخ، النوع) ──
    const key = `${day.date}|${day.overtimeType}`;
    if (seen.has(key)) {
      errors.push({
        code: 'DUPLICATE_DAY_TYPE',
        date: day.date,
        overtimeType: day.overtimeType,
        messageAr:
          `${display(day.date)}: سطران من النوع نفسه في اليوم نفسه. ادمج ساعاتهما في ` +
          'سطر واحد — كل حدود المادة ٦٦ تحسب ساعات اليوم لا عدد الفترات.',
      });
      continue;
    }
    seen.add(key);

    // ── الراحة التعويضية تخصّ المادتين ٦٧ و٦٨ وحدهما ──
    if (day.overtimeType === 'REGULAR' && (day.compensatoryRestStatus || day.compensatoryRestDate)) {
      errors.push({
        code: 'COMPENSATORY_ON_REGULAR',
        date: day.date,
        messageAr:
          `${display(day.date)}: العمل الإضافي في يوم عمل عادي (المادة ٦٦) لا يُنشئ ` +
          'استحقاق يوم راحة بديل — الاستحقاق للمادتين ٦٧ و٦٨ وحدهما.',
      });
    }

    if (day.compensatoryRestDate != null && !isValidIsoDate(day.compensatoryRestDate)) {
      errors.push({
        code: 'INVALID_COMPENSATORY_DATE',
        date: day.date,
        messageAr: `${display(day.date)}: تاريخ يوم الراحة البديل غير صالح.`,
      });
    }
  }

  errors.push(...detectSameDayTypeConflicts(days));
  return errors;
}

/**
 * تصنيفان قانونيان مختلفان لليوم الواحد — **مرفوض**.
 *
 * ═══ لماذا هذا خطر لا مجرّد تشدّد ═══
 * التاريخ الواحد للموظف الواحد هو **حالة واحدة** لا حالتان: إمّا يوم عمل عادي (المادة
 * ٦٦ تحكم إضافيه)، أو يوم راحته الأسبوعية (المادة ٦٧)، أو عطلة رسمية (المادة ٦٨).
 * قبولُ تصنيفين في اليوم نفسه يعني احتساب أجرَين بمعاملين مختلفين عن **ساعات اليوم
 * نفسه** — أي صرفًا مزدوجًا ينشأ من خطأ تصنيف لا من عمل إضافي فعلي.
 *
 * ═══ حالتان مختلفتان في السبب ═══
 * • «عادي + راحة» أو «عادي + عطلة» → **تناقض منطقي**: لو كان اليوم راحةً أو عطلة فلا
 *   وجود لـ«إضافي يوم عمل عادي» فيه أصلًا. خطأ إدخال يُصحَّح بتغيير النوع.
 *
 * • «راحة أسبوعية + عطلة رسمية» → **غموض قانوني حقيقي**: العطلة الرسمية قد تقع فعلًا
 *   في يوم راحة الموظف الأسبوعية. والنصّ المعتمد في هذا المستودع (المادتان ٦٧ و٦٨) لا
 *   يحسم أيّهما يسري، ولا هل يستحق العامل المعاملين معًا أم الأعلى وحده، ولا هل
 *   يستحق يوم راحة بديلًا واحدًا أم اثنين. جمعُ المعاملين (١٫٥ + ٢٫٠) أو ترجيحُ
 *   أحدهما كلاهما **اختراع قاعدة** لا تطبيقها. فالرفض هنا موقفٌ محايد يحفظ المال
 *   ويُظهر السؤال، لا حكمٌ في مسألة غير محسومة. يُوسَم `legalAmbiguity` كي تعرضه
 *   الواجهة بوصفه قرارًا يحتاج مالك المنتج لا خطأً يصحّحه المستخدم.
 */
function detectSameDayTypeConflicts(days: readonly OvertimeDayRecord[]): DayLedgerError[] {
  const typesByDate = new Map<string, Set<OvertimeType>>();
  for (const day of days) {
    if (!isValidIsoDate(day.date) || !(day.hours > 0)) continue;
    const set = typesByDate.get(day.date) ?? new Set<OvertimeType>();
    set.add(day.overtimeType);
    typesByDate.set(day.date, set);
  }

  const out: DayLedgerError[] = [];
  for (const [date, types] of [...typesByDate].sort()) {
    if (types.size < 2) continue;

    const restAndHoliday =
      types.size === 2 && types.has('WEEKLY_REST') && types.has('OFFICIAL_HOLIDAY');

    out.push(
      restAndHoliday
        ? {
            code: 'SAME_DAY_TYPE_CONFLICT',
            date,
            legalAmbiguity: true,
            messageAr:
              `${display(date)}: سُجِّل اليوم عطلةً رسمية ويوم راحة أسبوعية معًا. ` +
              'وقوع العطلة الرسمية في يوم الراحة الأسبوعية حالة **لم يحسمها النصّ ' +
              'القانوني المعتمد في النظام**: لا يُعرف هل يستحق العامل المعاملين معًا، ' +
              'أم الأعلى وحده، ولا كم يومَ راحة بديلًا يستحق. لن يفترض النظام قاعدة ' +
              'من عنده — اختر تصنيفًا واحدًا لهذا اليوم، والمسألة تحتاج قرارًا موثَّقًا ' +
              'من إدارة الشركة قبل اعتماد معالجة آلية لها.',
          }
        : {
            code: 'SAME_DAY_TYPE_CONFLICT',
            date,
            messageAr:
              `${display(date)}: لا يجوز تصنيف اليوم الواحد بأكثر من نوع ` +
              `(${[...types].map((t) => OVERTIME_RULES[t].labelAr).join(' + ')}). ` +
              'اليوم إمّا يوم عمل عادي أو يوم راحة أسبوعية أو عطلة رسمية — ' +
              'وتصنيفان معًا يعنيان احتساب أجرين مختلفين لساعات اليوم نفسه.',
          },
    );
  }
  return out;
}

/**
 * يشتقّ السطور الشهرية من الأيام — **سطر واحد لكل نوع له ساعات**.
 *
 * @param days أيام الشهر بعد التحقّق.
 * @param previous السطور الواردة في الطلب — تُقرأ منها **حقول التدقيق وحدها** (طريقة
 *        الإدخال، المبلغ المستهدف للحسبة العكسية، ملاحظة النوع). ساعاتُها تُتجاهَل
 *        عمدًا: الساعات صارت مِلك الأيام، وقبولها من مكانين كان يعيد المشكلة نفسها
 *        التي أُنشئ هذا الجدول لحلّها.
 *
 * الترتيب يتبع `OVERTIME_TYPES` (عادي ← راحة أسبوعية ← عطلة رسمية) فيثبت ترتيب السطور
 * في الكشف والتقرير مهما كان ترتيب إدخال الأيام.
 */
export function deriveOvertimeLinesFromDays(
  days: readonly OvertimeDayRecord[],
  previous: readonly OvertimeLineInput[] = [],
): OvertimeLineInput[] {
  const out: OvertimeLineInput[] = [];

  for (const type of OVERTIME_TYPES) {
    const ofType = days.filter((d) => d.overtimeType === type);
    if (ofType.length === 0) continue;

    const hours = normalizeHours(ofType.reduce((s, d) => s + d.hours, 0));
    if (hours <= 0) continue;

    const carried = previous.find((p) => p.overtimeType === type);
    out.push({
      overtimeType: type,
      hours,
      // الحسبة العكسية تبقى **وسيلة تخطيط**: بياناتها تُحفظ للتدقيق، لكن الساعات
      // المعتمدة هي مجموع الأيام التي اختارها المستخدم فعلًا لا ناتجُها المقترح.
      calculationMethod: carried?.calculationMethod ?? 'MANUAL_HOURS',
      reverseTargetAmount: carried?.reverseTargetAmount ?? null,
      rawHoursBeforeCeiling: carried?.rawHoursBeforeCeiling ?? null,
      notes: carried?.notes ?? null,
    });
  }

  return out;
}

/** صفوف الأيام الجاهزة للكتابة — بعد التطبيع والترتيب الزمني. */
export function toDayRows(days: readonly OvertimeDayRecord[]) {
  return [...days]
    .sort((a, b) => a.date.localeCompare(b.date) || a.overtimeType.localeCompare(b.overtimeType))
    .map((d) => ({
      date: d.date,
      overtimeType: d.overtimeType,
      hours: normalizeHours(d.hours),
      notes: d.notes ?? null,
      // REGULAR لا يحمل استحقاق راحة تعويضية إطلاقًا (المادة ٦٦) — يُصفَّر هنا صراحةً
      // بدل الاعتماد على أن الواجهة لن ترسله.
      compensatoryRestStatus:
        d.overtimeType === 'REGULAR' ? null : (d.compensatoryRestStatus ?? 'PENDING'),
      compensatoryRestDate: d.overtimeType === 'REGULAR' ? null : (d.compensatoryRestDate ?? null),
    }));
}
