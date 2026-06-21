import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign2.module.css';
import type { InvoicePrintData } from '../../engine/types';
import { formatKWD, formatKWDAr } from '../../utils/formatKWD';

interface Props { data?: InvoicePrintData; }

export default function InvoiceDesign2Blank({ data }: Props) {
  const grandTotal = data ? data.totalDinars + data.totalFils / 1000 : null;

  return (
    <>
      <div className={styles.page}>
  <div className={styles.bar}></div>
  <div className={styles.head}>
    <div className={styles.brand} style={{visibility: 'hidden'}}><img src={logo} />
      <div className={styles.txt}><div className={styles['cn-ar']}>شركة المنار الدولية</div>
        <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div className={styles.invtitle}><div className={styles.h}>INVOICE</div><div className={styles.ar}>فاتورة نقداً / بالحساب</div></div>
  </div>
  <div className={styles.metawrap}>
    <div className={styles.mbox}>
      <div className={styles.mrow}><b>رقم الفاتورة</b><span>{data ? data.invoiceNumber : 'INV-2026-0142'}</span></div>
      <div className={styles.mrow}><b>التاريخ</b><span>{data ? data.date : '20 / 06 / 2026'}</span></div>
    </div>
    <div className={styles.mbox}>
      <div className={styles.mrow}><b>العميل / السادة</b><span>{data ? data.customerName : 'مصنع الخليج للأسفلت ذ.م.م'}</span></div>
      <div className={styles.mrow}><b>المشروع</b><span>{data ? (data.projectName ?? '') : 'توريد ونقل أسفلت – عقد شهري'}</span></div>
      <div className={styles.mrow}><b>موقع المشروع</b><span>{data ? '' : 'منطقة الشعيبة الصناعية – الكويت'}</span></div>
    </div>
  </div>
  <div className={styles.tedge}>
  <table>
    <thead><tr><th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody>
      {data
        ? data.lineItems.map((item, i) => (
            <tr key={i}>
              <td className={styles.n}>{item.number}</td>
              <td className={styles.ds}>{item.descriptionAr}</td>
              <td className={styles.u}>{item.unit}</td>
              <td className={styles.q}>{item.quantity}</td>
              <td className={styles.pr}>{formatKWD(item.unitPrice)}</td>
              <td className={styles.t}>{formatKWD(item.total)}</td>
            </tr>
          ))
        : <>
            <tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td className={styles.u}>درب</td><td className={styles.q}>12</td><td className={styles.pr}>28.500</td><td className={styles.t}>342.000</td></tr>
            <tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td className={styles.u}>طن</td><td className={styles.q}>60</td><td className={styles.pr}>4.250</td><td className={styles.t}>255.000</td></tr>
            <tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td className={styles.u}>يوم</td><td className={styles.q}>3</td><td className={styles.pr}>45.000</td><td className={styles.t}>135.000</td></tr>
          </>
      }
    </tbody>
  </table>
  </div>
  <div className={styles.words}><b>المبلغ كتابةً: </b>{data ? data.totalInWords : 'سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير'}</div>
  <div className={styles.bottom}>
    <div className={styles.left}>
      <div className={styles['sec-h']}>شروط الدفع</div><div className={styles['sec-b']}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div>
      {data?.notes && (
        <><div className={styles['sec-h']} style={{"marginTop": "3mm"}}>ملاحظات</div><div className={styles['sec-b']}>{data.notes}</div></>
      )}
    </div>
    <div className={styles.right}>
      <div className={styles.tr}><b>المجموع الفرعي</b><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
      <div className={styles.grand}><span>الإجمالي النهائي</span><span>{grandTotal !== null ? formatKWDAr(grandTotal) : '732.000 د.ك'}</span></div>
    </div>
  </div>
  <div className={styles.sign}>
    <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
    <div className={styles.s}><div className={styles.lbl}>الختم</div><div className={styles.ln}>&nbsp;</div></div>
    <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
  </div>
  <div className={styles.contactbar}>99333820 / 94404401 &nbsp;|&nbsp; واتساب 98777887 &nbsp;|&nbsp; Manar.int.co@gmail.com</div>
  <div className={styles.footbar} style={{visibility: 'hidden'}}></div>
</div>
    </>
  );
}
