export default function RFQDesign1() {
  return (
    <>
      <style>{`
body { margin:0; font-family:'Cairo',sans-serif; color:#000; }
.page { width:210mm; height:297mm; position:relative; background:#fff; overflow:hidden; }
.ar { direction:rtl; text-align:right; }
.en { direction:ltr; text-align:left; }

.p { padding:8mm 9mm 6mm 9mm; height:297mm; display:flex; flex-direction:column; position:relative; }
.wm { position:absolute; top:50%; left:50%; transform:translate(-50%,-50%); width:120mm; opacity:.05; }
.hdr { display:flex; justify-content:space-between; align-items:flex-start; }
.hL { width:37%; } .hC { width:22%; text-align:center; } .hR { width:37%; direction:rtl; text-align:right; }
.cname-en { font-weight:800; font-size:11.5pt; color:#30246C; line-height:1.05; }
.tag-en { font-weight:700; font-size:6pt; color:#30246C; margin-top:1mm; }
.cap-en { font-size:6.6pt; color:#30246C; margin-top:.3mm; }
.cname-ar { font-weight:800; font-size:14pt; color:#30246C; line-height:1; }
.tag-ar { font-weight:700; font-size:6.8pt; color:#30246C; margin-top:1mm; }
.cap-ar { font-size:7pt; color:#30246C; margin-top:.3mm; }
.contact { font-size:7pt; color:#30246C; margin-top:2mm; line-height:1.7; }
.contact b { font-weight:800; }
.logo { width:24mm; }
.ttl { text-align:center; margin:3mm 0 2mm 0; }
.ttl .a { font-weight:800; font-size:15pt; color:#fff; background:#30246C; display:inline-block; padding:1.6mm 12mm; border-radius:2mm; letter-spacing:.3px; }
.ttl .b { font-weight:700; font-size:9pt; color:#30246C; margin-top:1.5mm; letter-spacing:.5px; }
.foot { margin-top:auto; text-align:center; border-top:1.5px solid #30246C; padding-top:2mm; }
.foot .a { font-weight:700; font-size:8.5pt; color:#30246C; letter-spacing:1px; }
.foot .b { font-weight:600; font-size:7.5pt; color:#30246C; margin-top:.6mm; letter-spacing:.3px; }

.meta { direction:rtl; display:flex; flex-wrap:wrap; gap:2mm 0; border:1px solid #30246C; border-radius:2mm; padding:3mm 4mm; font-size:9pt; color:#30246C; margin-bottom:2mm; }
.meta .it { width:50%; } .meta b { font-weight:800; }
.lead { direction:rtl; font-size:9pt; color:#000; margin:1mm 0 3mm 0; }
table { width:100%; border-collapse:collapse; direction:rtl; }
th,td { border:1px solid #30246C; text-align:center; vertical-align:middle; padding:1.6mm 1mm; font-size:8.6pt; }
thead th { background:#30246C; color:#fff; font-weight:800; }
td.d { text-align:right; }
.c1{width:6%} .c2{width:34%} .c3{width:9%} .c4{width:10%} .c5{width:13%} .c6{width:14%} .c7{width:14%}
.notes { direction:rtl; margin-top:3mm; font-size:9pt; color:#30246C; }
.notes b { font-weight:800; }
.sign { direction:rtl; display:flex; justify-content:space-between; margin-top:12mm; font-size:9.5pt; color:#30246C; font-weight:700; }
.sign .ln { display:inline-block; width:50mm; border-bottom:1px dotted #30246C; margin-top:10mm; }
.sign .col { text-align:center; }

      `}</style>
      <div className="page"><div className="p">
<img className="wm" src="" />
  <div className="hdr">
    <div className="hL en">
      <div className="cname-en">Al Manar Al Duwaliya Company <span style={{"fontSize": "6.5pt"}}>L.L.C</span></div>
      <div className="tag-en">For construction and maintenance of roads streets pavements and road supplies</div>
      <div className="cap-en">Paid-up capital: 500,000 thousand K.D.</div>
      <div className="contact"><b>&#9742;</b> : 99333820 / 94404401<br /><b>&#9743;</b> : 98777887<br /><b>&#9993;</b> : Manar.int.co@gmail.com</div>
    </div>
    <div className="hC"><img className="logo" src="" /></div>
    <div className="hR ar">
      <div className="cname-ar">شركة المنار الدولية <span style={{"fontSize": "8.5pt"}}>ذ.م.م</span></div>
      <div className="tag-ar">لإنشاء وإصلاح الطرق والشوارع والأرصفة ومستلزمات الطرق</div>
      <div className="cap-ar">رأس المال المدفوع ٥٠٠،٠٠٠ ألف دينار كويتي</div>
      <div className="contact">99333820 / 94404401 : <b>&#9742;</b><br />98777887 : <b>&#9743;</b><br />Manar.int.co@gmail.com : <b>&#9993;</b></div>
    </div>
  </div>
<div className="ttl"><div className="a">طلب عرض سعر</div><div className="b">Request for Quotation</div></div>
<div className="meta">
  <div className="it"><b>رقم الطلب:</b> RFQ-2026-0153</div>
  <div className="it"><b>التاريخ:</b> 20 / 06 / 2026</div>
  <div className="it"><b>إلى:</b> السادة / المورد المحترم</div>
  <div className="it"><b>آخر موعد لتقديم العرض:</b> 24 / 06 / 2026</div>
  <div className="it"><b>المشروع:</b> توريد مواد لمشروع طرق – الكويت</div>
  <div className="it"><b>مدة صلاحية العرض المطلوبة:</b> 30 يوماً</div>
</div>
<div className="lead">نرجو التكرّم بتزويدنا بعرض أسعاركم للأصناف التالية موضّحاً سعر الوحدة ومدة التوريد:</div>
<table><thead><tr>
  <th className="c1">م</th><th className="c2">البيان / Description</th><th className="c3">الوحدة</th>
  <th className="c4">الكمية</th><th className="c5">سعر الوحدة</th><th className="c6">الإجمالي</th><th className="c7">مدة التوريد</th>
</tr></thead><tbody><tr><td>1</td><td className="d">بيس كورس Type II</td><td>طن</td><td>120</td><td></td><td></td><td></td></tr><tr><td>2</td><td className="d">أسمنت أسود (شكاير)</td><td>كيس</td><td>300</td><td></td><td></td><td></td></tr><tr><td>3</td><td className="d">حديد تسليح 12مم</td><td>طن</td><td>8</td><td></td><td></td><td></td></tr><tr><td>4</td><td className="d">خرسانة جاهزة C30</td><td>م٣</td><td>45</td><td></td><td></td><td></td></tr><tr><td>5</td><td className="d">رمل ردم</td><td>م٣</td><td>60</td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td><td></td></tr></tbody>
<tfoot><tr><td colSpan={5} style={{"textAlign": "left", "fontWeight": "800", "color": "#30246C"}}>الإجمالي (د.ك)</td><td></td><td></td></tr></tfoot>
</table>
<div className="notes"><b>ملاحظات:</b> يرجى تقديم العرض شاملاً سعر الوحدة ومدة التوريد وشروط الدفع، مع ختم وتوقيع المورد.</div>
<div className="sign">
  <div className="col">طلب من: قسم المشتريات<div className="ln"></div></div>
  <div className="col">عرض المورّد (الاسم / الختم / التوقيع)<div className="ln"></div></div>
</div>
<div className="foot">
    <div className="a">جليب الشيوخ – مجمع الروضة التجاري – الدور الثاني – مكتب ١٣</div>
    <div className="b">Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13</div>
  </div>
</div></div>
    </>
  );
}