import type { BankFeeDetection, BankFeeType } from './types.js';

interface FeePattern {
  type: BankFeeType;
  patterns: RegExp[];
}

// ── Fee detection patterns (Arabic + English) ──────────────────────────────────

const FEE_PATTERNS: FeePattern[] = [
  {
    type: 'TRANSFER_FEE',
    patterns: [
      /رسوم\s*(تحويل|تحويله)/i,
      /transfer\s*fee/i,
      /wire\s*fee/i,
      /commission\s*(on\s*transfer)?/i,
      /رسم\s*تحويل/i,
    ],
  },
  {
    type: 'MONTHLY_FEE',
    patterns: [
      /رسوم\s*(شهرية|خدمة|الخدمة)/i,
      /monthly\s*(fee|charge|service)/i,
      /service\s*(charge|fee)/i,
      /رسم\s*شهري/i,
      /اشتراك\s*شهري/i,
    ],
  },
  {
    type: 'INTEREST',
    patterns: [
      /فائدة/i,
      /interest/i,
      /profit\s*(rate|payment)/i,
      /عائد\s*(استثماري|بنكي)/i,
    ],
  },
  {
    type: 'ATM_FEE',
    patterns: [
      /atm\s*(fee|charge|commission)/i,
      /رسوم\s*(صراف|أجهزة)/i,
      /cash\s*advance\s*fee/i,
    ],
  },
  {
    type: 'CHEQUEBOOK_FEE',
    patterns: [
      /chequebook\s*(fee|charge|issuance)/i,
      /دفتر\s*(شيكات|الشيكات)/i,
      /رسوم\s*دفتر/i,
    ],
  },
  {
    type: 'CHARGE',
    patterns: [
      /رسوم\s*(إدارية|بنكية|معالجة|معاملة)/i,
      /bank\s*(charge|fee)/i,
      /processing\s*fee/i,
      /transaction\s*(fee|charge)/i,
      /رسم\s*(بنكي|إداري)/i,
    ],
  },
];

// ── Detection function ─────────────────────────────────────────────────────────

export function detectBankFee(description: string, reference?: string | null): BankFeeDetection {
  const text = `${description} ${reference ?? ''}`;

  for (const { type, patterns } of FEE_PATTERNS) {
    if (patterns.some((re) => re.test(text))) {
      return { isBankFee: true, bankFeeType: type };
    }
  }

  return { isBankFee: false, bankFeeType: null };
}
