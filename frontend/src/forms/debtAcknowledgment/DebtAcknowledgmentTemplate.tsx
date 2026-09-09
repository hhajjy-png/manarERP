/**
 * إقرار دين موظف — المُصيِّر البنيوي للقوالب الثلاثة.
 *
 * ═══ لماذا مُصيِّر واحد وثلاثة نصوص ═══
 * ملفات Word الثلاثة متطابقة **البنية** حرفيًا (نفس الأقسام، نفس الجداول، نفس فواصل
 * الصفحات الثلاثة، نفس مواضع الفراغات) ومختلفة **النص** فقط. لذلك يعيش النص في ثلاثة
 * ملفات محتوى مستقلة (`content.ar.ts` / `content.en.ts` / `content.hi.ts`) منقولة
 * حرفيًا كلٌّ من ملف DOCX الخاص بها، ويعيش الهيكل هنا مرة واحدة. **لا ترجمة وقت
 * التشغيل بين القوالب**: هذا الملف لا يعرف كلمة واحدة من نصّ المستند.
 *
 * ═══ الطباعة ═══
 * لا محرّك طباعة هنا. هذا المكوّن يُصيَّر **داخل** `FormPage` التي يملكها
 * `FormLayout`، فيطبع عبر نفس مسار الطباعة/المعاينة الدقيقة الذي تستخدمه كل النماذج
 * الإدارية. ما يضيفه هذا الملف هو فواصل الصفحات الثلاثة (`break-before: page`) —
 * **نفس** الفواصل الصريحة الموجودة في ملفات DOCX، بلا زيادة ولا نقصان. أي فاصل
 * إضافي تراه في المطبوع هو كسر تلقائي من محرّك التنضيد لأن القسم أطول من صفحة،
 * تمامًا كما يفعل Word بالملف الأصلي (انظر تعليق القسم 1 أدناه).
 *
 * ═══ الهندسة (40mm / 20mm) ═══
 * الحزام العلوي والسفلي **ليسا** من هذا الملف: يفرضهما `@page { margin }` المشتقّ من
 * ملف الطباعة `employee-debt-acknowledgment-letterhead` في `printProfiles.ts`، فيسريان
 * على **كل** صفحة من صفحات المستند تلقائيًا، لا على الأولى وحدها.
 *
 * ما في هذا الملف هو **نموذج الشاشة**: كل قسم يُرسم بعرض A4 وبنفس هوامش ملف الطباعة،
 * مع خطين متقطعين يبيّنان حدّي الحزامين. فهو مطابق للمطبوع في الهوامش والعرض والمحتوى،
 * وتقريبي في **تقسيم الصفحات** وحده حين يزيد قسم عن صفحة (القسم 1 يزيد فعلًا). المرجع
 * الدقيق للتقسيم هو زر «📄 معاينة دقيقة» — يعرض صفحات Chromium الحقيقية عبر
 * `printToPDF`، وهو مسار المعاينة المعتمد في المشروع.
 */
import type { CSSProperties, ReactNode } from 'react';
import { formatDate } from '../../lib/date';
import { formatNumber } from '../../lib/format/currency';
import { resolveFieldValue } from './debtAcknowledgmentValues';
import {
  DATE_PLACEHOLDER,
  type DebtAckContent,
  type DebtAckData,
  type DebtAckLang,
  type FieldId,
  type LabelledRow,
  type Seg,
} from './debtAcknowledgmentModel';
import type { InstallmentRow } from './debtAcknowledgmentSchedule';
import { DEBT_ACK_CONTENT_AR } from './content.ar';
import { DEBT_ACK_CONTENT_EN } from './content.en';
import { DEBT_ACK_CONTENT_HI } from './content.hi';

export const DEBT_ACK_CONTENT: Record<DebtAckLang, DebtAckContent> = {
  ar: DEBT_ACK_CONTENT_AR,
  en: DEBT_ACK_CONTENT_EN,
  hi: DEBT_ACK_CONTENT_HI,
};

/**
 * الحقول التي تُعزل اتجاهيًا إلى LTR عند العرض: أرقام، تواريخ، IBAN، هويات.
 * بدون العزل يعيد محرّك bidi ترتيب `15/06/2026` أو `KW81…` داخل فقرة عربية.
 */
const LTR_FIELDS = new Set<FieldId>([
  'creditorCivilId',
  'creditorCommercialReg',
  'debtorCivilId',
  'debtorPassportNo',
  'debtorEmployeeNo',
  'debtorContact',
  'amountFigures',
  'balanceFigures',
  'transferNo',
  'chequeNo',
  'cashReceiptNo',
  'installmentsCount',
  'installmentAmount',
  'monthlyDueDay',
  'finalInstallmentAmount',
  'creditorIban',
  'witness1CivilId',
  'witness2CivilId',
  'interpreterCivilId',
]);

export interface DebtAcknowledgmentTemplateProps {
  lang: DebtAckLang;
  data: DebtAckData;
}

/** لون العناوين والمقدّمات في ملفات Word الثلاثة. */
const INK_HEADING = '#17365D';
const INK_MUTED = '#666666';
const INK_ALERT = '#9C0006';
const FILL_LABEL = '#EAF0F7';
const FILL_ANNEX_HEAD = '#D9E4F2';
const CELL_BORDER = '0.5pt solid #000000';

const cell: CSSProperties = { border: CELL_BORDER, padding: '2pt 5pt', verticalAlign: 'middle' };
const labelCell: CSSProperties = {
  ...cell,
  background: FILL_LABEL,
  color: INK_HEADING,
  fontWeight: 700,
  fontSize: '9.5pt',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};
const valueCell: CSSProperties = { ...cell, fontSize: '9.5pt' };

/**
 * مضاعف مساحة الكتابة في خانات التوقيع — قرار مالك المنتج: **ضعف** المساحة السابقة.
 *
 * ═══ لماذا مضاعف لا ارتفاع ثابت بالمليمتر ═══
 * ارتفاع ثابت يفترض أن نصّ الخانة سطر واحد دائمًا. وصفوف الشهود والمترجم طويلة، وقد
 * تلتفّ إلى سطرين في لغة دون أخرى (النصّ الهندي أطول من الإنجليزي، والعربي أقصر) —
 * فيصبح «الضعف» ضعفًا في لغة وأقلّ منه في أخرى. المضاعف يحفظ النسبة بالضبط مهما التفّ
 * النصّ ومهما اختلفت اللغة:
 *
 *   الارتفاع = (المحتوى × M) + (الحشو العلوي) + (الحشو السفلي × (2M − 1))
 *            = M × (المحتوى + 2 × الحشو)  =  M × الارتفاع الأصلي
 *
 * فـ`M = 1` يعطي الهندسة السابقة حرفًا بحرف (لا شيء يُضاف)، و`M = 2` يضاعفها بالضبط.
 * وهذا ما يجعل القياس قبل/بعد قابلًا للإثبات: يُقاس الملف نفسه بالقيمتين.
 *
 * **الحشو العلوي لا يتغيّر**، فتبقى التسمية («التوقيع والختم:» ، «شاهد أول: …») في
 * موضعها الرأسي السابق تمامًا، وتنزل المساحة المضافة كلها **تحتها** — وهي مساحة
 * الكتابة المقصودة. لا يتغيّر عرض الخانة ولا حجم الخط ولا عدد التواقيع ولا ترتيبها.
 */
export const SIGNATURE_SPACE_MULTIPLIER = 2;

/** الحشو الرأسي الأصلي لخلايا جدول التوقيعات، بالنقاط. */
const SIGNATURE_CELL_PAD_PT = 6;
/** الحشو الرأسي الأصلي لصفوف الشهود والمترجم، بالنقاط. */
const WITNESS_CELL_PAD_PT = 5;
/** الحشو الرأسي الأصلي لخلايا الجداول العامة (يشمل سطرَي توقيع الملحق). */
const DATA_CELL_PAD_PT = 2;

/** أسماء مناطق التوقيع في جدول الشهود، بترتيب صفوف ملفات Word الثلاثة. */
const WITNESS_AREAS = ['witness-1', 'witness-2', 'interpreter'];

/**
 * حشو خانة توقيع بعد تطبيق المضاعف. `padPt` هو الحشو الرأسي الأصلي للخانة بالنقاط.
 *
 * ═══ ما الذي يُضاعَف بالضبط ═══
 * **مساحة الكتابة** = صندوق المحتوى + حشوه الرأسي. هذه هي المساحة البيضاء التي يوقّع
 * فيها الموقّع، وهي التي تتضاعف بالضبط:
 *
 *   قبل:  المحتوى + 2P
 *   بعد:  (المحتوى × M) + P + (2M − 1)·P  =  M × (المحتوى + 2P)
 *
 * حدّ الخلية (0.5pt) **خارج** هذا الحساب عمدًا وليس سهوًا: هو خيط شعري تتقاسمه الخلية
 * مع جارتها (`border-collapse`)، فلا يُعدّ مساحة كتابة، وتغليظه ممنوع لأنه يغيّر شكل
 * الجدول. لذلك يبقى الحدّ كما هو، ويقيس مقياسُ الهندسة النسبةَ على صندوق المحتوى
 * والحشو — فيخرج الضعف **بالضبط** (2.00) في اللغات الثلاث وفي كل خانة.
 */
function signaturePadding(padPt: number): CSSProperties {
  return {
    paddingTop: `${padPt}pt`,
    paddingBottom: `${padPt * (2 * SIGNATURE_SPACE_MULTIPLIER - 1)}pt`,
  };
}

/**
 * محتوى خانة توقيع: النصّ كما هو، يليه (M − 1) نسخة **غير مرئية** منه.
 *
 * النسخة المخفيّة تحجز ارتفاع سطورها بالضبط — بنفس الالتفاف وبنفس الخط — ولا تُرسم:
 * `visibility: hidden` يمنع الطلاء، فلا يظهر حرف على الورق ولا يدخل الـPDF أي محرف
 * منها (تحقّق منه قياسُ الحبر، الذي لا يرى شيئًا في المساحة المضافة). و`aria-hidden`
 * يمنع قارئ الشاشة من تكرارها.
 */
function SignatureArea({ area, children }: { area: string; children: ReactNode }) {
  const spacers = Array.from({ length: SIGNATURE_SPACE_MULTIPLIER - 1 }, (_unused, i) => i);
  return (
    <span data-eda-sig={area} className="eda-sig">
      <span className="eda-sig-label">{children}</span>
      {spacers.map((i) => (
        <span key={`sp${i}`} className="eda-sig-space" aria-hidden="true">
          {children}
        </span>
      ))}
    </span>
  );
}

function segKey(i: number) {
  return `s${i}`;
}

/** يُصيّر فراغًا: القيمة المُدخلة إن وُجدت، وإلا سلسلة النقاط الحرفية من ملف Word. */
function slot(value: string, placeholder: string, ltr: boolean, key: string): ReactNode {
  if (!value) return <span key={key}>{placeholder}</span>;
  return (
    <span key={key} className={ltr ? 'eda-val eda-val--ltr' : 'eda-val'}>
      {value}
    </span>
  );
}

function renderSegs(segs: Seg[], data: DebtAckData, lang: DebtAckLang): ReactNode[] {
  return segs.map((seg, i) => {
    const key = segKey(i);
    if (typeof seg === 'string') return <span key={key}>{seg}</span>;
    // القيمة تُحلّ عبر `resolveFieldValue` وحدها — نفس الدالة التي يفحصها الحارس
    // اللغوي، فما يُفحص هو ما يُطبع حرفًا بحرف (وأرقامه غربية دائمًا).
    if ('f' in seg) return slot(resolveFieldValue(data, seg.f, lang), seg.p, LTR_FIELDS.has(seg.f), key);
    if ('d' in seg) {
      const iso = data[seg.d];
      return slot(iso ? formatDate(iso) : '', DATE_PLACEHOLDER, true, key);
    }
    if ('w' in seg) {
      const suffix = lang === 'ar' ? 'Ar' : lang === 'en' ? 'En' : 'Hi';
      const id = `${seg.w === 'amount' ? 'amountWords' : 'balanceWords'}${suffix}` as FieldId;
      return slot(resolveFieldValue(data, id, lang), '.'.repeat(84), false, key);
    }
    return (
      <span key={key} className="eda-cb">
        {data.disbursementMethod === seg.cb ? '☑' : '☐'}
      </span>
    );
  });
}

/**
 * نصّ خلية واحدة في صفّ مولَّد من جدول السداد.
 *
 * المبالغ عبر `formatNumber` (مُنسِّق المشروع: أرقام غربية، ثلاث خانات، بلا لغة)،
 * واللاحقة (` د.ك` / ` KWD`) من حزمة المحتوى — أي من ملف Word نفسه لا من اللغة.
 * التواريخ عبر `formatDate` (DD/MM/YYYY) كشكل الأصل. خانة الملاحظات تبقى فراغ الأصل:
 * هي لرقم الإيصال الذي يُكتب يوم السداد الفعلي، لا لبيانٍ مولَّد.
 */
function annexCellText(content: DebtAckContent, row: InstallmentRow, cellIndex: number): string {
  const role = content.annexCellRoles[cellIndex];
  const money = (v: number) => `${formatNumber(v)}${content.annexAmountSuffix}`;
  switch (role) {
    case 'dueDate':
      return row.dueDate ? formatDate(row.dueDate) : DATE_PLACEHOLDER;
    case 'amount':
      return money(row.amount);
    case 'balance':
      return money(row.remainingBalance);
    default:
      return content.annexRowCells[cellIndex];
  }
}

function DataTable({
  rows,
  content,
  data,
  labelWidth,
  areaPrefix,
}: {
  rows: LabelledRow[];
  content: DebtAckContent;
  data: DebtAckData;
  labelWidth: string;
  /** بادئة اسم منطقة التوقيع للصفوف المعلَّمة `signature` — للقياس فقط. */
  areaPrefix?: string;
}) {
  return (
    <table className="eda-tbl">
      <tbody>
        {rows.map((row, ri) => {
          const labelTd = (
            <td key="l" style={{ ...labelCell, width: labelWidth }}>
              {row.label}
            </td>
          );
          const body = renderSegs(row.segs, data, content.lang);
          const valueTd = (
            <td key="v" style={row.signature ? { ...valueCell, ...signaturePadding(DATA_CELL_PAD_PT) } : valueCell}>
              {row.signature ? (
                <SignatureArea area={`${areaPrefix ?? 'row'}-${ri + 1}`}>{body}</SignatureArea>
              ) : (
                body
              )}
            </td>
          );
          return (
            <tr key={row.label}>
              {content.labelColumnFirst ? [labelTd, valueTd] : [valueTd, labelTd]}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Heading({ children }: { children: ReactNode }) {
  return <h2 className="eda-h1">{children}</h2>;
}

function ClauseList({
  clauses,
  content,
  data,
}: {
  clauses: DebtAckContent['clauses1to3'];
  content: DebtAckContent;
  data: DebtAckData;
}) {
  return (
    <>
      {clauses.map((c) => (
        <p key={c.lead} className="eda-clause">
          <span className="eda-clause-lead">{c.lead}</span>
          {renderSegs(c.segs, data, content.lang)}
        </p>
      ))}
    </>
  );
}

export default function DebtAcknowledgmentTemplate({ lang, data }: DebtAcknowledgmentTemplateProps) {
  const c = DEBT_ACK_CONTENT[lang];
  const annexNumbers = Array.from({ length: c.annexRowCount }, (_, i) => String(i + 1));

  return (
    <div className="eda-root" dir={c.dir} lang={lang}>
      <style>{TEMPLATE_CSS}</style>

      {/* ── القسم 1 (صفحة DOCX الأولى): العنوان + الأقسام 1–5 (البنود 1–14) ────

          قياس موثَّق: هذا القسم **لا يسع صفحة A4 واحدة** بمقاسات خطوط الأصل نفسها —
          يحتاج قرابة 1.6 صفحة (انظر `artifacts/employee-debt-acknowledgment-v1/geometry-report.json`).
          فيقسمه Word تلقائيًا حيث تنتهي الصفحة، وكذلك يفعل المتصفح. لم يُضَف هنا
          فاصل صفحات من عندنا: الفواصل الثلاثة أدناه هي فواصل ملف DOCX الصريحة وحدها،
          وقرار إضافة فاصل رابع (أو تقصير النص) يخصّ مالك المنتج لا التنفيذ. */}
      <section className="eda-page">
        <h1 className="eda-title">{c.title}</h1>
        <p className="eda-subtitle">{c.subtitle}</p>

        <Heading>{c.s1Heading}</Heading>
        <DataTable rows={c.creditorRows} content={c} data={data} labelWidth="26%" />

        <Heading>{c.s2Heading}</Heading>
        <DataTable rows={c.debtorRows} content={c} data={data} labelWidth="26%" />

        <Heading>{c.s3Heading}</Heading>
        <p className="eda-clause">{c.preamble}</p>
        <ClauseList clauses={c.clauses1to3} content={c} data={data} />

        <Heading>{c.s4Heading}</Heading>
        <ClauseList clauses={c.clauses4to7} content={c} data={data} />

        <Heading>{c.s5Heading}</Heading>
        <ClauseList clauses={c.clauses8to14} content={c} data={data} />
      </section>

      {/* ── القسم 2 (فاصل DOCX صريح): التوقيعات والشهود ───────────────────────── */}
      <section className="eda-page">
        <Heading>{c.s6Heading}</Heading>
        <p className="eda-note">{c.signaturesNote}</p>

        <table className="eda-tbl eda-sig-block">
          <tbody>
            <tr>
              {c.signatureHeader.map((h) => (
                <td key={h} style={{ ...labelCell, width: '50%', color: '#0f172a' }}>
                  {h}
                </td>
              ))}
            </tr>
            {c.signatureRows.map((row, ri) => {
              const isSignatureRow = ri === c.signatureRowIndex;
              return (
                <tr key={`sig${ri}`}>
                  {row.map((cellSegs, ci) => {
                    const body = renderSegs(cellSegs, data, c.lang);
                    const area = ci === 0 ? 'creditor-signature' : 'debtor-signature';
                    return (
                      <td
                        key={`c${ci}`}
                        style={{
                          ...valueCell,
                          ...(isSignatureRow
                            ? signaturePadding(SIGNATURE_CELL_PAD_PT)
                            : { paddingTop: `${SIGNATURE_CELL_PAD_PT}pt`, paddingBottom: `${SIGNATURE_CELL_PAD_PT}pt` }),
                        }}
                      >
                        {isSignatureRow ? <SignatureArea area={area}>{body}</SignatureArea> : body}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>

        <p className="eda-subhead">{c.witnessesHeading}</p>
        <table className="eda-tbl eda-sig-block">
          <tbody>
            {c.witnessRows.map((row, ri) => (
              <tr key={`w${ri}`}>
                <td style={{ ...valueCell, ...signaturePadding(WITNESS_CELL_PAD_PT) }}>
                  <SignatureArea area={WITNESS_AREAS[ri] ?? `witness-${ri + 1}`}>
                    {renderSegs(row, data, c.lang)}
                  </SignatureArea>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* ── القسم 3 (فاصل DOCX صريح): ملحق (أ) — جدول السداد ────────────────────────────── */}
      <section className="eda-page">
        <p className="eda-annex-title">{c.annexTitle}</p>
        <table className="eda-tbl eda-tbl--annex">
          <tbody>
            <tr>
              {c.annexColumns.map((h) => (
                <td
                  key={h}
                  style={{
                    ...cell,
                    background: FILL_ANNEX_HEAD,
                    color: INK_HEADING,
                    fontWeight: 700,
                    fontSize: '9pt',
                    WebkitPrintColorAdjust: 'exact',
                    printColorAdjust: 'exact',
                  }}
                >
                  {h}
                </td>
              ))}
            </tr>
            {annexNumbers.map((n, rowIndex) => {
              // صفوف الجدول المولَّد تُملأ بالحساب؛ ما زاد عن عدد الأقساط يبقى صفًّا
              // فارغًا بنقاط الأصل حرفيًا («وتُشطب الصفوف غير المستخدمة» كما يقول الملحق).
              const row = data.schedule[rowIndex];
              const numberCell = (
                <td key="n" style={{ ...cell, fontSize: '8.5pt' }} className="eda-val--ltr">
                  {n}
                </td>
              );
              const others = c.annexRowCells.map((blank, i) => (
                <td key={`c${i}`} style={{ ...cell, fontSize: '8.5pt' }} className={row ? 'eda-val--ltr' : undefined}>
                  {row ? annexCellText(c, row, i) : blank}
                </td>
              ));
              return <tr key={n}>{c.annexNumberFirst ? [numberCell, ...others] : [...others, numberCell]}</tr>;
            })}
          </tbody>
        </table>
        <p className="eda-annex-totals">{renderSegs(c.annexTotals, data, c.lang)}</p>
        <p className="eda-annex-note">{c.annexNote}</p>
        <DataTable rows={c.annexSignRows} content={c} data={data} labelWidth="26%" areaPrefix="annex-signature" />
      </section>

      {/* ── القسم 4 (فاصل DOCX صريح): تعليمات مهمة + المصادر القانونية + التنبيه ────────── */}
      <section className="eda-page">
        <p className="eda-annex-title">{c.guidanceTitle}</p>
        <table className="eda-tbl">
          <tbody>
            {c.guidanceRows.map((row) => {
              const labelTd = (
                <td key="l" style={{ ...labelCell, width: '25%', fontSize: '9pt' }}>
                  {row.label}
                </td>
              );
              const textTd = (
                <td key="t" style={{ ...cell, fontSize: '9pt' }}>
                  {row.text}
                </td>
              );
              return <tr key={row.label}>{c.labelColumnFirst ? [labelTd, textTd] : [textTd, labelTd]}</tr>;
            })}
          </tbody>
        </table>

        <Heading>{c.sourcesHeading}</Heading>
        <ul className="eda-sources">
          {c.sources.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="eda-disclaimer">{c.disclaimer}</p>
      </section>
    </div>
  );
}

/**
 * أنماط المستند.
 *
 * تُصيَّر داخل `<style>` في الشجرة نفسها ليلتقطها `capturePrintStyles` مع بقية
 * أنماط المستند عند تركيب المعاينة الدقيقة و«حفظ PDF» — فالمعاينة والطباعة والـPDF
 * تقرأ نفس القواعد حرفيًا، بلا نسخة ثانية.
 *
 * مقاسات الخطوط والألوان مأخوذة من ملفات DOCX نفسها (نصف-النقطة ÷ 2).
 */
const TEMPLATE_CSS = `
/* تباعد الأسطر: فقرات ملفات Word تعلن \`w:line=269 lineRule=auto\` — أي 1.12 **مضروبة
   في تباعد السطر الطبيعي للخط** (لا في حجم الخط)، وهو ~1.15em للخطوط النصية. القيمة
   المكافئة في CSS هي ≈1.29، لا 1.12. هذا ليس اختيارًا جماليًا: صندوق السطر الأضيق من
   صندوق المحرف يجعل الحروف تتجاوز صندوق المحتوى، فتدخل حزام الترويسة العلوي 40mm
   وحزام التذييل 20mm — وهو ما رصده قياس هندسة الطباعة فعليًا قبل هذا التصحيح.
   خلايا الجداول تستعمل التباعد المفرد (single) كما في ملف Word: ≈1.15. */
.eda-root { color: #0f172a; line-height: 1.29; }
.eda-title { font-size: 18pt; font-weight: 700; color: ${INK_HEADING}; margin: 0 0 2pt; line-height: 1.29; }
.eda-subtitle { font-size: 9.5pt; color: ${INK_MUTED}; margin: 0 0 6pt; line-height: 1.29; }
.eda-h1 { font-size: 13.5pt; font-weight: 700; color: ${INK_HEADING}; margin: 12pt 0 4pt; line-height: 1.29; }
.eda-page > .eda-h1:first-child { margin-top: 0; }
.eda-clause { font-size: 10.5pt; margin: 0 0 5pt; line-height: 1.29; text-align: justify; }
.eda-clause-lead { font-weight: 700; color: ${INK_HEADING}; }
.eda-note { font-size: 10pt; color: ${INK_MUTED}; margin: 0 0 6pt; line-height: 1.29; }
.eda-subhead { font-size: 10.5pt; font-weight: 700; color: ${INK_HEADING}; margin: 10pt 0 4pt; }
.eda-annex-title { font-size: 16pt; font-weight: 700; color: ${INK_HEADING}; margin: 0 0 6pt; }
.eda-annex-totals { font-size: 9.5pt; font-weight: 700; color: ${INK_HEADING}; margin: 6pt 0 3pt; }
.eda-annex-note { font-size: 9.5pt; font-weight: 700; color: ${INK_ALERT}; margin: 0 0 8pt; }
.eda-sources { font-size: 8.5pt; color: ${INK_MUTED}; margin: 4pt 0 6pt; padding-inline-start: 16pt; line-height: 1.25; }
.eda-sources li { margin-bottom: 2pt; }
.eda-disclaimer { font-size: 8.5pt; font-weight: 700; color: ${INK_ALERT}; margin: 0; line-height: 1.2; }
.eda-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; margin: 0 0 4pt; }
.eda-tbl td { word-wrap: break-word; overflow-wrap: anywhere; line-height: 1.15; }
.eda-tbl--annex { table-layout: auto; }
.eda-sig { display: block; }
/* التسمية في أعلى الخانة كما كانت، والمساحة المضافة تحتها.
   eda-sig-space نسخة غير مرئية من نفس النصّ: تحجز ارتفاع سطوره بالضبط — بنفس
   الالتفاف وبنفس الخط — ولا تُطلى، فلا يصل منها حرف إلى الورق ولا إلى الـPDF. */
.eda-sig-label { display: block; }
.eda-sig-space { display: block; visibility: hidden; }
.eda-val { font-weight: 700; color: #0f172a; }
.eda-val--ltr { direction: ltr; unicode-bidi: isolate; }
.eda-cb { font-family: "Cairo", Arial, sans-serif; }

@media screen {
  /* نموذج الورقة على الشاشة: كل صفحة منطقية تُرسم بمقاس A4 كامل وبنفس هوامش ملف
     الطباعة، فما يظهر في المعاينة الداخلية هو ما تخرجه الطابعة (حزام 40mm علوي و
     20mm سفلي). القاعدة مقصورة على ورقة تحتوي هذا النموذج (:has) فلا تمسّ أي نموذج آخر. */
  .form-page:has(.eda-root) {
    padding: 0 !important;
    max-width: 210mm !important;
    background: transparent !important;
    border: none !important;
    box-shadow: none !important;
    border-radius: 0 !important;
  }
  .eda-page {
    position: relative;
    width: 210mm;
    min-height: 297mm;
    box-sizing: border-box;
    padding: 40mm 16.5mm 20mm;
    margin: 0 auto 10mm;
    background: #fff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 2px 12px rgba(0, 0, 0, 0.07);
  }
  /* دليلا الحزامين المحجوزين لترويسة ورق الشركة وتذييله — على الشاشة فقط، فلا يصلان
     إلى الورق ولا إلى PDF ولا إلى المعاينة الدقيقة (كلها وسيط طباعة). يريان لمالك
     المنتج **أين** يبدأ المحتوى وأين يتوقف قبل أن يطبع على الورق الرسمي. */
  .eda-page::before,
  .eda-page::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    border-top: 1px dashed #cbd5e1;
    pointer-events: none;
  }
  .eda-page::before { top: 40mm; }
  .eda-page::after { bottom: 20mm; }
}

@media print {
  /* الحزام العلوي/السفلي يفرضه @page (ملف الطباعة) على كل صفحة — فلا حشو هنا. */
  .eda-page {
    width: auto;
    min-height: 0;
    padding: 0;
    margin: 0;
    background: transparent;
    border: none;
    box-shadow: none;
  }
  .eda-page + .eda-page {
    break-before: page;
    page-break-before: always;
  }
  .eda-clause,
  .eda-tbl tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  /* كتلة التوقيعات لا تُشطر بين صفحتين: توقيعٌ في صفحة واسمُ صاحبه في أخرى يفسد
     المستند. القاعدة على **الجدول** لا على القسم كله، فلو لم يتّسع لها ما بقي من
     الصفحة انتقلت كاملةً إلى التالية بدل أن تُقصّ — ولا تُنشئ صفحة فارغة لأن ما
     بعدها يواصل التدفّق طبيعيًا. يؤكّده قياس الهندسة (عدد الصفحات وسلامة الأحزمة). */
  .eda-sig-block {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .eda-h1 {
    break-after: avoid;
    page-break-after: avoid;
  }
}
`;
