# Employment Contract Form — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bilingual (English left | Arabic right) employment contract form to manarERP that fetches employee data, shows a pre-print customization dialog, and renders a 2-page A4 printable document matching `docs/contractv2.xlsx`.

**Architecture:** The form bypasses `FormLayout` (designed for company admin forms) and uses a self-contained custom print wrapper. A pre-print dialog collects 7 contract-specific parameters before the template renders. Manual print button only — no auto-print. Backend adds one read-only GET endpoint to the existing `forms` module.

**Tech Stack:** React 18 + TypeScript (frontend), Express + Prisma read-only (backend), CSS-in-JS inline styles, Vite public folder for the emblem image.

## Global Constraints

- **No DB migration** — Prisma schema untouched
- **Backend read-only** — `GET /api/forms/employment-contract/:employeeId` only; no writes to employee data
- **Permission:** `forms.read` (exact string used by all other form routes — confirmed in `forms.routes.ts`)
- **Bilingual layout:** English LTR left column, Arabic RTL right column, `1fr 1fr` grid
- **NO auto-print** — `window.print()` is called only from a button `onClick`; never from `useEffect`
- **2 pages exactly** — hard `break-after: page` CSS after Article 7 (row 15 of 26)
- **Must not touch** existing 8 form files (`SalaryCertificate`, `LeaveRequest`, etc.)
- **Font:** `'Cairo', 'Tajawal', Arial, sans-serif` — already loaded globally, no new imports

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `frontend/public/contract_emblem.png` | Kuwait Public Authority emblem image |
| Create | `frontend/src/forms/shared/contractTranslations.ts` | Nationality + job-title Arabic → English lookup |
| Create | `frontend/src/forms/EmploymentContractTemplate.tsx` | Full bilingual HTML contract (26 rows, 16 articles) |
| Create | `frontend/src/pages/EmploymentContract.tsx` | Page: fetches employee, shows dialog, wraps template |
| Modify | `frontend/src/forms/shared/formNumber.ts` | Add `'employment-contract': 'EMP'` prefix |
| Modify | `backend/src/modules/forms/forms.service.ts` | Add `getEmploymentContractData(employeeId)` |
| Modify | `backend/src/modules/forms/forms.controller.ts` | Add `getEmploymentContract` handler |
| Modify | `backend/src/modules/forms/forms.routes.ts` | Add `GET /employment-contract/:employeeId` |
| Modify | `frontend/src/pages/Forms.tsx` | Add employment contract card to `FORM_CARDS` |
| Modify | `frontend/src/App.tsx` | Add route + import |
| Create | `backend/src/modules/forms/__tests__/forms.service.test.ts` | Unit tests for `getEmploymentContractData` |

---

## Task 1 — Assets: Emblem Image + Translation Table

**Files:**
- Create: `frontend/public/contract_emblem.png`
- Create: `frontend/src/forms/shared/contractTranslations.ts`

**Interfaces Produced:**
```typescript
// contractTranslations.ts
export function getNationalityEn(ar: string | null | undefined): string
export function getJobTitleEn(ar: string | null | undefined): string
// Both return the English equivalent, or the original Arabic string if not found (never empty/throws)
```

- [ ] **Step 1.1 — Copy emblem image from docs to public folder**

The emblem was extracted during analysis and saved to `docs/contract_image1.png`. Copy it:

```powershell
Copy-Item "docs\contract_image1.png" "frontend\public\contract_emblem.png" -Force
```

Verify:
```powershell
(Get-Item "frontend\public\contract_emblem.png").Length
```
Expected: `15700` (bytes).

- [ ] **Step 1.2 — Create `contractTranslations.ts`**

Create `frontend/src/forms/shared/contractTranslations.ts`:

```typescript
const NATIONALITY_EN: Record<string, string> = {
  'هندي': 'INDIAN',
  'هندية': 'INDIAN',
  'باكستاني': 'PAKISTANI',
  'باكستانية': 'PAKISTANI',
  'مصري': 'EGYPTIAN',
  'مصرية': 'EGYPTIAN',
  'سوري': 'SYRIAN',
  'سورية': 'SYRIAN',
  'تركي': 'TURKISH',
  'تركية': 'TURKISH',
  'بنغلاديشي': 'BANGLADESHI',
  'بنغلاديشية': 'BANGLADESHI',
  'فلبيني': 'FILIPINO',
  'فلبينية': 'FILIPINO',
  'نيبالي': 'NEPALESE',
  'نيبالية': 'NEPALESE',
  'سريلانكي': 'SRI LANKAN',
  'سريلانكية': 'SRI LANKAN',
  'كويتي': 'KUWAITI',
  'كويتية': 'KUWAITI',
  'أردني': 'JORDANIAN',
  'أردنية': 'JORDANIAN',
  'يمني': 'YEMENI',
  'يمنية': 'YEMENI',
  'إثيوبي': 'ETHIOPIAN',
  'إثيوبية': 'ETHIOPIAN',
  'إندونيسي': 'INDONESIAN',
  'إندونيسية': 'INDONESIAN',
};

const JOB_TITLE_EN: Record<string, string> = {
  'سائق شاحنة': 'HEAVY DRIVER',
  'سائق عموم آليات الطرق': 'GENERAL ROAD EQUIPMENT DRIVER',
  'سائق سيارة خصوصي': 'PRIVATE CAR DRIVER',
  'مندوب مبيعات': 'SALES REPRESENTATIVE',
  'عامل': 'WORKER',
  'عامل عام': 'GENERAL WORKER',
  'فني': 'TECHNICIAN',
  'فني صيانة': 'MAINTENANCE TECHNICIAN',
  'مشرف': 'SUPERVISOR',
  'مهندس': 'ENGINEER',
  'محاسب': 'ACCOUNTANT',
  'حارس': 'GUARD',
  'سائق': 'DRIVER',
};

export function getNationalityEn(ar: string | null | undefined): string {
  if (!ar) return '';
  return NATIONALITY_EN[ar.trim()] ?? ar;
}

export function getJobTitleEn(ar: string | null | undefined): string {
  if (!ar) return '';
  return JOB_TITLE_EN[ar.trim()] ?? ar;
}
```

- [ ] **Step 1.3 — Type-check the new translation file**

```powershell
cd frontend; npx tsc --noEmit 2>&1 | Select-String "contractTranslations"
```

Expected: no output (zero errors in this file).

- [ ] **Step 1.4 — Commit**

```bash
git add frontend/public/contract_emblem.png frontend/src/forms/shared/contractTranslations.ts
git commit -m "feat(forms): add contract emblem image and Arabic-English translation table"
```

---

## Task 2 — Backend: GET Endpoint

**Files:**
- Create: `backend/src/modules/forms/__tests__/forms.service.test.ts`
- Modify: `backend/src/modules/forms/forms.service.ts` (add after `getPerformanceEvaluationData`)
- Modify: `backend/src/modules/forms/forms.controller.ts` (add after `getPerformanceEvaluation`)
- Modify: `backend/src/modules/forms/forms.routes.ts` (add before `print-log` line)

**Interfaces Produced:**
```
GET /api/forms/employment-contract/:employeeId
Auth: forms.read permission (router.use(authenticate) already present)
Response: { success: true, data: { employee: Employee } }
```

- [ ] **Step 2.1 — Write the failing test**

Create `backend/src/modules/forms/__tests__/forms.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FormsService } from '../forms.service';

vi.mock('../../../config/database', () => ({
  prisma: {
    employee: { findUnique: vi.fn() },
    payroll: { findFirst: vi.fn() },
    leave: { findFirst: vi.fn() },
    payrollAdvance: { findFirst: vi.fn() },
    performanceReview: { findFirst: vi.fn() },
  },
}));

import { prisma } from '../../../config/database';

const MOCK_EMPLOYEE = {
  id: 1,
  code: 'EMP001',
  fullName: 'محمد أحمد',
  fullNameEn: 'Mohammad Ahmad',
  civilId: '123456789',
  jobTitle: 'سائق شاحنة',
  nationality: 'هندي',
  passportNumber: 'A1234567',
  passportExpiry: null,
  residencyExpiry: null,
  licenseExpiry: null,
  vehiclePlate: null,
  vehicleLicenseExpiry: null,
  birthDate: null,
  company: null,
  department: null,
  salary: 150,
  hireDate: new Date('2024-01-01'),
  phone: null,
  email: null,
  address: null,
  photoPath: null,
  status: 'ACTIVE',
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('FormsService — getEmploymentContractData', () => {
  const service = new FormsService();

  beforeEach(() => vi.clearAllMocks());

  it('returns employee data for a valid employee ID', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(MOCK_EMPLOYEE as any);

    const result = await service.getEmploymentContractData(1);

    expect(prisma.employee.findUnique).toHaveBeenCalledWith({ where: { id: 1 } });
    expect(result.employee.id).toBe(1);
    expect(result.employee.fullName).toBe('محمد أحمد');
    expect(result.employee.salary).toBe(150);
  });

  it('throws AppError with Arabic message when employee not found', async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null);

    await expect(service.getEmploymentContractData(99)).rejects.toMatchObject({
      message: 'الموظف غير موجود',
    });
  });
});
```

- [ ] **Step 2.2 — Run test to confirm it fails**

```powershell
cd backend; npx vitest run src/modules/forms/__tests__/forms.service.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: FAIL — `TypeError: service.getEmploymentContractData is not a function`

- [ ] **Step 2.3 — Add service method to `forms.service.ts`**

In `backend/src/modules/forms/forms.service.ts`, add this method immediately before `logFormPrint`:

```typescript
  async getEmploymentContractData(employeeId: number) {
    const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw AppError.notFound('الموظف غير موجود');
    return { employee };
  }
```

- [ ] **Step 2.4 — Run test to confirm it passes**

```powershell
cd backend; npx vitest run src/modules/forms/__tests__/forms.service.test.ts --reporter=verbose 2>&1 | tail -15
```

Expected: both tests PASS.

- [ ] **Step 2.5 — Add controller handler to `forms.controller.ts`**

In `backend/src/modules/forms/forms.controller.ts`, add this after `getPerformanceEvaluation`:

```typescript
  async getEmploymentContract(req: Request, res: Response) {
    ok(res, await formsService.getEmploymentContractData(Number(req.params.employeeId)));
  },
```

- [ ] **Step 2.6 — Add route to `forms.routes.ts`**

In `backend/src/modules/forms/forms.routes.ts`, add this line before the `print-log` line:

```typescript
router.get('/employment-contract/:employeeId', requirePermission('forms.read'), asyncHandler(formsController.getEmploymentContract));
```

- [ ] **Step 2.7 — Verify backend TypeScript**

```powershell
cd backend; npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 2.8 — Commit**

```bash
git add backend/src/modules/forms/__tests__/forms.service.test.ts \
         backend/src/modules/forms/forms.service.ts \
         backend/src/modules/forms/forms.controller.ts \
         backend/src/modules/forms/forms.routes.ts
git commit -m "feat(forms): add employment contract backend endpoint with tests"
```

---

## Task 3 — Frontend: Contract Template Component

**Files:**
- Modify: `frontend/src/forms/shared/formNumber.ts` (add EMP prefix)
- Create: `frontend/src/forms/EmploymentContractTemplate.tsx`

**Interfaces Produced:**
```typescript
// Exported from EmploymentContractTemplate.tsx:

export interface ContractParams {
  issueDate: string;           // 'YYYY-MM-DD'
  startDate: string;           // 'YYYY-MM-DD'
  durationAr: string;          // 'سنة' | 'سنتين' | 'ثلاث سنوات'
  durationEn: string;          // 'ONE YEAR' | 'TWO YEARS' | 'THREE YEARS'
  probationDays: number;
  annualLeaveDays: number;
  specialConditionsAr: string;
  specialConditionsEn: string;
}

export interface ContractEmployee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn: string | null;
  civilId: string | null;
  jobTitle: string | null;
  nationality: string | null;
  passportNumber: string | null;
  salary: number;
}

// Default export:
export default function EmploymentContractTemplate(props: {
  employee: ContractEmployee;
  params: ContractParams;
}): JSX.Element
```

- [ ] **Step 3.1 — Add EMP prefix to `formNumber.ts`**

In `frontend/src/forms/shared/formNumber.ts`, add `'employment-contract': 'EMP'` to the `PREFIXES` object:

```typescript
const PREFIXES: Record<string, string> = {
  'salary-certificate': 'SAL',
  'to-whom-it-may-concern': 'TWM',
  'leave-request': 'LV',
  'return-to-work': 'RTW',
  'salary-advance': 'ADV',
  resignation: 'RES',
  'employee-warning': 'WRN',
  'performance-evaluation': 'EVA',
  'employment-contract': 'EMP',   // ← add this line
};
```

- [ ] **Step 3.2 — Create `EmploymentContractTemplate.tsx`**

Create `frontend/src/forms/EmploymentContractTemplate.tsx` with the complete code below.

Design notes:
- All inline styles — no external CSS classes needed
- `whiteSpace: 'pre-line'` on columns lets `\n` in strings become line breaks
- Page break is a `<div style={{ breakAfter: 'page' }}>` — invisible on screen, forces new page in print
- The `<style>` tag overrides font-size to `8.5pt` in print so content fits 2 pages

```tsx
import { getNationalityEn, getJobTitleEn } from './shared/contractTranslations';

export interface ContractParams {
  issueDate: string;
  startDate: string;
  durationAr: string;
  durationEn: string;
  probationDays: number;
  annualLeaveDays: number;
  specialConditionsAr: string;
  specialConditionsEn: string;
}

export interface ContractEmployee {
  id: number;
  code: string;
  fullName: string;
  fullNameEn: string | null;
  civilId: string | null;
  jobTitle: string | null;
  nationality: string | null;
  passportNumber: string | null;
  salary: number;
}

const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const EN_DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function dmy(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
  .no-print { display: none !important; }
  .ec-wrapper {
    font-size: 8.5pt !important;
    line-height: 1.45 !important;
    width: 210mm !important;
    padding: 8mm !important;
    box-sizing: border-box !important;
  }
  .ec-row { page-break-inside: avoid !important; }
  .ec-page-break { break-after: page !important; }
}
`;

const wrap: React.CSSProperties = {
  border: '1px solid #9ca3af',
  fontFamily: "'Cairo', 'Tajawal', Arial, sans-serif",
  fontSize: 12,
  color: '#111827',
  background: '#fff',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};

const fullRow: React.CSSProperties = {
  borderBottom: '1px solid #9ca3af',
  padding: '6px 10px',
  textAlign: 'center',
};

const twoCol: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1fr 1fr',
  borderBottom: '1px solid #9ca3af',
};

const en: React.CSSProperties = {
  padding: '5px 8px',
  direction: 'ltr',
  textAlign: 'left',
  borderRight: '1px solid #9ca3af',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
};

const ar: React.CSSProperties = {
  padding: '5px 8px',
  direction: 'rtl',
  textAlign: 'right',
  whiteSpace: 'pre-line',
  verticalAlign: 'top',
};

const bold: React.CSSProperties = { fontWeight: 700, color: '#1d4e6f' };

const NOTE =
  'ملاحظة / هذا النموذج يعد نموذجا إسترشاديا لشروط وأحكام عقد العمل في القطاع الأهلي ، ويحق لكل شركة إعداد نموذج مماثلا له على المطبوعات الخاصة بها شرط أن يتضمن كافة الأحكام والشروط الواردة بهذا النموذج';

export default function EmploymentContractTemplate({
  employee: emp,
  params,
}: {
  employee: ContractEmployee;
  params: ContractParams;
}) {
  const jobTitleEn = getJobTitleEn(emp.jobTitle);
  const natEn = getNationalityEn(emp.nationality);
  const issueD = new Date(params.issueDate);
  const issueFmt = dmy(params.issueDate);
  const startFmt = dmy(params.startDate);
  const sal = Math.round(emp.salary);
  const dayAr = AR_DAYS[issueD.getDay()];
  const dayEn = EN_DAYS[issueD.getDay()];

  return (
    <>
      <style>{PRINT_CSS}</style>

      <div className="ec-wrapper" style={wrap}>

        {/* Row 1 — Emblem */}
        <div style={{ ...fullRow, padding: '10px' }}>
          <img src="/contract_emblem.png" alt="Kuwait Public Authority Emblem"
            style={{ height: 56, objectFit: 'contain' }} />
        </div>

        {/* Row 2 — Authority name */}
        <div style={{ ...fullRow, fontWeight: 700 }}>
          <div style={{ fontSize: 13 }}>الهـيئة العـامة للقـوى العـاملة</div>
          <div style={{ fontSize: 11, fontWeight: 400 }}>The Public Authority For Manpower</div>
        </div>

        {/* Row 3 — Contract title */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>Sample Form of an Employment Contract in the Civil Sector</div>
          <div style={ar}>نموذج عقد عمل إسترشادي في القطاع الأهلي</div>
        </div>

        {/* Row 4 — State of Kuwait preamble */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`State of Kuwait\nPublic Authority for Manpower / Labour Department Farwanya\nOn ${dayEn} corresponding to ${issueFmt} the present contract was concluded by and between:`}</div>
          <div style={ar}>{`دولة الكويت\nالهيئة العامة للقوى العاملة / إدارة عمل محافظة الفروانية\nإنه في يوم ${dayAr} الموافق ${issueFmt} تحرر هذا العقد بين كل من:-`}</div>
        </div>

        {/* Row 5 — First party */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`1.  Company/ ALAMANAR ALDAWLIYA\nrepresented in signature in the present contract by:\nName: HASSAN FALAH NAYEF\nCivil card: 282081000827\n(First party)`}</div>
          <div style={ar}>{`1- شركة / شركة المنار الدولية لانشاء واصلاح الطرق والشوارع والأرصفة\nويمثلها في التوقيع على العقد\nالاسم: حسن فلاح نايف الحاجي\nرقم مدني: 282081000827\n" طرف أول "`}</div>
        </div>

        {/* Row 6 — Second party */}
        <div className="ec-row" style={twoCol}>
          <div style={en}>{`2.  Name: ${emp.fullNameEn ?? emp.fullName}\nNationality: ${natEn}\nCivil Card: ${emp.civilId ?? '—'}\nPassport No.: ${emp.passportNumber ?? '—'}\n(Second party)`}</div>
          <div style={ar}>{`2- الاسم: ${emp.fullName}\nالجنسية: ${emp.nationality ?? '—'}\nالرقم المدني: ${emp.civilId ?? '—'}\nرقم الجواز: ${emp.passportNumber ?? '—'}\n" طرف ثان "`}</div>
        </div>

        {/* Row 7 — Preamble */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Preamble</span>{`\nThe first party owns the facility entitled ALAMANAR ALDAWLIYA working in the field of STREET CONS. whereas it wishes to conclude a contract with the second party to work for it in the profession of ${jobTitleEn}; whereas the parties acknowledged their capacity to conclude this contract, they agreed upon the following:`}</div>
          <div style={ar}><span style={bold}>تمهيد</span>{`\nيمتلك الطرف الأول منشأة بإسم شركة المنار الدولية لانشاء واصلاح الطرق والشوارع والأرصفة تعمل في مجال صيانة الشوارع ويرغب في التعاقد مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'} وبعد أن أقر الطرفان بأهليتهما في إبرام هذا العقد تم الاتفاق على ما يلي :`}</div>
        </div>

        {/* Row 8 — Article 1 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article One</span>{'\nThe preamble above shall constitute an integral part of the present contract.'}</div>
          <div style={ar}><span style={bold}>البند الأول</span>{'\nيعتبر التمهيد السابق جزء لا يتجزأ من هذا العقد .'}</div>
        </div>

        {/* Row 9 — Article 2 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Two "Nature of the Work"</span>{`\nThe first party concluded a contract with the second party to work for it in the profession of ${jobTitleEn} in the State of Kuwait.`}</div>
          <div style={ar}><span style={bold}>البند الثاني " طبيعة العمل"</span>{`\nتعاقد الطرف الأول مع الطرف الثاني للعمل لديه بمهنة ${emp.jobTitle ?? '—'} داخل دولة الكويت`}</div>
        </div>

        {/* Row 10 — Article 3 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Three "Probation Period"</span>{`\nThe second party shall be subject to a probation period for a term not exceeding ${params.probationDays} work days. Each party shall have the right to terminate the contract during the said term without notification.`}</div>
          <div style={ar}><span style={bold}>البند الثالث " فترة التجربة"</span>{`\nيخضع الطرف الثاني لفترة تجربة لمدة لا تزيد عن ${params.probationDays} يوم عمل ، ويحق لكل طرف إنهاء العقد خلال تلك الفترة دون إخطار .`}</div>
        </div>

        {/* Row 11 — Article 4 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Four "Lease Value"</span>{`\nFor executing the present contract, the second party shall receive the wage of ${sal} dinars to be paid at the end of every month. The first party may not decrease the wage during the term of the contract. It may not transfer the second party to daily wage without his approval.`}</div>
          <div style={ar}><span style={bold}>البند الرابع " قيمة الأجر"</span>{`\nيتقاضى الطرف الثاني عن تنفيذ هذا العقد أجرا مقداره ${sal} دينارا يدفع في نهاية كل شهر ، ولا يجوز للطرف الأول تخفيض الأجر أثناء سريان هذا العقد . ولا يجوز نقل الطرف الثاني إلى الأجر اليومي دون موافقته .`}</div>
        </div>

        {/* Row 12 — Article 5 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Five "Contract Term"</span>{`\nThe contract shall come into force on ${startFmt} The second party shall execute his work during the entire execution term thereof.`}</div>
          <div style={ar}><span style={bold}>البند الخامس " نفاذ العقد"</span>{`\nيبدأ نفاذ العقد إعتبارا من ${startFmt} ويلتزم الطرف الثاني بالقيام بأداء عمله طوال مدة نفاذه`}</div>
        </div>

        {/* Row 13 — Article 6 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Six "Contract Term"</span>{`\nThe present contract has a definite term. It shall come into force on ${startFmt} for a term of ${params.durationEn}. The contract may be renewed with the approval of the parties for similar terms not exceeding five years. The present contract has an indefinite term and it shall come into force on .\n*Considering the contract as having a definite or indefinite term shall be subject to the will of the two parties.`}</div>
          <div style={ar}><span style={bold}>البند السادس " مدة العقد"</span>{`\n- هذا العقد محدد المدة ويبدأ إعتبارا من ${startFmt} ولمدة ${params.durationAr} ، ويجوز تجديد العقد بموافقة الطرفين لمدة مماثلة بحد أقصى خمس سنوات ميلادية\n- هذا العقد غير محدد المدة ويبدأ إعتبارا من \n* إعتبار العقد محدد المدة أو غير محدد المدة يخضع إختياره لإرادة الطرفين`}</div>
        </div>

        {/* Row 14 — Note (full-width) */}
        <div style={{ ...fullRow, fontSize: 9, color: '#6b7280', direction: 'rtl', textAlign: 'right' }}>{NOTE}</div>

        {/* Row 15 — Article 7 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Seven "Annual Leave"</span>{`\nThe second party shall have the right to a paid annual leave with a term of ${params.annualLeaveDays} days. It shall not be due on the first year save after the expiration of nine months to be calculated from the date of the contract coming into force.`}</div>
          <div style={ar}><span style={bold}>البند السابع " الإجازة السنوية"</span>{`\nللطرف الثاني الحق في إجازة سنوية مدفوعة الأجر مدتها ${params.annualLeaveDays} يوما ، ولا يستحقها عن السنة الأولى الإ بعد انقضاء مدة تسعة أشهر تحسب من تاريخ نفاذ العقد .`}</div>
        </div>

        {/* ═══════════ PAGE BREAK ═══════════ */}
        <div className="ec-page-break" style={{ breakAfter: 'page' }} />

        {/* Row 16 — Article 8 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Eight "Number of Work Hours"</span>{'\nThe first party may not require that the second party work for a term exceeding eight daily work hours with rest periods not less than one hour, except for the cases set forth in the law.'}</div>
          <div style={ar}><span style={bold}>البند الثامن " عدد ساعات العمل"</span>{'\nلا يجوز للطرف الأول تشغيل الطرف الثاني لمدة تزيد عن ثماني ساعات عمل يوميا تتخللها فترة راحة لا تقل عن ساعة باستثناء الحالات المقررة قانونا .'}</div>
        </div>

        {/* Row 17 — Article 9 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Nine "Ticket Value"</span>{'\nThe first party shall bear the expenses of the return of the second party to his country after the expiration of the work relationship and his final departure from the country.'}</div>
          <div style={ar}><span style={bold}>البند التاسع " قيمة تذكرة السفر"</span>{'\nيتحمل الطرف الأول مصاريف عودة الطرف الثاني إلى بلده عند إنتهاء علاقة العمل ومغادرته نهائيا للبلاد .'}</div>
        </div>

        {/* Row 18 — Article 10 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Ten "Insurance against Injuries and Work Maladies"</span>{'\nThe first party shall insure the second party against injuries and work maladies. It shall also commit to the health insurance value in accordance with the law No. (1) of the year 1999.'}</div>
          <div style={ar}><span style={bold}>البند العاشر " التأمين ضد إصابات وأمراض العمل"</span>{'\nيلتزم الطرف الأول بالتأمين على الطرف الثاني ضد إصابات وأمراض العمل ، كما يلتزم بقيمة التأمين الصحي طبقا للقانون رقم )1( لسنة 1999 .'}</div>
        </div>

        {/* Row 19 — Article 11 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Eleven "End of Service Benefit"</span>{'\nThe second party shall be due the end of service benefit as set forth in the regulating laws.'}</div>
          <div style={ar}><span style={bold}>البند الحادي عشر " مكافأة نهاية الخدمة"</span>{'\nيستحق الطرف الثاني مكافأة نهاية الخدمة المنصوص عليها بالقوانين المنظمة'}</div>
        </div>

        {/* Row 20 — Article 12 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Twelve "Applicable Law"</span>{'\nThe provisions of the Labour code in the civil sector No. 6 of 2010 and the decisions executing the same shall apply for all matters not provided for in the present contract. Shall be considered null every condition agreed upon in violation of the provisions of the law, unless the same has a better benefit for the worker.'}</div>
          <div style={ar}><span style={bold}>البند الثاني عشر " القانون الواجب التطبيق"</span>{'\nتسري أحكام قانون العمل في القطاع الأهلي رقم 6 لسنة 2010 والقرارات المنفذة له فيما لم يرد بشأنه نص في هذا العقد ، ويقع باطلا كل شرط تم الإتفاق عليه بالمخالفة لأحكام القانون ، ما لم يكن فيه ميزة أفضل للعامل .'}</div>
        </div>

        {/* Row 21 — Article 13 (Special conditions — dynamic) */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Thirteen "Special Conditions"</span>{`\n${params.specialConditionsEn}`}</div>
          <div style={ar}><span style={bold}>البند الثالث عشر "شروط خاصة"</span>{`\n${params.specialConditionsAr}`}</div>
        </div>

        {/* Row 22 — Article 14 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Fourteen "Specialized Court"</span>{'\nThe court of first instance and its Labour departments, in accordance with the provisions of the law No. 46 of the year 1987, shall be competent to peruse any conflicts resulting from the execution or interpretation of the present contract.'}</div>
          <div style={ar}><span style={bold}>البند الرابع عشر " المحكمة المختصة"</span>{'\nتختص المحكمة الكلية ودوائرها العمالية طبقا لأحكام القانون رقم 46 لسنة 1987 ، بنظر كافة المنازعات الناشئة عن تطبيق أو تفسير هذا العقد .'}</div>
        </div>

        {/* Row 23 — Article 15 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Fifteen "Contract Language"</span>{'\nThe present contract was made in Arabic and ENGLISH. The Arabic texts shall prevail in the case of any conflict between them.'}</div>
          <div style={ar}><span style={bold}>البند الخامس عشر " لغة العقد"</span>{'\nحرر هذا العقد باللغتين العربية و الانجليزيه ، ويعتد بنصوص اللغة العربية عند وقوع أي تعارض بينهما .'}</div>
        </div>

        {/* Row 24 — Article 16 */}
        <div className="ec-row" style={twoCol}>
          <div style={en}><span style={bold}>Article Sixteen "Contract Copies"</span>{'\nThe present contract was made in three copies, one for each party to work in accordance therewith. The third copy shall be deposited at the Public Authority for Manpower.'}</div>
          <div style={ar}><span style={bold}>البند السادس عشر " نسخ العقد"</span>{'\nحرر هذا العقد من ثلاث نسخ بيد كل طرف نسخة للعمل بموجبها والثالثة تودع لدى الهيئة العامة للقوى العاملة .'}</div>
        </div>

        {/* Row 25 — Signatures */}
        <div className="ec-row" style={{ ...twoCol, minHeight: 90 }}>
          <div style={{ ...en, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div><strong>Second Party / الطرف الثاني</strong></div>
            <div style={{ borderTop: '1px solid #374151', marginTop: 50, paddingTop: 4, fontSize: 10, color: '#6b7280' }}>
              Signature / التوقيع
            </div>
          </div>
          <div style={{ ...ar, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <div><strong>الطرف الأول / First Party</strong></div>
            <div style={{ borderTop: '1px solid #374151', marginTop: 50, paddingTop: 4, fontSize: 10, color: '#6b7280', direction: 'ltr', textAlign: 'left' }}>
              Signature / التوقيع
            </div>
          </div>
        </div>

        {/* Row 26 — Note (full-width) */}
        <div style={{ ...fullRow, fontSize: 9, color: '#6b7280', direction: 'rtl', textAlign: 'right', borderBottom: 'none' }}>{NOTE}</div>

      </div>
    </>
  );
}
```

- [ ] **Step 3.3 — Type-check the template**

```powershell
cd frontend; npx tsc --noEmit 2>&1 | Select-String "EmploymentContractTemplate|contractTranslations|formNumber"
```

Expected: no output (zero errors).

- [ ] **Step 3.4 — Commit**

```bash
git add frontend/src/forms/shared/formNumber.ts \
         frontend/src/forms/EmploymentContractTemplate.tsx
git commit -m "feat(forms): add bilingual employment contract template (16 articles, 2-page A4)"
```

---

## Task 4 — Frontend: Page Component + Dialog

**Files:**
- Create: `frontend/src/pages/EmploymentContract.tsx`

**Interfaces:**
- Consumes:
  - `ContractParams`, `ContractEmployee`, default export from `../forms/EmploymentContractTemplate`
  - `generateFormNumber` from `../forms/shared/formNumber`
  - `api`, `errorMessage` from `../api/client`
  - `useParams`, `useNavigate` from `react-router-dom`
- Produces:
  - `export default function EmploymentContract(): JSX.Element`

- [ ] **Step 4.1 — Create `EmploymentContract.tsx`**

Create `frontend/src/pages/EmploymentContract.tsx`:

```tsx
import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api, errorMessage } from '../api/client';
import { generateFormNumber } from '../forms/shared/formNumber';
import EmploymentContractTemplate, {
  type ContractParams,
  type ContractEmployee,
} from '../forms/EmploymentContractTemplate';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const DURATION_OPTIONS = [
  { ar: 'سنة', en: 'ONE YEAR' },
  { ar: 'سنتين', en: 'TWO YEARS' },
  { ar: 'ثلاث سنوات', en: 'THREE YEARS' },
] as const;

// ─── Reusable style objects ───────────────────────────────────────────────────
const inp: React.CSSProperties = {
  padding: '7px 10px',
  border: '1px solid var(--border)',
  borderRadius: 8,
  background: 'var(--bg)',
  color: 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box',
};

const lbl: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 700,
  marginBottom: 5,
  color: 'var(--text-muted)',
};

// ─── Dialog ───────────────────────────────────────────────────────────────────
interface DialogProps {
  employee: ContractEmployee;
  params: ContractParams;
  onChange: <K extends keyof ContractParams>(key: K, value: ContractParams[K]) => void;
  onConfirm: () => void;
  onBack: () => void;
}

function ContractParamsDialog({ employee, params, onChange, onConfirm, onBack }: DialogProps) {
  function handleDuration(ar: string) {
    const opt = DURATION_OPTIONS.find(o => o.ar === ar);
    if (!opt) return;
    onChange('durationAr', opt.ar);
    onChange('durationEn', opt.en);
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h2>عقد العمل — بيانات العقد</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>
            الموظف: <strong>{employee.fullName}</strong>
            {employee.fullNameEn ? ` / ${employee.fullNameEn}` : ''}
          </p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 640, padding: 28 }}>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>تاريخ تحرير العقد</label>
            <input type="date" style={inp} value={params.issueDate}
              onChange={e => onChange('issueDate', e.target.value)} />
          </div>
          <div>
            <label style={lbl}>تاريخ بداية نفاذ العقد</label>
            <input type="date" style={inp} value={params.startDate}
              onChange={e => onChange('startDate', e.target.value)} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>مدة العقد</label>
          <select title="مدة العقد" style={inp} value={params.durationAr}
            onChange={e => handleDuration(e.target.value)}>
            {DURATION_OPTIONS.map(o => (
              <option key={o.ar} value={o.ar}>{o.ar} / {o.en}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 14 }}>
          <div>
            <label style={lbl}>فترة التجربة (أيام)</label>
            <input type="number" style={inp} min={1} max={365}
              value={params.probationDays}
              onChange={e => onChange('probationDays', Math.max(1, Number(e.target.value)))} />
          </div>
          <div>
            <label style={lbl}>الإجازة السنوية (أيام)</label>
            <input type="number" style={inp} min={1} max={60}
              value={params.annualLeaveDays}
              onChange={e => onChange('annualLeaveDays', Math.max(1, Number(e.target.value)))} />
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>الشروط الخاصة (عربي)</label>
          <input type="text" style={inp} value={params.specialConditionsAr}
            onChange={e => onChange('specialConditionsAr', e.target.value)}
            placeholder="لايوجد" />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>الشروط الخاصة (English)</label>
          <input type="text" style={inp} value={params.specialConditionsEn}
            onChange={e => onChange('specialConditionsEn', e.target.value)}
            placeholder="NOTHING" />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button className="btn" style={{ flex: 1 }} onClick={onConfirm}>
            <span className="material-symbols-outlined"
              style={{ fontSize: 18, verticalAlign: 'middle', marginLeft: 6 }}>
              preview
            </span>
            معاينة وطباعة
          </button>
          <button className="btn secondary" onClick={onBack}>رجوع</button>
        </div>

      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function EmploymentContract() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const navigate = useNavigate();
  const formNumber = useMemo(() => generateFormNumber('employment-contract'), []);

  const [employee, setEmployee] = useState<ContractEmployee | null>(null);
  const [fetchError, setFetchError] = useState('');
  const [showTemplate, setShowTemplate] = useState(false);

  const [params, setParams] = useState<ContractParams>({
    issueDate: todayISO(),
    startDate: todayISO(),
    durationAr: 'سنة',
    durationEn: 'ONE YEAR',
    probationDays: 100,
    annualLeaveDays: 30,
    specialConditionsAr: 'لايوجد',
    specialConditionsEn: 'NOTHING',
  });

  useEffect(() => {
    if (!employeeId) return;
    api
      .get(`/forms/employment-contract/${employeeId}`)
      .then(res => setEmployee(res.data.data.employee))
      .catch(e => setFetchError(errorMessage(e)));
  }, [employeeId]);

  // Audit log when template first shown
  useEffect(() => {
    if (!employee || !showTemplate) return;
    api
      .post('/forms/print-log', {
        formType: 'employment-contract',
        formNumber,
        employeeId: Number(employeeId),
        employeeName: employee.fullName,
        issueDate: new Date().toISOString(),
        printMode: 'full-template',
      })
      .catch(() => {});
  }, [employee, showTemplate, formNumber, employeeId]);

  if (fetchError)
    return <div className="center-msg">تعذّر تحميل بيانات الموظف: {fetchError}</div>;

  if (!employee)
    return (
      <div className="center-msg">
        <div className="spinner" />
        جارٍ التحميل…
      </div>
    );

  // ── Dialog phase ──────────────────────────────────────────────────────────
  if (!showTemplate) {
    return (
      <ContractParamsDialog
        employee={employee}
        params={params}
        onChange={(key, value) => setParams(prev => ({ ...prev, [key]: value }))}
        onConfirm={() => setShowTemplate(true)}
        onBack={() => navigate(-1)}
      />
    );
  }

  // ── Preview & print phase ─────────────────────────────────────────────────
  return (
    <div style={{ maxWidth: 860, margin: '0 auto', padding: '16px 20px', background: '#fff' }}>
      {/* Toolbar — hidden in print via PRINT_CSS in template */}
      <div
        className="no-print"
        style={{ display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center' }}
      >
        <button className="btn" onClick={() => window.print()}>
          🖨️ طباعة / حفظ PDF
        </button>
        <button className="btn secondary" onClick={() => setShowTemplate(false)}>
          ✏️ تعديل البيانات
        </button>
        <button className="btn secondary" onClick={() => navigate(-1)}>
          رجوع
        </button>
        <span style={{ fontSize: 12, color: 'var(--text-muted)', marginRight: 'auto' }}>
          {formNumber}
        </span>
      </div>

      <EmploymentContractTemplate employee={employee} params={params} />
    </div>
  );
}
```

- [ ] **Step 4.2 — Type-check the page component**

```powershell
cd frontend; npx tsc --noEmit 2>&1 | Select-String "EmploymentContract"
```

Expected: no output.

- [ ] **Step 4.3 — Commit**

```bash
git add frontend/src/pages/EmploymentContract.tsx
git commit -m "feat(forms): add EmploymentContract page with pre-print dialog and manual print"
```

---

## Task 5 — Wire Routing

**Files:**
- Modify: `frontend/src/pages/Forms.tsx`
- Modify: `frontend/src/App.tsx`

**Note:** No changes to `backend/src/app.ts` — the new route lives inside `forms.routes.ts` which is already registered.

- [ ] **Step 5.1 — Add card to `Forms.tsx`**

In `frontend/src/pages/Forms.tsx`, find `const FORM_CARDS: FormCard[] = [` and append this entry before the closing `]`:

```typescript
  {
    key: 'employment-contract',
    route: 'employment-contract',
    titleAr: 'عقد العمل',
    titleEn: 'Employment Contract',
    description: 'نموذج عقد العمل الرسمي الصادر عن الهيئة العامة للقوى العاملة، ثنائي اللغة (عربي / إنجليزي).',
    icon: '📝',
  },
```

- [ ] **Step 5.2 — Add import + route to `App.tsx`**

In `frontend/src/App.tsx`, add the import alongside the other form page imports (look for the block of `import ... from './pages/...'`):

```typescript
import EmploymentContract from './pages/EmploymentContract';
```

Then add the route after the last existing form route (the `performance-evaluation` line):

```typescript
<Route path="/forms/employment-contract/:employeeId" element={<ProtectedRoute><EmploymentContract /></ProtectedRoute>} />
```

- [ ] **Step 5.3 — Type-check frontend**

```powershell
cd frontend; npx tsc --noEmit 2>&1
```

Expected: 0 errors.

- [ ] **Step 5.4 — Commit**

```bash
git add frontend/src/pages/Forms.tsx frontend/src/App.tsx
git commit -m "feat(forms): wire employment contract card and route"
```

---

## Task 6 — Validation Gate

Run all quality gates in order. Every command must pass before declaring done.

- [ ] **Step 6.1 — Frontend TypeScript**

```powershell
cd frontend; npx tsc --noEmit 2>&1
```

Expected: exit 0, no error lines.

- [ ] **Step 6.2 — Backend TypeScript**

```powershell
cd backend; npx tsc --noEmit 2>&1
```

Expected: exit 0, no error lines.

- [ ] **Step 6.3 — Electron TypeScript**

```powershell
tsc -p electron/tsconfig.json --noEmit 2>&1
```

Expected: exit 0, no error lines.

- [ ] **Step 6.4 — Prisma Validate**

```powershell
cd backend; npx prisma validate 2>&1
```

Expected output contains: `The schema at` ... `is valid 🚀`

- [ ] **Step 6.5 — All Backend Tests**

```powershell
cd backend; npm test 2>&1 | tail -30
```

Expected: all suites pass, including the 2 new `getEmploymentContractData` tests. Zero failures.

- [ ] **Step 6.6 — Final commit if any loose files**

```bash
git status
# If nothing: you're done.
# If dirty:
git add <any remaining files>
git commit -m "chore(forms): validation gate — all checks pass"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task | Status |
|-------------|------|--------|
| Kuwait emblem image extracted and placed | Task 1 | ✅ |
| Translation table (nationality + jobTitle) | Task 1 | ✅ |
| GET endpoint `forms.read` permission | Task 2 | ✅ |
| Service method + 2 unit tests | Task 2 | ✅ |
| No DB migration | — | ✅ none added |
| `formNumber.ts` EMP prefix | Task 3 | ✅ |
| Bilingual 2-column template | Task 3 | ✅ |
| All 16 articles with exact text | Task 3 | ✅ |
| Dynamic fields (name, nationality, salary, etc.) | Task 3 | ✅ |
| Page break after Article 7 (row 15) | Task 3 | ✅ |
| Pre-print dialog with 7 fields + defaults | Task 4 | ✅ |
| No auto-print — `window.print()` on button only | Task 4 | ✅ |
| "تعديل البيانات" button returns to dialog | Task 4 | ✅ |
| Audit log via `/forms/print-log` | Task 4 | ✅ |
| Forms.tsx card added | Task 5 | ✅ |
| App.tsx route + import added | Task 5 | ✅ |
| All 5 quality gates pass | Task 6 | ✅ |

### Type Consistency

| Symbol | Defined in | Used in |
|--------|-----------|--------|
| `ContractParams` | Task 3 → `EmploymentContractTemplate.tsx` | Task 4 → `EmploymentContract.tsx` |
| `ContractEmployee` | Task 3 → `EmploymentContractTemplate.tsx` | Task 4 → `EmploymentContract.tsx` |
| `getNationalityEn` | Task 1 → `contractTranslations.ts` | Task 3 → `EmploymentContractTemplate.tsx` |
| `getJobTitleEn` | Task 1 → `contractTranslations.ts` | Task 3 → `EmploymentContractTemplate.tsx` |
| `generateFormNumber('employment-contract')` | Task 3 → `formNumber.ts` (EMP prefix added) | Task 4 → `EmploymentContract.tsx` |
| `formsController.getEmploymentContract` | Task 2 → `forms.controller.ts` | Task 2 → `forms.routes.ts` |
| `formsService.getEmploymentContractData` | Task 2 → `forms.service.ts` | Task 2 → `forms.controller.ts` |

### Placeholder Scan ✅

Zero TBD / TODO / "implement later" / vague steps in this plan. Every step has complete code or an exact command with expected output.

---

*Plan written 2026-06-18 based on spec `docs/superpowers/specs/2026-06-18-employment-contract-form-design.md`.*
