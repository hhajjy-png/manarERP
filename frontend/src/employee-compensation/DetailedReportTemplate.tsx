/**
 * قالب **التقرير التفصيلي الداخلي** — «تفاصيل احتساب مستحقات موظف».
 *
 * مستند **داخلي** لا يُسلَّم للموظف بوصفه كشفًا: يعرض خطوات الحساب كاملة — أجر الساعة
 * وقاعدة اشتقاقه، معامل كل نوع، مرجعه القانوني، طريقة الوصول إلى الساعات، المبلغ
 * المستهدف في الحسبة العكسية، وفرق التقريب — بالإضافة إلى التحذيرات القانونية.
 *
 * هذا هو المستند الوحيد الذي يجوز أن تُذكر فيه الحسبة العكسية (المتطلبان ١١ و٢٢).
 */
import {
  fmtDate,
  issueDateStr,
  labelCell,
  longTextCell,
  money,
  sectionHeader,
  tableRow,
  tableWrapper,
  valueCell,
} from '../forms/shared/formStyles';
import { DEBT_TYPE_LABEL_AR, DEDUCTION_LABEL_AR, EARNING_LABEL_AR, OVERTIME_LABEL_LONG_AR, monthNameAr } from './labels';
import type { DetailedReportData } from './types';

const th: React.CSSProperties = {
  background: '#1d4e6f',
  color: '#fff',
  fontWeight: 800,
  fontSize: 11.5,
  padding: '6px 8px',
  textAlign: 'start',
  WebkitPrintColorAdjust: 'exact',
  printColorAdjust: 'exact',
};
const td: React.CSSProperties = { padding: '6px 8px', fontSize: 11.5, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' };
const tdNum: React.CSSProperties = { ...td, textAlign: 'end', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };
const table: React.CSSProperties = { width: '100%', borderCollapse: 'collapse' };
const totalRow: React.CSSProperties = { ...td, fontWeight: 800, background: '#f8fafc', WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' };

export default function DetailedReportTemplate({ data }: { data: DetailedReportData }) {
  const { employee, totals } = data;

  return (
    <>
      <div style={tableWrapper}>
        <div style={sectionHeader}>بيانات الموظف والفترة</div>
        <div style={tableRow}>
          <div style={labelCell}>اسم الموظف</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{employee.fullName}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الرقم الوظيفي</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{employee.code}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>المسمى الوظيفي</div>
          <div style={valueCell}>{employee.jobTitle ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>القسم</div>
          <div style={valueCell}>{employee.department ?? '—'}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الشهر / السنة</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{monthNameAr(data.month)} {data.year}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>الحالة</div>
          <div style={valueCell}>
            {data.status === 'APPROVED'
              ? `معتمد${data.approvedByName ? ` — ${data.approvedByName}` : ''}${data.approvedAt ? ` (${fmtDate(data.approvedAt)})` : ''}`
              : 'مسودة'}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>تاريخ إعداد التقرير</div>
          <div style={valueCell}>{issueDateStr()}</div>
        </div>
      </div>

      <div style={tableWrapper}>
        <div style={sectionHeader}>أساس الاحتساب</div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الأساسي المستخدم</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{money(data.basicSalary)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>أجر الساعة العادي</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {money(data.hourlyRate)}
            {/* الأساس يصل من المحرّك — لا رقم قاسم مكتوب في هذا القالب. */}
            <span style={{ fontWeight: 400, color: '#64748b' }}>
              {' '}= الراتب الأساسي ÷ {data.hourlyRateBasis.daysDivisor} يومًا ÷ {data.hourlyRateBasis.hoursPerDay} ساعات
              {' '}({data.hourlyRateBasis.monthlyHours} ساعة شهريًا)
            </span>
          </div>
        </div>
        {/* سعر الشركة بند مستقلّ عن أجر الساعة القانوني — لا يُدمجان في سطر واحد
            حتى لا يُقرأ القرار الإداري كأنه نصّ قانوني. */}
        <div style={tableRow}>
          <div style={labelCell}>سعر ساعة الإضافي المعتمد من الشركة</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>
            {data.companyOvertimeBaseRate == null ? (
              <span style={{ fontWeight: 400, color: '#64748b' }}>
                لا سياسة سعر شركة لهذا الشهر — احتُسب بالحد الأدنى القانوني وحده
              </span>
            ) : (
              money(data.companyOvertimeBaseRate)
            )}
          </div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إصدار القواعد القانونية</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{data.legalRulesVersion}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إصدار سياسة الشركة</div>
          <div style={{ ...valueCell, fontFamily: 'monospace' }}>{data.companyOvertimePolicyVersion ?? '—'}</div>
        </div>
      </div>

      {data.overtimeLines.length > 0 && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>تفاصيل العمل الإضافي</div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>النوع</th>
                <th style={{ ...th, textAlign: 'end' }}>الساعات</th>
                {/* ثلاثة أعمدة سعر لا عمود واحد (المتطلب ٢١): القارئ يجب أن يرى الحدّ
                    الذي فرضه القانون، والسعر الذي اختارته الشركة، وأيّهما استُعمل. */}
                <th style={{ ...th, textAlign: 'end' }}>الحد القانوني للساعة</th>
                <th style={{ ...th, textAlign: 'end' }}>سعر الشركة للنوع</th>
                <th style={{ ...th, textAlign: 'end' }}>المستخدم فعليًا</th>
                <th style={{ ...th, textAlign: 'end' }}>القيمة (د.ك)</th>
                <th style={th}>طريقة الاحتساب</th>
              </tr>
            </thead>
            <tbody>
              {data.overtimeLines.map((l, i) => (
                <tr key={i}>
                  <td style={td}>
                    {OVERTIME_LABEL_LONG_AR[l.overtimeType]}
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{l.legalReference}</div>
                  </td>
                  <td style={tdNum}>{l.hours}</td>
                  <td style={tdNum}>
                    {/* الحدّ القانوني = أجر الساعة × معامل المادة. يُعرض أساسه تحته
                        فيستطيع القارئ إعادة اشتقاقه بنفسه من أرقام الورقة. */}
                    {money(l.statutoryMinimumRate ?? l.hourlyRate * l.multiplier)}
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {money(l.hourlyRate)} ×{l.multiplier}
                    </div>
                  </td>
                  <td style={tdNum}>
                    {l.companyDerivedRate == null ? '—' : money(l.companyDerivedRate)}
                    {l.companyBaseRate != null && (
                      <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                        الأساسي {money(l.companyBaseRate)}
                      </div>
                    )}
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>
                    {money(l.effectiveRate ?? l.hourlyRate * l.multiplier)}
                    <div style={{ fontSize: 10, color: l.rateSource === 'STATUTORY_FLOOR' ? '#b45309' : '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {l.rateSource === 'COMPANY_POLICY' ? 'سعر الشركة' : 'الحد القانوني'}
                    </div>
                  </td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(l.amount)}</td>
                  <td style={td}>
                    {l.calculationMethod === 'REVERSE_FROM_AMOUNT' ? (
                      <>
                        حسبة عكسية من مبلغ مستهدف
                        <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                          المبلغ المستهدف: {money(l.reverseTargetAmount ?? 0)}
                          {' · '}الساعات قبل التقريب: {l.rawHoursBeforeCeiling ?? '—'}
                          {' · '}فرق التقريب: {money(l.roundingDifference ?? 0)}
                        </div>
                      </>
                    ) : (
                      'ساعات مُدخلة يدويًا'
                    )}
                    {l.notes && <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>{l.notes}</div>}
                  </td>
                </tr>
              ))}
              <tr>
                <td style={totalRow} colSpan={5}>إجمالي العمل الإضافي</td>
                <td style={{ ...totalRow, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>
                  {money(totals.totalOvertimeAmount)}
                </td>
                <td style={totalRow} />
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data.earnings.length > 0 && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>الاستحقاقات الأخرى</div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>النوع</th>
                <th style={th}>البند</th>
                <th style={th}>سبب الصرف</th>
                <th style={{ ...th, textAlign: 'end' }}>المبلغ (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {data.earnings.map((e, i) => (
                <tr key={i}>
                  <td style={td}>{EARNING_LABEL_AR[e.type]}{e.recurring ? ' (متكرر)' : ''}</td>
                  <td style={td}>{e.label}{e.notes && <div style={{ fontSize: 10, color: '#64748b' }}>{e.notes}</div>}</td>
                  <td style={td}>{e.reason ?? '—'}</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(e.amount)}</td>
                </tr>
              ))}
              <tr>
                <td style={totalRow} colSpan={3}>إجمالي الاستحقاقات الأخرى</td>
                <td style={{ ...totalRow, textAlign: 'end', fontVariantNumeric: 'tabular-nums' }}>{money(totals.totalOtherEarnings)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data.deductions.length > 0 && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>الاستقطاعات</div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>النوع</th>
                <th style={th}>البند</th>
                <th style={{ ...th, textAlign: 'end' }}>المبلغ (د.ك)</th>
              </tr>
            </thead>
            <tbody>
              {data.deductions.map((d, i) => (
                <tr key={i}>
                  <td style={td}>{DEDUCTION_LABEL_AR[d.type]}</td>
                  <td style={td}>{d.label}{d.notes && <div style={{ fontSize: 10, color: '#64748b' }}>{d.notes}</div>}</td>
                  <td style={{ ...tdNum, color: '#b91c1c', fontWeight: 700 }}>({money(d.amount)})</td>
                </tr>
              ))}
              <tr>
                <td style={totalRow} colSpan={2}>إجمالي الاستقطاعات</td>
                <td style={{ ...totalRow, textAlign: 'end', color: '#b91c1c', fontVariantNumeric: 'tabular-nums' }}>
                  ({money(totals.totalDeductions)})
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {data.debtRepayments.length > 0 && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>تفاصيل سداد المديونيات والسلف</div>
          <table style={table}>
            <thead>
              <tr>
                <th style={th}>النوع</th>
                <th style={th}>البيان</th>
                <th style={{ ...th, textAlign: 'end' }}>أصل المديونية</th>
                <th style={{ ...th, textAlign: 'end' }}>الرصيد قبل السداد</th>
                <th style={{ ...th, textAlign: 'end' }}>المسدَّد هذا الشهر</th>
                <th style={{ ...th, textAlign: 'end' }}>الرصيد بعد السداد</th>
              </tr>
            </thead>
            <tbody>
              {data.debtRepayments.map((r) => (
                <tr key={r.paymentId}>
                  <td style={td}>{DEBT_TYPE_LABEL_AR[r.debtType]}</td>
                  <td style={td}>
                    {r.debtLabel}
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      بتاريخ {fmtDate(r.debtDate)} · {r.status === 'SETTLED' ? 'سُدِّدت بالكامل' : 'ما زالت قائمة'}
                    </div>
                  </td>
                  <td style={tdNum}>{money(r.originalAmount)}</td>
                  <td style={tdNum}>{money(r.balanceBefore)}</td>
                  <td style={{ ...tdNum, fontWeight: 700, color: '#b91c1c' }}>({money(r.paidNow)})</td>
                  <td style={{ ...tdNum, fontWeight: 700 }}>{money(r.balanceAfter)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={tableWrapper}>
        <div style={sectionHeader}>ملخّص الحسبة</div>
        <div style={tableRow}>
          <div style={labelCell}>الراتب الأساسي</div>
          <div style={valueCell}>{money(data.basicSalary)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إجمالي العمل الإضافي</div>
          <div style={valueCell}>{money(totals.totalOvertimeAmount)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إجمالي الاستحقاقات الأخرى</div>
          <div style={valueCell}>{money(totals.totalOtherEarnings)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إجمالي الاستحقاقات</div>
          <div style={{ ...valueCell, fontWeight: 700 }}>{money(totals.grossEntitlements)}</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>إجمالي الاستقطاعات</div>
          <div style={{ ...valueCell, color: '#b91c1c' }}>({money(totals.totalDeductions)})</div>
        </div>
        <div style={tableRow}>
          <div style={labelCell}>صافي المستحق</div>
          <div style={{ ...valueCell, fontWeight: 800, color: '#065f46' }}>{money(totals.netAmount)}</div>
        </div>
      </div>

      {data.warnings.length > 0 && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>ملاحظات وتنبيهات قانونية</div>
          {data.warnings.map((w) => (
            <div style={tableRow} key={w.code}>
              <div style={labelCell}>{w.basis === 'STATUTORY' ? 'تنبيه قانوني' : 'تنبيه استرشادي'}</div>
              <div style={valueCell}>{w.messageAr}</div>
            </div>
          ))}
        </div>
      )}

      {data.notes && (
        <div style={tableWrapper}>
          <div style={sectionHeader}>ملاحظات</div>
          <div style={tableRow}>
            <div style={longTextCell}>{data.notes}</div>
          </div>
        </div>
      )}
    </>
  );
}
