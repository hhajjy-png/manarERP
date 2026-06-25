import fs from 'fs';
import path from 'path';
import type { ReportInput } from './excel.service';

const FONT_PATH = path.resolve(process.cwd(), 'assets', 'fonts', 'Cairo-Regular.ttf');

let cachedFontBase64: string | null = null;

function getFontBase64(): string {
  if (cachedFontBase64 !== null) return cachedFontBase64;
  try {
    const buf = fs.readFileSync(FONT_PATH);
    cachedFontBase64 = buf.toString('base64');
  } catch {
    cachedFontBase64 = '';
  }
  return cachedFontBase64;
}

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number') {
    return value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
  }
  return esc(value);
}

export function buildReportHtml(input: ReportInput): string {
  const fontBase64 = getFontBase64();
  const fontFace = fontBase64
    ? `@font-face {
        font-family: 'Cairo';
        src: url('data:font/truetype;base64,${fontBase64}') format('truetype');
        font-weight: normal;
        font-style: normal;
      }`
    : '';

  const today = new Date().toLocaleDateString('ar-KW', {
    year: 'numeric', month: 'long', day: 'numeric',
  });

  const headerCells = input.columns
    .map(c => `<th>${esc(c.header)}</th>`)
    .join('');

  const bodyRows = input.rows.map((row, i) => {
    const cells = input.columns.map(c => `<td>${fmtCell(row[c.key])}</td>`).join('');
    const cls = i % 2 === 1 ? ' class="zebra"' : '';
    return `<tr${cls}>${cells}</tr>`;
  }).join('\n');

  const totalsRow = input.totalsRow
    ? `<tr class="totals">${input.columns.map(c => `<td>${fmtCell(input.totalsRow![c.key])}</td>`).join('')}</tr>`
    : '';

  return `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(input.title)}</title>
  <style>
    ${fontFace}

    @page {
      size: A4 landscape;
      margin: 10mm;
    }

    *, *::before, *::after {
      box-sizing: border-box;
      print-color-adjust: exact;
      -webkit-print-color-adjust: exact;
    }

    html, body {
      direction: rtl;
      font-family: 'Cairo', 'Arial', sans-serif;
      font-size: 11px;
      color: #1f2933;
      background: #fff;
      margin: 0;
      padding: 0;
    }

    .report-header {
      text-align: center;
      margin-bottom: 12px;
    }

    .report-header h1 {
      font-size: 17px;
      font-weight: 700;
      color: #1d4e6f;
      margin: 0 0 4px 0;
    }

    .report-header .subtitle {
      font-size: 11px;
      color: #64748b;
      margin: 0 0 2px 0;
    }

    .report-header .generated {
      font-size: 10px;
      color: #94a3b8;
      margin: 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10px;
    }

    thead {
      display: table-header-group;
    }

    tfoot {
      display: table-footer-group;
    }

    thead tr {
      background: #1d4e6f;
      color: #ffffff;
    }

    thead th {
      padding: 7px 8px;
      text-align: right;
      font-weight: 700;
      border: 1px solid #15405d;
      white-space: nowrap;
    }

    tbody td {
      padding: 6px 8px;
      text-align: right;
      border: 1px solid #e2e8f0;
    }

    tbody tr.zebra {
      background: #f4f6f9;
    }

    tbody tr {
      page-break-inside: avoid;
    }

    tfoot tr.totals td {
      padding: 7px 8px;
      text-align: right;
      font-weight: 700;
      background: #e8f0f7;
      border: 1px solid #1d4e6f;
      border-top: 2px solid #1d4e6f;
      color: #1d4e6f;
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>${esc(input.title)}</h1>
    ${input.subtitle ? `<p class="subtitle">${esc(input.subtitle)}</p>` : ''}
    <p class="generated">شركة المنار · تاريخ التقرير: ${today}</p>
  </div>

  <table>
    <thead>
      <tr>${headerCells}</tr>
    </thead>
    <tbody>
      ${bodyRows}
    </tbody>
    ${totalsRow ? `<tfoot>${totalsRow}</tfoot>` : ''}
  </table>
</body>
</html>`;
}
