/**
 * شاشة الإدخال الوحيدة لإقرار دين موظف.
 *
 * تُدخَل البيانات **مرة واحدة** هنا، ثم يختار المستخدم القالب (العربية / English /
 * हिन्दी) فتُحقن القيم نفسها في القالب المختار — بلا إعادة إدخال، وبلا ترجمة وقت
 * التشغيل.
 *
 * ثلاثة استثناءات، ولكلٍّ سببه:
 *   1. **المبلغ بالحروف**: عبارة قانونية مشتقّة من لغة النصّ، فلها خانة لكل قالب.
 *      اقتراح من محرّك التفقيط القائم للعربية والإنجليزية بنقرة صريحة، وإدخال يدوي
 *      للهندية — لا محوّل غير موثوق. الأولوية للدقة القانونية لا لتوفير الكتابة.
 *   2. **بيانات القالب الأجنبي**: القيم التي تُطبع بالعربية في القالب العربي تحتاج
 *      مقابلًا لاتينيًا في القالبين الإنجليزي والهندي — ولا يملك سجل الموظف مقابلًا
 *      إنجليزيًا إلا للاسم. تظهر خاناتها عند اختيار قالب أجنبي فقط.
 *   3. **الحقول المحسوبة**: قيمة القسط والقسط الأخير وتاريخه ويوم الاستحقاق مشتقّة من
 *      جدول السداد، فتُعرض للقراءة ولا تُدخَل يدويًا بمعزل عنه.
 *
 * كل ما يُعرض هنا `.no-print` — لا يصل إلى الورق ولا إلى PDF ولا إلى المعاينة الدقيقة
 * (مُركِّب المستند يُسقط `.no-print`).
 */
import type { ReactNode } from 'react';
import DateInput from '../../components/DateInput';
import { useT } from '../../lib/i18n';
import { integerToWords } from '../../lib/tafqeet';
import DebtAckScheduleEditor from './DebtAckScheduleEditor';
import {
  CREDITOR_COMMERCIAL_REGISTRATION_NO,
  CREDITOR_IBAN,
  CREDITOR_UNIFIED_NUMBER,
  MAX_INSTALLMENTS,
  ROWS_PER_ANNEX_PAGE,
} from './constants';
import { scheduleBaseAmount } from './debtAcknowledgmentDocument';
import type { InstallmentRow, ScheduleIssue } from './debtAcknowledgmentSchedule';
import type {
  DateFieldId,
  DebtAckData,
  DebtAckLang,
  DisbursementMethod,
  LocalizableFieldId,
  TextFieldId,
} from './debtAcknowledgmentModel';

export interface DebtAckDataEntryProps {
  /** إعادة مزامنة «الرصيد عند التوقيع» مع أصل الدين — يظهر حين يكون معدَّلًا يدويًا. */
  onResyncBalance?: () => void;
  data: DebtAckData;
  /** قالب المستند المعروض — يقرّر ظهور قسم «بيانات القالب الإنجليزي/الهندي». */
  lang: DebtAckLang;
  onChange: (patch: Partial<DebtAckData>) => void;
  onScheduleChange: (rows: InstallmentRow[]) => void;
  onRegenerateSchedule: () => void;
  /** أخلال المدخلات والجدول — تُعرض مترجَمة أعلى القسم. */
  issues: ScheduleIssue[];
  /** الحقول التي ما زالت قيمتها المعروضة عربية في قالب أجنبي. */
  arabicLeaks: string[];
  /** الاسم الإنجليزي في سجل الموظف، إن وُجد — يُعرض كاقتراح للقوالب اللاتينية. */
  employeeNameEn?: string;
}

const LTR_INPUT = { direction: 'ltr' as const, textAlign: 'start' as const };

/** الحقول اللغوية ونظائرها، بترتيب ظهورها في قسم القالب الأجنبي. */
const FOREIGN_FIELDS: { id: LocalizableFieldId; labelKey: string }[] = [
  { id: 'debtorFullName', labelKey: 'page.debtAck.f.debtor_name_latin' },
  { id: 'debtorNationality', labelKey: 'page.debtAck.f.debtor_nationality_latin' },
  { id: 'debtorJobTitle', labelKey: 'page.debtAck.f.debtor_job_title_latin' },
  { id: 'debtorAddressKuwait', labelKey: 'page.debtAck.f.debtor_address_latin' },
  { id: 'debtorContact', labelKey: 'page.debtAck.f.debtor_contact_latin' },
  { id: 'creditorName', labelKey: 'page.debtAck.f.creditor_name_latin' },
  { id: 'creditorRepresentative', labelKey: 'page.debtAck.f.creditor_representative_latin' },
  { id: 'creditorAddress', labelKey: 'page.debtAck.f.creditor_address_latin' },
  { id: 'explanationLanguage', labelKey: 'page.debtAck.f.explanation_language_latin' },
  { id: 'creditorSignatoryName', labelKey: 'page.debtAck.f.creditor_signatory_latin' },
  { id: 'debtorSignatoryName', labelKey: 'page.debtAck.f.debtor_signatory_latin' },
  { id: 'witness1Name', labelKey: 'page.debtAck.f.witness1_name_latin' },
  { id: 'witness2Name', labelKey: 'page.debtAck.f.witness2_name_latin' },
  { id: 'interpreterName', labelKey: 'page.debtAck.f.interpreter_name_latin' },
  { id: 'interpreterLanguage', labelKey: 'page.debtAck.f.interpreter_language_latin' },
];

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

export default function DebtAckDataEntry({
  onResyncBalance,
  data,
  lang,
  onChange,
  onScheduleChange,
  onRegenerateSchedule,
  issues,
  arabicLeaks,
  employeeNameEn,
}: DebtAckDataEntryProps) {
  const { t } = useT();
  const isForeignTemplate = lang !== 'ar';

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

  /** حقل للقراءة فقط: قيمة ثابتة أو محسوبة — يُعرض ولا يُدخَل. */
  const readOnly = (id: TextFieldId | DateFieldId, label: string, note: string) => (
    <div className="field">
      <label htmlFor={`eda-${id}`}>{label}</label>
      <input id={`eda-${id}`} title={label} value={data[id]} readOnly style={{ ...LTR_INPUT, opacity: 0.75 }} />
      <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>{note}</small>
    </div>
  );

  const date = (id: DateFieldId, label: string) => (
    <div className="field">
      <label htmlFor={`eda-${id}`}>{label}</label>
      <DateInput id={`eda-${id}`} title={label} value={data[id]} onChange={(v) => onChange({ [id]: v } as Partial<DebtAckData>)} />
    </div>
  );

  /** اقتراح التفقيط لخانة لغة بعينها — يظهر فقط حين يكون المبلغ عدداً صحيحاً من الدنانير. */
  const suggestion = (figures: string, words: 'ar' | 'en'): string => {
    const n = Number(figures);
    if (!figures.trim() || !Number.isFinite(n)) return '';
    return integerToWords(n, words);
  };

  const wordsField = (id: TextFieldId, label: string, figures: string, words: 'ar' | 'en' | null) => {
    const hint = words ? suggestion(figures, words) : '';
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
        {!words && (
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

      {(issues.length > 0 || arabicLeaks.length > 0) && (
        <div
          role="alert"
          style={{
            marginBottom: 12,
            padding: '8px 12px',
            border: '1px solid #f0b4b4',
            background: '#fdf2f2',
            borderRadius: 8,
            fontSize: 12,
          }}
        >
          <ul style={{ margin: 0, paddingInlineStart: 18 }}>
            {issues.map((issue) => (
              <li key={issue}>{t(`page.debtAck.issue.${issue}`)}</li>
            ))}
            {arabicLeaks.length > 0 && (
              <li>
                {t('page.debtAck.arabic_block_intro')} {arabicLeaks.join('، ')}
              </li>
            )}
          </ul>
        </div>
      )}

      <Section title={t('page.debtAck.sec_creditor')}>
        <Grid cols={2}>
          {text('creditorName', t('page.debtAck.f.creditor_name'), { span: 2 })}
          {/* بيانات ثابتة للشركة — لا تُدخَل في كل مستند ولا تُعدَّل سهوًا. */}
          {readOnly('creditorCivilId', t('page.debtAck.f.creditor_civil_id'), t('page.debtAck.fixed_note'))}
          {readOnly('creditorCommercialReg', t('page.debtAck.f.creditor_commercial_reg'), t('page.debtAck.fixed_note'))}
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
          {/* الرصيد عند التوقيع: يتبع أصل الدين ما دام لم يُمسّ، فإذا كُتب بيدٍ صار
              القيمة المقصودة وعليها يُبنى جدول الأقساط. الملاحظة أدناه تُظهر أيّ
              الحالتين قائمة، وتعرض طريق العودة بدل أن يُدهس الإدخال صامتًا. */}
          <div className="field">
            <label htmlFor="eda-balanceFigures">{t('page.debtAck.f.balance_figures')}</label>
            <input
              id="eda-balanceFigures"
              title={t('page.debtAck.f.balance_figures')}
              value={data.balanceFigures}
              style={LTR_INPUT}
              onChange={(e) => onChange({ balanceFigures: e.target.value })}
            />
            {data.balanceManual ? (
              <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {t('page.debtAck.balance_manual_note')}
                {onResyncBalance && (
                  <button
                    type="button"
                    className="btn secondary"
                    style={{ fontSize: 11, padding: '1px 6px', marginInlineStart: 6 }}
                    onClick={onResyncBalance}
                  >
                    {t('page.debtAck.balance_resync')}
                  </button>
                )}
              </small>
            ) : (
              <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                {t('page.debtAck.balance_follows_note')}
              </small>
            )}
          </div>
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
        {/* المُدخَلات الثلاثة التي يُشتقّ منها الجدول كله. */}
        <Grid cols={3}>
          <div className="field">
            <label htmlFor="eda-installmentsCount">{t('page.debtAck.f.installments_count')}</label>
            <input
              id="eda-installmentsCount"
              type="number"
              lang="en"
              min={1}
              max={MAX_INSTALLMENTS}
              step={1}
              title={t('page.debtAck.f.installments_count')}
              value={data.installmentsCount}
              style={LTR_INPUT}
              onChange={(e) => onChange({ installmentsCount: e.target.value })}
            />
            <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {t('page.debtAck.max_installments', { n: MAX_INSTALLMENTS, rows: ROWS_PER_ANNEX_PAGE })}
            </small>
          </div>
          {date('firstInstallmentDate', t('page.debtAck.f.first_installment_date'))}
          {readOnly('installmentAmount', t('page.debtAck.f.installment_amount'), t('page.debtAck.computed_note'))}
        </Grid>
        <Grid cols={3}>
          {readOnly('monthlyDueDay', t('page.debtAck.f.monthly_due_day'), t('page.debtAck.computed_note'))}
          {readOnly(
            'finalInstallmentAmount',
            t('page.debtAck.f.final_installment_amount'),
            t('page.debtAck.computed_note'),
          )}
          {readOnly('finalInstallmentDate', t('page.debtAck.f.final_installment_date'), t('page.debtAck.computed_note'))}
        </Grid>
        <DebtAckScheduleEditor
          rows={data.schedule}
          debtAmount={scheduleBaseAmount(data) || 0}
          manual={data.scheduleManual}
          onChange={onScheduleChange}
          onRegenerate={onRegenerateSchedule}
        />
        <Grid cols={2}>
          {/* الآيبان بيانٌ ثابت لا حقل: قيمته من `CREDITOR_IBAN` وحدها، وتُفرض في
              `withFixedCreditorData` بعد كل ملء وكل تحميل مسودّة. عرضُه قابلًا
              للكتابة كان سيوحي بإمكان تغييره ثم يُدهس في أول تحديث. */}
          {readOnly('creditorIban', t('page.debtAck.f.iban'), t('page.debtAck.fixed_note'))}
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

      {/* ── بيانات القالب الإنجليزي / الهندي ─────────────────────────────────
          تظهر عند اختيار قالب أجنبي فقط. قيمها **تخصّ هذا المستند وحده**: لا تُكتب
          في سجل الموظف ولا تعدّله، وتُحفظ مع المسودّة كبقية حقول المستند. */}
      {isForeignTemplate && (
        <Section title={t('page.debtAck.sec_foreign')}>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px' }}>
            {t('page.debtAck.foreign_note')}
          </p>
          <Grid cols={3}>
            {FOREIGN_FIELDS.map(({ id, labelKey }) => {
              const twin = `${id}Latin` as TextFieldId;
              const label = t(labelKey);
              const canUseEmployeeNameEn =
                id === 'debtorFullName' && employeeNameEn && employeeNameEn !== data[twin];
              return (
                <div className="field" key={twin}>
                  <label htmlFor={`eda-${twin}`}>{label}</label>
                  <input
                    id={`eda-${twin}`}
                    title={label}
                    value={data[twin]}
                    style={LTR_INPUT}
                    onChange={(e) => onChange({ [twin]: e.target.value } as Partial<DebtAckData>)}
                  />
                  <small style={{ color: 'var(--text-muted)', fontSize: 11 }}>
                    {t('page.debtAck.foreign_helper')}
                  </small>
                  {canUseEmployeeNameEn && (
                    <button
                      type="button"
                      className="btn secondary"
                      style={{ fontSize: 11, padding: '2px 8px', marginTop: 4 }}
                      onClick={() =>
                        onChange({ debtorFullNameLatin: employeeNameEn, debtorSignatoryNameLatin: employeeNameEn })
                      }
                    >
                      {t('page.debtAck.use_english_name')}: {employeeNameEn}
                    </button>
                  )}
                </div>
              );
            })}
          </Grid>
        </Section>
      )}
    </div>
  );
}
