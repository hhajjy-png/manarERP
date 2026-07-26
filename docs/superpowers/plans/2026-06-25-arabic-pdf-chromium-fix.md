# Arabic PDF Chromium Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the broken PDFKit Arabic renderer with an Electron Chromium HTML→PDF pipeline so all report PDFs produce correct, selectable, RTL Arabic text.

**Architecture:** Backend adds `buildReportHtml(input: ReportInput): string` (self-contained HTML with embedded Cairo font). Financial export routes add `format=html` support that returns `text/html`. Electron gains a new `pdf:exportHtml` IPC handler that creates a hidden BrowserWindow, loads the HTML from a temp file, calls `printToPDF()`, and saves the result. Frontend PDF export buttons call `format=html` endpoint, receive HTML text, and route it to the Electron IPC handler.

**Tech Stack:** Electron 31 `webContents.printToPDF()` · Cairo TTF (already in frontend assets) · Axios (responseType: 'text') · Express text/html response · Node `fs` + `app.getPath('temp')`

---

## Global Constraints

- Offline-first — no CDN, no network fonts, no external resources in the generated HTML
- Arabic text must remain selectable and searchable in the PDF viewer
- Do NOT touch accounting logic, Statement Engine, Approval Engine
- Do NOT change Excel export in any way
- Do NOT merge — feature branch only; wait for Gemini review after completion
- TypeScript strict mode throughout; no `any` without justification
- Follow module pattern: routes → controller → service (backend); IPC → preload → frontend API (Electron)
- Currency: KWD, 3 decimal places
- All new IPC channels must be bridged through `preload.ts` via contextBridge

---

## Architecture Decision

**Option 2 from spec: Backend returns HTML, Electron converts via IPC.**

Flow:
```
User clicks PDF
  → Frontend calls GET /financial/.../export?format=html
  → Backend calls buildReportHtml(input) → returns text/html
  → Frontend receives HTML string
  → Frontend calls window.manar.exportPdfFromHtml(html, filename)
  → Electron IPC: pdf:exportHtml handler
  → Creates hidden BrowserWindow
  → Writes HTML to temp file, loads file:// URL
  → Waits for did-finish-load
  → webContents.printToPDF({ preferCSSPageSize: true, printBackground: true })
  → Saves buffer to user-chosen path
  → Returns { success, path, sizeBytes }
```

Why Option 2:
- Backend already owns the data fetching and adapter logic (toStatementReportInput, etc.)
- No duplication of adapter logic in the frontend
- Minimal changes to FinancialCenter.tsx (8 onPdfExport callbacks)
- Electron Chromium handles all Arabic shaping, BiDi, font rendering natively
- ReportPrint.tsx already generates correct HTML — its PDF export uses the existing `pdf:export` IPC

---

## File Map

### Created
| File | Responsibility |
|------|---------------|
| `backend/assets/fonts/Cairo-Regular.ttf` | Arabic font for HTML embedding — copied from frontend assets |
| `backend/src/shared/services/reportEngine/html.service.ts` | `buildReportHtml(input)` — generates self-contained A4-landscape HTML with embedded font |
| `backend/src/shared/services/reportEngine/html.service.test.ts` | Unit tests for HTML template correctness |
| `frontend/src/utils/pdfExport.ts` | `exportReportAsPdf(endpoint, params, filename)` — fetches HTML from backend, sends to Electron IPC |

### Modified
| File | What changes |
|------|-------------|
| `backend/src/modules/financial/financial.schema.ts` | Add `'html'` to all 6 format enum literals |
| `backend/src/modules/financial/financial.service.ts` | All 8 export methods: add `'html'` branch that calls `buildReportHtml()` |
| `backend/src/modules/financial/financial.controller.ts` | Update `sendFile()` helper to handle html format with `text/html` content-type |
| `electron/ipc/pdf.ipc.ts` | Add `pdf:exportHtml` IPC handler |
| `electron/preload.ts` | Expose `exportPdfFromHtml(html, filename)` via contextBridge |
| `frontend/src/pages/FinancialCenter.tsx` | 8 `onPdfExport` callbacks use `exportReportAsPdf()` instead of blob download |
| `frontend/src/pages/ReportPrint.tsx` | PDF button calls `window.manar.exportPdf(filename)` instead of `window.print()` |
| `electron-builder.yml` | Add `backend/assets` to `extraResources` for production packaging |

---

## Task 1: Git Setup — Checkpoint Tag + Feature Branch

**Files:** none (git operations only)

**Interfaces:**
- Produces: branch `feature/arabic-pdf-chromium-fix` checked out, tag `pre-arabic-pdf-chromium-fix` on current HEAD

- [ ] **Step 1: Create checkpoint tag**

```bash
git tag pre-arabic-pdf-chromium-fix
```

Expected: `pre-arabic-pdf-chromium-fix` tag created on current HEAD (`18dd862`)

- [ ] **Step 2: Create and checkout feature branch**

```bash
git checkout -b feature/arabic-pdf-chromium-fix
```

Expected: `Switched to a new branch 'feature/arabic-pdf-chromium-fix'`

- [ ] **Step 3: Verify**

```bash
git log --oneline -3
git branch
```

Expected: branch shown as `* feature/arabic-pdf-chromium-fix`

---

## Task 2: Copy Cairo Font to Backend Assets

**Files:**
- Create: `backend/assets/fonts/Cairo-Regular.ttf`

**Interfaces:**
- Produces: `backend/assets/fonts/Cairo-Regular.ttf` (~94 KB) on disk
- Consumed by: Task 3 (`html.service.ts` reads it at runtime via `process.cwd()`)

- [ ] **Step 1: Create the fonts directory and copy the font**

Run from the project root (PowerShell):

```powershell
New-Item -ItemType Directory -Force backend\assets\fonts
Copy-Item frontend\src\assets\fonts\Cairo-Regular.ttf backend\assets\fonts\Cairo-Regular.ttf
```

- [ ] **Step 2: Verify the file exists and is the correct size**

```powershell
Get-Item backend\assets\fonts\Cairo-Regular.ttf | Select-Object Name, Length
```

Expected: `Cairo-Regular.ttf  94480` (±100 bytes)

- [ ] **Step 3: Commit**

```bash
git add backend/assets/fonts/Cairo-Regular.ttf
git commit -m "chore: add Cairo-Regular.ttf to backend assets for HTML report font embedding"
```

---

## Task 3: Backend — HTML Report Service

**Files:**
- Create: `backend/src/shared/services/reportEngine/html.service.ts`
- Create: `backend/src/shared/services/reportEngine/html.service.test.ts`

**Interfaces:**
- Consumes: `ReportInput` from `'./excel.service'`
- Produces: `buildReportHtml(input: ReportInput): string` — returns a complete self-contained HTML document

**Key design decisions:**
- Font is read from disk once and cached in module scope (lazy, first-call)
- If font file missing, falls back to `Arial, sans-serif` without crashing
- HTML uses `@page { size: A4 landscape; margin: 10mm; }` with `preferCSSPageSize` in Electron
- All text is escaped to prevent XSS in cell values

- [ ] **Step 1: Write the failing tests first**

Create `backend/src/shared/services/reportEngine/html.service.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildReportHtml } from './html.service';
import type { ReportInput } from './excel.service';

const SAMPLE: ReportInput = {
  title: 'كشف حساب — شركة المنار',
  subtitle: 'من 2026-01-01 إلى 2026-06-30',
  columns: [
    { header: 'التاريخ',  key: 'date',   width: 14 },
    { header: 'البيان',   key: 'desc',   width: 30 },
    { header: 'مدين',     key: 'debit',  width: 14 },
    { header: 'دائن',     key: 'credit', width: 14 },
    { header: 'الرصيد',   key: 'bal',    width: 14 },
  ],
  rows: [
    { date: '2026-01-15', desc: 'فاتورة نقل', debit: 1500.500, credit: '', bal: 1500.500 },
    { date: '2026-02-01', desc: 'دفعة مقبوضة', debit: '', credit: 1000.000, bal: 500.500 },
  ],
  totalsRow: { date: '', desc: 'الإجمالي', debit: 1500.500, credit: 1000.000, bal: 500.500 },
};

describe('buildReportHtml', () => {
  it('returns a non-empty string', () => {
    const html = buildReportHtml(SAMPLE);
    expect(typeof html).toBe('string');
    expect(html.length).toBeGreaterThan(200);
  });

  it('contains the report title in Arabic', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('كشف حساب');
    expect(html).toContain('شركة المنار');
  });

  it('contains the subtitle', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('من 2026-01-01');
  });

  it('has RTL direction on html element', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toMatch(/dir=["']rtl["']/);
  });

  it('contains all column headers', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('التاريخ');
    expect(html).toContain('البيان');
    expect(html).toContain('مدين');
    expect(html).toContain('دائن');
    expect(html).toContain('الرصيد');
  });

  it('contains row data', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('فاتورة نقل');
    expect(html).toContain('دفعة مقبوضة');
  });

  it('contains the totals row', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('الإجمالي');
  });

  it('has A4 landscape page size in CSS', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toMatch(/size:\s*A4\s+landscape/);
  });

  it('has @font-face with Cairo', () => {
    const html = buildReportHtml(SAMPLE);
    expect(html).toContain('@font-face');
    expect(html).toContain('Cairo');
  });

  it('escapes HTML special characters in cell values', () => {
    const dangerous: ReportInput = {
      title: 'Test',
      columns: [{ header: 'Val', key: 'v', width: 10 }],
      rows: [{ v: '<script>alert(1)</script>' }],
    };
    const html = buildReportHtml(dangerous);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npm test -- --reporter=verbose html.service
```

Expected: all tests FAIL with "Cannot find module './html.service'"

- [ ] **Step 3: Implement `html.service.ts`**

Create `backend/src/shared/services/reportEngine/html.service.ts`:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npm test -- --reporter=verbose html.service
```

Expected: all 9 tests PASS

- [ ] **Step 5: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add backend/src/shared/services/reportEngine/html.service.ts
git add backend/src/shared/services/reportEngine/html.service.test.ts
git commit -m "feat(pdf): add buildReportHtml() — self-contained Arabic HTML report generator with embedded Cairo font"
```

---

## Task 4: Backend — Wire `format=html` Into Financial Exports

**Files:**
- Modify: `backend/src/modules/financial/financial.schema.ts` — 6 format enum literals
- Modify: `backend/src/modules/financial/financial.service.ts` — 8 export methods
- Modify: `backend/src/modules/financial/financial.controller.ts` — `sendFile()` helper + 1 controller function

**Interfaces:**
- Consumes: `buildReportHtml` from `'@shared/services/reportEngine/html.service'`
- Produces: `GET /financial/.../export?format=html` returns `Content-Type: text/html; charset=utf-8`

- [ ] **Step 1: Update `financial.schema.ts` — add `'html'` to all format enums**

Open `backend/src/modules/financial/financial.schema.ts`. Find every occurrence of `z.enum(['pdf', 'excel'])` and change to `z.enum(['pdf', 'html', 'excel'])`. There are 6 occurrences: `ExportQuerySchema`, `AgingQuerySchema`, `GlReportQuerySchema`, `TrialBalanceQuerySchema`, `JournalBookQuerySchema`, `SummaryQuerySchema`.

Also update the inline Zod literal in `financial.controller.ts` line 123:
```ts
// Before:
const query = GlStatementQuerySchema.extend({ format: z.enum(['pdf', 'excel']).default('excel') }).parse(req.query);
// After:
const query = GlStatementQuerySchema.extend({ format: z.enum(['pdf', 'html', 'excel']).default('excel') }).parse(req.query);
```

- [ ] **Step 2: Update `financial.service.ts` — all 8 export methods**

Add `buildReportHtml` import at the top of the file:
```typescript
import { buildReportHtml }              from '@shared/services/reportEngine/html.service';
```

Change every export method signature from `format: 'pdf' | 'excel'` to `format: 'pdf' | 'html' | 'excel'` and add the html branch. Pattern (same for all 8):

```typescript
// exportStatement — example; repeat pattern for all 8 export* methods
async exportStatement(
  entityType: string,
  entityId: number,
  filters: { fromDate?: string; toDate?: string; search?: string; referenceType?: string },
  format: 'pdf' | 'html' | 'excel'
): Promise<Buffer> {
  const data       = await this.getStatement(entityType, entityId, filters);
  const entityName = String(data.metadata?.entityName ?? '');
  const input      = toStatementReportInput(data, entityName);
  if (format === 'html') return Buffer.from(buildReportHtml(input), 'utf-8');
  if (format === 'pdf')  return Buffer.from(buildReportHtml(input), 'utf-8'); // PDFKit replaced
  return buildExcel(input);
}
```

Apply the same pattern to:
- `exportArAging` — adapter: `toAgingReportInput(data, 'ar')`
- `exportApAging` — adapter: `toAgingReportInput(data, 'ap')`
- `exportGlStatement` — adapter: `toGlStatementReportInput(data)`
- `exportGlReport` — adapter: `toGlReportInput(data)`
- `exportTrialBalance` — adapter: `toTrialBalanceReportInput(data)`
- `exportJournalBook` — adapter: `toJournalBookReportInput(data)`
- `exportFinancialSummary` — adapter: `toSummaryReportInput(data)`

Note: `format === 'pdf'` also now calls `buildReportHtml` — this retires PDFKit in financial exports permanently. The `buildPdf` import from `pdf.service.ts` can be removed from this file.

- [ ] **Step 3: Update `financial.controller.ts` — handle html content-type**

Replace the existing `sendFile` helper with:

```typescript
function sendFile(res: Response, buffer: Buffer, name: string, format: 'pdf' | 'html' | 'excel') {
  if (format === 'html') {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${name}.html"`);
    return res.send(buffer);
  }
  const ext         = format === 'pdf' ? 'pdf' : 'xlsx';
  const contentType = format === 'pdf'
    ? 'application/pdf'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${Date.now()}.${ext}"`);
  res.send(buffer);
}
```

Also update `exportStatement` controller (lines 38–66) which has inline content-type logic instead of using `sendFile`. Change it to use `sendFile(res, buffer, \`statement-${entityType}-${id}\`, format)`:

```typescript
export async function exportStatement(req: Request, res: Response): Promise<void> {
  const { entityType, id } = StatementParamsSchema.parse(req.params);
  const query  = ExportQuerySchema.parse(req.query);
  const format = query.format as 'pdf' | 'html' | 'excel';

  const buffer = await financialService.exportStatement(entityType, id, query, format);

  recordAudit({
    req,
    action:   'REPORT_EXPORT',
    module:   'financial',
    entityId: undefined,
    newValue: {
      reportType: 'statement',
      entityType,
      entityId: id,
      format,
      filters: sanitizeFilters(query as Record<string, unknown>),
    },
  }).catch(() => {});

  sendFile(res, buffer, `statement-${entityType}-${id}`, format);
}
```

Update all other export controllers that cast format: change `'pdf' | 'excel'` cast to `'pdf' | 'html' | 'excel'`.

- [ ] **Step 4: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Run all backend tests**

```bash
cd backend && npm test
```

Expected: all tests pass (html.service tests + all existing tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/financial/financial.schema.ts
git add backend/src/modules/financial/financial.service.ts
git add backend/src/modules/financial/financial.controller.ts
git commit -m "feat(pdf): add format=html support to all 8 financial export routes — replaces PDFKit with buildReportHtml"
```

---

## Task 5: Electron — New `pdf:exportHtml` IPC Handler

**Files:**
- Modify: `electron/ipc/pdf.ipc.ts` — add `pdf:exportHtml` handler below existing `pdf:export`
- Modify: `electron/preload.ts` — expose `exportPdfFromHtml` on `window.manar`
- Modify: `electron-builder.yml` — add `backend/assets` to extraResources

**Interfaces:**
- Consumes: IPC channel `pdf:exportHtml(html: string, suggestedName: string)`
- Produces: `window.manar.exportPdfFromHtml(html: string, suggestedName: string): Promise<{ success: boolean; canceled?: boolean; path?: string; sizeBytes?: number; error?: string }>`

- [ ] **Step 1: Update `electron/ipc/pdf.ipc.ts` — add `pdf:exportHtml` handler**

Open the file. After the closing brace of the existing `ipcMain.handle('pdf:export', ...)` block (before the final `}`), add:

```typescript
  ipcMain.handle('pdf:exportHtml', async (event, html: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { success: false, error: 'تعذّر الوصول إلى نافذة التطبيق' };

    const safeDefault = suggestedName ? `${suggestedName}.pdf` : 'report.pdf';

    const saveResult = await dialog.showSaveDialog(win, {
      title: 'حفظ PDF',
      defaultPath: safeDefault,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return { success: false, canceled: true };
    }

    const filePath  = saveResult.filePath;
    const tmpPath   = path.join(app.getPath('temp'), `manar-report-${Date.now()}.html`);
    let   hiddenWin: BrowserWindow | null = null;

    try {
      await fs.promises.writeFile(tmpPath, html, 'utf-8');

      hiddenWin = new BrowserWindow({
        show: false,
        webPreferences: {
          nodeIntegration:  false,
          contextIsolation: true,
          sandbox:          true,
        },
      });

      await hiddenWin.loadFile(tmpPath);
      // Allow Chromium one render cycle to finish font layout
      await new Promise<void>((resolve) => setTimeout(resolve, 400));

      const pdfBuffer = await hiddenWin.webContents.printToPDF({
        printBackground:  true,
        preferCSSPageSize: true,
      });

      hiddenWin.close();
      hiddenWin = null;
      await fs.promises.unlink(tmpPath).catch(() => {});

      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      await fs.promises.writeFile(filePath, pdfBuffer);

      const { size } = fs.statSync(filePath);
      // eslint-disable-next-line no-console
      console.log(`[pdf:exportHtml] تم الحفظ: ${filePath} (${size} بايت)`);
      return { success: true, path: filePath, sizeBytes: size };
    } catch (err) {
      hiddenWin?.close();
      await fs.promises.unlink(tmpPath).catch(() => {});
      // eslint-disable-next-line no-console
      console.error('[pdf:exportHtml] خطأ:', err);
      return {
        success: false,
        error: `فشل تصدير PDF: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });
```

The file imports `{ BrowserWindow, dialog, ipcMain }` from `'electron'` and `fs`, `path` — verify both are present. Add `app` to the electron import: `import { BrowserWindow, dialog, ipcMain, app } from 'electron';`

The complete file after edit should look like:

```typescript
import { BrowserWindow, dialog, ipcMain, app } from 'electron';
import fs from 'fs';
import path from 'path';

export function registerPdfIpc() {
  ipcMain.handle('pdf:export', async (event, suggestedName: string) => {
    // ... existing code unchanged ...
  });

  ipcMain.handle('pdf:exportHtml', async (event, html: string, suggestedName: string) => {
    // ... new code above ...
  });
}
```

- [ ] **Step 2: Update `electron/preload.ts` — expose `exportPdfFromHtml`**

In the `api` object, after the existing `exportPdf` entry, add:

```typescript
  /** تصدير HTML كـ PDF عبر Chromium (يُستخدم للتقارير العربية). */
  exportPdfFromHtml: (
    html: string,
    suggestedName: string,
  ): Promise<{
    success: boolean;
    canceled?: boolean;
    path?: string;
    sizeBytes?: number;
    error?: string;
  }> => ipcRenderer.invoke('pdf:exportHtml', html, suggestedName),
```

- [ ] **Step 3: Update `electron-builder.yml` — add backend/assets to extraResources**

In `electron-builder.yml`, in the `extraResources:` section, add:

```yaml
  - from: backend/assets
    to: backend/assets
```

Full extraResources section after edit:
```yaml
extraResources:
  - from: backend/dist
    to: backend/dist
  - from: backend/node_modules
    to: backend/node_modules
    filter:
      - "**/*"
  - from: backend/prisma
    to: backend/prisma
  - from: backend/package.json
    to: backend/package.json
  - from: backend/data/manar.db
    to: backend/data/manar.db
  - from: backend/assets
    to: backend/assets
```

- [ ] **Step 4: TypeScript check on Electron**

```bash
tsc -p electron/tsconfig.json --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/pdf.ipc.ts
git add electron/preload.ts
git add electron-builder.yml
git commit -m "feat(electron): add pdf:exportHtml IPC handler — hidden BrowserWindow printToPDF pipeline for Arabic reports"
```

---

## Task 6: Frontend — PDF Export Utility + FinancialCenter Wiring

**Files:**
- Create: `frontend/src/utils/pdfExport.ts`
- Modify: `frontend/src/pages/FinancialCenter.tsx` — 8 `onPdfExport` callbacks
- Modify: `frontend/src/pages/ReportPrint.tsx` — PDF button

**Interfaces:**
- Consumes: `window.manar.exportPdfFromHtml(html, filename)` (bridged in Task 5)
- Consumes: `GET /financial/.../export?format=html` endpoints (added in Task 4)
- Produces: User-triggered save dialog → PDF file saved to disk

- [ ] **Step 1: Create `frontend/src/utils/pdfExport.ts`**

```typescript
import { api } from '../api/client';

type PdfResult = { success: boolean; canceled?: boolean; error?: string };

declare global {
  interface Window {
    manar?: {
      exportPdfFromHtml: (html: string, suggestedName: string) => Promise<PdfResult>;
      exportPdf: (suggestedName: string) => Promise<PdfResult>;
    };
  }
}

/**
 * Fetches HTML from a backend export endpoint (format=html) and sends it
 * to the Electron pdf:exportHtml IPC handler for Chromium-based PDF generation.
 * Arabic text is correctly shaped, RTL-ordered, and selectable in the output PDF.
 */
export async function exportReportAsPdf(
  endpoint: string,
  params: Record<string, unknown>,
  filename: string,
): Promise<void> {
  if (!window.manar?.exportPdfFromHtml) {
    throw new Error('تصدير PDF غير متاح خارج التطبيق');
  }

  const response = await api.get<string>(endpoint, {
    params:       { ...params, format: 'html' },
    responseType: 'text',
  });

  const html   = response.data;
  const result = await window.manar.exportPdfFromHtml(html, filename);

  if (!result.success && !result.canceled) {
    throw new Error(result.error ?? 'فشل تصدير PDF');
  }
}
```

- [ ] **Step 2: Update FinancialCenter.tsx — Statement PDF (doExport function)**

Find the `doExport` function in `FinancialCenter.tsx` (around line 170). Replace the `'pdf'` branch:

```typescript
// Before:
async function doExport(format: 'excel' | 'pdf') {
  if (!entityId) return;
  setExporting(true);
  try {
    const blob = await financialApi.exportStatement(entityType, entityId, {
      fromDate: fromDate || undefined,
      toDate:   toDate   || undefined,
      search:   search   || undefined,
      format,
    });
    const entity = entities.find(e => e.id === entityId);
    saveBlob(blob, `statement-${entity?.code ?? entityId}.${format === 'excel' ? 'xlsx' : 'pdf'}`);
  } finally {
    setExporting(false);
  }
}

// After:
async function doExport(format: 'excel' | 'pdf') {
  if (!entityId) return;
  setExporting(true);
  try {
    const entity = entities.find(e => e.id === entityId);
    if (format === 'pdf') {
      await exportReportAsPdf(
        `/financial/statements/${entityType}/${entityId}/export`,
        { fromDate: fromDate || undefined, toDate: toDate || undefined, search: search || undefined },
        `statement-${entity?.code ?? entityId}`,
      );
    } else {
      const blob = await financialApi.exportStatement(entityType, entityId, {
        fromDate: fromDate || undefined,
        toDate:   toDate   || undefined,
        search:   search   || undefined,
        format,
      });
      saveBlob(blob, `statement-${entity?.code ?? entityId}.xlsx`);
    }
  } finally {
    setExporting(false);
  }
}
```

Also add the import at the top of the file:
```typescript
import { exportReportAsPdf } from '../utils/pdfExport';
```

- [ ] **Step 3: Update FinancialCenter.tsx — Aging PDF (lines ~498–505)**

```typescript
// Before (AR Aging PDF):
const blob = agingSubTab === 'ar'
  ? await financialApi.exportArAging({ asOfDate: agingAsOfDate || undefined, format: 'pdf' })
  : await financialApi.exportApAging({ asOfDate: agingAsOfDate || undefined, format: 'pdf' });
saveBlob(blob, `${agingSubTab}-aging.pdf`);

// After:
await exportReportAsPdf(
  `/financial/${agingSubTab}-aging/export`,
  { asOfDate: agingAsOfDate || undefined },
  `${agingSubTab}-aging`,
);
```

- [ ] **Step 4: Update FinancialCenter.tsx — GL Statement PDF (lines ~564–569)**

```typescript
// Before:
const blob = await financialApi.exportGlStatement(glAccountId, { fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'pdf' });
saveBlob(blob, `gl-statement-${glAccountId}.pdf`);

// After:
await exportReportAsPdf(
  `/financial/gl-statement/${glAccountId}/export`,
  { fromDate: glFrom || undefined, toDate: glTo || undefined },
  `gl-statement-${glAccountId}`,
);
```

- [ ] **Step 5: Update FinancialCenter.tsx — GL Report PDF (lines ~652–656)**

```typescript
// Before:
const blob = await financialApi.exportGlReport({ fromDate: glFrom || undefined, toDate: glTo || undefined, format: 'pdf' });
saveBlob(blob, 'gl-report.pdf');

// After:
await exportReportAsPdf(
  '/financial/gl-report/export',
  { fromDate: glFrom || undefined, toDate: glTo || undefined },
  'gl-report',
);
```

- [ ] **Step 6: Update FinancialCenter.tsx — Trial Balance PDF**

Find the Trial Balance tab's `onPdfExport` callback and replace it. Look for the pattern `financialApi.exportTrialBalance(..., format: 'pdf')`:

```typescript
// After:
await exportReportAsPdf(
  '/financial/trial-balance/export',
  {
    mode:     trialMode,
    asOfDate: trialMode === 'as-of'  ? (trialAsOf || undefined) : undefined,
    fromDate: trialMode === 'period' ? (trialFrom  || undefined) : undefined,
    toDate:   trialMode === 'period' ? (trialTo    || undefined) : undefined,
  },
  'trial-balance',
);
```

- [ ] **Step 7: Update FinancialCenter.tsx — Journal Book PDF**

Find the Journal Book tab's `onPdfExport` callback:

```typescript
// After:
await exportReportAsPdf(
  '/financial/journal-book/export',
  {
    fromDate: jFrom   || undefined,
    toDate:   jTo     || undefined,
    status:   jStatus || undefined,
    search:   jSearch || undefined,
  },
  'journal-book',
);
```

- [ ] **Step 8: Update FinancialCenter.tsx — Financial Summary PDF (FinancialReportsTab)**

The Financial Summary export is in `FinancialReportsTab.tsx`, called via `handleExport('pdf')`. Since `FinancialReportsTab` uses `financialApi.exportFinancialSummary({ format })` which returns a blob, we need to update `FinancialReportsTab.tsx`.

In `frontend/src/components/financial/FinancialReportsTab.tsx`:

Add import:
```typescript
import { exportReportAsPdf } from '../../utils/pdfExport';
```

Update `handleExport`:
```typescript
async function handleExport(format: 'pdf' | 'excel') {
  if (format === 'pdf') {
    await exportReportAsPdf(
      '/financial/summary/export',
      { fromDate: fromDate || undefined, toDate: toDate || undefined },
      'financial-summary',
    );
    return;
  }
  const blob = await financialApi.exportFinancialSummary({
    fromDate: fromDate || undefined,
    toDate:   toDate   || undefined,
    format,
  });
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: 'financial-summary.xlsx' }).click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 9: Update `ReportPrint.tsx` — use Electron PDF export instead of window.print()**

In `frontend/src/pages/ReportPrint.tsx`:

Add import:
```typescript
import { useParams } from 'react-router-dom'; // already imported
```

Replace the "طباعة / حفظ PDF" button:

```tsx
// Before:
<button className="btn" onClick={() => window.print()}>🖨️ طباعة / حفظ PDF</button>

// After:
<button
  className="btn"
  onClick={async () => {
    if (window.manar?.exportPdf) {
      await window.manar.exportPdf(`report-${type ?? 'report'}`);
    } else {
      window.print();
    }
  }}
>
  🖨️ حفظ PDF
</button>
```

This uses the existing `pdf:export` IPC (which prints the current window — ReportPrint.tsx — to PDF via Chromium). No new IPC channel needed for this path.

- [ ] **Step 10: TypeScript check on frontend**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 11: Commit**

```bash
git add frontend/src/utils/pdfExport.ts
git add frontend/src/pages/FinancialCenter.tsx
git add frontend/src/components/financial/FinancialReportsTab.tsx
git add frontend/src/pages/ReportPrint.tsx
git commit -m "feat(pdf): wire all Financial Center PDF exports to Chromium HTML→PDF pipeline via Electron IPC"
```

---

## Task 7: Build Validation

**Files:** none modified — validation only

**Interfaces:** none

- [ ] **Step 1: Backend build**

```bash
npm run build:back
```

Expected: compiles to `backend/dist/` with 0 errors

- [ ] **Step 2: Frontend build**

```bash
npm run build:front
```

Expected: Vite build completes, `frontend/dist/` generated with 0 errors

- [ ] **Step 3: Electron TypeScript build**

```bash
npm run electron:build
```

Expected: compiles to `electron-dist/` with 0 errors

- [ ] **Step 4: Backend tests**

```bash
cd backend && npm test
```

Expected: all tests pass including the new `html.service.test.ts` (9 tests)

- [ ] **Step 5: Commit validation result (if no new commits were needed)**

If all pass cleanly without any fixes, record the result:
```bash
git log --oneline -5
```

If any build error required a fix, commit that fix before declaring this task done.

---

## Manual Smoke Test Checklist

After running `npm run dev` (the full app with Electron):

### Setup
- [ ] App launches successfully
- [ ] Backend health check passes (no port errors)
- [ ] Login as admin works

### Financial Center PDF Tests

For each test below: open Financial Center → navigate to the tab → load data → click PDF export button → save dialog appears → choose Desktop → open the PDF in a viewer.

**Statement PDF**
- [ ] Arabic title (كشف حساب — [entity name]) is readable
- [ ] Arabic column headers (التاريخ / البيان / مدين / دائن / الرصيد) are readable
- [ ] Arabic entity name (customer or supplier name) is readable
- [ ] Arabic date values are readable
- [ ] KWD numbers (e.g., 1,234.500) display correctly
- [ ] Text is selectable in the PDF viewer
- [ ] Text search finds Arabic words
- [ ] Layout is RTL (text starts from right)
- [ ] No corrupted characters like `d64d` or `?????`

**AR Aging PDF**
- [ ] Arabic column headers are readable
- [ ] Customer names in Arabic are readable
- [ ] Bucket values (0-30 يوم etc.) are readable
- [ ] Text is selectable

**Trial Balance PDF**
- [ ] Arabic account names are readable
- [ ] Debit/credit columns display correctly
- [ ] الرصيد المدين / الرصيد الدائن labels are readable

**Journal Book PDF**
- [ ] Arabic journal entries are readable
- [ ] رقم القيد and التاريخ columns are correct
- [ ] Numbers are formatted correctly

### Reports Page PDF Tests

- [ ] Navigate to Reports → Customers → click "تحميل" → click "حفظ PDF"
- [ ] Electron save dialog appears (not browser print dialog)
- [ ] PDF opens with readable Arabic customer names
- [ ] Text is selectable

### Regression Tests

- [ ] Excel exports still work for all Financial Center tabs (Statement, Aging, GL, Trial Balance, Journal, Summary)
- [ ] Reports page Excel export still works
- [ ] Financial Center data loading (JSON tables) still works correctly
- [ ] Auth / login still works
- [ ] Backup/restore still works

---

## Regression Risk Assessment

| Component | Risk | Reason |
|-----------|------|--------|
| `format=pdf` backend endpoint | Low | Now returns HTML instead of broken PDFKit blob — only callers were PDF export buttons which are now using `format=html` |
| Excel exports | None | Untouched |
| Statement data fetch (JSON) | None | Only export routes modified, not data routes |
| Backend tests | None | New tests added; existing tests unchanged |
| `pdf:export` IPC (window print) | None | Not modified; used by ReportPrint.tsx fallback |
| ReportPrint.tsx print path | Low | Fallback to `window.print()` if `window.manar` not available |
| Electron builder production | Low | Added `backend/assets` to extraResources; no other build changes |

---

## What Uses Chromium After This Fix

| Report | Before | After |
|--------|--------|-------|
| Financial Statement PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| AR Aging PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| AP Aging PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| GL Statement PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| GL Report PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| Trial Balance PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| Journal Book PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| Financial Summary PDF | PDFKit (broken) | Chromium HTML→PDF ✓ |
| Reports page print | Chromium (`window.print()`) | Chromium (`pdf:export` IPC) ✓ |
| Excel exports (all) | ExcelJS | ExcelJS (unchanged) ✓ |

## What Remains on PDFKit

Nothing. `buildPdf()` in `pdf.service.ts` is no longer called by any code path after this fix. It is still present in the file but effectively dead code. It can be removed in a future cleanup pass after this is confirmed working in production.

The `reports.routes.ts` route handler still calls `buildPdf()` for `format=pdf` requests from the generic reports page (the `/reports/:type/export` route). This route is not used by any PDF button in the app after the ReportPrint.tsx fix (which now uses `pdf:export` IPC). The backend route itself remains functional but its PDFKit output is still broken for Arabic — it is simply not called in normal usage.

---

## Validation Table

| Check | Command | Expected |
|-------|---------|---------|
| Backend types | `cd backend && npx tsc --noEmit` | 0 errors |
| Frontend types | `cd frontend && npx tsc --noEmit` | 0 errors |
| Electron types | `tsc -p electron/tsconfig.json --noEmit` | 0 errors |
| Backend tests | `cd backend && npm test` | All pass (9 new + all existing) |
| Backend build | `npm run build:back` | 0 errors |
| Frontend build | `npm run build:front` | 0 errors |
| Electron build | `npm run electron:build` | 0 errors |
| Prisma schema | `cd backend && npx prisma validate` | "The schema is valid" |

---

## Ready for Gemini Review?

After all tasks complete and manual smoke test passes: **YES — ready for Gemini review.**

Gemini review scope:
1. `html.service.ts` — HTML injection risks (XSS escape), font embedding, CSS print rules
2. `pdf.ipc.ts` — hidden BrowserWindow lifecycle, temp file cleanup, error paths
3. `preload.ts` — contextBridge surface addition
4. `pdfExport.ts` — error handling, non-Electron fallback
5. `FinancialCenter.tsx` — export callback changes, no state leak
6. `FinancialReportsTab.tsx` — export path separation
7. `electron-builder.yml` — extraResources correctness
