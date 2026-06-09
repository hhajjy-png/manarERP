# DESIGN.md — نظام المنار Design System

> Single source of truth for manarERP UI/UX standards.
> Ground truth implementation: `frontend/src/app/theme.css`
> This file documents the live system — do not introduce patterns that conflict with `theme.css`.

---

## 1. Product Identity

| Field | Value |
|-------|-------|
| System name | نظام المنار لإدارة الأعمال |
| Company | شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م |
| Type | Internal Electron desktop ERP — Windows only, offline only |
| Business domain | Road construction and asphalt transport contracting (Kuwait) |
| Currency | Kuwaiti Dinar (د.ك) — 3 decimal places, no VAT |
| Language | Arabic-first UI, English codebase |
| Users | Small internal team — not public, not multi-tenant |
| Platform | Electron 31 / React 18 / Vite 5 / SQLite |

This is a local, practical, single-company ERP. It is not a SaaS product, not a public app, and not an enterprise platform.

---

## 2. Design Principles

### What this system is

- **Clarity over decoration** — every element must serve a workflow, not look impressive.
- **Page-level improvements over full redesigns** — evolve existing pages with targeted additions; do not rebuild what works.
- **Practical, not polished** — internal tool for a contracting company, not a product demo.
- **Low maintenance** — avoid patterns that require ongoing design system updates.
- **Arabic-first** — layout, typography, and interaction must work in RTL as the primary direction.

### What this system is not

- Not SaaS — no marketing copy, no trial buttons, no pricing tiers.
- Not enterprise — no workflow engines, no multi-tenant dashboards, no org hierarchies.
- Not a design portfolio — no futuristic gradients, no hero sections, no animation showcases.
- Not a product landing page — Stitch must output functional app pages, not promotional layouts.

---

## 3. Theme System

All design tokens are CSS custom properties defined in `frontend/src/app/theme.css`. They are the single source of truth — never hardcode hex values in components.

### 3.1 Color Tokens

#### Light Mode (`:root`)

| Token | Value | Purpose |
|-------|-------|---------|
| `--primary` | `#0f172a` | Sidebar background, primary navy |
| `--primary-hover` | `#1e293b` | Sidebar hover state |
| `--accent` | `#3b82f6` | Primary action color (blue) |
| `--accent-hover` | `#2563eb` | Accent hover |
| `--accent-light` | `#eff6ff` | Accent focus ring background |
| `--bg` | `#f8fafc` | App background |
| `--surface` | `#ffffff` | Card / modal / topbar background |
| `--surface-2` | `#f1f5f9` | Secondary surface, input background |
| `--surface-hover` | `#f8fafc` | Table row hover background |
| `--text` | `#0f172a` | Primary text |
| `--text-muted` | `#64748b` | Labels, subtitles, table headers |
| `--border` | `#e2e8f0` | All borders |
| `--green` | `#10b981` | Success / active status |
| `--green-light` | `#d1fae5` | Green pill background |
| `--red` | `#ef4444` | Danger / error / cancelled |
| `--red-light` | `#fee2e2` | Red pill background |
| `--amber` | `#f59e0b` | Warning / pending |
| `--amber-light` | `#fef3c7` | Amber pill background |
| `--blue` | `#3b82f6` | Info / in-progress |
| `--blue-light` | `#dbeafe` | Blue pill background |

#### Dark Mode (`html[data-theme="dark"]`)

| Token | Dark Value |
|-------|-----------|
| `--primary` | `#020617` |
| `--primary-hover` | `#0f172a` |
| `--accent-light` | `#1e3a8a` |
| `--bg` | `#0f172a` |
| `--surface` | `#1e293b` |
| `--surface-2` | `#334155` |
| `--surface-hover` | `rgba(45,212,191,0.04)` |
| `--text` | `#f8fafc` |
| `--text-muted` | `#94a3b8` |
| `--border` | `#334155` |
| `--green-light` | `rgba(16,185,129,0.15)` |
| `--red-light` | `rgba(239,68,68,0.15)` |
| `--amber-light` | `rgba(245,158,11,0.15)` |
| `--blue-light` | `rgba(59,130,246,0.15)` |

Dark mode is toggled by setting `document.documentElement.dataset.theme = 'dark'`. Choice is persisted in `localStorage('theme')` and restored in `main.tsx` before the first React render.

### 3.2 Shadows

| Token | Value |
|-------|-------|
| `--shadow-sm` | `0 1px 2px 0 rgb(0 0 0 / 0.05)` |
| `--shadow` | `0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)` |
| `--shadow-lg` | `0 10px 15px -3px rgb(0 0 0 / 0.05), 0 4px 6px -4px rgb(0 0 0 / 0.05)` |

Dark mode shadows are stronger: `0.3` and `0.4` opacity respectively.

### 3.3 Geometry and Motion

| Token | Value | Usage |
|-------|-------|-------|
| `--radius` | `16px` | Cards, modals, login card, sidebar logo |
| `--transition` | `all 0.3s cubic-bezier(0.4, 0, 0.2, 1)` | All interactive elements |

### 3.4 Typography

| Element | Size | Weight |
|---------|------|--------|
| Page title (`.page-head h2`) | `26px` | `800` |
| Panel heading (`.panel h3`) | `18px` | `800` |
| Modal heading (`.modal-head h3`) | `18px` | `800` |
| Brand name (`.brand h1`) | `17px` | `800` |
| Nav items (`.nav a`) | `14.5px` | `600` |
| Button label (`.btn`) | `14.5px` | `700` |
| Body / table cells | `14px` | `600` |
| Table headers (`thead th`) | `13px` | `700` |
| Labels (`.field label`) | `13px` | `700` |
| Page subtitle (`.page-head p`) | `14.5px` | `600` |
| Brand sub (`.brand span`) | `12px` | `600` |
| Pills (`.pill`) | `12px` | `700` |
| Error text (`.field .err`) | `12px` | `600` |

Font family: **Cairo** (Google Fonts, weights 400 / 500 / 600 / 700 / 800). Applied on `body`. Cairo is optimized for Arabic — do not substitute.

---

## 4. Layout Shell

```
┌────────────────────────────────────────────────────────────────┐
│                          .topbar (70px)                         │
├──────────────────┬─────────────────────────────────────────────┤
│                  │                                              │
│  .sidebar        │  .content                                    │
│  (260px fixed)   │  (padding: 32px)                            │
│  background:     │                                              │
│  var(--primary)  │  .page-head → page title + primary action    │
│                  │  stats grid  → KPI cards                     │
│                  │  panels      → charts, tables, forms         │
│                  │                                              │
└──────────────────┴─────────────────────────────────────────────┘
```

### 4.1 Sidebar

```css
width: 260px;
position: fixed;
inset-block: 0;
inset-inline-start: 0;      /* RTL-safe — renders on right side in RTL */
background: var(--primary);
z-index: 30;
```

- Contains: brand block (logo + app name + sub-label) and `.nav` (scrollable nav list).
- Active nav link: `background: var(--accent)`, `color: #fff`, `box-shadow: 0 4px 12px rgba(59,130,246,.3)`.
- Hover: `background: var(--primary-hover)`, `transform: translateX(-4px)` in RTL.
- Collapsed at `max-width: 900px` via `transform: translateX(100%)` (slides off-screen to the right in RTL). `.sidebar.open` restores it.

### 4.2 Topbar

```css
height: 70px;
position: sticky;
top: 0;
z-index: 20;
background: var(--surface);
border-bottom: 1px solid var(--border);
padding: 0 28px;
```

Contains: optional search input, `.top-actions` (right-aligned in RTL: notifications, theme toggle, user avatar).

### 4.3 Main Content Area

```css
margin-inline-start: 260px;   /* RTL-safe offset matching sidebar width */
```

- Collapses to `margin-inline-start: 0` at `max-width: 900px` (when sidebar is hidden).
- Page padding: `32px` desktop, `20px` mobile.
- Page fade-in animation: `fadeIn 0.4s ease-out` (opacity 0→1, translateY 10px→0).

### 4.4 Page Header

```html
<div class="page-head">
  <div>
    <h2>اسم الصفحة</h2>
    <p>وصف مختصر</p>
  </div>
  <button class="btn">إجراء رئيسي</button>
</div>
```

- Always at the top of `.content`.
- Left side (RTL natural position): title + subtitle.
- Right side (RTL natural position): primary action button.

### 4.5 Cards

```css
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);      /* 16px */
  box-shadow: var(--shadow);
  transition: var(--transition);
}
.card:hover { box-shadow: var(--shadow-lg); }
```

### 4.6 Responsive Breakpoints

| Breakpoint | Behavior |
|-----------|---------|
| `max-width: 1000px` | Two-column chart grid collapses to one column |
| `max-width: 900px` | Sidebar hides; hamburger button appears in topbar |
| `max-width: 640px` | Two-column form grid collapses to one column |

---

## 5. RTL / LTR Rules

### 5.1 HTML-level direction

```html
<html lang="ar" dir="rtl">
```

Set statically in `frontend/index.html`. React does not change it at runtime. All layout responds to this automatically.

### 5.2 Logical CSS Properties (preferred)

| Use this | Not this | Reason |
|----------|----------|--------|
| `margin-inline-start` | `margin-left` | Respects RTL |
| `padding-inline-start` | `padding-left` | Respects RTL |
| `inset-inline-start` | `left` | Sidebar positioning |
| `text-align: start` | `text-align: left` | Table headers, labels |

All layout-sensitive positioning uses logical properties. Hardcoded `left` / `right` is only acceptable in `@media print` overrides where the browser renders LTR regardless.

### 5.3 LTR override

Nav hover transform is flipped for LTR contexts:

```css
html[dir="ltr"] .nav a:hover {
  transform: translateX(4px);   /* opposite of RTL's -4px */
}
```

### 5.4 Font

Cairo is Arabic-optimized. Its letter shapes and spacing are designed for right-to-left reading. Do not replace it with a Latin-first font.

---

## 6. Buttons

### 6.1 Variants

```css
/* Primary (default) */
.btn {
  background: var(--accent);
  color: #fff;
  padding: 12px 20px;
  border-radius: 12px;
  font-weight: 700;
  font-size: 14.5px;
  box-shadow: 0 4px 12px rgba(59,130,246,.25);
}
.btn:hover { background: var(--accent-hover); transform: translateY(-2px); }
.btn:disabled { opacity: .6; cursor: not-allowed; transform: none; }

/* Secondary */
.btn.secondary {
  background: var(--surface);
  color: var(--text);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.btn.secondary:hover { background: var(--surface-2); }

/* Danger */
.btn.danger { background: var(--red); box-shadow: none; }

/* Small */
.btn.sm { padding: 6px 12px; font-size: 12px; }
```

### 6.2 Usage Rules

- One primary button per page header (create / add action).
- Destructive actions use `.btn.danger` — always require confirmation before executing.
- Cancel/back actions use `.btn.secondary`.
- Small buttons (`.btn.sm`) for inline actions inside tables (edit, view).

---

## 7. Status Pills

Used for status fields in tables and detail views.

```css
.pill {
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}
.pill::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
```

| Class | Background | Text | Use for |
|-------|-----------|------|---------|
| `.pill.green` | `var(--green-light)` | `var(--green)` | Active, approved, working, paid |
| `.pill.amber` | `var(--amber-light)` | `var(--amber)` | Pending, on leave, warning |
| `.pill.red` | `var(--red-light)` | `var(--red)` | Cancelled, rejected, terminated, overdue |
| `.pill.blue` | `var(--blue-light)` | `var(--blue)` | In progress, issued |
| `.pill.gray` | `var(--surface-2)` | `var(--text-muted)` | Inactive, draft, unknown |

---

## 8. Tables

### 8.1 Structure

```css
table {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 14px;
}
thead th {
  text-align: start;
  color: var(--text-muted);
  font-weight: 700;
  font-size: 13px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  white-space: nowrap;
}
tbody td {
  padding: 16px;
  border-bottom: 1px solid var(--border);
  font-weight: 600;
}
tbody tr:hover td { background: var(--surface-hover); }
tbody tr:last-child td { border-bottom: none; }
```

Always wrap tables in `.table-responsive` (`overflow-x: auto`) to handle narrow viewports.

### 8.2 Toolbar (search + filters)

```css
.toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
  background: var(--surface);
  padding: 16px;
  border-radius: var(--radius);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
}
.toolbar input, .toolbar select {
  padding: 10px 16px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  font-weight: 600;
}
```

Standard toolbar contents (left to right in RTL rendering):
1. Search `<input>` — with `×` clear button when value is present.
2. Status `<select>` filter — when the module has meaningful status values.
3. Direction/type `<select>` filter — for modules like Invoices that have SALES/PURCHASE.
4. "مسح" (reset all filters) button — `.btn.secondary.sm`, appears when any filter is active.

### 8.3 Actions Column

Every data table that supports edit/delete includes a labeled actions column:

- Column header: `إجراءات` (sourced from `i18n` key `col.actions`).
- Contains `.btn.sm.secondary` edit button and `.btn.sm.danger` delete button.
- Actions column is always the last column (first visually in RTL).

### 8.4 Empty State

When a table has no data (empty result or no records yet):

```html
<div class="center-msg">
  <p>لا توجد نتائج</p>
</div>
```

No fancy illustrations. Plain centered muted text is sufficient.

### 8.5 Pagination

Standard pagination for lists with more than one page:

```css
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  gap: 12px;
  flex-wrap: wrap;
}
```

Contains: result count text (right side in RTL) and page navigation buttons (`.pg-btns`).

---

## 9. Forms

### 9.1 Field Structure

```html
<div class="field">
  <label>اسم الحقل *</label>
  <input type="text" />
  <span class="err">رسالة الخطأ</span>
</div>
```

```css
.field { margin-bottom: 16px; }
.field label {
  display: block;
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 700;
  margin-bottom: 8px;
}
.field input, .field select, .field textarea {
  width: 100%;
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-weight: 600;
  font-size: 14px;
}
.field input:focus, .field select:focus, .field textarea:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-light);
}
.field .err { color: var(--red); font-size: 12px; margin-top: 6px; }
```

### 9.2 Two-Column Grid

Use for forms with many fields — reduces vertical scrolling.

```css
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0 18px;
}
@media (max-width: 640px) { .form-grid { grid-template-columns: 1fr; } }
```

Use single-column when: the form has 4 or fewer fields, or fields have long labels.

### 9.3 Required Fields

Mark required fields with `*` suffix on the label. Validate on submit — show `.err` messages inline under the relevant field. Do not use browser `required` attribute validation popups.

### 9.4 Form Actions

Forms rendered inside a modal (`.modal-foot`):

```html
<div class="modal-foot">
  <button class="btn">حفظ</button>
  <button class="btn secondary">إلغاء</button>
</div>
```

- Primary action (save/confirm) always first.
- Cancel always second.
- Destructive action (delete confirm) uses `.btn.danger` as the primary.

---

## 10. Modals

Used for create / edit / confirm dialogs.

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15,23,42,.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 40px 16px;
  z-index: 50;
  overflow-y: auto;
}
.modal {
  background: var(--surface);
  border-radius: var(--radius);
  box-shadow: var(--shadow-lg);
  width: 100%;
  max-width: 640px;
}
.modal-head { padding: 20px 24px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 24px; }
.modal-foot { padding: 16px 24px; border-top: 1px solid var(--border); }
```

Modal sections: `.modal-head` (title + close ×) → `.modal-body` (form content) → `.modal-foot` (action buttons).

Max width `640px`. For large forms (many fields), the modal scrolls within the overlay — do not create nested scrollers.

---

## 11. Alerts and Feedback

```css
.alert {
  padding: 14px 18px;
  border-radius: 14px;
  margin-bottom: 20px;
  font-weight: 700;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  line-height: 1.9;
}
.alert.warn { background: var(--amber-light); border: 1px solid var(--amber); color: var(--amber); }
.alert.error { background: var(--red-light); border: 1px solid var(--red); color: var(--red); }
```

Loading state uses `.spinner` (rotating ring, `var(--accent)` color) centered in `.center-msg`.

---

## 12. Print Styles

`@media print` rules are defined in `theme.css` and apply to all pages:

- Sidebar and topbar are hidden.
- Main margin is reset to 0.
- Content padding is removed; animation is disabled.
- Buttons, toolbar, pagination, `.no-print` elements are hidden.
- Background is forced white; text is forced black.
- Card shadows removed; card border becomes `1px solid #ccc`.
- Table: `font-size: 11px`; `thead th` forced dark blue (`#1d4e6f`) with white text (`print-color-adjust: exact`).
- `@page { margin: 1cm; }`

Cheque printing uses a separate page (`Cheques.tsx` → `ChequePrintOutput`) with custom `@page` size targeting Gulf Bank cheque paper dimensions.

---

## 13. Page Standards by Module

Each module page follows one of two patterns:

**Pattern A — ResourcePage (generic CRUD):** Driven by `frontend/src/config/modules.tsx`. Handles list view, search, filter, create/edit modal, delete. Use this for modules that fit a standard data grid.

**Pattern B — Custom page:** Standalone `*.tsx` file for pages with complex layouts or multi-step workflows.

---

### 13.1 Dashboard (`Dashboard.tsx`) — Pattern B

- **Layout:** `.page-head` → KPI stats grid → two-column chart row → recent activity table.
- **KPI cards:** `.stats` grid (`repeat(auto-fill, minmax(240px, 1fr))`). Each card: icon with color background (`.si`), label, numeric value, optional trend indicator.
- **Charts:** Recharts (AreaChart, BarChart, PieChart). Use `var(--accent)` as primary chart color.
- **Recent table:** Last 5–10 rows from the most active modules. Status pills in status column.
- No filter, no pagination on dashboard — it is a summary view only.

### 13.2 Customers (`ResourcePage`) — Pattern A

- **Columns:** الرقم, الاسم, النوع (pill: حكومي/خاص), جهة الاتصال, رقم الهاتف, الإجراءات.
- **Filters:** Type filter (حكومي / خاص).
- **Form fields:** الاسم, النوع (select), جهة الاتصال, رقم الهاتف, البريد الإلكتروني, العنوان.

### 13.3 Contracts (`ResourcePage`) — Pattern A

- **Columns:** الرقم, العميل, مصنع الأسفلت, الموقع, قيمة النقل الشهري (KWD), الحالة, الإجراءات.
- **Filters:** Status filter.
- **Form fields:** العميل (select), مصنع الأسفلت, الموقع, قيمة النقل الشهري, تاريخ البداية, تاريخ الانتهاء.

### 13.4 Employees (`ResourcePage`) — Pattern A

- **Columns:** الرقم المدني, الاسم بالعربي, الجنسية, المهنة, الراتب (KWD), الحالة, الإجراءات.
- **Filters:** Status filter (نشط / إجازة / منتهي الخدمة).
- **Form fields:** Two-column grid. Fields include: الاسم بالعربي, الاسم بالإنجليزي, الرقم المدني, تاريخ الميلاد, الجنسية, المهنة, الشركة, الراتب, رقم الجواز + تاريخ انتهائه, رقم الإقامة + تاريخ انتهائها, رخصة القيادة, رخصة المركبة, لوحة المركبة, الحالة.
- **Expiry alerts:** Fields ending in تاريخ الانتهاء show amber warning when within 30 days, red when expired.

### 13.5 Equipment (`ResourcePage`) — Pattern A

- **Columns:** رقم المعدة, النوع, المالك, السائق, لوحة المركبة, انتهاء دفتر المركبة, الحالة, الإجراءات.
- **Filters:** Status filter (تعمل / لا تعمل).
- **Expiry alert:** دفتر المركبة expiry shows amber/red pill when near or past expiry.
- **Form fields:** رقم المعدة, النوع, المالك, السائق, لوحة المركبة, تاريخ انتهاء دفتر المركبة, الحالة.

### 13.6 Invoices (`Invoices.tsx`) — Pattern B

- **List view toolbar:** Status filter, Direction filter (مبيعات / مشتريات), "مسح" reset button.
- **Columns:** الرقم, العميل/المورد, الاتجاه (pill), الإجمالي (KWD), الحالة (pill), تاريخ الإصدار, الإجراءات.
- **Detail / Create view:** Header fields (العميل, تاريخ الإصدار, نوع الخدمة) → line items table (الوصف, الكمية, الوحدة, السعر, الإجمالي) → totals row → payments section.
- **Line items:** inline-editable rows; "إضافة بند" button below the table.
- **Payment section:** shows existing payments + "تسجيل دفعة" button.

### 13.7 Expenses (`ResourcePage`) — Pattern A

- **Columns:** الرقم, الوصف, الفئة, المبلغ (KWD), الحالة, التاريخ, الإجراءات.
- **Filters:** Status filter (معلق / معتمد / مرفوض).
- **Approval action:** "اعتماد" / "رفض" buttons visible only to users with `expenses.approve` permission.

### 13.8 Suppliers (`ResourcePage`) — Pattern A

- **Columns:** الرقم, الاسم, جهة الاتصال, رقم الهاتف, البريد الإلكتروني, الإجراءات.
- **No filters** beyond search.

### 13.9 Accounting (`Accounting.tsx`) — Pattern B

- Three tabs: القيود اليومية, دفتر الأستاذ, الأرباح والخسائر.
- Transactions list with debit/credit columns.
- Journal entries with double-entry lines.
- Profit & Loss summary: revenues vs. expenses.
- No inline editing — accounting entries are append-only.

### 13.10 Payroll / Salaries (`Salaries.tsx`) — Pattern B

- Month/year selector at top.
- Employee list with base salary, allowances, deductions, net pay columns.
- Per-employee payslip action → opens `PayrollPayslip.tsx` (print-optimized).
- Approve workflow: pending → approved state; requires `payroll.approve` permission.
- "تصدير Excel" button for the current month.

### 13.11 Reports (`Reports.tsx`) — Pattern B

- Filter bar: report type selector, date range, optional filters (customer, employee, equipment).
- "مسح الفلاتر" reset button — always visible.
- "معاينة" (preview) button → loads results below.
- Row count chip after preview: "عرض X نتيجة".
- Export buttons: تصدير Excel, تصدير PDF — appear after preview.
- Print layout uses `ReportPrint.tsx` (Chromium print, not PDFKit — Arabic is rendered correctly by the browser).

### 13.12 Cheques (`Cheques.tsx`) — Pattern B

- **Issue form:** Beneficiary, amount (numeric KWD), tafqeet (Arabic words, auto-calculated), bank, cheque number, date, notes.
- **History table:** Has search input and status filter above the table. Columns: الرقم, المستفيد, المبلغ, البنك, الحالة, التاريخ, الإجراءات.
- **Status machine:** صادر → مسلّم → محصّل / مرتجع / ملغى.
- **Print output:** `ChequePrintOutput` — shows Gulf Bank cheque background image on screen; fields are absolutely positioned overlays. On real print, background image is hidden so fields print on actual cheque paper.
- **Tafqeet:** Arabic amount-in-words calculated automatically from numeric amount. Never editable.

### 13.13 Audit Log — Pattern A (pending frontend page)

- Read-only list. No create, no edit, no delete.
- **Columns:** التاريخ, المستخدم, الإجراء, الوحدة, المعرّف, التفاصيل.
- **Filters:** User filter, Module filter, Action filter, Date range.
- No pagination buttons needed if results are limited to last 500 entries.
- Permission gate: `audit.read`.

### 13.14 Backup & Restore (`Backup.tsx`) — Pattern B

- **Backup section:** "إنشاء نسخة احتياطية" button → IPC call → shows confirmation with file path.
- **Restore section:** "استعادة نسخة احتياطية" → file picker dialog → confirmation warning → IPC restore call.
- **Auto-backup status:** shows last auto-backup time.
- No table needed — this is a single-action page.

### 13.15 Users & Roles (`Users.tsx`) — Pattern B

- **Users tab:** List of system users. Columns: المستخدم, الدور, الموظف المرتبط, آخر دخول, الإجراءات.
- **Roles tab:** List of roles with permission assignment checkboxes.
- Permission matrix: module rows × action columns, checkbox grid.
- `SYSTEM_ADMIN` role is non-editable — it bypasses all checks.

---

## 14. How to Use This File with Stitch

Stitch is an AI-powered UI generation tool. When using it with manarERP:

### 14.1 Mode

Use **App mode** (not Web/Landing Page mode). This is an internal desktop application, not a website.

### 14.2 Scope

Generate **one page at a time**. Do not ask Stitch to redesign the entire system or generate a new design system. Reference specific sections of this document for the page you are generating.

### 14.3 Constraints to pass to Stitch

When generating any page, include these constraints:

- **Direction:** RTL — Arabic text flows right to left; sidebar is on the right side.
- **Font:** Cairo (Google Fonts) — required for Arabic rendering.
- **Colors:** Use CSS custom properties (`var(--accent)`, `var(--surface)`, etc.) — not hardcoded hex values. Reference Section 3.1 of this document.
- **Platform:** Electron desktop app — output must be compatible with file:// loading. No CDN-only features.
- **Layout:** Sidebar (260px) + Topbar (70px) + Content area. See Section 4.
- **No new design system:** Extend existing classes from `theme.css`, do not create a parallel component library.

### 14.4 What to generate

Good uses of Stitch with this project:

- Generate a new **page layout** that matches the shell structure in Section 4.
- Prototype a **form dialog** for a new module using `.field`, `.form-grid`, `.modal` patterns.
- Prototype a **table view** with toolbar, status pills, and actions column.
- Explore **dashboard widget** arrangements (KPI grid, chart placement).

### 14.5 What not to generate

- Do not generate a landing page, SaaS homepage, or marketing layout.
- Do not generate a new color system — use the existing tokens.
- Do not generate an entire ERP redesign — existing pages are production code.
- Do not generate mobile-first layouts — this is a Windows desktop app (minimum 1024×680).
- Do not generate English-only layouts — all labels must be in Arabic.

### 14.6 After generating

Pages generated in Stitch (or `manar-ui-lab`) are **prototypes**. Before copying to manarERP:

1. Verify all class names match `theme.css` classes.
2. Verify all colors use `var(--*)` tokens, not hex.
3. Verify all directional properties use logical CSS (`margin-inline-start`, not `margin-left`).
4. Replace static data with API calls to `http://127.0.0.1:48211/api/<module>`.
5. Add permission guards (`useAuth().hasPermission(...)`) around sensitive actions.
6. Run TypeScript validation before committing.

---

## 15. Avoid List

The following are explicitly out of scope for manarERP. Do not implement these.

| Category | Avoided Pattern | Reason |
|----------|----------------|--------|
| Product type | SaaS conversion | Single-company local app |
| Product type | Multi-tenant support | One company, one database |
| Product type | Cloud/hosted API | Offline-only Electron app |
| Product type | Public user registration | Internal staff only |
| UI direction | Full UI v2 rewrite | Existing pages work; improve incrementally |
| UI direction | New design system alongside theme.css | Creates duplication and maintenance debt |
| UI direction | Futuristic / glassmorphism / neon | Wrong tone for a practical ERP |
| UI direction | SaaS landing page patterns | Not a product, not a website |
| UI direction | AI assistant widget / chatbot | Not requested, adds complexity |
| UI direction | Excessive animations | Distracts from data-entry workflows |
| Modules | Attendance module UI | Schema exists, no frontend — not prioritized |
| Modules | Maintenance UI | Backend only — not prioritized |
| Modules | Inventory UI (new rebuild) | Basic implementation exists — improve only |
| Modules | New reporting engine | ExcelJS + PDFKit sufficient |
| Architecture | Microservices | Single local Express app is correct scale |
| Architecture | Kubernetes / Docker | Desktop app, no containerization needed |
| Architecture | Real-time sync / WebSockets | Offline SQLite, no network sync needed |
| Architecture | External auth provider | JWT + bcrypt is sufficient |
| Engineering | Skipping TypeScript validation | Always run `tsc --noEmit` before committing |
| Engineering | Auto-commit / auto-push / auto-merge | Always requires explicit user approval |

---

## 16. Related Files

| File | Purpose |
|------|---------|
| `frontend/src/app/theme.css` | Live implementation of this design system — ground truth |
| `frontend/src/config/modules.tsx` | Data-driven config that renders ResourcePage instances |
| `frontend/src/components/DataTable.tsx` | Reusable data grid with search, sort, pagination |
| `frontend/src/components/FormDialog.tsx` | Generic form modal builder |
| `frontend/src/components/Layout.tsx` | Main shell: sidebar + topbar |
| `docs/superpowers/specs/2026-06-08-manar-ui-lab-design.md` | Design spec for UI prototype lab |
| `docs/superpowers/specs/2026-06-09-page-level-improvements-phase1-design.md` | Filter/search UX patterns |
| `CLAUDE.md` | Engineering conventions and workflow |
| `AGENTS.md` | Agent operating manual — architecture, modules, safety rules |
| `PROJECT_STATE.md` | Current production baseline and module inventory |

---

*Document version: 2026-06-09. Update when theme.css changes or new page patterns are established.*
