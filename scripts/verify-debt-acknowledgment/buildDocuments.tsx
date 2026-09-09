/**
 * Employee Debt Acknowledgment Administrative Form v1 — print-geometry harness, step 1/2.
 *
 * WHAT THIS IS (and is not)
 * -------------------------
 * It is a MEASUREMENT rig, not a second print path. It renders the SAME React template
 * the app renders (`DebtAcknowledgmentTemplate` inside the app's own `FormPage`), and
 * it derives the `@page` rule from the SAME source of truth the app derives it from —
 * `PRINT_PROFILES['employee-debt-acknowledgment-letterhead']` in `printProfiles.ts`.
 * Nothing here re-implements layout, and nothing here ships in the application.
 *
 * `frontend/src/__tests__/employeeDebtAcknowledgmentV1.test.tsx` guards the one seam
 * that could drift: it asserts that `FormLayout` really emits
 * `@page { size: A4; margin: <those same profile margins>; }` and `.form-page{padding:0}`
 * for this profile — i.e. that what this harness measures is what the app prints.
 *
 * Step 2 (`measure.cjs`) loads each emitted document in Electron and runs
 * `webContents.printToPDF({ printBackground: true, preferCSSPageSize: true })` — the
 * exact call and options the production WYSIWYG preview and PDF export use.
 *
 * Run (from the repo root):
 *   npx vite-node --root frontend scripts/verify-debt-acknowledgment/buildDocuments.tsx
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import FormPage from '../../frontend/src/forms/shared/FormPage';
import { PRINT_PROFILES } from '../../frontend/src/forms/shared/printProfiles';
import DebtAcknowledgmentTemplate, {
  DEBT_ACK_CONTENT,
} from '../../frontend/src/forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import {
  EMPTY_DEBT_ACK_DATA,
  type DebtAckData,
  type DebtAckLang,
} from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentModel';
import { regenerateSchedule } from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentDocument';
import { annexPageCount } from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentSchedule';
import { withFixedCreditorData } from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentAutofill';
import {
  CREDITOR_NAME_AR,
  CREDITOR_NAME_LATIN,
  DEFAULT_CREDITOR_CONTACT,
  DEFAULT_CREDITOR_REPRESENTATIVE,
  DEFAULT_CREDITOR_REPRESENTATIVE_LATIN,
  ROWS_PER_ANNEX_PAGE,
} from '../../frontend/src/forms/debtAcknowledgment/constants';
import { DOC_FONT_STACK, DOC_FONT_STACK_EN_HI } from '../../frontend/src/styles/fontRegistry';

const REPO = resolve(__dirname, '../..');
const OUT = join(REPO, 'artifacts', 'employee-debt-acknowledgment-v1');
const FONTS = join(REPO, 'frontend', 'src', 'assets', 'fonts');

const PROFILE_ID = 'employee-debt-acknowledgment-letterhead';
const profile = PRINT_PROFILES[PROFILE_ID];

/**
 * بيانات اختبار **مُصطنعة بالكامل** — لا صلة لها بأي موظف حقيقي ولا بأي قاعدة بيانات.
 * لا تُقرأ قاعدة بيانات ولا يُشغَّل خادم في هذا المسار إطلاقًا.
 */
/**
 * بيانات اختبار **مُصطنعة بالكامل** — لا صلة لها بأي موظف حقيقي ولا بأي قاعدة بيانات.
 * لا تُقرأ قاعدة بيانات ولا يُشغَّل خادم في هذا المسار إطلاقًا.
 *
 * الأرقام هي مثال مالك المنتج بالضبط: دَين 1000.000 د.ك على 5 أقساط، أولها
 * 15/10/2026 — فيخرج الجدول 200.000 × 5 وينتهي الرصيد عند 0.000.
 *
 * النظائر اللاتينية معبّأة كي يخرج القالبان الإنجليزي والهندي **بلا حرف عربي واحد**،
 * وهو ما يفحصه المقياس آليًا على الـPDF المُنتَج لا بالنظر.
 */
const SAMPLE_BASE: DebtAckData = withFixedCreditorData({
    ...EMPTY_DEBT_ACK_DATA,

    // ── القالب العربي ──────────────────────────────────────────────────────
    creditorName: CREDITOR_NAME_AR,
    // القيم الافتراضية نفسها التي يراها المستخدم في نموذج جديد، لا نصوصًا خاصة
    // بالمقياس — فورقة المراجعة تُظهر ما سيُطبع فعلًا.
    creditorRepresentative: DEFAULT_CREDITOR_REPRESENTATIVE,
    creditorAddress: DEFAULT_CREDITOR_CONTACT,
    debtorFullName: 'راجيش كومار',
    debtorCivilId: '292010100123',
    debtorNationality: 'الهند',
    debtorPassportNo: 'Z1234567',
    debtorEmployeeNo: 'TEST-001',
    debtorJobTitle: 'عامل تشغيل وصيانة',
    debtorAddressKuwait: 'الكويت — الفروانية — قطعة 3 — شارع 12',
    debtorContact: '+965 5000 0000 / test@example.invalid',
    explanationLanguage: 'الهندية',
    creditorSignatoryName: 'اسم الموقّع عن الدائن',
    debtorSignatoryName: 'راجيش كومار',
    witness1Name: 'شاهد أول تجريبي',
    witness1CivilId: '200000000000',
    witness2Name: 'شاهد ثانٍ تجريبي',
    witness2CivilId: '200000000001',
    interpreterName: 'مترجم تجريبي',
    interpreterLanguage: 'الهندية',
    interpreterCivilId: '200000000002',

    // ── النظائر اللاتينية (القالبان الإنجليزي والهندي) ──────────────────────
    creditorNameLatin: CREDITOR_NAME_LATIN,
    creditorRepresentativeLatin: DEFAULT_CREDITOR_REPRESENTATIVE_LATIN,
    creditorAddressLatin: DEFAULT_CREDITOR_CONTACT,
    debtorFullNameLatin: 'RAJESH KUMAR',
    debtorNationalityLatin: 'India',
    debtorJobTitleLatin: 'Operations and Maintenance Worker',
    debtorAddressKuwaitLatin: 'Kuwait — Farwaniya — Block 3 — Street 12',
    debtorContactLatin: '+965 5000 0000 / test@example.invalid',
    explanationLanguageLatin: 'Hindi',
    creditorSignatoryNameLatin: 'CREDITOR SIGNATORY NAME',
    debtorSignatoryNameLatin: 'RAJESH KUMAR',
    witness1NameLatin: 'FIRST WITNESS (TEST)',
    witness2NameLatin: 'SECOND WITNESS (TEST)',
    interpreterNameLatin: 'INTERPRETER (TEST)',
    interpreterLanguageLatin: 'Hindi',

    // ── المبالغ والتواريخ (قيمة واحدة للقوالب الثلاثة) ──────────────────────
    amountFigures: '1000.000',
    amountWordsAr: 'ألف',
    amountWordsEn: 'One Thousand',
    amountWordsHi: 'एक हज़ार',
    balanceFigures: '1000.000',
    balanceWordsAr: 'ألف',
    balanceWordsEn: 'One Thousand',
    balanceWordsHi: 'एक हज़ार',
    transferNo: 'TRF-000000',
    receiptDate: '2026-09-01',
    firstInstallmentDate: '2026-10-15',
    creditorSignDate: '2026-09-01',
    debtorSignDate: '2026-09-01',
    annexDate: '2026-09-01',
  disbursementMethod: 'cash',
});

/**
 * سيناريوهات المراجعة: **عدد الأقساط وحده** يتغيّر بينها، وكل ما عداه ثابت — فأي فرق
 * في المخرَج سببه العدد لا شيء آخر.
 *
 * ولماذا هذه الثلاثة: **5** مثال مالك المنتج الأصلي، وصفحةُ ملحق واحدة لكل نسخة؛
 * **13** أوّل عدد يتجاوز الصفحة الواحدة (12 + 1)، فيُظهر صفحة ثانية فيها قسط واحد
 * وأحد عشر صفًّا فارغًا؛ **25** يتجاوز صفحتين (24 + 1)، فيُثبت أن التقسيم يتكرّر ولا
 * يقف عند صفحتين، ويُخرج مجموعتَي ملحق من ثلاث صفحات لكلٍّ منهما.
 */
const SCENARIOS = [5, 13, 25];

/** نفس البيانات، وعددُ أقساطٍ واحد يتغيّر — والجدول يُشتقّ منه بالمولّد نفسه. */
const sampleFor = (installments: number): DebtAckData =>
  regenerateSchedule({ ...SAMPLE_BASE, installmentsCount: String(installments) });

function fontFace(family: string, file: string, weight: number, format: string): string {
  const url = pathToFileURL(join(FONTS, file)).href;
  return `@font-face{font-family:'${family}';src:url('${url}') format('${format}');font-weight:${weight};font-style:normal;font-display:block;}`;
}

/**
 * الخطوط: نفس ملفات المشروع التي يحمّلها التطبيق ويضمّنها مُركِّب المستند
 * (`composeDocument` يضمّن `Cairo-Regular.ttf`، و`styles/fonts.css` يعلن
 * `Noto Sans Devanagari` من نفس ملفي woff2 هذين).
 */
const FONT_FACES = [
  fontFace('Cairo', 'Cairo-Regular.ttf', 400, 'truetype'),
  fontFace('Cairo', 'Cairo-Bold.ttf', 700, 'truetype'),
  fontFace('Noto Sans Devanagari', 'NotoSansDevanagari-Regular.woff2', 400, 'woff2'),
  fontFace('Noto Sans Devanagari', 'NotoSansDevanagari-SemiBold.woff2', 600, 'woff2'),
].join('\n');

const { top, right, bottom, left } = profile.margins;

/**
 * `@page` — مبنيّ من قيم ملف الطباعة نفسها، بنفس الترتيب الذي يبنيه به `FormLayout`
 * (`${mt} ${mr} ${mb} ${ml}`). و`.form-page { padding: 0 }` هي نفس قاعدة الطباعة التي
 * يُصدرها `FormLayout` لأي ملف طباعة غير مُتراكِب الشعار — وهو حال هذا الملف.
 */
const PAGE_CSS = `
@page { size: A4; margin: ${top} ${right} ${bottom} ${left}; }
html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
.no-print { display: none !important; }
.form-page {
  width: 100% !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  overflow: visible !important;
  margin: 0 !important;
  max-width: none !important;
  border: none !important;
  box-shadow: none !important;
}
`;

function buildDocument(lang: DebtAckLang, data: DebtAckData): string {
  const shellLang: 'ar' | 'en' = lang === 'ar' ? 'ar' : 'en';
  const fontStack = lang === 'hi' ? DOC_FONT_STACK_EN_HI : DOC_FONT_STACK;

  const body = renderToStaticMarkup(
    createElement(
      FormPage,
      {
        lang: shellLang,
        padding: '18px 32px',
        docFontStack: fontStack,
        contentOnly: true,
        formNumber: '',
        title: '',
        titleFontSize: 22,
        qrData: { formType: 'employee-debt-acknowledgment', formNumber: '', entityName: '' },
      },
      createElement(DebtAcknowledgmentTemplate, { lang, data }),
    ),
  );

  const dir = shellLang === 'en' ? 'ltr' : 'rtl';
  return `<!DOCTYPE html>
<html dir="${dir}" lang="${shellLang}">
<head>
<meta charset="UTF-8">
<title>employee-debt-acknowledgment-${lang}</title>
<style>${FONT_FACES}</style>
<style>
  *, *::before, *::after { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #fff; font-family: ${fontStack}; }
  ${PAGE_CSS}
</style>
</head>
<body>${body}</body>
</html>`;
}

mkdirSync(OUT, { recursive: true });

const langs: DebtAckLang[] = ['ar', 'en', 'hi'];
const manifest = SCENARIOS.flatMap((installments) => {
  const data = sampleFor(installments);
  // عدد الأقساط المولَّد فعلًا، لا المطلوب: لو انكسر المولّد يومًا لظهر الفرق هنا بدل
  // أن يمرّ المقياس على مستندٍ ينقصه نصف جدوله.
  const generatedRows = data.schedule.length;
  const annexPagesPerCopy = annexPageCount(generatedRows, ROWS_PER_ANNEX_PAGE);
  const id = `i${String(installments).padStart(2, '0')}`;

  return langs.map((lang) => {
    const file = join(OUT, `debt-acknowledgment-${id}-${lang}.html`);
    writeFileSync(file, buildDocument(lang, data), 'utf-8');
    // نصّان مرجعيان يقرؤهما المقياس: عنوان الملحق (يجب أن يظهر مرة لكل صفحة ملحق في
    // كل نسخة) وعنوان التعليمات (يجب ألّا يظهر إطلاقًا — انتقل إلى حوار على الشاشة).
    const content = DEBT_ACK_CONTENT[lang];
    return {
      scenario: id,
      installments,
      generatedRows,
      annexPagesPerCopy,
      // صفحتا المستند + مجموعتا ملحق. الصيغة **متوقَّع** يُقارَن بالمقيس، لا بديل عنه.
      expectedPages: 2 + annexPagesPerCopy * 2,
      lang,
      html: file,
      bytes: readFileSync(file).length,
      annexTitle: content.annexTitle,
      guidanceTitle: content.guidanceTitle,
    };
  });
});

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      profileId: PROFILE_ID,
      margins: profile.margins,
      page: profile.page,
      rowsPerAnnexPage: ROWS_PER_ANNEX_PAGE,
      scenarios: SCENARIOS,
      generatedAt: new Date().toISOString(),
      documents: manifest,
    },
    null,
    2,
  ),
  'utf-8',
);

// eslint-disable-next-line no-console
console.log(`[debt-ack] wrote ${manifest.length} documents to ${OUT}`);
for (const m of manifest) {
  // eslint-disable-next-line no-console
  console.log(
    `  ${m.scenario}/${m.lang}: ${m.installments} instalments -> ${m.generatedRows} rows, ` +
      `${m.annexPagesPerCopy} annex page(s) per copy, ${m.expectedPages} pages expected`,
  );
}
