/**
 * Employee Loan Receipt and Acknowledgment of Debt — English text.
 *
 * Transcribed VERBATIM from `docs/Employee_Loan_Acknowledgment_Kuwait_EN.docx`:
 * same wording, same paragraph and section order, same clause numbering, same dot-run
 * lengths in every blank, same tables, columns and cell order. Nothing was reworded,
 * dropped, or translated from the Arabic or Hindi template — each language pack is
 * taken from its own source file.
 *
 * Any edit here is an edit to legal text: make one only from a new official source.
 */
import type { DebtAckContent } from './debtAcknowledgmentModel';

/** A dot run of an exact length — the same length Word shows in that blank. */
const d = (n: number) => '.'.repeat(n);

export const DEBT_ACK_CONTENT_EN: DebtAckContent = {
  lang: 'en',
  dir: 'ltr',
  labelColumnFirst: true,

  title: 'EMPLOYEE LOAN RECEIPT AND ACKNOWLEDGMENT OF DEBT',
  subtitle: 'Evidence of an interest-free loan - Governed by the laws of the State of Kuwait',

  s1Heading: '1. CREDITOR DETAILS (EMPLOYER)',
  creditorRows: [
    { label: 'Name / Establishment name', segs: [{ f: 'creditorName', p: d(96) }] },
    {
      label: 'Civil ID / Unified No.',
      segs: [{ f: 'creditorCivilId', p: d(40) }, '   Commercial Reg.: ', { f: 'creditorCommercialReg', p: d(40) }],
    },
    { label: 'Legal representative and capacity', segs: [{ f: 'creditorRepresentative', p: d(96) }] },
    { label: 'Address and contact details', segs: [{ f: 'creditorAddress', p: d(96) }] },
  ],

  s2Heading: '2. DEBTOR DETAILS (EMPLOYEE)',
  debtorRows: [
    { label: 'Full name', segs: [{ f: 'debtorFullName', p: d(96) }] },
    {
      label: 'Civil ID',
      segs: [{ f: 'debtorCivilId', p: d(40) }, '   Nationality: ', { f: 'debtorNationality', p: d(40) }],
    },
    {
      label: 'Passport No.',
      segs: [{ f: 'debtorPassportNo', p: d(40) }, '   Employee No.: ', { f: 'debtorEmployeeNo', p: d(40) }],
    },
    { label: 'Occupation / Job title', segs: [{ f: 'debtorJobTitle', p: d(96) }] },
    { label: 'Residential address in Kuwait', segs: [{ f: 'debtorAddressKuwait', p: d(96) }] },
    { label: 'Telephone and email', segs: [{ f: 'debtorContact', p: d(96) }] },
  ],

  s3Heading: '3. ACKNOWLEDGMENT AND ORIGIN OF DEBT',
  preamble:
    'I, the Debtor identified above, being of full legal capacity, freely and without duress acknowledge and declare as follows:',
  clauses1to3: [
    {
      lead: '1. Receipt of the loan:',
      segs: [
        ' On ',
        { d: 'receiptDate' },
        ', I actually received from the Creditor the sum of KWD (',
        { f: 'amountFigures', p: d(20) },
        '), in words: ',
        { w: 'amount' },
        ' Kuwaiti Dinars only, by: ',
        { cb: 'transfer' },
        ' bank transfer No. ',
        { f: 'transferNo', p: d(24) },
        ' ',
        { cb: 'cheque' },
        ' cheque No. ',
        { f: 'chequeNo', p: d(24) },
        ' ',
        { cb: 'cash' },
        ' cash against attached receipt No. ',
        { f: 'cashReceiptNo', p: d(24) },
        ' . The proof of disbursement forms an integral part of this acknowledgment.',
      ],
    },
    {
      lead: '2. Existence of the debt:',
      segs: [
        ' I acknowledge that the above amount constitutes a valid, established and final personal debt owed by me to the Creditor. It is an interest-free loan and is not salary, a bonus, a grant, remuneration for work, or part of my employment entitlements.',
      ],
    },
    {
      lead: '3. Balance on signing:',
      segs: [
        ' The outstanding balance owed by me as at the date of this acknowledgment is KWD (',
        { f: 'balanceFigures', p: d(20) },
        '), in words: ',
        { w: 'balance' },
        ' Kuwaiti Dinars only.',
      ],
    },
  ],

  s4Heading: '4. REPAYMENT METHOD',
  clauses4to7: [
    {
      lead: '4. Instalments:',
      segs: [
        ' I shall repay the debt in (',
        { f: 'installmentsCount', p: d(8) },
        ') instalments of KWD (',
        { f: 'installmentAmount', p: d(16) },
        ') each. The first instalment is due on ',
        { d: 'firstInstallmentDate' },
        '; each subsequent instalment is due on day (',
        { f: 'monthlyDueDay', p: d(8) },
        ') of each month; and the final instalment of KWD (',
        { f: 'finalInstallmentAmount', p: d(16) },
        ') is due on ',
        { d: 'finalInstallmentDate' },
        ', in accordance with the attached repayment schedule.',
      ],
    },
    {
      lead: '5. Payment method:',
      segs: [
        ' Payment shall be made by bank transfer to the Creditor’s account/IBAN ',
        { f: 'creditorIban', p: d(56) },
        ' or against an official receipt issued by the Creditor. Cash payment shall not be proved unless supported by a signed and stamped receipt.',
      ],
    },
    {
      lead: '6. Deduction from wages:',
      segs: [
        ' I consent to deduction of instalments from my wages with the Creditor only to the extent permitted by law. Deductions toward an employer loan shall not exceed 10% of wages due and no interest shall be charged. If an agreed instalment exceeds the lawful deduction limit, I shall directly pay the difference by the method stated above.',
      ],
    },
    {
      lead: '7. Partial receipts:',
      segs: [
        ' Every payment shall be credited against the principal debt and recorded in an account statement or receipt. No partial receipt constitutes a release from the remaining balance unless the Creditor issues a written final discharge.',
      ],
    },
  ],

  s5Heading: '5. ACCELERATION AND ENFORCEMENT',
  clauses8to14: [
    {
      lead: '8. Default:',
      segs: [
        ' If I fail to pay any instalment for ten days after its due date, the entire outstanding balance shall become immediately due and payable as a determined amount, without prejudice to any demand for payment or other procedure required by law.',
      ],
    },
    {
      lead: '9. Termination of employment:',
      segs: [
        ' If the employment relationship ends for any reason, the Creditor may set off or deduct amounts from my final entitlements only within the limits permitted by law. Any balance thereafter shall become payable within ten days after I am notified of the final balance statement, unless the Creditor agrees in writing that the instalment schedule may continue.',
      ],
    },
    {
      lead: '10. Chosen address:',
      segs: [
        ' I designate the address and contact details above for notices and correspondence concerning this debt and shall notify the Creditor in writing of any change within five days. This clause does not replace formal judicial or electronic service where required by law.',
      ],
    },
    {
      lead: '11. Recovery:',
      segs: [
        ' Upon non-payment, the Creditor may pursue recovery before the competent Kuwaiti authority or court, including serving a demand for payment and applying for a payment order when its conditions are met, together with costs and fees awarded under law or judgment, but without interest on the loan.',
      ],
    },
    {
      lead: '12. Notarisation:',
      segs: [
        ' I consent to submission of this acknowledgment to the Authentication Department of the Ministry of Justice for execution as an official instrument and for an executory formula to be affixed where permitted by law and accepted by the competent authority. I understand that this clause alone does not create an executory formula; it must be granted by the competent authority in accordance with law.',
      ],
    },
    {
      lead: '13. Language and understanding:',
      segs: [
        ' I have read this acknowledgment and understand all its effects. It was explained to me in ',
        { f: 'explanationLanguage', p: d(32) },
        ', a language I understand. At signing, there are no material blanks or amendments that have not been initialled by the parties.',
      ],
    },
    {
      lead: '14. Governing law and jurisdiction:',
      segs: [
        ' This acknowledgment is governed by the laws of the State of Kuwait. Any dispute shall be subject to the competent Kuwaiti authorities and courts according to their subject-matter and territorial jurisdiction.',
      ],
    },
  ],

  s6Heading: '6. SIGNATURES',
  signaturesNote:
    'The undersigned confirm that this signature page forms an integral part of the Employee Loan Receipt and Acknowledgment of Debt and that it was signed after the acknowledgment was read, understood and its material particulars completed.',
  signatureHeader: ['Creditor / Legal representative', 'Debtor / Employee'],
  signatureRowIndex: 1,
  signatureRows: [
    [
      ['Name: ', { f: 'creditorSignatoryName', p: d(48) }],
      ['Name: ', { f: 'debtorSignatoryName', p: d(48) }],
    ],
    [
      [`Signature and stamp: ${d(40)}`],
      [`Signature: ${d(48)}`],
    ],
    [
      ['Date: ', { d: 'creditorSignDate' }],
      ['Thumbprint:                  Date: ', { d: 'debtorSignDate' }],
    ],
  ],
  witnessesHeading: 'WITNESSES AND INTERPRETER (IF REQUIRED)',
  witnessRows: [
    [
      'First witness:   Name ',
      { f: 'witness1Name', p: d(24) },
      '     Civil ID ',
      { f: 'witness1CivilId', p: d(24) },
      `     Signature ${d(24)}`,
    ],
    [
      'Second witness:   Name ',
      { f: 'witness2Name', p: d(24) },
      '     Civil ID ',
      { f: 'witness2CivilId', p: d(24) },
      `     Signature ${d(24)}`,
    ],
    [
      'Interpreter - if required:   Name ',
      { f: 'interpreterName', p: d(24) },
      '     Language ',
      { f: 'interpreterLanguage', p: d(24) },
      '     Civil ID ',
      { f: 'interpreterCivilId', p: d(24) },
      `     Signature ${d(24)}`,
    ],
  ],

  annexTitle: 'ANNEX A - REPAYMENT SCHEDULE',
  annexColumns: ['Instalment No.', 'Due date', 'Amount paid', 'Balance after payment', 'Notes / Receipt No.'],
  annexNumberFirst: true,
  annexRowCells: ['....../....../..........', `${d(16)} KWD`, `${d(16)} KWD`, d(32)],
  annexCellRoles: ['dueDate', 'amount', 'balance', 'notes'],
  annexAmountSuffix: ' KWD',
  annexRowCount: 12,
  annexTotals: [
    'Principal debt: ',
    { f: 'amountFigures', p: d(24) },
    ' KWD   |   No. of instalments: ',
    { f: 'installmentsCount', p: d(8) },
    '   |   Final due date: ',
    { d: 'finalInstallmentDate' },
  ],
  annexNote: 'Both parties must sign this annex. Unused rows must be clearly struck through.',
  annexSignRows: [
    { label: 'Creditor / Legal representative', segs: [d(96)], signature: true },
    { label: 'Debtor / Employee', segs: [d(96)], signature: true },
    { label: 'Date', segs: [{ d: 'annexDate' }] },
  ],

  guidanceTitle: 'IMPORTANT INSTRUCTIONS BEFORE SIGNING AND USE',
  guidanceRows: [
    {
      label: 'Best legal protection',
      text: 'Do not rely solely on an internal form. Attend the Ministry of Justice Authentication Department with the employee, request an official acknowledgment of debt, and expressly ask whether an executory formula can be affixed.',
    },
    {
      label: 'Proof of disbursement',
      text: 'Use a bank transfer labelled “Employee Loan” or a cheque payable to the employee and retain the bank statement. For cash, attach a separate receipt bearing the employee’s signature and thumbprint.',
    },
    {
      label: 'Amount and maturity',
      text: 'Write the amount in figures and words and specify every due date. Avoid expressions such as “when able to pay” if the debt must become due on a definite date.',
    },
    {
      label: 'Payroll deduction',
      text: 'Do not deduct more than 10% of the employee’s wages toward an employer loan and do not add interest or any conditional benefit.',
    },
    {
      label: 'Proper execution',
      text: 'The employee should sign and thumbprint every page and the schedule. Both parties must initial handwritten amendments and strike through unused blanks.',
    },
    {
      label: 'Employee’s language',
      text: 'If the employee does not read the document’s language, provide an accurate translation into a language understood by the employee and use an interpreter at notarisation. This translation is not certified unless approved by an accredited translator or the competent authority.',
    },
    {
      label: 'If payment is not made',
      text: 'The normal route is a financial claim, not a police complaint merely because payment is late. Serve a formal demand allowing at least ten days, then seek a payment order if its conditions are met, or follow the procedure directed by counsel or the court.',
    },
    {
      label: 'Prohibited practices',
      text: 'Do not retain the employee’s passport, request a blank cheque or instrument, or complete material particulars after signature.',
    },
  ],

  sourcesHeading: 'KEY LEGAL SOURCES',
  sources: [
    'Kuwait Civil and Commercial Procedures Law No. 38 of 1980, Articles 166, 167 and 190 (updated text displayed in 2026).',
    'Kuwait Evidence Law No. 39 of 1980, Articles 13 and 14.',
    'Kuwait Private Sector Labour Law No. 6 of 2010, Article 59(a).',
    'Kuwait Civil Code No. 67 of 1980, Articles 543, 547 and 548.',
    'Kuwait Ministry of Justice services: “Acknowledgment of Debt” and “Payment Order” (reviewed 8 September 2026).',
  ],
  disclaimer:
    'NOTICE: This is a practical draft based on published legal texts and does not guarantee a judicial result. The Authentication Department or Kuwaiti counsel should review the facts and particulars before final signature, especially the loan amount, the Creditor’s capacity, the employee’s language and any security.',
};
