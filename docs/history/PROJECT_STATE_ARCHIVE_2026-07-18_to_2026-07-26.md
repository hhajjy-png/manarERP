# PROJECT_STATE.md — Release-Log Archive

**Archived from:** `PROJECT_STATE.md` (repo root), release-log section
**Rotated on:** 2026-09-08 — *PROJECT_STATE Documentation Rotation & Maintenance v1*
**Date range covered:** `2026-07-26` → `2026-07-18`  (newest first, exactly as it appeared in the live file)
**Release entries in this file:** 41
**First entry in file:** Previous Release — Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1
**Last entry in file:** Previous Release — Employment Contract Workspace Integration & UX Refresh Pack v1

> **Verbatim.** Every section below was MOVED, not rewritten: heading, tables, code blocks and prose
> are byte-identical to the live file before rotation. Nothing was summarised, reformatted or dropped.
> Two entries in this archive still carry a `## Latest Release —` heading; that is how they existed in
> `PROJECT_STATE.md` (they were never demoted to `## Previous Release` by the release that followed
> them). They were preserved exactly rather than silently corrected — see `ROTATION_MANIFEST_V1.md`.

See `docs/history/README.md` for the full archive index.

---
## Previous Release — Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1

| Field | Value |
|-------|-------|
| **Package** | Payment Voucher Official Letterhead & Exact Preview Page-Cascade Fix Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/payment-voucher-letterhead-exact-preview-cascade-fix-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `efbb4c8` (documentation commit from the prior release) |
| **Feature commit** | `da2ab95` |
| **Production merge commit** | `3fb9b82` |
| **Stable tag** | `stable-payment-voucher-letterhead-exact-preview-cascade-fix-pack-v1` → merge `3fb9b82` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release) · frontend production build ✅ · targeted `vitest` 12/12 files, 251/251 tests passing · 2 pre-existing/unrelated failing files (`wysiwygPreviewPoc`, `universalPrintPreviewCorrective`) confirmed identical against the pre-pack baseline — both assert on `InvoicePreview.tsx` source text, a file this pack never touches |

**Scope — Payment Voucher.** Removed the Direct Manager Approval section (signature/date/official-stamp block) entirely (`hideApprovalSection`). Replaced the plain-text company header with the official `logohead.png` letterhead image at its natural aspect ratio, scaled to the form's width with no distortion or cropping (`useLogoHeader`, opt-in on `FormHeader`/`FormLayout` — the source image file is untouched). Sharpened the header's text legibility with a display-only CSS `filter` (`contrast(1.3) brightness(0.94)`) rather than editing the source asset. Compacted the payment-voucher print profile's top `@page` margin from 12mm to 5mm (`compactTopMargin`, opt-in per profile — the shared `PRINT_PROFILES` default and every other form/profile are unaffected) and shifted the whole content block (header through footer) down 2cm as a single unit via a real spacer element (`contentTopOffset` — survives the `.form-page { padding: 0 !important }` print/PDF reset that a CSS `padding`-based offset would not). Verified single-page A4 in both the physical Print path and PDF export.

**Scope — Exact Preview `@page` cascade fix (shared engine, all forms benefit).** Root cause: `composeStyledFromNode` picked the FIRST `@page` rule captured from `document.styleSheets` (document order), so `app/theme.css`'s generic app-startup fallback (`@page { margin: 1cm; }`, imported in `main.tsx` ahead of any form) silently won over a form's own, later-mounted, more specific `@page` rule — causing the Exact Preview dialog to paginate differently from the real Print and PDF paths, which both apply the form's own rule directly and correctly. Fixed with a new `mergePageRules()` (`printing/styleCapture.ts`) that reconciles all captured `@page` rules **property-by-property in cascade order** (the later value wins per property, mirroring real browser `@page` cascade resolution) instead of naive first- or last-rule selection — so a later rule that only overrides `margin` can never silently erase an earlier rule's `size`. `composeDocument.ts` now consumes `mergePageRules(captured.pageRules)` instead of `pageRules[0]`. This is an engine-level fix in the shared Print Center composer, benefiting every form on the default `useAccurateFormPreview`/`composeStyledFromNode` path: Payment Voucher, Resignation, ReturnToWork, SalaryAdvance, SalaryCertificate, ToWhomItMayConcern, PurchaseRequest, EmployeeWarning, LeaveRequest, PerformanceEvaluation, EmploymentContract, and Quotation (via its own `compose` wrapper, which also calls `composeStyledFromNode`). Receipt Voucher is unaffected — it uses a different composer (`composeFromNode`) that never calls `capturePrintStyles`. New regression coverage: `frontend/src/__tests__/exactPreviewPageCascade.test.ts` (8 tests — unit coverage for `mergePageRules`'s property-merge correctness, plus an integration test reproducing the exact reported bug scenario against `composeStyledFromNode`).

**Not changed:** any other form's design/content, `theme.css` (the colliding generic rule itself is untouched — only how the composer *selects among* captured rules changed), other forms' print margins, A4 sizing/scaling, QR codes, business logic, or the physical Print/PDF pipelines.

**Deferred, out of scope for this release:** `PayrollPayslip` has no form-specific `@page` rule at all, so its Exact Preview still falls back to `theme.css`'s incomplete rule (`margin` only, no `size`) — an independent, pre-existing defect discovered during root-cause analysis, unrelated to the "wrong rule wins" bug this pack fixes. Deferred per explicit product-owner instruction.

---

## Previous Release — Cheque Multi-Selection & Batch Printing Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cheque Multi-Selection & Batch Printing Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-26 |
| **Feature branch** | `feature/cheque-multi-selection-batch-printing-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `163d395` (documentation commit from the prior release) |
| **Feature commit** | `96a5948` |
| **Production merge commit** | `4284543` |
| **Stable tag** | `stable-cheque-multi-selection-batch-printing-pack-v1` → merge `4284543` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. |
| **Validation** | frontend/backend/electron `tsc --noEmit` ✅ · `prisma validate` ✅ · backend `vitest` 135/135 files, 1897/1897 tests ✅ · electron `vitest` 4/4 files, 80/80 tests ✅ · frontend `vitest` 1858/1885 passing — the 27 failing tests (8 files) are pre-existing and unrelated to this pack, confirmed identical against the pre-pack baseline at every checkpoint during implementation |

**Scope.** Cheques table gained row/select-all checkboxes and a selection toolbar ("تم تحديد X شيك") for printing multiple cheques and/or their payment vouchers in one action. Batch cheque printing now works through whichever print provider is currently selected:
- **Classic** — an in-page sequential loop reusing the existing single-cheque handlers unchanged (mark-printed confirm for DRAFT, reprint-reason dialog for PRINTED); stops immediately on a cancelled/errored print, never advances past a failed item.
- **Template Real (178×89mm) / Template A4** — an in-page **Batch Preview Navigator** on `ChequeTemplatePrintPage`: the whole selected batch opens in ONE navigation, and Previous/Next browse a local index over a pre-built item list. Navigation never prints and never marks anything printed; printing always targets whichever item is currently shown, and gains the same mark-printed/reprint tracking Classic already had (previously entirely untracked for Template printing).

The same Batch Preview Navigator pattern was applied to **Payment Voucher** batch printing, replacing an earlier route-to-route "Next/Finish" queue that (per Product Owner manual testing) could leave the page showing a stale cheque instead of advancing. Payment Voucher's voucher-number allocation semantics are unchanged (still idempotent, still assigned once per cheque); the batch path now allocates lazily per item, on first view, via the same existing endpoint.

**Print-result correctness (root cause of the manual-review defect this pack also fixes).** `webContents.print()`'s callback was never wired up — `electron/ipc/dialog.ipc.ts`'s `app:print` handler fired-and-forgot, and `FormLayout`'s Print Center path discarded a real result it already had. Both now return the actual `success`/`cancelled`/`error`/`unknown` outcome (`utils/print.ts`'s `printCurrentViewWithResult`), and cheque tracking is gated on that real result instead of being applied unconditionally after `printCurrentView()`.

**Not changed:** print settings, Classic Calibration, Template Manager, cheque templates, A4/178×89 dimensions and offsets, the Runtime/Render engine, voucher-numbering rules, RBAC/permissions, and the database schema.

---

## Previous Release — Administrative Forms English Titles Fix Pack v1

| Field | Value |
|-------|-------|
| **Package** | Administrative Forms English Titles Fix Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-25 |
| **Feature branch** | `feature/administrative-forms-english-titles-fix-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `a835646` (documentation commit from the prior release) |
| **Feature commit** | `181604d` |
| **Production merge commit** | `d0ff20f` |
| **Stable tag** | `stable-administrative-forms-english-titles-fix-pack-v1` → merge `d0ff20f` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. Gemini final review — **approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release) — no automated test previously existed for this defect; validated via `tsc` + static diff review + manual/Gemini review |

**Scope.** Every administrative form's printed `<h1>` title (and its matching print-preview dialog title/`documentLabel`) was resolved via `t()` from `useT()`, which is bound to the app's **global UI language** (`useUI().lang`, Arabic by default) rather than the form's own local `lang` toggle (`ar`/`en`) that the user selects on the print form itself. Result: selecting the English document while the app's UI language was Arabic (the default) still printed an Arabic title above an otherwise fully English document. Fixed by resolving each title via the i18n dictionary directly with the document's own `lang` state (`t(key, lang)`, imported as `translate`), independent of the global UI language. Applies to: Salary Certificate, To Whom It May Concern, Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning, Performance Evaluation, Quotation, Purchase Request (10 forms, 55 lines changed — the exact `t('page.X.title')` → `translate('page.X.title', lang)` call-site substitutions, nothing else).

**Excluded.** Employment Contract — out of scope per the release brief. Payment Voucher and Receipt Voucher — unchanged; their title boxes already render both languages together ("سند صرف / PAYMENT VOUCHER", "سند قبض / RECEIPT VOUCHER") regardless of the language toggle, so they were never affected by this defect. No changes to printing layout, margins, fonts, QR codes, form numbering, business logic, or translations outside the document title.

---

## Previous Release — Barcode Payload Standardization Pack v1

| Field | Value |
|-------|-------|
| **Package** | Barcode Payload Standardization Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-25 |
| **Feature branch** | `feature/barcode-payload-standardization-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `30bfe39` (documentation commit from the prior release) |
| **Feature commit** | `08266b0` |
| **Production merge commit** | `e3c8cf8` |
| **Stable tag** | `stable-barcode-payload-standardization-pack-v1` → merge `e3c8cf8` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. Gemini final review — **approved**. |
| **Validation** | frontend `tsc --noEmit` ✅ (frontend-only release) · targeted `vitest` — 4 files / 70 tests passing (`printWorkspace`, `documentVerificationQR`, `legacyFormPreviewRolloutPhase1`, `quotationLegacyPreviewBridge`) |

**Scope.** Standardized the JSON payload encoded inside every printed form's QR code onto one schema: `{formType, formNumber, entityName, entityId?}`. Previously 12 forms encoded `{formType, formNumber, employeeId, employeeName, issueDate}` and Employment Contract encoded an entirely separate, ad-hoc shape (`employeeName, civilId, contractDuration, salary, companyName, contractEndDate, formNumber`) via an `as never` cast that bypassed the shared `QRData` type. `entityId` is now included only when a genuine backing record id exists — the app's pre-existing `0` "no entity" placeholder (used by Quotation, Purchase Request, Payment Voucher, Receipt Voucher, and Employment Contract's manual-entry/unregistered-employee print path) is correctly recognized as "no id" and the field is omitted entirely rather than encoded as a meaningless value. Applies to: Salary Certificate, To Whom It May Concern, Leave Request, Return to Work, Salary Advance, Resignation, Employee Warning, Performance Evaluation, Purchase Request, Quotation, Payment Voucher, Receipt Voucher, Employment Contract.

**Removed from every QR:** `issueDate`/timestamps app-wide, and — Employment Contract only — Civil ID, salary, contract duration, contract end date, and the hardcoded company name. None of that belongs in a scannable, unsigned code printed on a document that can be freely photographed; Employment Contract's `contractEndDate`/`CONTRACT_DURATION_YEARS` computation was removed entirely as dead code once its only consumer (the QR) no longer needed it.

**Deliberately excluded.** Invoice's `DocumentVerificationQR` — it encodes a bare `verificationUuid` string (no JSON at all), consumed by a real backend endpoint (`GET /api/verify/:uuid`) that looks the invoice up by that exact value; folding it into the new schema would silently and permanently break that lookup, so it was left byte-for-byte unchanged. Template Studio's per-template `qr`/`barcode` designer elements were also left out of scope — they bind one user-selected field from a small allow-list per template, not a fixed per-document payload. No changes to QR rendering, size, position, color, error correction, PNG/SVG output, printing pipeline, form numbering (`formNumber.ts`), layouts, backend, or APIs.

---

## Previous Release — Window Lifecycle Foundation v1

| Field | Value |
|-------|-------|
| **Package** | Window Lifecycle Foundation v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-24 |
| **Feature branch** | `feature/window-lifecycle-foundation-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `e2ab52f` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-window-lifecycle-foundation-v1` → `e2ab52f` (annotated) |
| **Feature commit** | `1eaf2ce` |
| **Production merge commit** | `e3bf6d4` |
| **Stable tag** | `stable-window-lifecycle-foundation-v1` → merge `e3bf6d4` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. Gemini final review — **approved**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · backend `vitest` 1897/1897 ✅ · frontend `vitest` 1829 passing / 17 failing (7 files, all pre-existing baseline, none from this release) · electron unit-test suite 75/75 ✅ — zero regressions |

**Root cause fixed.** A real-world bug report: the app would start, briefly show a Cloud Sync Progress dialog, then Electron would exit cleanly (code 0, no crash, no stack trace) before the main application window ever opened. Root cause: `beginSyncProgressUI()` creates a real, Electron-tracked `BrowserWindow` for the sync-progress dialog *before* the main window exists. When that dialog closed, it was — at that moment — the application's *only* open window, so Electron's `window-all-closed` event fired. `electron/main.ts`'s existing handler for that event (`if (process.platform !== 'darwin') app.quit();`) had no way to distinguish "a transient utility window just closed" from "the user closed the real app," so it always called `app.quit()`, which correctly and cleanly ran the full `before-quit` shutdown sequence — before `startBackend()`/`createMainWindow()` ever ran.

**Fix — a generic mechanism, not a one-off patch.** New `electron/windows/windowLifecycle.ts`: `registerUtilityWindow(win)` (any transient window self-registers and self-cleans on close) and `registerMainWindow(win)` (called once, when the real app window is created — sets a permanent flag, never reset). `shouldQuitOnAllWindowsClosed()` returns true only if the main window has ever been registered. `main.ts`'s `window-all-closed` handler now checks this before calling `app.quit()`, instead of quitting unconditionally the instant the tracked window count hits zero. Any *future* utility window (splash, update-check, migration, maintenance dialogs) adopts the same one-line `registerUtilityWindow(win)` call and gets the same protection automatically — no changes needed to `main.ts` or this registry file.

**Also introduced in this commit (first-time commit of previously working-tree-only code):** the Cloud Sync Progress Dialog v1 files this fix was written against and validated with — `syncProgressWindow.ts`, `syncProgressWindow.preload.ts`, `services/syncProgressBus.ts` (+ unit test). These were necessary for `main.ts` to compile and for the new registry to have a real, exercised consumer, not a theoretical one.

**Deliberately excluded from this release.** `syncEngine.service.ts`'s pending `emitSyncProgress()`-in-`setStatus()` wiring — still sitting uncommitted in the working tree, left for a separate, dedicated release since it touches synchronization code. Without it, the progress dialog still safely creates and destroys itself on every app start (exercising this exact fix path) — it just won't display live progress text yet. `before-quit`, startup synchronization, shutdown synchronization, the `activate` handler, `second-instance` handling, and the entire Google Drive Sync decision/retry/upload/download/conflict architecture are all byte-for-byte unchanged. No database schema changes, no business logic changes, no backend changes.

---

## Previous Release — Default Cheque Print Provider v1

| Field | Value |
|-------|-------|
| **Package** | Default Cheque Print Provider v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-24 |
| **Feature branch** | `feature/default-cheque-print-provider-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `7400b34` (documentation commit from the prior release) |
| **Feature commit** | `afc97ac` |
| **Production merge commit** | `83f2246` |
| **Stable tag** | `stable-default-cheque-print-provider-v1` → merge `83f2246` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. Gemini review — **approved**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · backend `vitest` 1897/1897 ✅ · frontend `vitest` (committed state) 1829 passing / 17 failing (7 files, identical to the prior release's baseline, none from this release) — zero regressions |

**Scope.** Users can now permanently choose the default cheque printing provider from the Cheques Management page. The preference is stored using the **existing application Settings infrastructure** (`cheques.defaultPrintProvider`, upserted via the existing `PUT /settings` endpoint — included in database backups, no new schema, no migration) and restored automatically on page load; **existing users continue to default to the Classic provider** (setting absent → unchanged behavior). This release bundles five sequential, dependent packs built and validated together this session on top of Official Cheque Template System v1's print pipeline: (1) **A4 Surface Mode v1** — a second presentation surface (`ChequeA4Sheet`) that places the *same* cheque render surface at a fixed, centered, printer-safe position on an A4 landscape page, with no second Runtime/Render/Print engine; (2) a **Force Landscape fix** — corrected an invalid `@page` CSS declaration (an explicit two-length size combined with the `landscape` keyword, which the CSS Paged Media spec disallows) that made Chromium/Windows silently drop the page-size rule and default to Portrait — A4 mode now uses the named `A4 landscape` page size; (3) **Cheque Printing Provider Selection v1** — a `طريقة الطباعة` dropdown next to `طباعة الشيك` that routes the print request to one of the three existing, unmodified printing systems (Classic / Cheque Template Real 178×89mm / Cheque Template A4) via a lightweight selection layer, default Classic; (4) **Cheques Management Workspace Refresh v1** — removed the large decorative on-screen cheque preview image and consolidated the printing/voucher/calibration actions into one coherent toolbar, reclaiming vertical space so the cheque table becomes the page's primary focus (columns/logic/sorting/filtering unchanged); (5) **Default Cheque Print Provider v1** itself — the `تعيين كافتراضي` toggle described above. Full report: `docs/RELEASE_DEFAULT_CHEQUE_PRINT_PROVIDER_V1.md`.

**Deliberately unchanged.** The Runtime Engine, `ResolvedRenderModel`, `ChequeRenderSurface`, `ChequePrintOutput`, the Template Manager's persistence, Semantic Data Binding, Classic Calibration, and the Professional module — none were modified; the provider layer only routes to them. Scoped release: unrelated in-progress working-tree work (dashboard, Prisma schema/seed, the Professional module, migrations) was left uncommitted and out of scope, matching the prior release's convention.

---

## Previous Release — Official Cheque Template System v1

| Field | Value |
|-------|-------|
| **Package** | Official Cheque Template System v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-24 |
| **Feature branch** | `feature/official-cheque-template-system-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `325c0cf` (documentation commit from the prior release) |
| **Feature commit** | `19029ca` |
| **Production merge commit** | `fa8f315` |
| **Stable tag** | `stable-official-cheque-template-system-v1` → merge `fa8f315` (annotated) |
| **Reviews** | Product Owner visual review — **completed & approved**. Claude architectural review — **passed**. Gemini final review — **approved**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · backend `vitest` 1897/1897 ✅ · frontend `vitest` 1829 passing / 17 failing (7 files, all pre-existing baseline, none from this release) — zero regressions |

**Scope.** A new, self-contained Official Cheque Template architecture, built alongside and **fully isolated** from Classic Calibration and the Professional Cheque Printing module. Includes: a reusable business-logic-free **`ChequeTemplateDesigner`** (WYSIWYG selection/drag/resize/rotation/keyboard-nudge/alignment-snap/undo-redo with host extension slots); a **"قالب الشيك" tab** in the cheque studio overlay (Classic Calibration stays the **default** tab and byte-for-byte unchanged, hosted in a screen-only CSS containing block so its print path is untouched); a **Template Manager** (New / Open / Save / Save As / Rename / Delete / Default) on an **independent `chequeDesigner.*` localStorage** namespace (layout-only, never `cheque.template.*`); a pure **Runtime Engine** (`resolveChequeTemplate`: template + runtime data → fully-resolved render model, validation + graceful handling + painting order — the single rendering authority); **semantic Data Binding** (per-field Data Source dropdown; stable semantic ids persisted, never display text); a **Live Preview** and shared **`ChequeRenderSurface`** used by both preview and print (no duplicated rendering logic); a **printing pipeline** (real cheque record → runtime data reusing existing tafqeet/amount logic → engine → render surface → existing Electron print flow via a dedicated `/cheque-template/print` route); **native 178 × 89 mm Landscape** (`@page` + native Electron `landscape` enforcement); **background separation** (preview shows the cheque background + data, print outputs **data only**); and an **architectural fix** for the designer host-notification infinite render loop (notification decoupled from `onChange` identity, fires only on genuine field changes). Full report: `docs/RELEASE_OFFICIAL_CHEQUE_TEMPLATE_SYSTEM_V1.md`.

**Deliberately unchanged.** Classic Calibration (workflow / storage / rendering / printing / existing APIs), the Professional module, backend, Prisma schema, database, and Settings. Scoped release: unrelated in-progress working-tree work (dashboard, Prisma schema/seed, the Professional module, migrations) was left uncommitted and out of scope.

---

## Previous Release — Google Drive Database Restore Reliability Pack v1

| Field | Value |
|-------|-------|
| **Package** | Google Drive Database Restore Reliability Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-23 |
| **Feature branch** | `feature/google-drive-database-restore-reliability-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `2ec1dee` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-google-drive-database-restore-reliability-pack-v1` → `2ec1dee` (annotated) |
| **Feature commit** | `b5da398` |
| **Production merge commit** | `9ff69d9` |
| **Stable tag** | `stable-google-drive-database-restore-reliability-pack-v1` → merge `9ff69d9` (annotated) |
| **Architectural review** | **PASSED** — Gemini architecture/security review, per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. Real-world runtime restore testing — **completed successfully**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · frontend `vitest` — 8 failing files / 18 failing tests / 1808 passing, identical to the established pre-existing baseline, none touching Sync/Restore code — zero regressions · no backend changes this release |

**Scope.** Fixes a real-world restore failure reported in production: downloading a database backup from Google Drive succeeded, but the atomic file replacement threw `EPERM: operation not permitted, rename temp.db -> manar.db`, because the backend process still held the live SQLite file open (Windows exclusive-lock semantics). The existing local-file restore path (`backup.ipc.ts`) already stopped the backend before replacing the file; the sync/Google Drive download path never did — this pack closes that gap without touching the local-file path at all. `performDownload()` in `electron/services/syncEngine.service.ts` now: (1) detects whether the database is actually in use via a new `isBackendRunning()` — a no-op during startup-sync, since the backend hasn't started yet at that point; (2) gracefully stops the backend via a new `stopBackendForRestart()`, which awaits the process's real `'exit'` event (max 5s) rather than a fixed sleep; (3) wraps the atomic rename in the existing generic `withRetry()` helper, retrying only `EPERM`/`EBUSY` (6 attempts, 500ms–4s backoff) to absorb any final OS-level lock-release lag; (4) restarts the backend automatically and waits for `/api/health`; (5) in a `finally` block, restarts the backend even if the replace ultimately fails after retries, so the app is never left without a running backend. A new `getInternalSecret()` in `backendLauncher.ts` caches the `INTERNAL_SECRET` (used by `/api/internal/*` routes and the auto-backup scheduler) for the process lifetime instead of regenerating it, so a mid-session backend restart reuses the exact secret the scheduler already holds. The existing "unexpected exit → error dialog → `app.quit()`" handler is guarded with a `restartingBackend` flag so this deliberate restart is never mistaken for a crash. On the frontend, `CloudSyncPanel.tsx` replaced `requiresRestart` → `window.manar.restartApp()` (full Electron relaunch) with `backendRestarted` → `window.location.reload()` (in-window reload) — the user is no longer asked to restart the app manually; the existing 401 interceptor already handles a stale session after reload. Six new status phases surface via the existing `setStatus()` live-message mechanism: downloading, preparing, stopping, replacing, restarting, completed.

**Deliberately unchanged.** `performUpload()`, `performStartupSync()`/`performShutdownSync()`'s upload-only paths, the unrelated local-file restore flow in `backup.ipc.ts`, all integrity/backup/retry protections from the two prior sync packs, business logic, database schema.

**Known limitation.** If the `finally`-block backend restart also fails (e.g., the port never frees), the failure is swallowed as best-effort and the user is left needing a manual app restart — a further UI escalation for that double-failure case was judged out of scope for this fix.

---

## Previous Release — Google Drive Conflict Resolution Pack v1

| Field | Value |
|-------|-------|
| **Package** | Google Drive Conflict Resolution Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-23 |
| **Feature branch** | `feature/google-drive-conflict-resolution-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `4d577a1` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-google-drive-conflict-resolution-pack-v1` → `4d577a1` (annotated) |
| **Feature commit** | `d9b60eb` |
| **Production merge commit** | `fdf3681` |
| **Stable tag** | `stable-google-drive-conflict-resolution-pack-v1` → merge `fdf3681` (annotated) |
| **Architectural review** | **PASSED** — Gemini architecture/security review, per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · frontend `vitest` — same 8 pre-existing failing files reproduced on the unmodified checkpoint baseline, none touching Sync/Conflict Resolution code — zero regressions · no backend changes this release |

**Scope.** Professional conflict detection and resolution built strictly as an extension of the Sync Engine introduced by Google Drive Sync Foundation Pack v1 — the existing architecture was not redesigned. **Detection:** `decide()`'s existing SHA-256-based comparison now returns a distinct `CONFLICT` action (previously it silently fell through to `NONE`) when both the local and remote databases changed since the last successful sync — checked at the same point as always, immediately before every upload/download decision. Startup/shutdown conflicts are logged and left untouched (no reliable UI to prompt at those times); `CloudSyncPanel` proactively calls a new read-only `checkForConflict()` on mount so the resolution dialog can appear without requiring a manual "Sync Now" click. **Resolution:** `resolveConflict('LOCAL' | 'REMOTE', ...)` is a thin wrapper around the existing, unmodified `performUpload`/`performDownload` — so Keep Local/Keep Cloud inherit every Foundation Pack protection automatically (WAL checkpoint, double `PRAGMA integrity_check`, snapshot-before-upload, atomic rename, pre-sync backup, retry with backoff). Cancel is entirely client-side and never touches either database. New `ConflictResolutionDialog.tsx` shows a side-by-side Local vs. Cloud comparison (last modified, device, truncated SHA-256, size) with a non-binding "Newest" highlight — the system never auto-resolves. **Metadata:** new `electron/services/deviceIdentity.service.ts` (persistent per-machine UUID + hostname, never synced as its own file); Drive `appProperties` gained `version`/`deviceId`/`deviceName` alongside the existing `sha256`; every sync log entry is now tagged with the device that wrote it, and conflict-resolving entries additionally carry `conflictResolved`/`resolutionSelected`. `CloudSyncPanel`'s history table gained a Device column and a resolution badge.

**Deliberately unchanged.** Database schema, business logic, authentication, the backup system, and the core Sync Engine decision/upload/download code paths (only extended with one optional parameter each).

**Known limitation.** Same as Foundation Pack v1 — HTTP 403 from Google is still treated as non-retryable, not distinguished from rate-limiting. Unchanged in this pack.

---

## Previous Release — Google Drive Sync Foundation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Google Drive Sync Foundation Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-23 |
| **Feature branch** | `feature/google-drive-sync-foundation-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `9cc46a3` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-google-drive-sync-foundation-pack-v1` → `9cc46a3` (annotated) |
| **Feature commit** | `94a9c39` |
| **Production merge commit** | `1cfeaa3` |
| **Stable tag** | `stable-google-drive-sync-foundation-pack-v1` → merge `1cfeaa3` (annotated) |
| **Architectural review** | **PASSED** — Gemini architecture/security review, per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | electron `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend production build (`vite build`) ✅ · frontend `vitest` full suite — pre-existing **18 failures / 1808 passing** (114 files), identical to the pre-release baseline, confirming zero regressions · no backend changes this release |

**Scope.** Professional Google Drive synchronization for the desktop database while preserving the Offline-First architecture end to end — the app operates exclusively against the local SQLite database at all times; Google Drive is used only as a secure sync location between the user's own devices (hidden `appDataFolder`, `drive.appdata` OAuth scope — never a visible/shared folder). **Authentication:** OAuth2 login via the system browser (loopback redirect on `127.0.0.1`), never an embedded WebView (Google blocks those); tokens encrypted at rest via Electron `safeStorage` when available. **Sync engine:** persistent sync-metadata log, direction decision logic (upload/download/none/conflict — conflicting simultaneous local+remote changes are surfaced, never auto-resolved), atomic download-replace (temp file → verify → pre-sync backup → `fs.renameSync`), bounded (8s/20s) startup and shutdown sync that never blocks app start or quit. **Integrity:** real `PRAGMA integrity_check` via a short-lived `PrismaClient` pointed at the target file (reusing the backend's already-shipped query engine rather than adding a new native dependency), run before every upload and immediately after every download. **Locking safety:** `PRAGMA wal_checkpoint(FULL)` against the live database before it's read, then integrity-checked, then copied to a temp snapshot which is integrity-checked again before being the thing that's actually hashed and uploaded — the live file is never read directly by the upload path, and no downtime is introduced. **Reliability:** exponential-backoff retry around every Drive network call, classifying transient failures (network/timeout/429/5xx) from permanent ones (401/403/400/404 — never retried); every retry attempt is logged; retries re-run the whole idempotent operation so no duplicate uploads. **UI:** Cloud Sync is a tab inside the existing Backup page (`CloudSyncPanel.tsx` embedded in `Backup.tsx`), not a dedicated Sidebar entry — judged an administrative feature rather than a daily workflow. IPC surface reuses the existing `backups.create`/`backups.update` permissions — no new permission key.

**Deliberately unchanged.** Database schema, business logic, GL/accounting, every page/module other than the Backup page, and the Electron backend-launch/backup-scheduler mechanics (only extended, not restructured).

**Known limitation.** HTTP 403 responses from Google are treated as non-retryable (they're usually auth/permission errors); Google occasionally uses 403 for rate-limiting too, which this pass does not distinguish from a real permission failure — a rate-limited request will surface as a non-retried failure rather than backing off. Accepted as v1 scope.

**Setup required before use.** OAuth Client ID/Secret are not hardcoded — provide via `GOOGLE_DRIVE_CLIENT_ID`/`GOOGLE_DRIVE_CLIENT_SECRET` env vars or a `gdrive-client.json` file in the app's data directory, from a Google Cloud "Desktop app" OAuth client with `drive.appdata` + `userinfo.email` scopes.

---

## Previous Release — Excel Page Export Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Excel Page Export Consistency Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-23 |
| **Feature branch** | `feature/excel-page-export-consistency-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `fd11093` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-excel-page-export-consistency-v1` → `fd11093` (annotated) |
| **Feature commit** | `b0011bf` |
| **Production merge commit** | `1e4c359` |
| **Stable tag** | `stable-excel-page-export-consistency-v1` → merge `1e4c359` (annotated) |
| **Architectural review** | **PASSED** — per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `vitest` full suite run on this branch and, separately, against the clean pre-release baseline (via `git stash`) — both show the identical pre-existing **18 failures / 1808 passing** (114 files), confirming zero regressions · no backend changes this release |

**Scope.** Standardized table structure and Excel export behavior for exactly three pages — Invoices, Employees, Expenses. **Phase 1 (table verification):** audited all three pages' visible columns against their Prisma models; no missing required business columns found (supplementary fields are already in each page's detail drawer, or are unused across the entire module and would be speculative new functionality to add) — tables left unchanged. **Phase 2 (export consistency):** root cause was that all three pages' own "Export Excel" buttons called the shared `/reports/:type/export` backend endpoint, which the Reports page also uses for its own "Invoices"/"Expenses"/"Employees" report types with a different, wider column set — so fixing the shared endpoint would have changed the Reports page too. Decoupled each page's own export onto a new client-side path (`frontend/src/utils/exportUtils.ts`: `fetchAllRows` + `downloadTableExcel`, using the existing `xlsx` dependency) that fetches all rows matching current filters (not just the visible page) and builds the `.xlsx` directly from the table's own columns. **Employees** exports from the existing `modules.tsx` `employees.columns` array via a new opt-in `nativeExcelExport` flag on `ResourcePage.tsx` — every other `ResourcePage` module (contracts/customers/suppliers/equipment) is unaffected, same original code path. **Invoices & Expenses** (bespoke pages) had their table `<thead>`/`<tbody>` refactored to render from one new column-definition array per page (`invoiceColumns`/`expenseColumns`), with the Excel export built from that same array — eliminating the two-independent-definitions drift risk for these two pages as well, matching the guarantee Employees already had. Visual output unchanged: every render closure is a direct copy of the prior markup (same classNames, inline styles, ARIA attributes, row click/keyboard handling, page-specific quirks preserved).

**Deliberately unchanged.** GL, Journal Engine, Posting Engine, Chart of Accounts, Accounting Reports, the Reports page and all its report types, PDF generation, printing, backend APIs, database, filters, sorting, search, permissions, and business logic. No page or module outside Invoices/Employees/Expenses touched.

**Verification.** Backend diff empty; Reports/PDF/print diff empty; `nativeExcelExport` set only on `employees`. `tsc --noEmit` clean. Full frontend suite run twice (against this branch, and against the clean pre-release baseline via stash) — both show the identical pre-existing 18 failures / 1808 passing, confirming zero regressions.

**Unchanged:** backend · database schema · API contracts · GL posting logic · Chart of Accounts · Journal Entries · Reports page · PDF export · printing · every module other than Invoices/Employees/Expenses.

---

## Previous Release — Operational Reporting Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Operational Reporting Consistency Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-23 |
| **Feature branch** | `feature/operational-reporting-consistency-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `3accc53` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-operational-reporting-consistency-pack-v1` → `3accc53` (annotated) |
| **Feature commit** | `9c15fca` |
| **Production merge commit** | `3c00a1d` |
| **Stable tag** | `stable-operational-reporting-consistency-v1` → merge `3c00a1d` (annotated) |
| **Gemini review** | **APPROVED** — per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | backend `tsc --noEmit` ✅ · backend `vitest` full suite **135 files / 1897 tests** pass ✅ · no frontend changes this release |

**Scope.** A Financial Integrity Audit (read-only) verified the Operational Reporting Migration v1 engine's core (double-entry balance, canonical rounding, invoice/payment denormalization consistency) was sound, but found that several **secondary** KPIs — per-contract/customer profitability, month-over-month comparisons, KPI timelines, aging/debtor widgets — had not been migrated onto the shared engine and still carried pre-migration ad-hoc definitions. This pack closes that gap: **RI-1** removed every remaining legacy expense filter (`notIn: [REJECTED, CANCELLED, (REVERSED)]`) across executive month comparisons, per-contract/top-expense groupings, dashboard V2/IntelligenceV2, `monthlyTrendYTD`, Financial Center, and contract summary, replacing them with the engine's newly-exported `EXPENSE_OPERATIONAL_STATUS` (`'APPROVED'`). **RI-2** unified collections so every payment aggregate excludes cancelled invoices via the engine's `getCollections()` / newly-exported `SALES_INVOICE_ACTIVE` filter. **RI-3** replaced every `Invoice.total − Invoice.paidAmount` snapshot with the engine's `Invoice − Σ Payment` definition (dashboard top-debtors/aging/forecast/overview, executive & Financial Center per-contract/customer outstanding, contract summary) — numerically identical today (the snapshot was already provably consistent with summed payments) but removing the dependency on a second source. **RI-4** standardized `reports.service` totalsRow figures onto the canonical `round3` helper.

**Deliberately unchanged.** GL, Journal Engine, Posting Engine, Chart of Accounts, and Accounting Reports were not touched. Operational Profit/Loss formula is unchanged — still exactly `Revenue − Expenses`, sourced from `getOperationalProfitAndLoss()` everywhere; no screen computes it from Collections/Payments/Receivables. No API contract, response DTO, database schema, or frontend changes. Three findings from the audit remain intentionally excluded: **RI-5** (legacy single-sided `Transaction`-table posting from Inventory — isolated, not read by any official report), **RI-6** (the already-documented pending production payroll-GL journal cleanup), and **RI-7** (a minor invoice-stats aggregate rounding nit).

**Verification.** Project-wide grep sweep after implementation confirmed zero legacy `notIn` expense filters or `paidAmount`-snapshot receivables remain in any operational-reporting consumer, and that `EXPENSE_OPERATIONAL_STATUS`/`SALES_INVOICE_ACTIVE` are consumed by all four affected services (executive, financial-exec, dashboard, contracts). Full backend suite: 135 files / 1897 tests passing (existing tests re-fixtured — not weakened — to the unified payment-based mocking; same expected outcomes). `tsc --noEmit` clean.

**Unchanged:** frontend · API contracts · response DTOs · database schema · GL posting logic · Chart of Accounts · Journal Entries · Financial Center's own data (only its aggregation source changed) · `transactions.service.ts`.

---

## Previous Release — Operational Reporting Migration v1

| Field | Value |
|-------|-------|
| **Package** | Operational Reporting Migration v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/operational-reporting-migration-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `2e844d2` (documentation commit from the prior release) |
| **Feature commit** | `bf9b61c` |
| **Production merge commit** | `cd754ca` |
| **Stable tag** | `stable-operational-reporting-migration-v1` → merge `cd754ca` (annotated) |
| **Gemini review** | **APPROVED** — per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | backend `tsc --noEmit` ✅ · backend `vitest` full suite **135 files / 1897 tests** pass ✅ · no frontend changes this release |

**Scope.** A backend-only architecture migration executed across 7 sequential packs (each approved individually before the next began): **Pack 1** introduced a single reusable Operational Financial Engine (`backend/src/shared/services/operational.reporting.ts`) computing Revenue (Invoice), Expenses (Expense — one official status definition, `APPROVED`, replacing three previously-inconsistent filters scattered across the codebase), Collections (Payment), Accounts Receivable (Invoice+Payment), and Net Profit, plus `getOperationalSummary()` — a single orchestrator composing all five. **Pack 2** migrated the Profit & Loss report off the General Ledger onto this engine. **Pack 3** migrated Dashboard's `overview()`/`monthlyTrend()`/`executive()` finance figures the same way. **Pack 4** migrated the Executive Decision Center's `financialSummary`/`kpiTimeline`, closing a pre-existing inconsistency where its headline Net Profit mixed Invoice-sourced revenue with GL-sourced expenses. **Pack 5** was a read-only architecture audit determining Accounting Summary's correct target shape. **Pack 6** implemented that decision: Accounting Summary is now a **hybrid** — Revenue/Expenses/Collections/Net Profit from the Operational Engine, while Journal Entry Count/Total Journal Debit/Total Journal Credit remain General-Ledger-sourced (no operational equivalent exists for ledger-wide totals spanning every account type, not just revenue/expense). **Cleanup Pack 1** removed the now-orphaned `glMonthlyProfitAndLoss()` GL wrapper (zero remaining callers, verified by exhaustive grep) and corrected several comments that had described a "GL is the sole source" architecture this migration deliberately superseded.

**Deliberately unchanged.** The GL reporting engine (`glProfitAndLoss`/`glAccountFlow`), the posting engine, Chart of Accounts, Journal Entries, Financial Center, Reports other than Profit & Loss, and `transactions.service.ts`'s `/transactions/profit-loss` endpoint (still GL-based; explicitly deferred to a future cleanup pack since it duplicates the Accounting Summary panel exactly). API contracts, response DTO shapes, and every frontend component are unchanged — this release only changes *where the numbers come from*, not what any screen displays or how any endpoint responds.

**Regression prevention.** Each migrated function has a dedicated test suite locking in the new source (asserting the previous GL calls are never invoked, cancelled invoices are excluded, approved-only expenses are used, and empty periods return zero), alongside the prior GL-lock-in tests rewritten to the new invariant. Full backend suite: 135 files / 1897 tests passing; `tsc --noEmit` clean.

**Unchanged:** frontend · API contracts · response DTOs · database schema · GL posting logic · Chart of Accounts · Journal Entries · Financial Center · `transactions.service.ts`.

---

## Previous Release — Employee Smart Forms Hub & Forms Localization Integrity Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee Smart Forms Hub & Forms Localization Integrity Pack v1 |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/employee-smart-forms-hub-localization-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `7b86565` (documentation commit from the prior release) |
| **Feature commit** | `0850cc1` |
| **Production merge commit** | `61110df` |
| **Stable tag** | `stable-employee-smart-forms-hub-localization-pack-v1` → merge `61110df` (annotated) |
| **Gemini review** | **APPROVED** — per user's release note. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ · `formsRegistryTranslationAudit` **39/39** + `employeeSmartFormsHub` **21/21** + `explorerHubPrimitives` + `employmentContractNewEmployee` + 3 print-preview suites all pass ✅ |

**Scope.** Three linked pieces landed across four conversation turns: (1) **Smart Forms Hub** — the Employee Drawer's single "طباعة النماذج" action replaced with a "نماذج الموظف" popover built dynamically from a new `frontend/src/forms/shared/formsRegistry.ts` (no hardcoded form list; new forms appear automatically), navigating with `?employee=<id>&form=<key>` and auto-selecting both via the *same* handlers manual interaction uses. (2) **Back-navigation fix** — the auto-launch redirect was pushing an extra transit history entry, trapping the app's Back button on the same preview screen; fixed by making that one redirect use React Router's native `navigate(path, { replace: true })`, while manual in-hub printing keeps its original push (back-to-hub) behavior untouched. (3) **Forms Localization Integrity Audit** — discovered 5 forms (Salary Certificate, Return To Work, Salary Advance, Performance Evaluation, Purchase Request) silently displaying a raw i18n key as their title because those keys were never added to the dictionary (git history confirms this predates the Hub work — introduced 2026-07-21 by an unrelated localization commit, not reintroduced by this pack), plus Quotation's hardcoded, occasionally wrong-language title. Fixed all 6, and unified the architecture: `FormCard` now stores one `titleKey` (no more duplicated `titleAr`/`titleEn` strings); every consumer (Forms hub cards, Smart Forms Hub menu, each form's own preview) resolves the title through `t(titleKey)` against the single `i18n.ts` dictionary.

**Regression prevention.** `formsRegistryTranslationAudit.test.ts` iterates `FORM_CARDS` directly (no per-form test to maintain) and fails if any registered form's `titleKey` is missing AR, missing EN, falls back to the raw key, or has drifted from the literal key its own page component calls — future forms are covered automatically.

**Unchanged:** print engine · backend · database · APIs · document rendering · all existing permissions · every other administrative form not named above.

---

## Previous Release — Leave Request Translation Fix v1

| Field | Value |
|-------|-------|
| **Package** | Leave Request Translation Fix v1 — small corrective fix (one dictionary file, two keys) |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/leave-request-translation-fix-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `8fd6b49` (documentation commit from the prior release) |
| **Feature commit** | `699a63b` |
| **Production merge commit** | `c978bb2` |
| **Stable tag** | `stable-leave-request-translation-fix-v1` → merge `c978bb2` (annotated) |
| **Gemini review** | **APPROVED** — satisfied via the in-conversation Gemini Approval Override. |
| **Manual verification** | Product Owner visual review — **completed and accepted**. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ · targeted `vitest` (legacyFormPreviewRolloutPhase1 + universalAccuratePreview + universalPrintPreviewFullEnablement) **127/127 pass** ✅ |

**Root cause.** `page.leaveReq.title` was never registered in `DICT` (ar or en) in `frontend/src/lib/i18n.ts` — the entire `page.leaveReq.*` namespace was missing. `t()` falls back to the literal key string when a key is absent from both locales (`DICT[lang][key] ?? DICT.ar[key] ?? key`), which is exactly the raw-key symptom the Print Preview and `FormLayout` header showed. Not a binding error — `LeaveRequest.tsx` already called `t('page.leaveReq.title')` correctly in all three usages.

**The fix — narrowest possible.** Added `'page.leaveReq.title'` to both the Arabic (`'طلب إجازة'`) and English (`'Leave Request'`) dictionary blocks, reusing the wording already established for this form type in `printlog.form.leave_request`.

**Unchanged:** layout · business logic · print engine · every other administrative form (`PurchaseRequest.tsx`, `ReturnToWork.tsx` untouched, despite sharing some `page.leaveReq.field.*`/`page.leaveReq.opt.*` keys that are also currently unregistered — out of scope for this fix).

---

## Previous Release — Bank Transaction Experience Redesign Pack v2

| Field | Value |
|-------|-------|
| **Package** | Bank Transaction Experience Redesign Pack v2 |
| **Goal** | Completely redesign the Bank Transaction Intelligence drawer experience into a premium enterprise presentation layer — the user should immediately perceive that the ERP understands the transaction, without reusing the field-grid layout from the prior (superseded, never released) commit on this same branch. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/bank-transaction-intelligence-enhancement-pack-v2` (kept — pushed, not deleted; 2 commits — `3ccc4bb` superseded field-grid work, `b6f6a54` this redesign) |
| **Baseline** | `production` @ `7dd64c5` (documentation commit from the prior release) |
| **Checkpoint tag** | `checkpoint-bank-transaction-intelligence-enhancement-pack-v2` |
| **Feature commit** | `b6f6a54` (final state; supersedes `3ccc4bb` on the same branch) |
| **Production merge commit** | `5a383ff` |
| **Stable tag** | `stable-bank-transaction-experience-redesign-pack-v2` → merge `5a383ff` (annotated) |
| **Scope** | 7 files changed (382 insertions / 249 deletions vs. the superseded commit; net new vs. v1: 2 files added, 5 modified). **New**: `TransactionIntelligencePanel.tsx` — hero card (context-aware icon + rich title + natural-language summary), smart information chips (channel/cheque/branch/reference/direction/presentation-type/account, only what exists), icon-led insight-card grid, and a collapsed-by-default original-text disclosure; `TransactionIntelligencePanel.css` — reuses existing tokens and the established `.bae-tx-badge--*`/`.bae-tx-icon--*` palette, no new palette invented. **Modified**: `bankTransactionIntelligence.ts` — parser kept and extended, not rewritten: `buildSummary()` gained amount-aware templates for plain deposits/withdrawals; `BankAccountExplorer.tsx` — old field-grid description section and the now-dead `CollapsibleDescription` component removed, new panel rendered immediately below the amount hero (always visible, not tab-gated); `BankAccountExplorer.css` — dead field-grid/summary-banner rules removed; `i18n.ts` — new chip/insight keys added, 12 orphaned keys removed. |
| **Bug found and fixed during implementation** | A multi-line CSS comment in the new panel's stylesheet had a `(` on one line and its matching `)` several lines later — syntactically harmless inside a `/* */` comment by any normal reading, but it broke the Tailwind v4 Vite plugin's CSS transform (`CssSyntaxError: Missing opening (`). Root-caused via systematic bisection (added the file back one complete, balanced section at a time) rather than guessing: every actual style rule was confirmed fine, including `color-mix()` calls with a `var(--x, fallback)` argument nested inside — the failure was isolated specifically to the comment header. Fixed by keeping parentheses balanced within each comment line; documented as a house style note in the new file's own header comment. |
| **Verification** | `tsc --noEmit` clean. `vite build` succeeds. Targeted `vitest`: 39/39 pass (14 pinned presentation-engine + 14 intelligence-engine, including 4 new tests for the amount-aware summary templates + 8 drawer + 3 analytics). Full frontend suite: 1748/1766 pass — same 8 pre-existing/unrelated failing files as the v1 baseline, zero regressions. |
| **Review** | Claude Code Review (self-review of diff): 1 finding — an unnecessary `<>...</>` fragment left wrapping a single `<section>` after the field-grid removal — fixed same pass. Product Owner manual visual review: **APPROVED**. Gemini review: **APPROVED** (Gemini Approval Override — explicit project-owner in-conversation statement). |

## Previous Release — Bank Transaction Intelligence Presentation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Bank Transaction Intelligence Presentation Pack v1 |
| **Goal** | Upgrade the Bank Transaction Presentation Engine from simple text substitution into a structured, optional-field presentation layer (channel, counterparty, cheque/branch/account/reference/device identifiers) comparable to enterprise ERP transaction views — without changing any underlying data, business logic, or accounting. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/bank-transaction-intelligence-presentation-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `5142a0b` (documentation commit from the prior release) |
| **Feature commit** | `83cee31` |
| **Production merge commit** | `32d6665` |
| **Stable tag** | `stable-bank-transaction-intelligence-presentation-pack-v1` → merge `32d6665` (annotated) |
| **Scope** | 5 files changed (441 insertions / 40 deletions), frontend-only. **New**: `frontend/src/pages/bankTransactionIntelligence.ts` — modular engine (Generic Parser Helpers → ATM Detection → Cheque Detection → Transfer Detection → Deposit/Withdrawal Detection → Reference Extraction → Account Extraction → Branch Extraction → Presentation Builder); every extractor anchored to an explicit label + separator (never fuzzy free-text matching), so unrecognized transaction shapes simply return no value rather than guessing. Reuses `bankTransactionPresentation.ts`'s existing category/detail resolution and 3 newly-exported regex helpers rather than duplicating logic. **Modified**: `bankTransactionPresentation.ts` (pure refactor extracting the 3 reusable helpers + ATM-withdrawal label wording update, zero behavior change — verified against the existing 14-test pinned suite); `BankAccountExplorer.tsx` (drawer description area redesigned into a structured field grid, always-visible collapsible original-text section, removed now-redundant raw reference/cheque/badge rows); `BankAccountExplorer.css` (removed 3 rules of now-dead CSS); `i18n.ts` (29 new keys: 15 previously-missing `bank.presentation.*` keys that fixed a real raw-key-leak bug, 6 new channel-label keys, 8 new drawer-field-label keys — all ar+en). |
| **Bug fixed** | 15 `bank.presentation.*` i18n keys referenced by the presentation engine were never registered in `DICT` (ar or en) — since `t()` falls back to the literal key string when a key is missing from both languages, raw keys such as `bank.presentation.deposit` could leak to end users. Found while investigating the release brief's explicit warning against exposing internal presentation keys. Fixed by registering all 15 keys with the wording already used as their hardcoded Arabic fallback (byte-identical), plus English translations. |
| **Verification** | `tsc --noEmit` clean. `vite build` succeeds. Targeted `vitest` run (`bankTransactionPresentation.test.ts`, `bankTimelineTab.test.tsx`, `bankAnalyticsTab.test.tsx`) — 25/25 pass, including all 14 pre-existing pinned presentation-engine assertions (no regression). Full frontend suite: 1734/1752 pass; the 18 failures (8 files: cheque print isolation, currency headers, financial center tables, invoice fast entry, router future flags, universal print preview, wysiwyg PoC, formatBalance) verified pre-existing and unrelated — e.g. `formatBalance.test.ts` fails on `localStorage is not defined` at module load in a `node`-environment test file, independent of this change. |
| **Review** | Claude Code Review (self-review of the diff): 1 finding — dead CSS left behind after the description-section redesign (`.bae-drawer-desc`/`-primary`/`-secondary` no longer referenced) — fixed same pass, re-verified clean. Product Owner manual visual review: **APPROVED**. Gemini review: **APPROVED** (Gemini Approval Override — explicit project-owner in-conversation statement). |

## Previous Release — Business Dictionary & Reliability Pack v1

| Field | Value |
|-------|-------|
| **Package** | Business Dictionary & Reliability Pack v1 |
| **Goal** | Add bilingual (Arabic/English) business names for Customers, Suppliers, Accounts, Materials, and Material Categories via one additive nullable `nameEn` column per entity and a single shared resolution helper on each side, wired into every display/select/filter surface across the app — plus fix two runtime infinite-request-loop bugs discovered while auditing that surface. No API-breaking, permission, or calculation changes. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-22 |
| **Feature branch** | `feature/business-dictionary-reliability-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `6c7e43b` (documentation commit from the prior release) |
| **Feature commit** | `e42cc74` |
| **Production merge commit** | `2b9e989` |
| **Stable tag** | `stable-business-dictionary-reliability-pack-v1` → merge `2b9e989` (annotated) |
| **Scope** | 36 files changed (269 insertions / 94 deletions). **Schema**: additive nullable `nameEn String?` on `Customer`, `Supplier`, `Account`, `Material`, `MaterialCategory` (migration `20260721160000_add_bilingual_names`, plain `ALTER TABLE … ADD COLUMN`, no default, no backfill). **Backend**: Zod schemas accept optional `nameEn`; list/search queries extended to match `name` OR `nameEn`; new `backend/src/shared/utils/pickName.ts` — single resolution rule (English only if non-empty and requested language is English, else Arabic). **Frontend**: new `frontend/src/lib/resolveName.ts` mirrors the same rule; wired into Customers, Suppliers, Accounts (Chart of Accounts + `AccountSelector`), Materials, Material Categories (own CRUD pages), plus every other surface that displays these entities by relation — Invoices, Expenses, Prices, Reports, Dashboard, Contracts (`modules.tsx` generic column config), `FormDialog`'s generic select/autocomplete option-label resolution, `ForceDelete*Modal`s, `InvoiceFastEntryDialog`, `FastMonthlyExpenseDialog`, and the invoice print adapter (`invoiceAdapter.ts`, `purchaseOrderAdapter.ts` using the existing `useUI` global-language pattern, no new parameters). **Explicitly out of scope**: backend `reports.service.ts`/`financial.service.ts`/`statement.service.ts`/`executive.service.ts`/`dashboard.service.ts`'s pre-flattened Arabic-only DTO fields (`accountName`, `entityName`, etc.) and Global Search's backend subtitle — resolving these would require a backend document-language signal (new query param or header parsing) that does not exist anywhere in this codebase today; deferred to a future, dedicated pack rather than expanding this one's scope. One AI Assistant skill file (`ai/skills/contracts.ts`) left untouched — its labels are a separate, not-yet-internationalized Arabic-only subsystem. **Data population** (two prior audit-gated packs, no code artifact): dev-database `nameEn` populated for the 10 system chart-of-accounts rows (standard accounting terminology — Cash, Bank, Accounts Receivable, Accounts Payable, Inventory, Sales Revenue, Purchases, Payroll Expense, Salaries Payable, General Expenses) and 5 customer rows (1 verified via official company website + LinkedIn + exchange filings; 4 supplied and approved directly by the system owner, not web-verified per explicit instruction). **Reliability fix**: `BankAccounts.tsx`'s and `BankAccountExplorer.tsx`'s (dashboard-fetch effect + `ImportsTab`) data-fetching effects included `useT()`'s translator — a new function reference every render — in their dependency array (directly, or via a `useCallback` feeding a `useEffect(() => { cb(); }, [cb])`), so the effect refired on every render, causing an unbounded render→fetch→render loop confirmed live (837+ requests to `/api/bank-accounts/:key/dashboard`, `net::ERR_INSUFFICIENT_RESOURCES` logged 28,071 times, continuous mount/unmount flicker of the whole dashboard shell). Fixed by holding the translator in a `ref` so each effect's dependencies stay stable; every other `useT()`-in-dependency-array occurrence in the frontend (21 candidates) was individually audited and confirmed either not async, not effect-driven on its own identity, or already correctly guarded — none needed the same fix. |
| **Verification** | Bilingual coverage: full frontend re-scan for direct `entity.name` access on the five entities confirmed zero remaining violations outside the two documented, deliberate exceptions. Loop fix: reproduced live against the running dev server via Chrome DevTools (network capture + console) both before and after the fix — before: hundreds of requests/tens of thousands of console errors; after: exactly the React-StrictMode dev-only double-invoke (2 requests), zero console errors, stable rendered UI, confirmed for both the dashboard load and the `ImportsTab` batches tab. |
| **Validation** | Frontend `tsc --noEmit` ✅ · Backend `tsc --noEmit` ✅ · Frontend `vite build` ✅ · Backend `build:back` ✅ (all four re-verified on the feature branch immediately before merge). Backend `vitest` **1848/1848 pass** (one pre-existing test's hardcoded search-clause-length assertion updated from 4→5 to reflect the additive `nameEn` search field — a real, intended consequence of the change, not a regression). Frontend `vitest` **1734/1752 pass** — the 18 failures (8 files) are pre-existing and unrelated, confirmed via import-chain tracing (e.g. a `lib/i18n.ts → stores/uiStore.ts` module-load chain requiring `localStorage` in a non-jsdom test environment, present before this pack) and content inspection (stale assertions against files this pack never touched); none reference the five bilingual entities. |
| **Review** | Read-only architecture review performed first (recommended additive `nameEn` columns over a centralized translation table for this offline/single-user/fixed-two-language app), followed by a read-only coverage audit before the completion pass, and two read-only runtime audits (using live Chrome DevTools tracing) before the reliability fix — no fix was implemented until each root cause was confirmed. Product Owner manual visual review: **APPROVED**. Claude Code Review: clean. Gemini review: **APPROVED** (Gemini Approval Override — explicit project-owner in-conversation statement). |

## Previous Release — English & Unified Tafqeet Engine Pack v1

| Field | Value |
|-------|-------|
| **Package** | English & Unified Tafqeet Engine Pack v1 |
| **Goal** | Consolidate the three previously-duplicated Arabic tafqeet (amount-to-words) implementations into a single canonical engine, add a complete English amount-to-words engine for KWD, and auto-select Arabic/English by document/UI language — while preserving Arabic output exactly and fixing the Employment Contract's live Arabic-in-English-output bug. No business logic, API, database, or permission changes. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-21 |
| **Feature branch** | `feature/english-unified-tafqeet-engine-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `863bd1f` (documentation commit from the prior release) |
| **Feature commit** | `bd36026` |
| **Production merge commit** | `954c0bd` |
| **Stable tag** | `stable-english-unified-tafqeet-engine-pack-v1` → merge `954c0bd` (annotated) |
| **Scope** | 13 files changed (348 insertions / 248 deletions), frontend-only. `frontend/src/lib/tafqeet.ts` is now the single canonical engine: preserves the two pre-existing Arabic phrasings verbatim under private internal names (the "standard" variant used by Cheques/Vouchers/Salary Certificate/Employment Contract, and the "invoice-legacy" variant used only by invoice print templates — these produced genuinely different Arabic text for the same amount before this pack, so both were kept exactly rather than merged into one algorithm) plus a new English engine (zero, negative via "Negative "/"Credit Amount: " prefixes, thousands/millions/billions, correct Kuwaiti Dinar/Fils singular-plural grammar). Public dispatchers `amountToWordsKWD(amount, lang)` and `amountToWordsInvoiceKWD(amount, lang)` replace direct calls at every existing call site; legacy `tafqeetKWD()`/`tafqeet()` names kept as aliases. Deleted `frontend/src/print-templates/utils/tafqeet.ts` (the duplicate file); fixed the resulting dead import in `purchaseOrderAdapter.ts`. `backend/src/core/utils/tafqeet.ts` intentionally left untouched — separate npm-workspace package from the frontend with no shared source boundary, confirmed via grep to have zero production backend call sites (used only by its own backend test suite) — true single-file consolidation across both packages was out of scope (would require new shared-package infrastructure). |
| **Verification** | Wrote a temporary test diffing the new engine against both original implementations across ~4,000 sample amounts (0–9,999,999, decimals, negatives, rounding-boundary cases): 100% byte-for-byte match on both Arabic variants before the duplicate file was removed. |
| **Call sites updated** | Cheques (4 sites — no language toggle exists on this page, so remains Arabic-only, unchanged behavior). Payment Voucher, Receipt Voucher — now read their existing `lang` prop to select the amount-words language (previously ignored it, always Arabic). Salary Certificate — Arabic row switched to the dispatcher; added the previously-missing English "Salary in Words" row to the English branch. Employment Contract — now computes `salWordsAr`/`salWordsEn` separately. Invoice print templates — `adaptInvoice()`/`buildInvoicePrintData()` gained an optional `lang` parameter (default `'ar'`, so all existing callers are 100% unchanged); no invoice template currently has a working language toggle to pass `'en'` through, so this is additive/dormant plumbing, not a new visible feature. |
| **Bug fixed** | Employment Contract's English output (both the English-only render path and the English column of the bilingual default two-column layout) was interpolating raw Arabic tafqeet text (`salWords`, computed once, unconditionally Arabic) directly into English sentences. Now computes and uses genuine English wording in both English contexts; the Arabic column/path is unchanged. |
| **Out of scope (explicitly not touched)** | Quotation, RFQ, Reports, Payslips, Purchase Orders — no amount-in-words feature added to any document that didn't already have one. |
| **Validation** | Frontend `tsc --noEmit` ✅ · Backend `tsc --noEmit` ✅ · Frontend `vite build` ✅ · Backend `build:back` ✅ (all four re-verified post-merge on `production`). 197 relevant tests pass: `lib/__tests__/tafqeet.test.ts` (10), `__tests__/printTemplates/tafqeet.test.ts` (19), `__tests__/printTemplates/invoiceAdapter.test.ts` (19), cheque calibration ×4 suites (102), `employmentContractNewEmployee.test.tsx` (22), `legacyFormPreviewRolloutPhase2.test.tsx` (29), backend `core/utils/__tests__/tafqeet.test.ts` (25), backend `cheques.reliability.test.ts` (22). |
| **Review** | Read-only audit performed first (confirmed no English engine existed, 3 duplicated Arabic engines, and the Employment Contract bug) before implementation began. Product Owner manual visual review: **APPROVED**. Claude Code Review: clean. Gemini final review: **APPROVED**. |

## Previous Release — Full English LTR Layout Pack v1

| Field | Value |
|-------|-------|
| **Package** | Full English LTR Layout Pack v1 |
| **Goal** | When the application language is English, the entire UI automatically switches from RTL to a native Left-to-Right enterprise layout — no manual toggle, layout follows the existing language selection. Arabic mode stays exactly as it is today (RTL). Scope: main app layout, sidebar (moves left), top navigation, dashboard, forms, drawers, dialogs, tables, reports, search, filters, tabs, menus, toolbars, and Print Preview UI (not printed documents themselves). |
| **Release status** | RELEASED |
| **Release date** | 2026-07-21 |
| **Feature branch** | `feature/full-english-ltr-layout-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `38ed372` (AI_CONTEXT.md self-referencing documentation-commit hash fill-in) |
| **Feature commit** | `56e7e18` |
| **Production merge commit** | `f40579e` |
| **Stable tag** | `stable-full-english-ltr-layout-pack-v1` → merge `f40579e` (annotated) |
| **Scope** | 53 files changed (97 insertions / 127 deletions — net code reduction), frontend-only. `uiStore.applyLang()` now syncs both `document.documentElement.dir` and `.lang` on every language change and at boot. `ExplorerKit.tsx`'s shared `Drawer`/`Dialog` primitives (the app-wide detail-panel/modal building blocks, reused by `FormDialog`'s explorer skin and directly by most "explorer" pages) made language-aware instead of hardcoding `dir="rtl"`. ~50 hardcoded `dir="rtl"` overrides removed from 36 page/component roots, tables, drawers, dialogs, and global error/loading shells (`RootErrorBoundary`, `PageLoader`, `ErrorBoundary`) so they inherit the correct ambient direction from `<html>` instead of forcing RTL always. Physical CSS (`direction: rtl`, physical `text-align`/`margin`/`padding` left-right, `left`/`right` positioning) converted to CSS logical properties across 17 stylesheets (`explorer-kit.css` + 16 page/component stylesheets: dashboard, AI assistant, Accounting, BankReconciliation, BankAccountExplorer, Integrations, Inventory, Invoices, Prices, Reports, DataImport, financial.css, etc.) — every conversion preserves the exact current RTL-shipping visual appearance (verified via the RTL-primary mapping: physical `right`→logical `start`, physical `left`→logical `end`, since the app ships RTL by default) while enabling correct mirroring in LTR. |
| **Deliberately preserved / out of scope** | Money/numeric-cell LTR isolation (`.money-cell`, debit/credit/balance columns, `direction: ltr; unicode-bidi: isolate`) and Recharts chart containers (Recharts has no RTL axis support) — unchanged in both languages, as before. `DateCalendarPicker`'s always-LTR calendar popover — pre-existing, unrelated to app language, untouched. Official printed/legal documents — `ReportPrint.tsx`, `PayrollPayslip.tsx`, the cheque calibration test sheet, and the cheque amount-in-words (`.chqx-tafqeet`, legally always Arabic) — intentionally excluded per the pack's own "Print Preview UI, not printed documents" scope; these stay Arabic/RTL regardless of UI language. `print-templates/studio/TemplateStudioEditor.tsx`, `PrintTemplateSelector.tsx`, and `WysiwygPreviewPocDialog.tsx` — pre-existing Arabic-only tooling never wired into the `useT()`/i18n system; flipping only their `dir` without translating their hardcoded strings would have produced a broken half-translated UI, so left as-is (out of scope for a layout-only pass). `pages/DocumentVerify.tsx` — public unauthenticated route (`/verify/:uuid`), not wired to app language state. Settings.css's bilingual AR/EN dictionary-editor columns — alignment tied to each column's fixed content language, not ambient UI direction. |
| **Validation** | Frontend `tsc --noEmit` ✅ · Backend `tsc --noEmit` ✅ · Frontend `vite build` ✅ (all three re-verified post-merge on `production`). Key-parity check: `frontend/src/lib/i18n.ts` — 3,879 Arabic keys / 3,879 English keys, zero missing. Static self-review of every physical→logical CSS mapping performed (no visual-regression tooling exists in this repo); no rendered/visual verification claimed by Claude — see the standing Visual Verification Policy. |
| **Review** | Product Owner manual visual review: **APPROVED**. Claude Code Review: completed (implementation self-reviewed against the exploration map before commit; diff spot-checked post-merge). Gemini final review: **APPROVED** (Gemini Approval Override — explicit project-owner in-conversation statement). |
| **No changes to** | Business logic, database schema, APIs, permissions, calculations, or workflows. |

## Previous Release — English Localization Completion Pack v2

| Field | Value |
|-------|-------|
| **Package** | English Localization Completion Pack v2 (bundles the previously-unreleased Pack v1a as its prerequisite) |
| **Goal** | Eliminate every remaining hardcoded Arabic UI string across the English-mode interface, reusing the approved ERP terminology dictionary (Pack v1) and the existing `useT()`/`i18n.ts` system. English localization only — Arabic UI, business logic, API, DB, routes, permissions, CSS, layout, RTL/LTR behavior, charts, print logic, and calculations are all untouched. Customer/supplier/employee names, project/equipment names, notes, and other user-entered or backend-tied business data are intentionally left in Arabic. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-21 |
| **Feature branch** | `feature/employee-financial-position-dashboard-v1` (kept — pushed, not deleted); localization work itself was developed on `feature/english-localization-completion-pack-v1a` and `feature/english-localization-completion-pack-v2` (both kept, pushed) |
| **Baseline** | `production` @ `a3660b8` (ERP Terminology Standardization Pack v1 documentation-commit-hash fill-in) |
| **Feature commit** | `d226365` (Pack v2 completion) on top of `ce187ac` (Pack v1a completion) |
| **Production merge commit** | `77c4f07` |
| **Stable tag** | `stable-english-localization-completion-pack-v2` → merge `77c4f07` (annotated) |
| **Scope** | 138 files changed vs. previous production baseline (10,689 insertions / 5,975 deletions) — full-app localization pass (Banking: BankReconciliation, BankAccounts, BankAccountExplorer, BankStatementImport, BankSalaryAnalytics, PayrollBankImport/Export; Financial Center: statements, GL, trial balance, aging, journal, period lock; Reports; Accounting; Integrations Hub; Employee Entitlements Center; Employment Contract; Cheque Calibrator + Wizard; invoice/quotation fast-entry flows; generic Excel importer; HR print-forms; ResourcePage/Prices/Cheques residuals) plus incidental dead-code cleanup and a numeric employee-code sort fix carried on the same feature branch. `frontend/src/lib/i18n.ts` grew from 1,211 to **3,879 keys in both `DICT.ar` and `DICT.en`** (net +2,668 keys, key parity confirmed, zero duplicate keys, zero existing key values altered — purely additive to the dictionary). |
| **Validation** | Frontend `tsc --noEmit` ✅ · Backend `tsc --noEmit` ✅ · Frontend `vite build` ✅ (both on the feature branch pre-merge and again on `production` post-merge). Key parity 3879 ↔ 3879. Residual-Arabic sweep across all touched files: every remaining Arabic-script line falls into an established, legitimate exclusion (fallback dictionaries always routed through `t()`/`translate` at render time, backend-tied business-data codes, bilingual `labelAr`/`labelEn` configs, print-document/letterhead content, AI-assistant prompts, test fixtures, language-picker native names) — no unrouted raw Arabic UI text found. Merge into `production` was conflict-free (fast-forward-able ancestry; `--no-ff` used to preserve full history). |
| **Review** | Product Owner manual visual review: **APPROVED**. Gemini final review: **APPROVED**. |
| **Known follow-up (separate, unrelated bug — not in this pack's scope)** | A set of HR/print-document pages (`LeaveRequest.tsx`, `PaymentVoucher.tsx`, `Quotation.tsx`, `PurchaseRequest.tsx`, `ReturnToWork.tsx`, `Resignation.tsx`, `ReceiptVoucher.tsx`, `SalaryAdvance.tsx`, `SalaryCertificate.tsx`, `ToWhomItMayConcern.tsx`, `EmployeeWarning.tsx`, `EmploymentContract.tsx`) maintain their own page-local `lang` state (defaulting to `'ar'`) decoupled from the global `useUI().lang` toggle; `EmploymentContract.tsx` and `InvoicePreview.tsx` don't wire even that local state through to their print templates. Pre-existing, found during a read-only audit of this pack; not fixed here.

## Previous Release — ERP Terminology Standardization Pack v1

| Field | Value |
|-------|-------|
| **Package** | ERP Terminology Standardization Pack v1 |
| **Goal** | Establish one professional, production-grade English ERP terminology standard for the entire application — standardize inconsistent English UI wording against Microsoft Dynamics 365 / SAP / Oracle Fusion / Odoo conventions, remove duplicate terminology for the same concept, and codify the result as a permanent source-of-truth dictionary. English localization only; Arabic production baseline untouched. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-21 |
| **Feature branch** | `feature/erp-terminology-standardization-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `75d454e` (Employee & Equipment Tables Visual Consistency Pack v1 documentation-commit-hash fill-in) |
| **Feature commit** | `68c0949` |
| **Production merge commit** | `fa57fb4` |
| **Stable tag** | `stable-erp-terminology-standardization-pack-v1` → merge `fa57fb4` (annotated) |
| **Checkpoint tag** | `pre-erp-terminology-standardization-pack-v1` (production baseline `75d454e`) |
| **Scope** | English (`en`) values only in `frontend/src/lib/i18n.ts` — **25 strings changed (25 insert / 25 delete)**. Adds `docs/ERP_TERMINOLOGY_STANDARD.md` (the permanent English ERP terminology source of truth). Arabic (`ar`) block byte-for-byte unchanged; key parity **1211 ↔ 1211** (no missing / orphan / duplicate keys). |
| **Terminology standardized** | Auth: `Logout`→`Sign Out`; audit `Login`/`Logout`→`Sign In`/`Sign Out`. Customer canonical: `Client Transport`→`Customer Transport`. Invoice canonical: `Invoices & Claims`→`Invoices`. Receivables canonical: `Uncollected Invoices` + dashboard `Overdue Invoices:` chip → `Outstanding Invoices`. Create verbs unified to `New X` (Customer / Supplier / Vehicle / Employee / Expense). Person-routed expense categories → `Expense via X` (نظير transliteration corrected Natheer→Nazeer). Titles: `Accounting Management`→`Accounting`, `Cheques Management`→`Cheque Management`. Accuracy: `Transaction`→`Transfer No.`, `Download Empty Template`→`Download Blank Template`. Company legal name applied to payslip + cheque: `Al Manar Al Duwaliya Company L.L.C`; login brand normalized `Al-Manar`→`Al Manar`. Spelling standard: US English + retained `Cheque` (Gulf banking exception). |
| **Validation** | Frontend `tsc --noEmit` ✅. Arabic block byte-identical to pre-release (0 diff hunks below the `en` block; EOL-normalized full-string compare identical). Key parity 1211 ↔ 1211, no duplicate / orphan / missing keys. Net production change vs `origin/production` = exactly 2 files (`i18n.ts` +25/−25; new standard doc). **No** business logic / API / DB / Prisma / routes / permissions / calculations / CSS / component / layout / RTL-LTR / print-logic change. |
| **Review** | Independent Claude Opus code review: **APPROVED FOR RELEASE**. Product Owner manual visual review: **APPROVED**. Gemini final review: **APPROVED**. |

## Previous Release — Employee & Equipment Tables Visual Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employee & Equipment Tables Visual Consistency Pack v1 |
| **Goal** | Executive-grade visual polish for the Employees explorer table (single-line name cells, label-free soft-tint expiry columns, frozen Employee Number + Arabic Name), a numeric sorting fix for Employee Number, a frozen-cell background drift fix, and migration of the Equipment table's Registration Remaining column onto the same shared visual system as Employee's expiry cells. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-20 |
| **Feature branch** | `feature/employee-equipment-tables-visual-consistency-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `e52dc75` (immediately after the Employee Financial Position Dashboard v1 documentation-commit-hash fill-in) |
| **Feature commit** | `f46d203` |
| **Production merge commit** | `db6a8a1` |
| **Stable tag** | `stable-employee-equipment-tables-visual-consistency-pack-v1` → merge `db6a8a1` (annotated) |
| **Checkpoint tag** | `pre-employee-equipment-tables-visual-consistency-pack-v1` (production baseline `e52dc75`) |
| **Employee table polish** | Single-line, ellipsis + tooltip Arabic (`emp-name--strong`) and English (`emp-name--en`, LTR) name cells. Profession and nationality reverted to plain text (an initial iteration added a profession badge + nationality flag + textual expiry status labels; both were removed after explicit user feedback in favor of a calmer, label-free ExplorerKit look — final state ships no badge/flag/label anywhere on this table). The four expiry columns (residency, passport, license, vehicle license) share one `ExpiryCell`: a soft pastel tint + a thin colour accent stripe communicate status silently, with the date as the only visible text. Frozen identity columns limited to Employee Number + Arabic Name (`code`/`fullName`, `frozen: true` on the shared `Column` type; English Name deliberately unfrozen in a refinement pass) — `table-layout: fixed` gives exact sticky offsets, RTL-correct shadow separator on the last frozen column. Column widths rebalanced (names widened; Civil ID/profession/nationality/plate/passport narrowed), denser row rhythm, a stronger-but-quiet row hover (background-only, no scale/shadow animation). |
| **Employee Number numeric sort fix** | `code` (الرقم الوظيفي) is a digit string; SQLite/Prisma sorted it lexically via the DB `orderBy` whitelist (`1, 10, 11, 12, 2` ascending). Removed `code` from `employees.service.ts`'s DB sort whitelist and routed it through the **existing shared** `sortRowsInMemory` numeric collator (`backend/src/core/utils/sort.ts`, the same pattern already used by the payroll/financial grids) over the full filtered result set before the page is sliced — no duplicate/parallel sort logic, no API/Prisma/DB schema change. 3 regression tests added asserting numeric ascending, numeric descending, and that the DB query fetches the full set (no `skip`/`take`) when sorting by `code`. |
| **Frozen cell background consistency fix** | The frozen `code`/Arabic-name cells need an opaque background (they can't show the row's translucent hover/selected tint through, unlike the non-frozen English Name cell), so an equivalent opaque overlay is repainted on hover/selected/focus-visible. That overlay used independently hand-picked percentages (8% hover, 12% selected) instead of the actual row-level tint values (7% hover from this table's own stronger-hover override, 10% selected/focus-visible from ExplorerKit's shared `--xpl-faint` token) — small drift that made the frozen cells visibly diverge from the non-frozen cell in every non-idle state. Fixed by introducing single-source `--emp-hover-pct: 7%` / `--emp-selected-pct: 10%` tokens that both the row-level translucent tint AND the frozen opaque overlay now read from, so they cannot drift apart again; also corrected the frozen focus-visible rule, which had wrongly reused the hover token instead of the selected token. CSS-only. |
| **Shared ToneCell + Equipment migration** | Extracted the Employee expiry-tint system into a new shared `ToneCell` component + `toneCell.css` (`frontend/src/components/explorer/`) — the single green/amber/orange/red status/remaining-period system for any explorer table, not a per-module copy. Employee's `ExpiryCell` now delegates to `ToneCell` (zero visual change; re-verified via the full test suite + build after the refactor). Equipment's Registration Remaining column (`regRemaining`) migrated from the old loud `.pill` badge (saturated background, bold text, `⚠` icon prefix) onto the same `ToneCell` system, reading the exact same `registration.expired`/`registration.expiringSoon` flags the old pill used — no expiry calculation change. Equipment's WORKING/NOT_WORKING `status` column was intentionally left on the classic `.pill` (Employee's own `status` column — ACTIVE/ON_LEAVE/TERMINATED — also still uses the classic pill; keeping both tables' status columns on the same reference is what actually stays internally consistent). |
| **Release scope** | **11 files, +427/−31** (5 added, 6 modified). Modified: `backend/src/modules/employees/employees.service.ts`, `backend/src/modules/employees/__tests__/employees.sort.test.ts`, `frontend/src/components/DataTable.tsx`, `frontend/src/components/SortableHeader.tsx`, `frontend/src/config/modules.tsx`, `frontend/src/pages/ResourcePage.tsx`. Added: `frontend/src/components/employees/employeeCells.tsx`, `frontend/src/components/employees/employee-table.css`, `frontend/src/components/equipment/equipmentCells.tsx`, `frontend/src/components/explorer/ToneCell.tsx`, `frontend/src/components/explorer/toneCell.css`. |
| **Validation** | Backend `tsc --noEmit` ✅ · backend build (`tsc` + `tsc-alias`) ✅ · backend `vitest` **1848/1848 pass** ✅ (includes the 3 new numeric-sort regression tests). Frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ · frontend `vitest` **1775/1776 pass** — the 1 failure (`routerFutureFlags.test.tsx`) is a **pre-existing, unrelated** hardcoded `lazy()`-import counter already stale against untouched `App.tsx`; confirmed to reproduce identically on vanilla `production` before this pack's changes were applied. All checks run both pre-merge (on the isolated feature branch, in a dedicated git worktree with its own `npm install` + Prisma client generation) and re-verified on the merged `production` HEAD. |
| **Business logic verification** | No business logic, API, Prisma schema, database, routing, filtering, or pagination change, **except** the Employee Number sort execution path (server-side: DB `orderBy` → in-memory numeric sort of the same filtered rows before paging — same response shape, same pagination contract, same permissions). No accounting/GL logic touched (neither table is financial). Equipment's registration expiry calculation (`expired`/`expiringSoon`/`remainingText`) is read verbatim from the existing API response — zero calculation change. |
| **Review** | Product Owner manual visual review: **APPROVED**. Gemini final review: **APPROVED**. |

## Previous Release — Employee Financial Position Dashboard v1

| Field | Value |
|-------|-------|
| **Package** | Employee Financial Position Dashboard v1 |
| **Goal** | Presentation-only redesign of the top of `EmployeeEntitlementsCenter.tsx` into an executive financial dashboard (Financial Position, Health Indicators, Service Analytics), preserving every calculation and business rule exactly as before. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-20 |
| **Feature branch** | `feature/employee-financial-position-dashboard-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `010f218` (immediately after the Invoice Confirmation Dialog Layering Fix v1 documentation-commit-hash fill-in) |
| **Feature commit** | `df8be37` |
| **Production merge commit** | `9d0c6ff` |
| **Stable tag** | `stable-employee-financial-position-dashboard-v1` → merge `9d0c6ff` (annotated) |
| **Financial Position card** | One `SectionCard` headline ("إجمالي الالتزام الحالي") plus two executive `MetricCard`s — Leave Allowance and End of Service — summed directly from the existing legal engine (`r.leaveAllowanceValue + eosAmount`, both already computed server-side in `entitlements.calc.ts`). No ledger-derived or accounting-style figure is shown in the final release: a "Previously Paid"/"Remaining Expected Liability" pair (derived from `sum(ledger[].amount)`) was implemented in an earlier iteration of this same feature branch and then deliberately removed via a dedicated follow-up correction, because the append-only historical entitlements ledger must never be presented as an actual paid/accounting balance — future ledger entries (settlements, adjustments, manual entries, historical imports) could make that sum misleading. |
| **Health Indicators panel** | Compact grid reusing the existing `.ent-warning` styling, derived purely from data already in the API response (leave eligibility, data completeness, last-disbursement recency, high leave balance), merged with the existing `buildWarnings()` output verbatim — no new business rule introduced, no existing warning dropped. |
| **Service Analytics grid** | Consolidates hire date, service duration, approved wage, legal accrual, leave balance/used, holidays/sick excluded, and advances count into one responsive `auto-fit` `MetricCard` grid — same values as the previous layout, each now appearing exactly once (removes the prior duplication between the top info strip and the KPI card rows). |
| **Release scope** | **2 files, +253/−131** (0 added, 2 modified: `frontend/src/pages/EmployeeEntitlementsCenter.tsx`, `frontend/src/pages/EmployeeEntitlementsCenter.css`). |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend `vite build` ✅ · backend `tsc --noEmit` ✅ · backend build (`tsc` + `tsc-alias`) ✅ — all four, both pre-merge and on merged `production` HEAD. Zero backend files touched (backend checks pass because the feature never touches backend code, not because they were skipped). Gemini final review: **APPROVED**. |
| **Business logic verification** | No business logic, legal calculation, accounting/GL logic, API, or database schema change. `entitlements.calc.ts`, `employees.service.ts`, and the `GET /employees/:id/entitlements` route are untouched — every displayed number maps 1:1 to a pre-existing field of that same API response. Built entirely from ExplorerKit (`SectionCard`/`MetricCard`) and its `--xpl-*` design tokens, RTL, responsive at 900px/700px breakpoints. |

## Previous Release — Invoice Confirmation Dialog Layering Fix v1

| Field | Value |
|-------|-------|
| **Package** | Invoice Confirmation Dialog Layering Fix v1 |
| **Goal** | Bug fix: the invoice save-confirmation dialog introduced by Invoice Creation Reliability & Confirmation Pack v1 rendered behind the Create Invoice window instead of above it, making it unusable. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-20 |
| **Feature branch** | `feature/invoice-confirmation-dialog-layering-fix-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `db2de18` (immediately after the Invoice Creation Reliability & Confirmation Pack v1 documentation-commit-hash fill-in) |
| **Feature commit** | `846491e` |
| **Production merge commit** | `96651b3` |
| **Stable tag** | `stable-invoice-confirmation-dialog-layering-fix-v1` → merge `96651b3` (annotated) |
| **Root cause** | The confirmation dialog (ExplorerKit `Dialog`, `.xpl-dialog-overlay`, `z-index: 410`) and the Create Invoice window (legacy `Modal`, `.modal-overlay`, `z-index: 500`) are both non-portaled `position: fixed` overlays in the same stacking context. The app's documented z-index ladder deliberately puts the legacy `Modal` *above* ExplorerKit `Dialog`/`Drawer` (for the reverse case: a Modal-style confirmation over an ExplorerKit-hosted form) — `CreateInvoice.tsx` needed the opposite relationship, which the existing hierarchy didn't support, so the Dialog painted underneath the Modal despite mounting later in the DOM. No portal or transform/filter/contain stacking-context trap was involved — verified clean on every ancestor. A related defect was also found: both `Modal` and `Dialog` register independent `document`-level Escape listeners, so with the confirmation open a single Escape press closed both layers at once instead of just the top-most one. |
| **Fix** | Added an opt-in `elevated` prop to ExplorerKit's `Dialog` component (`ExplorerKit.tsx`), backed by a new centralized `--z-dialog-elevated: 510` token in the existing documented z-index ladder (`theme.css`: 500 Modal → 510 elevated Dialog → 550 Popover → 600 Tooltip → 9999 toasts) — no arbitrary z-index value, every other `Dialog` usage across the app is unaffected (prop defaults to `false`). `CreateInvoice.tsx`'s confirmation dialog now passes `elevated`, and the underlying `Modal`'s `onClose` is guarded to a no-op while the confirmation is open, so Escape/backdrop/× only ever affects the active top-most dialog. |
| **Release scope** | **4 files, +25/−2** (0 added, 4 modified: `frontend/src/components/explorer/ExplorerKit.tsx`, `frontend/src/components/explorer/explorer-kit.css`, `frontend/src/app/theme.css`, `frontend/src/pages/CreateInvoice.tsx`). |
| **Validation** | frontend `tsc --noEmit` ✅ (pre-merge and on merged `production` HEAD) · frontend `vite build` ✅ (pre-merge and on merged HEAD) · zero backend files touched. Gemini final review: **APPROVED**. |
| **Business logic verification** | No business logic, accounting/GL logic, or database schema change — pure frontend stacking-order/CSS-variable fix plus one small guard on an event handler. Focus trap, Tab-cycling, Escape (now correctly scoped to the top-most dialog), and RTL are all unchanged, still driven by the shared `useFocusTrap` hook. |

## Previous Release — Invoice Creation Reliability & Confirmation Pack v1

| Field | Value |
|-------|-------|
| **Package** | Invoice Creation Reliability & Confirmation Pack v1 |
| **Goal** | Two reliability/UX guarantees for invoice creation: (1) an invoice issue date can never be in the future, enforced at every layer so it cannot be bypassed via direct API calls; (2) a mandatory confirmation step summarizing the invoice before it is actually created, so a save click can never silently create the wrong invoice. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-20 |
| **Feature branch** | `feature/invoice-creation-reliability-confirmation-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `a4e1a16` (immediately after the Global Smart Overflow Tooltip Pack v1 documentation-commit-hash fill-in) |
| **Feature commit** | `b495628` |
| **Production merge commit** | `ac2b6bd` |
| **Stable tag** | `stable-invoice-creation-reliability-confirmation-pack-v1` → merge `ac2b6bd` (annotated) |
| **Future-date prevention** | One shared `isNotFutureIssueDate` Zod refine (`backend/src/modules/invoices/invoices.schema.ts`) applied to both `createInvoiceSchema` and `updateInvoiceSchema` — `issueDate <= endOfDay(now)`, reusing the same `endOfDay` helper the invoices list-filter already uses. Enforced by the existing `validate` middleware ahead of every create/update route, so no entry point (standard form, edit form, fast-entry dialog, or a direct API call) can bypass it. Mirrored client-side: `max={todayDateOnly()}` on the issue-date picker plus an early pre-save check with a clear Arabic message (`error.future_issue_date`) in `CreateInvoice.tsx`, `EditInvoice.tsx`, and `invoiceFastEntry.validateInvoiceRow()` — pure UX responsiveness, the backend refine is the actual guarantee. Live-verified: a future date is rejected on both create and update with `"تاريخ الفاتورة لا يمكن أن يكون في المستقبل"`; today and any past date are still accepted. |
| **Save confirmation dialog** | New step in `CreateInvoice.tsx`'s save flow: "حفظ" now validates and stages the payload instead of posting immediately, then opens an ExplorerKit `Dialog`/`DialogSection`/`Button`/`DrawerField` confirmation (RTL, focus-trapped, Escape/backdrop-cancel — all pre-existing ExplorerKit behavior, no new dialog/accessibility code) summarizing رقم الفاتورة، العميل/المورّد، تاريخ الفاتورة، عدد البنود، الإجمالي الكلي. `POST /invoices` fires only from the dialog's "إنشاء الفاتورة" button; cancelling returns to the still-editable form with nothing sent. Scoped to the standard create flow only — the fast-entry accelerator (`InvoiceFastEntryDialog.tsx`) intentionally keeps its no-confirmation, rapid-entry design (it only gained the future-date guard, per above), since a per-row confirmation would defeat its purpose. |
| **Prior test-data cleanup** | The test invoice used to investigate the "audit log without visible invoice" case (`MN-INV-2026-0221`, id 49) and every artifact it produced (2 `InvoiceItem` rows via cascade, 1 `JournalEntry` + 2 `JournalEntryLine` rows, 1 `AuditLog` row) were permanently deleted in one atomic transaction ahead of this release, verified to leave zero orphans and zero impact on any other invoice or on the unrelated `AuditLog` rows that happen to share the same numeric id under a different module (`expenses`). Not part of this release's commit — a direct, one-off data operation performed and verified separately. |
| **Release scope** | **6 files, +97/−21** (0 added, 6 modified: `backend/src/modules/invoices/invoices.schema.ts`, `frontend/src/pages/{CreateInvoice,EditInvoice}.tsx`, `frontend/src/pages/invoiceFastEntry.ts`, `frontend/src/components/InvoiceFastEntryDialog.tsx`, `frontend/src/lib/i18n.ts`). |
| **Validation** | backend `tsc --noEmit` ✅ (pre-merge and re-verified on merged `production` HEAD) · frontend `tsc --noEmit` ✅ (same) · frontend `vite build` ✅ · backend `vitest` invoices module — **160/160 tests pass**, zero regressions · live Zod-schema verification of the future-date refine (accept/reject cases above). Manual visual review: **APPROVED** (Product Owner). Gemini final review: **APPROVED**. |
| **Business logic verification** | No business logic, backend calculation, accounting/GL/posting logic, inventory logic, tax logic, or database schema change of any kind — `invoices.calc.ts`, `invoices.accounting.ts`, and every create/update service method are untouched; only a Zod-schema-level date guard plus frontend UI/confirmation-flow changes were made. Database schema: unchanged (no file touched, no migration). Existing API contracts: unchanged except the intentional additive validation rejection on `issueDate`. Existing permissions: unchanged. |

## Previous Release — Global Smart Overflow Tooltip Pack v1

| Field | Value |
|-------|-------|
| **Package** | Global Smart Overflow Tooltip Pack v1 |
| **Goal** | Replace the app's ad-hoc, per-component reliance on the native `title=` attribute for truncated text with a single reusable global tooltip system: any element whose rendered text is actually clipped (ellipsis or line-clamp) shows its full text in an enterprise-quality ExplorerKit-styled tooltip on hover/focus, with zero page-level integration required. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-20 |
| **Feature branch** | `feature/global-smart-overflow-tooltip-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `2edd447` (immediately after the Employee Entitlements Executive Redesign v1 documentation-commit-hash fill-in) |
| **Feature commit** | `41f93cf` |
| **Production merge commit** | `ce106b4` |
| **Stable tag** | `stable-global-smart-overflow-tooltip-pack-v1` → merge `ce106b4` (annotated) |
| **Architecture** | One provider component, `frontend/src/components/tooltip/GlobalOverflowTooltip.tsx`, mounted exactly once in `main.tsx` (sibling to `<App />`). It attaches a single delegated `pointerover`/`pointerout`/`focusin`/`focusout`/`keydown` listener set on `document` (plus `scroll`/`resize` on `window`) — no per-element listeners, no `ResizeObserver`, no polling, no upfront DOM scan. Detection (`overflowDetection.ts`) walks up to 5 ancestors from the hovered/focused element on-demand, looking for the nearest one whose `scrollWidth/scrollHeight` exceeds its `clientWidth/clientHeight` while `overflow` is computed `hidden`/`clip` (this guard is what excludes intentionally-scrollable containers, e.g. virtualized lists, which use `auto`/`scroll`) and whose own height is under a 160px sanity cap (excludes large scroll-locked containers like open Drawers/Dialogs). Displayed text priority: explicit `data-tooltip-text` override → the element's own `title` attribute (the app's pre-existing convention, e.g. DataTable's `.dt-truncate` cells) → `textContent`. Opt-out via `data-tooltip-disable` on any ancestor. |
| **Native title interplay** | If the matched element has a `title` attribute, it is removed for the duration of the custom tooltip (stashed in `data-tooltip-native-title`) and restored on hide — so the two tooltip mechanisms never show simultaneously, and the app's existing `title`-based fallback (64+ pre-existing usages) still works unmodified if JavaScript is ever unavailable. No page (DataTable included) required any code change to gain coverage. |
| **Tooltip design** | `GlobalOverflowTooltip.css` — white surface (`var(--surface)`, dark-mode-aware via the existing `html[data-theme="dark"]` tokens), 1px `var(--border)`, `var(--shadow-lg)`, 8px radius, `role="tooltip"` + `aria-describedby` wiring for keyboard accessibility, RTL/LTR-aware text alignment (`dir` attribute set via Arabic/Hebrew Unicode-range detection or the target's computed `direction`), 120ms fade-in respecting `prefers-reduced-motion`, `pointer-events: none`, viewport-clamped + auto-flip positioning computed in a `useLayoutEffect` (after the tooltip's real rendered size is known, so there is no visible jump and it never leaves the viewport), `@media print { display: none }`. New `--z-tooltip: 600` token added to `theme.css` (documented in the existing z-index comment block — above Popover 550, below toasts 9999). |
| **Release scope** | **5 files, +308/−1** (3 added: `components/tooltip/{GlobalOverflowTooltip.tsx,GlobalOverflowTooltip.css,overflowDetection.ts}`; 2 modified: `main.tsx` — mounts the provider, `app/theme.css` — adds `--z-tooltip` token). |
| **Validation** | frontend `tsc --noEmit` ✅ (both pre-merge and re-verified on the merged `production` HEAD) · frontend `vite build` ✅ · backend untouched (no backend file changed, re-verification not applicable). Manual visual review: **APPROVED** (Product Owner). |
| **Business logic verification** | No business logic, backend, API, database, calculation, or workflow change of any kind — this is a pure frontend UX/presentation addition. Database schema: unchanged (no file touched). Existing API contracts: unchanged (zero backend files touched). Existing permissions: unchanged. |

## Previous Release — Employee Entitlements Executive Redesign v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Executive Redesign v1 |
| **Goal** | Visual-only redesign of the Employee Entitlements Center page (`pages/EmployeeEntitlementsCenter.tsx`) to Microsoft Dynamics 365 / SAP Fiori / Oracle Fusion Cloud ERP quality, from an approved HTML mockup — preserving every field, section, value, calculation, workflow, and piece of terminology exactly, and building entirely on the existing ExplorerKit design system (no new components, no parallel UI system). |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/employee-entitlements-executive-redesign-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `6952c4b` (immediately after the Al-Ojairi Integration Pack v1 documentation commit) |
| **Feature commit** | `cf2f3be` |
| **Production merge commit** | `56f18d4` |
| **Stable tag** | `stable-employee-entitlements-executive-redesign-v1` → merge `56f18d4` (annotated) |
| **Release scope** | **3 files, +202/−30** (0 added, 3 modified: `pages/EmployeeEntitlementsCenter.tsx`, `pages/EmployeeEntitlementsCenter.css`, `components/employee/EmployeeEntitlementsTab.css`). **Executive header:** subtle radial tonal accent wash + larger title (`.entc-page .xpl-exec-header`, scoped), employee info strip restyled into a 3-field label-over-value layout with vertical dividers (`.entc-info-row`). **KPI hierarchy:** the same 8 `MetricCard`s (unchanged icon/tone/value/sub props) regrouped into new `.entc-kpis-primary` (4 larger tiles — الاستحقاق القانوني الإجمالي، رصيد الإجازة الحالي، قيمة بدل الإجازة، مكافأة نهاية الخدمة) and `.entc-kpis-secondary` (4 denser tiles — عطل رسمية مستثناة، إجازة مرضية مستثناة، الإجازة المستخدمة، إجمالي الدفعات المقدَّمة); the shared `.ent-kpis` class used by the employee-drawer summary tab is untouched. **Leave balance settlement:** reconciliation connectors (`.ent-recon-arrow`) restyled from floating arrow glyphs into chained circular badges; the net-used subtotal row gets a weight-only emphasis via a new `.ent-recon-step--subtotal` modifier (no new color). **Advance payment settlement:** new `.ent-fields--flow` modifier gives the 3-field summary dashed row dividers and a highlighted final-balance row. **Historical ledger:** new `.entc-table--journal` modifier gives the disbursed-entitlements table a journal-style header tint and hover; leave-history and settlement-history tables unchanged. **Timeline & empty states:** page-scoped density/icon-tile polish only (`.entc-page .xpl-timeline*`, `.entc-page .xpl-empty*`) — the existing per-event-type tone system in `buildTimeline()` (entitlementsShared.tsx) already gave each event a distinct visual identity and was not touched. **Collapsible sections** (تفاصيل إضافية والاحتساب / سجل الإجازات / سجل الدفعات المقدَّمة على الإجازة): refined icon tile, hover state, and a reduced-motion-safe fade-in on open (`.entc-collapsible`), still native `<details>/<summary>` — no interaction-model change. Every CSS rule is scoped either under `.entc-page` or to classes verified exclusive to this page's own rendering (`.ent-recon-*`, `.ent-fields`, `.ent-eos-*`, `.ent-calc-*`, `.entc-collapsible`) — no shared/global `.xpl-*` ExplorerKit rule was modified, so no other page using the same components changed appearance. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend build ✅ (page CSS chunk +4.02 kB / 1.22 kB gzip; no new JS logic, negligible bundle impact) · backend untouched (no backend file changed, re-verification not applicable). Manual visual review: **APPROVED** (Product Owner). |
| **Business logic verification** | Rule 2: unchanged. Rule 5: unchanged. EOS calculations: unchanged. Leave Settlement: unchanged. Historical Ledger: unchanged. Database schema: unchanged (no file touched). Existing API contracts: unchanged (zero backend files touched). Existing permissions: unchanged. Existing business logic/workflows: unchanged — same values, same labels, same section order, same terminology throughout. |

## Previous Release — Al-Ojairi Integration Pack v1

| Field | Value |
|-------|-------|
| **Package** | Al-Ojairi Integration Pack v1 |
| **Goal** | Complete the Kuwait Holiday Intelligence architecture by integrating a real Hijri holiday data source into the existing Holiday Engine — `HolidayEngine` becomes capable of generating expected Kuwait Hijri holidays from a real, offline, deterministic data source, without changing any legal calculation, database schema, permission, or existing API contract, and without redesigning the Kuwait Holiday Intelligence Pack v1 architecture. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/al-ojairi-integration-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `2c96a11` (immediately after the Historical Ledger Pack v1 documentation commit) |
| **Feature commit** | `43cd699` |
| **Production merge commit** | `70fa096` |
| **Stable tag** | `stable-al-ojairi-integration-pack-v1` → merge `70fa096` (annotated) |
| **Architecture overview** | Completes the 3-layer pipeline the Foundation + Kuwait Holiday Intelligence Pack v1 established: **data source** (new, pure/offline) → **provider** (`HijriHolidayProvider`, unchanged interface shape, real implementation) → **HolidayEngine** (Part 7 — now the single system-wide consumer of holiday providers) → **planner/executor/UI** (unchanged orchestration, now fed real data + validation warnings instead of an always-empty stub). |
| **Data source** | `holidays/hijriCalendarConversion.ts` — a real, deterministic, **fully offline** Hijri↔Gregorian date conversion (the tabular/civil Islamic calendar, commonly called the "Kuwaiti algorithm": fixed epoch Julian Day 1948440 + the standard 11-leap-years-per-30-year cycle, composed with the standard Fliegel & Van Flandern Julian-Day↔Gregorian conversion). No network call, no bundled dataset, **no hardcoded or guessed future Gregorian date** — only fixed Hijri month/day *facts* (`kuwaitHijriHolidayDefinitions.ts`, e.g. "1 Shawwal = Eid Al-Fitr") are constants; every Gregorian date is computed on demand. Verified against the well-known public epoch correspondence (1 Muharram 1 AH = 19 July 622 CE) and structural invariants (11 leap years/30-year cycle, monotonicity, round-trip integrity). This is the same *class* of calculation the real Al-Ojairi almanac performs — an astronomical/arithmetic prediction ahead of the official moon-sighting announcement — which is exactly why every holiday it produces carries `status: EXPECTED_ALOJAIRI`, never `OFFICIAL`. |
| **Hijri Provider architecture** | `HolidaySourceProvider.generateForYear(year)` now returns `HolidayProviderResult` (`{ candidates, warnings }`) instead of a bare array, and must never throw for an expected condition — `UNSUPPORTED_YEAR` / `PROVIDER_FAILURE` / `INVALID_DATA` warnings communicate that instead, so generation always "fails safely." `HijriHolidayService.generateExpectedHijriHolidays(year)` covers all 5 required occasions (Islamic New Year, Prophet's Birthday, Eid Al-Fitr ×3 days, Arafat Day, Eid Al-Adha ×4 days); every candidate is `origin: 'HIJRI'`, `status: 'EXPECTED_ALOJAIRI'` by construction — never `OFFICIAL`. `HijriHolidayProvider` remains a thin wrapper matching the unchanged provider interface. |
| **Holiday Engine evolution (Part 7)** | New static `HolidayEngine.generateCandidates(year, providers?)` is now the **only** place in the system that calls `provider.generateForYear` — `HolidayGenerationPlanner` no longer iterates providers directly. It wraps each provider call in its own try/catch, so one provider's unexpected failure becomes a `PROVIDER_FAILURE` warning instead of aborting generation for the others (e.g. a broken Hijri source still lets fixed holidays generate). Every pre-existing `HolidayEngine` method (`isHoliday`/`isWeekend`/`isWorkingDay`/`countWorkingDays`/`computeExcludedLeaveDays`, and its delegation to the legally-protected `computeEffectiveAnnualLeaveDays()`) is byte-for-byte unchanged — this is a purely additive capability. |
| **Supported Hijri generation range** | `SUPPORTED_HIJRI_GENERATION_YEARS` in `hijriCalendarConversion.ts` — Gregorian **2020–2050**. The algorithm is mathematically valid far outside this window, but generation is deliberately scoped to a practical HR-planning horizon; a request outside it returns zero Hijri candidates plus an `UNSUPPORTED_YEAR` warning (fixed Gregorian holidays are unaffected). One constant to widen later. |
| **Provider extension mechanism** | A future holiday source (a different country's calendar, a company-specific calendar) needs only: (1) a class implementing `HolidaySourceProvider`, (2) one new entry in `DEFAULT_HOLIDAY_PROVIDERS` (`holidays/providers/index.ts`). No change to `HolidayEngine`, `HolidayGenerationPlanner`, `HolidayGenerationExecutor`, `compareHolidayYear`, or the frontend dialog is required — the dialog renders provider/source labels and validation warnings generically from whatever the plan contains. |
| **Status persistence (Part 3, no schema change)** | `classifyHoliday()` now parses an optional `[ORIGIN:STATUS]` tag from the existing `notes` text column (already written by `HolidayGenerationExecutor` since Kuwait Holiday Intelligence Pack v1) before falling back to the pre-existing date heuristic — so a generated Hijri holiday reads back as `EXPECTED_ALOJAIRI`, not `MANUALLY_ADJUSTED`, after being saved. No new Prisma model, column, or migration. |
| **UI changes** | `GenerateHolidaysDialog.tsx` (Settings → "العطل الرسمية") gained a "المصدر" (source/provider) column in the details table and a new "تنبيهات التحقّق" section rendering provider warnings (unsupported-year messages, provider failures) — built entirely from existing ExplorerKit `DialogSection`/`StatusChip` components; no page redesign. |
| **Release scope** | **22 files, +771/−95** (4 added, 18 modified). New: `holidays/hijriCalendarConversion.ts`, `holidays/kuwaitHijriHolidayDefinitions.ts` + their test files. Modified: `holidays/providers/{HolidaySourceProvider,FixedHolidayProvider,HijriHolidayProvider}.ts`, `services/{HijriHolidayService,HolidayGenerationPlanner,HolidayService}.ts`, `engines/HolidayEngine.ts`, `holidays/classifyHoliday.ts`, `modules/holidays/holidays.service.ts`, `frontend/.../GenerateHolidaysDialog.tsx`, `employee-entitlements/README.md`, 6 existing test files. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend build ✅ · backend vitest **132 files / 1845 tests pass** ✅ (23 new, zero regressions). Manual visual review: **APPROVED** (Product Owner, via explicit production-release authorization). |
| **Business logic verification** | Rule 2: unchanged. Rule 5: unchanged. EOS calculations: unchanged. Leave Settlement: unchanged. Historical Ledger: unchanged. Database schema: unchanged (no migration — status persistence reuses the existing `notes` column). Existing API contracts: unchanged (additive `warnings` response field only). Existing permissions: unchanged. Existing business logic: unchanged. `HolidayEngine` remains the single source of truth for holiday/calendar logic and is now also the sole provider consumer. Hijri generation is fully offline — no external API dependency. No future Hijri dates are hardcoded. Unsupported years fail safely with validation warnings, never a crash or a guessed date. |

## Previous Release — Kuwait Holiday Intelligence Pack v1

| Field | Value |
|-------|-------|
| **Package** | Kuwait Holiday Intelligence Pack v1 |
| **Goal** | Extend the Employee Entitlements Foundation with a complete Kuwait Holiday generation and planning system — pluggable holiday-source providers, conflict/duplicate detection, a New/Existing/Changed/Skipped/Conflict year-comparison algorithm, and a preview-then-confirm "Generate Holidays" UI — without changing any legal calculation, database schema, or existing API contract. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/kuwait-holiday-intelligence-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `fcec491` (immediately after the Foundation merge) |
| **Feature commit** | `e5fc1f3` |
| **Production merge commit** | `75ed8c3` |
| **Stable tag** | `stable-kuwait-holiday-intelligence-pack-v1` → merge `75ed8c3` (annotated) |
| **Release scope** | **27 files, +1149/−155** (14 added, 13 modified). **Providers (Part 3):** `holidays/providers/` — `HolidaySourceProvider` interface + `FixedHolidayProvider` (the 3 fixed Kuwait holidays) + `HijriHolidayProvider` (wraps `HijriHolidayService`, still returns `[]` — **no future Hijri dates hardcoded or guessed**); `DEFAULT_HOLIDAY_PROVIDERS` is the single list the planner consumes. **Comparison/conflict (Parts 4+5):** `holidays/holidayYearComparison.ts`'s `compareHolidayYear()` is the **one** algorithm classifying every generated candidate as `NEW`/`EXISTING`/`CHANGED`/`SKIPPED`/`CONFLICT` against what already exists in the DB; `HolidayConflictService` derives its conflict view from this result rather than re-detecting. **Services (Part 6):** `HolidayValidationService` (structural candidate checks), `HolidayGenerationPlanner` (orchestrates providers + `HolidayService` + validation + comparison into one **read-only** preview — nothing written during planning), `HolidayGenerationExecutor` (re-plans server-side, creates only the `NEW` bucket, never updates/deletes existing rows — idempotent "safe regeneration"). `generateHolidaysWorkflow.ts` (Foundation pack) converted to a `@deprecated` thin delegating shim — no duplicated logic. **API (additive only):** two new routes on the existing `/api/holidays` router — `POST /generate/preview` (`employees.read`, no write) and `POST /generate/apply` (`employees.update`, writes only the `NEW` bucket after explicit UI confirmation); the 3 pre-existing routes (`GET /`, `POST /`, `DELETE /:id`) are unchanged, `GET /` gained additive `origin`/`status` response fields only (derived at read time via `classifyHoliday()`, no schema change). **Frontend:** Settings → "العطل الرسمية" gained a year selector + "توليد العطل" button opening `GenerateHolidaysDialog` (preview → category summary + conflict callout + full entry table → explicit confirm → generation report); existing table gained a derived status badge column. Built entirely from existing `Dialog`/`DialogSection`/`StatusChip`/`Button`/`EmptyState`/`SkeletonRows` — no new design language. **No accounting/payroll/bank changes.** |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend build ✅ · backend vitest **130 files / 1822 tests pass** ✅ (27 new, zero regressions). Gemini review: **APPROVED**. Manual visual review: **APPROVED**. |
| **Business logic verification** | Rule 2: unchanged. Rule 5: unchanged (its own `computeEffectiveAnnualLeaveDays()` call in `entitlements.calc.ts` untouched). EOS calculations: unchanged. Leave Settlement: unchanged. Historical Ledger: unchanged. Database schema: unchanged (no migration). Existing API contracts: unchanged (additive only). |

## Previous Release — Employee Entitlements Intelligence Suite v1 (Foundation)

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Intelligence Suite v1 (Foundation) |
| **Goal** | Establish Employee Entitlements as an independent backend domain (`backend/src/modules/employee-entitlements/`) — models, a Holiday Engine, calendar services, and a re-export surface over the existing legal calculator — without changing any legal calculation, business rule, database schema, API contract, or permission. Architecture only. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/employee-entitlements-intelligence-suite-foundation-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `8611e8a` |
| **Feature commit** | `e2c9cd6` |
| **Production merge commit** | `fcec491` |
| **Stable tag** | `stable-employee-entitlements-intelligence-suite-foundation-v1` → merge `fcec491` (annotated) |
| **Release scope** | **27 files, +920/−0** (all added; no existing file touched — a wholly new domain). `models/` — public interfaces (`EmployeeProfile`, `Holiday`, `LeavePeriod`, `LeaveAdvance`, `Settlement`, `EntitlementSummary`, `TimelineEvent`); `EntitlementSummary` is a type alias over the existing `EntitlementResult` (`entitlements.calc.ts`) — no duplication of the legal calculation type. `holidays/` — fixed Kuwait holiday definitions (1 Jan, 25/26 Feb), Hijri holiday type architecture (an explicit, documented stub — no future dates hardcoded or guessed), `classifyHoliday()` (derives origin/status for an already-stored `Holiday` row at read time, no schema change), a first-cut "Generate Year" plan/apply workflow. `engines/HolidayEngine.ts` — holiday/weekend/working-day detection and counting; its leave-exclusion method delegates 100% to the unmodified `computeEffectiveAnnualLeaveDays()` in `entitlements.calc.ts` (test-verified to produce identical results to calling it directly) — no duplicated legal logic. `services/` — `HolidayService` (the single read path for "what holidays exist"), `WorkingDaysService`, `HijriHolidayService` (architecture-only stub). `calculators/legalEntitlementCalculator.ts` — re-export surface over the existing `entitlements.calc.ts`; the original file was **not relocated** (too high-risk for a no-functional-change package) and remains the single source of truth. `timeline/buildEntitlementTimeline.ts` — server-side equivalent of the frontend's timeline builder. Dependency audit: `modules/employees` (and this new domain) verified to have **zero** imports from Accounting, Transactions, Invoices, Contracts, Inventory, Equipment, Banks, Cash, Expenses, Purchases, Suppliers, or Customers. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend build ✅ · backend vitest **123 files / 1795 tests pass** ✅ (29 new, zero regressions). No frontend files touched. Gemini review: **APPROVED**. Manual visual review: **APPROVED** (architecture-only, no user-facing surface). |
| **Business logic verification** | Rule 2: unchanged. Rule 5: unchanged. EOS calculations: unchanged. Leave Settlement: unchanged. Historical Ledger: unchanged. Database schema: unchanged (no migration). Existing API contracts: unchanged (no route wired to this domain yet). |

## Previous Release — Employee Entitlements Experience Refactor v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Experience Refactor v1 |
| **Goal** | Split the Employee Entitlements experience into two layers — a lightweight drawer summary and a dedicated full-page "Employee Entitlements Center" — for a premium-ERP-workspace UX, without touching any legal calculation, Rule 2/5, Leave Settlement, Historical Ledger semantics, EOS/gratuity formula, DB schema, or permissions. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/employee-entitlements-experience-refactor-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `94e26ec` |
| **Feature commit** | `ea9f8db` |
| **Production merge commit** | `f841d1d` |
| **Stable tag** | `stable-employee-entitlements-experience-refactor-v1` → merge `f841d1d` (annotated) |
| **Release scope** | **7 files, +1232/−444** (3 added — `entitlementsShared.tsx`, `EmployeeEntitlementsCenter.tsx`, `EmployeeEntitlementsCenter.css` — 4 modified). **Drawer (`EmployeeEntitlementsTab.tsx`, 484 → ~110 lines):** reduced to 4 `MetricCard`s (current leave balance, total legal entitlement, leave used, settlement summary) + one mini-summary line + a primary "فتح مركز المستحقات" action (`useNavigate`, not a dialog, not a drawer expansion) to `/employees/:id/entitlements`. All large sections (Executive Summary detail, Leave Reconciliation, Historical Timeline, Leave Advance Reconciliation, Smart Warnings, detailed tables, both add-record dialogs) removed from the drawer. **New Employee Entitlements Center (`pages/EmployeeEntitlementsCenter.tsx`, lazy-loaded route `/employees/:id/entitlements`, added inside the existing `Layout`-wrapped route group in `App.tsx` — sidebar/topbar preserved):** hosts the complete experience in the requested hierarchy — `ExecutiveHeader` + employee-info strip → 9-card Executive KPI grid → collapsible "تفاصيل إضافية والاحتساب" (leave/allowance fields, EOS employer/resignation toggle, calculation breakdown; collapsed by default) → Smart Warnings → Leave Reconciliation → Leave Advance Reconciliation → Settlement Summary (with scroll-to-section navigation) → Historical Activity Timeline → Historical Ledger (with "add entry," permission-gated) → collapsible detailed tables (leave history, settlements; open by default) → the unchanged permanent legal notice → both dialogs (moved here from the drawer). Collapsible sections use native `<details>`/`<summary>` styled to match `xpl-card` — no new design language. **New `components/employee/entitlementsShared.tsx`** centralizes every type, label map, and helper (`buildWarnings`, `buildTimeline`, `formatDurationLong`, `daysText`, `resignationFractionLabel`, `missingReason`, `Incomplete`, `scrollToEntSection`) previously duplicated inline in the old tab — single source for both surfaces, logic moved verbatim (not rewritten). Both surfaces call the identical unmodified `GET /employees/:id/entitlements` endpoint. **One additive backend prerequisite** (`employees.service.ts`, previously implemented and validated but never released, required for the Center page to render without crashing): `leaveExclusionBreakdown` field on the existing entitlements response (`grossAnnualLeaveDays`/`holidaysExcludedDays`/`sickExcludedDays`/`netUsedLeaveDays`/`holidaysConfiguredCount`) — a presentation-only breakdown; the legal `netUsedLeaveDays` is still derived exclusively via the **unchanged** `computeEffectiveAnnualLeaveDays()` calculation-engine call (mathematically guaranteed consistent by construction, same inputs/algorithm). No new endpoint, no schema change, no permission change, no change to Rule 2/5/EOS logic itself. **No accounting/payroll/bank changes.** |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · frontend build ✅ · backend vitest **116 files / 1766 tests pass** ✅ (0 failures — unaffected, no calculation-engine change). Gemini review: **APPROVED**. Manual visual review: complete. |
| **Roadmap (not implemented in this release)** | None new — Rules 4/6/18 remain the standing deferred item (see prior release), unaffected by this presentation-only pack. |

## Previous Release — Kuwait Labour Law Compliance Pack v2 (Employee Entitlements)

| Field | Value |
|-------|-------|
| **Package** | Kuwait Labour Law Compliance Pack v2 |
| **Goal** | Implement the two remaining confirmed legal items from the independent Kuwait Labour Law Compliance Audit — Rule 2 (first-year annual leave eligibility) and Rule 5 (official holiday / sick leave exclusion from annual leave day counts) — centralized in the Pack v1 pure-calculator architecture. Rules 4, 6, and 18 intentionally excluded, pending formal legal interpretation. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/kuwait-labour-law-compliance-pack-v2` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `531ab46` |
| **Feature commit** | `84b67b9` |
| **Production merge commit** | `339bab1` |
| **Stable tag** | `stable-kuwait-labour-law-compliance-pack-v2` → merge `339bab1` (annotated) |
| **Release scope** | **12 files, +489/−17** (5 added — `holidays.controller.ts`/`holidays.routes.ts`/`holidays.schema.ts`/`holidays.service.ts` + one migration — 7 modified; no other source file changed). **Rule 2 (Art. 70, first-year eligibility):** new `FIRST_YEAR_ELIGIBILITY_MONTHS = 9` constant + `isFirstYearEligible()` in `entitlements.calc.ts` — a single eligibility gate on `calculateEntitlements()`'s accrual output: before 9 completed calendar months of service, `accruedLeaveDays`/`remainingLeaveDays`/`leaveAllowanceDays`/`leaveAllowanceValue` are forced to `0` (not `null` — explicitly zero, per the audit requirement); at/after 9 months the existing proportional accrual formula (`30 × totalDays/365`) resumes automatically, completely unchanged. New `EntitlementResult.firstYearEligible: boolean | null` field (`null` only when `hireDate` is missing) surfaces the state; `EmployeeEntitlementsTab.tsx`'s leave-balance `MetricCard` shows a "غير مؤهل بعد" note when `false` — no new UI section, no redesign. **Rule 5 (Art. 70, holiday/sick exclusion):** new pure exported `computeEffectiveAnnualLeaveDays(leaveInterval, holidays, sickLeaveIntervals)` — builds a `Set<number>` of excluded calendar-day indexes (`Math.floor(ms/86_400_000)`) from official holidays ∪ approved sick-leave days, so a day matching both is only excluded once (no double-counting), then counts non-excluded days within the leave interval. `employees.service.ts`'s new `computeUsedAnnualLeaveDays()` calls this per approved `ANNUAL` leave record against `Holiday` rows + approved `SICK` leave records and sums the result, replacing the previous raw `prisma.leave.aggregate()` on `Leave.days`. **Minimum required holiday infrastructure:** new additive `Holiday` model (`id`, `date` unique+indexed, `name`, `notes`, `createdAt`) via a hand-authored, surgical migration (existing unrelated dev-DB drift on `bank_statement_transactions`/`invoice_items`/`bank_statement_imports` untouched); new 4-file `backend/src/modules/holidays` module (`GET/POST /api/holidays`, `DELETE /api/holidays/:id`) reusing the existing `employees.read`/`employees.update` permissions — **no new permission keys**. **Frontend:** `Settings.tsx` gained a self-contained "العطل الرسمية" section (list + permission-gated add/delete, immediate `POST`/`DELETE` calls — not batched with the page's settings-save button, since `Holiday` is a REST resource, not a settings key/value pair) so holidays are genuinely manageable, not API-only. **No changes** to EOS/gratuity calculation, wage-base composition (Rule 16), resignation scenarios (Rule 17), the ÷26 divisor (Rule 13), Leave Settlement architecture (Rule 10), or the Historical Ledger; no accounting/payroll/bank integration. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · prisma validate ✅ · frontend build ✅ · backend vitest **116 files / 1766 tests pass** ✅ (0 failures; `entitlements.calc.test.ts` 19 → 29 tests — 4 new Rule 2 cases: 8mo/exactly-9mo/>9mo/EOS-unaffected; 6 new Rule 5 cases: single holiday, single sick period, multiple holidays, multiple sick periods, same-day holiday+sick dedup, no-overlap). Gemini review: **APPROVED**. Manual visual review: complete. |
| **Roadmap (not implemented in this release)** | **Rules 4, 6, 18** — remain out of scope pending formal legal interpretation (per the original Kuwait Labour Law Compliance Audit); do not implement without an explicit legal-confirmation instruction. |

## Previous Release — Kuwait Labour Law Compliance Pack v1 (Employee Entitlements)

| Field | Value |
|-------|-------|
| **Package** | Kuwait Labour Law Compliance Pack v1 |
| **Goal** | Remediate the 4 findings (Rules 10, 13, 16, 17) from the Kuwait Labour Law Compliance Audit against the Employee Entitlements calculation engine — daily-wage divisor, entitlement wage-base composition, resignation-vs-termination gratuity scenarios, and the legal status of Leave Settlement — while preserving the audit-verified pure-calculator architecture exactly. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/kuwait-labour-law-compliance-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `b5ce899` |
| **Feature commit** | `9e85150` |
| **Production merge commit** | `f306e1a` |
| **Stable tag** | `stable-kuwait-labour-law-compliance-pack-v1` → merge `f306e1a` (annotated) |
| **Release scope** | **8 files, +393/−286** (0 added, 8 modified; no other source file changed; no migration). **Rule 13 (divisor):** `entitlements.calc.ts` — single centralized `DAILY_WAGE_DIVISOR = 26` constant (project-adopted legal baseline) replacing the prior 30; `dailyWage` and `leaveAllowanceValue` now derive from one shared raw (unrounded) value — no duplicated division. Art. 51 tier-2 ("one month's wage per year beyond 5 years") now multiplies the wage base directly rather than `30 × dailyWage`, so it stays exactly one month regardless of the divisor; the 18-month cap is unchanged. **Rule 16 (wage base):** new `EntitlementInput.monthlyWageBase` (replacing `monthlySalary`) = `Employee.salary + Σ(active recurring EmployeeAllowance amounts within their startsAt/endsAt window)` — resolved once in `employees.service.ts`'s new `resolveWageBase()` and consumed identically everywhere via a new `computeCurrentEntitlements()` shared by both `getEntitlements` (read path) and the ledger-snapshot path (eliminating the prior duplicated used-days/wage aggregation logic between them). All currently-active recurring allowances are included by design — the data model has no finer category to exclude a specific statutory allowance type; documented as a known limitation in code. **Rule 17 (resignation scenarios):** `GratuityBreakdown` gains `resignationFraction`/`resignationAmount`, computed alongside the existing full (`total`) amount in every call — 0 (<3y) / 0.5 (3–5y) / ⅔ (5–10y) / 1 (≥10y) per Art. 53, with the ≥5-year boundary correctly using actual elapsed days (leap-year aware) rather than a rounded figure. `EmployeeEntitlementsTab.tsx` adds an explicit Employer-Termination/Resignation `Tabs` toggle driving both the KPI card and the detail section, plus a **permanent** (always-visible, no longer conditional on data completeness) legal-basis notice citing Art. 51/53/55/62/70/73/74. **Rule 10 (Leave Settlement redesign):** `leaveBaselineDate` and `resolveLeaveBaseline` **removed entirely** from `entitlements.calc.ts` — the pure calculator has no settlement-shaped input left, so a settlement structurally cannot influence any calculation (leave balance now always accrues continuously from hire date, per Art. 73/74's no-waiver rule). `LeaveSettlement` is re-documented (schema comment only — verified via `prisma migrate diff` to introduce zero structural change) and re-labeled in the UI as a historical advance-payment record (`LeaveSettlementDialog.tsx`, Section 7 title/button copy, `entitlementLedgerDisplay.ts` badge text) rather than a balance-discharging "settlement." **Existing `LeaveSettlement` / `EmployeeEntitlementLedger` rows are untouched** — no data migration, no reinterpretation of stored values, only the calculation-time meaning changed going forward. **No Business Logic outside Employee Entitlements; no accounting / payroll / bank / attendance changes.** |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · prisma validate ✅ (zero structural drift confirmed via `migrate diff`) · frontend build ✅ · backend vitest **116 files / 1756 tests pass** ✅ (0 failures; `entitlements.calc.test.ts` fully rewritten — 19 tests: divisor/no-duplication proof, 5 Art. 53 boundary tests, 3 tests proving the calculator structurally cannot be affected by a settlement/ledger record). Frontend vitest: **1775/1776 pass**, identical to the pre-release baseline — the sole failure (`routerFutureFlags.test.tsx`, stale `lazy()` count on the untouched `App.tsx`) is pre-existing and outside this release's scope. Independent architectural review + **Gemini Final Review: APPROVED**. Manual visual review: complete. |
| **Roadmap (not implemented in this release)** | **Leave Advance Reconciliation Pack v1** — display total legal entitlement, total leave-advance payments, and the remaining amount expected at final settlement. Must NOT modify the legal calculation engine introduced in this release. |

## Previous Release — Historical Ledger Pack v1 (Employee Entitlements)

| Field | Value |
|-------|-------|
| **Package** | Historical Ledger Pack v1 — Employee Entitlements |
| **Goal** | Extend the Employee Entitlements drawer with two intentionally-independent manual concepts + a review polish: (A) a **Leave Settlement baseline** that controls leave accrual only, (B) a read-only **Employee Entitlement Ledger** for historical review of manually-paid entitlements, and (C) a write-once informational leave-balance **snapshot** + a display-only **settlement-link badge**. No accounting/payroll/bank integration; ledger/snapshot/badge never affect calculations. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/employee-entitlements-historical-ledger-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `832062b` |
| **Feature commit** | `8484519` |
| **Production merge commit** | `0178ba2` |
| **Stable tag** | `stable-historical-ledger-pack-v1` → merge `0178ba2` (annotated) |
| **Release scope** | **17 files, +904/−33** (7 added, 10 modified; no other source file changed). **DB — three additive migrations:** `20260719120000_add_leave_settlements` (`leave_settlements` table), `20260719130000_add_entitlement_ledger` (`employee_entitlement_ledger` table), `20260719140000_ledger_leave_balance_snapshot` (nullable `leaveBalanceSnapshot` column). Migrations were hand-authored as pure `CREATE TABLE` / `ADD COLUMN` and applied surgically (the auto-diff exposed unrelated pre-existing drift on `bank_statement_transactions`/`invoice_items` which was **not** touched). **(A) Leave Settlement Baseline** — `LeaveSettlement` model + pure `resolveLeaveBaseline(hireDate, settlementDates)`; `entitlements.calc.ts` accrues leave from an optional `leaveBaselineDate` (latest settlement date, else hire date) — **leave accrual only**; service duration and end-of-service gratuity remain from hire date. Used annual-leave days are scoped to leaves starting on/after the baseline. **(B) Employee Entitlement Ledger** — `EmployeeEntitlementLedger` model (types `LEAVE_ALLOWANCE` / `END_OF_SERVICE` / `OTHER`); **historical audit only**, read by `getEntitlements` for display and **never** fed into any calculation; create writes exactly one row + an audit entry — **no** journal/bank/cheque/cash-voucher/payroll record. `leaveDays` stored for Leave Allowance only. **(C) Polish** — `leaveBalanceSnapshot` computed **once** server-side at ledger-create time for Leave Allowance rows (from the same pure calculator's `remainingLeaveDays`), stored as a frozen scalar with **no update path**, never used in any calc; a **display-only** "مرتبط بتسوية الإجازة" badge derived at render from same-day settlement matching via the pure `entitlementLedgerDisplay.ts` helper (no FK, no coupling, no synchronization). **Endpoints** (all reuse existing permissions — **no new permission keys**): `GET /employees/:id/leave-settlements` (`employees.read`), `POST` (`employees.update`), `GET /employees/:id/entitlement-ledger` (`employees.read`), `POST` (`employees.update`); the entitlements response gained read-only `settlements[]`, `leaveBaseline { date, isSettlement }`, and `ledger[]` (incl. `leaveBalanceSnapshot`). **Frontend** reuses ExplorerKit dialogs/tables — new "سجل تسويات الإجازة" + "سجل المستحقات المصروفة" sections, "تسوية رصيد الإجازة" + "إضافة مستحق" buttons, two dialogs, "الرصيد وقت الصرف" column, and the settlement-link badge; RTL, dark mode, responsive; add actions gated by `employees.update`. **No Business Logic / accounting / payroll / bank regression; calculations provably unaffected by the ledger/snapshot/badge.** |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · prisma validate ✅ · frontend build ✅ · backend vitest **116 files / 1756 tests pass** ✅ (0 failures). New unit tests: backend calculator baseline + ledger-invariance (proving the ledger/snapshot never change calculations); frontend `entitlementLedgerDisplay` badge-match (3 tests). Re-verified on merged `production` HEAD `0178ba2`. **Known pre-existing, unrelated frontend test failure:** `routerFutureFlags.test.tsx` hard-asserts a `lazy()` count of 48 while the **untouched** `App.tsx` has 46 (identical in HEAD and working tree) — already red on the prior production HEAD `832062b`, outside this release's approved scope; flagged for a separate fix. Code review + manual visual review complete. |

## Previous Release — Employee Entitlements Drawer Tab v1

| Field | Value |
|-------|-------|
| **Package** | Employee Entitlements Drawer Tab v1 |
| **Goal** | Add ONE new read-only "الاستحقاقات" tab to the existing Employee drawer — service duration, annual-leave balance, leave cash allowance, and end-of-service gratuity calculated as of today per Kuwait Private Sector Labour Law. Intentionally small: no new HR subsystem, no rules engine, no configurable/editable formulas. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/employee-entitlements-drawer-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `f0a7ca5` |
| **Feature commit** | `dba183d` |
| **Production merge commit** | `ea62520` |
| **Stable tag** | `stable-employee-entitlements-drawer-v1` → merge `ea62520` (annotated) |
| **Release scope** | **8 files, +782/−2** (4 added, 4 modified; no other source file changed). **Backend (added):** `entitlements.calc.ts` — pure, stateless calculator with fixed **Kuwait Labour Law No. 6 of 2010** formulas and article references (Art. 70 annual leave = 30 days/yr accrued pro-rata; Art. 51 monthly-paid gratuity = 15 days'/yr for first 5 years + one month's/yr thereafter, capped at 18 months' wage; daily wage = salary ÷ 30); `entitlements.calc.test.ts` — 10 unit tests. **Backend (modified):** `employees.service.ts` (new `getEntitlements(id)` — gathers inputs only, used annual-leave days summed from stored `Leave.days` as the single source of truth, calls the pure calc), `employees.controller.ts` (handler), `employees.routes.ts` (route). **Frontend (added):** `EmployeeEntitlementsTab.tsx` + `.css` — 6 sections (KPI summary, الإجازات, بدل الإجازة, مكافأة نهاية الخدمة, تفاصيل الاحتساب compact cards, سجل الإجازات) reusing ExplorerKit; lazy-mounted and keyed by employee id; RTL, dark-mode, responsive. **Frontend (modified):** `ResourcePage.tsx` (third drawer tab + lazy render branch). New **read-only** endpoint `GET /api/employees/:id/entitlements` gated by the **existing** `employees.read` permission (no new permission key). **No database/schema change, no migration.** Missing required data (hireDate/salary) → the card stays visible showing `—` + "بيانات غير مكتملة" + the exact missing field (never estimated / never invented); when the system structurally lacks legally-required info (resignation reason, contract type, wage composition) the gratuity is computed as the full statutory entitlement (employer-termination / contract-expiry basis, no resignation reduction) — documented in-code. **Legal disclaimer shown only when required data is missing**, so a fully-supported calculation renders a clean drawer. Two post-implementation UI-only polish edits (disclaimer gate; −15% value typography on 3 of the 4 KPI cards) carried no business-logic change. **No Business Logic / API-contract / accounting / payroll / leave-management regression.** |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · prisma validate ✅ (unchanged) · frontend build ✅ · backend vitest **116 files / 1747 tests pass** ✅ (0 failures; +10 new). Re-verified on merged `production` HEAD `ea62520`. **Gemini Final Review: APPROVED** (no critical / medium / minor issues). Manual visual review: performed by the Product Owner before Gemini review. |

## Previous Release — Cash Transactions Table Alignment & Layout Polish Pack v1

| Field | Value |
|-------|-------|
| **Package** | Cash Transactions Table Alignment & Layout Polish Pack v1 |
| **Goal** | Polish the Cash Transactions (Bank Account Explorer) timeline table: center all column headers, collapse the Description cell to a single non-wrapping ellipsis-truncated line without growing row height, and rebalance column widths — visual/CSS only, no logic change. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/cash-transactions-table-alignment-polish-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `2292a10` |
| **Feature commit** | `b1fe538` |
| **Production merge commit** | `5d9bf90` |
| **Stable tag** | `stable-cash-transactions-table-alignment-layout-polish-pack-v1` → merge `5d9bf90` (annotated) |
| **Release scope** | **Frontend only, 2 files** (`frontend/src/pages/BankAccountExplorer.tsx`, `frontend/src/pages/BankAccountExplorer.css`; no other source file changed). Headers of the Cash Transactions timeline table centered via `.bae-timeline-table--exec th { text-align:center }` — scoped so the unrelated Imports sub-table sharing the base `.bae-timeline-table` class in the same file is unaffected. Description cell changed from a two-line stacked layout (category label + optional detail line) to a single `.bae-tx-desc` span combining both onto one non-wrapping, ellipsis-truncated line; full raw text still available via the existing `title`-tooltip pattern already used elsewhere in the project (no new truncation component introduced). Column widths rebalanced: date 100px, type 110px, description 320px (was an unbounded `max-width:380px` cap), amount 120px, balance 140px (operation 84px and chevron 32px unchanged); table `min-width` raised 780px→920px to fit. Removed 2 now-unused CSS rules (`.bae-tx-cell-text`, `.bae-tx-sub`) after confirming no other usage in the codebase. Row height, table colors, ExplorerKit tokens, the bespoke table markup (not migrated to the shared `DataTable` component), column order, and all sort/search/export/filter logic are unchanged. **No Business Logic / API / handler / data change.** |
| **Validation** | frontend `tsc --noEmit` ✅ · backend `tsc --noEmit` ✅ · electron `tsc --noEmit` ✅ · prisma validate ✅ · frontend build ✅ · backend vitest **115 files / 1737 tests pass** ✅ (0 failures) — re-verified both pre-merge (feature branch) and post-merge (`production` HEAD `5d9bf90`). Manual visual review: **APPROVED** by the project owner. |

## Previous Release — User Management Header Cleanup Pack v1

| Field | Value |
|-------|-------|
| **Package** | User Management Header Cleanup Pack v1 |
| **Goal** | Remove a duplicated "مستخدم جديد" (new user) button from the Users page — the ExecutiveHeader `aside` slot and the toolbar above the table both rendered an add-user action; the toolbar button is the intended single entry point. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-19 |
| **Feature branch** | `feature/user-management-header-cleanup-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `7d931c5` |
| **Feature commit** | `4338bdb` |
| **Production merge commit** | `86292d5` |
| **Stable tag** | `stable-user-management-header-cleanup-pack-v1` → merge `86292d5` (annotated) |
| **Release scope** | **Frontend only, 1 file** (`frontend/src/pages/Users.tsx`, −1 line). Removed the `aside` prop on `ExecutiveHeader` that rendered a second "new user" `Button`; the existing toolbar button above the table (and the EmptyState CTA shown when the list is empty) are unchanged. No Business Logic / API / permission / handler / layout / spacing / stat-card changes. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend build ✅. Manual visual review: **APPROVED** by the project owner. |

## Previous Release — Date Boundary Consistency Pack v1

| Field | Value |
|-------|-------|
| **Package** | Date Boundary Consistency Pack v1 |
| **Goal** | Standardize `toDate`/`asOfDate` end-of-period handling across every financial report to the canonical `endOfDay()` helper (`backend/src/core/utils/dateWindows.ts`), eliminating a class of bugs where a bare `new Date(toDate)` (UTC midnight) silently excluded records posted later on the final day of a reporting period. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/date-boundary-consistency-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `1f3aa6a` |
| **Feature commit** | `a17648a` |
| **Production merge commit** | `7df6768` |
| **Stable tag** | `stable-date-boundary-consistency-pack-v1` → merge `7df6768` (annotated) |
| **Checkpoint tag** | `pre-date-boundary-consistency-pack-v1` @ `1f3aa6a` |
| **Release scope** | **Backend only, 11 files** (8 modified, 3 added; +369/−26; **no UI changes**). Fixed 9 date-boundary sites across 4 services — `financial.service.ts` (`getStatement`, `getGlStatement`, `getGlReport`, `getTrialBalance` as-of + period modes), `accounting.service.ts` (`listJournalEntries`, `listPayments`), `expenses.service.ts` (`list`, `stats`), `salaries.bankAnalytics.service.ts` (`buildWhereClause`) — plus consolidated a duplicate local `endOfDay(dateStr: string)` helper in `reports.service.ts` onto the canonical `dateWindows.ts` implementation (6 call sites updated to pass `Date` objects), removing the last independent reimplementation of this logic. Every fix reuses the existing helper — no new date-math introduced. Start-date (`gte`) parsing was deliberately left untouched (separate, unconfirmed concern, out of this pack's scope). **No accounting, posting, journal, permission, schema, or API-contract change.** 2 pre-existing test assertions that hardcoded the old (buggy) midnight boundary were updated to match corrected behavior; 5 new regression test files/blocks added, including a cross-report consistency test proving GL Statement, GL Report, and both Trial Balance modes now resolve the same `toDate` to an identical instant. |
| **Validation** | backend `tsc --noEmit` ✅ · frontend `tsc --noEmit` ✅ · backend vitest **115 files / 1737 tests pass** ✅ (0 failures). **Visual review gate waived by explicit Product Owner confirmation** — backend-only pack, no rendered UI surface to review. |

## Previous Release — Calendar UX Refresh Pack v1

| Field | Value |
|-------|-------|
| **Package** | Calendar UX Refresh Pack v1 |
| **Goal** | Bring `DateCalendarPicker`'s visual presentation up to an approved enterprise mockup — spacing, typography, header/nav/dropdown chrome, selected/today/focus states, and dark-mode surface consistency — with zero API/behavior/logic change. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/calendar-ux-refresh-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `f69a132` |
| **Feature commit** | `e83f14c` |
| **Production merge commit** | `da74be5` |
| **Stable tag** | `stable-calendar-ux-refresh-pack-v1` → merge `da74be5` (annotated) |
| **Release scope** | **1 file** (+129/−0), `frontend/src/components/DateCalendarPicker.css` only. Presentation-only: 12px popover radius, 8px-grid spacing/padding, 36px cells, Inter/14px/medium typography, bordered prev/next + month/year dropdown controls with accent-tinted hover, brand-accent (`--accent`/`--accent-hover`) selected-day chip (replacing shadcn's neutral `--sh-primary`), `--accent-light`-tinted today state, dashed-accent focus ring, and a dark-mode popover surface repointed onto the app's own `--surface`/`--border` dialog tokens instead of shadcn's neutral `--sh-popover`/`--sh-border` — so the calendar now sits on the same navy surface layer as the app's modals/cards in dark mode. All colors reuse existing app tokens (`--accent`, `--accent-hover`, `--accent-light`, `--surface`, `--border`, `--surface-hover`) — no new palette, no custom hex values. **No change** to `DateCalendarPicker.tsx`, `DateInput.tsx`/`DateInput.css`, or any vendor `ui/calendar.tsx`/`ui/popover.tsx`/`ui/button.tsx` file — component API, navigation, keyboard/mouse behavior, month/year switching, selected-date logic, focus logic, accessibility, and RTL/LTR behavior are all unchanged. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend vitest — `DateCalendarPicker.test.tsx` **5/5 pass** · manual visual review (light + dark): **APPROVED** by the project owner. |

## Previous Release — Employment Contract Workspace Integration & UX Refresh Pack v1

| Field | Value |
|-------|-------|
| **Package** | Employment Contract Workspace Integration & UX Refresh Pack v1 |
| **Goal** | Modernize the "عقد العمل → بيانات العقد" workspace to an enterprise-grade visual standard, evaluate merging the employee-selection screen into the params page, and add an Authorized Signatory system so the contract's First Party (employer) representative is data-driven instead of hardcoded. |
| **Release status** | RELEASED |
| **Release date** | 2026-07-18 |
| **Feature branch** | `feature/employment-contract-workspace-integration-ux-refresh-pack-v1` (kept — pushed, not deleted) |
| **Baseline** | `production` @ `4593db0` |
| **Feature commit** | `3db1d2d` |
| **Production merge commit** | `b30c184` |
| **Stable tag** | `stable-employment-contract-workspace-integration-ux-refresh-pack-v1` → merge `b30c184` (annotated) |
| **Architectural decision** | Studied merging `ModeSelector` (employee-selection screen) into `ContractParamsDialog`. **Declined** — `employmentContractNewEmployee.test.tsx`'s own header comment documents that the current 4-screen `mode` state machine was deliberately hardened after a real accessibility regression (a disabled button had made the manual-entry path unreachable); ~10 regression tests pin the exact literal mode-transition strings and function boundaries. Merging would trade a purely navigational improvement for unjustified test-suite rewrite risk, so the existing screen structure was kept and each screen was instead redesigned individually. |
| **Release scope** | **5 files** (+429/−223). `frontend/src/forms/shared/authorizedSignatories.ts` (new) — single source of truth for the 3 fixed Authorized Signatories (Hassan Falah Nayef Al-Hajji [default] / Ghanem Hassan Nayef Al-Hajji / Mohammad Tuwari Mohammad Al-Hussaini), each with Arabic name, English name, and civil ID. `frontend/src/forms/EmploymentContractTemplate.tsx` — added `authorizedSignatoryId` to `ContractParams`; replaced 5 hardcoded occurrences of the First Party representative's name/civil ID across both render paths (bilingual + English-only) and both printed pages with the selected signatory's data (Arabic name only in Arabic text, English name only in English text, civil ID in both; company name untouched); plus the incremental print-template fixes from the same initiative — outer frame removal, horizontal centering, profile-aware vertical content offset (avoids 3rd-page overflow on the `letterhead` profile), matching left/right cell borders, header restructure (independent title row + emblem beside the authority name, original bottom border position preserved), and a QR/barcode block below the signature area whose encoded payload is limited to employee name / civil ID / contract duration / salary / company name / contract end date (form number retained in the payload only because `FormQRCode`'s caption reads it from the same object — that component was not modified). `frontend/src/pages/EmploymentContract.tsx` — enterprise-style visual redesign of `ContractParamsDialog`, `NewEmployeeForm`, and `ExistingEmployeeLookup` (new `.ecx-panel` section pattern with icon/title/description, migrated off ad-hoc inline `lbl`/`inp` styles onto the app's existing global `.field` class, responsive grid); added the "المفوض بالتوقيع" select to `ContractParamsDialog`, persisted via the existing print-draft save/restore mechanism (no new storage layer). `ModeSelector` left byte-for-byte untouched (its inline `<style>` block is pinned by regression tests). Two test files updated only where a literal call-site string changed (`formNumber` prop addition from an earlier request in the same initiative), not for this release's own changes. No change to print margins, `@page`, pagination, header/footer/QR/barcode mechanics, or any other form. |
| **Validation** | frontend `tsc --noEmit` ✅ · frontend vitest — dedicated employment-contract regression files **51/51 pass** · full frontend suite **1772/1773 pass** (the 1 failure is the pre-existing, unrelated `routerFutureFlags.test.tsx` `lazy(` -count mismatch — confirmed present independent of this release, same failure already documented against the prior `stable-enterprise-data-grid-foundation-v1` release) · manual visual review + technical review: **APPROVED** by the project owner; Gemini: **APPROVED**. |
| **Note for future work** | If the employee-selection screen is ever revisited for merging, the blocker is the existing regression-test coupling documented above, not a technical barrier — budget for a coordinated test-suite rewrite alongside the UI change. |
