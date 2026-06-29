import { api } from './client';

// ── Types (mirrors backend bankAccounts.types.ts) ──────────────────────────────

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

export interface MonthlyEntry {
  month:             string;
  totalDeposits:     number;
  totalWithdrawals:  number;
  netFlow:           number;
  txCount:           number;
  largestDeposit:    number;
  largestWithdrawal: number;
}

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

export interface BankAccountDashboard {
  accountKey:        string;
  bankName:          string;
  currentBalance:    number | null;
  openingBalance:    number | null;
  closingBalance:    number | null;
  totalDeposits:     number;
  totalWithdrawals:  number;
  netCashFlow:       number;
  largestDeposit:    number;
  largestWithdrawal: number;
  avgDeposit:        number;
  avgWithdrawal:     number;
  depositCount:      number;
  withdrawalCount:   number;
  transactionCount:  number;
  importCount:       number;
  coverageStart:     string | null;
  coverageEnd:       string | null;
  monthly:           MonthlyEntry[];
  topDeposits:       TopTransaction[];
  topWithdrawals:    TopTransaction[];
}

export interface BankAccountsListResult {
  accounts: BankAccountSummary[];
  total:    number;
}

// ── API functions ──────────────────────────────────────────────────────────────

export async function listBankAccounts(): Promise<BankAccountsListResult> {
  const res = await api.get<{ data: BankAccountsListResult }>('/bank-accounts');
  return res.data.data;
}

export async function getBankAccountDashboard(
  accountKey: string,
): Promise<BankAccountDashboard> {
  const res = await api.get<{ data: BankAccountDashboard }>(
    `/bank-accounts/${encodeURIComponent(accountKey)}/dashboard`,
  );
  return res.data.data;
}
