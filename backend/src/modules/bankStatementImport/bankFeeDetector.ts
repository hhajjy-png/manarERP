import type { BankFeeDetection, BankFeeType } from './types.js';

interface FeePattern {
  type:      BankFeeType;
  isBankFee: boolean;  // false for cash/cheque/transfer — classified but not "fees"
  patterns:  RegExp[];
}

// ── Fee detection patterns (Arabic + English + Gulf Bank specific) ──────────────

const FEE_PATTERNS: FeePattern[] = [
  // ── True bank fees ──────────────────────────────────────────────────────────
  {
    type: 'TRANSFER_FEE', isBankFee: true,
    patterns: [
      /رسوم\s*(تحويل|تحويله)/i,
      /transfer\s*fee/i,
      /wire\s*fee/i,
      /commission\s*(on\s*transfer)?/i,
      /رسم\s*تحويل/i,
    ],
  },
  {
    type: 'MONTHLY_FEE', isBankFee: true,
    patterns: [
      /رسوم\s*(شهرية|خدمة|الخدمة)/i,
      /monthly\s*(fee|charge|service)/i,
      /service\s*(charge|fee)/i,
      /رسم\s*شهري/i,
      /اشتراك\s*شهري/i,
    ],
  },
  {
    type: 'INTEREST', isBankFee: true,
    patterns: [
      /فائدة/i,
      /interest/i,
      /profit\s*(rate|payment)/i,
      /عائد\s*(استثماري|بنكي)/i,
    ],
  },
  {
    type: 'ATM_FEE', isBankFee: true,
    patterns: [
      /atm\s*(fee|charge|commission)/i,
      /رسوم\s*(صراف|أجهزة)/i,
      /cash\s*advance\s*fee/i,
    ],
  },
  {
    type: 'CHEQUEBOOK_FEE', isBankFee: true,
    patterns: [
      /chequebook\s*(fee|charge|issuance)/i,
      /cheque\s*book\s*(charges?|fee)/i,
      /دفتر\s*(شيكات|الشيكات)/i,
      /رسوم\s*دفتر/i,
    ],
  },
  {
    type: 'CHARGE', isBankFee: true,
    patterns: [
      /رسوم\s*(إدارية|بنكية|معالجة|معاملة)/i,
      /bank\s*(charge|fee)/i,
      /local\s*bank\s*charge/i,
      /processing\s*fee/i,
      /transaction\s*(fee|charge|charges)/i,
      /رسم\s*(بنكي|إداري)/i,
    ],
  },
  // ── Gulf Bank transaction categories (not fees, but classified for display) ──
  {
    // Cash withdrawals — ATM or branch
    type: 'CASH_WITHDRAWAL', isBankFee: false,
    patterns: [
      /cash\s*with(d|dr)a?wal/i,
      /atm\s*with(d|dr)a?wal/i,
      /سحب\s*(نقدي|نقد)/i,
    ],
  },
  {
    // Cheque payments / clearing
    type: 'CHEQUE_PAYMENT', isBankFee: false,
    patterns: [
      /cheque\s*payment/i,
      /outgoing\s*clearing\s*cheque/i,
      /presented\s*in/i,
      /دفع\s*شيك/i,
    ],
  },
  {
    // Outgoing RTGS / clearing / wire transfers (not fee — amount is the transfer itself)
    type: 'BANK_TRANSFER', isBankFee: false,
    patterns: [
      /outgoing\s*rtgs/i,
      /outgoing\s*cl(g|g\.?)\s*transfer/i,
      /outgoing\s*clearing(?!\s*cheque)/i,
      /wire\s*transfer\s*out/i,
      /تحويل\s*صادر/i,
      /تحويل\s*خارجي/i,
    ],
  },
];

// ── Detection function ─────────────────────────────────────────────────────────

export function detectBankFee(description: string, reference?: string | null): BankFeeDetection {
  const text = `${description} ${reference ?? ''}`;

  for (const { type, isBankFee, patterns } of FEE_PATTERNS) {
    if (patterns.some((re) => re.test(text))) {
      return { isBankFee, bankFeeType: type };
    }
  }

  return { isBankFee: false, bankFeeType: null };
}
