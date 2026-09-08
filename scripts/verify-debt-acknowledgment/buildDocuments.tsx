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
const SAMPLE: DebtAckData = {
  ...EMPTY_DEBT_ACK_DATA,
  creditorName: 'شركة المنار الدولية لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق ذ.م.م',
  creditorCivilId: '100000000000',
  creditorCommercialReg: '999999',
  creditorRepresentative: 'اسم الممثل القانوني — مدير عام',
  creditorAddress: 'الكويت — الشويخ الصناعية — هاتف 0000 0000',
  debtorFullName: 'موظف تجريبي للاختبار البصري',
  debtorCivilId: '299010100000',
  debtorNationality: 'الهند',
  debtorPassportNo: 'Z0000000',
  debtorEmployeeNo: 'TEST-001',
  debtorJobTitle: 'عامل تشغيل وصيانة',
  debtorAddressKuwait: 'الكويت — الفروانية — قطعة 0 — شارع 0 — منزل 0',
  debtorContact: '+965 0000 0000 / test@example.invalid',
  amountFigures: '500.000',
  amountWordsAr: 'خمسمائة',
  amountWordsEn: 'Five Hundred',
  amountWordsHi: 'पाँच सौ',
  transferNo: 'TRF-000000',
  chequeNo: '',
  cashReceiptNo: '',
  balanceFigures: '500.000',
  balanceWordsAr: 'خمسمائة',
  balanceWordsEn: 'Five Hundred',
  balanceWordsHi: 'पाँच सौ',
  installmentsCount: '10',
  installmentAmount: '50.000',
  monthlyDueDay: '28',
  finalInstallmentAmount: '50.000',
  creditorIban: 'KW00XXXX0000000000000000000000',
  explanationLanguage: 'الهندية / Hindi',
  creditorSignatoryName: 'اسم الموقّع عن الدائن',
  debtorSignatoryName: 'موظف تجريبي للاختبار البصري',
  witness1Name: 'شاهد أول تجريبي',
  witness1CivilId: '200000000000',
  witness2Name: 'شاهد ثانٍ تجريبي',
  witness2CivilId: '200000000001',
  interpreterName: 'مترجم تجريبي',
  interpreterLanguage: 'الهندية',
  interpreterCivilId: '200000000002',
  receiptDate: '2026-09-01',
  firstInstallmentDate: '2026-10-28',
  finalInstallmentDate: '2027-07-28',
  creditorSignDate: '2026-09-01',
  debtorSignDate: '2026-09-01',
  annexDate: '2026-09-01',
  disbursementMethod: 'transfer',
};

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
