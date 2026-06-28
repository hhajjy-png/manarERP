# manarERP — AI Assistant Architecture

**Document type:** Architecture & Design Reference  
**Phase:** Phase 1 — Architecture Only (No runtime code)  
**Date:** 2026-06-28  
**Status:** Draft — Under Review  
**Scope:** Future AI Assistant subsystem design, safety model, layer definitions, MVP roadmap

> This document defines HOW the manarERP AI Assistant will be built — not the implementation itself.
> No code is written, no migrations are run, and no production logic is modified as part of this phase.

---

## Table of Contents

1. [Vision & Purpose](#1-vision--purpose)
2. [Architecture Principles](#2-architecture-principles)
3. [Layer Definitions](#3-layer-definitions)
4. [Security Model](#4-security-model)
5. [Assistant Skills Catalog](#5-assistant-skills-catalog)
6. [Never-Allowed Rules](#6-never-allowed-rules)
7. [MVP Recommendation](#7-mvp-recommendation)
8. [Implementation Roadmap](#8-implementation-roadmap)
9. [Risk Register](#9-risk-register)
10. [Open Decisions](#10-open-decisions)

---

## 1. Vision & Purpose

### What the AI Assistant is

The manarERP AI Assistant is a **business analysis tool** embedded in the existing Electron desktop application. It helps authorized users understand, explore, and extract insight from ERP data using natural language.

It is **not** a general-purpose chatbot.  
It is **not** an automation agent.  
It is **not** a decision-making system.  
It is a **read-only analytical interface** grounded in real company data.

### Target users

| User role | Expected use |
|-----------|-------------|
| Company director | Executive dashboard explanation, profit/loss insights, risk highlights |
| Finance manager | Bank statement analysis, expense trends, payroll totals |
| HR manager | Payroll history, salary trends, employee document verification |
| Operations manager | Contract status, equipment maintenance, expense categories |
| Auditor | Transaction history, anomaly flags, audit trail summaries |

### Problem it solves

manarERP stores rich operational data — invoices, contracts, payroll, bank statements, expenses, employees — but extracting actionable insight requires navigating many separate pages and running manual reports. The AI Assistant collapses this into a single query interface where a director can ask "What were our top expenses last quarter?" and receive a structured, sourced, explainable answer in seconds.

---

## 2. Architecture Principles

These principles are non-negotiable. Every implementation decision in later phases must be evaluated against them.

### P1 — Offline-First

The AI Assistant must function without any internet connection. Cloud AI providers may be offered as an **optional enhancement** but must never be required for core functionality. A user without internet must receive a usable (even if limited) experience.

### P2 — Read-Only by Default

The assistant may only retrieve data. It may never write, update, delete, or otherwise mutate records. Phase 1 through Phase 3 are strictly read-only. Any future write capability (Phase 5+) requires an entirely separate approval workflow with explicit user confirmation, full audit trail, and a reversible operation log.

### P3 — SELECT-Only SQL

No SQL that modifies state may be constructed or executed by any AI pathway. This is enforced at the SQL layer (not just by prompt instruction) through a validated query interceptor. The restriction applies to: `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `PRAGMA` write operations, `ATTACH`, `DETACH`, `CREATE`, `REPLACE`, `UPSERT`.

### P4 — RBAC-Aware Access Control

The assistant inherits the **exact same RBAC permissions** as the currently logged-in user. If a user cannot view payroll records through the normal UI, they cannot ask the assistant for payroll data. The assistant queries only through permission-filtered service methods — never through a privileged backdoor.

### P5 — Audit Logging for Every AI Request

Every query sent to the assistant, every tool invoked, every SQL query executed, and every result returned must be written to the audit log. This creates a complete and unalterable record of AI activity for compliance and security review.

### P6 — Explainable Answers

Every answer must include:
- The source data (which table, which record range, which filters were applied)
- The query or method used to derive the answer
- Confidence indicators where applicable
- A link to the related page or report in the ERP

Vague, hallucinated, or unverifiable answers are a failure mode.

### P7 — Source-Cited Answers

Answers must cite specific records. "Your top expense in May 2026 was Equipment Maintenance — KWD 4,200.500 (Expense #E-2026-0412)" is acceptable. "Expenses were high last month" is not.

### P8 — No Hidden Actions

The assistant must never perform background operations the user did not explicitly request. No silent database reads beyond the stated query scope, no prefetching of sensitive data for "context," no background model training on company data.

### P9 — No Automatic Database Modification

Even in future write phases, no modification may be performed without a user-visible approval step that presents: what will change, which record, what the previous value was, and what the new value will be. The user must confirm in a dedicated UI — not just by pressing Enter in a chat input.

### P10 — No Mandatory Cloud Dependency

The system may offer optional cloud AI (e.g., a configurable API key for an external provider) but must never require it. Secrets are never stored in the repository. Provider configuration is stored in the existing settings module (database-backed, per-installation).

### P11 — Local AI Runtime Compatibility

The architecture must be designed from the start to support local LLM runtimes (Ollama, llama.cpp, local embedding models) as first-class providers, not as afterthoughts. The provider abstraction layer must treat a local model with the same interface as a cloud model.

### P12 — Clear Layer Separation

AI UI, AI Core Orchestrator, Tool Layer, Safe SQL Layer, RAG Layer, Document AI Layer, and Local Runtime Layer are distinct architectural layers with defined interfaces. No layer may call another's internal implementation directly. All cross-layer communication goes through defined interfaces.

---

## 3. Layer Definitions

### Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────┐
│                        ELECTRON DESKTOP APP                           │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    AI WORKSPACE UI (Layer 1)                      │  │
│  │  Chat input · Suggested prompts · Result cards · Source refs      │  │
│  └────────────────────────────┬────────────────────────────────────┘  │
│                                │ IPC / HTTP (localhost only)           │
│  ┌─────────────────────────────▼────────────────────────────────────┐  │
│  │               AI CORE ORCHESTRATOR (Layer 2)                      │  │
│  │  Intent parser · Safety enforcer · Tool selector · Result builder │  │
│  └──────┬──────────────┬──────────────┬──────────────┬──────────────┘  │
│         │              │              │              │                  │
│  ┌──────▼───┐  ┌───────▼───┐  ┌──────▼───┐  ┌──────▼──────────────┐  │
│  │ SAFE SQL  │  │   TOOL    │  │   RAG /  │  │  DOCUMENT AI / OCR  │  │
│  │  LAYER   │  │  LAYER    │  │  KNOWLEDGE│  │      LAYER          │  │
│  │ (Layer 3) │  │ (Layer 4) │  │ (Layer 5) │  │     (Layer 6)       │  │
│  └──────┬───┘  └───────────┘  └──────────┘  └─────────────────────┘  │
│         │                                                               │
│  ┌──────▼──────────────────────────────────────────────────────────┐  │
│  │                     PRISMA / SQLITE                               │  │
│  │          (read-only pathway — existing data, no new writes)       │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │            LOCAL AI RUNTIME LAYER (Layer 7)                       │  │
│  │  Provider abstraction · Ollama · llama.cpp · Optional cloud API   │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
```

---

### Layer 1: AI Workspace UI

**Location:** `frontend/src/pages/AIAssistant.tsx` (future)  
**Role:** User-facing interface for all AI interactions

#### Components

| Component | Purpose |
|-----------|---------|
| `ChatInterface` | Main message thread — user queries and assistant responses |
| `SuggestedPrompts` | Pre-built prompt cards for common analysis tasks |
| `QuickActionCards` | One-click access to deterministic insight views |
| `ResultCard` | Structured response display with charts, tables, source refs |
| `SourceBadge` | Cites which table/record/date-range produced the answer |
| `RelatedPageLink` | Deep-link to the corresponding ERP page/report |
| `ExportAnswerButton` | Export response as PDF or Excel |
| `PrivacyModeToggle` | Masks sensitive figures in display (payroll amounts, etc.) |
| `AuditTrailView` | Displays the AI's query history for the current session |

#### UI States

- **Ready:** Awaiting input, showing suggested prompts
- **Thinking:** Tool invocation in progress, streaming partial results
- **Result:** Answer displayed with source citations
- **Refused:** Request denied — shows reason (permission, safety, scope)
- **Error:** Tool or SQL failure — shows friendly message, no raw error exposed

#### Design Constraints

- Full RTL support (Arabic-first, same as the rest of the app)
- Must function in the existing Layout shell (sidebar + topbar)
- No new dependencies beyond what exists in `frontend/package.json`
- Privacy Mode must mask salary figures, exact financial amounts when enabled

---

### Layer 2: AI Core Orchestrator

**Location:** `backend/src/modules/ai/ai.orchestrator.ts` (future)  
**Role:** The central decision engine — interprets intent, enforces safety, routes to tools, builds responses

#### Responsibilities

1. **Intent Classification:** Map a natural-language query to a structured intent object
   ```
   Intent {
     skill: "payroll" | "bank" | "expenses" | "contracts" | "customers" | "reports" | "executive" | "documents"
     action: "summarize" | "analyze" | "compare" | "explain" | "search" | "extract"
     filters: DateRange, EntityIds, AmountRange, etc.
     requester: UserId
     permissions: Permission[]
   }
   ```

2. **Safety Enforcement:** Before any tool call, validate:
   - User has permission for the requested data scope
   - Request does not attempt to write, delete, or modify data
   - Request is within the allowed skill scope
   - No prompt injection patterns detected

3. **Tool Selection:** Route to the appropriate Tool Layer function based on intent

4. **Result Building:** Assemble the structured response including data, metadata, source citations, and follow-up suggestions

5. **Refusal Generation:** When a request is unsafe, out-of-scope, or permission-denied — generate a clear, specific refusal message (not a generic error)

#### Safety Gate (enforced before every tool call)

```
SafetyCheck {
  hasPermission(userId, requiredPermission) → boolean
  isReadOnly(intent) → boolean
  isWithinScope(intent, allowedSkills) → boolean
  noPromptInjection(rawQuery) → boolean
  withinRateLimit(userId) → boolean
}
```

If any check fails: refuse, log, return structured refusal response.

---

### Layer 3: Safe SQL Layer

**Location:** `backend/src/modules/ai/sql/safeSql.service.ts` (future)  
**Role:** The only pathway to database reads from the AI system. Enforces all data safety rules at the infrastructure level.

#### Hard Rules (enforced in code, not by prompt)

| Rule | Implementation |
|------|---------------|
| SELECT only | Query parsed and validated before execution — any non-SELECT keyword triggers immediate rejection |
| No subquery writes | Recursive parser checks for write operations in subqueries |
| Allowed table whitelist | Only tables explicitly listed in `AI_ALLOWED_TABLES` may be queried |
| RBAC filtering | Every query automatically receives a WHERE clause injected for the user's accessible scopes |
| Row limit | Maximum 1,000 rows returned per query |
| Query timeout | 10 second hard timeout |
| Parameterized only | No string concatenation into SQL — all values via Prisma parameters |
| No raw `prisma.$queryRaw` | Queries go through a typed query builder, never raw string SQL |

#### Allowed Table Whitelist (Phase AI-2 starting point)

```typescript
const AI_ALLOWED_TABLES = [
  'Invoice', 'InvoiceItem', 'Payment',
  'Expense', 'ExpenseCategory',
  'Employee', 'Salary', 'PayrollRun',
  'Contract', 'Customer', 'Supplier',
  'BankAccount', 'BankTransaction', 'BankStatement',
  'Transaction', 'JournalEntry',
  'Equipment', 'MaintenanceRecord',
  'AuditLog',
] as const;
```

Tables **not** on the whitelist: `User`, `Role`, `Permission`, `RolePermission`, `UserRole`, `Setting`, `BackupRecord`, `AIQuery` (meta tables).

#### Query Audit Record

Every SQL execution produces an `AIQueryLog` record:

```
AIQueryLog {
  id
  userId
  timestamp
  naturalLanguageQuery   // original user text
  resolvedIntent         // structured intent object
  sqlExecuted            // the actual SQL string
  rowsReturned
  executionMs
  allowed                // boolean — was it executed or blocked?
  blockedReason          // if blocked: which rule triggered
  resultHash             // SHA-256 of result for tamper evidence
}
```

---

### Layer 4: Tool Layer

**Location:** `backend/src/modules/ai/tools/` (future)  
**Role:** Deterministic, auditable functions that translate structured intent into SQL queries and return typed results

Each tool is a pure function:

```typescript
interface AiTool<TInput, TOutput> {
  name: string
  requiredPermission: Permission
  execute(input: TInput, userId: string): Promise<AiToolResult<TOutput>>
}

interface AiToolResult<T> {
  data: T
  sources: SourceRef[]
  queryLog: AIQueryLog
  followUpSuggestions: string[]
}
```

#### Defined Tools (Phase AI-2 and beyond)

| Tool | Permission Required | Returns |
|------|--------------------|---------| 
| `bankStatementExplorer.summarize` | `bank_accounts.view` | Statement summary, totals, categories |
| `bankStatementExplorer.topTransactions` | `bank_accounts.view` | Top N transactions by amount |
| `bankStatementExplorer.feeAnalysis` | `bank_accounts.view` | Bank fee breakdown |
| `payrollAnalytics.monthlySummary` | `salaries.view` | Monthly payroll totals per period |
| `payrollAnalytics.employeeHistory` | `salaries.view` | Single employee pay history |
| `payrollAnalytics.anomalyFlags` | `salaries.view` | Salaries outside expected range |
| `expenses.topCategories` | `expenses.view` | Ranked expense categories |
| `expenses.monthlyTrend` | `expenses.view` | Month-over-month expense trend |
| `contracts.activeSummary` | `contracts.view` | Active contract list with values |
| `contracts.expiringSoon` | `contracts.view` | Contracts expiring within N days |
| `customers.balanceSummary` | `customers.view` | AR balances per customer |
| `customers.invoiceHistory` | `invoices.view` | Invoice history for a customer |
| `reports.runPreview` | `reports.view` | Execute a pre-defined report and summarize |
| `executive.kpiExplain` | `reports.view` | Explain current KPI values |
| `executive.profitLossSummary` | `reports.view` | P&L summary with variance |
| `documents.extractPreview` | varies | OCR extraction preview (never auto-saves) |

---

### Layer 5: RAG / Knowledge Layer

**Location:** `backend/src/modules/ai/rag/` (future, Phase AI-3)  
**Role:** Optional retrieval-augmented generation over approved company documents

#### Scope

The RAG layer operates on **approved, explicitly indexed** documents only:

- Generated reports (exported PDFs/Excel already in the system)
- Company policies (uploaded by admin)
- Contract PDFs (if explicitly linked to a Contract record)
- HR forms and employee documents (if employee-scoped access is granted)

It does **not** index:
- The raw SQLite database file
- Backup files
- Electron app source code
- User session data or JWT tokens

#### Rules

| Rule | Implementation |
|------|---------------|
| Cite sources | Every RAG answer includes document name, page/section, date |
| No hallucination guarantee | Answers include a confidence score; below threshold → "I could not find this in the indexed documents" |
| Local embeddings preferred | Embeddings stored in a local vector store (SQLite-based, e.g., `sqlite-vss`) |
| RBAC document scoping | A document is only retrievable if the requesting user has permission for its module |
| Embedding freshness | Documents are re-indexed on upload/update, not on query |

---

### Layer 6: Document AI / OCR Layer

**Location:** `backend/src/modules/ai/ocr/` (future, Phase AI-4)  
**Role:** Extract structured data from uploaded images and PDFs for human verification before any system entry

#### Workflow (always)

```
1. User uploads document (invoice scan, bank statement PDF, employee form)
2. OCR layer extracts text and attempts structure recognition
3. AI Core maps extracted fields to ERP schema fields
4. Result is presented to user as a PREVIEW — never written to the database
5. User reviews, corrects if needed, and explicitly confirms
6. Only after confirmation: a standard API call (not an AI call) writes the record
```

This is the **only acceptable path** for document-to-data in Phase AI-4. Steps 3–6 may not be skipped or automated.

#### Offline preference

- Primary: local OCR engine (Tesseract.js, already runs in Node)
- Secondary: optional cloud vision API (user-configured, never required)
- Fallback: extract raw text only, let user structure it manually

---

### Layer 7: Local AI Runtime Layer

**Location:** `backend/src/modules/ai/providers/` (future, Phase AI-3)  
**Role:** Provider abstraction that normalizes all LLM interactions behind a single interface

#### Provider Interface

```typescript
interface AIProvider {
  name: string
  type: 'local' | 'cloud'
  isAvailable(): Promise<boolean>
  complete(prompt: AiPrompt): Promise<AiCompletion>
  embed(text: string): Promise<number[]>
}
```

#### Supported Providers (planned)

| Provider | Type | Notes |
|----------|------|-------|
| Ollama (llama3, mistral, etc.) | Local | Requires Ollama installed on the machine |
| llama.cpp | Local | Direct binary integration |
| OpenAI-compatible API | Cloud | Optional, user-supplied API key |
| Anthropic API | Cloud | Optional, user-supplied API key |
| Deterministic (no LLM) | Built-in | Phase AI-1 fallback — rule-based insights, no model needed |

#### Provider Selection Logic

```
1. Check if a cloud provider is configured and available → use if yes
2. Check if local provider (Ollama) is running → use if yes
3. Fall back to deterministic insights engine (Phase AI-1 behavior)
4. Never fail silently — inform the user which mode is active
```

#### Security: No Secrets in Repository

API keys are stored in the existing `Setting` table (database-backed, encrypted at rest in future phases). Never in `.env` files committed to the repository, never hardcoded.

---

## 4. Security Model

### RBAC Inheritance

The AI Assistant has **no independent permissions**. It operates under the exact permission set of the authenticated user making the request. Permission checks happen at:

1. **Orchestrator level:** Intent classification checks if the user has the required base permission before selecting a tool
2. **Tool level:** Each tool declares its `requiredPermission`; the orchestrator validates before calling
3. **SQL level:** RBAC-injected WHERE clauses ensure data rows the user cannot see in the UI are not returned by AI queries
4. **Document level:** RAG and OCR only operate on documents within the user's module access

`SYSTEM_ADMIN` bypass applies as in the rest of the system — but this is an audit risk and should be logged at elevated severity.

### Data Scopes

| Data type | Scope enforcement |
|-----------|-------------------|
| Payroll/Salaries | Requires `salaries.view`; employee scope enforced for HR role |
| Bank statements | Requires `bank_accounts.view`; account-level filtering |
| Contracts | Requires `contracts.view`; customer-linked scoping |
| Invoices | Requires `invoices.view`; type (sales/purchase) filtering |
| Expenses | Requires `expenses.view`; department scoping where applicable |
| Employees | Requires `employees.view`; own-record access for non-HR roles |
| Audit logs | Requires `audit.view`; read-only regardless of role |

### Prompt Injection Defense

AI queries pass through a sanitization step before reaching the orchestrator:

- Detect and strip known injection patterns (`ignore previous instructions`, `system:`, `</s>`, role-escalation patterns)
- Enforce maximum input length (2,000 characters for Phase AI-1/2)
- Log all rejected inputs as security events in the audit log
- Refused inputs are never sent to any LLM — they are caught before the provider call

This is defense-in-depth. The primary protection is that the SQL layer enforces read-only at the code level regardless of what the LLM instructs.

### Document Injection Defense

Uploaded documents may contain adversarial text designed to manipulate an LLM (e.g., a scanned invoice with hidden instructions). Defense:

- OCR output is sanitized before being passed to any LLM context
- LLM is only asked to map structured fields, not to execute or interpret instructions from document content
- Raw OCR text is shown to the user before any LLM processing

### Rate Limits

| Limit | Default |
|-------|---------|
| Queries per user per hour | 60 |
| Queries per user per minute | 10 |
| Max tokens per query (output) | 2,000 |
| Max SQL rows per query | 1,000 |
| Max document size for OCR | 10 MB |

### Sensitive Data Masking

When Privacy Mode is enabled by the user:

- Salary and payroll figures are masked in the UI (shown as `*** د.ك`)
- Individual employee names in financial contexts are masked
- Bank account numbers show last 4 digits only
- National ID numbers are never shown in AI responses

Masking is applied in Layer 1 (UI) and Layer 2 (result builder) — not at the SQL level (the data is retrieved but masked before display).

### Audit Log Retention

AI query logs (`AIQueryLog`) are retained for 2 years by default. This is separate from the general `AuditLog` table. Retention policy is configurable per-installation in Settings.

---

## 5. Assistant Skills Catalog

### Skill 1: Bank Statement Explorer

**Permission required:** `bank_accounts.view`  
**Input:** Date range, bank account (optional)  
**Outputs:**

- Statement summary (opening balance, closing balance, total in/out)
- Largest withdrawals (top 10 by amount, with payee and date)
- Largest deposits (top 10)
- Bank fee breakdown (identified by category)
- Unrecognized transaction flags (transactions without category or counterpart)
- Month-over-month comparison

**Safety note:** No check numbers, full account numbers, or personal counterpart details exposed unless user has explicit permission.

---

### Skill 2: Payroll Analytics

**Permission required:** `salaries.view`  
**Input:** Period (month/quarter/year), employee (optional)  
**Outputs:**

- Monthly payroll totals (gross, deductions, net)
- Employee count trend
- Salary distribution histogram
- Employees with salary changes in the period
- Anomaly flags: salary > 2× personal average, missing deductions
- Department payroll breakdown

**Safety note:** Individual salary amounts masked in Privacy Mode. HR role sees full data; line managers see department only (future scope restriction).

---

### Skill 3: Expense Analysis

**Permission required:** `expenses.view`  
**Input:** Date range, category (optional)  
**Outputs:**

- Top expense categories (ranked by total)
- Month-over-month trend per category
- Unusual expense flags (> 2× category average)
- Vendor concentration (top 5 payees by total)
- Expenses without receipts / without approval (if approval workflow is active)

---

### Skill 4: Contract Analysis

**Permission required:** `contracts.view`  
**Input:** Status filter, date range (optional)  
**Outputs:**

- Active contracts list with values and end dates
- Contracts expiring in next 30/60/90 days
- Total contract value by customer
- Contract value vs. invoiced amount (completion ratio)
- Contracts with no recent activity

---

### Skill 5: Customer Analysis

**Permission required:** `customers.view` + `invoices.view`  
**Input:** Customer (optional), date range  
**Outputs:**

- Customer AR balance (outstanding invoices)
- Payment pattern (average days to pay)
- Invoice history summary
- Overdue invoices by customer
- Top customers by revenue in period

---

### Skill 6: Report Explainer

**Permission required:** `reports.view`  
**Input:** Report type + period already visible in the Reports Center  
**Outputs:**

- Plain-language summary of what the report shows
- Key figures highlighted (highest, lowest, most changed)
- Period-over-period comparison
- Notable anomalies flagged
- Suggested follow-up questions

**Design note:** The Report Explainer does not re-run reports independently. It reads the same data the Reports Center shows and explains it.

---

### Skill 7: Executive Insight

**Permission required:** `reports.view` (dashboard-level)  
**Input:** Current dashboard period  
**Outputs:**

- KPI explanation (what each KPI means, what drove the current value)
- Profit/loss reasons (top contributing items)
- Risk highlights (overdue AR, expiring contracts, unusual expenses)
- Positive highlights (revenue growth, cost reduction)
- Suggested actions (non-prescriptive: "3 contracts expire this month — review in Contracts Center")

**Design note:** Suggested actions are navigational only. The assistant never instructs the user to change records.

---

### Skill 8: Document AI (Phase AI-4)

**Permission required:** Varies by document type (invoice permission for invoices, etc.)  
**Input:** Uploaded image or PDF  
**Outputs (always preview only):**

- Extracted structured fields (invoice number, date, vendor, amounts, line items)
- Confidence score per field
- Fields that could not be extracted (shown as blank, user must fill)
- Matching suggestion ("This vendor matches Supplier #42 in your system")

**Strict rule:** Nothing is written to the database. The user reviews the extraction, corrects it, and explicitly saves through the normal invoice/expense creation flow.

---

## 6. Never-Allowed Rules

The following are permanently prohibited across all phases of the AI Assistant. These are not configuration options — they are hard constraints.

### Data Modification

- Direct database writes through any AI pathway
- Automatic journal entry creation from AI analysis
- Auto-posting of invoices, expenses, or payments
- Deletion or archival of any record
- Modification of payroll figures
- Editing of approved contracts or invoices
- Changing user permissions or roles
- Resetting passwords

### Data Exposure

- Exposing raw `User`, `Role`, `Permission`, or `RolePermission` table data to any LLM context
- Sending full JWT tokens, passwords, or API keys to any LLM
- Uploading company data to an external service without explicit per-session user consent
- Embedding sensitive PII (national IDs, passport numbers, personal bank details) in LLM prompts

### SQL Safety

- Unrestricted SQL (`prisma.$queryRawUnsafe` or similar)
- Model-generated SQL without parser validation
- Queries against tables not on the whitelist
- Queries without RBAC filtering

### AI Behavior

- Silent operations (any action the user did not explicitly request)
- Overriding or bypassing the authentication/RBAC middleware
- Caching AI responses that contain personal financial data between user sessions
- Auto-indexing documents without explicit admin enablement

---

## 7. MVP Recommendation

The recommended MVP is a phased rollout that delivers value early while keeping risk minimal.

### Phase AI-1: Deterministic Insight Shell (No LLM Required)

**Timeline estimate:** 2–3 weeks implementation  
**LLM required:** No  
**Risk level:** Minimal

Deliver:
- AI Workspace UI page (shell with suggested prompts, no free-text input yet)
- 3 quick-action cards wired to deterministic queries:
  - Bank Statement Explorer (top transactions, monthly totals)
  - Payroll Analytics (monthly summary, anomaly flags)
  - Reports Center Preview (explain the currently-viewed report's top 3 numbers)
- Full audit logging for every interaction
- RBAC enforcement for all 3 cards
- Privacy Mode toggle

Value: Users can get structured insight in 1 click with zero AI risk. Establishes the infrastructure that later phases build on.

---

### Phase AI-2: Safe SQL + Natural Language Templates

**Timeline estimate:** 3–4 weeks implementation  
**LLM required:** Optional (template matching can be rule-based)  
**Risk level:** Low

Deliver:
- Free-text chat input (limited to a predefined set of recognized intents)
- Safe SQL Layer with all whitelist and RBAC rules
- Expand to full Tool Layer coverage (all 8 skills)
- Structured refusal messages for out-of-scope queries
- Source citations on every response

Value: Users can type natural-language questions and receive sourced, explainable answers.

---

### Phase AI-3: Optional Local LLM

**Timeline estimate:** 4–6 weeks implementation  
**LLM required:** Optional (Ollama or cloud API key)  
**Risk level:** Medium (introduce LLM but read-only still enforced at SQL layer)

Deliver:
- Provider abstraction layer
- Ollama integration (local, offline-compatible)
- Optional cloud API (user-configured key, stored in Settings)
- RAG over approved reports and documents (SQLite vector store)
- Improved natural-language handling for edge cases not covered by templates

Value: Full conversational analysis across all ERP modules with local AI option.

---

### Phase AI-4: Document AI / OCR Preview

**Timeline estimate:** 3–4 weeks implementation  
**LLM required:** Optional (Tesseract.js is local)  
**Risk level:** Low-Medium (OCR only, user always verifies before any write)

Deliver:
- OCR extraction preview for invoices, bank statements, HR documents
- Structured extraction with confidence scores
- User verification workflow before any data entry
- Local Tesseract.js primary, optional cloud vision secondary

Value: Dramatically reduces manual data entry effort for scanned documents.

---

### Phase AI-5: Supervised Write Actions (Future, Not Currently Planned)

**Timeline estimate:** TBD — requires separate security design  
**LLM required:** Yes  
**Risk level:** High — requires dedicated security review before this phase begins

This phase is acknowledged here for roadmap completeness but is **not planned for design or implementation** until Phases AI-1 through AI-4 are complete and validated in production.

Any write action must go through:
1. AI proposes a change (not executes it)
2. Full diff shown to user (what will change, from what value, to what value)
3. User explicitly approves in a modal with the change details
4. Normal API pathway executes the change (not an AI pathway)
5. Audit log records both the AI proposal and the user approval

---

## 8. Implementation Roadmap

| Step | Deliverable | Phase | Prerequisites |
|------|------------|-------|---------------|
| 1 | This architecture document | AI-0 | — |
| 2 | AI Workspace UI shell (no-LLM) | AI-1 | Frontend route + layout integration |
| 3 | Deterministic Bank + Payroll + Reports cards | AI-1 | Safe SQL layer basic, RBAC filtering |
| 4 | Full Audit Logging (`AIQueryLog` table + migration) | AI-1 | Prisma migration reviewed + applied |
| 5 | Safe SQL Layer complete (whitelist, parser, RBAC injection) | AI-2 | Step 4 complete |
| 6 | Full Tool Layer (all 8 skills) | AI-2 | Step 5 complete |
| 7 | Free-text chat input with template matching | AI-2 | Steps 5–6 complete |
| 8 | Provider abstraction layer | AI-3 | Step 7 complete |
| 9 | Ollama local integration | AI-3 | Step 8 complete |
| 10 | RAG over reports (SQLite vector store) | AI-3 | Steps 8–9 complete |
| 11 | Optional cloud API (Settings-backed key) | AI-3 | Step 8 complete |
| 12 | OCR preview workflow (Tesseract.js) | AI-4 | Steps 1–4 complete |
| 13 | Document structured extraction + verification UI | AI-4 | Step 12 complete |
| 14 | Production security review (Gemini) | before any merge | Phase complete |

---

## 9. Risk Register

| Risk | Severity | Likelihood | Mitigation |
|------|----------|-----------|------------|
| LLM generates malicious SQL (prompt injection) | Critical | Medium | SQL parser validation at Layer 3 — LLM output is never executed directly |
| User data sent to cloud LLM without consent | Critical | Low | Provider abstraction enforces consent gate; local-first default |
| RBAC bypass via AI query | Critical | Low | RBAC injected at SQL layer, not trust LLM's intent classification alone |
| Hallucinated financial figures in AI responses | High | Medium | All answers must cite source records; unverifiable answers are refused |
| Sensitive data in LLM context (salaries, bank details) | High | Medium | Data passed to LLM as aggregated figures, not raw record dumps |
| OCR auto-writes incorrect data | High | Low | User verification step is mandatory before any write pathway |
| AI query log grows unbounded | Medium | High | Retention policy (2 years default) + size limit + archival strategy |
| LLM provider outage blocks AI features | Medium | Medium | Graceful degradation to deterministic insights (Phase AI-1 behavior) |
| Vector store corruption (RAG) | Medium | Low | RAG index is rebuildable from source documents; no primary data stored there |
| Privacy Mode bypass via AI export | Medium | Medium | Export function respects Privacy Mode masking — masked data is never in export |
| Float precision errors in AI-reported financial figures | Low | High | All monetary values formatted through existing `round3()` + KWD display helpers |
| Performance degradation from AI queries on large tables | Low | Medium | Row limits (1,000), query timeouts (10s), and read-only Prisma connection pool |

---

## 10. Open Decisions

These architectural decisions require further discussion before implementation begins.

| Decision | Options | Recommendation | Status |
|----------|---------|----------------|--------|
| Vector store implementation | `sqlite-vss`, `better-sqlite3-vector`, external file | `sqlite-vss` (keeps everything in SQLite, offline-compatible) | Open |
| LLM context window strategy | Full record dump vs. summary-only vs. aggregated stats | Aggregated stats only for financial data — never raw record dumps | Decided |
| Audit log table location | Existing `AuditLog` + new `AIQueryLog` | Separate `AIQueryLog` table — different retention and query patterns | Decided |
| Prompt template storage | Hardcoded in service | Hardcoded in Phase AI-1/2; database-backed in AI-3+ | Open |
| Privacy Mode scope | UI masking only vs. SQL-level masking | UI masking for now; SQL-level masking in AI-3+ for LLM context | Open |
| Rate limit enforcement | In-process vs. Redis | In-process (Electron app, single user per session) — no Redis needed | Decided |
| OCR engine | Tesseract.js vs. cloud API | Tesseract.js primary (offline); cloud optional (user-configured) | Decided |
| Phase AI-5 write gate | Modal confirmation vs. separate approval queue | Separate approval queue (consistent with existing approval workflow) | Open |

---

## Appendix A: File Layout (Future)

```
backend/src/modules/ai/
  ai.routes.ts              # AI endpoints (authenticated + audited)
  ai.controller.ts          # Thin handler → orchestrator
  ai.orchestrator.ts        # Core orchestrator (intent → tool → result)
  ai.schema.ts              # Zod validation for AI request/response
  sql/
    safeSql.service.ts      # SELECT-only query executor
    queryParser.ts          # SQL validation (blocks non-SELECT)
    rbacFilter.ts           # RBAC WHERE-clause injection
    allowedTables.ts        # Whitelist constant
  tools/
    bankStatement.tool.ts
    payrollAnalytics.tool.ts
    expenses.tool.ts
    contracts.tool.ts
    customers.tool.ts
    reports.tool.ts
    executive.tool.ts
    documents.tool.ts
  rag/
    rag.service.ts          # Document indexing + retrieval
    vectorStore.ts          # SQLite-based local embeddings
    documentIndexer.ts      # Approval-gated document ingestion
  ocr/
    ocr.service.ts          # OCR extraction orchestration
    tesseract.provider.ts   # Local Tesseract.js integration
    cloudVision.provider.ts # Optional cloud OCR (user-configured)
  providers/
    aiProvider.interface.ts # Provider abstraction contract
    ollama.provider.ts
    llamacpp.provider.ts
    openai.provider.ts
    anthropic.provider.ts
    deterministic.provider.ts  # Phase AI-1 fallback (no LLM)

frontend/src/pages/
  AIAssistant.tsx           # Main AI Workspace page

frontend/src/components/ai/
  ChatInterface.tsx
  SuggestedPrompts.tsx
  QuickActionCard.tsx
  ResultCard.tsx
  SourceBadge.tsx
  PrivacyModeToggle.tsx
  AuditTrailView.tsx
```

---

## Appendix B: Relationship to Existing Architecture

The AI Assistant is an **additive layer** over the existing backend. It does not modify:

- `auth.middleware.ts` / `rbac.middleware.ts` — it calls through them, not around them
- Any existing module's service layer — tools use the Safe SQL layer, not service methods directly
- Prisma schema models other than adding `AIQueryLog`
- The Electron main process — AI is a backend module, not an IPC channel
- `preload.ts` — no new IPC channels needed for Phase AI-1/2

The only schema change required before any code runs: adding the `AIQueryLog` model and its migration (Phase AI-1, Step 4).

---

*Document maintained by: manarERP engineering*  
*Next review: Before Phase AI-1 implementation begins*  
*Version: 1.0.0 — 2026-06-28*
