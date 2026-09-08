/**
 * إقرار دين موظف — أمانة النص مقابل ملفات Word الأصلية.
 *
 * ═══ ما الذي يحرسه هذا الملف ═══
 * أن حزم المحتوى الثلاث (`content.ar.ts` / `content.en.ts` / `content.hi.ts`) **منقولة
 * حرفيًا** من ملفات DOCX في `docs/`، لا مصاغة ولا مترجَمة ولا مختصرة. لا يقارن هذا
 * الاختبار «تشابهًا» ولا يقيس نسبة تطابق: يعيد بناء كل فقرة من الحزمة (النصّ الحرفي +
 * سلاسل النقاط في مواضع الفراغات + مربّعات الاختيار) ويطلب أن تكون **موجودة حرفيًا**
 * ضمن فقرات ملف Word الخاص بتلك اللغة.
 *
 * لماذا هذا مهم بما يكفي ليكون اختبارًا: النصّ هنا نصّ قانوني. أي تحسين صياغة، أو حذف
 * عبارة، أو استنساخ جملة من قالب لغة أخرى، هو تغيير في التزام قانوني — لا تفصيل واجهة.
 * فتُكتشف مثل هذه التغييرات هنا آليًا بدل أن تُكتشف بعد التوقيع.
 *
 * ملفات DOCX نفسها هي مصدر التصميم فقط: التطبيق **لا يقرؤها وقت التشغيل** ولا يحتاج
 * Word ولا Office. تُقرأ هنا وفي وقت الاختبار وحده.
 */
import { beforeAll, describe, it, expect } from 'vitest';
import fs from 'node:fs';
import JSZip from 'jszip';

import {
  DATE_PLACEHOLDER,
  type Clause,
  type DebtAckContent,
  type Seg,
} from '../forms/debtAcknowledgment/debtAcknowledgmentModel';
import { DEBT_ACK_CONTENT_AR } from '../forms/debtAcknowledgment/content.ar';
import { DEBT_ACK_CONTENT_EN } from '../forms/debtAcknowledgment/content.en';
import { DEBT_ACK_CONTENT_HI } from '../forms/debtAcknowledgment/content.hi';

const DOCX: Record<'ar' | 'en' | 'hi', string> = {
  ar: '../docs/Iqrar_Dayn_Salfa_Muwazzaf_Kuwait_AR.docx',
  en: '../docs/Employee_Loan_Acknowledgment_Kuwait_EN.docx',
  hi: '../docs/Employee_Loan_Acknowledgment_Kuwait_HI.docx',
};

const PACKS: Record<'ar' | 'en' | 'hi', DebtAckContent> = {
  ar: DEBT_ACK_CONTENT_AR,
  en: DEBT_ACK_CONTENT_EN,
  hi: DEBT_ACK_CONTENT_HI,
};

/** فقرات مستند Word كنصوص مسطّحة — نفس ما يراه القارئ، بلا وسوم. */
async function readDocxParagraphs(path: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(fs.readFileSync(path));
  const xml = await zip.file('word/document.xml')!.async('string');
  const paragraphs: string[] = [];
  for (const p of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const text = [...p[1].matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join('');
    if (text.trim()) paragraphs.push(decodeXml(text));
  }
  return paragraphs;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** يعيد بناء نصّ الفقرة كما يعرضه Word حين لا يملأ أحد أي فراغ. */
function segsToSource(segs: Seg[]): string {
  return segs
    .map((seg) => {
      if (typeof seg === 'string') return seg;
      if ('f' in seg) return seg.p;
      if ('d' in seg) return DATE_PLACEHOLDER;
      if ('w' in seg) return '.'.repeat(84);
      return '☐';
    })
    .join('');
}

const clauseToSource = (c: Clause) => c.lead + segsToSource(c.segs);

/** كل نصّ يجب أن يوجد حرفيًا داخل فقرة واحدة من فقرات ملف Word. */
function expectVerbatim(paragraphs: string[], needle: string, label: string) {
  const found = paragraphs.some((p) => p.includes(needle));
  expect(found, `${label}\n  المتوقَّع حرفيًا داخل DOCX:\n  ${JSON.stringify(needle)}`).toBe(true);
}

describe.each(['ar', 'en', 'hi'] as const)('حزمة محتوى إقرار دين موظف — %s مقابل ملف Word', (lang) => {
  const pack = PACKS[lang];
  let paragraphs: string[] = [];

  beforeAll(async () => {
    paragraphs = await readDocxParagraphs(DOCX[lang]);
  });

  it('ملف DOCX المصدري موجود ويُقرأ', () => {
    expect(fs.existsSync(DOCX[lang])).toBe(true);
    expect(paragraphs.length).toBeGreaterThan(50);
  });

  it('العنوان والعنوان الفرعي وعناوين الأقسام الستة منقولة حرفيًا', () => {
    for (const [label, value] of [
      ['العنوان', pack.title],
      ['العنوان الفرعي', pack.subtitle],
      ['عنوان القسم 1', pack.s1Heading],
      ['عنوان القسم 2', pack.s2Heading],
      ['عنوان القسم 3', pack.s3Heading],
      ['المقدّمة', pack.preamble],
      ['عنوان القسم 4', pack.s4Heading],
      ['عنوان القسم 5', pack.s5Heading],
      ['عنوان القسم 6', pack.s6Heading],
      ['ملاحظة التوقيعات', pack.signaturesNote],
      ['عنوان الشهود', pack.witnessesHeading],
      ['عنوان الملحق', pack.annexTitle],
      ['ملاحظة الملحق', pack.annexNote],
      ['عنوان التعليمات', pack.guidanceTitle],
      ['عنوان المصادر', pack.sourcesHeading],
      ['التنبيه', pack.disclaimer],
    ] as const) {
      expectVerbatim(paragraphs, value, `${lang}: ${label}`);
    }
  });

  it('البنود الأربعة عشر منقولة حرفيًا بنصّها وفراغاتها ومربّعات اختيارها', () => {
    const clauses = [...pack.clauses1to3, ...pack.clauses4to7, ...pack.clauses8to14];
    expect(clauses).toHaveLength(14);
    clauses.forEach((clause, i) => {
      expectVerbatim(paragraphs, clauseToSource(clause), `${lang}: البند ${i + 1}`);
    });
  });

  it('صفوف جدولَي الدائن والمدين منقولة حرفيًا (التسمية والقيمة)', () => {
    for (const row of [...pack.creditorRows, ...pack.debtorRows, ...pack.annexSignRows]) {
      expectVerbatim(paragraphs, row.label, `${lang}: تسمية «${row.label}»`);
      expectVerbatim(paragraphs, segsToSource(row.segs), `${lang}: قيمة «${row.label}»`);
    }
  });

  it('جدول التوقيعات وصفوف الشهود والمترجم منقولة حرفيًا', () => {
    for (const header of pack.signatureHeader) expectVerbatim(paragraphs, header, `${lang}: رأس التوقيعات`);
    for (const row of pack.signatureRows)
      for (const cellSegs of row) expectVerbatim(paragraphs, segsToSource(cellSegs), `${lang}: خلية توقيع`);
    for (const row of pack.witnessRows) expectVerbatim(paragraphs, segsToSource(row), `${lang}: صف شاهد/مترجم`);
  });

  it('جدول السداد: أعمدته وخلاياه وسطر إجمالياته منقولة حرفيًا', () => {
    for (const col of pack.annexColumns) expectVerbatim(paragraphs, col, `${lang}: عمود ملحق «${col}»`);
    for (const cellText of pack.annexRowCells) expectVerbatim(paragraphs, cellText, `${lang}: خلية ملحق`);
    expectVerbatim(paragraphs, segsToSource(pack.annexTotals), `${lang}: سطر إجماليات الملحق`);
    expect(pack.annexRowCount).toBe(12);
  });

  it('جدول التعليمات المهمة منقول حرفيًا بصفوفه الثمانية', () => {
    expect(pack.guidanceRows).toHaveLength(8);
    for (const row of pack.guidanceRows) {
      expectVerbatim(paragraphs, row.label, `${lang}: تسمية تعليمة`);
      expectVerbatim(paragraphs, row.text, `${lang}: نصّ تعليمة`);
    }
  });

  it('المصادر القانونية الخمسة منقولة حرفيًا', () => {
    expect(pack.sources).toHaveLength(5);
    for (const source of pack.sources) expectVerbatim(paragraphs, source, `${lang}: مصدر قانوني`);
  });
});

describe('إقرار دين موظف — لا اختلاق ولا توحيد قسري بين اللغات', () => {
  it('القوالب الثلاثة متطابقة البنية: نفس عدد البنود والصفوف والأعمدة', () => {
    const shape = (c: DebtAckContent) => ({
      clauses: c.clauses1to3.length + c.clauses4to7.length + c.clauses8to14.length,
      creditorRows: c.creditorRows.length,
      debtorRows: c.debtorRows.length,
      signatureRows: c.signatureRows.length,
      witnessRows: c.witnessRows.length,
      annexColumns: c.annexColumns.length,
      annexRowCells: c.annexRowCells.length,
      annexRowCount: c.annexRowCount,
      annexSignRows: c.annexSignRows.length,
      guidanceRows: c.guidanceRows.length,
      sources: c.sources.length,
    });
    expect(shape(DEBT_ACK_CONTENT_EN)).toEqual(shape(DEBT_ACK_CONTENT_AR));
    expect(shape(DEBT_ACK_CONTENT_HI)).toEqual(shape(DEBT_ACK_CONTENT_AR));
  });

  it('كل قالب يحمل نصّه الخاص — لا نصّ مشترك منسوخ بين لغتين', () => {
    const titles = [DEBT_ACK_CONTENT_AR.title, DEBT_ACK_CONTENT_EN.title, DEBT_ACK_CONTENT_HI.title];
    expect(new Set(titles).size).toBe(3);
    const preambles = [
      DEBT_ACK_CONTENT_AR.preamble,
      DEBT_ACK_CONTENT_EN.preamble,
      DEBT_ACK_CONTENT_HI.preamble,
    ];
    expect(new Set(preambles).size).toBe(3);
  });

  it('البنود الأربعة عشر تشغل نفس الفراغات في اللغات الثلاث (خريطة حقول واحدة)', () => {
    const fieldsOf = (c: DebtAckContent) =>
      [...c.clauses1to3, ...c.clauses4to7, ...c.clauses8to14].map((clause) =>
        clause.segs
          .filter((s): s is Exclude<Seg, string> => typeof s !== 'string')
          .map((s) => ('f' in s ? s.f : 'd' in s ? s.d : 'w' in s ? `words:${s.w}` : `cb:${s.cb}`)),
      );
    expect(fieldsOf(DEBT_ACK_CONTENT_EN)).toEqual(fieldsOf(DEBT_ACK_CONTENT_AR));
    expect(fieldsOf(DEBT_ACK_CONTENT_HI)).toEqual(fieldsOf(DEBT_ACK_CONTENT_AR));
  });

  it('الاتجاه مأخوذ من ملف كل لغة: العربية RTL، والإنجليزية والهندية LTR', () => {
    expect(DEBT_ACK_CONTENT_AR.dir).toBe('rtl');
    expect(DEBT_ACK_CONTENT_EN.dir).toBe('ltr');
    // الهندية ليست RTL: ملف DOCX يعلن محاذاة يسار بلا `w:bidi` في أي فقرة.
    expect(DEBT_ACK_CONTENT_HI.dir).toBe('ltr');
  });

  it('ترتيب عمودَي الجداول يتبع ملف كل لغة لا افتراضًا', () => {
    expect(DEBT_ACK_CONTENT_AR.labelColumnFirst).toBe(false);
    expect(DEBT_ACK_CONTENT_EN.labelColumnFirst).toBe(true);
    expect(DEBT_ACK_CONTENT_HI.labelColumnFirst).toBe(true);
    expect(DEBT_ACK_CONTENT_AR.annexNumberFirst).toBe(false);
    expect(DEBT_ACK_CONTENT_EN.annexNumberFirst).toBe(true);
    expect(DEBT_ACK_CONTENT_HI.annexNumberFirst).toBe(true);
  });

  it('القالب الهندي يحمل ديفاناغارية حقيقية (U+0900–U+097F)', () => {
    const devanagari = /[ऀ-ॿ]/;
    expect(devanagari.test(DEBT_ACK_CONTENT_HI.title)).toBe(true);
    expect(devanagari.test(DEBT_ACK_CONTENT_HI.preamble)).toBe(true);
    for (const clause of DEBT_ACK_CONTENT_HI.clauses8to14) {
      expect(devanagari.test(clause.lead)).toBe(true);
    }
  });
});
