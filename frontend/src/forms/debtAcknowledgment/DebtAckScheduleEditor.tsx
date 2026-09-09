/**
 * محرّر جدول السداد داخل شاشة الإدخال.
 *
 * ═══ ما يُدخَل وما يُحسَب ═══
 * يُدخَل: تاريخ استحقاق القسط وقيمته. يُحسَب دائمًا: **الرصيد المتبقّي** — فهو مشتقّ
 * من أصل الدين وما سُدِّد قبله، ولا يُترك لإدخال يدوي يخالف حسابه. أي تعديل هنا يعيد
 * حساب أرصدة الجدول كله فورًا عبر `recalculateBalances`.
 *
 * ═══ لماذا التعديل اليدوي مسموح أصلًا ═══
 * التوليد التلقائي يغطّي الحالة الشائعة (أقساط متساوية شهرية)، لكن اتفاقًا حقيقيًا قد
 * يحمل قسطًا أوّل أكبر، أو تأجيل شهر، أو دفعة أخيرة مختلفة. منع التعديل كان سيدفع
 * المستخدم إلى الكتابة اليدوية على الورقة المطبوعة — وهو أسوأ من تعديل موثَّق داخل
 * النظام. وحين يخالف المجموعُ أصلَ الدين يظهر خللٌ صريح في قائمة التحقق، فلا يُطبع
 * جدول لا تجمعه أقساطه.
 *
 * كل ما هنا `.no-print` — لا يصل إلى الورق ولا إلى الـPDF ولا إلى المعاينة الدقيقة.
 */
import DateInput from '../../components/DateInput';
import { useT } from '../../lib/i18n';
import { formatNumber } from '../../lib/format/currency';
import { recalculateBalances, type InstallmentRow } from './debtAcknowledgmentSchedule';
import { ROWS_PER_ANNEX_PAGE } from './constants';

/**
 * ارتفاع الجدول قبل أن يصير قابلًا للتمرير — بعدد صفوف لا ببكسل.
 *
 * جدولٌ من ستّين قسطًا يدفع بقية النموذج (الشهود، التوقيعات، رقم الآيبان) خارج الشاشة
 * تمامًا. والقصّ عند عددٍ ثابت من الصفوف يجعل ما بعده غير قابل للتحرير — وهو ما نُهي
 * عنه صراحةً. فالحلّ: كل الصفوف موجودة وقابلة للتحرير، وما زاد عن صفحة ملحق كاملة
 * يُمرَّر داخل إطاره وترويستُه ثابتة فوقه.
 */
const VISIBLE_ROWS_BEFORE_SCROLL = ROWS_PER_ANNEX_PAGE;
/** ارتفاع الصفّ التقريبي بالبكسل — للحدّ الأقصى وحده، لا لتخطيط الصفّ. */
const ROW_HEIGHT_PX = 30;

export interface DebtAckScheduleEditorProps {
  rows: InstallmentRow[];
  debtAmount: number;
  /** هل الجدول الحالي نتيجة تعديل يدوي؟ يُعرض كشارة، ويحكم سؤال إعادة الحساب. */
  manual: boolean;
  onChange: (rows: InstallmentRow[]) => void;
  /** إعادة التوليد من أصل الدين والعدد وتاريخ أول قسط — تُلغي التعديل اليدوي. */
  onRegenerate: () => void;
}

export default function DebtAckScheduleEditor({
  rows,
  debtAmount,
  manual,
  onChange,
  onRegenerate,
}: DebtAckScheduleEditorProps) {
  const { t } = useT();

  const patchRow = (index: number, patch: Partial<InstallmentRow>) => {
    const next = rows.map((row, i) => (i === index ? { ...row, ...patch } : row));
    onChange(recalculateBalances(next, debtAmount));
  };

  if (rows.length === 0) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
        {t('page.debtAck.schedule_empty')}
      </p>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('page.debtAck.schedule_auto_note')}</span>
        {manual && (
          <>
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--primary)',
                border: '1px solid var(--border)',
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              {t('page.debtAck.schedule_manual_badge')}
            </span>
            <button
              type="button"
              className="btn secondary"
              style={{ fontSize: 11, padding: '2px 8px' }}
              onClick={onRegenerate}
            >
              {t('page.debtAck.schedule_regenerate')}
            </button>
          </>
        )}
      </div>

      {/* كل الأقساط قابلة للتحرير مهما بلغ عددها — لا أوّل اثني عشر منها. ما زاد عن
          صفحة ملحق كاملة يُمرَّر داخل إطاره وترويستُه ثابتة فوقه، فلا يُدفع بقيةُ
          النموذج خارج الشاشة ولا يُقصّ صفٌّ من التحرير. */}
      <div
        style={
          rows.length > VISIBLE_ROWS_BEFORE_SCROLL
            ? { maxHeight: (VISIBLE_ROWS_BEFORE_SCROLL + 1) * ROW_HEIGHT_PX, overflowY: 'auto' }
            : undefined
        }
      >
        <table className="xpl-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead style={{ position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1 }}>
            <tr>
              <th style={cellStyle}>{t('page.debtAck.schedule_col_no')}</th>
              <th style={cellStyle}>{t('page.debtAck.schedule_col_due_date')}</th>
              <th style={cellStyle}>{t('page.debtAck.schedule_col_amount')}</th>
              <th style={cellStyle}>{t('page.debtAck.schedule_col_balance')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.no}>
                <td style={{ ...cellStyle, textAlign: 'center', direction: 'ltr' }}>{row.no}</td>
                <td style={cellStyle}>
                  <DateInput
                    title={`${t('page.debtAck.schedule_col_due_date')} ${row.no}`}
                    value={row.dueDate}
                    onChange={(v) => patchRow(i, { dueDate: v })}
                  />
                </td>
                <td style={cellStyle}>
                  <input
                    type="number"
                    lang="en"
                    step="0.001"
                    min="0"
                    title={`${t('page.debtAck.schedule_col_amount')} ${row.no}`}
                    value={row.amount}
                    style={{ direction: 'ltr', textAlign: 'start', width: '100%' }}
                    onChange={(e) => patchRow(i, { amount: Number(e.target.value) })}
                  />
                </td>
                {/* الرصيد محسوب لا مُدخَل — يُعرض للقراءة فقط. */}
                <td style={{ ...cellStyle, direction: 'ltr', textAlign: 'start', fontWeight: 700 }}>
                  {formatNumber(row.remainingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellStyle = {
  border: '1px solid var(--border)',
  padding: '3px 6px',
  verticalAlign: 'middle',
} as const;
