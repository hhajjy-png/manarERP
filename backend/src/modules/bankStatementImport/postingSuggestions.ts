import type {
  ReconciliationTransaction,
  PostingSuggestion,
  PostingSuggestionType,
  MatchedType,
  MatchConfidence,
} from './types.js';

function suggestion(
  type: PostingSuggestionType,
  label: string,
  description: string,
  confidence: MatchConfidence,
  linked?: { linkedType: MatchedType; linkedId: number; linkedRef: string },
): PostingSuggestion {
  return { type, label, description, confidence, ...linked };
}

const FEE_TYPE_AR: Record<string, string> = {
  TRANSFER_FEE:   'رسوم تحويل',
  MONTHLY_FEE:    'رسوم شهرية',
  INTEREST:       'فائدة / عائد',
  ATM_FEE:        'رسوم صراف آلي',
  CHEQUEBOOK_FEE: 'رسوم دفتر شيكات',
  CHARGE:         'رسوم بنكية',
  OTHER_FEE:      'رسوم أخرى',
};

export function generatePostingSuggestions(
  tx: ReconciliationTransaction,
): PostingSuggestion[] {
  const suggestions: PostingSuggestion[] = [];

  // 1. If already matched with high confidence → suggest confirming the link
  if (tx.matchedType && tx.matchedId && tx.matchedRef && tx.matchConfidence != null) {
    const linkedType = tx.matchedType;
    const linkedId   = tx.matchedId;
    const linkedRef  = tx.matchedRef;
    const conf       = tx.matchConfidence;

    if (linkedType === 'invoice') {
      suggestions.push(suggestion(
        'INVOICE_PAYMENT',
        'تسجيل دفعة على فاتورة',
        `ربط المعاملة بالفاتورة ${linkedRef} وتحديث حالة الدفع`,
        conf,
        { linkedType, linkedId, linkedRef },
      ));
    } else if (linkedType === 'expense') {
      suggestions.push(suggestion(
        'EXPENSE_LINK',
        'ربط بمصروف قائم',
        `ربط المعاملة بسند الصرف ${linkedRef}`,
        conf,
        { linkedType, linkedId, linkedRef },
      ));
    } else if (linkedType === 'cheque') {
      suggestions.push(suggestion(
        'JOURNAL_ENTRY',
        'تسجيل صرف شيك',
        `تسجيل صرف الشيك رقم ${linkedRef} في دفتر اليومية`,
        conf,
        { linkedType, linkedId, linkedRef },
      ));
    } else if (linkedType === 'payroll') {
      suggestions.push(suggestion(
        'JOURNAL_ENTRY',
        'تسجيل صرف رواتب',
        `ربط المعاملة بكشف الرواتب ${linkedRef}`,
        conf,
        { linkedType, linkedId, linkedRef },
      ));
    }
  }

  // 2. Bank fee → expense journal entry
  if (tx.isBankFee) {
    const feeLabel = tx.bankFeeType ? (FEE_TYPE_AR[tx.bankFeeType] ?? 'رسوم بنكية') : 'رسوم بنكية';
    suggestions.push(suggestion(
      'JOURNAL_ENTRY',
      `تسجيل ${feeLabel}`,
      `إنشاء قيد يومية لتسجيل ${feeLabel} (${tx.debit > 0 ? tx.debit : tx.credit} د.ك)`,
      0,
    ));
  }

  // 3. Unmatched credit → journal entry for revenue / incoming payment
  if (!tx.matchedType && tx.credit > 0) {
    suggestions.push(suggestion(
      'JOURNAL_ENTRY',
      'قيد يومية — دخل وارد',
      `إنشاء قيد يومية لتسجيل مبلغ وارد (${tx.credit} د.ك) من ${tx.description.substring(0, 40)}`,
      0,
    ));
  }

  // 4. Unmatched debit → expense journal entry
  if (!tx.matchedType && tx.debit > 0 && !tx.isBankFee) {
    suggestions.push(suggestion(
      'EXPENSE_LINK',
      'إنشاء سند صرف جديد',
      `إنشاء مصروف جديد لمبلغ (${tx.debit} د.ك) — ${tx.description.substring(0, 40)}`,
      0,
    ));
  }

  // 5. Always offer ignore
  suggestions.push(suggestion(
    'IGNORE',
    'تجاهل المعاملة',
    'تعليم المعاملة كمتجاهلة وعدم ربطها بأي سجل',
    0,
  ));

  return suggestions;
}
