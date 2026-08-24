/**
 * Build a Runtime Data object from a real Official Cheque record
 * (Cheque Template Printing v1).
 *
 * This replaces the mock runtime data for the print pipeline: it maps a real
 * cheque record onto the stable SemanticKey ids the Runtime Engine consumes.
 * It REUSES existing business logic — `amountToWordsKWD` (tafqeet) and
 * `fmtChequeAmount` (the cheque amount format) — so no calculation is
 * duplicated. Fields the cheque system does not carry (branch name) are left
 * empty, so a bound field falls back to its template's static text.
 */
import { amountToWordsKWD } from '../../lib/tafqeet';
import { fmtChequeAmount } from '../../utils/chequeTemplate';
import type { RuntimeData } from '../../modules/chequeTemplateRuntime';

/** Minimal shape needed from the official Cheque record (structurally compatible with `Cheque`). */
export interface ChequeRecordInput {
  chequeNumber: string;
  chequeDate: string;
  beneficiaryName: string;
  amount: number;
  currency: string;
  bankName: string;
}

/** Official company name (constant — the issuing company). */
const COMPANY_NAME_AR = 'شركة المنار الدولية لإنشاء وصيانة الشوارع والأرصفة ومستلزمات الطرق ذ.م.م';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** DD / MM / YYYY in Western digits — matches the classic cheque print output format. */
function formatChequeDate(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad2(d.getDate())} / ${pad2(d.getMonth() + 1)} / ${d.getFullYear()}`;
}

/**
 * The SAME cheque date, split into its three digit groups.
 *
 * Some cheque stock (Gulf Bank) already carries printed `/` separators in the
 * date box, so the profile places day, month and year as three separate digit
 * groups instead of one string. This is a second PRESENTATION of one date, not a
 * second date: both come from `cheque.chequeDate` and are parsed identically, so
 * they can never disagree. An unparseable date yields empty parts, exactly as
 * `formatChequeDate` yields an empty string — and the print-mode guard then
 * blocks the print rather than printing a blank date.
 */
function chequeDateParts(value: string): { day: string; month: string; year: string } {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: '', month: '', year: '' };
  return { day: pad2(d.getDate()), month: pad2(d.getMonth() + 1), year: String(d.getFullYear()) };
}

export function buildChequeRuntimeData(cheque: ChequeRecordInput): RuntimeData {
  const amount = Number(cheque.amount) || 0;
  const date = formatChequeDate(cheque.chequeDate);
  const parts = chequeDateParts(cheque.chequeDate);
  return {
    beneficiary: cheque.beneficiaryName ?? '',
    chequeDate: date,
    chequeDay: parts.day,
    chequeMonth: parts.month,
    chequeYear: parts.year,
    amount: amount > 0 ? fmtChequeAmount(amount) : '',
    amountInWords: amount > 0 ? amountToWordsKWD(amount, 'ar') : '',
    chequeNumber: cheque.chequeNumber ?? '',
    bankName: cheque.bankName ?? '',
    branchName: '', // not carried by the cheque record — bound fields fall back to static text
    companyName: COMPANY_NAME_AR,
    issueDate: date,
  };
}
