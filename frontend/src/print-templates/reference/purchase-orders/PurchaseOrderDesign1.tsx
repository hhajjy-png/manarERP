import logo from '../assets/almanar-logo.png';
import styles from './PurchaseOrderDesign1.module.css';

export default function PurchaseOrderDesign1() {
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
    <div className={styles.hC}><img className={styles.logo} src={logo} alt="Al Manar Logo" /></div>
    <div className={`${styles.hR} ${styles.ar}`}>
      <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{"fontSize": "8.5pt"}}>ذ.م.م</span></div>
      <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className={styles.contact}>99333820 / 94404401 : <b>&#9742;</b><br />98777887 : <b>&#9743;</b><br />Manar.int.co@gmail.com : <b>&#9993;</b></div>
    </div>
  </div>
<div className={styles.ttl}><div className={styles.a}>طلب شراء</div><div className={styles.b}>Purchase Order</div></div>
<div className={styles.meta}>
  <div className={styles.it}><b>رقم الطلب:</b> PO-2026-0087</div>
  <div className={styles.it}><b>التاريخ:</b> 20 / 06 / 2026</div>
  <div className={styles.it}><b>المورّد:</b> مؤسسة الرواد لمواد البناء</div>
  <div className={styles.it}><b>جهة الاتصال:</b> مكتب المبيعات — 6 555 1234</div>
  <div className={styles.it}><b>المشروع:</b> مشروع صيانة طرق الشعيبة</div>
  <div className={styles.it}><b>تاريخ التوريد المطلوب:</b> 27 / 06 / 2026</div>
</div>
<table><thead><tr>
  <th className={styles.c1}>م</th><th className={styles.c2}>البيان / Description</th><th className={styles.c3}>الوحدة</th>
  <th className={styles.c4}>الكمية</th><th className={styles.c5}>سعر الوحدة</th><th className={styles.c6}>الإجمالي</th>
</tr></thead><tbody><tr><td>1</td><td className={styles.d}>بيس كورس Type II</td><td>طن</td><td>120</td><td>—</td><td>—</td></tr><tr><td>2</td><td className={styles.d}>أسمنت أسود (شكاير)</td><td>كيس</td><td>300</td><td>—</td><td>—</td></tr><tr><td>3</td><td className={styles.d}>حديد تسليح 12مم</td><td>طن</td><td>8</td><td>—</td><td>—</td></tr><tr><td>4</td><td className={styles.d}>خرسانة جاهزة C30</td><td>م٣</td><td>45</td><td>—</td><td>—</td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr></tbody>
<tfoot><tr><td colSpan={5} style={{"textAlign": "left", "fontWeight": "800", "color": "#30246C"}}>الإجمالي (د.ك)</td><td></td></tr></tfoot>
</table>
<div className={styles.terms}><b>الشروط:</b> التوريد إلى موقع المشروع. الدفع خلال 30 يوماً من تاريخ التوريد بعد المطابقة.</div>
<div className={styles.sign}>
  <div className={styles.col}>طالب الشراء<div className={styles.ln}></div></div>
  <div className={styles.col}>مدير المشتريات<div className={styles.ln}></div></div>
  <div className={styles.col}>المورّد (ختم وتوقيع)<div className={styles.ln}></div></div>
</div>
<div className={styles.foot}>
    <div className={styles.a}>جليب الشيوخ – مجمع الروضة التجاري – الدور الثاني – مكتب ١٣</div>
    <div className={styles.b}>Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13</div>
  </div>
</div></div>
    </>
  );
}
