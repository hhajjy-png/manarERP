import logo from '../assets/almanar-logo.png';
import styles from './QuotationDesign2.module.css';

export default function QuotationDesign2() {
  return (
    <>
      <div className={styles.page}><div className={styles.p}>
<img className={styles.wm} src={logo} alt="" />
  <div className={styles.hdr}>
    <div className={`${styles.hL} ${styles.en}`}>
      <div className={styles['cname-en']}>Al Manar Al Duwaliya Company <span style={{"fontSize": "6.5pt"}}>L.L.C</span></div>
      <div className={styles['tag-en']}>For construction and maintenance of roads streets pavements and road supplies</div>
      <div className={styles['cap-en']}>Paid-up capital: 500,000 thousand K.D.</div>
      <div className={styles.contact}><b>&#9742;</b> : 99333820 / 94404401<br /><b>&#9743;</b> : 98777887<br /><b>&#9993;</b> : Manar.int.co@gmail.com</div>
    </div>
    <div className={styles.hC}><img className={styles.logo} src={logo} alt="" /></div>
    <div className={`${styles.hR} ${styles.ar}`}>
      <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{"fontSize": "8.5pt"}}>ذ.م.م</span></div>
      <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className={styles.contact}>99333820 / 94404401 : <b>&#9742;</b><br />98777887 : <b>&#9743;</b><br />Manar.int.co@gmail.com : <b>&#9993;</b></div>
    </div>
  </div>
<div className={styles.ttl}><div className={styles.a}>عرض سعر</div><div className={styles.b}>Price Quotation</div></div>
<div className={styles.mbar}>
  <div className={styles.box}><div className={styles.k}>رقم العرض</div><div className={styles.v}>QT-2026-0061</div></div>
  <div className={styles.box}><div className={styles.k}>التاريخ</div><div className={styles.v}>20 / 06 / 2026</div></div>
  <div className={styles.box}><div className={styles.k}>صلاحية العرض</div><div className={styles.v}>15 يوماً</div></div>
</div>
<div className={styles.to}><b>إلى:</b> السادة / مصنع الخليج للأسفلت ذ.م.م &nbsp;|&nbsp; <b>عناية:</b> إدارة المشاريع</div>
<div className={styles.subj}><b>الموضوع:</b> عرض سعر – خدمات نقل أسفلت (خلطة ساخنة)</div>
<table><thead><tr>
  <th className={styles.c1}>م</th><th className={styles.c2}>البيان / Description</th><th className={styles.c3}>الوحدة</th>
  <th className={styles.c4}>الكمية</th><th className={styles.c5}>سعر الوحدة (د.ك)</th><th className={styles.c6}>الإجمالي (د.ك)</th>
</tr></thead><tbody><tr><td>1</td><td className={styles.d}>نقل أسفلت خلطة ساخنة – داخل المدينة (حتى 30 كم)</td><td>نقلة</td><td>25</td><td>20.000</td><td>500.000</td></tr><tr><td>2</td><td className={styles.d}>نقل أسفلت خلطة ساخنة – مسافة (30 – 60 كم)</td><td>نقلة</td><td>15</td><td>28.000</td><td>420.000</td></tr><tr><td>3</td><td className={styles.d}>نقل أسفلت خلطة ساخنة – مسافة (أكثر من 60 كم)</td><td>نقلة</td><td>8</td><td>38.000</td><td>304.000</td></tr><tr><td>4</td><td className={styles.d}>رسوم انتظار إضافي بالموقع (بعد ساعتين)</td><td>ساعة</td><td>10</td><td>6.000</td><td>60.000</td></tr></tbody></table>
<div className={styles.tot}><div className={styles.cell}>الإجمالي (د.ك) : 1,284.000</div></div>
<div className={styles.terms}><h4>الشروط والأحكام</h4><ul><li>الأسعار بالدينار الكويتي وتشمل أجور السائق والوقود.</li><li>لا تشمل الأسعار أي رسوم حكومية أو تصاريح خاصة.</li><li>صلاحية العرض 15 يوماً من تاريخه.</li><li>الدفع خلال 30 يوماً من تاريخ الفاتورة.</li></ul></div>
<div className={styles.sign}>
  <div className={styles.col}>المخوّل بالتوقيع<div className={styles.ln}></div></div>
  <div className={styles.col}>ختم الشركة<div className={styles.ln}></div></div>
</div>
<div className={styles.foot}>
    <div className={styles.a}>جليب الشيوخ – مجمع الروضة التجاري – الدور الثاني – مكتب ١٣</div>
    <div className={styles.b}>Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13</div>
  </div>
</div></div>
    </>
  );
}
