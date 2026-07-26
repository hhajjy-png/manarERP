# Employment Contract Form — Design Spec
**Date:** 2026-06-18  
**Feature:** نموذج عقد العمل الرسمي (ثنائي اللغة)  
**Source file:** `docs/contractv2.xlsx`  
**Status:** Approved — ready for implementation plan

---

## 1. Goal

Convert `contractv2.xlsx` (Kuwait Public Authority for Manpower employment contract template) into a printable HTML form inside manarERP, bound to employee data, with a pre-print customization dialog. Output: 2 A4 pages, bilingual (English left | Arabic right).

---

## 2. Source File Analysis

### Sheets
| Sheet | Purpose |
|-------|---------|
| Contract | The printable contract — 2 columns (A=English, B=Arabic), 26 rows |
| نموذج ادخال | Data entry — employee lookup + contract-specific fields |
| قاعدة بيانات الموظفين | Employee database (XLOOKUP source) |
| Claude Log | Session log (irrelevant) |

### Contract Sheet Layout
- **Column A** (width≈62): English text, LTR
- **Column B** (width≈58): Arabic text, RTL
- **Page setup:** A4 portrait, scale=81%, margins left/right=0.3in, top=0.3in, bottom=0.2in
- **Merged cells:** A1:B1 (emblem), A2:B2 (authority header), A14:B14 (note), A26:B26 (note)

### Contract Rows (26 total)
| Row | Content |
|-----|---------|
| 1 | Kuwait Public Authority emblem image (full-width) |
| 2 | Authority name — bilingual centered header |
| 3 | Contract title — "Sample Form…" | "نموذج عقد عمل إسترشادي…" |
| 4 | State of Kuwait preamble + issue date + location |
| 5 | First party (company) block |
| 6 | Second party (employee) block |
| 7 | Preamble (تمهيد) |
| 8 | Article 1 — Preamble integral part |
| 9 | Article 2 — Nature of work |
| 10 | Article 3 — Probation period |
| 11 | Article 4 — Wage |
| 12 | Article 5 — Contract coming into force |
| 13 | Article 6 — Contract term |
| 14 | Note (full-width, small text) |
| 15 | Article 7 — Annual leave |
| 16 | Article 8 — Work hours |
| 17 | Article 9 — Travel ticket |
| 18 | Article 10 — Insurance |
| 19 | Article 11 — End of service |
| 20 | Article 12 — Applicable law |
| 21 | Article 13 — Special conditions |
| 22 | Article 14 — Specialized court |
| 23 | Article 15 — Contract language |
| 24 | Article 16 — Contract copies |
| 25 | Signatures: Second Party (left) | First Party (right) |
| 26 | Note (full-width) |

### Images in XLSX
- `xl/media/image1.png` — Kuwait Public Authority emblem (15,700 bytes)
- `xl/media/image2.png` — Date picker UI artifact (irrelevant, do not use)

---

## 3. Dynamic vs. Static Fields

### From Employee Model (already in DB)
| Contract Field | Employee Field |
|---------------|---------------|
| اسم الموظف (عربي) | `fullName` |
| Employee Name (English) | `fullNameEn` |
| الرقم المدني | `civilId` |
| الجنسية (عربي) | `nationality` |
| الجنسية (إنجليزي) | `contractTranslations.nationalityEn(nationality)` |
| رقم الجواز | `passportNumber` |
| المهنة (عربي) | `jobTitle` |
| المهنة (إنجليزي) | `contractTranslations.jobTitleEn(jobTitle)` |
| الراتب الشهري | `salary` |

### From Pre-Print Dialog (ephemeral, not persisted)
| Field | Default | Input Type |
|-------|---------|-----------|
| تاريخ تحرير العقد | today | `<input type="date">` |
| تاريخ بداية نفاذ العقد | today | `<input type="date">` |
| مدة العقد | سنة | `<select>` (سنة / سنتين / ثلاث سنوات) |
| فترة التجربة (أيام) | 100 | `<input type="number">` |
| الإجازة السنوية (أيام) | 30 | `<input type="number">` |
| الشروط الخاصة — عربي | لايوجد | `<input type="text">` |
| الشروط الخاصة — إنجليزي | NOTHING | `<input type="text">` |
| وضع الطباعة | full-template | `<select>` (PrintMode) |

### Fixed Constants (hardcoded)
| Field | Value |
|-------|-------|
| اسم الشركة (عربي) | شركة المنار الدولية لانشاء واصلاح الطرق والشوارع والأرصفة |
| اسم الشركة (إنجليزي) | ALAMANAR ALDAWLIYA |
| مجال عمل الشركة (عربي) | صيانة الشوارع |
| مجال عمل الشركة (إنجليزي) | STREET CONS. |
| ممثل الطرف الأول (عربي) | حسن فلاح نايف الحاجي |
| ممثل الطرف الأول (إنجليزي) | HASSAN FALAH NAYEF |
| الرقم المدني للطرف الأول | 282081000827 |
| المحافظة | الفروانية |

---

## 4. Architecture

### New Files
| File | Purpose |
|------|---------|
| `frontend/src/pages/EmploymentContract.tsx` | Page component: fetches employee, shows dialog, renders template |
| `frontend/src/forms/EmploymentContractTemplate.tsx` | Bilingual HTML template — 2-column grid |
| `frontend/src/forms/shared/contractTranslations.ts` | Static lookup: nationality/jobTitle Arabic → English |
| `frontend/public/contract_emblem.png` | Kuwait emblem image (copied from XLSX) |

### Modified Files
| File | Change |
|------|--------|
| `frontend/src/pages/Forms.tsx` | Add "عقد العمل" card to FORM_CARDS array |
| `frontend/src/App.tsx` | Add route `/forms/employment-contract/:employeeId` |
| `backend/src/modules/forms/forms.service.ts` | Add `getEmploymentContractData(employeeId)` |
| `backend/src/modules/forms/forms.controller.ts` | Add `getEmploymentContract` handler |
| `backend/src/modules/forms/forms.routes.ts` | Add `GET /employment-contract/:employeeId` |

### No DB changes — No Migration required

---

## 5. Data Flow

```
Forms.tsx
  └─ Employee selector (existing)
  └─ "عقد العمل" card → Print button
        ↓
  navigate('/forms/employment-contract/:employeeId')
        ↓
EmploymentContract.tsx
  ├─ useEffect: GET /api/forms/employment-contract/:employeeId → employee data
  ├─ State: contractParams (dialog fields, all with defaults)
  ├─ State: dialogOpen=true, ready=false
  │
  ├─ [Dialog visible] — user fills/confirms fields
  │     ↓ onConfirm
  ├─ dialogOpen=false, ready=true
  │
  └─ FormLayout (ready=true) → auto-print after 600ms
        └─ EmploymentContractTemplate (employee + contractParams)
```

---

## 6. Template Layout (Bilingual 2-Column)

### CSS Structure
```
.form-page (A4, no global direction)
  ├── FormHeader (letterhead mode support)
  │
  ├── .contract-full-row  ← row 1: emblem image, centered
  ├── .contract-full-row  ← row 2: authority name
  │
  └── .contract-rows-wrapper
        ├── .contract-row (grid: 1fr 1fr, gap: 1px border)
        │     ├── .col-en (direction:ltr, text-align:left, padding:6px 8px)
        │     └── .col-ar (direction:rtl, text-align:right, padding:6px 8px)
        │
        ├── [rows 3–15: page 1 content]
        │
        ├── .page-break (break-after: page)   ← Page break here
        │
        ├── [rows 16–24: page 2 content]
        │
        ├── .contract-signature-row
        └── .contract-full-row  ← note
```

### Page 1 Content (rows 1–15)
- Kuwait emblem + Authority header (full-width)
- Contract title row
- State of Kuwait preamble + date
- First party block
- Second party block
- Preamble paragraph
- Articles 1–7

### Page 2 Content (rows 16–26)
- Articles 8–16
- Signature section: Second Party (left) | First Party (right)
- Disclaimer note (full-width)

### Print CSS
```css
@media print {
  @page { size: A4; margin: 0; }
  .form-page {
    width: 210mm;
    padding: 8mm;
    font-size: 8.5pt;
    line-height: 1.4;
  }
  .page-break { break-after: page; }
  .contract-row { page-break-inside: avoid; }
  .no-print { display: none; }
}
```

---

## 7. Translation Table (`contractTranslations.ts`)

### Nationalities (Arabic → English)
All nationalities found in current employee database + common additions:
- هندي / هندية → INDIAN
- باكستاني / باكستانية → PAKISTANI
- مصري / مصرية → EGYPTIAN
- سوري / سورية → SYRIAN
- تركي / تركية → TURKISH
- بنغلاديشي → BANGLADESHI
- فلبيني / فلبينية → FILIPINO
- نيبالي → NEPALESE
- سريلانكي → SRI LANKAN
- كويتي / كويتية → KUWAITI

### Job Titles (Arabic → English)
Common titles found in the XLSX employee data:
- سائق شاحنة → HEAVY DRIVER
- سائق عموم آليات الطرق → GENERAL ROAD EQUIPMENT DRIVER
- سائق سيارة خصوصي → PRIVATE CAR DRIVER
- مندوب مبيعات → SALES REPRESENTATIVE
- عامل → WORKER
- فني → TECHNICIAN

### Fallback
If translation not found → return the original Arabic string unchanged. Never throws or shows empty.

---

## 8. Backend Endpoint

```
GET /api/forms/employment-contract/:employeeId
Auth: authenticate + requirePermission('forms.view')
Response: { employee: Employee }
```

`getEmploymentContractData` in `forms.service.ts`:
```typescript
async getEmploymentContractData(employeeId: number) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw AppError.notFound('الموظف غير موجود');
  return { employee };
}
```

---

## 9. Expected Fidelity

| Aspect | Fidelity | Notes |
|--------|---------|-------|
| All 16 articles text | 100% | Exact text from shared strings |
| Bilingual 2-column layout | 95% | Grid vs. Excel cells — close but not pixel-perfect |
| Dynamic data binding | 100% | Employee fields + dialog inputs |
| 2-page A4 output | 100% | Hard page break after Article 7 |
| Kuwait emblem image | 100% | Copied directly from XLSX |
| Font (Cairo) | 100% | Already used in all forms |
| Signature section | 95% | CSS box vs. Excel cell styling |
| Row heights precision | ~75% | HTML line-height approximation |
| Overall fidelity | ~88% | Very close; not pixel-perfect |

---

## 10. Out of Scope

- Storing generated contracts in DB — not required, no migration
- Contract model integration — explicitly excluded
- English-only or Arabic-only print modes — bilingual only
- Salary written in words (كتابة الراتب بالحروف) — not implemented (Excel had complex formulas for this)

---

## 11. Quality Gate Checklist

After implementation, run:
- [ ] `cd frontend && npx tsc --noEmit`
- [ ] `cd backend && npx tsc --noEmit`
- [ ] `tsc -p electron/tsconfig.json --noEmit`
- [ ] `cd backend && npx prisma validate`
- [ ] `cd backend && npm test`

---

*Spec written 2026-06-18. Approved by user before implementation.*
