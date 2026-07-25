/**
 * Shared cheque print-tracking calls (Cheque Multi-Selection & Batch Printing Pack v1 —
 * Provider Parity & Print Result Correctness).
 *
 * Single source for the two authoritative tracking endpoints so Classic printing
 * (Cheques.tsx) and Template printing (ChequeTemplatePrintPage.tsx) — single-item
 * AND batch — call the exact same logic instead of duplicating it.
 */
import { api } from '../api/client';
import type { PrintResult } from './print';

export interface TrackedCheque {
  id: number;
  status: string;
  printedAt: string | null;
  paymentVoucherNumber: string | null;
  [key: string]: unknown;
}

/** Minimal cheque identity a print surface needs to reuse the authoritative
 *  mark-printed/reprint tracking. Present only when printing a real saved
 *  cheque — absent (e.g. an unsaved form draft) means no tracking is attempted,
 *  exactly like today. */
export interface ChequeTrackingInfo {
  id: number;
  status: string;
  chequeNumber: string;
  beneficiaryName: string;
}

/** Marks a DRAFT cheque as printed and returns the refreshed record. */
export async function markChequePrinted(chequeId: number): Promise<TrackedCheque> {
  await api.post(`/cheques/${chequeId}/mark-printed`);
  const res = await api.get(`/cheques/${chequeId}`);
  return res.data.data as TrackedCheque;
}

/** Logs a reprint (reason + optional note) for an already-PRINTED cheque and
 *  returns the refreshed record. Does not change `status` — it is already PRINTED. */
export async function reprintCheque(chequeId: number, reason: string, note: string | null): Promise<TrackedCheque> {
  await api.post(`/cheques/${chequeId}/reprint`, { reason, note });
  const res = await api.get(`/cheques/${chequeId}`);
  return res.data.data as TrackedCheque;
}

/** Localized, honest message for a print attempt that did NOT reach 'success' —
 *  never phrased as if printing happened. */
export function printOutcomeMessage(result: PrintResult, t: (key: string, vars?: Record<string, string | number>) => string): string {
  if (result.outcome === 'cancelled') return t('msg.cheque.print_cancelled');
  if (result.outcome === 'unknown') return t('msg.cheque.print_unknown');
  return t('msg.cheque.print_failed', { reason: result.failureReason || '—' });
}
