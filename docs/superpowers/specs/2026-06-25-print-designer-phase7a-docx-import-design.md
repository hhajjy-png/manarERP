# Print Designer Phase 7A — DOCX Template Import
## Design Specification

> **Status:** Approved — all ambiguities resolved 2026-06-25  
> **Date:** 2026-06-25  
> **Branch scope:** Feature — no code written yet  
> **Author model:** Claude Sonnet 4.6

---

## Summary

Allow users to import a Microsoft Word (.docx) file into the existing Print Designer Template Studio. The imported document becomes a fully editable Template Studio template — not a static image. The output is a standard `TemplateStudioTemplate` object that passes existing `validateTemplate()` and enters the template list exactly as if the user had created it manually.

---

## 1. Overall Architecture

### Design principle
The import is **frontend-only and purely additive**. No backend routes, no Prisma schema changes, no new IPC channels, no SQLite migrations, and no changes to the existing Template Studio schema.

### Layers involved

```
TemplateStudioEditor.tsx
  └── "استيراد DOCX" button (new)
        └── DocxImportWizard.tsx  (new modal, 4 steps)
              ├── Step 1 — file picker  (<input type="file">, no IPC)
              ├── Step 2 — document type
              ├── Step 3 — parse + review  (DocxParser runs here)
              └── Step 4 — name + confirm
                    └── calls existing updateTemplates() → handleSave()
```

### New module

```
frontend/src/print-templates/studio/docxImport/
  ├── DocxImportWizard.tsx      — 4-step modal UI
  ├── docxParser.ts             — mammoth.js invocation + HTML→elements
  ├── docxMappings.ts           — font-size / alignment / color token tables
  ├── docxTypes.ts              — DocxWarning, DocxParseResult, DocxImportOptions
  └── __tests__/
        └── docxParser.test.ts  — unit tests (≥ 25 cases)
```

### Data flow

```
.docx file (ArrayBuffer)
    │
    ▼  [mammoth.convertToHtml — async]
HTML string + messages[]
    │
    ▼  [DOMParser.parseFromString]
DOM tree (blocks: p, h1-h6, table, img)
    │
    ▼  [docxToElements — pure function]
TemplateStudioElement[]  +  DocxWarning[]
    │
    ▼  [buildImportedTemplate]
TemplateStudioTemplate
    │
    ▼  [validateTemplate — existing function]
{ valid: true, errors: [] }
    │
    ▼  [user clicks confirm]
updateTemplates([...existing, newTemplate])
    │
    ▼  [handleSave — existing PUT /settings]
Persisted to Settings table
```

---

## 2. Import Pipeline (Step by Step)

| # | Step | Responsible code | Notes |
|---|------|-----------------|-------|
| 1 | User clicks "استيراد DOCX" | `TemplateStudioEditor.tsx` | Opens `DocxImportWizard` |
| 2 | User drops or selects `.docx` | `DocxImportWizard` Step 1 | `<input type="file" accept=".docx">`, no IPC needed |
| 3 | Pre-validation | `DocxImportWizard` | File size ≤ 10 MB, extension `.docx` |
| 4 | Read as ArrayBuffer | `FileReader.readAsArrayBuffer` | Browser Web API, works in Electron renderer |
| 5 | Extract page margins (secondary JSZip pass) | `docxParser.ts` | Reads `word/document.xml` via mammoth's internal JSZip for `w:sectPr/w:pgMar` before main conversion |
| 6 | Extract header images (secondary pass) | `docxParser.ts` | Reads `word/header*.xml` rels to flag potential logos |
| 7 | Run mammoth.js | `docxParser.ts` | `mammoth.convertToHtml(buffer, options)` — async |
| 8 | Sanitize HTML output | `docxParser.ts` | Strip `<script>`, `<style>`, `<iframe>`, `<object>` before DOMParser |
| 9 | Parse HTML to DOM | `DOMParser.parseFromString` | Standard browser API |
| 10 | Walk DOM, build elements | `docxToElements()` | Produces `TemplateStudioElement[]` + `DocxWarning[]` |
| 11 | Assign vertical positions | inside `docxToElements()` | Flow-layout pass: y = cumulative height of previous elements |
| 12 | Cap elements at 200 | `docxToElements()` | Remaining elements produce a warning |
| 13 | Build template object | `buildImportedTemplate()` | Assigns new `id`, `createdAt`, default `documentType` from wizard |
| 14 | Validate | `validateTemplate()` (existing) | Must return `{ valid: true }` |
| 15 | Show preview | `DocxImportWizard` Step 3 | `TemplateStudioRenderer` at `scale={0.45}` |
| 16 | User names template and confirms | Step 4 | Name sanitized via existing `sanitizeTemplateName()` |
| 17 | Insert into state | existing `updateTemplates()` | No new code |
| 18 | Save to backend | existing `handleSave()` | `PUT /api/settings` |

---

## 3. DOCX Parser Strategy

### Why mammoth.js (not raw OOXML XML parsing)

A `.docx` file is a ZIP archive containing XML files following the Office Open XML (OOXML / ECMA-376) specification. Parsing the XML directly requires implementing:

- **Style inheritance resolution** — a paragraph styled "Heading 1" inherits from the `Normal` style which inherits defaults, and each level may override properties. Resolving the full inheritance chain requires reading `word/styles.xml` and walking parent chains.
- **Theme color resolution** — OOXML stores brand colors as scheme references (e.g. `accent1`) that resolve to hex values only after reading `word/theme/theme1.xml`.
- **Numbered list continuation** — bullet/number tracking requires `word/numbering.xml` and per-paragraph abstract numbering ID lookups.
- **Relationship file walking** — images reference media via relationship IDs in `word/_rels/document.xml.rels`, requiring cross-file linking.
- **Complex field codes** — `w:fldChar` fields (including `=IF(...)` expressions) require a mini-interpreter.

Implementing all of the above correctly requires approximately 1 500–2 500 lines of custom code with many edge cases. mammoth.js provides all of this for free.

### mammoth.js approach

mammoth.js handles OOXML parsing internally and emits clean, structured HTML output. We then parse that HTML to extract the elements we need.

```typescript
// options fed to mammoth
const mammothOptions = {
  styleMap: [
    "p[style-name='Heading 1'] => h1:fresh",
    "p[style-name='Heading 2'] => h2:fresh",
    "p[style-name='Heading 3'] => h3:fresh",
    "p[style-name='Heading 4'] => h4:fresh",
    "p[style-name='Heading 5'] => h5:fresh",
    "p[style-name='Heading 6'] => h6:fresh",
    // Horizontal rules — Resolution 6: explicit style map entries
    "p[style-name='Horizontal Line'] => hr",
    "r[style-name='Horizontal Line'] => hr",
    "b => strong",
    "i => em",
    "u => u",
    "strike => s",
    "br[type='page'] => br[data-page-break='true']",
  ],
  includeDefaultStyleMap: true,
  convertImage: mammoth.images.imgElement(async (image) => {
    // Only allow raster formats; skip SVG
    if (!['image/png','image/jpeg','image/gif','image/webp'].includes(image.contentType)) {
      return { src: '' };  // filtered later
    }
    const base64 = await image.read('base64');
    return { src: `data:${image.contentType};base64,${base64}` };
  }),
};

const { value: html, messages } = await mammoth.convertToHtml(buffer, mammothOptions);
```

**Limitation (Resolution 6):** Only paragraph-border–style horizontal rules reliably produce `<hr>` via this style map. Drawing shapes, theme separators, and table-border dividers may not convert — these are skipped (not blocked). Word uses many different mechanisms for visual dividers, and paragraph-style–based rules are the most reliably detectable.

The `messages` array contains mammoth's own warnings (e.g. unsupported features). These are merged into our `DocxWarning[]` output.

### Secondary JSZip pass (for page margins and logo detection)

mammoth.js internally uses JSZip but does not expose raw XML nodes. We install **`jszip` as a separate, explicit dependency** — we never rely on mammoth's internals. The same ArrayBuffer is re-opened with `JSZip.loadAsync(buffer)` to read `word/document.xml` for `w:pgMar` attributes and `word/header*.xml` rels for logo detection. This secondary pass runs before the main mammoth call and is wrapped in a `try/catch` so that failures are non-fatal (logo detection is best-effort).

Install: `npm install --workspace frontend jszip @types/jszip`

---

## 4. Libraries

### 4.1 mammoth.js (primary — DOCX content extraction)

| Attribute | Value |
|-----------|-------|
| Package | `mammoth@^1.9.0` |
| Types | `@types/mammoth` |
| Install location | `frontend/package.json` `dependencies` (runtime, not dev) |
| Bundle size | ~120 KB minified+gzip |
| Browser / renderer compatible | ✅ — pure JavaScript, no Node.js APIs |
| Electron context isolation safe | ✅ — does not call `require()` or access `process` |
| TypeScript support | ✅ |
| Last release | Active (2024) |
| License | BSD-2-Clause |

### 4.2 jszip (secondary — raw XML access for margins and logo detection)

| Attribute | Value |
|-----------|-------|
| Package | `jszip@^3.10.1` |
| Types | `@types/jszip` |
| Install location | `frontend/package.json` `dependencies` (runtime) |
| Bundle size | ~40 KB minified+gzip |
| Browser / renderer compatible | ✅ |
| Electron context isolation safe | ✅ |
| TypeScript support | ✅ |
| Purpose | Read `word/document.xml` for `w:pgMar`, read `word/header*.xml` rels for logo detection |
| Note | **Installed separately — never imports from mammoth internals** |

**Why not alternatives:**

| Library | Verdict |
|---------|---------|
| `docx4js` | Last meaningful commit 2019, unmaintained |
| `pizzip + docxtemplater` | Designed for template rendering (fill in values), not content extraction |
| Raw JSZip + DOMParser only | Requires full OOXML parser implementation (~2000 LOC custom code) |
| `pdf-lib` | PDF generation, not DOCX parsing |

---

## 5. Mapping Rules

### 5.1 Paragraphs

Each `<p>` block in mammoth HTML output becomes one `TextElement`.

**Content**: Text content of all child nodes concatenated. HTML tags (`<strong>`, `<em>`, etc.) contribute text, not markup.

**Position (flow layout)**:
```
x = resolvedLeftMarginMm   (from DOCX w:pgMar, default 25mm)
y = cursor_y               (start at top margin, increment after each element)
w = 210 - leftMarginMm - rightMarginMm
h = estimatedLineHeightMm * lineCount + 2  (padding)
cursor_y += h + GAP_MM    (GAP_MM = 1.5)
```

**Line count estimation**: `Math.ceil(content.length / charsPerLine)` where `charsPerLine ≈ (w_mm / avgCharWidthMm)`. For Arabic text, `avgCharWidthMm ≈ 3.2mm` at font-size `normal`.

### 5.2 Headings

| HTML tag | fontSize token | fontWeight token |
|----------|---------------|-----------------|
| `<h1>` | `xlarge` | `bold` |
| `<h2>` | `large` | `bold` |
| `<h3>` | `large` | `medium` |
| `<h4>` | `normal` | `bold` |
| `<h5>` | `normal` | `bold` |
| `<h6>` | `normal` | `regular` |

Height for headings is estimated from `xlarge`→10mm, `large`→8mm, `normal`→6mm.

### 5.3 Tables

**Step 1 — detect line-items table:**

If the first row has ≥ 3 cells and the header cell text matches the keyword sets below, the whole table is mapped to a **`LineItemsTableElement`**.

**Matching is case-insensitive and uses Arabic orthographic normalization (Resolution 3):**
```typescript
function normalizeArabic(s: string): string {
  return s
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')   // alef variants → bare alef
    .replace(/ة/g, 'ه')        // ta marbuta → ha
    .trim();
}
// Match: normalizeArabic(cellText) === normalizeArabic(keyword)
```

| Keyword set (Arabic — matched after normalization) | Maps to `AllowedLineItemField` |
|----------------------------------------------------|-------------------------------|
| `الرقم`, `#`, `م`, `رقم` | `index` |
| `الوصف`, `البيان`, `الصنف`, `البند`, `وصف` | `description` |
| `الكمية`, `الكمیة`, `كمية`, `عدد` | `quantity` |
| `الوحدة`, `الوحده`, `وحدة` | `unit` |
| `سعر الوحدة`, `السعر`, `سعر الوحده`, `سعر` | `unitPrice` |
| `الخصم`, `خصم` | `discount` |
| `الإجمالي`, `الاجمالي`, `المجموع`, `المبلغ`, `إجمالي` | `total` |

Matched columns are added to `LineItemsTableElement.columns` with `visible: true`. Unmatched header columns produce a warning and are omitted (the element is still created with the matched columns).

**Step 2 — static table fallback:**

If not a line-items table, produce:
- One `RectElement` for the outer table border (`fillColor: 'transparent'`, `borderColor: 'dark'`)
- One `RectElement` per header row cell (`fillColor: 'brand'`)
- One `TextElement` per cell (content = cell text, stacked at calculated column x positions)

**Merged cells (detected via `<td colspan>` / `<td rowspan>` in mammoth HTML):**  
Flattened — only the text of the first logical cell is preserved. A `DocxWarning` with type `'merged_cell'` is emitted.

**Nested tables:**  
Inner tables are flattened to text only. Warning emitted.

### 5.4 Images

Mammoth's custom `convertImage` handler (see §3) returns a `data:image/…;base64,…` src attribute on each `<img>` element.

Validation before creating `ImageElement`:
1. `src.startsWith('data:image/')` must be true
2. MIME type must be `image/png`, `image/jpeg`, `image/gif`, or `image/webp` — SVG is **excluded** (can embed `<script>`)
3. `isDataUrlWithinLimit(src, MAX_IMAGE_BYTES)` — 1 MB cap

If any check fails, the image is skipped with an appropriate `DocxWarning`.

`alt` is set to the original filename if mammoth exposes it, or `'صورة مستوردة'` otherwise.

Size assignment: mammoth exposes `image.dimensions.width` and `image.dimensions.height` in pixels (at 96 DPI). Conversion: `mm = px / (96 / 25.4)`.  
If dimensions are unavailable, default to `w: 40, h: 30` mm.

### 5.5 Logo Detection

Before the main mammoth call, the secondary JSZip pass:
1. Reads `word/_rels/document.xml.rels` to find relationship entries of type `header`
2. For each found header part (e.g. `word/header1.xml`), reads its XML
3. Extracts `<a:blip r:embed="rId…"/>` image references
4. Marks those image relationship IDs as "potential logo"

During the mammoth image handler, if the image's relationship ID is in the "potential logo" set, the resulting `ImageElement` is tagged with `label: 'شعار محتمل'` and the import wizard displays a note offering the user the option to skip it.

### 5.6 Element Labels (Resolution 4)

Every `BaseElement` has a human-readable `label` field shown in the Template Studio property panel. The following defaults apply to all imported elements:

| Source construct | Element type | `label` value |
|-----------------|-------------|--------------|
| Regular paragraph | `TextElement` | `'نص مستورد'` |
| Any heading (`<h1>`–`<h6>`) | `TextElement` | `'عنوان مستورد'` |
| Line-items table (heuristic match) | `LineItemsTableElement` | `'جدول البنود'` |
| Table outer border rect | `RectElement` | `'إطار جدول'` |
| Table header cell rect | `RectElement` | `'إطار جدول'` |
| Table cell text | `TextElement` | `'نص مستورد'` |
| Embedded raster image | `ImageElement` | `'صورة مستوردة'` |
| Header / logo image | `ImageElement` | `'شعار محتمل'` |
| Footer text element | `TextElement` | `'نص مستورد'` |
| Horizontal rule | `LineElement` | `'خط فاصل'` |

### 5.8 Page Margins

The secondary JSZip pass reads `word/document.xml` and locates:
```xml
<w:sectPr>
  <w:pgMar w:top="1134" w:right="851" w:bottom="1134" w:left="1701" .../>
</w:sectPr>
```

Twips → mm conversion: `mm = twips × (25.4 / 1440)`

Common values:
- 1440 twips = 1 inch = 25.4 mm (1-inch margin)
- 1134 twips ≈ 20 mm
- 851 twips ≈ 15 mm

`page.marginMm` in the Template Studio schema is a single uniform value. If the four margins differ, we use `Math.min(top, right, bottom, left)` with a `DocxWarning` type `'margin_flattened'`.

If `w:pgMar` is not found, fall back to `DEFAULT_PAGE.marginMm = 10`.

### 5.9 Font Size

mammoth outputs inline CSS on `<span>` elements: `style="font-size: 14pt"`.

Mapping from pt to font token:

| pt range | StudioFontSize token |
|----------|---------------------|
| < 9 | `small` |
| 9 – 11 | `normal` |
| 12 – 14 | `large` |
| ≥ 15 | `xlarge` |

When a paragraph has multiple `<span>` children with different font sizes, use the size that appears in the most runs (majority vote). Ties broken toward the larger size.

When no inline `font-size` style is present, default to `normal`.

### 5.10 Font Family

Word fonts (`w:rFonts`) map to nothing — Template Studio uses Cairo for all text (hardcoded in the renderer). The font family information is captured in the warning log but has no structural effect on the output.  
Warning type: `'font_family_ignored'` (emitted once per template, not per element).

### 5.11 Bold

mammoth outputs `<strong>` for bold runs.

- If the `<p>` or `<h*>` contains any `<strong>` child with non-whitespace text → `fontWeight: 'bold'`
- If only some runs are bold (partial bold paragraph) → still `fontWeight: 'bold'` on the entire `TextElement`, with a `DocxWarning` type `'partial_bold'` **(emitted at most once per import — Resolution 9)**
- No `<strong>` → `fontWeight: 'regular'`

### 5.12 Italic

mammoth outputs `<em>` for italic.

Template Studio's `StudioTextStyle` has no `fontStyle` field. Italic is **not mapped**.  
A `DocxWarning` type `'italic_unsupported'` is emitted once per template (not per element — to avoid flooding).

### 5.13 Underline

mammoth outputs `<u>` for underline.

Template Studio has no underline token. Underline is **not mapped**.  
Warning type: `'underline_unsupported'` (emitted once per template).

### 5.14 Alignment

mammoth outputs `style="text-align: right|center|left"` on `<p>` and heading elements.

| CSS `text-align` value | `StudioTextAlign` token | Rationale |
|------------------------|------------------------|-----------|
| `right` | `start` | RTL start = visual right |
| `center` | `center` | — |
| `left` | `end` | RTL end = visual left |
| `justify` | `start` | Justify not supported; fall back to start |
| absent | `start` | RTL default is right-aligned |

### 5.15 RTL

Template Studio always renders its canvas with `direction: rtl` (hardcoded in `TemplateStudioRenderer.tsx`). There is no per-element RTL flag in the schema.

If mammoth output contains explicit LTR elements (e.g. `dir="ltr"` or `text-align: left` for a code/URL element), those are imported with `align: 'end'` and a `DocxWarning` type `'ltr_element_in_rtl_template'`.

A DOCX that mixes LTR and RTL paragraphs will lose that distinction; one warning is emitted.

### 5.16 Dynamic Field Detection (Resolution 7)

Paragraphs where the entire trimmed text content matches the regex `/^\{\{([\w.]+)\}\}$/` are converted to `DynamicFieldElement`. All other paragraphs — including those that contain `{{field}}` mixed with surrounding text — remain `TextElement` with the literal content.

```typescript
const DYNAMIC_FIELD_RE = /^\{\{([\w.]+)\}\}$/;

function tryDynamicField(text: string, docType: TemplateStudioDocumentType): string | null {
  const match = DYNAMIC_FIELD_RE.exec(text.trim());
  if (!match) return null;                    // mixed content → TextElement
  const field = match[1];                     // e.g. "invoice.number"
  return isAllowedField(docType, field) ? field : null; // null → TextElement + warning
}
```

Examples:

| Paragraph text | Outcome |
|----------------|---------|
| `{{invoice.number}}` | `DynamicFieldElement` with `field: 'invoice.number'` |
| `رقم الفاتورة: {{invoice.number}}` | `TextElement` (mixed — literal text preserved) |
| `{{unknown.xyz}}` | `TextElement` (literal) + warning `'dynamic_field_unknown'` |
| `{{quotation.date}}` (docType = invoice) | `TextElement` (literal) + warning `'dynamic_field_unknown'` |

### 5.17 Page Breaks

mammoth outputs `<br data-page-break="true">` for explicit page breaks (via our `styleMap` entry `"br[type='page'] => br[data-page-break='true']"` — note: this maps to the `<br>` element in the HTML output, not a separate block).

Template Studio templates are single-page (A4 portrait, 297mm height). Page breaks are **skipped** with a `DocxWarning` type `'page_break_skipped'`. Content after the break is still imported (positioned below the previous element, clamped if it overflows 285mm).

---

## 6. Mapping Summary: DOCX Construct → Template Studio Element

| DOCX Construct | Template Studio Element(s) | Caveats |
|----------------|--------------------------|---------|
| Regular paragraph | `TextElement` | Flow-positioned |
| `<h1>` | `TextElement` (xlarge, bold) | |
| `<h2>` | `TextElement` (large, bold) | |
| `<h3>–<h6>` | `TextElement` (large/normal, bold) | |
| Line-items table (heuristic match) | `LineItemsTableElement` | Column matching, column order preserved |
| Static table (no match) | `RectElement` (border) + `TextElement[]` (cells) | Merged cells flattened |
| Embedded raster image (≤ 1MB) | `ImageElement` | data URL, size from DOCX EMUs |
| Embedded raster image (> 1MB) | — (skipped) | Warning |
| SVG image | — (skipped) | Warning (security) |
| Header image | `ImageElement` with label `'شعار محتمل'` | User can skip in wizard |
| Horizontal rule (`<hr>`) | `LineElement` (horizontal, dark, 0.5mm thick) | |
| `{{invoice.number}}` alone (entire paragraph) | `DynamicFieldElement` | Regex `/^\{\{([\w.]+)\}\}$/` must match entire trimmed text; field validated against allowlist |
| `text {{invoice.number}} text` (mixed) | `TextElement` (literal) | Mixed content stays as TextElement |
| `{{unknown.field}}` text | `TextElement` (literal) | Warning `'dynamic_field_unknown'` |
| Page break | — (skipped) | Warning |
| Bulleted / numbered list | `TextElement` (text only, bullet stripped) | Warning |
| Bold text | `fontWeight: 'bold'` on TextElement | |
| Italic text | ignored | Warning (once) |
| Underline text | ignored | Warning (once) |
| Text color (arbitrary hex) | nearest token (see §6.1) | Warning if non-exact |
| Center alignment | `align: 'center'` | |
| Right / RTL alignment | `align: 'start'` | |
| Left alignment | `align: 'end'` | |
| Footer text | `TextElement[]` placed at `y ≈ 272mm` | Labeled `(تذييل)` |

### 6.1 Color Token Mapping

When mammoth outputs a `color` inline style (e.g. `color: #1d4e6f`) we map it to the nearest `StudioTextColor` token by Euclidean distance in RGB space:

| Hex range | token |
|-----------|-------|
| #1f2937 (near-black gray) | `dark` |
| #0f172a (very dark) | `dark` |
| #000000 | `black` |
| #1d4e6f, #1d4ed8 (blues) | `brand` or `blue` |
| #6b7280, #9ca3af (grays) | `gray` |
| anything else | `default` + warning |

---

## 7. Unsupported Word Features

All of the following emit `DocxWarning` entries but do not block the import. Elements containing only unsupported features are skipped.

| Feature | Behavior |
|---------|----------|
| Italic text | Text preserved, italic ignored. Warning once. |
| Underline text | Text preserved, underline ignored. Warning once. |
| Strikethrough | Text preserved, strikethrough ignored. |
| Superscript / subscript | Text preserved inline, position ignored. |
| Text highlight / background color | Stripped. |
| Non-token text color | Nearest token used. Warning per occurrence. |
| Numbered lists | Numbers stripped, text preserved as `TextElement`. Warning. |
| Bulleted lists | Bullets stripped, text preserved. Warning. |
| Footnotes / endnotes | Stripped. |
| Comments | Stripped. |
| Tracked changes (revision marks) | Accepted revision shown; rejected stripped. |
| Text boxes | Skipped. Warning. |
| Shapes (circles, arrows, connectors) | Skipped. Warning. |
| SmartArt | Skipped (no text extractable from SmartArt). Warning. |
| Charts | Skipped. Warning. |
| Embedded Excel / OLE objects | Skipped. Warning. |
| Form fields (legacy) | Text content extracted if available, control stripped. |
| Macros / VBA | Completely ignored. Not executed. |
| Newspaper-style columns | Merged to single column. Warning. |
| Multiple pages | Page 1 content imported. Additional pages skipped. Warning. |
| Section breaks | Treated as blank space. Warning. |
| Mixed LTR/RTL | All RTL. Warning once. |
| Non-A4 page size | Elements scaled proportionally to A4 (Resolution 8). Warning. Scale factors: `scaleX = 210 / docWidthMm`, `scaleY = 297 / docHeightMm`. Applied to each element's `x`, `y`, `w`, `h`. |
| Landscape orientation | Warning. Elements placed in portrait order (user must adjust). |
| Merged table cells | Flattened to first-cell content. Warning per merged cell. |
| Nested tables | Inner table flattened to text. Warning. |
| Password-protected .docx | Hard error — parse blocked entirely. |
| Page headers (text) | Extracted as `TextElement[]` placed at `y = 2mm`. Labeled `(ترويسة)`. |
| Page footers (text) | Extracted as `TextElement[]` placed at `y = 272mm`. Labeled `(تذييل)`. |

---

## 8. Error Handling

### 8.1 Hard Errors (stop import)

These surface in the wizard as an error panel (Step 3) with a retry button:

| Condition | Arabic message |
|-----------|---------------|
| File extension is not `.docx` | "الملف ليس بصيغة .docx" |
| File size > 10 MB | "حجم الملف يتجاوز 10 ميغابايت. يُرجى استخدام ملف أصغر" |
| Not a valid ZIP / DOCX structure | "الملف ليس مستنداً Word صالحاً (.docx). يُرجى التحقق من نوع الملف" |
| Password-protected document | "المستند محمي بكلمة مرور. يُرجى إزالة الحماية ثم المحاولة مجدداً" |
| mammoth throws an exception | "فشل تحليل المستند: " + error.message |
| 0 blocks extracted after parsing | "المستند فارغ. لا توجد عناصر قابلة للاستيراد" |
| `validateTemplate()` returns `valid: false` | "خطأ داخلي في بناء القالب: " + errors.join('; ') — should not happen if parser is correct |
| Estimated template JSON > 5 MB | "حجم القالب المُنشأ كبير جداً. يُرجى تقليل عدد الصور أو أحجامها" |

### 8.2 Type Definitions (Resolution 2)

Placed in `docxImport/docxTypes.ts`:

```typescript
interface DocxImportOptions {
  documentType: TemplateStudioDocumentType;  // 'invoice' | 'quotation'
  templateName?: string;                      // pre-filled name; user can override in Step 4
}

interface DocxParseResult {
  elements: TemplateStudioElement[];
  warnings: DocxWarning[];
  pageMarginMm: number;          // resolved from w:pgMar or DEFAULT_PAGE.marginMm (10)
  docWidthMm: number;            // from w:pgSz; default 210 (A4)
  docHeightMm: number;           // from w:pgSz; default 297 (A4)
  headerImageIds: Set<string>;   // relationship IDs flagged as potential logos
}
```

### 8.3 Soft Warnings (DocxWarning[])

Collected and displayed in Step 3. Import can still proceed.

```typescript
type DocxWarningType =
  | 'image_too_large'
  | 'image_svg_excluded'
  | 'unsupported_feature_italic'
  | 'unsupported_feature_underline'
  | 'unsupported_feature_strikethrough'
  | 'unsupported_shape'
  | 'unsupported_chart'
  | 'unsupported_smartart'
  | 'merged_cell'
  | 'nested_table'
  | 'margin_flattened'
  | 'font_family_ignored'
  | 'partial_bold'
  | 'ltr_element_in_rtl_template'
  | 'page_break_skipped'
  | 'multipage_truncated'
  | 'dynamic_field_unknown'
  | 'element_count_capped'
  | 'element_y_clamped'
  | 'color_token_approximated'
  | 'column_unmatched';

interface DocxWarning {
  type: DocxWarningType;
  messageAr: string;
  elementIndex?: number;   // which element in the output array (if relevant)
}
```

### 8.4 Element Boundary Clamping

If a generated element's `y + h > 285` (close to A4 bottom margin), it is clamped: `y = Math.min(y, 285 - h)`, with a `DocxWarning` type `'element_y_clamped'`.

### 8.5 Element Count Cap

After element generation, if `elements.length > 200`, elements beyond index 200 are discarded and a `DocxWarning` type `'element_count_capped'` is emitted.

---

## 9. Import Wizard UX

The wizard opens as a full-screen overlay on top of the Template Studio (same `position: fixed; inset: 0; z-index: 9100` pattern as the Studio itself). RTL layout, Cairo font.

### Wizard State (Resolution 5)

`DocxImportWizard` owns all internal state via React `useState`. The parent (`TemplateStudioEditor.tsx`) controls only the open/close boolean and receives the confirmed template via a callback.

```typescript
// TemplateStudioEditor.tsx — usage
const [docxWizardOpen, setDocxWizardOpen] = useState(false);

<DocxImportWizard
  open={docxWizardOpen}
  onClose={() => setDocxWizardOpen(false)}
  onImportConfirm={(template: TemplateStudioTemplate) => {
    updateTemplates([...templates, template]);
    setSelectedTplId(template.id);
    setActiveDocType(template.documentType);
    setDocxWizardOpen(false);
  }}
/>
```

Internal wizard state:
```typescript
type WizardStep = 1 | 2 | 3 | 4;

interface WizardInternalState {
  step: WizardStep;
  file: File | null;
  documentType: TemplateStudioDocumentType | null;
  parseResult: DocxParseResult | null;
  templateName: string;
  errorMessage: string | null;
  isParsing: boolean;
}
```

### Entry point

In `TemplateStudioEditor.tsx` left panel, after the existing "استيراد ملف" button:

```
[استيراد ملف]          ← existing JSON import
[استيراد DOCX]         ← new
```

### Step 1 — File Selection

```
┌────────────────────────────────────────────────────────────────┐
│  استيراد قالب من Word (.docx)                       [✕ إغلاق] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│   ┌──────────────────────────────────────────────────────┐    │
│   │                                                      │    │
│   │          اسحب ملف Word هنا (.docx)                   │    │
│   │                  أو                                  │    │
│   │              [اختر ملف...]                           │    │
│   │                                                      │    │
│   └──────────────────────────────────────────────────────┘    │
│                                                                │
│   ⚠ ملاحظة مهمة:                                              │
│   هذا الاستيراد يُنشئ نقطة بداية قابلة للتحرير،              │
│   وليس تحويلاً دقيقاً للتخطيط. بعض ميزات Word               │
│   غير مدعومة وستظهر في قائمة التحذيرات.                      │
│                                                                │
│   الحجم الأقصى: 10 ميغابايت  ·  الصيغة: .docx فقط           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

On file drop/selection: validate size and extension immediately. If valid, auto-advance to Step 2. If invalid, show error inline.

### Step 2 — Document Type

```
┌────────────────────────────────────────────────────────────────┐
│  استيراد قالب من Word (.docx)      [1] [2] [3] [4]  [✕]      │
├────────────────────────────────────────────────────────────────┤
│  الملف: invoice_template.docx (234 KB)                        │
│                                                                │
│  هذا القالب سيُستخدم مع:                                       │
│                                                                │
│  ◉ فاتورة (invoice)                                           │
│    ← الحقول المتاحة: رقم الفاتورة، التاريخ، العميل…          │
│                                                                │
│  ○ عرض سعر (quotation)                                        │
│    ← الحقول المتاحة: رقم العرض، التاريخ، العميل…             │
│                                                                │
│  ملاحظة: النص الذي يطابق {{invoice.number}} أو {{quotation.  │
│  date}} وما شابهه سيُحوَّل تلقائياً إلى حقول ديناميكية.      │
│                                                                │
│             [رجوع]                   [متابعة: تحليل...]       │
└────────────────────────────────────────────────────────────────┘
```

### Step 3 — Parse & Review

Two panels (side by side when window is wide enough, stacked otherwise):

**Left panel — Results:**
```
✅ تم استخراج 14 عنصراً

العناصر المستخرجة:
  ● 10 نصوص
  ●  1 جدول بنود
  ●  2 صور
  ●  1 خط فاصل

⚠ 4 تحذيرات:
  • صورتان تتجاوزان 1 ميغابايت — تم تجاهلهما
  • النص المائل لا يُدعم — تم تجاهل الخاصية
  • تم تسطيح خلية مدمجة في الجدول
  • فاصل الصفحات لا يُدعم — تم تجاهله
```

**Right panel — Preview (toggle):**
```
[معاينة A4 ▾]
┌────────────────────────┐
│  [A4 at scale 0.45]    │
│  TemplateStudioRenderer│
│  with PREVIEW_DATA     │
└────────────────────────┘
```

**Error state** (instead of results):
```
✗ فشل تحليل المستند
الملف محمي بكلمة مرور. يُرجى إزالة الحماية ثم المحاولة مجدداً.
[حاول مرة أخرى]
```

### Step 4 — Name & Confirm

```
┌────────────────────────────────────────────────────────────────┐
│  تأكيد الاستيراد                                    [✕ إغلاق] │
├────────────────────────────────────────────────────────────────┤
│                                                                │
│  اسم القالب:                                                   │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ قالب مستورد — invoice_template                        │   │
│  └────────────────────────────────────────────────────────┘   │
│  (أقصى 60 حرفاً)                                              │
│                                                                │
│  سيُضاف القالب إلى قائمة قوالب الفاتورة                        │
│  ويمكنك تحريره فور الاستيراد في Template Studio               │
│                                                                │
│        [رجوع]                          [✓ استيراد]            │
└────────────────────────────────────────────────────────────────┘
```

On clicking "استيراد":
1. Call `updateTemplates([...templates, importedTemplate])`
2. Call `setSelectedTplId(importedTemplate.id)` to auto-select the new template
3. Call `setActiveDocType(importedTemplate.documentType)`
4. Close the wizard
5. User sees the template immediately selected in the editor canvas

**Loading state** (during parse in Step 3): spinner + "جاري تحليل المستند…"

---

## 10. Preview Before Import

### Preview component

Uses the existing `TemplateStudioRenderer` at `scale={0.45}`:

```tsx
<TemplateStudioRenderer
  template={previewTemplate}
  data={PREVIEW_DATA}
  lineItems={PREVIEW_LINE_ITEMS}
  scale={0.45}
/>
```

### Preview data constants

```typescript
// Fixed sample data for the import preview
const PREVIEW_DATA: Record<string, string> = {
  number:          'INV-2026-001',
  date:            '25/06/2026',
  customerName:    'شركة العميل النموذجي',
  customerAddress: 'الكويت — حولي',
  total:           '5,250.000',
  grandTotal:      '5,250.000',
  subtotal:        '5,250.000',
  discount:        '0.000',
  tax:             '0.000',
  notes:           'ملاحظة: هذه معاينة تجريبية',
};

const PREVIEW_LINE_ITEMS: NormalizedLineRow[] = [
  { index: 1, description: 'بند تجريبي — وصف المنتج أو الخدمة', quantity: '10', unit: 'طن', unitPrice: '525.000', total: '5,250.000' },
];
```

### Preview container

```
Width:  794 × 0.45 ≈ 357px
Height: 1123 × 0.45 ≈ 505px
```

If element count > 100, the preview is shown but with a note "معاينة مبسّطة — قد لا تظهر جميع العناصر" (still renders all elements; just warns the user it may be slow).

---

## 11. Editable Result

The imported template is a standard `TemplateStudioTemplate` satisfying the following guarantees:
- Passes `validateTemplate()` with 0 errors
- All element types are from `ALLOWED_ELEMENT_TYPES`
- All dynamic field references are in the document-type allowlist
- All image src values start with `data:image/` and are ≤ 1 MB
- `page.size === 'A4'`, `page.orientation === 'portrait'`

After import, the user can:

| Action | Available |
|--------|-----------|
| Drag elements to reposition | ✅ |
| Resize elements (via property panel x/y/w/h) | ✅ |
| Edit text content | ✅ |
| Change font size / weight / color / alignment tokens | ✅ |
| Delete elements | ✅ |
| Add new elements (text, image, QR, barcode, etc.) | ✅ |
| Rename the template | ✅ |
| Clone the template | ✅ |
| Export as JSON | ✅ |
| Activate for invoice/quotation printing | ✅ |
| Activate for rendering by `TemplateStudioRenderer` | ✅ |

No new element types are introduced. No new property panel panels are needed.

---

## 12. Backward Compatibility

| Area | Impact |
|------|--------|
| `TemplateStudioTemplate` JSON schema (version 1) | **Zero** — no new fields, no changes |
| `validateTemplate()` / `validateElement()` | **Zero** — not modified |
| `TemplateStudioRenderer.tsx` | **Zero** — not modified |
| `templateStudioUtils.ts` | **Zero** — new functions added in the `docxImport/` module, not here |
| Existing JSON import/export | **Zero** — `importTemplate` / `exportTemplate` unchanged |
| Settings table keys | **Zero** — same `print.templateStudio.templates` key |
| Backend routes | **Zero** — no new routes |
| Prisma schema | **Zero** — no migration |
| IPC channels | **Zero** — file reading uses `<input type="file">` (browser Web API, no IPC) |
| Print engine registry (`invoiceTemplates.ts`, etc.) | **Zero** |
| `printProfileStorage.ts` | **Zero** |
| Electron `preload.ts` | **Zero** |
| Existing tests | **Zero** — no existing tests modified |

Reversibility: removing the feature requires deleting `frontend/src/print-templates/studio/docxImport/` and two lines in `TemplateStudioEditor.tsx` (the button and the import of `DocxImportWizard`).

---

## 13. Security Review

### S1 — Malicious DOCX / zip bomb

DOCX files are ZIP archives. A malicious file might reference a very large uncompressed payload.

- **Mitigation A**: 10 MB compressed size check before any parsing (enforced in wizard Step 1 before `FileReader.readAsArrayBuffer` is called).
- **Mitigation B**: mammoth uses JSZip internally; JSZip ≥ 3.x has built-in protection against decompression bombs (rejects entries where `uncompressedSize > 4GB` or `compressionRatio > 1000`).
- **Residual risk**: Low — 10 MB cap provides effective protection.

### S2 — Script injection via DOCX content

DOCX text content could contain `<script>` or HTML injection attempts.

- **Mitigation A**: mammoth's HTML output is parsed by `DOMParser` in the renderer context. DOMParser does not execute scripts.
- **Mitigation B**: Before passing mammoth's HTML output to DOMParser, we strip `<script>`, `<style>`, `<iframe>`, `<object>`, `<embed>`, `<link>` tags via a regex pre-sanitization pass.
- **Mitigation C**: `TextElement.content` values are rendered as React children (never `dangerouslySetInnerHTML`). React escapes HTML entities.
- **Mitigation D**: `sanitizeTemplateName()` already strips `<>"';&` from template names.
- **Residual risk**: None identified.

### S3 — SVG image injection

SVG images can embed `<script>` tags and are a well-known XSS vector.

- **Mitigation**: The mammoth `convertImage` handler checks `image.contentType` and returns `{ src: '' }` for `image/svg+xml`. The element is then excluded during image validation.
- **Residual risk**: None — SVG is explicitly blocked.

### S4 — Image data URL injection

A DOCX could contain a non-image binary file renamed to `.png` and embedded.

- **Mitigation A**: MIME type check against allowlist: `['image/png', 'image/jpeg', 'image/gif', 'image/webp']`.
- **Mitigation B**: The existing `validateElement()` enforces `src.startsWith('data:image/')`.
- **Mitigation C**: Images render via `<img src={...}>` in the renderer — browsers sandbox image rendering.
- **Residual risk**: Low.

### S5 — Dynamic field injection via `{{...}}` placeholder text

A DOCX could contain `{{invoice.customerAddress}}` or `{{../../../etc/passwd}}`.

- **Mitigation**: When `{{...}}` pattern is detected in paragraph text, the field name inside is validated against `INVOICE_ALLOWED_FIELDS` or `QUOTATION_ALLOWED_FIELDS`. If not found, a `TextElement` is created with the literal text instead, and a warning is emitted. No `DynamicFieldElement` is created for unknown fields.
- **Residual risk**: None — the dynamic field allowlist is enforced.

### S6 — External URL references from DOCX media

DOCX can reference external images via `r:link` (hyperlinked image), not embedded.

- **Mitigation**: Only embedded media (base64 within the DOCX zip archive) is extracted. The mammoth image handler reads from the zip buffer only. If an image element has no embedded data (only an external link), it is skipped.
- **Residual risk**: None — no HTTP requests are made during import.

### S7 — Template JSON size / Settings table overflow

A DOCX with 10 large images (each 1MB = 1.33MB base64 each) could produce a 13MB template JSON.

- **Mitigation A**: Per-image 1MB cap (enforced by `isDataUrlWithinLimit`).
- **Mitigation B**: After element generation, compute an estimated JSON size (`JSON.stringify(elements).length`). If > 2MB, emit a warning. If > 5MB, block import with a hard error: "حجم القالب المُنشأ كبير جداً (> 5 ميغابايت). يُرجى تقليل حجم الصور أو عددها".
- **Residual risk**: Low — dual caps make overflow unlikely.

### S8 — Prototype pollution

mammoth.js parses XML internally using its own safe parser. No `JSON.parse` of user-controlled data occurs in our import code path.

- **Mitigation**: Use `Object.create(null)` for lookup maps in `docxMappings.ts` to prevent prototype pollution via key lookups on plain objects.
- **Residual risk**: None identified.

---

## 14. Performance Considerations

### Parse time

| DOCX size | Estimated parse time |
|-----------|---------------------|
| < 500 KB | < 200ms |
| 500 KB – 2 MB | 200ms – 600ms |
| 2 MB – 5 MB | 600ms – 1500ms |
| 5 MB – 10 MB | 1500ms – 3000ms |

All parsing is async (mammoth returns a Promise). The wizard shows a "جاري تحليل المستند…" spinner in Step 3 immediately upon receiving the ArrayBuffer. The main thread is not blocked.

### Image extraction

- Images are extracted asynchronously via `image.read('base64')` in the mammoth image handler
- If there are > 10 images in the DOCX, only the first 10 are extracted; the rest are skipped with a warning type `'image_count_limit'`
- Pre-filter: before calling `image.read('base64')`, check `image.dimensions` for size estimate. If the uncompressed size (from zip metadata) exceeds 2MB, skip extraction early.

### Preview rendering

- `TemplateStudioRenderer` at `scale={0.45}` renders all elements as `position: absolute` divs — fast for < 100 elements
- For element count > 100: apply `contain: layout style paint` CSS on the preview container
- The preview is not shown by default; it requires the user to click the "معاينة" toggle (lazy render)

### Main thread scheduling

```typescript
// In DocxImportWizard, when ArrayBuffer is ready:
await new Promise(resolve => setTimeout(resolve, 0)); // yield to show spinner
const result = await parseDocx(buffer, { documentType });
```

### Memory

- After the wizard closes (import or cancel), the mammoth HTML string and parsed DOM are garbage-collected
- The `ArrayBuffer` is released after parsing
- Only the `TemplateStudioTemplate` object (which is already in the Settings state) persists

---

## 15. Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Users expect pixel-perfect layout fidelity | High | Medium | Clear messaging in Step 1 and Step 3: "نقطة بداية للتحرير" |
| Complex DOCX (SmartArt, charts, text boxes) produces very few elements | Medium | Medium | Specific warnings per skipped feature type help users understand what was lost |
| mammoth.js emits too many messages for warning list readability | Medium | Low | Group identical warning types; show count instead of repeating (e.g. "3 خلايا مدمجة تم تسطيحها") |
| Template JSON > 2MB causes performance issues in Settings save | Low | High | 2MB soft warning + 5MB hard block |
| Electron context isolation prevents Web APIs (FileReader, DOMParser) | Low | High | These are standard browser Web APIs exposed in Electron renderer by default; test early |
| mammoth regression in future version | Low | Low | Pin exact version: `"mammoth": "1.9.0"` |
| `word/header*.xml` JSZip reading fails gracefully | Low | Low | Wrap in try/catch; logo detection is best-effort only |
| DOCX from LibreOffice / Google Docs has different XML structure | Medium | Low | mammoth handles these well due to broad test corpus |
| Arabic text kerning / shaping differences after import | Medium | Low | Cairo font used by renderer handles Arabic shaping correctly |
| Import wizard blocks Template Studio if it hangs | Low | Medium | Timeout: if parsing > 15 seconds, abort with error "انتهت المهلة — يُرجى المحاولة بملف أصغر" |

---

## 16. Test Strategy

### Unit tests — `docxParser.test.ts`

Test environment: `@vitest-environment jsdom`  
Mocking: `vi.mock('mammoth')` to return controlled HTML strings

Minimum 25 test cases:

| # | Input HTML | Expected output |
|---|-----------|----------------|
| 1 | `''` | `[]` elements, 0 warnings |
| 2 | `<p>Hello</p>` | 1 TextElement, content "Hello" |
| 3 | `<h1>Title</h1>` | TextElement fontSize='xlarge' fontWeight='bold' |
| 4 | `<h2>Sub</h2>` | TextElement fontSize='large' fontWeight='bold' |
| 5 | `<h3>Sub</h3>` | TextElement fontSize='large' fontWeight='medium' |
| 6 | `<p><strong>Bold</strong></p>` | fontWeight='bold' |
| 7 | `<p><em>Italic</em></p>` | fontWeight='regular', 1 warning 'italic_unsupported' |
| 8 | `<p><u>Underline</u></p>` | warning 'underline_unsupported' |
| 9 | `<p style="text-align: center">Ctr</p>` | align='center' |
| 10 | `<p style="text-align: right">R</p>` | align='start' |
| 11 | `<p style="text-align: left">L</p>` | align='end' |
| 12 | `<p style="text-align: justify">J</p>` | align='start' |
| 13 | Multiple `<p>` blocks | y values strictly increasing |
| 14 | `<img src="data:image/png;base64,…">` (≤ 1MB) | ImageElement |
| 15 | `<img src="data:image/png;base64,…">` (> 1MB) | skipped, warning 'image_too_large' |
| 16 | `<img src="data:image/svg+xml;base64,…">` | skipped, warning 'image_svg_excluded' |
| 17 | Table with `الوصف / الكمية / الإجمالي` headers | LineItemsTableElement |
| 18 | Static 2×2 table | RectElement + 4 TextElements |
| 19 | `<p>{{invoice.number}}</p>` (doc type invoice) | DynamicFieldElement |
| 20 | `<p>{{quotation.date}}</p>` (doc type invoice) | TextElement literal, warning |
| 21 | `<p>{{unknown.field}}</p>` | TextElement literal, warning 'dynamic_field_unknown' |
| 22 | 201 `<p>` blocks | 200 TextElements + warning 'element_count_capped' |
| 23 | All output templates pass validateTemplate() | valid=true, errors=[] |
| 24 | `<p style="font-size: 7pt">Small</p>` | fontSize='small' |
| 25 | `<p style="font-size: 20pt">XL</p>` | fontSize='xlarge' |
| 26 | `<br data-page-break="true">` | skipped, warning 'page_break_skipped' |
| 27 | mammoth returns error message in `messages` | message included in warnings |
| 28 | Image from `headerImageIds` set | ImageElement with label 'شعار محتمل' |

### Type-checking

```bash
cd frontend && npx tsc --noEmit
```
Must pass with 0 errors after adding mammoth and its types.

### Integration test (manual matrix)

| DOCX source | Features verified |
|-------------|------------------|
| Simple Arabic invoice template | Headings, paragraphs, table, logo image |
| Complex DOCX with SmartArt | SmartArt skipped with warning |
| Arabic-only RTL DOCX | RTL handling correct |
| Google Docs → .docx export | mammoth compatibility |
| LibreOffice → .docx export | mammoth compatibility |
| Password-protected .docx | Hard error shown correctly |
| DOCX with 5 embedded images | Image extraction + 1MB cap |
| Very large DOCX (8 MB) | Performance < 5s, spinner shown |
| DOCX with only a table | LineItemsTableElement detection |
| DOCX with `{{invoice.number}}` placeholders | DynamicFieldElement created |

---

## 17. Migration Impact

**Zero. No migration required.**

| Component | Change required |
|-----------|----------------|
| Prisma schema | None |
| SQLite migration | None |
| Backend routes | None |
| Backend services | None |
| IPC channels (preload.ts, dialog.ipc.ts) | None |
| Settings table keys | None |
| TemplateStudio JSON schema | None |
| validateTemplate() | None |
| TemplateStudioRenderer | None |
| Existing engine templates | None |
| Print profile storage | None |

The feature is fully self-contained in `frontend/src/print-templates/studio/docxImport/`. It touches `TemplateStudioEditor.tsx` in exactly two places: the import of `DocxImportWizard` and the JSX button that opens it.

---

## 18. Future Extensions

### 18.1 PDF Import (Phase 7B)

A static-image approach using Electron's Chromium PDF renderer:
1. New IPC channel `dialog:openPdf` → returns file path
2. New IPC channel `pdf:renderPageToImage(path, pageNumber)` → returns base64 PNG of that page
3. The user selects a page; it becomes a full-page `ImageElement` (`x:0, y:0, w:210, h:297`)
4. The user overlays `DynamicFieldElement` boxes on top of the static background

This is a "stamp over background" approach, not editable layout. Separate Phase 7B spec.

### 18.2 Image Template Import (Phase 7C)

Simpler than PDF:
1. User uploads a PNG/JPEG of their template design
2. It is placed as a single `ImageElement` at `x=0, y=0, w=210, h=297, locked=true`
3. The user overlays dynamic fields, tables, etc.
4. This adds zero new infrastructure — just a UX guide in the wizard

### 18.3 Multi-page DOCX (Phase 7A.2)

Future extension to the current feature:
- In Step 2 of the wizard, add a "select pages" step showing thumbnails (generated via mammoth section parsing)
- Allow selecting page 1, 2, or "all pages as separate templates"

### 18.4 DOCX Round-trip Export (Phase 7D)

Export a Template Studio template back to `.docx`:
- Requires adding `docx` npm package (DOCX generation library)
- Maps `TextElement` → `Paragraph`, `ImageElement` → `ImageRun`, `LineItemsTableElement` → `Table`
- Allows editing in Word and re-importing to Template Studio

### 18.5 English / Bilingual Keyword Detection

Currently, line-items table detection uses Arabic keyword sets only. Future: add English variants:
- `['#', 'no', 'item']` → `index`
- `['description', 'desc', 'item', 'service']` → `description`
- `['qty', 'quantity']` → `quantity`
- `['unit']` → `unit`
- `['unit price', 'rate', 'price']` → `unitPrice`
- `['discount', 'disc']` → `discount`
- `['total', 'amount']` → `total`

### 18.6 Cloud Template Library

Future: import from a URL pointing to a DOCX or JSON template:
- New IPC channel `dialog:importUrl` (Electron main process validates URL against allowlist)
- HTTPS-only, specific domain allowlist
- Same parsing pipeline as local DOCX import after download

---

## Appendix A — File Structure (New Files Only)

```
frontend/src/print-templates/studio/docxImport/
├── DocxImportWizard.tsx           — 4-step modal (UI only)
├── docxParser.ts                  — parse(buffer, opts) → DocxParseResult
├── docxMappings.ts                — font-size map, alignment map, color map, keyword sets
├── docxTypes.ts                   — DocxWarning, DocxParseResult, DocxImportOptions
└── __tests__/
      └── docxParser.test.ts       — ≥ 25 unit tests

frontend/package.json              — add mammoth + @types/mammoth, jszip + @types/jszip to dependencies
```

Modifications to existing files:
- `frontend/src/print-templates/studio/TemplateStudioEditor.tsx` — add "استيراد DOCX" button + `DocxImportWizard` import

---

## Appendix B — Key Constants

```typescript
// docxTypes.ts
export const DOCX_MAX_FILE_BYTES   = 10 * 1024 * 1024;   // 10 MB
export const DOCX_MAX_ELEMENTS     = 200;
export const DOCX_MAX_IMAGES       = 10;
export const DOCX_MAX_TEMPLATE_JSON_BYTES = 5 * 1024 * 1024; // 5 MB hard block
export const DOCX_WARN_JSON_BYTES  = 2 * 1024 * 1024;    // 2 MB soft warning
export const DOCX_ELEMENT_GAP_MM   = 1.5;                 // vertical gap between elements
export const DOCX_MAX_Y_MM         = 285;                 // clamp threshold
export const DOCX_PREVIEW_SCALE    = 0.45;
```

---

## Appendix C — A4 Coordinate Reference

```
Page: 210 mm wide × 297 mm tall (portrait)
Default margin: 10 mm (from DEFAULT_PAGE in templateStudioUtils.ts)
Usable area: (210 - 2×10) × (297 - 2×10) = 190 × 277 mm

Renderer scale: 794px / 210mm ≈ 3.781 px/mm (from TemplateStudioRenderer.tsx)
Editor scale:   560px / 210mm ≈ 2.667 px/mm (from TemplateStudioEditor.tsx)
```

---

*Spec written by Claude Sonnet 4.6 on 2026-06-25.  
Architecture based on codebase study of:  
`templateStudioTypes.ts`, `TemplateStudioEditor.tsx`, `templateStudioUtils.ts`,  
`TemplateStudioRenderer.tsx`, `useTemplateStudio.ts`, `printProfileStorage.ts`,  
`engine/types.ts`, `engine/registry.ts`, `preload.ts`, `dialog.ipc.ts`,  
`frontend/package.json`, `package.json`.*
