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
import DebtAcknowledgmentTemplate from '../../frontend/src/forms/debtAcknowledgment/DebtAcknowledgmentTemplate';
import {
  EMPTY_DEBT_ACK_DATA,
  type DebtAckData,
  type DebtAckLang,
} from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentModel';
import { regenerateSchedule } from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentDocument';
import { withFixedCreditorData } from '../../frontend/src/forms/debtAcknowledgment/debtAcknowledgmentAutofill';
import {
  CREDITOR_NAME_AR,
  CREDITOR_NAME_LATIN,
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
const SAMPLE: DebtAckData = regenerateSchedule(
  withFixedCreditorData({
    ...EMPTY_DEBT_ACK_DATA,

    // ── القالب العربي ──────────────────────────────────────────────────────
    creditorName: CREDITOR_NAME_AR,
    creditorRepresentative: 'اسم الممثل القانوني — مدير عام',
    creditorAddress: 'الكويت — الشويخ الصناعية — هاتف 0000 0000',
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
    creditorRepresentativeLatin: 'LEGAL REPRESENTATIVE NAME — GENERAL MANAGER',
    creditorAddressLatin: 'Kuwait — Shuwaikh Industrial — Tel 0000 0000',
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
    creditorIban: 'KW00XXXX0000000000000000000000',
    installmentsCount: '5',
    receiptDate: '2026-09-01',
    firstInstallmentDate: '2026-10-15',
    creditorSignDate: '2026-09-01',
    debtorSignDate: '2026-09-01',
    annexDate: '2026-09-01',
    disbursementMethod: 'transfer',
  }),
);

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

function buildDocument(lang: DebtAckLang): string {
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
      createElement(DebtAcknowledgmentTemplate, { lang, data: SAMPLE }),
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
const manifest = langs.map((lang) => {
  const file = join(OUT, `debt-acknowledgment-${lang}.html`);
  writeFileSync(file, buildDocument(lang), 'utf-8');
  return { lang, html: file, bytes: readFileSync(file).length };
});

writeFileSync(
  join(OUT, 'manifest.json'),
  JSON.stringify(
    {
      profileId: PROFILE_ID,
      margins: profile.margins,
      page: profile.page,
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
  console.log(`  ${m.lang}: ${m.html} (${m.bytes} bytes)`);
}
