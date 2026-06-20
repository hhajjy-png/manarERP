export default function PurchaseOrderDesign2() {
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

.mbar { direction:rtl; display:flex; margin-bottom:3mm; }
.mbar .box { flex:1; border:1px solid #30246C; }
.mbar .box+.box { border-right:none; }
.mbar .k { background:#eee9f5; color:#30246C; font-weight:800; font-size:8.5pt; padding:1.6mm; text-align:center; border-bottom:1px solid #30246C; }
.mbar .v { padding:2mm; text-align:center; font-size:9pt; color:#000; min-height:8mm; }
.party { direction:rtl; border:1px solid #30246C; border-radius:2mm; padding:3mm 4mm; font-size:9pt; color:#30246C; margin-bottom:3mm; }
.party b { font-weight:800; }
table { width:100%; border-collapse:collapse; direction:rtl; }
th,td { border:1px solid #30246C; text-align:center; vertical-align:middle; padding:1.6mm 1mm; font-size:9pt; }
thead th { background:#30246C; color:#fff; font-weight:800; }
td.d { text-align:right; }
.c1{width:7%} .c2{width:45%} .c3{width:11%} .c4{width:11%} .c5{width:13%} .c6{width:13%}
.tot { direction:rtl; display:flex; justify-content:flex-start; margin-top:0; }
.tot .cell { border:1px solid #30246C; border-top:none; padding:2mm 6mm; font-weight:800; color:#30246C; font-size:10pt; background:#eee9f5; }
.terms { direction:rtl; margin-top:3mm; font-size:9pt; color:#30246C; }
.terms b { font-weight:800; }
.sign { direction:rtl; display:flex; justify-content:space-between; margin-top:12mm; font-size:9.5pt; color:#30246C; font-weight:700; }
.sign .ln { display:inline-block; width:46mm; border-bottom:1px dotted #30246C; margin-top:10mm; }
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
<div className="ttl"><div className="a">طلب شراء</div><div className="b">Purchase Order</div></div>
<div className="mbar">
  <div className="box"><div className="k">رقم الطلب</div><div className="v">PO-2026-0087</div></div>
  <div className="box"><div className="k">التاريخ</div><div className="v">20 / 06 / 2026</div></div>
  <div className="box"><div className="k">تاريخ التوريد المطلوب</div><div className="v">27 / 06 / 2026</div></div>
</div>
<div className="party"><b>المورّد:</b> مؤسسة الرواد لمواد البناء &nbsp;&nbsp;|&nbsp;&nbsp; <b>جهة الاتصال:</b> مكتب المبيعات — 6 555 1234 <br /><b>المشروع:</b> مشروع صيانة طرق الشعيبة</div>
<table><thead><tr>
  <th className="c1">م</th><th className="c2">البيان / Description</th><th className="c3">الوحدة</th>
  <th className="c4">الكمية</th><th className="c5">سعر الوحدة</th><th className="c6">الإجمالي</th>
</tr></thead><tbody><tr><td>1</td><td className="d">بيس كورس Type II</td><td>طن</td><td>120</td><td>—</td><td>—</td></tr><tr><td>2</td><td className="d">أسمنت أسود (شكاير)</td><td>كيس</td><td>300</td><td>—</td><td>—</td></tr><tr><td>3</td><td className="d">حديد تسليح 12مم</td><td>طن</td><td>8</td><td>—</td><td>—</td></tr><tr><td>4</td><td className="d">خرسانة جاهزة C30</td><td>م٣</td><td>45</td><td>—</td><td>—</td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td></tr><tr><td>&nbsp;</td><td className="d"></td><td></td><td></td><td></td><td></td></tr></tbody></table>
<div className="tot"><div className="cell">الإجمالي (د.ك) : ___________</div></div>
<div className="terms"><b>الشروط:</b> التوريد إلى موقع المشروع. الدفع خلال 30 يوماً من تاريخ التوريد بعد المطابقة.</div>
<div className="sign">
  <div className="col">طالب الشراء<div className="ln"></div></div>
  <div className="col">مدير المشتريات<div className="ln"></div></div>
  <div className="col">المورّد (ختم وتوقيع)<div className="ln"></div></div>
</div>
<div className="foot">
    <div className="a">جليب الشيوخ – مجمع الروضة التجاري – الدور الثاني – مكتب ١٣</div>
    <div className="b">Jleeb Al Shuyoukh - Al Rawda Commercial Complex - Second Floor - Office 13</div>
  </div>
</div></div>
    </>
  );
}