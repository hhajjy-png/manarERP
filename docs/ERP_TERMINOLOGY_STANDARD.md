# ERP Terminology Standard — English Localization (v1)

> **Status:** Authoritative. This is the permanent source of truth for all English (`en`) UI wording in manarERP.
> **Scope:** English strings only. Arabic (`ar`) is the production baseline and is **never** modified by this standard.
> **Location of strings:** `frontend/src/lib/i18n.ts` → `DICT.en`. Every user-facing English string resolves through `t()` / `useT()`.
> **Reference basis:** Terminology validated against Microsoft Dynamics 365, SAP, Oracle Fusion Cloud ERP, and Odoo Enterprise conventions.

---

## 1. Conventions

| Rule | Standard |
|------|----------|
| **Spelling** | US English **except** the established banking term **"Cheque"** (retained per Gulf/Kuwait usage). So: `Center`, `License`, `Tires`, `Organization` — but `Cheque`, not `Check`. |
| **Currency code** | `KD` (three decimals). Do not mix `KWD`/`KD` in labels. |
| **Casing — labels** | Title Case for: nav items, buttons, tabs, section titles, column headers, field labels, select options, modal titles, KPI/stat cards. |
| **Casing — prose** | Sentence case for: messages, confirmations, tooltips, placeholders, subtitles, validation errors. |
| **Company legal name** | `Al Manar Al Duwaliya Company L.L.C` (official English name). Used wherever the legal entity is printed (payslip, cheque). |
| **Brand token** | `Al Manar` (space, no hyphen) — never `Al-Manar`. |

---

## 2. Canonical Term Glossary

One approved term per business concept. Replace every listed variant on sight.

| Concept | ✅ Approved | 🚫 Do not use |
|---------|------------|---------------|
| Person/entity the company sells to | **Customer** | Client, Party (as a customer synonym) |
| Person/entity the company buys from | **Supplier** | Vendor |
| Company workforce member | **Employee** | Staff, Worker |
| Sales/purchase billing document | **Invoice** | Bill, Claim ("Invoices & Claims" → "Invoices") |
| Payroll process / run | **Payroll** | Salaries (as the process name) |
| Individual pay amount | **Salary** | Wage |
| Accounting entry | **Journal Entry** | Journal (standalone), Voucher (for GL) |
| Money owed by customers, still due | **Outstanding** | Uncollected |
| Past-due receivable | **Overdue** | Late |
| Status of an unpaid invoice | **Unpaid** | Uncollected, Open |
| Authentication in | **Sign In** | Login, Log In |
| Authentication out | **Sign Out** | Logout, Log Out |
| Sales-side invoice direction | **Sales** / **Customer Transport** | Client Transport |
| Purchase-side invoice direction | **Purchase** / **Supplier Purchase** | — |
| Bank instrument | **Cheque** | Check |
| Inventory intake doc | **Goods Receipt** | GRN (spell out in UI) |
| Inventory outflow doc | **Material Issue** | Stock Out |
| Procurement doc | **Purchase Order** | PO (spell out in UI labels) |

---

## 3. Register & Verb Rules

| Context | Rule | Example |
|---------|------|---------|
| **Primary "create document" action** | `New <Entity>` | New Customer, New Supplier, New Vehicle, New Employee, New Expense, New User, New Invoice |
| **Add a line item / child row** | `Add <Thing>` / `＋ Add <Thing>` | Add Line, Add Material |
| **Commit a payment** | `Record Payment` | — |
| **Receive a customer payment** | `Collect` / `Collect Payment` | (AR collections domain) |
| **Post to ledger** | `Post` | Post, Post Entry |
| **Page titles** | Bare module noun; avoid redundant "Management" | `Accounting` (not "Accounting Management"); singular modifier: `Cheque Management` |
| **Person-routed expense category** | `Expense via <Name>` | Expense via Hassan, Expense via Nazeer, Expense via Driver |

**Transliteration:** one Latin spelling per Arabic proper noun. نظير → **Nazeer** (never "Natheer").

---

## 4. Sanctioned Arabic-in-English Exceptions

Per policy, the only Arabic permitted in English mode is data, not UI chrome. Two sanctioned exceptions exist:

1. **Employee Arabic Name** — a data field; always shown in its original Arabic.
2. **`opt.currency_lang.arabic`** = `'Arabic: 1,250.000 د.ك'` — this option **previews** the Arabic currency format for the user choosing a display language. The `د.ك` is intentional sample data; removing it would defeat the option's purpose.

No other English-mode string may contain Arabic script.

---

## 5. v1 Change Log

Standardized in this pack (English values only; keys and Arabic unchanged; key parity verified at 1211 ↔ 1211):

- **Auth:** `Logout` → `Sign Out`; audit `Login`/`Logout` → `Sign In`/`Sign Out`.
- **Customer canonical:** `Client Transport` → `Customer Transport`.
- **Invoice canonical:** `Invoices & Claims` → `Invoices`.
- **Receivables canonical:** `Uncollected Invoices` → `Outstanding Invoices`; dashboard chip `Overdue Invoices:` → `Outstanding Invoices:` (matches Arabic «مستحقة» = due/outstanding).
- **Create verbs unified to "New X":** Customers, Suppliers, Equipment (Vehicle), Employees, Expenses.
- **Expense categories → "Expense via X":** Hassan, Ghanem, Nazeer (transliteration fixed), Haroon, Driver.
- **Page titles:** `Accounting Management` → `Accounting`; `Cheques Management` → `Cheque Management`.
- **Accuracy:** `Transaction` → `Transfer No.` (salary column, matches «رقم التحويل»); `Download Empty Template` → `Download Blank Template`.
- **Brand/legal name:** login title/tagline normalized to `Al Manar`; payslip & cheque company set to official `Al Manar Al Duwaliya Company L.L.C`.

---

## 6. Governance

- All new English strings **must** conform to Sections 1–3 before merge.
- The app depends on **no** runtime web/translation service — this dictionary is self-contained and final.
- When adding a key, add it to **both** `ar` and `en` (missing `en` keys fall back to Arabic and leak into the English UI). Verify parity with the key-diff check.
