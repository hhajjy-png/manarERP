# RELEASE — Multi-Bank Cheque Profiles Readiness v1

**Status:** RELEASED
**Product Owner visual review:** completed and approved
**Date:** 2026-08-25

---

## What shipped

| Package | Status |
|---|---|
| **Multi-Bank Cheque Profiles** (registry + selector) | **RELEASED** |
| **KFH / NBK provisional profiles** | **RELEASED** |

The cheque studio now registers one template per bank and can open any of them
directly, without a real cheque on that bank's account first.

| Template | bankCode | Status | Calibratable | Production print |
|---|---|---|---|---|
| قالب شيك الخليج | `GULF_BANK` | `APPROVED` | yes | **yes** |
| قالب شيك بيت التمويل الكويتي | `KFH` | `PROVISIONAL` | yes | **no** |
| قالب شيك بنك الكويت الوطني | `NBK` | `PROVISIONAL` | yes | **no** |

The bank codes are the ones the Multi-Bank registry already seeds — no `Bank` or
`BankAccount` was created, and the account picker is untouched.

---

## The profile registry

`modules/chequePrint/chequeProfileDefinition.ts` holds the contract — the profile
shape, the one mm → percent field converter every bank uses, and the guards.
`modules/chequePrint/bankChequeProfiles.ts` holds the three entries.

Adding a bank is adding a record plus its measured numbers. Nothing about the
print path, the renderer, the calibration studio or the storage mechanism is
per-bank:

```
Bank profile → Runtime Engine → ChequeRenderSurface / ChequeA4Sheet
             → Professional Calibration Studio
             → ChequeTemplatePrintPage → existing Print IPC
```

No new engine, renderer, calibration surface, page, API, DB table or migration.

---

## Gulf — unchanged

Geometry, placement, field table, Date Block, preview image, calibration key and
`APPROVED` status are all exactly as released. The only edit to its module is a
delegation: the mm → percent conversion moved into the shared converter, which
its own suites prove produces byte-identical output.

---

## KFH / NBK — provisional

Both start from a shared baseline that was **seeded from the Gulf measurements**
— the only physical cheque measured so far — and then written out as standalone
data. `PROVISIONAL_BASE_*` does not read the Gulf profile:

```
Cheque      180 × 90 mm        Placement   X 117 / Y 60 mm
Beneficiary   8.0 / 23.5 / 108.0 / 7.0      14px / 600 / right
Date Block  135.0 / 23.0 /  28.0 / 7.0      14px / 700 / center, slots 0 / 9 / 18 mm
Tafqeet      10.0 / 33.0 / 105.0 / 16.0     12px / 600 / right, two lines
Amount      132.0 / 40.0 /  38.5 / 8.5      15px / 700 / right
previewBackground = null
```

**Independence is structural.** Each profile is deep-cloned from the baseline, so
the three share no object: not the field array, not a field, not the geometry,
not the placement. Editing one cannot reach another — proven by identity
assertions across every pair and by an in-place mutation test.

**No Gulf image.** `previewBackground` is `null` for both. A template with no
photo of its own opens on a bare surface; it never borrows another bank's cheque.
Any preview image, whenever it arrives, stays preview-only and is structurally
absent from the printed subtree.

**The date is one block** with internal day / month / year slots for every bank —
never three separate designer fields.

---

## Why PROVISIONAL, not APPROVED

The numbers are a working baseline, not measurements of a KFH or an NBK cheque,
and nobody has printed one to check. "I can calibrate this" and "its measurements
are confirmed" are different claims, and only the first is true yet.

The printability guard checks status **before** geometry, so a complete geometry
cannot talk its way past it:

```
!isProfileCalibratable  → PROFILE_NOT_CALIBRATED_MESSAGE
status === PROVISIONAL  → PROFILE_PROVISIONAL_MESSAGE
status !== APPROVED     → PROFILE_NOT_CALIBRATED_MESSAGE
otherwise               → ok
```

Production printing is blocked in three places on the cheques page: the print
button is disabled, the single-cheque path refuses, and a batch is refused whole
with the offending cheque numbers named. The message:

> «قالب هذا البنك إعداد افتراضي ولم يُطابَق بعد مع الشيك الأصلي. عاير القالب على شيك البنك ثم اعتمده قبل الطباعة الإنتاجية.»

Test print from the studio stays available — that is what calibration needs, and
it never marks a cheque printed.

---

## One studio, three templates

`ChequeStudioOverlay` gained a template selector reading `BANK_CHEQUE_PROFILES`
(the shell keeps no list of its own). Every calibratable template opens the SAME
full studio: designer, drag / resize / rotate / nudge, alignment guides,
undo-redo, properties panel, data binding, live preview, save, restore default,
test print and the global sheet offsets.

Per-bank isolation runs through the whole session: each template opens its own
document (its own settings row merged over its own factory), saves to its own
key, restores to its own baseline, and remounts on the bank code so edits cannot
leak between templates.

```
GULF_BANK → cheque.calibration.gulf-a4.v1
KFH       → cheque.calibration.kfh-a4.v1
NBK       → cheque.calibration.nbk-a4.v1
```

---

## When each bank's specimen arrives

Edit that bank's entry only — `chequeGeometry`, `placement`, `previewBackground`,
`fields`, and `status: 'APPROVED'` once a real printed cheque is approved. Then
fine-tune in the same studio. No engine change, no new code path.

---

## Validation

| Check | Result |
|---|---|
| Targeted suites (registry, selector, and the three Gulf suites) | **126 tests passed** |
| Full frontend suite | **180 suites passed** |
| `tsc --noEmit` (frontend) | clean |
| `build:front` | passed |
| Schema / migration / permission keys / API | **none** |

No installer was rebuilt in this release.
