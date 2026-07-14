import { useNavigate } from 'react-router-dom';
import type { TrialBalanceAsOfRow, TrialBalancePeriodRow } from '../../types/financial.types';
import { BalanceDisplay } from './BalanceDisplay';
import { fcCurrency, accountTypeAr, fcMoneyHeader, fcMoneyCell } from './financialLabels';

type AnyRow = TrialBalanceAsOfRow | TrialBalancePeriodRow;

// الرمز انتقل إلى **عنوان العمود**، والخليّة رقم مجرّد.
// و**الصفر لم يعد فراغًا**: كان `n === 0` يُفرغ الخليّة، فيقرأها المحاسب «لا قيمة» بينما
// هي رصيد صفري حقيقي. الآن «0.000»، و«—» لغير المنطبق وحده.
function fmt(n: number | undefined) {
  return fcMoneyCell(n);
}

interface Props {
  rows:   AnyRow[];
  mode:   'as-of' | 'period';
  totals?: Partial<AnyRow>;
}

export function TrialBalanceTable({ rows, mode, totals }: Props) {
  const navigate = useNavigate();

  function handleAccountClick(accountId: number) {
    navigate(`/financial?tab=gl&subTab=statement&accountId=${accountId}`);
  }

  if (mode === 'as-of') {
    const asOfRows = rows as TrialBalanceAsOfRow[];
    const totalsAs  = totals as Partial<TrialBalanceAsOfRow> | undefined;
    return (
      <div className="table-responsive">
        <table className="financial-table trial-balance-table" dir="rtl">
          <thead>
            <tr>
              <th>الكود</th><th>اسم الحساب</th><th>النوع</th>
              <th className="num">{fcMoneyHeader('إجمالي مدين')}</th><th className="num">{fcMoneyHeader('إجمالي دائن')}</th>
              <th className="num">{fcMoneyHeader('الرصيد')}</th><th>طبيعة</th>
            </tr>
          </thead>
          <tbody>
            {asOfRows.map(row => (
              <tr key={row.id}>
                <td>{row.accountCode}</td>
                <td>
                  <button type="button" className="account-link" onClick={() => handleAccountClick(row.accountId)}>
                    {row.accountName}
                  </button>
                </td>
                <td>{accountTypeAr(row.accountType)}</td>
                <td className="num">{fmt(row.totalDebit)}</td>
                <td className="num">{fmt(row.totalCredit)}</td>
                <td className={`num ${(row.balance ?? 0) < 0 ? 'negative' : ''}`}>
                  {fmt(Math.abs(row.balance ?? 0))}
                </td>
                <td>{row.balanceType === 'DEBIT' ? 'مدين' : 'دائن'}</td>
              </tr>
            ))}
          </tbody>
          {totalsAs && (
            <tfoot>
              <tr className="totals-row">
                <td colSpan={3}>الإجمالي</td>
                <td className="num">{fmt(totalsAs.totalDebit)}</td>
                <td className="num">{fmt(totalsAs.totalCredit)}</td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  // Period mode
  const periodRows = rows as TrialBalancePeriodRow[];
  const totalsP    = totals as Partial<TrialBalancePeriodRow> | undefined;
  return (
    <div className="table-responsive">
      <table className="financial-table trial-balance-table" dir="rtl">
        <thead>
          <tr>
            <th>الكود</th><th>اسم الحساب</th>
            <th className="num">{fcMoneyHeader('رصيد الافتتاح')}</th>
            <th className="num">{fcMoneyHeader('مدين الفترة')}</th>
            <th className="num">{fcMoneyHeader('دائن الفترة')}</th>
            <th className="num">{fcMoneyHeader('رصيد الإقفال')}</th>
          </tr>
        </thead>
        <tbody>
          {periodRows.map(row => (
            <tr key={row.id}>
              <td>{row.accountCode}</td>
              <td>
                <button type="button" className="account-link" onClick={() => handleAccountClick(row.accountId)}>
                  {row.accountName}
                </button>
              </td>
              <td className="num"><BalanceDisplay value={row.openingBalance} /></td>
              <td className="num">{fmt(row.periodDebit)}</td>
              <td className="num">{fmt(row.periodCredit)}</td>
              <td className="num"><BalanceDisplay value={row.closingBalance} /></td>
            </tr>
          ))}
        </tbody>
        {totalsP && (
          <tfoot>
            <tr className="totals-row">
              <td colSpan={2}>الإجمالي</td>
              <td />
              <td className="num">{fmt(totalsP.periodDebit)}</td>
              <td className="num">{fmt(totalsP.periodCredit)}</td>
              <td />
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
