/**
 * إقرار دين موظف — مفتاح التسمية المقروءة لكل حقل.
 *
 * وُجد لسبب واحد: حين يُرفض القالب الأجنبي لوجود قيمة عربية، لا يكفي أن نقول «هناك
 * نصّ عربي». يجب أن نقول **أي حقل** — بتسميته التي يراها المستخدم في شاشة الإدخال،
 * لا بمعرّفه البرمجي. فهذا الجدول هو الجسر بين معرّف الحقل وتسميته.
 *
 * القيم مفاتيح i18n لا نصوص، فتُعرض بلغة الواجهة المختارة كبقية الشاشة.
 */
export const DEBT_ACK_FIELD_LABEL_KEY: Readonly<Record<string, string>> = {
  creditorName: 'page.debtAck.f.creditor_name',
  creditorCivilId: 'page.debtAck.f.creditor_civil_id',
  creditorCommercialReg: 'page.debtAck.f.creditor_commercial_reg',
  creditorRepresentative: 'page.debtAck.f.creditor_representative',
  creditorAddress: 'page.debtAck.f.creditor_address',
  debtorFullName: 'page.debtAck.f.debtor_name',
  debtorCivilId: 'page.debtAck.f.debtor_civil_id',
  debtorNationality: 'page.debtAck.f.debtor_nationality',
  debtorPassportNo: 'page.debtAck.f.debtor_passport',
  debtorEmployeeNo: 'page.debtAck.f.debtor_employee_no',
  debtorJobTitle: 'page.debtAck.f.debtor_job_title',
  debtorAddressKuwait: 'page.debtAck.f.debtor_address',
  debtorContact: 'page.debtAck.f.debtor_contact',
  amountFigures: 'page.debtAck.f.amount_figures',
  balanceFigures: 'page.debtAck.f.balance_figures',
  transferNo: 'page.debtAck.f.transfer_no',
  chequeNo: 'page.debtAck.f.cheque_no',
  cashReceiptNo: 'page.debtAck.f.cash_receipt_no',
  installmentsCount: 'page.debtAck.f.installments_count',
  installmentAmount: 'page.debtAck.f.installment_amount',
  monthlyDueDay: 'page.debtAck.f.monthly_due_day',
  finalInstallmentAmount: 'page.debtAck.f.final_installment_amount',
  creditorIban: 'page.debtAck.f.iban',
  explanationLanguage: 'page.debtAck.f.explanation_language',
  creditorSignatoryName: 'page.debtAck.f.creditor_signatory',
  debtorSignatoryName: 'page.debtAck.f.debtor_signatory',
  witness1Name: 'page.debtAck.f.witness1_name',
  witness1CivilId: 'page.debtAck.f.witness1_civil_id',
  witness2Name: 'page.debtAck.f.witness2_name',
  witness2CivilId: 'page.debtAck.f.witness2_civil_id',
  interpreterName: 'page.debtAck.f.interpreter_name',
  interpreterLanguage: 'page.debtAck.f.interpreter_language',
  interpreterCivilId: 'page.debtAck.f.interpreter_civil_id',
  amountWords: 'page.debtAck.words_label',
  balanceWords: 'page.debtAck.balance_words_label',
};
