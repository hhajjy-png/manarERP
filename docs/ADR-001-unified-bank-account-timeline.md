# ADR-001: Unified Bank Account Timeline Architecture

**Status:** Accepted  
**Date:** 2026-06-29  
**Author:** manarERP Architecture  

---

## Context

The Bank Statement Import feature was initially designed around the concept of an **Import Batch** as the primary operational entity. Users would import a file, open that file, and work within the scope of that specific file.

As usage evolved, a core tension emerged: users do not think in terms of files. They think in terms of accounts. When a user says "show me Gulf Bank activity," they mean all their Gulf Bank transactions across every statement ever imported — not a specific January file.

The original design forced users to:
- Navigate to a specific import
- View only that import's transactions
- Switch manually between imports to compare

This created cognitive friction because the UI model did not match the user's mental model.

---

## Decision

**The operational entity in manarERP is the Unified Bank Account Timeline, not the Import Batch.**

A Bank Account is identified by its `accountKey` (derived from IBAN → account number → bank name hierarchy).

The Timeline for a given `accountKey` is the authoritative view of all transactions for that account, spanning every import batch that contributed data to it.

### Architectural hierarchy

```
Bank Account (identified by accountKey)
  └── Unified Timeline (all transactions, chronologically ordered)
        └── Transaction (statementDate, debit, credit, balance, ...)
              └── Import Batch (provenance: fileName, importedAt, importedBy)
```

NOT:

```
Import Batch (fileName, importedAt)
  └── Transactions
```

### Import Batch role

Import Batches are retained as:

- **Provenance**: which file a transaction came from
- **Audit trail**: who imported, when, how many rows
- **Deletion unit**: if an import needs to be removed and re-imported
- **Deduplication reference**: the incremental import system uses batches to detect overlaps

Import Batches are **not** the unit of analysis, reporting, or user navigation.

---

## Rationale

### User mental model

A user who banks with Gulf Bank has one Gulf Bank account. They import:

- January 2025 statement
- February 2025 statement
- March 2025 statement

In their mind, this is **one account's history**, not three separate files. The system must reflect this.

### Incremental imports

The Bank Statement Incremental Import v2 feature (released 2026-06-29) establishes that each import only contributes **new transactions** not previously seen. This is only meaningful if the system understands that all three imports are contributions to the same account — not isolated datasets.

### Analytics and AI

Future analytical features (trends, balance projections, fee analysis, AI assistant queries) require a complete account history. An AI assistant asked "what were my total bank fees in Q1?" cannot answer correctly if it can only see one import at a time.

---

## Implementation

### Current state (as of ADR date)

- `BankStatementImport` model has `accountKey` field (derived at import time)
- `BankStatementTransaction` model has `accountKey` field (inherited from import)
- `GET /bank-statement-import/timeline/:accountKey` endpoint returns all transactions for an account across all imports
- `BankReconciliation.tsx` (Explorer page) auto-switches to Timeline view when an `accountKey` is available
- Toggle exists to view "دفعة الاستيراد الحالية" (batch view) for provenance/audit needs

### UI language

| Avoid | Prefer |
|-------|--------|
| كشف بنكي (as primary entity) | الحساب البنكي |
| مستورد / استيراد (as user action) | إضافة / إثراء السجل |
| عرض الكشف | استعراض السجل الزمني |
| كشف رقم 3 | دفعة الاستيراد (in audit contexts) |

Navigation labels:
- "الحسابات البنكية" (was: "مطابقة كشف الحساب")
- "إضافة كشف بنكي" (was: "استيراد كشف الحساب")

### Explorer page behavior

1. **Default view**: Timeline mode — shows all account transactions when `accountKey` is available
2. **Secondary view**: Batch mode — shows only the selected import's transactions (for provenance/audit)
3. **Auto-switch**: On import selection, page automatically enters Timeline mode if `accountKey` exists
4. **Toggle**: User can manually switch between modes

---

## Relationship with subsystems

### AI Assistant

The AI Assistant (current phase: AI-2.5) must prefer the Unified Timeline over the latest import when performing bank analysis. The timeline endpoint provides the full account history with date filters, enabling queries like "show me all transactions in March" across all imports.

Fallback: if `accountKey` is not available (e.g., very old imports without the field), the AI should use the latest import.

### Reports

Reports involving bank data must operate on the Timeline with date filters. Individual import reports exist only for audit purposes (e.g., "what did import #7 contain?").

### Future OCR imports

When document OCR or photo-based imports are introduced (Phase v4+), the resulting transactions must be associated with an `accountKey` and inserted into the unified timeline using the same incremental dedup logic. The import mechanism (file upload vs OCR vs API) is irrelevant to the timeline.

### Future real-time bank feeds

If direct bank API integration is added, each fetch should be treated as an import batch contributing to the existing timeline — not as a new account.

---

## Consequences

### Positive

- User experience matches mental model: "my account" not "my file"
- AI and analytics can operate on complete history
- Incremental import is meaningful and correct
- Deduplication prevents double-counting across imports

### Neutral

- Import Batch UI still exists for audit/provenance — this is intentional and correct
- `accountKey` derivation depends on data quality in imported files; imports without IBAN/account number cannot be grouped into a unified timeline

### Risks

- `accountKey` collision: two different accounts at the same bank with no IBAN and identical account number strings would be merged. Mitigation: IBAN is the primary key; account number is only used when IBAN is absent.
- Legacy imports (pre-ADR-001) may not have `accountKey`. They will appear in batch-only mode with no timeline view.

---

## Phase v3.1 Recommendations

1. **Timeline as entry point**: The Explorer page could default to showing a list of all known `accountKey` values (bank accounts), rather than a list of import batches. Users would pick their account, then see the timeline directly.

2. **Account registry**: Introduce a lightweight `BankAccount` model (accountKey, bankName, accountLabel, currency) that persists account identity independently of imports. This allows renaming accounts and managing them directly.

3. **Balance tracking**: Store running balance checkpoints per account to enable efficient "balance as of date" queries without scanning the full timeline.

4. **Cross-account analytics**: Dashboard widget showing all bank accounts with their latest balance and recent activity — operating on timelines, not on import batches.

5. **Timeline health indicators**: Flag accounts where the timeline has gaps (date ranges with no imported data), suggesting the user may have missing statement periods.

---

## References

- Bank Statement Incremental Import v2: commit `1f269b6`, tag `stable-bank-statement-incremental-import-v2`
- Timeline endpoint: `GET /bank-statement-import/timeline/:accountKey`
- Explorer page: `frontend/src/pages/BankReconciliation.tsx`
- Import page: `frontend/src/pages/BankStatementImport.tsx`
- Account key derivation: `backend/src/modules/bankStatementImport/fingerprint.ts` (`buildAccountKey`)
