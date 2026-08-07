# تقرير الأساس الشامل — صفحة الخطاب الرسمي (Official Letter / Document Studio)

**Official Letter Page — Comprehensive Technical & Functional Baseline Report**

| | |
|---|---|
| **Scope** | 100% of the Official Letter page as currently implemented |
| **Branch / HEAD** | `production` @ `571a2cdc` |
| **Report date** | 2026-08-07 |
| **Purpose** | Definitive reference baseline before any redesign, enhancement or feature removal |
| **Method** | Static source inspection only. **No code was modified, refactored or executed.** |
| **Verification note** | All findings are derived from reading source. No UI/rendered/print output was visually verified. |

**Release lineage** (git history):

| Commit | Release |
|---|---|
| `5016fd7a` | Document Studio v1 — Foundation, Layout Designer & Professional Automation |
| `288a1ab9` | Document Studio UX Polish Pack v1 |
| earlier | Letter Engine P0–P7 (`feature/letter-engine-v1`), Font Picker Dynamic Registry v1 |

---

## 0. Scale of the surface

| Area | Path | Files | ~LOC |
|---|---|---|---|
| Pure engine (framework-free) | `frontend/src/letters/` | 46 | 12,429 |
| Letter components (paper/sections) | `frontend/src/components/letters/` | 12 (+CSS) | ~1,700 TS / ~1,230 CSS |
| Document Studio components | `frontend/src/components/letters/studio/` | 22 TSX/TS + 12 CSS | ~5,700 TS / ~2,900 CSS |
| Pages | `frontend/src/pages/Letter*.{tsx,css}` | 4 | 3,644 / 809 CSS |
| API clients | `frontend/src/api/letters*.ts` | 2 | 407 |
| Backend module | `backend/src/modules/letters/` | 13 src + 9 tests | ~3,000 / ~2,350 |
| Frontend tests | `frontend/src/__tests__/letters/` | 27 | — |

**Total: roughly 25,000 lines of production code across ~100 files.**

---

## 1. Overall Architecture

### 1.1 Two entry points, one document

```
Administrative Forms  →  /forms/official-letter        →  LetterWorkspace   (list, filters, lifecycle actions)
                      →  /forms/official-letter/:id    →  LetterComposer    (the Document Studio)
```

Both routes are registered in [App.tsx:121-124](frontend/src/App.tsx#L121-L124), lazily imported, and wrapped in `ProtectedRoute`. The workspace is the **only** entry point — a blank editor is never opened directly. `handleNewDraft` creates a draft server-side and navigates straight into the composer.

### 1.2 The four-layer stack

```
┌─────────────────────────────────────────────────────────────────────────┐
│  PAGES            LetterWorkspace.tsx (840)   LetterComposer.tsx (2,804) │
├─────────────────────────────────────────────────────────────────────────┤
│  BINDINGS         components/letters/  +  components/letters/studio/     │
│  (React + DOM)    hooks, panels, canvas, toolbars, paper, sections       │
├─────────────────────────────────────────────────────────────────────────┤
│  ENGINE           frontend/src/letters/  — PURE. No React, no DOM,       │
│  (pure)           no fetch, no clock. Model · registries · commands ·    │
│                   pagination · validation · variables · layout · diff    │
├─────────────────────────────────────────────────────────────────────────┤
│  BACKEND          backend/src/modules/letters/  — lifecycle, register,   │
│                   snapshot, versions, comments, timeline. Never parses   │
│                   the block model.                                       │
└─────────────────────────────────────────────────────────────────────────┘
```

The engine/binding boundary is **mechanically enforced** by `__tests__/letters/engineBoundary.test.ts` + `engineSourceScan.ts`: `src/letters/` may not touch the DOM, may not import the app's printing module, and may not reach outside itself. `exportPipeline.ts` lives in `studio/` precisely because it clones a live node.

### 1.3 The engine's thirteen invariants (INV-*)

Referenced throughout the source. The load-bearing ones:

| INV | Statement | Enforced by |
|---|---|---|
| INV-1 | Millimetres are the only unit; pixels exist only at the render boundary | `measure.ts` derives px/mm at runtime from a probe |
| INV-2/3 | No content may enter the reserved header/footer band — always blocking, no override | `E4`, `E16` (blocking, severity is a catalogue fact) |
| INV-4 | No hardcoded geometry outside the Geometry Registry | `noHardcodedGeometry.test.ts` fails the build |
| INV-5 | Only `FontId` values stored; never `font-family` strings | `fontRegistryEnforcement.test.ts` fails the build |
| INV-6 | The Block Model is the sole source of truth. HTML is never stored, never parsed, no round-trip | No `contenteditable` anywhere; every editable surface is `<textarea>`/`<input>` |
| INV-7 | One renderer for screen, validation, preview, print, PDF | `registerDocumentRenderer` throws on a second call |
| INV-8 | Reference numbers are sequential, permanent, never reused; `reference` is nullable | Two DB UNIQUE constraints + transaction |
| INV-9 | Version stamp + print profile are **stored, never recomputed** | `getPageGeometry` throws rather than falling back |
| INV-10 | v1 ships exactly one enabled template | `templateRegistry.test.ts` |
| INV-12 | No second signature-management system | Letters store asset **ids** only; images come from `print-templates/branding` |
| INV-13 | Reuse the existing barcode engine; only the payload builder varies by version | `LetterBarcode` uses the app's `qrcode` package |
| INV-14 | Content-model version bumps are explicit migrations, never silent coercion | `parseDocument` → `migrateDocument` re-stamps |

### 1.4 Data flow (composer)

```
GET /letters/:id
   │
   ├─ row.contentJson ──► parseDocument() ──► migrate v1→v4 ──► BlockDocument (state)
   ├─ row.subject / issueDate / recipient  ──► section state
   ├─ row.signatureAssetId / stampAssetId  ──► useCompanyBranding() ──► resolved images
   └─ row.registrationSnapshot             ──► frozen barcodePayload + frozen variables
                    │
                    ▼
        content.bindings ──► useVariableBindings() ──► GET /employees/:id, /contracts/:id
                    │
                    ▼
        resolveForStatus(status, sources, frozen) ──► ResolvedVariables
                    │
                    ▼
        visibleBlocks(content, resolved)   ← conditional blocks filtered here
                    │
                    ▼
        items[] = [date, recipient, subject, ...blocks, signature(keepWithNext), barcode]
                    │
                    ▼
   ┌────────────────────────────────────────────────────────────────┐
   │  MEASUREMENT MIRROR (hidden, outside the zoom transform)       │
   │  renders every item read-only at contentWidthMm                │
   │  offsetHeight → px → ÷ (px-per-mm from a live probe) → mm      │
   └────────────────────────────────────────────────────────────────┘
                    │
                    ▼
        paginate(measuredItems, geometry) ──► PaginationResult { pages[], overflowingItemIds }
                    │
        ┌───────────┴────────────┐
        ▼                        ▼
  LetterPageStack          LetterValidationContext ──► useLetterValidation
  (visible sheets)              (incremental runner) ──► issues + summary
        │                        │
        ▼                        ▼
  renderItem(id,false)     ValidationPanel / section markers / print gate
```

**Critical property:** the measurement layer is rendered **outside** the `transform: scale()` zoom wrapper, and heights are read with `offsetHeight` (layout pixels, transform-immune). Zoom therefore cannot influence pagination. `samePagination()` guards the state update so an identical re-measure does not re-render — this is the anti-oscillation guarantee.

### 1.5 State management

No Zustand store for letters. State is local to `LetterComposer` and split deliberately:

| State | Owner | Rationale |
|---|---|---|
| `content: BlockDocument` | `useState` in composer | The single document value; layout + bindings live inside it |
| Section fields (subject, issueDate, recipient) | `useState` | Separate columns on the server |
| Undo/redo | `useDocumentHistory` | Stack of whole documents (commands are pure) |
| Caret / selection | `useDocumentSelection` | **Separated so caret movement re-renders only the status bar** |
| Layout object selection | `useLayoutSelection` | Ordered list, not a Set (first-selected is the "same width" reference) |
| Design-mode actions | `useLayoutDesigner` | Single choke point; `readOnly` checked once |
| View prefs (zoom, rulers, grid, zones, navigator, rail widths, snap, sidePanel) | `usePersistedState` under `manarERP.letters.composer.*` | The user's, not the document's |
| Auto-save + crash recovery | `useAutoSave` | Two independent mechanisms |
| Validation | `useLetterValidation` | Debounced + incremental |

### 1.6 Save flow

Two paths, both `PATCH /letters/:id`:

1. **Content save** — `save()` sends `subject`, `issueDate`, `recipientName/Title/Organisation`, `contentJson` (= `serialiseDocument(content)`). Triggered by the Save button, `Ctrl+S`, autosave debounce (1,500 ms) or the autosave ceiling (15,000 ms).
2. **Branding save** — `persistBranding()` sends `signatureAssetId` / `stampAssetId` **immediately** on change, because the backend records a timeline event and it should describe the moment of choice.

Crash recovery writes a `RecoveryDraft` to `localStorage` (`manarERP.letters.recovery.<id>`) synchronously on every change; it is cleared only on a **confirmed** save. On next open it is *offered* via `window.confirm`, never auto-applied.

`beforeunload` is registered while dirty.

### 1.7 Print flow

```
handlePrint() → useLetterPrint.runPrint()
   → setPrintMode(true)          (view state only; NOT in the pagination signature)
   → waitForRenderReady()  →  settleImages()
   → runPrintPipeline({ pagination, geometry, profileId, layoutVersion, validation, summary, title, platform })
        1. prepare()          → buildPrintableDocument()  (projection, never recomputation)
        2. validateForPrint() → THE GATE (blocking issues → refuse; unimplemented rules → refuse)
        3. compose()          → re-checks printable.pageCount === pagination.pageCount
        4. print()            → livePlatform → printCurrentViewWithResult()
   → setPrintMode(false)
```

The pipeline **produces no artefact**. The sheets are already in the DOM; `compose()` describes the job. There is exactly one renderer.

### 1.8 Export flow

`handleExport(format)` → `runExport()` in `studio/exportPipeline.ts`:

- **`print`** → routed back to `handlePrintRef.current()` (never through this file — a second print path is forbidden).
- **`pdf`** → `composeStyledFromNode()` (the app's shared style-capturing composer) → `window.manar.exportPdfFromHtml` (Electron IPC → Chromium `printToPDF`).
- **`html`** → the **same** composed string → `Blob` → object URL → `<a download>`; URL revoked on the next animation frame.
- **`docx`** → declared, disabled, with a reason string.

The same `validateForPrint()` gate runs first for every format.

---

## 2. UI Components — complete inventory

### 2.1 Workspace (`/forms/official-letter`)

| Component | Purpose | Features | Dependencies | Current limitations |
|---|---|---|---|---|
| `ExecutiveHeader` | Page chrome | Icon, title, subtitle, back-to-`/forms`, total count aside | ExplorerKit | — |
| Sticky toolbar | Primary actions | New letter, refresh, search box (350 ms debounce), filter chip w/ count, 3-state archive chip, density toggle, column chooser | ExplorerKit | — |
| Selection bar | Bulk actions | Count, bulk archive/unarchive, clear selection | — | Only archive/unarchive are bulk-capable |
| Filter card | Narrowing | Status chips (5), registration state (2), issue-date range, createdBy, registeredBy, "clear all" | `DateInput` | `createdFrom`/`createdTo` exist in the query type and the backend but have **no UI** |
| Data table | The list | 10 columns, 7 sortable (tri-state asc→desc→none), row checkboxes, per-page 20/50/100, density comfortable/compact, archived-row styling | — | Locked columns: status, reference, subject |
| Row actions | Per-row | Open (composer), Details (drawer), Archive, Unarchive, Cancel, Delete draft — each gated by **permission ∧ lifecycle** | `lettersApi` capability helpers | Hidden, not disabled — server is the real authority |
| `Drawer` (details) | Read-only audit | Status, archive flag, reference, subject, recipient, issue date, created/registered/updated by+at, cancel reason | — | Carries a stale note: "تحرير المحتوى والطباعة يصلان في حزمة لاحقة" — both now exist |
| `Dialog` (columns) | Column visibility | Checkbox per column; locked ones disabled | — | Order is fixed |
| `Dialog` (cancel) | Withdraw | Mandatory reason textarea; warns the number stays reserved | — | — |
| `ConfirmModal` (delete) | Draft delete | Explains draft-only | — | — |
| `EmptyState` | No rows | Distinguishes "no matches" from "no letters yet" | — | — |
| `Pagination` | Pager | Server meta-driven | — | Page number is deliberately **not** persisted |

Persisted (localStorage): `manarERP.letters.filters`, `.pageSize`, `.density`, `.hiddenColumns`, `.sortBy`, `.sortDir`.

Race protection: `requestSeq` ref discards stale responses. Skeleton shows on **first** load only; later refetches dim the existing table (`is-refreshing`, `aria-busy`).

### 2.2 Composer — page chrome

| Component | Purpose | Features | Limitations |
|---|---|---|---|
| `ExecutiveHeader` | Identity + primary actions | Reference or "مسودة — لم يُخصَّص رقم مرجعي بعد"; status chip; archived chip; back to workspace | — |
| Save-state cluster (`lc-save-state`) | Live save status | `للقراءة فقط` / `جارٍ الحفظ…` / `تعذّر الحفظ — التغييرات محفوظة محليًا` / `تغييرات غير محفوظة` / `محفوظ` | — |
| Save button | Manual save | Disabled when clean | — |
| Register button | Issue reference | **Hidden** (not disabled) unless DRAFT ∧ no reference ∧ `letters.register` | One-way |
| Review button (`مراجعة`) | Toggle revisions rail | — | — |
| Export `<select>` | Smart Export | print / pdf / html / docx(disabled) | Disabled entirely unless `readyForPrinting` |
| Print button | Print | Disabled with a reason in `title` | — |
| Read-only notice | Frozen banner | Shown when status ≠ DRAFT | — |
| Mode tabs (`lc-modes`) | Compose ↔ Design | `role="tablist"`, object-count badge on Design | **Not persisted** — always opens in Compose |

### 2.3 Composer — bars (`lc-bars`)

| Component | Purpose | Features | Limitations |
|---|---|---|---|
| `DocumentToolbar` | Text formatting | 6 named groups: Styles, Font, Marks, Alignment, Paragraph, Spacing (collapsible popover), Clipboard, Productivity, History. Renders the **intersection** of `template.toolbarCommands ∩ IMPLEMENTED_COMMANDS` | `pageBreak` is permitted but unimplemented → never shown |
| `DocumentViewControls` | View toggles | Rulers, grid, zones, navigator | — |
| `FloatingContextToolbar` | Selection bar | Portaled to `body`; appears only for a non-empty range in a content block, in Compose, when not read-only. Offers bold/underline/highlight, align, font, size, clear formatting | A **second surface** for the same handlers, never a second command set |
| `LayoutToolbar` | Design-mode tools | Insert (5 kinds), align/distribute (12 actions), group/ungroup, z-order (4), duplicate, delete, snap toggles (6), guides show/lock/add | Replaces `DocumentToolbar` in Design mode |
| `BrandingAssetPicker` | Signature/stamp | Reused verbatim from `print-templates`; «بدون» option | Hidden when read-only |
| Automation buttons | 4 icon buttons | Quick Insert, Preview values, Condition editor, Document properties | Condition button requires a caret in a paragraph |
| `FindReplacePanel` | Find/replace | Docked strip (never modal); query, replace field (revealed by Ctrl+H), match counter «n من m», next/prev, replace one, replace all, option toggles | Replace disabled when read-only |

### 2.4 Composer — workspace rails

| Component | Slot | Purpose | Features | Limitations |
|---|---|---|---|---|
| `DocumentNavigator` | Left (Compose) | Find your place | **Pages tab**: mini map — proportional boxes with a band per placed item sized by its *measured* height. **Outline tab**: derived TOC. Quick jump by page number | Mini map renders **bands, not content** — deliberate: no second render pass |
| `LayersPanel` | Left (Design) | Object tree | Reverse paint order (top = front), drag reorder, per-row hide/lock/rename, group rows (collapse/hide/lock/rename/ungroup), **locked letterhead rows** (header/logo/footer) shown greyed | Is the **keyboard-accessible face** of the canvas (the canvas is `aria-hidden`, no tab stops) |
| `LetterPageStack` + `LetterPage` | Centre | The paper | Real `mm` sheets; per-page geometry (continuation from page 2); 4 rulers (`A4Ruler`) with margin/tab-stop/band overlays; 5 mm/10 mm grid; reserved-zone tints with labels; page caption «صفحة X من Y» + auto-break hint | Rulers/grid/zones/caption are `.no-print` siblings |
| `InsertPanel` | Right | Quick Insert | 4 tabs (Variables, Blocks, Templates, Assets) + one search spanning all; favourites and recents (localStorage); category filter; save-selection-as-block; save-document-as-template | Assets tab lists branding signatures/stamps — it **browses**, never stores |
| `RevisionPanel` | Right | Review | 3 tabs: History, Changes (Track Changes), Comments | Diff computed client-side |
| `DocumentPropertiesPanel` | Right | Metadata | Reference, status, template, author, created/updated/last-saved, 3 version axes, content-model version, language, word/char/paragraph counts, reading time, pages, objects, variables, conditions | Read-only view; every figure derived |
| `ObjectInspector` | Right (Design) | Numeric editing | X/Y/W/H (mm), rotation, opacity, page, lock, hide, z-order, per-kind payload editors (text/image/divider/table/QR) | Commits on blur/Enter, never per keystroke; multi-select shows shared values |
| `ConditionEditor` | Anchored overlay | Visual condition builder | Variable × operator × value dropdowns; nested `all`/`any` groups drawn as a tree | Nothing to type, nothing to parse |
| `ValidationPanel` | Bottom-right | Findings | Collapsed one-line summary (`aria-live="polite"`); expanded list of buttons per finding with severity, message, suggestion; click navigates to page + control | **Never modal, never a toast** |
| `DocumentStatusBar` | Bottom | Report | Page X/Y, words, characters (with/without spaces), paragraphs, reading time, caret line/column, selection size, language, read-only flag, zoom presets, fit-width, fit-page, shortcuts help. In Design mode also: selection count, object name, X/Y/W/H, snap state, grid state | Zoom is the only writable control here |
| `ShortcutsDialog` | Overlay | Keyboard map | Renders `SHORTCUTS[]` verbatim | — |
| `RailResizeHandle` + `useResizableRail` | Rail edges | Resizing | Pointer drag + arrow keys (`role="separator"`); RTL-aware edge detection read from the DOM; widths persisted | Three remembered widths: nav (172/140–340), inspector (232/200–420), sidePanel (250/220–460) |

Only **one** right-hand rail may be open at a time (`sidePanel: 'none' | 'insert' | 'properties' | 'revisions'`), plus `ObjectInspector` which owns the slot in Design mode.

### 2.5 The six document sections (`LetterSections.tsx`)

| Section | Control | Editable | Page scope | Typography role | Required |
|---|---|---|---|---|---|
| `date` | `DateInput` | yes | firstPage | `date` | yes |
| `recipient` | 3 × `<input>` (name / title / organisation) | yes | firstPage | `recipient` | no |
| `subject` | 1 × `<input>` | yes | firstPage | `subject` | yes |
| `content` | N × `<textarea>` (one per block) | yes | flow | `body` | yes |
| `signature` | `<img>` from branding + caption | **no** | lastPage | `body` | no |
| `barcode` | `LetterBarcode` (QR) or reserved box | **no** | lastPage | `footer` | yes |

Each is wrapped in `SectionShell` — a hover/focus label carrying a `SectionValidationMarker` badge. The badge sits **on the label, outside the band**, so a finding never reflows the text being written.

---

## 3. Editing Features — exactly how each works

### 3.1 The governing rule

> **Formatting applies to a whole paragraph, never to a character range.**

This is not a simplification — it is structural. `blockCommands.ts` maintains a **one-span-per-block** invariant: `normaliseToSingleSpan` runs on the way in *and* out. Mixed fonts inside a paragraph are impossible by construction (`fontId` is a block attribute). Partial-word bold would need a second span, and no code path can create one.

### 3.2 Text entry

- Every paragraph is a real `<textarea>`, auto-grown (`height:auto` → `scrollHeight`) so the paper shows the true line count.
- `onChange` → `setBlockText(document, blockId, text)` recorded with reason `'typing'`.
- **Enter** → `insertParagraphAfter` (caret at end) or `splitParagraph` (caret mid-text). New block id minted by the composer; `pendingFocus` restores the caret.
- **Shift+Enter** → left to the browser as a soft break inside the paragraph.
- **Backspace at offset 0** → `mergeWithPrevious`; returns `{document, focusBlockId, caretOffset}` for caret restoration.
- Caret is re-restored after every re-pagination (a paragraph moving page unmounts/remounts its textarea).

### 3.3 Marks (5, whole-paragraph)

`bold` · `underline` · `highlight` · `superscript` · `subscript`

- `toggleBlockMark` — `superscript`/`subscript` are mutually exclusive (`MUTUALLY_EXCLUSIVE_MARKS`); applying one drops the other.
- **Italic is absent by registry evidence**, not taste: every approved Arabic face declares `supportsItalic: false`.
- **Text colour is absent**: official letters are black on pre-printed stock.
- **Highlight renders as a neutral grey wash** (`rgba(15,23,42,0.12)`), never a hue — which is how it was un-prohibited without breaking the black-on-stock rule.
- Super/subscript render by **baseline shift** (`insetBlockEnd: 0.36em / -0.22em`) + 0.72× rendered size, not `vertical-align: super` (browsers implement that inconsistently against `pt` and it would measure differently from what it paints). `sizePt` in the model is untouched.

### 3.4 Block kinds

`paragraph` · `listItem` · `heading` · `pageBreak` (declared, **unreachable** — no command creates one)

### 3.5 Headings

Six levels. A heading is a **block kind**, not a font size — which is why the outline is derived from structure rather than guessed from typography. `setBlockKind` writes `kind: 'heading'` + `headingLevel`.

### 3.6 Lists

`toggleListType(document, blockId, 'numbered' | 'bulleted')`.

Ordinals are computed **for the whole document** by `computeListOrdinals()` and passed down, because the paginator's unit is the block — each paragraph arrives in its own single-block `ContentSection`, so counting locally would restart every list at 1. A run of consecutive numbered items shares a sequence; anything else resets it.

The marker (`1.` / `•`) is **chrome around the text**, never inside it — otherwise the number would be searchable, replaceable, word-countable, and renumbering would rewrite the document.

### 3.7 Named styles

**8 paragraph styles**: Body, Heading 1–6, Quote. **5 character styles**: None, Emphasis (bold), Strong (bold+underline), Reference (underline), Notation (highlight).

- A style is a **shortcut through the existing model** — nothing downstream learns styles exist.
- `paragraphStyleId` / `characterStyleId` are stored **only so the toolbar can reflect the active style**; they are never read to decide rendering.
- `matchParagraphStyle()` compares **concrete attributes**, not the stored id — so a paragraph edited by hand after a style was applied reports as "مخصّص" (custom). The custom option is shown `disabled`: it is a state to report, not one to choose.
- Every bold style names `amiri` because the approved body face (Traditional Arabic) ships **no real bold** — asking the browser to synthesise one produces a smear that rasterises differently between screen and PDF. `documentStyles.test.ts` asserts every style's weight is one the font actually declares.
- Every style's `lineHeight` is a rung of `LINE_HEIGHT_LADDER` — otherwise `blockModelIntegrity` would reject the resulting block.

### 3.8 Fonts and sizes

- **Font**: `FontPicker` fed by `getLetterFontPool()`. Post-hotfix this is the **full dynamic registry** — no allow-list, no curation.
- **Size**: fixed ladder `[14, 16, 18, 20, 22]` pt. A `<select>`, never a free number — every size is a pagination input, so a bounded set is a bounded validation surface.

### 3.9 Spacing & measure — five bounded ladders

| Control | Ladder | Notes |
|---|---|---|
| Line height | `[1.15, 1.35, 1.5, 1.75, 2]` | `undefined` → renderer default 1.35 |
| Paragraph spacing | `[0, 3, 6, 9, 12]` pt | `margin-block-end` |
| Letter spacing | `[0, 0.25, 0.5, 0.75, 1]` pt | **No negative rungs** — tightening Arabic below its designed fit breaks joining behaviour |
| First-line indent | `[0, 5, 10, 15]` mm | Mutually exclusive with hanging |
| Hanging indent | `[0, 5, 10, 15]` mm | `text-indent: -Xmm` + `padding-inline-start: Xmm` |

`setBlockIndentation` clears one when the other is set. All five are **block attributes rendered by `blockStyle`**, so the measurement mirror measures them — the paginator models none of them. This is the structural answer to their original prohibition as "unmodelled pagination inputs" (recorded as data in `LIFTED_TOOLBAR_PROHIBITIONS`).

### 3.10 Indentation levels

`stepBlockIndent(document, blockId, 'in' | 'out')`, capped at `MAX_INDENT_LEVEL = 2`, step `INDENT_STEP_MM = 8`. The ruler draws a tab-stop indicator at each reachable multiple — indicators only, no free tab stops.

### 3.11 Clear formatting

`clearBlockFormatting(document, blockId, bodyAttributes)` — resets to the template's body preset and drops all marks.

### 3.12 Format Painter

One button, two states. Unarmed → `copyBlockFormat(block)` captures a `BlockFormat` and toasts «نُسِخ التنسيق». Armed → `applyBlockFormat(...)` on the active paragraph and disarms. Pressing twice on the same paragraph is a harmless no-op.

### 3.13 Find & Replace

`documentSearch.ts` — **literal matching only. There is no regex mode and there will not be** (a user-supplied pattern compiled per keystroke is a catastrophic-backtracking DoS surface).

**Arabic normalisation** (`fold()`) handles four classes of equivalence real typists produce:
- Alef forms — أ / إ / آ / ا
- Teh marbuta ↔ heh — ة / ه
- Alef maksura ↔ yeh — ى / ي
- Diacritics (harakat) and tatweel — **removed**

Because removal changes length, `fold()` returns the folded text **plus an index map** back to the original. A hit at folded `[a,b)` is reported at original `[map[a], map[b])` — so replacement always lands exactly on the run the author saw highlighted, diacritics included.

Options: case sensitivity, whole word, and the Arabic normalisation toggles. Highlighting is done by **selecting in the real textarea** (`setSelectionRange`), which survives scrolling, zooming and re-pagination for free.

`replaceMatch` refuses when the paragraph changed underneath and returns the same document; the composer detects reference equality and toasts «تغيّر النص منذ آخر بحث».

Find works on a registered letter; **replace does not** (`canReplace={!readOnly}`).

### 3.14 Clipboard

- **Ctrl+C / Ctrl+X / plain Ctrl+V** — left entirely to the browser. A textarea cannot receive HTML, so paste sanitisation is free.
- **Multi-paragraph paste** — intercepted at the paragraph's own `onPaste` (it needs caret offsets). Split on `\r\n|\r|\n`; first line joins the current block, the rest become sibling paragraphs inheriting its formatting. A block holding embedded newlines is a shape the model cannot express and the paginator cannot break.
- **Ctrl+Alt+V (paste plain)** — explicit command; reads `navigator.clipboard.readText()`, falls back to a toast if permission policy refuses.

### 3.15 Undo / Redo

`useDocumentHistory` — a stack of **whole documents**, possible only because every command is pure. No inverse operations, no patch log, no command objects.

- `HISTORY_LIMIT = 60`
- **Coalescing**: `COALESCE_WINDOW_MS = 600`. Consecutive `'typing'` changes to the **same block** inside the window fold into the step already on the stack (keeping its original "before" state). A different block, a `'command'`, or a longer pause opens a new step. A step is therefore roughly a phrase.
- `'command'` reasons (formatting, structure, replace, paste, every layout operation) always open their own step.
- Undo/redo close the open coalescing step.
- Reset on letter load.

### 3.16 Repeat last action (F4)

`lastAction` is a **ref holding a thunk that re-reads the current document**, so F4 applies the same operation to wherever the caret is *now*, rather than replaying the old document's result. `selectionRef` keeps the current block id live.

---

## 4. Layout Designer (Design mode)

### 4.1 The architecture decision

Two layers over **one** document:

- **Flow content** — the six sections, measured and paginated. Unchanged.
- **Layout objects** — absolutely positioned in millimetres on a **named page**, freely moved, resized, rotated and stacked.

`insertTextBox` was prohibited because "absolutely-positioned content cannot be pagination-validated, so it can silently enter a reserved zone." That prohibition is not lifted — it is **answered**: (1) a layout object declares its own rectangle, so its geometry is *known* rather than measured; (2) `E16_objectInReservedZone` is blocking, with no override. The word that mattered was *silently*.

Two named modes rather than a hidden modifier key, because Compose needs a click to place a caret and Design needs it to select an object. Mode is **not persisted** — a letter always opens in Compose.

### 4.2 Object kinds (5)

| Kind | Default size | Payload | Notes |
|---|---|---|---|
| `textBlock` | 60 × 20 mm | text, fontId, sizePt, alignment, lineHeight, marks, paddingMm (2) | — |
| `image` | 40 × 40 mm | imageUrl (data/asset URL), alt, fit `contain\|cover` | `fill` deliberately absent — it distorts |
| `divider` | 80 × 1 mm | thicknessMm (0.4), style solid/dashed/dotted | Orientation follows the frame's aspect, not a flag |
| `table` | 120 × 40 mm | rows, columns, cells (row-major), fontId, sizePt, borderMm (0.2), headerRow | Fixed grid, **no merging, no fragmentation** — one page only |
| `qrCode` | 25 × 25 mm | payload, caption | **Separate from the letter's own barcode**, which is engine-composed and cannot be moved or duplicated |

Explicitly **not** layout objects: header, logo, footer. They are physically pre-printed. They appear in the Layers panel as locked, non-selectable rows so the structure is honest.

### 4.3 Coordinates

Every coordinate is a **millimetre from the sheet's top-left corner** — the same origin the rulers measure from. Never a pixel, never a percentage. `frame` is the **unrotated** box; `rotationDeg` is applied about the frame's centre, so rotating never changes the stored rectangle.

### 4.4 Available actions

| Action | Entry points | Implementation |
|---|---|---|
| Insert | LayoutToolbar, InsertPanel (assets) | `addObject`; placed at `bandLeft+5, bandTop+5` so it never starts inside a reserved zone |
| Move | Drag, arrow keys, Inspector X/Y | `moveObjects` |
| Nudge | Arrow = 1 mm · Shift+Arrow = 10 mm · Ctrl+Arrow = 0.1 mm | `NUDGE_MM` / `NUDGE_COARSE_MM` / `NUDGE_FINE_MM` |
| Resize | 8 handles, Inspector W/H | `setObjectFrame`; bounds→frame delta preserved for rotated objects |
| Rotate | Rotation handle, Inspector | `rotateObjects`; normalised to `[0,360)` |
| Opacity | Inspector | `setObjectOpacity` (0–1) |
| Page | Inspector | `setObjectPage` |
| Lock / Hide | Layers panel, Inspector | `setObjectLocked` / `setObjectHidden` |
| Rename | Layers panel | `renameObject`; never empty |
| Group / Ungroup | Toolbar, Ctrl+G / Ctrl+Shift+G, Layers panel | `groupObjects` / `ungroup`; groups **nest** (`parentGroupId` tree) |
| Z-order | Toolbar, Ctrl+] / Ctrl+[ (+Shift = front/back), Inspector, Layers drag | `reorderObjects` / `moveObjectBefore`; `zIndex` **stored**, not derived from array order |
| Duplicate | Toolbar, Ctrl+D | `duplicateObjects`, offset `DUPLICATE_OFFSET_MM = 4` |
| Delete | Toolbar, Delete/Backspace | `deleteObjects` |
| Select all on page | Ctrl+A | `selectAllOnPage` |
| Invert selection | Ctrl+Shift+I | `invertOnPage` |
| Marquee select | Drag on empty canvas | `marqueeSelect` |
| Align / Distribute | LayoutToolbar (12 actions) | `applyAlignment` |
| Guides | Toolbar add/show/lock, drag to move | `addGuide` / `moveGuide` / `setGuidesLocked` |

### 4.5 Alignment semantics

> **One object aligns to the page. Several align to each other.**

With a single object, "align left" means the content band's edge. With several, it means the leftmost of themselves (aligning all to the page would stack them). Chosen by selection size, not by a mode.

Alignment moves **bounds**, not frames — a rotated object's frame and its visible box are different rectangles, so aligning frames would leave two rotated objects visibly misaligned while their stored `x` matched.

### 4.6 Snapping

`SNAP_THRESHOLD_PX = 6` — the threshold is in **screen pixels**, converted to mm for the current zoom by the caller, so a snap feels the same distance under the pointer at any zoom. Five independently switchable sources plus a master switch:

`toGrid` (5 mm pitch) · `toObjects` · `toMargins` · `toCentre` · `toGuides`

Each axis resolves independently — an object may snap its left edge to a neighbour horizontally while snapping its centre to the page vertically. Smart guides are returned with a `source` that drives their colour/dash.

### 4.7 Locking semantics

Locked/hidden are enforced in `layoutCommands.ts`, **not in the UI** — so the Inspector, the toolbar, the arrow keys and the Layers panel cannot each forget. Group locking is **inherited, not copied**: locking a group does not rewrite members' own flags, so ungrouping restores exactly the state each object had. `effectiveLocked` / `effectiveHidden` walk the group tree.

### 4.8 Hit testing

Done in **millimetres against true rotated shapes**, not by the DOM. The canvas is one transparent surface with no per-object elements; a click is resolved by `hitTest` rotating the point backwards about the object's centre. This is the same arithmetic `E16` uses, so **what you can click and what the validator judges are the same shape by construction**.

### 4.9 Gesture model

`useLayoutInteraction` — a gesture keeps its own **preview** state (a delta or a proposed rect) which the canvas draws over the unchanged document. **Exactly one command runs, on pointer up.** That makes dragging smooth, undo sensible ("move" is one step), and the expensive derived state re-run once instead of per frame.

`setPointerCapture` rather than window listeners, so a drag survives leaving the sheet and ends reliably.

### 4.10 Performance decision

The layout layer is **deliberately excluded from `contentSignature`**. A positioned object never flows, so it cannot change any measured height — including it would re-run measurement and pagination on every drag for an identical result. `serialiseDocument({...content, layout: undefined})` is what keeps dragging on a ten-page letter as cheap as on a one-page one.

---

## 5. Automation

### 5.1 Variables — the catalogue

**18 variables, a closed set.** A variable is a *named reading of data the ERP already owns* — not a formula, not an expression, not a script.

| Category | Variables | Requires binding |
|---|---|---|
| الشركة | Company, Address | none |
| | Department | employee |
| الموظف | Employee, JobTitle, Nationality, CivilId, Phone, Email | employee |
| الموارد البشرية | **Manager** ⚠ | employee |
| المالية | Salary | employee |
| العقود | Contract | contract |
| المشاريع | **Project** ⚠ | project |
| التواريخ | Today, CurrentDate, CurrentTime | none |
| النظام | Reference, CurrentUser | none |

⚠ **Two variables are declared, greyed and explained rather than silently offered:**
- `Manager` — the `Employee` model carries no manager field.
- `Project` — there is no `Project` model (only `ProjectPrice`, a price list).

They are listed so an author can *see* they exist and *why* they are disabled. `insertableVariables()` filters them out — otherwise an author could insert a token that can never resolve, which `E18` would then block the print over: a trap with no way out. Deleting one line turns each on the day the ERP gains the field/module.

### 5.2 Token syntax

`{{Name}}` — pattern `[A-Za-z][A-Za-z0-9]*`. **Deliberately poor**: no filters, no defaults, no nesting, no expressions. Each of those would be a small language, and a small language in a document template eventually needs a parser, a sandbox and a security review.

> **The token is what is stored. The value is only ever rendered.**

Substitution happens on the way to the screen and the paper, never to the database. Consequences: the letter stays re-resolvable (rebind and every occurrence updates), nothing needs un-substituting (there is no inverse from «أحمد محمد» back to the question), and the frozen snapshot stays meaningful (registration records the *values* separately).

### 5.3 The editable/read-only asymmetry

The **editable textarea shows the token** — substituting there would make `{{Employee}}` unreachable the instant it resolved. **Everything else renders resolved**: the measurement mirror, print mode, a registered letter, and the value-preview toggle. Measuring the token instead would paginate against text nobody will ever see.

Unresolved tokens render in `'pending'` mode — kept **visible**, so the author can see the question the letter is asking. `E18` guarantees such a letter can never print.

### 5.4 Bindings

`DocumentBindings { employeeId?, contractId?, projectId? }` lives **inside `contentJson`**, not as a foreign key on `Letter`. A binding is document content, exactly as the recipient's name is. This is what lets the whole variables engine ship with **no schema change**, and keeps the letter one value that saves, undoes and versions atomically.

`useVariableBindings` fetches `/employees/:id` and `/contracts/:id` — **existing endpoints only**. A failed fetch leaves the record null and adds the kind to `unresolvedBindings`, which `W12` names as the cause.

### 5.5 Live vs frozen resolution

`resolveForStatus(status, sources, frozen)` decides from the **document's own status**, never from a caller's preference:

- **DRAFT** → live sources. `{{Salary}}` is today's salary.
- **Anything else** → the frozen map from the registration snapshot. Live sources are not consulted at all.

A registered letter whose snapshot predates the feature has no frozen map; its variables resolve to nothing — the honest answer.

`freezeUsedVariables(usedVariables, resolved)` records **only the variables the document mentions** — freezing all eighteen would put a salary into the snapshot of a letter that never asked for one.

The clock is an argument (`sources.now`), never `new Date()` inside the resolver.

### 5.6 Conditional content

> **A condition is data, not code. There is no expression language.**

`Condition = ConditionLeaf | ConditionGroup`

- **Leaf**: `{ variable, operator, value? }`
- **Group**: `{ combine: 'all' | 'any', children: Condition[] }` — nests arbitrarily; drawn as an indented tree, so there are no precedence rules to explain.

**10 operators**: exists, notExists, equals, notEquals, contains, notContains, greaterThan, lessThan, isEmpty, isNotEmpty. Four are unary (the editor hides the value field).

Numeric comparison extracts the **first number** with `/-?\d+(?:\.\d+)?/` after stripping thousands separators — because `{{Salary}}` resolves to «1,250.000 د.ك» and stripping every non-digit would leave `"1250.000."` → `NaN`. Non-numeric on both sides falls back to lexical comparison.

> **Every failure path returns `true`.** A condition naming an unknown variable, or carrying a malformed operator, or an empty group — all render their content. Content vanishing without explanation is far worse than content appearing that should have been hidden. The validation engine reports it (`E20`, blocking); the renderer keeps the text.

`visibleBlocks()` filters conditional blocks for **both** the page stack and the measurement mirror — a block that was measured but not painted would leave a gap the paginator had reserved for nothing.

### 5.7 Libraries (4)

Stored as JSON under four `Setting` keys in the `letters` group — the exact pattern `print.signatures` / `print.stamps` already use. **No migration, no new table, no new endpoint.**

| Key | Contents |
|---|---|
| `letters.templates` | Whole documents (blocks + layout + bindings) + subject + icon |
| `letters.blocks` | Reusable paragraph fragments + preview text |
| `letters.headerFooters` | Header/footer presets |
| `letters.assets` | Design assets |

**Signature and stamp libraries are deliberately absent** — `print-templates/branding` already owns them (INV-12). This pack gives them a *browser*, and stores not one byte.

Writes are **per key**, never the whole library — writing all four every time would let two people editing different libraries overwrite each other (last-write-wins in a key/value store). A failed save leaves the in-memory library unchanged and returns the reason.

**Favourites and recents** live in `localStorage` (`manarERP.letters.favourites`, `.recents`, `RECENT_LIMIT = 8`) — they are facts about a person at a machine, not about the company.

### 5.8 Library actions in the composer

| Action | Behaviour |
|---|---|
| Insert variable | `insertTokenAt` at the caret → `setBlockText` |
| Insert reusable block | `parseDocument` → **ids re-minted** → spliced after the caret block |
| Apply template | **Destructive** — `window.confirm` first; replaces the whole document + subject |
| Insert asset image | Creates a positioned `image` object inside the content band, switches to Design mode, selects it |
| Save selection as block | The **block only** — never layout or bindings (a fragment carrying a layout would overwrite the host's) |
| Save document as template | The **whole document** — a template that restored text but not the logo would not be the template anyone saved |

### 5.9 Auto-save

Two independent mechanisms (see §1.6). `AUTOSAVE_DEBOUNCE_MS = 1500`, `AUTOSAVE_MAX_WAIT_MS = 15000`. The ceiling is armed **once per dirty run**, not reset per change (resetting it would make it a second debounce). `inFlight` guards overlapping saves.

### 5.10 Smart Export

See §1.8. Four destinations, three real, one disabled-with-a-reason.

### 5.11 Document Properties

Every figure is **derived**: word count from `documentStats`, page count from the paginator, object count from the layout layer, versions from the letter's stamp. Adding a stored `wordCount` column would create a number that could disagree with the document.

---

## 6. Versioning & Collaboration

### 6.1 Version kinds (4)

| Kind | Created by | Pruned? |
|---|---|---|
| `AUTO` | User button ("save version") | **Yes** — oldest first, cap `AUTO_VERSION_LIMIT = 30` |
| `NAMED` | User button with a name prompt | Never |
| `PRE_RESTORE` | Automatically, before every restore | Never |
| `PRE_REGISTER` | Automatically, **inside the registration transaction** | Never |

A version stores: `contentJson`, `contentModelVersion`, `subject`, `issueDate`, `recipientName/Title/Organisation`, `wordCount`, `pageCount`, creator, timestamp, and a per-letter `sequence` (unique with `letterId`, so two concurrent requests cannot mint the same number).

**Content is never sent by the client** — the server reads it from the letter inside the same transaction. A client-supplied snapshot could disagree with what is stored. `wordCount`/`pageCount` **are** sent, because only the renderer can compute them.

The list endpoint **omits `contentJson`** — a letter with thirty versions would otherwise send thirty copies of the document to draw a sidebar.

### 6.2 Restore

> **Restoring is a write, not a rewind.**

`restoreVersion` takes a `PRE_RESTORE` snapshot **first**, then overwrites the letter. So restoring is itself undoable and history stays append-only. Refused by the **service** on anything but a DRAFT, regardless of permission.

The composer's `onRestored` callback bumps `reloadToken`, forcing a full re-read of the letter (patching local state would leave the undo stack and the recovery draft describing a document that no longer exists) and clears the baseline (it was chosen against a document that no longer exists).

### 6.3 Track Changes

**The diff is computed client-side, never on the server** — the backend stores `contentJson` verbatim and does not parse it; comparing two documents needs the block model, which only the renderer owns.

> **Blocks are matched by id**, not by position or content.

This is only possible because every block has a stable id that survives every edit. A positional diff would report "paragraph 3 changed" after an insertion above it. The five cases are exact:

| Case | Kind |
|---|---|
| in NEW only | inserted |
| in BASE only | deleted |
| in both, text ≠ | text changed (word-level) |
| in both, attributes ≠ | format changed |
| same set, different order | moved |

Plus layout-object changes and section-field changes (`DiffSections`: subject, issueDate, recipient trio).

**Text is diffed by word, not by character** — a character diff of Arabic reports that «كتب» became «كتبت» by inserting a ت between two letters of a word: true and useless.

Changes are categorised (`text` / `format` / `object`) and counted. `rejectChange(current, baseline, change)` is a **pure function** returning a new document; the composer applies it through its own `apply()`, so rejecting a change is one undo step and one autosave — indistinguishable from an edit the author made.

There is **no "accept change"** — accepting is the default state (the change is already in the document).

### 6.4 Baseline

A `Baseline { versionId, label, document, sections }`. **Session state, not persisted** — a baseline is a question the author is asking right now, and reopening tomorrow into a review against a forgotten version would be the wrong first frame.

Selected by clicking "compare" on a version in the History tab; clicking the same version again clears it.

### 6.5 Comments

`LetterComment` — replies are comments too (`parentId`), so the thread is a one-level tree needing no second table.

**Anchors**: `block` · `object` · `section` · `document`, plus an opaque `anchorId`. All textual — a comment stays readable after what it pointed at is deleted, because a comment that vanishes with its paragraph loses the most important thing about it: *that it was said*.

**Mentions**: `@name` up to the next whitespace, **parsed on read** rather than trusted from the stored `mentions` column (which is a denormalised convenience for future notification work).

Resolve/reopen applies to the opening comment; the server refuses a reply. Cascade delete on the letter and on the parent comment.

**No notifications are sent.** Mentions are parsed and stored; nothing consumes them.

### 6.6 Registration snapshot

Frozen once, inside the registration transaction, never updated. Assembled **by the composer** because only the renderer knows these values:

| Field | Purpose |
|---|---|
| `blockTypography` | Per-block resolved fontId, sizePt, weight, lineHeight (the block's **own** type, not the body preset) |
| `issueDate`, `subject` | Exactly as rendered |
| `barcodePayload` | The exact encoded string; `__PENDING__` substituted server-side |
| `geometryMm` | 10 dimension values — **values, not a registry reference** |
| `pageCount` | A reprint producing a different count is an integrity failure |
| `signature`, `stamp` | The **image**, not just the id — re-uploading in Settings must not rewrite an issued letter |
| `layoutObjects?` | Per-object resolved rect + rotation + opacity + z + a `payloadDigest` (FNV-1a) — never the payload |
| `variables?` | The resolved values as printed |

### 6.7 Timeline

`LetterTimelineEvent` — one row per state transition and per archive/unarchive, plus `CREATED`, `REFERENCE_ASSIGNED`, `SIGNATURE_ADDED/REMOVED`, `STAMP_ADDED/REMOVED`.

Exists **alongside** the `registeredAt`/`archivedAt`/`cancelledAt` columns because those carry the *current state* while the timeline carries the *history*: archived → unarchived → archived again is three events but two columns hold only the last.

**The timeline is not surfaced anywhere in the Official Letter UI.** It is written but never read by the frontend.

---

## 7. Validation Engine

### 7.1 Architecture

Three guarantees the framework exists to provide:

1. **Severity comes from the catalogue, never from the rule.** An implementation reports findings and has no say in how serious they are. This is what makes "reserved-zone overlap is always blocking, with no override" mechanically true.
2. **"Nothing found" is not "nothing checked."** A selected rule with no implementation is reported in `unimplementedRuleIds`, and `readyForPrinting` refuses while any remain.
3. **Re-evaluation is incremental.** Every implementation declares `dependsOn: ValidationInput[]`; the runner caches per rule and re-evaluates only what changed. Typing in the subject does not re-run the geometry rules.

`selectionParamsMatchShape` is **exact** — a stray or missing parameter throws, because a stray parameter is nearly always a renamed threshold now silently ignored.

The hook (`useLetterValidation`) is **debounced** and diffs input signatures to tell the runner exactly what moved.

### 7.2 Severities (4)

`blocking` (refuses print/PDF/export, no override, no template downgrade) · `error` (declared, **currently unused by any rule**) · `warning` · `info`

### 7.3 Complete rule table

**Blocking — content & lifecycle**

| Rule | Params | Purpose | Selected |
|---|---|---|---|
| `E1_subjectRequired` | — | Subject present and not whitespace-only | ✔ |
| `E2_contentRequired` | — | Content non-empty after whitespace stripped | ✔ |
| `E3_referenceRequiredForOutput` | — | A draft has no reference and may not be printed/exported/PDF'd | ✔ |
| `E4_reservedZoneOverlap` | — | No rendered element may intersect the reserved header/footer band; reports page index + overshoot in mm | ✔ |
| `E5_signatureBlockOrphan` | `minContentLinesWithSignature: 2` | Signature/barcode may not sit on a page with fewer than N content lines | ✔ |
| `E6_unknownFontId` | — | Every block must reference a resolvable `FontId` | ✔ |
| `E7_barcodePayloadCapacity` | — | Payload must fit the code capacity at the configured EC level | ✔ |
| `E8_subjectLineCount` | `maxSubjectLines: 2` | Subject must render within N lines, no line break | ✔ |
| `E9_referenceIntegrity` | — | Reference matches format and exists in the register | ✘ **deselected** |
| `E10_pageCapExceeded` | `maxPages: 10` | Document must not exceed N pages | ✔ |

> **`E9` is deselected deliberately.** It verifies an issued reference against the official register, which lives on the server — and this validation engine is local by design. Selecting a rule the engine is architecturally forbidden from evaluating would permanently withhold `readyForPrinting` and block every print. The guarantee is stronger where it actually sits: **two DB UNIQUE constraints inside the allocation transaction.**

**Blocking — page geometry**

| Rule | Purpose |
|---|---|
| `E11_contentOutsidePage` | Content extends past the physical sheet edge |
| `E12_negativePosition` | A computed page offset is negative — the profile's numbers cannot describe a real page |
| `E13_impossibleGeometry` | Non-positive content band or width — nothing can be laid out |
| `E14_oversizedParagraph` | A single paragraph is taller than one page's printable area. Never split, never auto-corrected |
| `E15_reservedElementPlacement` | Signature and barcode must sit together on the final page, in that order |

**Blocking — layout objects**

| Rule | Purpose |
|---|---|
| `E16_objectInReservedZone` | No object may intersect a reserved band. **Judged on true rotated corners**, never the AABB (which is larger and would refuse prints for overlaps that do not exist) |
| `E17_objectOutsidePage` | Object extends past the sheet edge — content that will not print at all |

**Blocking — automation**

| Rule | Purpose |
|---|---|
| `E18_unresolvedVariable` | Every variable must resolve. Judged against the **same resolved map the renderer painted with**, never re-resolved |
| `E19_unknownVariable` | A `{{token}}` the catalogue does not declare. Separate from E18 because the fix differs: E18 needs data, E19 needs the text corrected |
| `E20_brokenCondition` | A condition that cannot be evaluated. Blocking **even though nothing looks wrong** — a broken condition renders its content, so the letter looks right while the author's rule is silently ignored |

**Information**

| Rule | Purpose |
|---|---|
| `I1_documentPageCount` | How many sheets. A fact, never a defect |

**Warnings**

| Rule | Params | Purpose | Selected |
|---|---|---|---|
| `W1_pageCountAdvisory` | `advisoryPageCount: 5` | Document exceeds N pages | ✔ |
| `W2_subjectLengthAdvisory` | `advisorySubjectChars: 120` | Subject long enough that barcode truncation starts discarding meaning | ✔ |
| `W3_nonOfficialFontUsed` | — | A block uses a font outside the template's official pool | ✔ |
| `W4_signatureAssetMissing` | — | Signature enabled with no asset. **Deliberately not blocking** — printing for wet-ink signature is legitimate | ✔ |
| `W5_typographyDeviation` | — | Block size/line height deviates from the preset | ✔ |
| `W6_issueDateOutOfRange` | `backdateWarnDays: 30` | More than N days back, or **any** distance forward | ✔ |
| `W7_sparseManualPageBreak` | `sparsePageFillPercent` | Manual page break leaves a page sparse | ✘ **deselected** |
| `W8_lastPageNearlyFull` | `nearlyFullPercent: 90` | Last page > N% of its band — a font-rendering difference could tip it into an E4 violation | ✔ |
| `W9_objectOverlapsContent` | — | Object covers part of the text band. Advisory — a watermark or margin note is deliberately over the measure | ✔ |
| `W10_objectOffPage` | — | Object on a page index the document no longer has. Not printed, **not lost** — it returns when the document grows | ✔ |
| `W11_recipientMissing` | — | No addressee. Advisory because the template declares the section optional | ✔ |
| `W12_bindingUnresolved` | — | A binding points at a record that no longer loads. Names the **cause** so the author fixes one binding instead of chasing six variables | ✔ |

> **`W7` is deselected** because manual page breaks do not exist in this engine — flow is automatic only. The rule can never fire, so it would withhold `readyForPrinting` for ever in exchange for nothing.

**Totals: 32 rules declared · 30 selected by the Official Letter template · 20 blocking · 1 info · 11 warnings (10 selected).**

### 7.4 Behaviour

- Findings sort **most-severe first**, discovery order preserved within a severity.
- Each carries: `ruleId`, `severity`, Arabic `message`, optional Arabic `suggestion`, optional `location { pageIndex, blockId, sectionKind, objectId, overshootMm }`.
- Section markers: the composer maps issues to sections (first, most-severe wins) and shows a badge on the section label.
- Clicking a finding: `goToPage(pageIndex)` → focus the block's textarea, or focus the section's control by `aria-label`.
- `readyForPrinting = blocking === 0 && unimplementedRuleIds.length === 0`.

---

## 8. Printing & Export

### 8.1 Geometry (the physical contract)

Profile `companyLetterhead`, layout version 1. **These are the only numbers the engine physically commits to:**

| Value | mm | Meaning |
|---|---|---|
| Page | 210 × 297 | A4 portrait (only size in v1) |
| `reservedTopMm` | 40 | First-page pre-printed header band. **Inviolable** |
| `continuationReservedTopMm` | 40 | Same stock loaded throughout |
| `reservedBottomMm` | 20 | Pre-printed footer band. **Inviolable** |
| `contentTopMm` | 55 | First-page content start (15 mm lead-in below the artwork) |
| `continuationContentTopMm` | 45 | Pages 2+ (no date/subject block to separate) |
| `contentWidthMm` | 160 | Measure; side margins **derived** = (210−160)/2 = 25 |
| `footerStripMm` | 8 | Reference + «صفحة X من Y», **inside** the content band |
| `signatureHeightMm` | 18 | Printed signature height |
| `stampHeightMm` | 22 | Printed stamp height |
| `barcodeSizeMm` | 22 | QR edge length |
| `continuationStock` | `letterhead` | — |

**Derived, never stored** (a stored derived value invites disagreement after an edit):

```
sideMarginMm          = (pageWidth − contentWidth) / 2      = 25
contentBottomLimitMm  = pageHeight − reservedBottom          = 277
textBandBottomMm      = contentBottomLimit − footerStrip     = 269
usableBandMm(page 0)  = 269 − 55                             = 214
usableBandMm(page n>0)= 269 − 45                             = 224
```

The footer strip lives **inside** the content band precisely because the reserved footer is inviolable: a detached sheet must still be traceable, and the only lawful place to print that trace is within the band.

### 8.2 Reserved zones

`reservedZonesMm(geometry, pageIndex)` is the **single source** both the on-screen overlay and the validator read — so the band that is drawn and the band that is enforced can never diverge.

### 8.3 Measurement engine

```
render probe of PROBE_WIDTH_MM (100mm)  →  offsetWidth px  →  factor = px / 100
render item in mirror                   →  offsetHeight px →  heightMm = px / factor  →  roundMm()
```

The nominal `96/25.4` is **explicitly rejected** — browser zoom, OS display scaling and a transformed ancestor all change what a rendered `mm` measures, and a wrong factor puts the page break in the wrong place silently. `offsetHeight`/`offsetWidth` are used because they are layout pixels and ignore transforms entirely.

A re-measure is triggered by `contentSignature` changes **and** by `document.fonts.ready` — fonts land after first paint and change every height; without that the first pagination is computed against fallback metrics and silently stays wrong.

### 8.4 Pagination

Pure. Items are grouped by `keepWithNext` (signature + barcode travel together), and each group is placed whole.

> **Paragraphs are atomic.** An item that does not fit moves whole to the next page. A paragraph is never split across a boundary.

This is stated plainly in the source as a real limitation: true typesetting breaks a paragraph mid-way, which requires line-level measurement and a split rendering path. Block-level flow is correct, predictable and adequate for correspondence — and honest about what it does.

An item taller than a whole band gets its own page and is reported in `overflowingItemIds` (reported, never silently truncated). `paginate` always returns at least one page.

### 8.5 Preview pipeline

There is **no separate preview**. The screen *is* the preview: the same components, same geometry, same pagination. `previewValues` toggles the whole editor into its read-only rendering with variables substituted — the "how will this print?" view.

### 8.6 Print pipeline

Four stages (§1.7). Order is not arbitrary: **prepare before validate** so a document with no pages is refused for the honest reason; **validate before compose** so a document that must not print is never composed.

`useLetterPrint` sets `printMode` (view state, deliberately **out** of the pagination signature), waits for `waitForRenderReady()` and `settleImages()`, runs the pipeline, then clears it.

### 8.7 Print CSS (`letter-print.css`)

- A **named** `@page manarLetterSheet { size: A4 portrait; margin: 0 }` plus an unnamed `@page { margin: 0 }` — because `app/theme.css` declares a global `@page { margin: 1cm }` loaded on every route.
- Sheets get `break-after: page` / `page-break-after: always`; the last sheet gets `auto`; `page-break-inside: avoid`.
- Everything chrome is `display: none !important`: `.no-print`, rulers, grid, zone overlays, page captions, section labels, the measurement layer, the layout canvas, all rails, the status bar, object placeholders.

### 8.8 Export

`composeStyledFromNode` clones the node, captures every applying stylesheet rule, inlines them, and **refuses loudly** if it cannot read the styles rather than producing a half-formatted page.

The page spec is derived from `a4-portrait` with margins forced to `0mm` — the shared spec's 12 mm would shorten the page box below the sheet, spilling a strip onto a following blank page and putting every reserved-zone offset out by 12 mm.

18 selectors are stripped from the clone (all chrome, never ink).

**HTML and PDF are byte-identical inputs** — there is no second composition, which is the only way the two can be guaranteed to agree.

### 8.9 Registration flow

```
Register button (DRAFT ∧ no reference ∧ letters.register)
   → buildSnapshot()             (composer — only the renderer knows these values)
   → if dirty: await save()      (registration freezes content; unsaved work would be frozen OUT)
   → POST /letters/:id/register { snapshot }
        server:  assertTransition(status, 'register')
                 refuse if letter.reference already set  (belt & braces)
                 registrationSnapshotSchema.safeParse()   (STRICT — unknown keys rejected)
                 ┌─ ONE TRANSACTION ────────────────────────────────────┐
                 │ createVersionInTransaction(PRE_REGISTER)             │
                 │ allocateReferenceInTransaction()  ← the only place   │
                 │   · upsert letter_sequences counter                  │
                 │   · insert letter_references row                     │
                 │   · retry ×3 on P2002 unique violation               │
                 │ markRegistered(reference, snapshotJson, registeredAt)│
                 │ recordEvent(REFERENCE_ASSIGNED)                      │
                 │ recordEvent(REGISTERED)                              │
                 └──────────────────────────────────────────────────────┘
   → composer adopts the server's answer wholesale (never patches locally)
```

`__PENDING__` in `barcodePayload` is substituted with the allocated number by `withAllocatedReference` — the one field whose value does not exist until the server creates it.

### 8.10 Barcode

QR via the app's existing `qrcode` package. **Three fields, exactly three**: issue date, subject, reference.

The restraint is a **privacy decision**: a barcode travels wherever the paper travels — photographed, filed, forwarded, scanned by people the sender never chose. So it carries what identifies the document and nothing that describes its contents or the people involved.

Human-readable Arabic lines, never JSON. **No document-type label** (the approved rule is three fields; a type label would be a fourth, and the letterhead already says what the document is).

A linear symbology was rejected: Code 128/39 encode ASCII only, so an Arabic subject cannot be represented at all.

For a registered letter the payload is read from the **frozen snapshot**, never rebuilt.

---

## 9. Keyboard & Productivity

### 9.1 One listener, one table

`useDocumentShortcuts` — no component binds a shortcut of its own. Shortcuts spread across components collide silently (two handlers claim Ctrl+F, both run, mount order decides). One table makes a collision a visible duplicate.

**Deliberately not intercepted**: Ctrl+C, Ctrl+X, plain Ctrl+V, and Ctrl+A inside a paragraph — the textarea's platform behaviour is already correct, including clipboard permissions, IME interactions and RTL selection.

Navigation keys belong to the caret while a text control has focus (`inTextControl()` checked once, here).

### 9.2 Compose-mode shortcuts

| Keys | Action |
|---|---|
| `Ctrl+B` | Bold |
| `Ctrl+U` | Underline |
| `Ctrl+Shift+C` | Copy format |
| `Ctrl+Shift+V` | Paste format |
| `Ctrl+Alt+V` | Paste plain text |
| `Ctrl+F` | Find |
| `Ctrl+H` | Find & replace |
| `F3` / `Shift+F3` | Next / previous match |
| `Ctrl+Z` / `Ctrl+Shift+Z` | Undo / redo |
| `Ctrl+Y` | Redo |
| `F4` | Repeat last action |
| `Ctrl+S` | Save |
| `Ctrl+P` | Print |
| `Ctrl+0` | Zoom 100% |
| `Ctrl+=` / `Ctrl+-` | Zoom in / out |
| `Ctrl+wheel` | Zoom (non-passive listener; factor 1.08/0.92 for trackpad continuity) |
| `PageUp` / `PageDown` | Previous / next page (outside a text control) |
| `Ctrl+Home` / `Ctrl+End` | First / last page |
| `Esc` | Close shortcuts dialog, then find panel |

### 9.3 Design-mode shortcuts

Registered **separately** and only while Design mode is on — Delete, Ctrl+D and the arrows all mean something in a text editor, so binding them unconditionally would break typing.

| Keys | Action |
|---|---|
| `Delete` / `Backspace` | Delete selection |
| `Arrows` | Nudge 1 mm |
| `Shift+Arrows` | Nudge 10 mm |
| `Ctrl+Arrows` | Nudge 0.1 mm |
| `Esc` | Clear selection |
| `Ctrl+D` | Duplicate |
| `Ctrl+G` / `Ctrl+Shift+G` | Group / ungroup |
| `Ctrl+A` | Select all on page |
| `Ctrl+Shift+I` | Invert selection on page |
| `Ctrl+]` / `Ctrl+Shift+]` | Bring forward / to front |
| `Ctrl+[` / `Ctrl+Shift+[` | Send backward / to back |

Inputs, textareas and selects are excluded — their keys are theirs.

### 9.4 Mouse interactions

| Interaction | Effect |
|---|---|
| Click in a paragraph (Compose) | Place caret, set active block + section |
| Select a range (Compose) | Floating context toolbar appears |
| Click an object (Design) | Select — hit-tested in mm against rotated corners |
| Shift/Ctrl+click (Design) | Additive selection |
| Drag an object | Move, with snapping and smart guides |
| Drag a handle (8) | Resize |
| Drag the rotation handle | Rotate |
| Drag empty canvas | Marquee select |
| Drag a guide | Move guide (unless locked) |
| Drag a rail handle | Resize the rail |
| Drag a Layers row | Reorder z-index |
| `Ctrl` + wheel | Zoom |
| Scroll | Move between sheets; `currentPage` = the sheet whose top edge is nearest the viewport top |

### 9.5 Absent

- **No context menus anywhere.** No `onContextMenu` handler exists in the letters surface.
- No drag & drop of text.
- No drag & drop from the Insert panel onto the page (insertion is click-based).

---

## 10. Data Model

### 10.1 Content model version: **4**

`SUPPORTED_CONTENT_MODEL_VERSIONS = [1, 2, 3, 4]`

| Version | Release | Added | Migration |
|---|---|---|---|
| 1 | Letter Engine v1 | Base block model | — |
| 2 | Document Studio Foundation | 3 marks (highlight/super/sub), `heading` kind, 7 optional attributes | Re-stamp only |
| 3 | Layout Designer | Optional `layout` field | Re-stamp only |
| 4 | Professional Automation | Optional `condition` on attributes, optional `bindings` on the document | Re-stamp only |

Every bump was **purely additive** — nothing removed, narrowed or renamed. `migrateDocument` therefore re-stamps the version and changes not one byte of content, which is what makes it safe on stored drafts. A v1 draft reaches v4 in one step.

### 10.2 The document

```typescript
BlockDocument {
  contentModelVersion: number      // 4
  blocks: Block[]
  layout?: DocumentLayout          // v3
  bindings?: DocumentBindings      // v4
}

Block {
  id: string                       // caller-supplied, stable for life
  kind: 'paragraph' | 'listItem' | 'heading' | 'pageBreak'
  spans: InlineSpan[]              // ALWAYS exactly one in this editor
  attributes: BlockAttributes
}

InlineSpan { text: string; marks: InlineMark[] }   // plain text, never HTML

BlockAttributes {
  fontId: FontId                   // registry id, never a family name
  sizePt: number                   // rung of FONT_SIZE_LADDER_PT
  alignment: 'justify' | 'start' | 'center'   // no 'left', no 'end' — unrepresentable
  indentLevel: 0..2
  listType?: 'numbered' | 'bulleted'          // iff kind === 'listItem'
  headingLevel?: 1..6                          // iff kind === 'heading'
  paragraphStyleId?: string        // presentational bookkeeping only
  characterStyleId?: string        // presentational bookkeeping only
  lineHeight?: number              // ladder rung
  paragraphSpacingPt?: number      // ladder rung
  letterSpacingPt?: number         // ladder rung, never negative
  firstLineIndentMm?: number       // ladder rung; XOR hangingIndentMm
  hangingIndentMm?: number         // ladder rung; XOR firstLineIndentMm
  condition?: Condition            // v4 — absent means "always"
}
```

`undefined` means **"the engine's historical behaviour"**, never "zero" — a required field with a default would make an untouched v1 paragraph and a deliberately-reset v4 paragraph indistinguishable in storage.

### 10.3 The layout layer

```typescript
DocumentLayout { objects: LayoutObject[]; groups: LayoutGroup[]; guides: LayoutGuide[] }

LayoutObject {
  id, kind, name, pageIndex, 
  frame: { xMm, yMm, widthMm, heightMm },   // UNROTATED box
  rotationDeg,                               // about the frame's centre, [0,360)
  opacity: 0..1, locked, hidden, 
  groupId: string | null, 
  zIndex: number,                            // stored, not derived from array order
  payload: LayoutPayload                     // discriminated by kind
}
```

`zIndex` is stored because the Layers panel reorders by **drag**, and an array reorder would renumber every sibling on every move — making a one-object change touch the whole document and defeating the structural sharing the undo stack depends on.

Guides live **with the document**, not with the user: two people opening the same letter should see the same guides, because a guide records a design decision.

### 10.4 The engine-side document (declared, partly unused)

`LetterDocument` in `model/documentTypes.ts` declares `id`, `templateKey`, `versions`, `printProfileId`, `status`, `reference`, `sections[]`, `registrationSnapshot`, `isArchived`. **The composer does not use this type** — it uses its own `LoadedLetter` interface mirroring the wire shape. `SectionInstance` / `SectionContent` are likewise declared but not the runtime shape the composer holds.

### 10.5 Persistence map

| Data | Where |
|---|---|
| Blocks + layout + bindings | `letters.contentJson` (one string, stored verbatim, **never parsed** by the backend) |
| Subject, issue date, recipient trio | Dedicated `letters` columns |
| Signature/stamp choice | `letters.signatureAssetId` / `.stampAssetId` — **ids only** |
| Registration snapshot | `letters.registrationSnapshotJson` (one string, written once) |
| Version stamp + print profile | `letters.templateVersion/layoutVersion/barcodeVersion/printProfileId` |
| Reference number | `letters.reference` (unique) + `letter_references` register |
| Versions | `letter_versions` |
| Comments | `letter_comments` |
| Timeline | `letter_timeline_events` |
| Libraries (4) | `Setting` rows in group `letters` |
| Signature/stamp images | `Setting` rows `print.signatures` / `print.stamps` (owned by branding) |
| View preferences | `localStorage` `manarERP.letters.composer.*` |
| Workspace filters/columns/sort | `localStorage` `manarERP.letters.*` |
| Favourites / recents | `localStorage` `manarERP.letters.favourites` / `.recents` |
| Crash recovery draft | `localStorage` `manarERP.letters.recovery.<id>` |

---

## 11. Backend

### 11.1 Files

| File | LOC | Role |
|---|---|---|
| `letters.routes.ts` | 97 | 20 routes, every one behind `authenticate` + explicit `requirePermission` |
| `letters.controller.ts` | 271 | Thin HTTP translation; `present()` shapes the wire row |
| `letters.service.ts` | 619 | **Every lifecycle rule lives here and nowhere else** |
| `letters.repository.ts` | 352 | Queries only |
| `letters.schema.ts` | 214 | Zod request validation |
| `lifecycle.ts` | 239 | **Pure** state machine — no DB, no dates, no I/O |
| `reference.service.ts` | 308 | Allocation + register + gap reporting + `reconcileSequences` |
| `referenceFormat.ts` | 140 | `OL-YYYY-NNNNNN` formatting/parsing |
| `snapshot.ts` | 244 | Strict Zod validation + serialisation |
| `revisions.service.ts` | 323 | Versions + comments |
| `timeline.service.ts` | 145 | Event recording |
| `letterTemplates.constants.ts` | 160 | Server-side mirror of the template registry |

### 11.2 API surface (20 endpoints)

| Method | Path | Permission | Notes |
|---|---|---|---|
| GET | `/letters` | `letters.read` | Server-side search/filter/sort/page. Arabic-Indic → Latin digit folding for reference search |
| POST | `/letters` | `letters.create` | Creates a DRAFT. **Version stamp and profile applied by the SERVER**, never taken from the request |
| GET | `/letters/gaps` | `letters.read` | Register gap report. **No UI consumes this** |
| GET | `/letters/:id` | `letters.read` | Snapshot returned parsed |
| PATCH | `/letters/:id` | `letters.update` | Draft only |
| POST | `/letters/:id/register` | `letters.register` | Irreversible |
| POST | `/letters/:id/archive` | `letters.archive` | Flag, not a transition |
| POST | `/letters/:id/unarchive` | `letters.archive` | Same capability, pointed the other way |
| POST | `/letters/:id/cancel` | `letters.cancel` | Irreversible; reason mandatory |
| DELETE | `/letters/:id` | `letters.delete` | Draft only, enforced in the service |
| POST | `/letters/bulk-archive` | `letters.archive` | **Partial success is the contract** |
| POST | `/letters/bulk-unarchive` | `letters.archive` | Same |
| GET | `/letters/:id/versions` | `letters.read` | Omits `contentJson` |
| POST | `/letters/:id/versions` | `letters.update` | Content read server-side |
| GET | `/letters/:id/versions/:vid` | `letters.read` | Full |
| POST | `/letters/:id/versions/:vid/restore` | `letters.update` | Draft only |
| DELETE | `/letters/:id/versions/:vid` | `letters.delete` | — |
| GET | `/letters/:id/comments` | `letters.read` | Threaded |
| POST | `/letters/:id/comments` | `letters.update` | — |
| PATCH | `/letters/:id/comments/:cid` | `letters.update` | Resolve/reopen |
| DELETE | `/letters/:id/comments/:cid` | `letters.delete` | — |

> **There is no print route.** `letters.print` is deliberately not created — a permission with no route behind it is a promise the system cannot keep and would appear in the roles screen as a capability that silently does nothing.

**Version and comment endpoints introduce no new permission keys** — they reuse read/update/delete, because seeing history *is* seeing the letter.

### 11.3 Permissions (7)

`letters.read` · `create` · `update` · `delete` · `register` · `archive` · `cancel`

- `letters` is in `MODULES` (constants.ts:80).
- `register` and `archive` were added to `ACTIONS` (constants.ts:107-108) as the two verbs no existing action covered.
- Declared in `prisma/seed.ts:88`.
- A one-time repair script exists (`backend/scripts/one-time/create-letters-permissions.ts`) because the seed was never re-run against the live DB — the keys existed in code and nowhere else, invisible because `SYSTEM_ADMIN` bypasses RBAC.
- **No role is granted them by default** — which role sends official correspondence is an administrative decision.

### 11.4 Database tables (6)

| Table | Purpose | Key constraints |
|---|---|---|
| `letters` | The document | `reference` UNIQUE; indexes on status, (templateKey,status), issueDate, isArchived |
| `letter_sequences` | Per-(template, year) counter | UNIQUE (templateKey, year) |
| `letter_references` | **The official register — append-only, never deleted from** | `reference` UNIQUE; UNIQUE (templateKey, year, sequence); **deliberately NO foreign key to `letters`** |
| `letter_timeline_events` | History | FK to `letters` (cascade) |
| `letter_versions` | Snapshots | UNIQUE (letterId, sequence); FK cascade |
| `letter_comments` | Threads | Self-relation for replies; FK cascade |

**Why the register has no FK while the timeline does** — the opposite is deliberate: the register **must outlive** the letter, because the number stays consumed whatever happens to the document. The timeline is the document's own history and dies with it.

### 11.5 The lifecycle state machine

Five states, **archiving is not one of them**:

```
DRAFT ──register──► REGISTERED ──print──► PRINTED ──supersede──► SUPERSEDED
                          │                   │                        │
                          └──────────────cancel──────────────────────► CANCELLED  (terminal)
```

An **allow-list**, not guard clauses — a deny-list grows a hole every time a state is added.

Deliberate omissions:
- `DRAFT --cancel-->` — a draft holds no number, so there is nothing to withdraw. The operation is DELETE.
- `CANCELLED --> *` — terminal. Reinstating by flipping a status would erase the fact of withdrawal.
- `REGISTERED --> DRAFT` — allowed by the master plan, **not implemented** in this pack.

`print` and `supersede` are **declared but not exposed** — no route reaches them. **The letter's status therefore never advances past `REGISTERED` through the UI, even after printing.**

Archiving is a flag with its own rule (`canArchive`/`canUnarchive`: anything not cancelled). As a state it would be unreachable for a cancelled letter — which must also be archivable — and would force a false choice between PRINTED and ARCHIVED when both are true.

### 11.6 The four prohibitions the service exists to enforce

1. A document cannot be registered twice.
2. A registered/archived/cancelled document cannot be edited.
3. A document holding a reference cannot be deleted.
4. A cancelled document cannot be restored.

### 11.7 Reference allocation

> **The guarantee lives in the database, not the application.**

Two UNIQUE constraints make a duplicate impossible. `allocateOn` advances the counter **inside a transaction**, attempts the insert, and retries (max 3) on `P2002`. Application-level uniqueness checks are always wrong under concurrency — any `SELECT MAX(sequence)+1` has a window between read and write.

**The restore hazard** (documented as the most dangerous failure mode in the engine): the counter is not the source of truth; the register is. Restoring a backup taken before letters 120–125 were issued would rewind `lastValue` to 119 and reuse numbers already on delivered paper. `reconcileSequences()` raises every counter to the highest sequence actually present. It runs at startup and **must also run after any backup restore**.

**Gaps are normal and must be visible.** A cancelled number stays allocated; `listGaps()` reports every missing or cancelled sequence.

---

## 12. Integration with the rest of the ERP

| System | How the Official Letter page uses it | Direction |
|---|---|---|
| **Company branding** (`print-templates/branding`) | `useCompanyBranding()` for signature/stamp assets; `BrandingAssetPicker` reused verbatim. Letters store **ids**; the registration snapshot freezes the **image** | Read-only consumer. INV-12: no second signature system |
| **Settings** (`/settings`) | `company.name`, `company.address` for the Company/Address variables — read from the **one** request the branding hook already makes. The 4 libraries are `Setting` rows in group `letters` | Read + write (libraries) |
| **Employees** (`/employees/:id`) | Bound employee → 8 variables (name, jobTitle, department, nationality, civilId, phone, email, salary) | Read-only, existing endpoint |
| **Contracts** (`/contracts/:id`) | Bound contract → `{{Contract}}` | Read-only, existing endpoint |
| **Projects** | **Not integrated** — no `Project` model exists | Blocked |
| **Auth store** | `hasPermission()` gates every action; `user.fullName/username` → `{{CurrentUser}}` | Read |
| **ExplorerKit** | `Button`, `Icon`, `Dialog`, `Drawer`, `DrawerField/Section`, `ExecutiveHeader`, `StatusChip`, `FilterChip`, `SearchBox`, `SectionCard`, `EmptyState`, `SkeletonRows`, `Pagination`, `ErrorBanner` | Consumer |
| **Shared components** | `DateInput`, `ConfirmModal`, `FontPicker`, `A4Ruler` (from `forms/shared`) | Consumer |
| **Font registry** (`styles/fontRegistry`) | The single source of `FontId` → family. `getLetterFontPool()` = the full dynamic registry | Consumer |
| **Printing** (`printing/composeDocument`, `pageSpec`, `utils/print`) | `composeStyledFromNode` for PDF/HTML; `printCurrentViewWithResult` for print | Consumer |
| **Electron IPC** | `window.manar.exportPdfFromHtml` | Consumer |
| **Barcode** (`qrcode` package) | Same engine as `FormQRCode` and `DocumentVerificationQR` | Consumer, no new dependency |
| **i18n** (`useT`) | `page.officialLetter.title` only — the rest of the UI text is **hardcoded Arabic** | Minimal |
| **Toast store** | Success/error/warn feedback | Consumer |
| **Audit log** | ❌ **Not integrated.** Letters use their own `letter_timeline_events`, not the ERP-wide `AuditLog` | Gap |
| **Document Registry / DMS** | ❌ Does not exist in this ERP | N/A |
| **Reports module** | ❌ No letter statistics feed any report | Gap |
| **Backup** | Implicit (the DB is backed up), but `reconcileSequences()` must run after a restore | Manual coupling |

---

## 13. Limitations (currently unsupported, by category)

### 13.1 Disabled / declared-but-unreachable

| Item | Status | Recorded reason |
|---|---|---|
| `pageBreak` command | Approved by the template, **not in `IMPLEMENTED_COMMANDS`** → never rendered | Flow is automatic only |
| `pageBreak` block kind | In the model, no command creates one | Declared so the paginator and round-trip are ready |
| Word (`.docx`) export | Listed **disabled** with a reason | `vendor-docx` builds from tabular data; there is no path from a rendered page to a `.docx` |
| `{{Manager}}` | Listed **greyed** with a reason | `Employee` has no manager field |
| `{{Project}}` | Listed **greyed** with a reason | No `Project` model (only `ProjectPrice`) |
| `E9_referenceIntegrity` | Deselected | Requires a server round-trip the local engine cannot make |
| `W7_sparseManualPageBreak` | Deselected | Checks a feature that does not exist |
| `error` severity | Declared, no rule uses it | Every approved rule is blocking or advisory |
| `print` / `supersede` transitions | Declared in the machine, no route | Later packs |
| `REGISTERED → DRAFT` revert | Allowed by the master plan, not implemented | Not in this pack's operation list |
| 3 reserved print profiles | Ids reserved, **no geometry** | Nobody has measured the paper; fabricating millimetres would silently violate INV-2/3 |
| 5 reserved template prefixes (CIR, AD, AUTH, NOT, GOV) | Reserved, no template | INV-10 |
| `LetterDocument` / `SectionInstance` engine types | Declared, unused at runtime | Composer uses its own `LoadedLetter` |
| `VersionResolver` | Contract only, **nothing registered** | v1 ships one version per axis |
| `registerDocumentRenderer` | Contract only, **no renderer registered** | The composer renders directly |
| `/letters/gaps` endpoint | Implemented, **no UI** | — |
| `letter_timeline_events` | Written, **never read by the frontend** | — |

### 13.2 Permanently prohibited (12, enforced by test)

| Command | Reason |
|---|---|
| `italic` | No approved Arabic face ships one; the browser would synthesise a slant |
| `textColor` | Official letters are black on pre-printed stock |
| `insertImage` (flow) | The paper already carries the letterhead (INV-2) |
| `insertTable` (flow) | Table pagination across a fixed safe-zone band is genuinely hard |
| `insertTextBox` (flow) | Cannot be pagination-validated |
| `insertLink` | Meaningless on paper |
| `header` / `footer` | Physically pre-printed; the engine never prints one |
| `pageSetup` | Owned by the print profile and the physical stock |
| `watermark` / `background` / `borders` | Would print over the letterhead |

Three of these (`image`, `table`, `textBlock`) **do** exist as **layout objects** — where they declare their own rectangle and are validated by `E16`/`E17`.

### 13.3 Design limitations

- **Paragraphs are atomic** — never split across a page boundary. Line-level splitting is named as the natural next step.
- **One font per paragraph**, one mark set per paragraph. Character-range formatting is unrepresentable.
- **No left alignment** — `TextAlignment` is `justify | start | center`; `end` does not exist.
- **Fixed size ladder** (5 rungs), fixed line-height/spacing/indent ladders.
- **Two indent levels maximum.**
- **One template**, one print profile, one page size (A4 portrait), one of each version axis.
- **Tables never fragment** — an object belongs to exactly one page.
- **No `fill` image fit** — it distorts.
- **No negative letter spacing** — breaks Arabic joining.
- **No page headers/footers** beyond the engine's own reference strip.
- **Mode is not persisted** — always opens in Compose.
- **No accept-change** in Track Changes (only reject).
- **No notifications** for @mentions.
- **No context menus.**
- **No cross-letter search.**
- **No letter templates seeded** — the library starts empty.

### 13.4 Technical limitations

- Print requires the live view in the DOM — headless/background printing is impossible by design.
- PDF export requires Electron (`window.manar.exportPdfFromHtml`); HTML export works in a browser.
- `navigator.clipboard.readText()` can be refused by permission policy (handled with a toast).
- Validation is **local only** — it cannot check the server-side register.
- Backend never parses `contentJson`, so it can compute no statistic and run no server-side search inside letter bodies.
- Font metrics arrive after first paint; the first pagination is corrected by the `document.fonts.ready` pass.

### 13.5 Performance considerations

| Concern | Current mitigation |
|---|---|
| Measurement on every change | `contentSignature` gates it; `samePagination` gates the state update; layout excluded from the signature |
| Validation on every keystroke | Debounced + incremental (`dependsOn` per rule) |
| Caret movement re-rendering | `useDocumentSelection` isolated from document state |
| Undo memory | `HISTORY_LIMIT = 60` whole documents |
| Drag producing 100 undo steps | `useLayoutInteraction` previews; one command on pointer up |
| Mini map cost | Bands sized by measured heights — **no second render pass** |
| Caret reporting on drag | Throttled to one update per animation frame |
| Version history size | `AUTO_VERSION_LIMIT = 30`, oldest pruned first |
| Snapshot column size | Branding images capped at 4 MB; layout payloads stored as an 8-hex digest |

**Unmitigated:** the measurement mirror renders **every item** of the document on every signature change. A 10-page letter with ~100 paragraphs mounts ~100 extra read-only paragraph components per pass. `LetterComposer.tsx` is a 2,804-line component whose body re-runs on every state change.

---

## 14. Technical Debt

> Identified only. **No solutions implemented.**

### 14.1 Correctness — highest priority

**TD-1 · `serialiseSnapshot` silently drops `layoutObjects` and `variables`.**
[`backend/src/modules/letters/snapshot.ts:201-227`](backend/src/modules/letters/snapshot.ts#L201-L227) builds an explicit object literal that omits both optional fields. The schema validates them, the composer sends them, and the stored JSON does not contain them.

Consequences:
- `registrationSnapshot.variables` is always `undefined` on reload → `frozenVariables` is always `null` → **a registered letter's variables resolve to nothing**, defeating the entire freeze guarantee that §5.5 and the snapshot's own 20-line comment describe.
- `layoutObjects` fidelity is likewise never persisted.

`__tests__/snapshot.test.ts` contains no assertion on either field. This is the single most consequential defect found.

**TD-2 · Stale user-facing copy in the workspace drawer.**
[`LetterWorkspace.tsx:762`](frontend/src/pages/LetterWorkspace.tsx#L762) still reads «تحرير المحتوى والطباعة يصلان في حزمة لاحقة» — both shipped several releases ago.

**TD-3 · Stale file-header claim.**
`LetterWorkspace.tsx`'s header still declares "THERE IS NO EDITOR IN THIS PACK", and `LetterSections.tsx`'s header still says "SIGNATURE AND BARCODE ARE PLACEHOLDERS … rendered by nobody" — both are now false; the code below them is correct.

**TD-4 · Two `useEffect` hooks with suppressed `exhaustive-deps`.**
The load effect ([LetterComposer.tsx:1124](frontend/src/pages/LetterComposer.tsx#L1124)) and the recovery effect ([:2083](frontend/src/pages/LetterComposer.tsx#L2083)). Both are justified in comments, but each is a latent staleness bug if the surrounding code changes.

### 14.2 Duplicate logic

**TD-5 · The `96/25.4` factor is written three times.**
- `measure.ts` (as the documented nominal fallback),
- `LetterComposer.tsx:1022` (fit-zoom computation),
- `LetterComposer.tsx:1296` (`pxPerMm` for gestures).

The last two are *not* the runtime-derived factor the paginator uses, so the gesture engine and the paginator can disagree about a millimetre under OS display scaling. Both are commented as acceptable, but they are the same constant in three places.

**TD-6 · Lifecycle rules mirrored in three places.**
`backend/lifecycle.ts` (authority), `api/lettersApi.ts` capability helpers, `LetterWorkspace` render gates. The API file documents the obligation to keep them in step; nothing enforces it.

**TD-7 · Status labels and tones declared twice.**
`letters/model/documentTypes.ts` (`LETTER_STATUS_LABELS_AR`), `api/lettersApi.ts` (`LETTER_STATUS_LABEL_AR`), `backend/lifecycle.ts` (`LETTER_STATUS_LABELS_AR`). Three copies of five Arabic strings.

**TD-8 · Template registry mirrored server-side.**
`backend/letterTemplates.constants.ts` duplicates key, prefix and the three version latests. `__tests__/templateMirror.test.ts` guards it — good, but it is still a mirror.

**TD-9 · `blockIdCounter` / `nextBlockId` mints ids for both blocks and layout objects.**
`Date.now().toString(36)` + a module-level counter. Two tabs opening the same letter within the same millisecond and the same counter value could collide. Low probability, no guard.

### 14.3 Complexity hotspots

| File | LOC / KB | Concern |
|---|---|---|
| `LetterComposer.tsx` | **2,804** | Far past the 800-line guideline. Holds ~45 `useState`/`usePersistedState`, ~35 `useCallback`, ~20 `useMemo`, 12 `useEffect`. Every concern (load, edit, design, automation, validation, print, export, register, autosave, recovery, keyboard, zoom, rails) is co-resident |
| `DocumentToolbar.tsx` | 27 KB | Nine command groups + a popover + a portal |
| `RevisionPanel.tsx` | 27 KB | Three tabs, each with its own loading/error/busy state |
| `ObjectInspector.tsx` | 26 KB | Six payload editors + shared numeric-field machinery |
| `InsertPanel.tsx` | 25.6 KB | Four tabs + search + favourites + recents |
| `letters.service.ts` | 619 | Create, read, update, register, archive×2, bulk×2, cancel, delete |
| `documentDiff.ts` | 21 KB | Word diff + block diff + object diff + section diff + reject |

`LetterComposer.tsx` is the clearest refactoring candidate: it is the only file in the letters surface that violates the project's own file-size rule, and by 3.5×.

### 14.4 Structural debt

**TD-10 · Two parallel document type systems.**
`letters/model/documentTypes.ts` (`LetterDocument`, `SectionInstance`, `SectionContent`, `RegistrationSnapshot`) was designed as the engine's document shape and is **not used at runtime**. The composer defines its own `LoadedLetter`. The engine's `RegistrationSnapshot` and the backend's Zod-inferred one are also different shapes for the same thing.

**TD-11 · Unused contracts.**
`rendering/contracts.ts` (`registerDocumentRenderer`) and `versioning/resolver.ts` (`createVersionResolver`) are complete, tested seams with **zero registrations**. Correct as designed (the seam cannot be retrofitted) but currently dead weight in the bundle.

**TD-12 · `usePersistedState` key sprawl.**
16 distinct `manarERP.letters.*` keys with no namespace helper, no migration story, and no cleanup on letter deletion (the recovery draft key in particular is never cleaned up if a letter is deleted while a draft is parked).

**TD-13 · `letters/index.ts` (10.6 KB, 40 exports) is a barrel nothing imports.**
The composer imports from deep paths throughout.

**TD-14 · No error boundary.**
A throw inside any studio panel takes down the whole composer with the browser's default blank screen. `getPageGeometry` is explicitly designed to throw.

**TD-15 · Three native `window.confirm` / `window.prompt` calls** in the composer (template apply, recovery offer, save-as-block/template names) — inconsistent with the ERP's `ConfirmModal`/`Dialog` and unstyleable.

### 14.5 Test coverage gaps

27 frontend test files exist and cover the engine well (geometry, pagination, validation, block model, diff, layout, boundaries, no-hardcoded-geometry, font-registry enforcement). Gaps:

- No test asserts `serialiseSnapshot` round-trips `variables` or `layoutObjects` (**TD-1** would have been caught).
- No test for `useAutoSave` timing/ceiling behaviour.
- No test for `useDocumentHistory` coalescing.
- No test for the export pipeline's strip-selector list.
- `letterComposer.test.tsx` is a smoke test relative to the component's 2,804 lines.
- No E2E/Playwright coverage of the letter flow.
- Backend has 9 test files with good lifecycle/reference/snapshot coverage, but `snapshot.test.ts` does not cover the two optional fields.

---

## 15. Improvement Opportunities

> Suggestions only. Nothing here is implemented or recommended for immediate action without Product Owner prioritisation.

### 15.1 HIGH priority

**Correctness**

| # | Opportunity | Rationale |
|---|---|---|
| H1 | Fix `serialiseSnapshot` to emit `layoutObjects` and `variables`; add round-trip tests | **TD-1.** The frozen-variables guarantee is currently inert. A registered letter reprinted today shows nothing where a value was printed |
| H2 | Add a regression test asserting every schema field survives serialise → parse | Prevents the same class of omission returning |
| H3 | Backfill: decide what to do with letters already registered under the broken serialiser | Their variable values are unrecoverable; the decision (accept the gap / annotate the register) is the Product Owner's |

**UX**

| # | Opportunity | Rationale |
|---|---|---|
| H4 | Remove or update the stale drawer note and two stale file headers | **TD-2/TD-3.** The drawer actively tells users a shipped feature does not exist |
| H5 | Add an error boundary around the composer with a recover-from-local-draft action | **TD-14.** A geometry throw currently loses unsaved work behind a blank screen |
| H6 | Surface the timeline in the composer (Properties panel or a 4th Revisions tab) | Rich audit data is written and never shown |
| H7 | Surface `/letters/gaps` somewhere (workspace or an admin screen) | "Gaps must be visible" is the stated design intent; there is no UI |

**Architecture**

| # | Opportunity | Rationale |
|---|---|---|
| H8 | Split `LetterComposer.tsx` into a container + 4–6 feature hooks (`useLetterDocument`, `useLetterSave`, `useLetterRegistration`, `useComposerView`, `useComposerAutomation`) | 2,804 lines is 3.5× the project's own limit and the single largest maintenance risk in the module |

### 15.2 MEDIUM priority

**Functional**

| # | Opportunity | Rationale |
|---|---|---|
| M1 | Implement `pageBreak` (command + paginator honouring + re-select `W7`) | The model, the toolbar catalogue and the validation rule are all already built for it |
| M2 | Implement the `print` transition so a printed letter reaches `PRINTED` | The state exists, the matrix allows it, no route calls it. Status is currently permanently `REGISTERED` |
| M3 | Implement `supersede` (amendment chain) | Same — declared, unreachable |
| M4 | Implement `REGISTERED → DRAFT` revert for an unprinted registration, keeping its reference | Explicitly allowed by the master plan, explicitly not implemented |
| M5 | Add "accept change" to Track Changes | Only reject exists; the mental model is asymmetric |
| M6 | Notify on @mention | Mentions are parsed and stored; nothing consumes them |
| M7 | Seed a starter template library | The library opens empty, so the feature looks broken on first use |
| M8 | Wire letters into the ERP `AuditLog` alongside the module timeline | Every other module audits centrally |
| M9 | Add `createdFrom`/`createdTo` to the workspace filter UI | Already in the query type and the backend |
| M10 | Add a `Manager` field to `Employee` (unlocks `{{Manager}}` by deleting one line) | Cheapest possible variable unlock |

**UX**

| # | Opportunity | Rationale |
|---|---|---|
| M11 | Replace the three `window.confirm`/`prompt` calls with `ConfirmModal`/`Dialog` | **TD-15.** Consistency and styleability |
| M12 | Context menus on paragraphs and layout objects | Zero exist; both surfaces have obvious action sets already implemented |
| M13 | Drag & drop from the Insert panel onto the page | Insertion is click-only |
| M14 | Persist Design/Compose mode per letter (opt-in) | Currently always Compose; a layout-heavy letter reopens in the wrong mode |
| M15 | Show validation severity in the mini map bands | The mini map already knows the page; the panel already knows the severity |

**Architecture**

| # | Opportunity | Rationale |
|---|---|---|
| M16 | Consolidate status labels/tones into one module imported by all three consumers | **TD-7** |
| M17 | Derive the frontend capability helpers from a shared lifecycle table | **TD-6** |
| M18 | Decide the fate of `letters/model/documentTypes.ts` — adopt it or delete it | **TD-10.** Two parallel type systems for the same document |
| M19 | Namespace helper + migration story for the 16 `localStorage` keys; clean up recovery drafts for deleted letters | **TD-12** |

### 15.3 LOW priority

**Performance**

| # | Opportunity | Rationale |
|---|---|---|
| L1 | Cache measured heights per block id; re-measure only changed blocks | Currently every item re-renders in the mirror on every signature change |
| L2 | Virtualise the measurement mirror for documents past N pages | Bounded by `pageCap: 10`, so this is genuinely low priority |
| L3 | Memoise `renderItem` per item id | Each keystroke currently re-creates every section element |
| L4 | Derive the gesture `pxPerMm` from the live probe factor rather than the nominal one | **TD-5.** Correctness under OS display scaling, not speed |

**Functional**

| # | Opportunity | Rationale |
|---|---|---|
| L5 | Line-level paragraph splitting across page boundaries | Named in `paginate.ts` as "the natural next step". Large piece of work |
| L6 | A second print profile (requires measuring real stationery first) | The registry is already keyed and parameterised for it |
| L7 | A second template (Circular / Administrative Decision) — prefixes already reserved | Would validate the metadata-driven architecture end to end |
| L8 | `.docx` export via a page→docx mapper | Explicitly reasoned against; would be a second renderer |
| L9 | Cross-letter full-text search | Backend never parses `contentJson`, so this needs a design decision first |
| L10 | Header/footer library actually consumed (`letters.headerFooters` is declared and stored but nothing inserts one) | Dead library slot |

**UX**

| # | Opportunity | Rationale |
|---|---|---|
| L11 | Column reordering in the workspace | Order is currently fixed |
| L12 | Saved filter presets | Filters persist but only one set |
| L13 | Comment count badge on the Review button | Currently invisible until the rail is opened |
| L14 | Keyboard access to the design canvas beyond the Layers panel | Deliberate today; a documented alternative exists |
| L15 | i18n the hardcoded Arabic UI strings | Only one key (`page.officialLetter.title`) goes through `useT` |

**Architecture**

| # | Opportunity | Rationale |
|---|---|---|
| L16 | Remove or wire `letters/index.ts` | **TD-13.** 40 exports, no importers |
| L17 | Guard `nextBlockId` against cross-tab collision (e.g. add a session nonce) | **TD-9.** Very low probability |
| L18 | Split `documentDiff.ts` into word-diff / block-diff / object-diff modules | 21 KB single file |

---

## Appendix A — Complete file inventory

### `frontend/src/letters/` — the pure engine (46 files)

```
barcode/     payloadBuilder.ts
editor/      blockCommands.ts  documentOutline.ts  documentSearch.ts  documentStats.ts
fonts/       fontIntegration.ts
layout/      alignment.ts  layoutCommands.ts  layoutGeometry.ts  layoutIntegrity.ts  snapping.ts
library/     favourites.ts  libraryTypes.ts
model/       blockModelIntegrity.ts  blockTypes.ts  documentTypes.ts  layoutTypes.ts  sectionTypes.ts
pagination/  measure.ts  paginate.ts
printing/    printModel.ts  printPipeline.ts
registry/    barcodeSpecs.ts  documentStyles.ts  geometryRegistry.ts  printProfileRegistry.ts
             templateRegistry.ts  toolbarCommands.ts  typographyPresets.ts  validationRuleCatalog.ts
rendering/   contracts.ts
revisions/   documentDiff.ts
validation/  context.ts  framework.ts
             rules/  automationRules.ts  brandingRules.ts  documentRules.ts  geometryRules.ts
                     index.ts  layoutObjectRules.ts  layoutRules.ts
variables/   conditions.ts  variableCatalog.ts  variableResolver.ts  variableSyntax.ts
versioning/  resolver.ts  versions.ts
index.ts
```

### `frontend/src/components/letters/`

```
LetterBarcode.tsx  LetterPageStack.tsx  LetterPaper.tsx  LetterSections.tsx  ValidationPanel.tsx
useLetterPagination.ts  useLetterPrint.ts  useLetterValidation.ts
letter-barcode.css  letter-paper.css  letter-print.css  letter-sections.css
letter-tokens.css  validation-panel.css
```

### `frontend/src/components/letters/studio/`

```
Components   ConditionEditor  DocumentNavigator  DocumentPropertiesPanel  DocumentStatusBar
             DocumentToolbar  FindReplacePanel  FloatingContextToolbar  InsertPanel
             LayersPanel  LayoutCanvas  LayoutObjectView  LayoutToolbar  ObjectInspector
             RailResizeHandle  RevisionPanel  ShortcutsDialog
Hooks/util   exportPipeline.ts  useAutoSave.ts  useDocumentHistory.ts  useDocumentLibrary.ts
             useDocumentSelection.ts  useDocumentShortcuts.ts  useLayoutDesigner.ts
             useLayoutInteraction.ts  useLayoutSelection.ts  useResizableRail.ts
             useVariableBindings.ts  zoom.ts
CSS          12 files
```

### `backend/src/modules/letters/`

```
letters.routes.ts  letters.controller.ts  letters.service.ts  letters.repository.ts
letters.schema.ts  letterTemplates.constants.ts  lifecycle.ts  reference.service.ts
referenceFormat.ts  revisions.service.ts  snapshot.ts  timeline.service.ts
letters.contract.test.ts
__tests__/  letters.list  letters.service  lifecycle  reference.service  referenceFormat
            referenceIntegrity.integration  revisions.service  snapshot  timeline.service
            templateMirror
```

### `frontend/src/__tests__/letters/` (27 files)

```
barcodePayload  blockCommands  blockModel  brandingRules  documentAutomation  documentDiff
documentModel  documentStudio  engineBoundary  engineSourceScan  fontRegistryEnforcement
geometryRegistry  layoutDesigner  letterComposer  letterWorkspace  measure
noHardcodedGeometry  paginate  postReleaseHotfixV1  printFidelityDocuments  printPipeline
printProfileRegistry  renderingContracts  templateRegistry  validationFramework
validationRules  versioning
```

---

## Appendix B — localStorage key map

| Key | Scope | Contents |
|---|---|---|
| `manarERP.letters.filters` | Workspace | Whole `WorkspaceFilters` object |
| `manarERP.letters.pageSize` | Workspace | 20 / 50 / 100 |
| `manarERP.letters.density` | Workspace | comfortable / compact |
| `manarERP.letters.hiddenColumns` | Workspace | string[] |
| `manarERP.letters.sortBy` / `.sortDir` | Workspace | Sort state |
| `manarERP.letters.composer.zoom` | Composer | number |
| `manarERP.letters.composer.zoomMode` | Composer | manual / fitWidth / fitPage (**default `fitWidth`**) |
| `manarERP.letters.composer.rulers` | Composer | boolean (default true) |
| `manarERP.letters.composer.grid` | Composer | boolean (default false) |
| `manarERP.letters.composer.zones` | Composer | boolean (default true) |
| `manarERP.letters.composer.navigator` | Composer | boolean (default true) |
| `manarERP.letters.composer.navigatorTab` | Composer | pages / outline |
| `manarERP.letters.composer.sidePanel` | Composer | none / insert / properties / revisions |
| `manarERP.letters.composer.revisionTab` | Composer | history / changes / comments |
| `manarERP.letters.composer.validationOpen` | Composer | boolean |
| `manarERP.letters.composer.snap` | Composer | `SnapSettings` |
| `manarERP.letters.composer.layoutGuides` | Composer | boolean |
| `manarERP.letters.composer.railWidth.nav` | Composer | 172 px (140–340) |
| `manarERP.letters.composer.railWidth.inspector` | Composer | 232 px (200–420) |
| `manarERP.letters.composer.railWidth.sidePanel` | Composer | 250 px (220–460) |
| `manarERP.letters.favourites` | User | `Partial<Record<FavouriteKind, string[]>>` |
| `manarERP.letters.recents` | User | Same shape, capped at 8 per kind |
| `manarERP.letters.recovery.<letterId>` | Per letter | `RecoveryDraft` |

---

*End of report. No code was modified in the production of this document.*
