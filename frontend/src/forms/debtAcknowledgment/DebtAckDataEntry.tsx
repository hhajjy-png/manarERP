/**
 * شاشة الإدخال الوحيدة لإقرار دين موظف.
 *
 * تُدخَل البيانات **مرة واحدة** هنا، ثم يختار المستخدم القالب (العربية / English /
 * हिन्दी) فتُحقن القيم نفسها في القالب المختار — بلا إعادة إدخال، وبلا ترجمة وقت
 * التشغيل.
 *
 * الاستثناء الوحيد هو «المبلغ بالحروف»: عبارة قانونية مشتقّة من لغة النص نفسها،
 * فلها خانة لكل قالب. للعربية والإنجليزية يُعرض اقتراح مبنيّ على محرّك التفقيط
 * القائم في المشروع (`lib/tafqeet.ts`) ولا يُكتب إلا بنقرة صريحة من المستخدم؛ ولا
 * يُعرض اقتراح للهندية لعدم وجود محوّل موثوق — فتبقى إدخالًا يدويًا، كما تبقى
 * الخانتان الأخريان قابلتين للتعديل دائمًا. الأولوية للدقة القانونية لا لتوفير الكتابة.
 *
 * كل ما يُعرض هنا `.no-print` — لا يصل إلى الورق ولا إلى PDF ولا إلى المعاينة الدقيقة
 * (مُركِّب المستند يُسقط `.no-print`).
 */
import type { ReactNode } from 'react';
import DateInput from '../../components/DateInput';
import { useT } from '../../lib/i18n';
import { integerToWords } from '../../lib/tafqeet';
import type { DateFieldId, DebtAckData, DisbursementMethod, TextFieldId } from './debtAcknowledgmentModel';

export interface DebtAckDataEntryProps {
  data: DebtAckData;
  onChange: (patch: Partial<DebtAckData>) => void;
  /** الاسم الإنجليزي في سجل الموظف، إن وُجد — يُعرض كاقتراح للقوالب اللاتينية. */
  employeeNameEn?: string;
}

const LTR_INPUT = { direction: 'ltr' as const, textAlign: 'start' as const };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: number; children: ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 10, marginBottom: 10 }}>
      {children}
    </div>
  );
}

export default function DebtAckDataEntry({ data, onChange, employeeNameEn }: DebtAckDataEntryProps) {
  const { t } = useT();

  const text = (id: TextFieldId, label: string, opts?: { ltr?: boolean; span?: number }) => (
    <div className="field" style={opts?.span ? { gridColumn: `span ${opts.span}` } : undefined}>
      <label htmlFor={`eda-${id}`}>{label}</label>
      <input
        id={`eda-${id}`}
        title={label}
        value={data[id]}
        style={opts?.ltr ? LTR_INPUT : undefined}
        onChange={(e) => onChange({ [id]: e.target.value } as Partial<DebtAckData>)}
      />
    </div>
  );

  const date = (id: DateFieldId, label: string) => (
    <div className="field">
      <label htmlFor={`eda-${id}`}>{label}</label>
      <DateInput id={`eda-${id}`} title={label} value={data[id]} onChange={(v) => onChange({ [id]: v } as Partial<DebtAckData>)} />
    </div>
  );

  /** اقتراح التفقيط لخانة لغة بعينها — يظهر فقط حين يكون المبلغ عدداً صحيحاً من الدنانير. */
  const suggestion = (figures: string, lang: 'ar' | 'en'): string => {
    const n = Number(figures);
    if (!figures.trim() || !Number.isFinite(n)) return '';
    return integerToWords(n, lang);
  };

  const wordsField = (
    id: TextFieldId,
    label: string,
    figures: string,
    lang: 'ar' | 'en' | null,
  ) => {
    const hint = lang ? suggestion(figures, lang) : '';
    return (
      <div className="field">
        <label htmlFor={`eda-${id}`}>{label}</label>
        <input
          id={`eda-${id}`}
          title={label}
          value={data[id]}
          onChange={(e) => onChange({ [id]: e.target.value } as Partial<DebtAckData>)}
        />
        {hint && hint !== data[id] && (
          <button
            type="button"
            className="btn secondary"
            style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
            onClick={() => onChange({ [id]: hint } as Partial<DebtAckData>)}
          >
            {t('page.debtAck.use_tafqeet')}: {hint}
          </button>
        )}
        {!lang && (
          <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{t('page.debtAck.words_manual_hi')}</small>
        )}
      </div>
    );
  };

  return (
    <div
      className="no-print"
      style={{
        marginBottom: 16,
        padding: '14px 18px',
        background: 'var(--surface-2)',
        border: '1px dashed var(--border)',
        borderRadius: 10,
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 12 }}>{t('page.debtAck.entry_header')}</div>

      <Section title={t('page.debtAck.sec_creditor')}>
        <Grid cols={2}>
          {text('creditorName', t('page.debtAck.f.creditor_name'), { span: 2 })}
          {text('creditorCivilId', t('page.debtAck.f.creditor_civil_id'), { ltr: true })}
          {text('creditorCommercialReg', t('page.debtAck.f.creditor_commercial_reg'), { ltr: true })}
          {text('creditorRepresentative', t('page.debtAck.f.creditor_representative'))}
          {text('creditorAddress', t('page.debtAck.f.creditor_address'))}
        </Grid>
      </Section>

      <Section title={t('page.debtAck.sec_debtor')}>
        <Grid cols={3}>
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label htmlFor="eda-debtorFullName">{t('page.debtAck.f.debtor_name')}</label>
            <input
              id="eda-debtorFullName"
              title={t('page.debtAck.f.debtor_name')}
              value={data.debtorFullName}
              onChange={(e) => onChange({ debtorFullName: e.target.value })}
            />
            {employeeNameEn && employeeNameEn !== data.debtorFullName && (
              <button
                type="button"
                className="btn secondary"
                style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
                onClick={() => onChange({ debtorFullName: employeeNameEn, debtorSignatoryName: employeeNameEn })}
              >
                {t('page.debtAck.use_english_name')}: {employeeNameEn}
              </button>
            )}
          </div>
          {text('debtorEmployeeNo', t('page.debtAck.f.debtor_employee_no'), { ltr: true })}
          {text('debtorCivilId', t('page.debtAck.f.debtor_civil_id'), { ltr: true })}
          {text('debtorNationality', t('page.debtAck.f.debtor_nationality'))}
          {text('debtorPassportNo', t('page.debtAck.f.debtor_passport'), { ltr: true })}
          {text('debtorJobTitle', t('page.debtAck.f.debtor_job_title'))}
          {text('debtorAddressKuwait', t('page.debtAck.f.debtor_address'))}
          {text('debtorContact', t('page.debtAck.f.debtor_contact'), { ltr: true })}
        </Grid>
      </Section>

      <Section title={t('page.debtAck.sec_loan')}>
        <Grid cols={3}>
          {date('receiptDate', t('page.debtAck.f.receipt_date'))}
          {text('amountFigures', t('page.debtAck.f.amount_figures'), { ltr: true })}
          {text('balanceFigures', t('page.debtAck.f.balance_figures'), { ltr: true })}
        </Grid>
        <Grid cols={3}>
          {wordsField('amountWordsAr', t('page.debtAck.f.amount_words_ar'), data.amountFigures, 'ar')}
          {wordsField('amountWordsEn', t('page.debtAck.f.amount_words_en'), data.amountFigures, 'en')}
          {wordsField('amountWordsHi', t('page.debtAck.f.amount_words_hi'), data.amountFigures, null)}
        </Grid>
        <Grid cols={3}>
          {wordsField('balanceWordsAr', t('page.debtAck.f.balance_words_ar'), data.balanceFigures, 'ar')}
          {wordsField('balanceWordsEn', t('page.debtAck.f.balance_words_en'), data.balanceFigures, 'en')}
          {wordsField('balanceWordsHi', t('page.debtAck.f.balance_words_hi'), data.balanceFigures, null)}
        </Grid>
        <Grid cols={4}>
          <div className="field">
            <label htmlFor="eda-method">{t('page.debtAck.f.method')}</label>
            <select
              id="eda-method"
              title={t('page.debtAck.f.method')}
              value={data.disbursementMethod}
              onChange={(e) => onChange({ disbursementMethod: e.target.value as DisbursementMethod })}
            >
              <option value="">{t('page.debtAck.f.method_none')}</option>
              <option value="transfer">{t('page.debtAck.f.method_transfer')}</option>
              <option value="cheque">{t('page.debtAck.f.method_cheque')}</option>
              <option value="cash">{t('page.debtAck.f.method_cash')}</option>
            </select>
          </div>
          {text('transferNo', t('page.debtAck.f.transfer_no'), { ltr: true })}
          {text('chequeNo', t('page.debtAck.f.cheque_no'), { ltr: true })}
          {text('cashReceiptNo', t('page.debtAck.f.cash_receipt_no'), { ltr: true })}
        </Grid>
      </Section>

      <Section title={t('page.debtAck.sec_repayment')}>
        <Grid cols={3}>
          {text('installmentsCount', t('page.debtAck.f.installments_count'), { ltr: true })}
          {text('installmentAmount', t('page.debtAck.f.installment_amount'), { ltr: true })}
          {date('firstInstallmentDate', t('page.debtAck.f.first_installment_date'))}
          {text('monthlyDueDay', t('page.debtAck.f.monthly_due_day'), { ltr: true })}
          {text('finalInstallmentAmount', t('page.debtAck.f.final_installment_amount'), { ltr: true })}
          {date('finalInstallmentDate', t('page.debtAck.f.final_installment_date'))}
        </Grid>
        <Grid cols={2}>
          {text('creditorIban', t('page.debtAck.f.iban'), { ltr: true })}
          {text('explanationLanguage', t('page.debtAck.f.explanation_language'))}
        </Grid>
      </Section>

      <Section title={t('page.debtAck.sec_signatures')}>
        <Grid cols={4}>
          {text('creditorSignatoryName', t('page.debtAck.f.creditor_signatory'))}
          {date('creditorSignDate', t('page.debtAck.f.creditor_sign_date'))}
          {text('debtorSignatoryName', t('page.debtAck.f.debtor_signatory'))}
          {date('debtorSignDate', t('page.debtAck.f.debtor_sign_date'))}
          {text('witness1Name', t('page.debtAck.f.witness1_name'))}
          {text('witness1CivilId', t('page.debtAck.f.witness1_civil_id'), { ltr: true })}
          {text('witness2Name', t('page.debtAck.f.witness2_name'))}
          {text('witness2CivilId', t('page.debtAck.f.witness2_civil_id'), { ltr: true })}
          {text('interpreterName', t('page.debtAck.f.interpreter_name'))}
          {text('interpreterLanguage', t('page.debtAck.f.interpreter_language'))}
          {text('interpreterCivilId', t('page.debtAck.f.interpreter_civil_id'), { ltr: true })}
          {date('annexDate', t('page.debtAck.f.annex_date'))}
        </Grid>
      </Section>
    </div>
  );
}
