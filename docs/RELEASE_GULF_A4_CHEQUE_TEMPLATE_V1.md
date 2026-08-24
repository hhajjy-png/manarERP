# RELEASE — Gulf Bank A4 Cheque Template + Professional Calibration + Date Block v1

**Status:** RELEASED
**Product Owner visual review:** completed and approved (including the Date Block rebuild)
**Date:** 2026-08-25

---

## What shipped

Three packages, released together as one:

| Package | Status |
|---|---|
| **Gulf Bank A4 cheque template** (`gulf-a4`) | **RELEASED** |
| **Professional calibration integration** | **RELEASED** |
| **Date Block rebuild** | **RELEASED** |

### 1. Gulf Bank A4 cheque template — «قالب شيك الخليج»

The measured Gulf Bank cheque is 180 × 90 mm, but the printer cannot feed that
paper. The job is therefore always issued on a real **A4 landscape page
(297 × 210 mm)** with the cheque treated as a virtual area inside it:

```
Cheque area on A4:  X = 117.0 mm   Y = 60.0 mm   W = 180.0 mm   H = 90.0 mm
                    (right edge flush with the sheet's right edge; vertically centred)
```

Cheque-local field geometry (millimetres, origin at the cheque's top-left):

| Field | X | Y | W | H |
|---|---|---|---|---|
| Beneficiary | 8.0 | 23.5 | 108.0 | 7.0 |
| **Date block** | **135.0** | **23.0** | **28.0** | **7.0** |
| Tafqeet | 10.0 | 33.0 | 105.0 | 16.0 |
| Numeric amount | 132.0 | 40.0 | 38.5 | 8.5 |

The app prints **four values only** — date, beneficiary, numeric amount, tafqeet.
Everything the bank pre-prints (logo, bank/company name, `KD` / `د.ك`, rules,
signature, cheque number, sort code, account number, MICR, security background)
is never printed by the app. The cheque photo is **preview only** and is
structurally absent from the printed subtree — that subtree renders with
`showBackground={false}`, so it contains no `<img>` at all.

Final coordinates are always derived, never stored:

```
finalX = chequeAreaX + fieldLocalX + calibrationOffsetX
finalY = chequeAreaY + fieldLocalY + calibrationOffsetY
```

**Single approved template.** Classic, the 178 × 89 mm template, the generic A4
template and the database Designer templates were removed from the cheque
workflow, so the former «طريقة الطباعة» selector is gone: Preview, Calibrate and
Print act on «قالب شيك الخليج» directly.

### 2. Professional calibration integration

The profile is a **document handed to the existing professional studio**
(Cheque Template Designer + its toolbar), not a calibration surface of its own.
It therefore inherits the studio's whole capability set: drag, resize, rotate,
keyboard nudge, alignment guides, undo/redo, the properties panel
(x / y / width / height / rotation / font size / weight / alignment / colour /
visibility / z-order), data-source binding, live preview and test print.

Two calibration levels, both in that studio:

* **per field** — the designer and the properties panel;
* **whole cheque** — two global A4 placement offsets that move the cheque AREA on
  the sheet and never rewrite a field coordinate.

**Storage:** one row in the existing `settings` table, written through the
existing `PUT /settings` endpoint — no new table, no migration, no new endpoint:

```
key   = cheque.calibration.gulf-a4.v1
group = cheques
value = { surface, fields[…], calibration: { offsetXMm, offsetYMm } }
```

Factory default `0 / 0`; "Restore default" returns to the measured geometry.

### 3. Date Block rebuild

The cheque's date box carries pre-printed `/` separators, so the digits must land
in three fixed cells. They were originally three Designer fields, which produced
three separate frames and digits that did not share a baseline; a "move group"
patch on that shape was removed and the date rebuilt.

The date is now **one field** (`chequeDate`, 135 / 23 / 28 × 7 mm) whose day,
month and year are **internal slots** — rendering detail, not objects:

```
day  x =  0.0 mm  w =  6.0 mm      →  prints at 135 mm
month x =  9.0 mm  w =  6.0 mm     →  prints at 144 mm
year  x = 18.0 mm  w = 10.0 mm     →  prints at 153 mm
```

A slot carries **only** a horizontal offset and a width — no y, no height, no
line-height, no font — so the three digits share one baseline by construction.
Nothing can select, frame, resize or rotate a slot; clicking any digit selects
the block. Because the offsets are percentages of the block, moving it moves them,
and **no group concept remains anywhere in the system**.

---

## Architecture — reused, not rebuilt

```
Gulf A4 profile → Runtime Engine → ChequeRenderSurface / ChequeA4Sheet
                → ChequeTemplatePrintPage → existing Print IPC
```

No new print engine, no new renderer, no new calibration engine, no new storage
system, no parallel API. Tafqeet (`amountToWordsKWD`), the cheque money format
(`fmtChequeAmount`, KWD 3 decimals) and the `DD / MM / YYYY` date format all come
from `buildChequeRuntimeData` — the same single source every cheque surface uses.

Preview, test print and physical print consume the **same** profile, the same
model and the same placement. There is no preview-only coordinate anywhere.

---

## Removed (obsolete template implementations)

Removed from the cheque workflow along with the templates they served:

* `ChequeCalibrator.tsx` and `components/calibrator/*` (Classic calibration studio)
* `utils/chequeGeometry.ts`
* `components/chequeTemplateManager/chequeDesignerStore.ts`
* `modules/chequePrint/resolveTemplate.ts`
* Classic print output, its hidden print layer and page constants in `Cheques.tsx`
* The print-provider selector, `cheques.defaultPrintProvider` reads/writes
* The Classic-only exports of `utils/chequeTemplate.ts`
* 10 test suites covering templates that no longer exist

**Historical data was NOT touched.** No migration, no mass update. The
`cheque.template.<bank>` settings rows, the `cheque_designer_templates` table,
the cheque template versions and the backend modules serving them all remain
intact, so historical cheques stay readable. No cheque surface reads them any
more; only the profile key is consulted. `printProfileKey` on bank accounts is
unchanged.

---

## Validation

| Check | Result |
|---|---|
| Gulf suites (`gulfBankChequeA4Profile`, `gulfBankA4Calibration`, `gulfDateBlockCalibration`) | **70 tests passed** |
| Full frontend suite | **178 suites passed** |
| `tsc --noEmit` (frontend) | clean |
| `tsc --noEmit` (backend) | clean |
| `build:front` / `build:back` | passed |
| Schema / migration / permission keys | **none** |

No installer was rebuilt in this release.

---

## Open items for the Product Owner

* **Printer calibration** — the coordinates are measured base geometry, not a
  printer calibration. The two global offsets stay `0 / 0` until a real print
  test supplies values; they are edited in the studio and saved, with no code
  change.
* **Numeric amount guards** — the amount prints as `#1,250.750#` via the shared
  cheque money formatter. Removing the `#` guards for this template is a one-line
  change, pending a decision.
