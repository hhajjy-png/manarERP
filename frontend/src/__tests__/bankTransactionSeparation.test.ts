/* Bank Account Explorer — فرض الفصل المعماري بين Direction و Category
   --------------------------------------------------------------------------
   هذا الاختبار يفحص نصّ الوحدتين مباشرةً (بعد تجريد التعليقات) ليجعل الفصل
   مفروضًا بالبناء لا بالاتفاق: أي استيراد متبادل، أو تسرّب حقل مبلغ إلى وحدة
   التصنيف، أو تسرّب إشارة مستند إلى وحدة الاتجاه — يُفشل الاختبار فورًا.

   يكمّله فحصان سلوكيان: تغيير المبالغ لا يحرّك التصنيف، وتغيير إشارات
   المستند لا يحرّك الاتجاه. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { txCategory, txCategorySource } from '../pages/bankTransactionCategory';
import { txDirection } from '../pages/bankTransactionDirection';
import type { TimelineTransaction } from '../api/bankStatementImport';

const PAGES = join(dirname(fileURLToPath(import.meta.url)), '..', 'pages');

/** يزيل التعليقات كي لا تُحسب الكلمات الواردة في الشرح كاستخدام فعلي. */
function sourceWithoutComments(file: string): string {
  return readFileSync(join(PAGES, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const directionSrc = sourceWithoutComments('bankTransactionDirection.ts');
const categorySrc  = sourceWithoutComments('bankTransactionCategory.ts');

describe('الفصل المعماري — لا استيراد متبادل', () => {
  it('وحدة التصنيف لا تستورد وحدة الاتجاه', () => {
    expect(categorySrc).not.toMatch(/from\s+['"]\.\/bankTransactionDirection['"]/);
  });

  it('وحدة الاتجاه لا تستورد وحدة التصنيف', () => {
    expect(directionSrc).not.toMatch(/from\s+['"]\.\/bankTransactionCategory['"]/);
  });
});

describe('الفصل المعماري — لا تسرّب مفاهيم', () => {
  it.each(['debit', 'credit', 'safeNum', 'txDirection', 'txSignedImpact'])(
    'وحدة التصنيف لا تستخدم «%s»',
    (token) => {
      expect(categorySrc).not.toMatch(new RegExp(`\\b${token}\\b`));
    },
  );

  it.each(['bankFeeType', 'chequeNumber', 'isBankFee', 'matchedType', 'description', 'txCategory'])(
    'وحدة الاتجاه لا تستخدم «%s»',
    (token) => {
      expect(directionSrc).not.toMatch(new RegExp(`\\b${token}\\b`));
    },
  );

  it('واجهة CategorySignals لا تُعلن أي حقل مبلغ', () => {
    const iface = categorySrc.match(/export interface CategorySignals \{[\s\S]*?\}/)?.[0] ?? '';
    expect(iface).not.toBe('');
    expect(iface).not.toMatch(/\b(debit|credit|amount|balance)\b/);
  });

  it('واجهة DirectionalMovement لا تُعلن أي إشارة مستند', () => {
    const iface = directionSrc.match(/export interface DirectionalMovement \{[\s\S]*?\}/)?.[0] ?? '';
    expect(iface).not.toBe('');
    expect(iface).not.toMatch(/\b(bankFeeType|chequeNumber|isBankFee|matchedType|description|reference)\b/);
  });
});

// ── فحص سلوكي مكمّل ──────────────────────────────────────────────────────────

function tx(over: Partial<TimelineTransaction> = {}): TimelineTransaction {
  return {
    id: 1, importId: 1, importBatchLabel: 'B1', fileName: 'f.xlsx', importedAt: '2026-01-01',
    bankName: 'NBK', accountKey: 'ACC', statementDate: '2026-01-01', postingDate: null,
    description: '', reference: null, debit: 0, credit: 0, balance: null, currency: 'KWD',
    chequeNumber: null, reconcileStatus: 'PENDING' as TimelineTransaction['reconcileStatus'],
    matchedType: null, matchedRef: null, isDuplicate: false, isBankFee: false,
    bankFeeType: null, transactionFingerprint: null,
    ...over,
  };
}

describe('الفصل السلوكي', () => {
  it('تغيير المبالغ لا يغيّر التصنيف ولا مصدره', () => {
    const base = { chequeNumber: '000006', description: 'Inward Clearing Cheque 000006' };
    const amounts: Array<Partial<TimelineTransaction>> = [
      { debit: 255 }, { credit: 255 }, { debit: 0, credit: 0 }, { credit: -255 },
    ];
    const categories = amounts.map((a) => txCategory(tx({ ...base, ...a })));
    const sources    = amounts.map((a) => txCategorySource(tx({ ...base, ...a })));
    expect(new Set(categories).size).toBe(1);
    expect(new Set(sources).size).toBe(1);
  });

  it('تغيير إشارات المستند لا يغيّر الاتجاه', () => {
    const docs: Array<Partial<TimelineTransaction>> = [
      { chequeNumber: '1' }, { bankFeeType: 'BANK_TRANSFER' }, { isBankFee: true },
      { matchedType: 'payroll' }, { description: 'Receipt Voucher 9' }, {},
    ];
    for (const d of docs) {
      expect(txDirection(tx({ ...d, debit: 100 }))).toBe('withdrawal');
      expect(txDirection(tx({ ...d, credit: 100 }))).toBe('deposit');
    }
  });
});
