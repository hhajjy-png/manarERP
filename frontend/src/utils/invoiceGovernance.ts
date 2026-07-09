// ─────────────────────────────────────────────────────────────────────────
//  Invoice edit governance — presentation-only eligibility for the NORMAL
//  invoice edit path. Single source shared by the Invoices drawer/actions and
//  the Invoice preview so both gate identically.
//
//  A fully-paid (PAID) or cancelled invoice is read-only from the normal edit
//  path — this mirrors the server guard in invoices.service.update() (which
//  rejects PAID/CANCELLED), so the UI never offers an edit that the backend
//  would reject. This is UI convenience only; the backend is the real boundary.
//
//  Safe workflows remain available elsewhere and are NOT gated here:
//  collection-date correction (its own SYSTEM_ADMIN-only endpoint), view,
//  print, payment history, and collection/receipt actions where allowed.
// ─────────────────────────────────────────────────────────────────────────

/**
 * Whether an invoice may be opened in the normal edit form.
 * Editable only while UNPAID, or OVERDUE with nothing collected yet. Any
 * settled amount (PARTIAL/PAID), a fully-paid invoice, or a cancelled invoice
 * is not editable via this path.
 */
export function canEditInvoice(
  status: string | null | undefined,
  paidAmount: number | null | undefined,
): boolean {
  return status === 'UNPAID' || (status === 'OVERDUE' && Number(paidAmount ?? 0) === 0);
}

/** Eligibility for the dedicated "تعديل تاريخ التحصيل" (collection-date correction) action. */
export interface CollectionDateAction {
  /** Show the action at all: SYSTEM_ADMIN and ≥1 payment carrying a valid id. */
  enabled: boolean;
  /** The single correctable payment id when exactly one exists → direct action. */
  singlePaymentId: number | null;
  /** More than one correctable payment → the user must pick which one (no guessing). */
  multiple: boolean;
}

/**
 * Governs the paid-invoice collection-date correction action. The correction endpoint is
 * SYSTEM_ADMIN-only and operates per payment, so a payment id must be resolvable. With one
 * payment we can act directly; with several we never guess — the caller lists them for the
 * user to choose. This is a safe workflow separate from invoice editing (which stays blocked
 * for paid invoices).
 */
export function collectionDateAction(
  isSystemAdmin: boolean,
  payments: ReadonlyArray<{ id?: number | null }> | null | undefined,
): CollectionDateAction {
  const correctable = (payments ?? []).filter((p) => p != null && p.id != null);
  if (!isSystemAdmin || correctable.length === 0) {
    return { enabled: false, singlePaymentId: null, multiple: false };
  }
  return {
    enabled: true,
    singlePaymentId: correctable.length === 1 ? Number(correctable[0].id) : null,
    multiple: correctable.length > 1,
  };
}
