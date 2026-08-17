/**
 * قالب **سند الصرف النقدي** لمستحقات الموظف الشهرية.
 *
 * ═══ لماذا قالب مستقل لا إعادة استخدام مباشرة لـ`PaymentVoucherTemplate` ═══
 * سند الصرف الإداري مستندُ **إدخال يدوي** لمستفيد ومبلغ وشيك: حقوله (البنك · رقم
 * الشيك · طريقة الدفع) لا وجود لها هنا، وحقول هذا السند (تفصيل بنود المستحقات
 * بساعاتها وأسعارها · الراتب المحوَّل إلى البنك · إقرار الاستلام) لا وجود لها هناك.
 * تعميم القالب الإداري ليخدم الاثنين كان يعني حشوه بأعلام شرطية تغيّر سلوك مستند
 * مطبوع قائم — وهو ممنوع صراحةً. فالمُستعاد هو **اللغة البصرية** (الألوان، حدود
 * الجدول، خلايا التسميات، صندوق المبلغ، الخطوط المنقّطة، بنية التوقيعات) و**المنطق
 * المشترك** (`amountToWordsKWD` للتفقيط · `deriveCashEntitlement` للمبلغ) — أما
 * البنية فخاصة بهذا المستند.
 *
 * ═══ ورق الشركة الرسمي ═══
 * لا ترويسة ولا تذييل إلكترونيين: الورقة تحملهما مطبوعين. المحتوى يبدأ بعد ٤ سم من
 * أعلى الورقة وينتهي قبل ٢ سم من أسفلها — هوامش ملف تعريف «ورق الشركة الرسمي» نفسها،
 * ويتوسّط هذا القالب داخل النطاق الناتج.
 *
 * ═══ ولا تاريخ طباعة ═══
 * لا `new Date()` هنا ولا في رمز التحقق. السند يُعاد طبعه فيخرج مطابقًا حرفًا بحرف؛
 * تاريخ الاستلام يُكتب بخطّ اليد عند التوقيع لأنه لا يوجد تاريخ سداد محفوظ يُقرأ.
 */
import type { CSSProperties, ReactNode } from 'react';
import { amountToWordsKWD } from '../lib/tafqeet';
import { DOC_FONT_STACK } from '../styles/fontRegistry';
import { deriveCashEntitlement } from './cashEntitlement';
import { monthNameAr, monthNameEn } from './labels';
import type { StatementData } from './types';
import { HOUR_UNIT, KD, kd, kdPlain } from './units';

/** نفس هوية اللون في سند الصرف الإداري — المستندان من الشركة نفسها والنظام نفسه. */
const BRAND = '#2b2e83';

/**
 * ارتفاع نطاق المحتوى — **حدّ أدنى للتوسيط، لا سقف**.
 *
 * الميزانية المقيسة: A4 ٢٩٧مم − ٤٠مم أعلى − ٢٠مم أسفل = ٢٣٧مم، يقتطع منها `FormLayout`
 * كتلةَ العنوان (٨٫٥مم) وتذييلَ رمز التحقق (٢٩٫٤مم)، فيبقى لهذا القالب **١٩٩مم**.
 * قياسًا فعليًا: شهرٌ بأربعة بنود — وهو الأكثر في البيانات — يشغل ١٩٥مم، والخامس
 * يضيف ٧٫٧مم. لذلك بقيت الأحجام في حدّ يُقرأ وقُلّصت المساحات الفارغة وحدها.
 *
 * الحدّ الأدنى أقلّ من الميزانية عمدًا: شهرٌ ببندين يتوسّط داخل ١٩٠مم بدل أن يلتصق
 * بحافة الـ٤ سم، وشهرٌ أطول ينمو فوقه بلا قصّ حتى سقف الـ١٩٩مم.
 */
const CONTENT_BAND_MIN_HEIGHT = '190mm';

const tdBase: CSSProperties = {
  border: '1.2px solid #b9bccd',
  padding: '3px 8px',
  verticalAlign: 'middle',
  wordBreak: 'break-word',
  fontSize: 11.5,
};

const tdLbl: CSSProperties = {
  ...tdBase,
  background: '#eef0fb',
  color: BRAND,
  fontWeight: 700,
  width: '34%',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const th: CSSProperties = {
  ...tdLbl,
  width: 'auto',
  textAlign: 'start',
};

const dotLine: CSSProperties = {
  display: 'inline-block',
  minWidth: 100,
  borderBottom: '1.4px dotted #9aa',
  minHeight: 16,
};

const sub: CSSProperties = { display: 'block', color: '#8388a6', fontWeight: 400, fontSize: 8.5, lineHeight: 1.1 };

/**
 * تسمية ثنائية على **سطر واحد**: «عربي / English».
 *
 * سند الصرف الإداري يضع الإنجليزية سطرًا ثانيًا تحت العربية، وهو يملك ترف المساحة:
 * ورقته بهامش ١٢مم لا ٥٠مم. هنا يبتلع السطر الثاني ١٣مم من نطاق الـ١٨٩مم في كل خلية
 * تسمية — وهي اثنتا عشرة — فيدفع التوقيعات إلى صفحة ثانية. السطر الواحد يعطي النصّين
 * نفسيهما، ويبقي الخطّ في حجم يُقرأ على مستند يوقّعه الموظف بالاستلام.
 */
function Lbl({ ar, en }: { ar: string; en: string }): ReactNode {
  return (
    <>
      {ar}
      <small style={sub}>{en}</small>
    </>
  );
}

export interface CashVoucherProps {
  data: StatementData;
  /** مرجع السند — يُمرَّر من الصفحة فلا يُبنى مرّتين بصيغتين. */
  reference: string;
}

/** الفترة بلغتيها من سجل الحسبة نفسه — لا `new Date()` ولا ساعة الجهاز. */
export function voucherPeriod(year: number, month: number): string {
  return `${monthNameAr(month)} ${year} / ${monthNameEn(month)} ${year}`;
}

/** بيان الصرف — جملة عربية واحدة مختصرة، والعنوان وحده ثنائي اللغة. */
export function voucherDescription(year: number, month: number): string {
  return `صرف المستحقات النقدية للموظف عن شهر ${monthNameAr(month)} ${year}`;
}

/**
 * تفصيل البند: «٧ hour × ٤٫٠٠٠ KD» حين يحمل ساعةً وسعرًا، و«—» للبند المالي البحت.
 * يُقرأ من عمودَي `hours`/`rate` المخزَّنين — **لا يُستخرج من نصّ الملاحظات**.
 */
export function lineDetail(hours: number | null, rate: number | null): string {
  if (hours == null || rate == null) return '—';
  return `${hours} ${HOUR_UNIT} × ${kdPlain(rate)}`;
}

export default function CashPaymentVoucherTemplate({ data, reference }: CashVoucherProps) {
  const cash = deriveCashEntitlement({ basicSalary: data.basicSalary, totals: data.totals });

  /**
   * التفقيط لمبلغ **الصرف النقدي وحده** — لا الراتب الأساسي ولا الصافي المخزَّن.
   * الدالة هي نفسها التي يستعملها سند الصرف الإداري والشيكات، بلا نسخة ثانية هنا.
   */
  const wordsAr = amountToWordsKWD(cash.cashNet, 'ar');
  const wordsEn = amountToWordsKWD(cash.cashNet, 'en');

  /** بنود الشهر كما هي: العمل الإضافي المجمَّع (إن وُجد) ثم الاستحقاقات الأخرى. */
  const items: Array<{ label: string; detail: string; amount: number }> = [
    ...data.overtime.map((o) => ({
      label: 'عمل إضافي',
      detail: `${o.hours} ${HOUR_UNIT}`,
      amount: o.amount,
    })),
    ...data.earnings.map((e) => ({
      label: e.label,
      detail: lineDetail(e.hours, e.rate),
      amount: e.amount,
    })),
  ];

  return (
    <div
      style={{
        fontFamily: DOC_FONT_STACK,
        direction: 'rtl',
        // توسيط رأسي داخل نطاق المحتوى: المستند القصير لا يلتصق بحافة الـ٥ سم،
        // والطويل ينمو من المنتصف إلى الطرفين بلا تجاوز — الحدّ أدنى لا ثابت.
        minHeight: CONTENT_BAND_MIN_HEIGHT,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 5,
      }}
    >
      {/* ── العنوان — نفس صندوق سند الصرف الإداري ───────────────────────────── */}
      <div
        style={{
          background: '#eef0fb',
          color: BRAND,
          textAlign: 'center',
          padding: '6px 12px',
          borderRadius: 7,
          fontSize: 16,
          fontWeight: 700,
          WebkitPrintColorAdjust: 'exact',
          printColorAdjust: 'exact',
        }}
      >
        سند صرف نقدي / Cash Payment Voucher
      </div>

      {/*
        المرجع · الفترة · بيانات الموظف · البيان — جدول واحد بأربعة أعمدة.
        النطاق المتاح لهذا القالب ١٨٩مم فقط (٢٢٧مم ناقص عنوان الغلاف وتذييل رمز
        التحقق)، وشهرٌ بخمسة بنود يحتاج ٢١مم إضافية. صناديق منفصلة وصفوف بعمودين كانت
        تستهلك ذلك الفائض كلّه فتدفع التوقيعات إلى صفحة ثانية. زوجان في الصفّ يعطيان
        المعلومات نفسها — **لا حقل حُذف، ولا خطّ صغّر إلى ما دون القراءة**.
      */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          <tr>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="مرجع كشف المستحقات" en="Entitlement Statement Ref." /></td>
            <td style={{ ...tdBase, width: '24%', direction: 'ltr', textAlign: 'start', fontFamily: 'monospace' }}>
              {reference}
            </td>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="الشهر" en="Month" /></td>
            <td style={{ ...tdBase, width: '24%' }}>{voucherPeriod(data.year, data.month)}</td>
          </tr>
          <tr>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="اسم الموظف" en="Employee Name" /></td>
            <td style={{ ...tdBase, fontWeight: 700, width: '24%' }}>{data.employee.fullName}</td>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="الرقم الوظيفي" en="Employee Code" /></td>
            <td style={{ ...tdBase, fontFamily: 'monospace', width: '24%' }}>
              <bdi dir="ltr">{data.employee.code}</bdi>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}><Lbl ar="المسمى الوظيفي" en="Job Title" /></td>
            <td style={tdBase}>{data.employee.jobTitle ?? '—'}</td>
            <td style={tdLbl}><Lbl ar="الراتب الأساسي" en="Basic Salary" /></td>
            <td style={tdBase}>
              {kd(cash.basicSalary)}
              {/*
                مسار السداد على سطر الراتب نفسه: هذا المبلغ وصل الحساب البنكي ولا
                يُسلَّم في اليد، فلا يدخل مبلغ هذا السند. قولها هنا يمنع قراءة الرقم
                على أنه جزء ممّا يوقّع الموظف باستلامه.
              */}
              <span style={{ display: 'block', color: '#475569', fontSize: 9.5, lineHeight: 1.2 }}>
                تم تحويله إلى البنك / Transferred to Bank
              </span>
            </td>
          </tr>
          <tr>
            <td style={tdLbl}><Lbl ar="البيان" en="Description" /></td>
            <td style={tdBase} colSpan={3}>{voucherDescription(data.year, data.month)}</td>
          </tr>
        </tbody>
      </table>

      {/* ── تفاصيل المستحقات ────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <thead>
          <tr>
            <th style={{ ...th, width: '34%' }}><Lbl ar="البند" en="Item" /></th>
            <th style={th}><Lbl ar="التفاصيل" en="Details" /></th>
            <th style={{ ...th, width: '26%', textAlign: 'end' }}><Lbl ar="المبلغ" en="Amount" /></th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td style={tdBase}>{it.label}</td>
              <td style={{ ...tdBase, direction: 'ltr', textAlign: 'start' }}>{it.detail}</td>
              <td style={{ ...tdBase, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                {kd(it.amount)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ── ملخص المبلغ ─────────────────────────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <tbody>
          {/* الإجمالي والاستقطاعات في صفّ واحد بأربعة أعمدة — نفس رقمين، نصف الارتفاع. */}
          <tr>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="إجمالي المستحقات الإضافية" en="Total Additional Entitlements" /></td>
            <td style={{ ...tdBase, width: '24%', textAlign: 'end', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
              {kd(cash.additionalEntitlements)}
            </td>
            <td style={{ ...tdLbl, width: '26%' }}><Lbl ar="الاستقطاعات" en="Deductions" /></td>
            <td style={{ ...tdBase, width: '24%', textAlign: 'end', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
              {cash.totalDeductions > 0 ? `(${kd(cash.totalDeductions)})` : kd(0)}
            </td>
          </tr>
          <tr>
            {/* الرقم الأوضح في الورقة — هو المبلغ الذي يُسلَّم فعلًا في اليد. */}
            <td style={{ ...tdLbl, fontSize: 13 }}>
              <Lbl ar="صافي المبلغ المصروف نقدًا" en="Net Cash Amount Paid" />
            </td>
            <td
              colSpan={3}
              style={{
                ...tdBase,
                background: '#f6faf6',
                border: '1.7px solid #cdddcd',
                fontWeight: 800,
                fontSize: 15,
                textAlign: 'center',
                color: BRAND,
                fontVariantNumeric: 'tabular-nums',
                WebkitPrintColorAdjust: 'exact',
                printColorAdjust: 'exact',
              }}
            >
              {kd(cash.cashNet)}
            </td>
          </tr>
          <tr>
            <td style={tdLbl}><Lbl ar="المبلغ كتابةً" en="Amount in Words" /></td>
            <td style={tdBase} colSpan={3}>
              <div>{wordsAr}</div>
              <div style={{ direction: 'ltr', textAlign: 'start', color: '#334155', fontSize: 10.5, marginTop: 1 }}>
                {wordsEn}
              </div>
            </td>
          </tr>
        </tbody>
      </table>

      {/* ── الإقرار بالاستلام ───────────────────────────────────────────────── */}
      <div style={{ border: `1.2px solid #b9bccd`, borderRadius: 6, padding: '4px 9px', fontSize: 10.5, lineHeight: 1.35 }}>
        <b style={{ color: BRAND }}>إقرار بالاستلام / Acknowledgment of Receipt</b>
        <div style={{ marginTop: 3 }}>
          أقر أنا الموظف المذكور أعلاه بأنني استلمت كامل المبلغ النقدي الموضح في هذا السند.
        </div>
      </div>

      {/*
        ── التوقيع ──────────────────────────────────────────────────────────────
        عنوان واحد متمركز ثم فراغ. لا حقول «الاسم» و«التوقيع» و«تاريخ الاستلام»، ولا
        كتلة «مسؤول الصرف»: الاسم مطبوع أعلى السند أصلًا، والإقرار فوقه يقول ما يوقَّع
        عليه، فبقيت الأسطر تسمياتٍ تكرّر معلومة قائمة وتزاحم مساحة اليد.
        الفراغ نفسه هو مكان التوقيع — بلا خطّ يحدّه ولا تسمية بجانبه.
      */}
      <div style={{ textAlign: 'center', marginTop: 4 }}>
        <div style={{ color: BRAND, fontWeight: 700, fontSize: 12.5 }}>
          <Lbl ar="المستلم" en="Received By" />
        </div>
        {/* مساحة التوقيع اليدوي — ارتفاع صريح كي لا تنهار عند الطباعة. */}
        <div aria-hidden="true" style={{ height: 44 }} />
      </div>
    </div>
  );
}

/**
 * محتوى رمز التحقق — **حتمي لنفس الحسبة**: لا تاريخ طباعة ولا وقتها ولا أي قيمة
 * تتغيّر بإعادة الطباعة. إعادة طبع السند غدًا تُنتج الرمز نفسه بايتًا ببايت.
 */
export function buildVoucherQrLines(data: StatementData, reference: string): string[] {
  const { cashNet } = deriveCashEntitlement({ basicSalary: data.basicSalary, totals: data.totals });
  return [
    `مرجع السند / Voucher Ref.: ${reference}`,
    `اسم الموظف / Employee Name: ${data.employee.fullName}`,
    `الرقم الوظيفي / Employee Code: ${data.employee.code}`,
    `الشهر / الفترة / Month / Period: ${voucherPeriod(data.year, data.month)}`,
    `صافي المبلغ المصروف نقدًا / Net Cash Amount Paid: ${cashNet.toFixed(3)} ${KD}`,
  ];
}
