/**
 * Cheque Template Runtime Engine — centralized mock runtime data.
 *
 * FOR THIS PACK ONLY. These placeholder values exist solely to exercise the
 * Runtime Engine and to show preview values in the designer while a field is
 * bound. The engine is NOT connected to any live cheque record, the cheque
 * module, or any backend. A future Data Binding pack will replace this with
 * real values resolved from a cheque.
 *
 * Keys are the stable SemanticKey ids — never display text.
 */
import type { RuntimeData } from './runtimeTypes';

export const MOCK_RUNTIME_DATA: RuntimeData = {
  beneficiary: 'شركة الخليج للمقاولات',
  chequeDate: '15/08/2026',
  // The same date, split for cheque stock with pre-printed `/` separators.
  chequeDay: '15',
  chequeMonth: '08',
  chequeYear: '2026',
  amount: '3500.000 KD',
  amountInWords: 'ثلاثة آلاف وخمسمائة دينار كويتي',
  chequeNumber: '000456',
  bankName: 'بنك الخليج',
  branchName: 'فرع السالمية',
  companyName: 'شركة المنار الدولية',
  issueDate: '15/08/2026',
};
