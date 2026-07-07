# Smart Transaction Presentation Engine — Phase 1 Audit & Design

Status: Approved design document
Scope: Bank Account Explorer transaction descriptions only
Mode: Display-only, no backend/database/import/accounting changes
Recommendation: Implement only high-confidence structured presentation patterns in a future standalone release.

---

## Positioning & release naming

- **This is NOT part of Bank Account Explorer Visual Refresh v2** (released as `stable-bank-account-explorer-visual-refresh-v2`, merge `f028768`). That release shipped the display-only `describeTransaction` baseline described below; the work in this document is a *separate, future* evolution.
- **Future release name:** **Smart Transaction Presentation Engine v1** — a standalone, display-only release to be planned and executed on its own feature branch.
- **Deferral / privacy stance (binding for v1):** low-confidence extraction — **person/company names, CIVIL ID, mobile numbers, and invoice/project inference** — must be **deferred or privacy-gated**. CIVIL ID and mobile numbers are the sharpest data-exposure risk and must never be auto-surfaced on the table row or Basic line by default.
- **ChatGPT recommendation (forward direction):** in later phases, evolve from the `SmartDescription` shape into a broader **Transaction Presentation Model** with **type-specific presentation templates** (per `bankFeeType` / direction) and **smart chips** (e.g. cheque-number chip, channel chip, reference chip) — a composable presentation layer rather than a single parsed string.

> Phase / mode reminder: this document is **audit & design only**. It defines *what* a future release should build and the safety contract it must honor. No code, backend, Prisma, API, or test changes are implied by this document itself.

---

## 1. Current implementation summary

Transaction description rendering today is handled by one function shipped in v2:

- **`describeTransaction(t)`** in `frontend/src/pages/BankAccountExplorer.tsx` → returns `{ primary, secondary? }`. Ordered, first-match-wins, pure display: (1) `Cheque Paid … Cheque Number: N` → number on line 1, ALL-CAPS name on line 2; (2) `Inward Clearing Cheque NNNN` + `Presented in XXX`; (3) `Bank Charges / Fees` → specific fee; (4) mixed Latin/Arabic split; (5) generic ` - | , ` split; (6) `reference` as last-resort; else single line. Fallback to the type badge label when empty.
- Consumed in the **table** description cell and the **drawer Basic tab** (parsed lines + collapsible raw "النص الأصلي").
- Tested by `frontend/src/__tests__/bankTxDescription.test.ts` — 9 cases.

**Separately, the backend already does classification** that the frontend parser currently ignores:
- `backend/src/modules/bankStatementImport/bankFeeDetector.ts` — a mature Arabic+English pattern set that yields `bankFeeType` ∈ {TRANSFER_FEE, MONTHLY_FEE, INTEREST, ATM_FEE, CHEQUEBOOK_FEE, CHARGE, CASH_WITHDRAWAL, CHEQUE_PAYMENT, BANK_TRANSFER} + `isBankFee`.
- `backend/src/modules/bankStatementImport/normalizer.ts` — Arabic normalization + whitespace/length caps (description ≤ 500 chars).

**Key architectural gap:** the frontend re-parses raw text to guess a category, while the backend has *already* categorized it into `bankFeeType` (available on the timeline row). The Smart Engine should consume that structured signal rather than re-deriving it from text.

## 2. Available fields & limitations

`TimelineTransaction` fields relevant to presentation: `description`, `reference`, `chequeNumber`, `bankFeeType`, `isBankFee`, `debit`, `credit`, `balance`, `currency`, `reconcileStatus`, `matchedType`, `matchedRef`, `isDuplicate`, `transactionFingerprint`, dates, `importBatchLabel`/`fileName`.

**Decisive limitation — Gulf Bank has no structured detail columns.** From `backend/src/modules/bankStatementImport/parser.ts`, the `GULF_BANK` column map is only `Date · Description · Debit · Credit · Balance · Currency`. It has **no** `reference`, `transactionId`, `chequeNumber`, `accountNumber`, or `iban` columns.

| Field | NBK / KFH / BOUBYAN | **GULF_BANK** |
|---|---|---|
| `reference` | present (column) | **always `null`** |
| `chequeNumber` | present (column) | **always `null`** — number lives *inside* Description |
| `transactionId` | present (NBK/BOUBYAN) | **always `null`** |
| Detail source | structured columns | **Description free-text only** |

Implications: (a) for Gulf Bank, the Description string is the *sole* carrier of cheque number, channel, counterparty, and reference → text extraction is unavoidable and must be conservative; (b) `bankFeeType`/`isBankFee`/credit-debit sign are reliable *across all banks* and are the safe basis for the category line; (c) `matchedType`/`matchedRef` are reconciliation outputs — out of scope by rule.

## 3. Detected transaction description patterns (from tests/fixtures + backend detectors)

Real strings observed in the codebase (tests, fixtures, sample data):

| Pattern (line-1 category) | Example raw text | Signal |
|---|---|---|
| Cheque Paid | `Cheque Paid - Cheque Number: 1, 03926182031583961 AHMAD FALAH NAIF HAJI, CIVIL ID, 293091900822, دفعة شيك` | literal + `CHEQUE_PAYMENT` |
| Inward Clearing Cheque | `Inward Clearing Cheque 000096 Presented in 025` | literal + `CHEQUE_PAYMENT`/`presented in` |
| Cash Withdrawal | `Cash Withdrawal`, `Cash Withdrawal ATM` | `CASH_WITHDRAWAL` |
| Outgoing RTGS / Transfer | `Outgoing RTGS`, `تحويل من مشروع 101` | `BANK_TRANSFER` |
| Bank Charges / Fees | `Bank Charges - Monthly Fee` | `MONTHLY_FEE`/`CHARGE` |
| Transfer w/ project hint | `Transfer from Project 101 تحويل من مشروع 101` | bilingual |
| Salary / راتب | `Salary payment`, `راتب يونيو` | credit sign; text |
| Arabic fees | `رسوم تحويل`, `دفعة شيك` | `TRANSFER_FEE`/`CHEQUE_PAYMENT` |
| Mixed AR/EN | `… تحويل من مشروع 101` | script split |

Embedded **detail** tokens seen: cheque number (`Cheque Number: N`), channel (`Presented in 025`), **CIVIL ID (`293091900822`)**, long transaction/instrument numbers, ALL-CAPS names (`AHMAD FALAH NAIF HAJI`), project hints (`Project 101`), invoice refs (`INV-2026-001`), voucher refs (`PV-000005`).

## 4. Proposed Smart Presentation model

A two-source model that separates the **reliable category** from the **best-effort detail**:

```
SmartDescription {
  category:     { label, source: 'bankFeeType'|'direction'|'text'|'fallback', confidence },
  detail?:      { text, kind: 'cheque'|'channel'|'name'|'reference'|'project'|'arabic'|'generic', confidence },
  raw:          string,           // always retained verbatim
  provenance:   { rule, matchedOn }   // for the Audit tab only
}
```

- **Line 1 (category)** — derived primarily from the **structured `bankFeeType` + `isBankFee` + credit/debit sign**, mapped to a bilingual label. Text patterns only fill gaps where `bankFeeType` is null. This is the biggest reliability upgrade over today's text-first approach.
- **Line 2 (detail)** — a single, highest-confidence extracted token from an **ordered, allow-listed** extractor set, each carrying an explicit confidence and never emitted below threshold.
- **`raw` + `provenance`** — kept for the Audit tab and tooltip so nothing is hidden or lost.

> Later evolution (ChatGPT recommendation): promote `SmartDescription` into a **Transaction Presentation Model** — per-type presentation templates + smart chips — so each transaction kind renders through its own composable template instead of a single flattened string.

## 5. Safe extraction rules

1. **Category from structure, not prose.** Map `bankFeeType` → label; if null, use `credit>0 ? deposit : withdrawal`; text patterns are a last resort. (Removes fragile re-parsing.)
2. **Anchored literals only** for detail — match on explicit labels (`Cheque Number:`, `Presented in`, `Ref:`) rather than positional guessing.
3. **Whitelist, don't blacklist.** Emit a detail only when it matches a known high-confidence extractor; otherwise emit nothing.
4. **Verbatim substrings.** `detail.text` must be a literal slice of the source — never translated, reformatted, or synthesized.
5. **One detail line.** Pick the single highest-confidence token; do not concatenate weak signals.
6. **No cross-field inference.** Do not join amount+name to assert a counterparty; do not infer an invoice from an amount match (that is reconciliation).
7. **Dedup guard.** Never repeat line-1 content on line 2 (current `!primary.includes(secondary)` guard retained and extended).
8. **Bounded regex.** Linear, anchored patterns; hard length caps; no catastrophic backtracking (input already ≤ 500 chars from normalizer).

## 6. Confidence levels

**HIGH (safe to ship / auto-display):**
- Direction (deposit/withdrawal) from `credit`/`debit` sign.
- Category from backend `bankFeeType` / `isBankFee`.
- `Cheque Paid — Cheque Number: N` (anchored literal) → cheque number.
- `Inward Clearing Cheque NNNN` and `Presented in XXX` (anchored) → number/channel.
- `chequeNumber`/`reference` field values when the bank provides the column (NBK/KFH/BOUBYAN).

**MEDIUM (ship behind tests, review copy):**
- Bank Charges → specific fee phrase (`Monthly Fee`, `رسوم تحويل`).
- Bilingual Latin↔Arabic split (Latin primary / Arabic secondary).
- Explicitly-labeled reference/voucher tokens (`INV-…`, `PV-…`, `Ref: …`).

**LOW (defer / gate / do not auto-surface):**
- ALL-CAPS person/company name extraction (misfire risk; the current v2 heuristic sits here).
- **CIVIL ID and Mobile Number extraction (privacy-sensitive — see §8/§11).**
- Project/customer hints from free prose.
- Invoice inference by amount (overlaps reconciliation → excluded by rule).

## 7. Fallback behavior

- No confident category → direction label (deposit/withdrawal) from sign; if amount ambiguous → the bank's own leading phrase, clamped.
- No confident detail → **single line only** (no line 2).
- Empty/whitespace description → transaction-type badge label.
- **Never** render `—`, a placeholder, or a guessed value. Raw text always remains reachable (tooltip + Audit tab).

## 8. How to avoid fabricated values

- Emit only **literal substrings** of `description`/`reference`/`chequeNumber`; no translation, normalization-for-display, or synthesis.
- Category labels are a **fixed bilingual lookup** keyed on the backend enum — not generated prose.
- **Confidence gate:** below threshold → omit, never approximate.
- **No inference chains** (amount→invoice, name+amount→payee).
- **Privacy stance:** treat CIVIL ID / Mobile / full account numbers as *sensitive*; even though present in raw text, do **not** promote them to a prominent line by default — mask or keep them in raw/Audit only, consistent with the app's existing `PrivateAmount`/last-4 masking conventions.
- Every displayed token is traceable via `provenance.matchedOn` (Audit tab), so any value on screen can be shown to originate from the bank's own text.

## 9. UI placement

- **Transaction table:** line 1 = category (structured), line 2 = single highest-confidence detail; full raw in `title` tooltip. (Matches current layout; upgrade the *source* of line 1.)
- **Drawer — Basic tab:** parsed `category` + `detail`, then the collapsible raw "النص الأصلي" (retain). Add a small confidence affordance only if it aids the user (optional).
- **Drawer — Financial tab:** **numbers only** — do not parse prose here. At most a single high-confidence **cheque number** chip (financially relevant, unambiguous). No names/refs.
- **Drawer — Audit tab:** the transparency home — show **raw verbatim description**, the matched **rule name**, **confidence**, and **matched substring** (provenance). Sensitive tokens (CIVIL ID/mobile) live here (masked if policy requires), never on the table row.

## 10. Required tests for future implementation

- **Category mapping:** every `bankFeeType` value → expected label; null → direction from sign.
- **Anchored extractors:** cheque-paid number, inward-clearing number, `Presented in`, labeled reference — positive + near-miss negatives.
- **Bilingual split:** Latin/Arabic, Arabic-only, Latin-only, Arabic-leading.
- **Confidence gating:** low-confidence input → no line 2 (asserted).
- **No-fabrication invariants:** `detail.text` is always a substring of source; category label ∈ fixed lookup.
- **Dedup:** line 1 never repeated on line 2; reference already in text not re-shown.
- **Privacy:** CIVIL ID / mobile never appear on the table row / Basic line by default.
- **Robustness:** empty/whitespace/very-long/emoji/RTL-control-char input never throws; regex timing bounded.
- **Per-bank fixtures:** Gulf Bank (description-only) vs NBK/KFH (columned) produce sensible output from the same engine.
- **Snapshot** of the 5 canonical master rows (cheque/inward/charges/transfer/salary).

## 11. Risks

1. **Privacy exposure** — CIVIL ID / mobile / account numbers sit in Gulf Bank Description; promoting them to a visible line is a data-exposure regression. *Highest risk.*
2. **Name misextraction** — ALL-CAPS heuristic can grab non-names; only a secondary line, but visible.
3. **Over-matching / false confidence** — a wrong category reads as authoritative. Mitigate by preferring structured `bankFeeType`.
4. **Coupling to the `bankFeeType` enum** — frontend label map must track backend enum changes (add a fixture guard).
5. **Regex safety/perf** — many rows; keep patterns linear/anchored (input already length-capped).
6. **i18n/RTL** — bidi mixing and Arabic normalization edge cases in display.
7. **Reconciliation bleed** — using `matchedType`/`matchedRef` or amount-inference would cross the "no reconciliation" line. Keep excluded.
8. **Scope creep** — an "engine" invites ever-more patterns; without a confidence contract it degrades.

## 12. Recommended implementation phases

- **Phase 1 — Audit & design (this document).** Complete.
- **Phase 2 — Structured category refactor (HIGH only).** Introduce the `SmartDescription` model; source line 1 from `bankFeeType`/`isBankFee`/sign with a bilingual label map; keep the already-shipped anchored detail extractors (cheque/inward/channel/bilingual). Net reliability up, no new risk. Full test suite.
- **Phase 3 — Audit-tab provenance + privacy handling.** Raw + rule + confidence + matched substring in the Audit tab; formal masking policy for CIVIL ID/mobile.
- **Phase 4 — MEDIUM patterns behind tests.** Labeled references (INV-/PV-), project hints, fee-detail copy — gated by confidence, opt-in.
- **Phase 5 (optional, revisit) — LOW patterns / Presentation Model evolution.** Name/mobile/civil surfacing only if a product+privacy decision approves, and only in Audit/masked contexts. Evolve `SmartDescription` → **Transaction Presentation Model** with type-specific templates + smart chips (ChatGPT direction).

## 13. Recommendation

**Implement only the high-confidence subset now; defer the rest.**

Concretely: **proceed** to Phase 2 — re-base the category line on the backend's existing `bankFeeType` classification (a real correctness/reliability win over today's text-first guess) and retain the already-shipped anchored detail extractors (cheque number, inward-clearing number, `Presented in`, bilingual split). **Defer** all LOW-confidence semantic extraction — **name, CIVIL ID, mobile number, invoice/project inference** — primarily on **privacy** grounds (CIVIL ID/mobile are the sharpest risk) and secondarily on accuracy. The current v2 parser is a sound baseline; the Smart Transaction Presentation Engine v1 upgrade is worthwhile but should be a *confidence-gated, structured-signal* evolution, not a broader free-text mining effort — with the longer-term path toward a type-templated Transaction Presentation Model.

---

## Change-safety note

This is a roadmap/design document only. It authorizes no code, and by itself changes no frontend, backend, Prisma, API, import, accounting, reconciliation, saved-data, or test behavior. Implementation is a separate, future **Smart Transaction Presentation Engine v1** release to be planned and reviewed on its own.
