// ── Bank Account Summary (landing page cards) ──────────────────────────────────

export interface BankAccountSummary {
  accountKey:           string;
  bankName:             string;
  accountNumber:        string | null;
  iban:                 string | null;
  currentBalance:       number | null;
  firstTransactionDate: string | null;
  lastTransactionDate:  string | null;
  transactionCount:     number;
  importCount:          number;
  lastImportDate:       string | null;
  totalDebits:          number;
  totalCredits:         number;
}

// ── Monthly summary entry ──────────────────────────────────────────────────────

export interface MonthlyEntry {
  month:             string;   // 'YYYY-MM'
  totalDeposits:     number;
  totalWithdrawals:  number;
  netFlow:           number;
  txCount:           number;
  largestDeposit:    number;
  largestWithdrawal: number;
}

// ── Top transaction ────────────────────────────────────────────────────────────

export interface TopTransaction {
  id:            number;
  statementDate: string | null;
  description:   string;
  reference:     string | null;
  amount:        number;
  balance:       number | null;
  importId:      number;
  bankName:      string;
}

// ── Bank Account Dashboard (full aggregates for one accountKey) ────────────────

export interface BankAccountDashboard {
  accountKey:       string;
  bankName:         string;
  currentBalance:   number | null;
  openingBalance:   number | null;
  closingBalance:   number | null;
  totalDeposits:    number;
  totalWithdrawals: number;
  netCashFlow:      number;
  largestDeposit:   number;
  largestWithdrawal: number;
  avgDeposit:       number;
  avgWithdrawal:    number;
  depositCount:     number;
  withdrawalCount:  number;
  transactionCount: number;
  importCount:      number;
  coverageStart:    string | null;
  coverageEnd:      string | null;
  monthly:          MonthlyEntry[];
  topDeposits:      TopTransaction[];
  topWithdrawals:   TopTransaction[];
}
