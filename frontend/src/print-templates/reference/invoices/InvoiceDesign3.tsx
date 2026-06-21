import logo from '../assets/almanar-logo.png';
import styles from './InvoiceDesign3.module.css';

export default function InvoiceDesign3() {
  return (
    <>
      <div className={styles.page}>
  <div className={styles.head}>
    <div className={styles.brand}><img src={logo} />
      <div><div className={styles['cn-ar']}>شركة المنار الدولية ذ.م.م</div>
        <div className={styles['cn-sub']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
        <div className={styles['cn-en']}>AL MANAR AL DUWALIYA CO. L.L.C</div></div>
    </div>
    <div className={styles.metabox}><div className={styles.h}>فاتورة INVOICE</div>
      <div className={styles.r}><b>رقم الفاتورة</b><span>INV-2026-0142</span></div>
      <div className={styles.r}><b>التاريخ</b><span>20 / 06 / 2026</span></div>
      <div className={styles.r}><b>النوع</b><span>نقداً / بالحساب</span></div>
    </div>
  </div>
  <div className={styles.boxes}>
    <div className={styles.box}><div className={styles.bh}>بيانات العميل</div>
      <div className={styles.bb}><b>الاسم:</b> مصنع الخليج للأسفلت ذ.م.م<br /><b>المسمى:</b> Gulf Asphalt Factory</div></div>
    <div className={styles.box}><div className={styles.bh}>بيانات المشروع</div>
      <div className={styles.bb}><b>المشروع:</b> توريد ونقل أسفلت – عقد شهري<br /><b>الموقع:</b> منطقة الشعيبة الصناعية – الكويت</div></div>
  </div>
  <table>
    <thead><tr><th className={styles.n}>م</th><th>البيان / Description</th><th>الوحدة</th><th>الكمية</th><th>سعر الوحدة (د.ك)</th><th>القيمة (د.ك)</th></tr></thead>
    <tbody><tr><td className={styles.n}>1</td><td className={styles.ds}>نقل أسفلت – خلطة ساخنة</td><td>درب</td><td>12</td><td>28.500</td><td className={styles.t}>342.000</td></tr><tr><td className={styles.n}>2</td><td className={styles.ds}>توريد ونقل بيس كورس</td><td>طن</td><td>60</td><td>4.250</td><td className={styles.t}>255.000</td></tr><tr><td className={styles.n}>3</td><td className={styles.ds}>أجور معدة فرش وتسوية</td><td>يوم</td><td>3</td><td>45.000</td><td className={styles.t}>135.000</td></tr></tbody>
  </table>
  <div className={styles.words}><b>المبلغ كتابةً: </b>سبعمائة واثنان وثلاثون ديناراً كويتياً لا غير</div>
  <div className={styles.bottom}>
    <div className={styles.tl}>
      <div className={styles.sec}><div className={styles.sh}>شروط الدفع</div><div className={styles.sb}>السداد خلال 30 يوماً من تاريخ الفاتورة.</div></div>
      <div className={styles.sec} style={{"marginTop": "4mm"}}><div className={styles.sh}>ملاحظات</div><div className={styles.sb} style={{"minHeight": "16mm"}}></div></div>
    </div>
    <div className={styles.tr2}>
      <div className={styles.row}><b>المجموع الفرعي</b><span>732.000 د.ك</span></div>
      <div className={styles.grand}><span>الإجمالي النهائي</span><span>732.000 د.ك</span></div>
    </div>
  </div>
  <div className={styles.sign}>
    <div className={styles.s}><div className={styles.lbl}>المحاسبة</div><div className={styles.ln}>التوقيع</div></div>
    <div className={styles.s}><div className={styles.lbl}>الختم الرسمي</div><div className={styles.ln}>&nbsp;</div></div>
    <div className={styles.s}><div className={styles.lbl}>المسؤول / المعتمد</div><div className={styles.ln}>التوقيع</div></div>
  </div>
  <div className={styles.fbar}>هاتف 99333820 / 94404401 &nbsp;•&nbsp; واتساب 98777887 &nbsp;•&nbsp; Manar.int.co@gmail.com</div>
</div>
    </>
  );
}
