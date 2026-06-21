import logo from '../assets/almanar-logo.png';
import styles from './RFQDesign2.module.css';

export default function RFQDesign2Blank() {
  return (
    <>
      <div className={styles.page}><div className={styles.p}>
<img className={styles.wm} src={logo} style={{display: 'none'}} />
  <div className={styles.hdr} style={{visibility: 'hidden'}}>
    <div className={`${styles.hL} ${styles.en}`}>
      <div className={styles['cname-en']}>Al Manar Al Duwaliya Company <span style={{"fontSize": "6.5pt"}}>L.L.C</span></div>
      <div className={styles['tag-en']}>For construction and maintenance of roads streets pavements and road supplies</div>
      <div className={styles['cap-en']}>Paid-up capital: 500,000 thousand K.D.</div>
      <div className={styles.contact}><b>&#9742;</b> : 99333820 / 94404401<br /><b>&#9743;</b> : 98777887<br /><b>&#9993;</b> : Manar.int.co@gmail.com</div>
    </div>
    <div className={styles.hC}><img className={styles.logo} src={logo} /></div>
    <div className={`${styles.hR} ${styles.ar}`}>
      <div className={styles['cname-ar']}>شركة المنار الدولية <span style={{"fontSize": "8.5pt"}}>ذ.م.م</span></div>
      <div className={styles['tag-ar']}>لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className={styles['cap-ar']}>رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className={styles.contact}>99333820 / 94404401 : <b>&#9742;</b><br />98777887 : <b>&#9743;</b><br />Manar.int.co@gmail.com : <b>&#9993;</b></div>
    </div>
  </div>
<div className={styles.ttl}><div className={styles.a}>طلب عرض سعر</div><div className={styles.b}>Request for Quotation</div></div>
<div className={styles.mbar}>
  <div className={styles.box}><div className={styles.k}>رقم الطلب</div><div className={styles.v}>RFQ-2026-0153</div></div>
  <div className={styles.box}><div className={styles.k}>التاريخ</div><div className={styles.v}>20 / 06 / 2026</div></div>
  <div className={styles.box}><div className={styles.k}>آخر موعد للعرض</div><div className={styles.v}>24 / 06 / 2026</div></div>
  <div className={styles.box}><div className={styles.k}>صلاحية العرض</div><div className={styles.v}>30 يوماً</div></div>
</div>
<div className={styles.to}><b>إلى:</b> السادة / المورد المحترم &nbsp;&nbsp;|&nbsp;&nbsp; <b>المشروع:</b> توريد مواد لمشروع طرق – الكويت</div>
<div className={styles.lead}>يرجى تقديم أفضل أسعاركم للأصناف أدناه:</div>
<table><thead><tr>
  <th className={styles.c1}>م</th><th className={styles.c2}>البيان / Description</th><th className={styles.c3}>الوحدة</th>
  <th className={styles.c4}>الكمية</th><th className={styles.c5}>سعر الوحدة (د.ك)</th><th className={styles.c6}>الإجمالي (د.ك)</th>
</tr></thead><tbody><tr><td>1</td><td className={styles.d}>بيس كورس Type II</td><td>طن</td><td>120</td><td></td><td></td></tr><tr><td>2</td><td className={styles.d}>أسمنت أسود (شكاير)</td><td>كيس</td><td>300</td><td></td><td></td></tr><tr><td>3</td><td className={styles.d}>حديد تسليح 12مم</td><td>طن</td><td>8</td><td></td><td></td></tr><tr><td>4</td><td className={styles.d}>خرسانة جاهزة C30</td><td>م٣</td><td>45</td><td></td><td></td></tr><tr><td>5</td><td className={styles.d}>رمل ردم</td><td>م٣</td><td>60</td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className={styles.d}></td><td></td><td></td><td></td><td></td></tr></tbody>
<tfoot><tr><td colSpan={5} style={{"textAlign": "left", "fontWeight": "800", "color": "#30246C"}}>الإجمالي (د.ك)</td><td></td></tr></tfoot>
</table>
<div className={styles.notes}><b>ملاحظات:</b> يرجى تقديم العرض شاملاً سعر الوحدة ومدة التوريد وشروط الدفع، مع ختم وتوقيع المورد.</div>
<div className={styles.sign}>
  <div className={styles.col}>قسم المشتريات<div className={styles.ln}></div></div>
  <div className={styles.col}>المورّد (الاسم / الختم / التوقيع)<div className={styles.ln}></div></div>
</div>
<div className={styles.foot} style={{visibility: 'hidden'}}>
    <div className={styles.a}>جليب الشيوخ – مجمع الروضة التجاري – الدور الثاني – مكتب ١٣</div>
    <div className={styles.b}>Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13</div>
  </div>
</div></div>
    </>
  );
}
