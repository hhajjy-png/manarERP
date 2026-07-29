import { ReactNode } from 'react';
import {
  EN_HI_SEPARATOR,
  enHiLineHeight,
  hiLabelText,
  hiValueText,
  labelCellEnHi,
  sectionHeaderEnHi,
  sectionHeaderHiPart,
  valueCellEnHi,
} from './enHiStyles';
import { tableRow } from '../../shared/formStyles';

/**
 * الذرّات المشتركة للقالب الثنائي English + हिन्दी.
 *
 * **صغيرة عمدًا.** مرحلة تجريبية على نموذج واحد، فلا محرّك نماذج ثنائي ولا
 * تجريد `FieldSpec/SectionSpec` مُسبَق.
 *
 * قاعدة واحدة تحكمها جميعًا: **الإنجليزية ثم الفاصل `—` ثم الهندية، في سطر
 * واحد**. لا عنصر `block` ولا سطر ثانٍ في أي منها — وهذا ما يُبقي النموذج على
 * صفحة A4 واحدة.
 */

/** ترويسة قسم: `English — हिन्दी`. */
export function SectionHeaderEnHi({ en, hi }: { en: string; hi: string }) {
  return (
    <div style={sectionHeaderEnHi}>
      {en}
      <span style={sectionHeaderHiPart}>{EN_HI_SEPARATOR}{hi}</span>
    </div>
  );
}

/** تسمية ثنائية سطرية — تُستعمل داخل الجدول وخارجه على السواء. */
export function LabelEnHi({ en, hi }: { en: string; hi: string }) {
  return (
    <>
      {en}
      <span style={hiLabelText}>{EN_HI_SEPARATOR}{hi}</span>
    </>
  );
}

/**
 * صف حقل: التسمية `EN — HI` على سطر واحد، والقيمة إلى جانبها.
 *
 * القيمة تُمرَّر مصيَّرة (`ReactNode`) لأن المُنادي هو من يقرّر شكلها: الأكواد
 * والتواريخ والأرقام والمبالغ والأسماء **قيمة واحدة بلا نظير هندي** (قرار
 * التصميم المعتمد)، والقيم التعدادية وحدها تستعمل `EnumValueEnHi` أدناه.
 */
export function FieldRowEnHi({
  labelEn,
  labelHi,
  children,
  valueStyle,
}: {
  labelEn: string;
  labelHi: string;
  children: ReactNode;
  valueStyle?: React.CSSProperties;
}) {
  return (
    <div style={{ ...tableRow, direction: 'ltr' }}>
      <div style={{ ...labelCellEnHi, lineHeight: enHiLineHeight }}>
        <LabelEnHi en={labelEn} hi={labelHi} />
      </div>
      <div style={{ ...valueCellEnHi, lineHeight: enHiLineHeight, ...valueStyle }}>{children}</div>
    </div>
  );
}

/** قيمة تعدادية ثنائية (نوع الإجازة) — `EN — HI` على نفس السطر. */
export function EnumValueEnHi({ en, hi }: { en: string; hi: string }) {
  return (
    <>
      {en}
      <span style={hiValueText}>{EN_HI_SEPARATOR}{hi}</span>
    </>
  );
}

/** تسمية توقيع ثنائية — `EN — HI` فوق سطر التوقيع. */
export function SignatureLabelEnHi({ en, hi }: { en: string; hi: string }) {
  return (
    <strong>
      {en}
      <span style={{ ...hiLabelText, fontWeight: 600 }}>{EN_HI_SEPARATOR}{hi}</span>
    </strong>
  );
}
